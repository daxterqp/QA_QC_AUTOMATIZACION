'use client';

/**
 * OrthophotoSection — Importa una ortofoto pesada (GeoTIFF de hasta varios GB) y
 * la deja como imagen LIVIANA georreferenciada en el mapa GIS (ImageOverlay).
 *
 * Flujo (procesa en la PC, sube solo lo liviano):
 *  1) "Seleccionar ortofoto" → diálogo NATIVO de Electron → ruta local del TIFF.
 *  2) El servidor (PC) lee la georreferencia del GeoTIFF y, con sharp/libvips,
 *     reescala + recomprime a WebP. El archivo de GB NUNCA se sube entero.
 *  3) Ventana de CONFIRMACIÓN: preview + "Original X GB → Se subirá Y MB".
 *     - Si el TIFF trae coordenadas → se usan automáticamente.
 *     - Si NO trae → se piden las 2 esquinas (sistema + SO/NE).
 *  4) Al confirmar → sube solo el WebP a S3 + guarda bounds/sistema en el proyecto.
 *
 * Requiere la app de ESCRITORIO (Electron) para el procesamiento local.
 */

import { useState } from 'react';
import { Loader2, Image as ImageIcon, Trash2, MapPin, CheckCircle, AlertCircle, Cpu, CheckCircle2, Circle, Pencil, Plus } from 'lucide-react';
import {
  cornerToWgs84, cornersToBounds, isUtm, ORTHO_SYSTEM_LABELS, normalizeBounds,
  type OrthoSystem, type LeafletBounds,
} from '@lib/orthophoto';
import type { OrthophotoVersion } from '@/types';
import { useI18n } from '@lib/i18n';

interface Props {
  projectId: string;
  projectName: string;
  versions: OrthophotoVersion[];
  activeId: string | null;
  /** Ortofoto única pre-v36 (orthophoto_s3_key/bounds/system) — se sintetiza
   *  como versión "legacy" si aún no existe en el array. */
  legacy?: { s3Key: string | null; bounds: LeafletBounds | null; system: string | null };
  onSaved: () => void;
}

const SYSTEMS: OrthoSystem[] = ['WGS84_LATLNG', 'PSAD56_LATLNG', 'WGS84_UTM', 'PSAD56_UTM', 'CUSTOM'];

// Resolución (lado largo, px) + calidad de compresión WebP. 16383 px es el
// MÁXIMO que admite WebP en una sola imagen. Para más detalle al hacer mucho
// zoom haría falta teselado (pirámide), no una imagen única.
const QUALITY_PRESETS = [
  { key: 'max',     labelKey: 'webCSectors.qualMax',     maxDim: 16383, quality: 92 },
  { key: 'muyalta', labelKey: 'webCSectors.qualVeryHigh', maxDim: 12288, quality: 90 },
  { key: 'alta',    labelKey: 'webCSectors.qualHigh',      maxDim: 8192,  quality: 85 },
  { key: 'media',   labelKey: 'webCSectors.qualMedium',     maxDim: 4096,  quality: 80 },
  { key: 'baja',    labelKey: 'webCSectors.qualLight',    maxDim: 2048,  quality: 78 },
] as const;

interface ProcResult {
  stageToken: string;
  grid: number;
  tiles: { r: number; c: number; outBytes: number; width: number; height: number }[];
  srcBytes: number; outBytesTotal: number;
  srcWidth: number | null; srcHeight: number | null; previewDataUrl: string;
  geo: { bounds: LeafletBounds; systemLabel: string; epsg: number | null } | null;
}

const GRID_PRESETS = [
  { key: 1, labelKey: 'webCSectors.gridSimple' },
  { key: 2, labelKey: 'webCSectors.grid2x2' },
  { key: 3, labelKey: 'webCSectors.grid3x3' },
] as const;

/** Sub-bounds de la tesela (r,c) dentro de la grilla grid×grid, en WGS84.
 *  Imagen norte-arriba: fila 0 = norte, columna 0 = oeste. */
function tileBounds(full: LeafletBounds, r: number, c: number, grid: number): LeafletBounds {
  const [[s, w], [n, e]] = full;
  const latStep = (n - s) / grid, lonStep = (e - w) / grid;
  return [[n - (r + 1) * latStep, w + c * lonStep], [n - r * latStep, w + (c + 1) * lonStep]];
}

function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}

export function OrthophotoSection({ projectId, projectName, versions: versionsProp, activeId: activeIdProp, legacy, onSaved }: Props) {
  const { t } = useI18n();
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
  const [maxDim, setMaxDim] = useState(8192);
  const [quality, setQuality] = useState(85);
  const [grid, setGrid] = useState(1); // 1=simple, 2=2×2 (4), 3=3×3 (9)
  const [adding, setAdding] = useState(false); // true = mostrando el flujo de carga

  // Compat: si no hay versiones pero existe una ortofoto única antigua, sintetizarla.
  const versions: OrthophotoVersion[] = (versionsProp && versionsProp.length > 0)
    ? versionsProp
    : (legacy?.s3Key && legacy?.bounds
        ? [{ id: 'legacy', label: t('webCSectors.mapOverlayOrtho'), s3Key: legacy.s3Key, bounds: legacy.bounds, system: legacy.system ?? '—', createdAt: 0 }]
        : []);
  const activeId = (versionsProp && versionsProp.length > 0) ? activeIdProp : (versions.length ? 'legacy' : null);
  const [phase, setPhase] = useState<'idle' | 'processing' | 'confirm'>('idle');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [picked, setPicked] = useState<{ path: string; sizeBytes: number; name: string } | null>(null);
  const [result, setResult] = useState<ProcResult | null>(null);
  // Selección de PREVISUALIZACIÓN (no cambia la activa hasta confirmar).
  const [previewId, setPreviewId] = useState<string | null>(null);
  const selectedId = previewId ?? activeId;
  // Versión pendiente de confirmar como "capa de proyecto".
  const [confirmActivate, setConfirmActivate] = useState<OrthophotoVersion | null>(null);

  // Esquinas manuales (solo si el TIFF no trae georreferencia).
  const [system, setSystem] = useState<OrthoSystem>('WGS84_LATLNG');
  const [zone, setZone] = useState('18');
  const [hemisphere, setHemisphere] = useState<'N' | 'S'>('S');
  const [sw, setSw] = useState({ a: '', b: '' });
  const [ne, setNe] = useState({ a: '', b: '' });
  const utm = isUtm(system);

  const needsManual = !!result && !result.geo;

  // Persiste el array de versiones + la activa desnormalizada en el proyecto.
  // RESILIENTE: primero los campos NÚCLEO (orthophoto_s3_key/bounds/system, que
  // existen desde v33 y son lo que lee el mapa/celular). Luego, por separado y
  // best-effort, las columnas de VERSIONES (v36): si aún no se corrió el SQL v36,
  // la ortofoto igual queda guardada y visible (sin perderse como "huérfana").
  async function persistVersions(nextRaw: OrthophotoVersion[], activeRaw: OrthophotoVersion | null) {
    const supabase = (await import('@lib/supabase/client')).createClient();
    // Sanea bounds de TODO lo que se va a persistir (los datos pueden venir de
    // la DB con anidamiento corrupto que crasheaba Leaflet). Esto "cura" el
    // dato en cada save y evita re-persistir la forma mala.
    const cleanVer = (v: OrthophotoVersion): OrthophotoVersion => ({
      ...v,
      bounds: (normalizeBounds(v.bounds) ?? v.bounds) as LeafletBounds,
      tiles: v.tiles?.map(t => ({ ...t, bounds: (normalizeBounds(t.bounds) ?? t.bounds) as LeafletBounds })),
    });
    const next = nextRaw.map(cleanVer);
    const active = activeRaw ? cleanVer(activeRaw) : null;

    const { error: coreErr } = await supabase.from('projects').update({
      orthophoto_s3_key: active?.s3Key ?? null,
      orthophoto_bounds_json: active?.bounds ?? null,
      orthophoto_system: active?.system ?? null,
      updated_at: Date.now(),
    }).eq('id', projectId);
    if (coreErr) throw new Error(coreErr.message);

    // Teselas de la activa (v37) — lo que el mapa dibuja. Best-effort independiente.
    const { error: tileErr } = await supabase.from('projects').update({
      orthophoto_tiles_json: active?.tiles ?? (active ? [{ s3Key: active.s3Key, bounds: active.bounds }] : null),
    }).eq('id', projectId);
    if (tileErr) console.warn('[ortofoto] columna de teselas no disponible (corre v37):', tileErr.message);

    const { error: verErr } = await supabase.from('projects').update({
      orthophotos_json: next,
      orthophoto_active_id: active?.id ?? null,
    }).eq('id', projectId);
    if (verErr) console.warn('[ortofoto] columnas de versiones no disponibles (corre v36):', verErr.message);
  }

  async function setActive(v: OrthophotoVersion) {
    setBusy(true); setMsg(null);
    try { await persistVersions(versions, v); onSaved(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  async function deleteVersion(v: OrthophotoVersion) {
    if (!confirm(t('webCSectors.deleteOrthoConfirm', { label: v.label }))) return;
    setBusy(true); setMsg(null);
    try {
      const next = versions.filter(x => x.id !== v.id);
      const active = activeId === v.id ? (next[0] ?? null) : (versions.find(x => x.id === activeId) ?? null);
      await persistVersions(next, active);
      onSaved();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  async function renameVersion(v: OrthophotoVersion) {
    const label = prompt(t('webCSectors.renamePrompt'), v.label)?.trim();
    if (!label) return;
    setBusy(true); setMsg(null);
    try {
      const next = versions.map(x => x.id === v.id ? { ...x, label } : x);
      await persistVersions(next, versions.find(x => x.id === activeId) ?? null);
      onSaved();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  async function handlePickAndProcess() {
    setMsg(null);
    if (!isElectron) {
      setMsg({ ok: false, text: t('webCSectors.errDesktopRequired') });
      return;
    }
    const file = await window.electronAPI!.pickOrthophoto();
    if (!file) return; // canceló
    setPicked(file);
    setPhase('processing');
    setBusy(true);
    try {
      const res = await fetch('/api/orthophoto/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ srcPath: file.path, projectName, maxDim, quality, grid }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: ProcResult = await res.json();
      setResult(data);
      setPhase('confirm');
    } catch (e) {
      setMsg({ ok: false, text: t('webCSectors.errProcessFailed', { error: (e as Error).message }) });
      setPhase('idle');
    } finally {
      setBusy(false);
    }
  }

  function parseCorner(c: { a: string; b: string }) {
    const a = parseFloat(c.a.replace(',', '.'));
    const b = parseFloat(c.b.replace(',', '.'));
    if (!isFinite(a) || !isFinite(b)) return null;
    return utm ? { northing: a, easting: b } : { lat: a, lng: b };
  }

  function resolveBounds(): { bounds: LeafletBounds; systemLabel: string } | null {
    if (result?.geo) return { bounds: result.geo.bounds, systemLabel: result.geo.systemLabel };
    const swC = parseCorner(sw), neC = parseCorner(ne);
    if (!swC || !neC) return null;
    const opts = { zone: parseInt(zone, 10), hemisphere };
    const b = cornersToBounds(cornerToWgs84(swC, system, opts), cornerToWgs84(neC, system, opts));
    return { bounds: b, systemLabel: ORTHO_SYSTEM_LABELS[system] };
  }

  async function handleConfirm() {
    setMsg(null);
    const resolved = resolveBounds();
    if (!resolved) { setMsg({ ok: false, text: t('webCSectors.errMissingCorners') }); return; }
    setBusy(true);
    try {
      // 1) Sube todas las teselas (staging → S3, carpeta única por versión).
      const g = result?.grid ?? 1;
      const up = await fetch('/api/orthophoto/commit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, stageToken: result?.stageToken, grid: g }),
      });
      if (!up.ok) throw new Error(await up.text());
      const { s3Key, versionId, tiles: upTiles } = await up.json() as { s3Key: string; versionId: string; tiles: { s3Key: string; r: number; c: number }[] };

      // 2) Calcula los bounds de cada tesela desde el bounds COMPLETO + (r,c,grid).
      const tiles = (upTiles ?? []).map(t => ({ s3Key: t.s3Key, bounds: tileBounds(resolved.bounds, t.r, t.c, g) }));

      // 3) Nueva VERSIÓN (no sobrescribe) y queda activa.
      const version: OrthophotoVersion = {
        id: versionId,
        label: picked?.name?.replace(/\.[^.]+$/, '') || `Ortofoto ${versions.length + 1}`,
        s3Key,
        bounds: resolved.bounds,
        system: resolved.systemLabel,
        tiles,
        grid: g,
        sourceName: picked?.name,
        outBytes: result?.outBytesTotal,
        createdAt: Date.now(),
      };
      await persistVersions([...versions, version], version);

      setMsg({ ok: true, text: t('webCSectors.orthoLoaded') });
      setPhase('idle'); setPicked(null); setResult(null); setAdding(false);
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const labA = utm ? t('webCSectors.cornerNorthY') : t('webCSectors.cornerLat');
  const labB = utm ? t('webCSectors.cornerEastX') : t('webCSectors.cornerLng');

  return (
    <div className="bg-white rounded-md border border-border p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ImageIcon size={15} className="text-primary" />
        <h3 className="text-sm font-bold tracking-wide uppercase text-textPrimary">{t('webCSectors.orthoTitle')}</h3>
      </div>
      <p className="text-xs text-muted leading-relaxed" dangerouslySetInnerHTML={{ __html: t('webCSectors.orthoDesc') }} />

      {/* ── Lista de VERSIONES (selecciona la activa; no se sobrescriben) ── */}
      {phase === 'idle' && !adding && (
        <>
          {versions.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-textSecondary uppercase">{t('webCSectors.versionsLabel', { count: versions.length })}</label>
              <p className="text-[10px] text-muted -mt-0.5 leading-snug" dangerouslySetInnerHTML={{ __html: t('webCSectors.versionsHint') }} />
              {[...versions].sort((a, b) => b.createdAt - a.createdAt).map(v => {
                const active = v.id === activeId;
                const selected = v.id === selectedId;
                return (
                  <div key={v.id}>
                    <div
                      onClick={() => setPreviewId(v.id)}
                      className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition ${active ? 'border-success/50 bg-success/5' : selected ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-surface'}`}
                    >
                      <span className="shrink-0">
                        {active ? <CheckCircle2 size={18} className="text-success" /> : selected ? <CheckCircle2 size={18} className="text-primary" /> : <Circle size={18} className="text-muted" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-textPrimary truncate">
                          {v.label}
                          {active && <span className="ml-1.5 text-[9px] font-extrabold text-success bg-success/10 border border-success/30 rounded px-1 py-0.5 align-middle">{t('webCSectors.badgeCurrentLayer')}</span>}
                          {!active && selected && <span className="ml-1.5 text-[9px] font-bold text-primary align-middle">{t('webCSectors.previewing')}</span>}
                        </p>
                        <p className="text-[10px] text-muted truncate">
                          {v.system}{v.outBytes ? ` · ${fmtBytes(v.outBytes)}` : ''}{v.width ? ` · ${v.width}×${v.height}px` : ''} · {new Date(v.createdAt).toLocaleDateString('es-PE')}
                        </p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); renameVersion(v); }} disabled={busy} className="text-primary hover:bg-primary/10 rounded p-1" title={t('webCSectors.tooltipRename')}><Pencil size={13} /></button>
                      <button onClick={e => { e.stopPropagation(); deleteVersion(v); }} disabled={busy} className="text-danger hover:bg-danger/10 rounded p-1" title={t('common.delete')}><Trash2 size={13} /></button>
                    </div>
                    {/* Acción explícita: solo en la versión previsualizada que NO es la activa. */}
                    {selected && !active && (
                      <button
                        onClick={() => setConfirmActivate(v)}
                        disabled={busy}
                        className="mt-1 ml-6 flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded bg-success text-white hover:bg-success/90 disabled:opacity-50"
                      >
                        <CheckCircle2 size={13} /> {t('webCSectors.setAsProjectLayer')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted italic">{t('webCSectors.noOrthos')}</p>
          )}
          {!isElectron && (
            <div className="flex items-start gap-2 p-2 bg-warning/10 border border-warning/30 rounded text-[11px] text-amber-700">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <p dangerouslySetInnerHTML={{ __html: t('webCSectors.desktopWarn') }} />
            </div>
          )}
          <button onClick={() => { setAdding(true); setMsg(null); }} disabled={!isElectron}
            className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
            <Plus size={14} /> {t('webCSectors.loadNewVersion')}
          </button>
        </>
      )}

      {/* ── Paso 1: elegir calidad + procesar ──────────────────────────── */}
      {phase === 'idle' && adding && (
        <>
          <label className="text-[11px] font-bold text-textSecondary uppercase">{t('webCSectors.resolutionQuality')}</label>
          <div className="flex gap-2 flex-wrap">
            {QUALITY_PRESETS.map(q => (
              <button key={q.key} onClick={() => { setMaxDim(q.maxDim); setQuality(q.quality); }}
                className={`px-3 py-1.5 text-xs font-bold rounded border ${maxDim === q.maxDim ? 'border-primary bg-primary/10 text-primary' : 'border-border text-textSecondary hover:bg-surface'}`}>
                {t(q.labelKey)}
              </button>
            ))}
          </div>
          <label className="text-[11px] font-bold text-textSecondary uppercase mt-1">{t('webCSectors.tiling')}</label>
          <div className="flex gap-2 flex-wrap">
            {GRID_PRESETS.map(g => (
              <button key={g.key} onClick={() => setGrid(g.key)}
                className={`px-3 py-1.5 text-xs font-bold rounded border ${grid === g.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-textSecondary hover:bg-surface'}`}>
                {t(g.labelKey)}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted leading-snug" dangerouslySetInnerHTML={{ __html: t('webCSectors.tilingHint') }} />
          <div className="flex gap-2">
            <button onClick={() => { setAdding(false); setMsg(null); }} disabled={busy}
              className="px-3 py-2 text-xs font-bold rounded border border-border text-textSecondary hover:bg-surface">
              {t('common.back')}
            </button>
            <button onClick={handlePickAndProcess} disabled={busy || !isElectron}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
              <Cpu size={14} /> {t('webCSectors.pickAndProcess')}
            </button>
          </div>
        </>
      )}

      {/* ── Paso 2: procesando ─────────────────────────────────────────── */}
      {phase === 'processing' && (
        <div className="flex items-center gap-2 p-3 bg-surface rounded text-xs text-textSecondary">
          <Loader2 size={16} className="animate-spin text-primary" />
          <span>{t('webCSectors.processing', { detail: picked ? ` "${picked.name}" (${fmtBytes(picked.sizeBytes)})` : '' })}</span>
        </div>
      )}

      {/* ── Paso 3: confirmación de peso ────────────────────────────────── */}
      {phase === 'confirm' && result && (
        <div className="flex flex-col gap-3 border border-border rounded-lg p-3 bg-surface/40">
          <div className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.previewDataUrl} alt="preview" className="w-40 h-28 object-cover rounded border border-border bg-white" />
            <div className="flex-1 flex flex-col gap-1 text-xs">
              <p className="text-textPrimary"><strong>{t('webCSectors.original')}</strong> {fmtBytes(result.srcBytes)}{result.srcWidth ? ` · ${result.srcWidth}×${result.srcHeight}px` : ''}</p>
              <p className="text-success font-bold">
                {t('webCSectors.willUpload', { size: fmtBytes(result.outBytesTotal) })}
                {result.grid > 1 ? t('webCSectors.uploadTilesInfo', { count: result.tiles.length, grid: result.grid }) : (result.tiles[0] ? ` · ${result.tiles[0].width}×${result.tiles[0].height}px` : '')}
              </p>
              {result.srcBytes > 0 && (
                <p className="text-[11px] text-muted">{t('webCSectors.reduction', { pct: (100 - (result.outBytesTotal / result.srcBytes) * 100).toFixed(1) })}</p>
              )}
              {result.geo ? (
                <p className="text-[11px] text-primary flex items-center gap-1"><MapPin size={11} /> {t('webCSectors.coordsRead', { system: result.geo.systemLabel })}</p>
              ) : (
                <p className="text-[11px] text-amber-700 flex items-center gap-1"><AlertCircle size={11} /> {t('webCSectors.coordsMissing')}</p>
              )}
            </div>
          </div>

          {/* Esquinas manuales solo si no hay geo */}
          {needsManual && (
            <div className="flex flex-col gap-2 border-t border-border pt-2">
              <label className="text-[11px] font-bold text-textSecondary uppercase">{t('webCSectors.coordSystem')}</label>
              <select value={system} onChange={e => setSystem(e.target.value as OrthoSystem)}
                className="border border-border rounded px-2 py-1.5 text-sm">
                {SYSTEMS.map(s => <option key={s} value={s}>{ORTHO_SYSTEM_LABELS[s]}</option>)}
              </select>
              {utm && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[11px] font-bold text-textSecondary">{t('webCSectors.utmZone')}</label>
                    <input value={zone} onChange={e => setZone(e.target.value)} inputMode="numeric"
                      className="w-full border border-border rounded px-2 py-1.5 text-sm" placeholder="18" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[11px] font-bold text-textSecondary">{t('webCSectors.hemisphere')}</label>
                    <select value={hemisphere} onChange={e => setHemisphere(e.target.value as 'N' | 'S')}
                      className="w-full border border-border rounded px-2 py-1.5 text-sm">
                      <option value="S">{t('webCSectors.hemisphereSouth')}</option>
                      <option value="N">{t('webCSectors.hemisphereNorth')}</option>
                    </select>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 p-2 rounded border border-border bg-white">
                  <p className="text-[11px] font-bold text-textSecondary flex items-center gap-1"><MapPin size={11} /> {t('webCSectors.cornerSW')}</p>
                  <input value={sw.a} onChange={e => setSw({ ...sw, a: e.target.value })} placeholder={labA} className="border border-border rounded px-2 py-1 text-sm" />
                  <input value={sw.b} onChange={e => setSw({ ...sw, b: e.target.value })} placeholder={labB} className="border border-border rounded px-2 py-1 text-sm" />
                </div>
                <div className="flex flex-col gap-1.5 p-2 rounded border border-border bg-white">
                  <p className="text-[11px] font-bold text-textSecondary flex items-center gap-1"><MapPin size={11} /> {t('webCSectors.cornerNE')}</p>
                  <input value={ne.a} onChange={e => setNe({ ...ne, a: e.target.value })} placeholder={labA} className="border border-border rounded px-2 py-1 text-sm" />
                  <input value={ne.b} onChange={e => setNe({ ...ne, b: e.target.value })} placeholder={labB} className="border border-border rounded px-2 py-1 text-sm" />
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button onClick={() => { setPhase('idle'); setResult(null); setPicked(null); setAdding(false); }} disabled={busy}
              className="px-3 py-1.5 text-xs font-bold rounded border border-border text-textSecondary hover:bg-surface">
              {t('common.cancel')}
            </button>
            <button onClick={handleConfirm} disabled={busy}
              className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded bg-success text-white hover:bg-success/90 disabled:opacity-50">
              {busy && <Loader2 size={14} className="animate-spin" />}
              {t('webCSectors.confirmAndUpload', { size: fmtBytes(result.outBytesTotal) })}
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div className={`flex items-start gap-2 p-2 rounded text-xs ${msg.ok ? 'bg-success/10 border border-success/30 text-success' : 'bg-danger/10 border border-danger/30 text-danger'}`}>
          {msg.ok ? <CheckCircle size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
          <p>{msg.text}</p>
        </div>
      )}

      {/* Confirmación de cambio de capa activa del proyecto (afecta a TODOS). */}
      {confirmActivate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmActivate(null)}>
          <div className="bg-white rounded-lg p-4 w-full max-w-sm flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <h4 className="text-sm font-bold text-textPrimary">{t('webCSectors.changeLayerTitle')}</h4>
            <p className="text-xs text-textSecondary leading-relaxed" dangerouslySetInnerHTML={{ __html: t('webCSectors.changeLayerMsg', {
              label: confirmActivate.label,
              date: confirmActivate.createdAt ? ` (${new Date(confirmActivate.createdAt).toLocaleDateString('es-PE')})` : '',
            }) }} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmActivate(null)} disabled={busy}
                className="px-3 py-1.5 text-xs font-bold rounded border border-border text-textSecondary hover:bg-surface">
                {t('common.no')}
              </button>
              <button
                onClick={async () => { const v = confirmActivate; setConfirmActivate(null); await setActive(v); setPreviewId(v.id); }}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded bg-success text-white hover:bg-success/90 disabled:opacity-50">
                {busy && <Loader2 size={14} className="animate-spin" />}
                {t('webCSectors.confirmActivate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
