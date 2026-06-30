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

import { useMemo, useState } from 'react';
import { Loader2, Image as ImageIcon, Trash2, MapPin, CheckCircle, AlertCircle, Cpu, CheckCircle2, Circle, Pencil, Plus, X } from 'lucide-react';
import {
  cornerToWgs84, cornersToBounds, isUtm, ORTHO_SYSTEM_LABELS, normalizeBounds,
  type OrthoSystem, type LeafletBounds,
} from '@lib/orthophoto';
import {
  fitMetricGeoref, metricToRotatedOverlay,
  type RotatedOverlay,
} from '@lib/orthophotoCustomGeoref';
import type { OrthophotoVersion, OrthophotoRotation } from '@/types';
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
  geo: { bounds: LeafletBounds; systemLabel: string; epsg: number | null; rawCorners?: { sw: { x: number; y: number }; ne: { x: number; y: number }; projected: boolean } } | null;
  /** Método 2: extensión cruda del archivo en su CRS propio (o píxeles). */
  rawExtent: { bbox: { minX: number; minY: number; maxX: number; maxY: number }; width: number; height: number; georeferenced: boolean } | null;
}

/** Una fila de la tabla de puntos de control del Método 2 (texto, se parsea). */
interface ControlRow { sx: string; sy: string; lat: string; lng: string }

/** Sub-bbox (en sistema propio) de la tesela (r,c) de una grilla grid×grid.
 *  Imagen norte-arriba: fila 0 = norte (maxY), columna 0 = oeste (minX).
 *  Usa las MISMAS fronteras de píxel que el servidor (`Math.round(i*size/n)`),
 *  pasando el ancho/alto en PÍXELES del archivo (pxW/pxH), para que las teselas
 *  rotadas encajen sin costuras cuando grid>1. */
function subBboxCustom(
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  r: number, c: number, grid: number, pxW: number, pxH: number,
) {
  const fr = (i: number, size: number) => (size > 0 ? Math.round((i * size) / grid) / size : i / grid);
  const fx0 = fr(c, pxW), fx1 = fr(c + 1, pxW);
  const fy0 = fr(r, pxH), fy1 = fr(r + 1, pxH);
  const W = bbox.maxX - bbox.minX, H = bbox.maxY - bbox.minY;
  return {
    minX: bbox.minX + fx0 * W, maxX: bbox.minX + fx1 * W,
    maxY: bbox.maxY - fy0 * H, minY: bbox.maxY - fy1 * H,
  };
}

/** RotatedOverlay → OrthophotoRotation persistible ([lat,lng], bounds [[s,w],[n,e]]). */
function toRotation(ov: RotatedOverlay): OrthophotoRotation {
  const c = ov.corners;
  return {
    corners: {
      tl: [c.tl.lat, c.tl.lng], tr: [c.tr.lat, c.tr.lng],
      br: [c.br.lat, c.br.lng], bl: [c.bl.lat, c.bl.lng],
    },
    bearing: ov.bearingDeg,
    northUpBounds: [[ov.northUpBounds.south, ov.northUpBounds.west], [ov.northUpBounds.north, ov.northUpBounds.east]],
  };
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
  // Hacer transparente el fondo negro (nodata) de la ortofoto. Default ON.
  const [transparentBlack, setTransparentBlack] = useState(true);
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

  // Esquinas manuales (si el TIFF no trae georreferencia, o si el usuario
  // decide INGRESAR MANUALMENTE para sobrescribir el sistema detectado).
  const [system, setSystem] = useState<OrthoSystem>('WGS84_LATLNG');
  const [zone, setZone] = useState('18');
  const [hemisphere, setHemisphere] = useState<'N' | 'S'>('S');
  const [sw, setSw] = useState({ a: '', b: '' });
  const [ne, setNe] = useState({ a: '', b: '' });
  const utm = isUtm(system);
  // Modo de georreferenciación:
  //   'auto'   = usar la georref detectada en el archivo.
  //   'known'  = Método 1: elegir un sistema conocido (PSAD56/UTM…) + esquinas.
  //   'custom' = Método 2: sistema PROPIO por puntos de control (con rotación).
  const [georefMode, setGeorefMode] = useState<'auto' | 'known' | 'custom'>('auto');
  // Método 2 — tabla de puntos de control (≥2 filas válidas: propio ↔ WGS84).
  const [cps, setCps] = useState<ControlRow[]>(() => Array.from({ length: 4 }, () => ({ sx: '', sy: '', lat: '', lng: '' })));

  const showKnown = georefMode === 'known';   // campos del Método 1
  const showCustom = georefMode === 'custom'; // campos del Método 2

  // Ajuste métrico EN VIVO del Método 2 (para RMS + validación + preview).
  const customFit = useMemo(() => {
    if (!showCustom || !result?.rawExtent) return null;
    const pts = cps
      .map(r => ({ x: parseFloat(r.sx.replace(',', '.')), y: parseFloat(r.sy.replace(',', '.')), lat: parseFloat(r.lat.replace(',', '.')), lng: parseFloat(r.lng.replace(',', '.')) }))
      .filter(r => [r.x, r.y, r.lat, r.lng].every(Number.isFinite))
      .map(r => ({ src: { x: r.x, y: r.y }, dst: { lng: r.lng, lat: r.lat } }));
    if (pts.length < 2) return { count: pts.length, fit: null as ReturnType<typeof fitMetricGeoref> };
    return { count: pts.length, fit: fitMetricGeoref(pts) };
  }, [showCustom, cps, result?.rawExtent]);

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
    setCps(Array.from({ length: 4 }, () => ({ sx: '', sy: '', lat: '', lng: '' })));
    setPhase('processing');
    setBusy(true);
    try {
      const res = await fetch('/api/orthophoto/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ srcPath: file.path, projectName, maxDim, quality, grid, transparentBlack }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: ProcResult = await res.json();
      setResult(data);
      setGeorefMode(data.geo ? 'auto' : 'known'); // sin georef → arranca en Método 1 manual
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

  function resolveBounds(): { bounds: LeafletBounds; systemLabel: string; rotation?: OrthophotoRotation } | null {
    // Modo AUTO: usar la georref detectada.
    if (georefMode === 'auto') {
      if (!result?.geo) return null;
      return { bounds: result.geo.bounds, systemLabel: result.geo.systemLabel };
    }
    // Modo CUSTOM (Método 2): fit métrico por puntos de control + bbox del archivo.
    if (georefMode === 'custom') {
      const f = customFit?.fit; const ext = result?.rawExtent;
      if (!f || !ext) return null;
      const ov = metricToRotatedOverlay(f.georef, ext.bbox);
      const env = ov.envelope;
      return {
        bounds: [[env.south, env.west], [env.north, env.east]],
        systemLabel: 'Sistema propio (puntos de control)',
        rotation: toRotation(ov),
      };
    }
    // Modo KNOWN (Método 1): sistema conocido + 2 esquinas.
    const swC = parseCorner(sw), neC = parseCorner(ne);
    if (!swC || !neC) return null;
    const opts = { zone: parseInt(zone, 10), hemisphere };
    const b = cornersToBounds(cornerToWgs84(swC, system, opts), cornerToWgs84(neC, system, opts));
    return { bounds: b, systemLabel: ORTHO_SYSTEM_LABELS[system] };
  }

  // Método 1 (sistema conocido). Pre-rellena las esquinas con las CRUDAS del
  // archivo y sugiere PSAD56 + zona/hemisferio → el usuario normalmente solo
  // confirma el sistema ("yo pongo el sistema, tú conviertes").
  function enterKnownMode() {
    if (result?.geo?.rawCorners) {
      const rc = result.geo.rawCorners;
      setSw({ a: String(rc.sw.y), b: String(rc.sw.x) });
      setNe({ a: String(rc.ne.y), b: String(rc.ne.x) });
      setSystem(rc.projected ? 'PSAD56_UTM' : 'PSAD56_LATLNG');
      if (rc.projected && result.geo.bounds) {
        const b = result.geo.bounds;
        const z = Math.floor(((b[0][1] + b[1][1]) / 2 + 180) / 6) + 1;
        if (z >= 1 && z <= 60) setZone(String(z));
        setHemisphere(((b[0][0] + b[1][0]) / 2) < 0 ? 'S' : 'N');
      }
    }
    setGeorefMode('known');
  }

  async function handleConfirm() {
    setMsg(null);
    const resolved = resolveBounds();
    if (!resolved) {
      setMsg({ ok: false, text: showCustom
        ? 'Faltan puntos de control válidos (mínimo 2, no colineales) para el sistema propio.'
        : t('webCSectors.errMissingCorners') });
      return;
    }
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

      // 2) Bounds (+ rotación) de cada tesela. Método 2: cada tesela se rota
      //    mapeando su sub-bbox del sistema propio por la georref métrica.
      const customGeoref = resolved.rotation ? customFit?.fit?.georef : null;
      const ext = result?.rawExtent;
      const tiles = (upTiles ?? []).map(t => {
        if (customGeoref && ext) {
          const ov = metricToRotatedOverlay(customGeoref, subBboxCustom(ext.bbox, t.r, t.c, g, ext.width, ext.height));
          const env = ov.envelope;
          return { s3Key: t.s3Key, bounds: [[env.south, env.west], [env.north, env.east]] as LeafletBounds, rotation: toRotation(ov) };
        }
        return { s3Key: t.s3Key, bounds: tileBounds(resolved.bounds, t.r, t.c, g) };
      });

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
        rotation: resolved.rotation,
        createdAt: Date.now(),
      };
      await persistVersions([...versions, version], version);

      setMsg({ ok: true, text: t('webCSectors.orthoLoaded') });
      setPhase('idle'); setPicked(null); setResult(null); setAdding(false); setGeorefMode('auto');
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
          {/* Hacer transparente el fondo negro (nodata) de la ortofoto. */}
          <label className="flex items-center gap-2 mt-1 cursor-pointer select-none">
            <input type="checkbox" checked={transparentBlack} onChange={e => setTransparentBlack(e.target.checked)} className="accent-primary" />
            <span className="text-xs font-bold text-textPrimary">Hacer transparente el fondo negro</span>
          </label>
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
              {/* Método de georreferenciación (excluyentes: uno u otro). */}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {result.geo && (
                  <button type="button" onClick={() => setGeorefMode('auto')}
                    className={`px-2 py-1 text-[11px] font-bold rounded border ${georefMode === 'auto' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-textSecondary hover:bg-surface'}`}>
                    Usar el detectado
                  </button>
                )}
                <button type="button" onClick={enterKnownMode}
                  className={`px-2 py-1 text-[11px] font-bold rounded border ${showKnown ? 'border-primary bg-primary/10 text-primary' : 'border-border text-textSecondary hover:bg-surface'}`}>
                  {result.geo ? 'Otro sistema conocido' : 'Sistema conocido'}
                </button>
                {/* Método 2 solo si el archivo trae una grilla real (georreferenciado).
                    Sin georef, el bbox sería en píxeles (y=0 arriba) y voltearía la imagen. */}
                {result.rawExtent?.georeferenced && (
                  <button type="button" onClick={() => setGeorefMode('custom')}
                    className={`px-2 py-1 text-[11px] font-bold rounded border ${showCustom ? 'border-primary bg-primary/10 text-primary' : 'border-border text-textSecondary hover:bg-surface'}`}>
                    Sistema propio (puntos de control)
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Método 1: sistema conocido (PSAD56/UTM…) + 2 esquinas ── */}
          {showKnown && (
            <div className="flex flex-col gap-2 border-t border-border pt-2">
              {result.geo && (
                <p className="text-[11px] text-muted">
                  Las esquinas se tomaron del archivo en su sistema original. Solo elige el sistema correcto (y la zona si es UTM) y se reconvierten a WGS84.
                </p>
              )}
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

          {/* ── Método 2: sistema PROPIO por puntos de control (con rotación) ── */}
          {showCustom && (
            <div className="flex flex-col gap-2 border-t border-border pt-2">
              <p className="text-[11px] text-muted leading-snug">
                Ingresa <strong>≥2 puntos de control</strong>: su coordenada en <strong>tu sistema propio</strong> (la misma del archivo) y su equivalente en <strong>WGS84</strong> (lat/lng). Se ajusta una rotación + escala y la ortofoto se coloca <strong>girada</strong>.
              </p>
              {result.rawExtent && (
                <p className="text-[11px] text-primary leading-snug">
                  Extensión del archivo · X: {result.rawExtent.bbox.minX.toLocaleString('es-PE', { maximumFractionDigits: 2 })} … {result.rawExtent.bbox.maxX.toLocaleString('es-PE', { maximumFractionDigits: 2 })} · Y: {result.rawExtent.bbox.minY.toLocaleString('es-PE', { maximumFractionDigits: 2 })} … {result.rawExtent.bbox.maxY.toLocaleString('es-PE', { maximumFractionDigits: 2 })}
                </p>
              )}

              {result.rawExtent && (
                <button type="button"
                  onClick={() => { const b = result.rawExtent!.bbox; setCps([
                    { sx: String(b.minX), sy: String(b.maxY), lat: '', lng: '' },
                    { sx: String(b.maxX), sy: String(b.maxY), lat: '', lng: '' },
                    { sx: String(b.maxX), sy: String(b.minY), lat: '', lng: '' },
                    { sx: String(b.minX), sy: String(b.minY), lat: '', lng: '' },
                  ]); }}
                  className="self-start text-[11px] font-bold text-primary underline hover:text-primary/80">
                  Rellenar X/Y con las 4 esquinas del archivo (solo completas el WGS84)
                </button>
              )}

              <div className="flex flex-col gap-1">
                <div className="grid grid-cols-[1.4rem_1fr_1fr_1fr_1fr_1.4rem] gap-1 text-[10px] font-bold text-textSecondary uppercase px-0.5">
                  <span className="text-center">#</span><span>Este/X propio</span><span>Norte/Y propio</span><span>Latitud</span><span>Longitud</span><span></span>
                </div>
                {cps.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1.4rem_1fr_1fr_1fr_1fr_1.4rem] gap-1 items-center">
                    <span className="text-[11px] text-muted text-center">{i + 1}</span>
                    {(['sx', 'sy', 'lat', 'lng'] as const).map(f => (
                      <input key={f} value={row[f]} inputMode="decimal"
                        onChange={e => { const v = e.target.value; setCps(cs => cs.map((r, j) => j === i ? { ...r, [f]: v } : r)); }}
                        className="border border-border rounded px-1.5 py-1 text-xs w-full" />
                    ))}
                    <button type="button" onClick={() => setCps(cs => cs.filter((_, j) => j !== i))} disabled={cps.length <= 2}
                      className="flex items-center justify-center text-muted hover:text-danger disabled:opacity-30">
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setCps(cs => [...cs, { sx: '', sy: '', lat: '', lng: '' }])}
                  className="self-start flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary/80 mt-0.5">
                  <Plus size={12} /> Agregar punto
                </button>
              </div>

              {/* RMS + rotación en vivo */}
              {customFit && (
                customFit.count < 2
                  ? <p className="text-[11px] text-amber-700">Faltan puntos de control válidos: {customFit.count}/2 mínimo.</p>
                  : customFit.fit && result.rawExtent
                    ? (() => {
                        const rms = customFit.fit.rmsMeters;
                        const bearing = metricToRotatedOverlay(customFit.fit.georef, result.rawExtent.bbox).bearingDeg;
                        return <p className={`text-[11px] font-bold ${rms < 2 ? 'text-success' : rms < 10 ? 'text-amber-700' : 'text-danger'}`}>
                          Ajuste con {customFit.count} puntos · error RMS ≈ {rms.toFixed(2)} m · rotación {bearing.toFixed(1)}°
                        </p>;
                      })()
                    : <p className="text-[11px] text-danger">Puntos degenerados (colineales o repetidos): no se puede ajustar.</p>
              )}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button onClick={() => { setPhase('idle'); setResult(null); setPicked(null); setAdding(false); setGeorefMode('auto'); }} disabled={busy}
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
