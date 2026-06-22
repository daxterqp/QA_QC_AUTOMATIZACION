'use client';

/**
 * SectoresTab — Tab "Sectores" de la pantalla Cargar Archivos (web).
 * Análogo a [src/components/ProjectSectorsContent.tsx] del móvil.
 *
 * Permite:
 *  - Subir Excel/CSV con polígonos (3 formatos auto-detectados)
 *  - Listar sectores: nombre, color, # vértices
 *  - Editar nombre + color por sector
 *  - Eliminar sector (avisa cuántos protocolos quedarán huérfanos)
 *  - Recalcular asignaciones automáticas (point-in-polygon)
 */

import { useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import {
  Upload, Loader2, CheckCircle, AlertCircle, Shapes, Trash2, Pencil, RefreshCw,
  ChevronDown, ChevronRight, Map as MapIcon,
} from 'lucide-react';
import { parseSectorFile, type SectorImportResult } from '@lib/sectorParser';
import {
  useProjectSectors, importSectorsToSupabase, updateSector, deleteSector,
  recalculateSectorAssignments, type SectorsImportSummary,
} from '@hooks/useFileUpload';
import { SectorCroquis } from './SectorCroquis';
import { OrthophotoSection } from './OrthophotoSection';
import type { MapSector, MapOrthophoto } from './SectorMap';
import { useProjects } from '@hooks/useProjects';
import { useI18n, tx } from '@lib/i18n';

// Leaflet toca `window` → carga solo en cliente.
const SectorMap = dynamic(() => import('./SectorMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[380px] bg-surface rounded text-xs text-muted">
      {tx('webCSectors.mapLoading')}
    </div>
  ),
});

// Paleta de SECTORES (distinta de los colores de estado de ensayo). Ver useFileUpload.SECTOR_PALETTE.
const PALETTE = ['#7E57C2', '#00897B', '#C2185B', '#8D6E63', '#5E35B1', '#0097A7', '#AD1457', '#6D4C41'];

export function SectoresTab({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: sectors = [], refetch } = useProjectSectors(projectId);
  const { data: projects = [], refetch: refetchProjects } = useProjects();
  const project = projects.find(p => p.id === projectId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<SectorImportResult | null>(null);
  const [summary, setSummary] = useState<SectorsImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; color: string } | null>(null);
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Sectores con geometría, normalizados para el croquis y el mapa.
  const mapSectors = useMemo<MapSector[]>(
    () => sectors
      .filter(s => Array.isArray(s.points_json) && s.points_json.length >= 3)
      .map(s => ({
        id: s.id,
        name: s.name,
        color: s.display_color ?? '#1976D2',
        points: s.points_json as { lat: number; lng: number }[],
      })),
    [sectors],
  );

  // Ortofoto del proyecto → ImageOverlay del mapa (servida vía proxy s3-image).
  const orthophotos = useMemo<MapOrthophoto[]>(() => {
    const v = project?.updated_at ? `&t=${encodeURIComponent(String(project.updated_at))}` : '';
    const mk = (key: string, bounds: any) => ({ url: `/api/s3-image?key=${encodeURIComponent(key)}${v}`, bounds, opacity: 0.9 });
    // v37 — teselas de la versión activa (1 o N). Fallback a la key única antigua.
    const tiles = project?.orthophoto_tiles_json;
    if (Array.isArray(tiles) && tiles.length > 0) return tiles.filter(t => t?.s3Key && t?.bounds).map(t => mk(t.s3Key, t.bounds));
    if (project?.orthophoto_s3_key && project?.orthophoto_bounds_json) return [mk(project.orthophoto_s3_key, project.orthophoto_bounds_json)];
    return [];
  }, [project?.orthophoto_tiles_json, project?.orthophoto_s3_key, project?.orthophoto_bounds_json, project?.updated_at]);

  const refreshProject = () => {
    refetchProjects();
    qc.invalidateQueries({ queryKey: ['projects'] });
  };

  const refresh = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ['project-sectors', projectId] });
  };

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError(null); setSummary(null); setBusy(true);
    try {
      const result = await parseSectorFile(file);
      setParsed(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!parsed) return;
    setBusy(true); setError(null);
    try {
      const s = await importSectorsToSupabase(projectId, parsed.sectors);
      setSummary(s);
      setParsed(null);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t('webCSectors.deleteConfirm', { name }))) return;
    setBusy(true);
    try {
      const { unassigned } = await deleteSector(id);
      refresh();
      alert(unassigned > 0
        ? t('webCSectors.deletedWithUnassigned', { count: unassigned })
        : t('webCSectors.deletedSimple'));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) { alert(t('webCSectors.nameRequired')); return; }
    setBusy(true);
    try {
      await updateSector(editing.id, { name, display_color: editing.color });
      setEditing(null);
      refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRecalculate = async () => {
    setBusy(true); setRecalcMsg(null);
    try {
      const { updated, total } = await recalculateSectorAssignments(projectId);
      setRecalcMsg(t('webCSectors.recalcResult', { updated, total }));
    } catch (err) {
      setRecalcMsg(t('webCSectors.recalcErrorPrefix') + (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const stats = {
    total: sectors.length,
    withGeom: sectors.filter(s => Array.isArray(s.points_json) && s.points_json.length >= 3).length,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header card: subir Excel + recalcular */}
      <div className="bg-white rounded-md border border-border p-4 flex flex-col gap-3">
        <h3 className="text-sm font-bold tracking-wide uppercase text-textPrimary">{t('webCSectors.cardTitle')}</h3>
        <p className="text-xs text-muted leading-relaxed" dangerouslySetInnerHTML={{ __html: t('webCSectors.cardDesc') }} />
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-2 px-3 py-2 text-xs font-bold rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {t('webCSectors.uploadExcelCsv')}
          </button>
          <button
            onClick={handleRecalculate}
            disabled={busy || stats.withGeom === 0}
            className="flex items-center gap-2 px-3 py-2 text-xs font-bold rounded bg-warning text-white hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw size={14} />
            {t('sectorsContent.recalcAssignments')}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handlePick} />
        </div>
        {error && (
          <div className="flex items-start gap-2 p-2 bg-danger/10 border border-danger/30 rounded text-xs text-danger">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}
        {recalcMsg && (
          <div className="flex items-center gap-2 p-2 bg-primary/10 border border-primary/30 rounded text-xs text-primary">
            <CheckCircle size={14} />
            <p>{recalcMsg}</p>
          </div>
        )}
      </div>

      {/* Preview de importación */}
      {parsed && (
        <div className="bg-white rounded-md border border-border p-4 flex flex-col gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-textPrimary">{t('webCSectors.previewTitle')}</h4>
          <p className="text-xs text-textSecondary">
            {t('webCSectors.previewFormat')} <strong>{formatLabel(parsed.format)}</strong> ·
            {' '}{t('webCSectors.previewSectors')} <strong>{parsed.sectors.length}</strong>
          </p>
          <ul className="text-xs text-textSecondary space-y-0.5 max-h-48 overflow-y-auto">
            {parsed.sectors.slice(0, 20).map((s, i) => (
              <li key={i}>• {s.name} {s.points ? t('webCSectors.previewLinePts', { count: s.points.length }) : t('webCSectors.previewLineNameOnly')}</li>
            ))}
            {parsed.sectors.length > 20 && <li>{t('webCSectors.previewMore', { count: parsed.sectors.length - 20 })}</li>}
          </ul>
          {parsed.warnings.length > 0 && (
            <div className="mt-2 p-2 bg-warning/10 border border-warning/30 rounded text-[11px] text-warning space-y-0.5">
              {parsed.warnings.slice(0, 6).map((w, i) => <p key={i}>⚠ {w}</p>)}
              {parsed.warnings.length > 6 && <p>{t('webCSectors.previewWarnMore', { count: parsed.warnings.length - 6 })}</p>}
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button onClick={() => setParsed(null)} disabled={busy}
              className="px-3 py-1.5 text-xs font-bold rounded border border-border text-textSecondary hover:bg-surface">
              {t('common.cancel')}
            </button>
            <button onClick={handleConfirm} disabled={busy}
              className="px-3 py-1.5 text-xs font-bold rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
              {busy && <Loader2 size={12} className="animate-spin" />}
              {t('webCSectors.confirmImport')}
            </button>
          </div>
        </div>
      )}

      {/* Resumen de importación */}
      {summary && (
        <div className="bg-white rounded-md border border-success/30 bg-success/5 p-4 flex items-center gap-2">
          <CheckCircle size={16} className="text-success shrink-0" />
          <p className="text-xs text-textSecondary">
            {t('webCSectors.importSummary', { added: summary.added, modified: summary.modified })}
          </p>
        </div>
      )}

      {/* Lista de sectores */}
      <div className="bg-white rounded-md border border-border overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-surface border-b border-border">
          <p className="text-xs font-bold text-textSecondary">
            {t('webCSectors.loadedHeader', { total: stats.total, withGeom: stats.withGeom })}
          </p>
        </div>
        {sectors.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Shapes size={36} className="text-muted opacity-30" />
            <p className="text-xs text-muted">{t('webCSectors.emptyText')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {sectors.map(s => {
              const hasGeom = Array.isArray(s.points_json) && s.points_json.length >= 3;
              const vertCount = Array.isArray(s.points_json) ? s.points_json.length : 0;
              const expanded = expandedId === s.id;
              return (
                <li key={s.id}>
                  <div
                    className={`flex items-center gap-3 px-3 py-2.5 ${hasGeom ? 'cursor-pointer hover:bg-surface' : ''}`}
                    onClick={() => hasGeom && setExpandedId(expanded ? null : s.id)}
                  >
                    {hasGeom ? (
                      expanded
                        ? <ChevronDown size={14} className="text-muted shrink-0" />
                        : <ChevronRight size={14} className="text-muted shrink-0" />
                    ) : <span className="w-3.5 shrink-0" />}
                    <div
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: s.display_color ?? '#999' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-textPrimary truncate">{s.name}</p>
                      <p className="text-[11px] text-muted truncate">
                        {hasGeom ? t('webCSectors.rowGeometryMeta', { count: vertCount }) : t('sectorsContent.rowNameOnly')}
                        {s.source_system ? ` · ${s.source_system}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setEditing({ id: s.id, name: s.name, color: s.display_color ?? PALETTE[0] }); }}
                      className="p-1.5 rounded hover:bg-surface text-primary"
                      title={t('common.edit')}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(s.id, s.name); }}
                      className="p-1.5 rounded hover:bg-danger/10 text-danger"
                      title={t('common.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {expanded && hasGeom && (
                    <div className="px-3 pb-3 pt-1 flex justify-center bg-surface/40">
                      <SectorCroquis
                        points={s.points_json as { lat: number; lng: number }[]}
                        color={s.display_color ?? '#1976D2'}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Ortofoto georreferenciada */}
      {project && (
        <OrthophotoSection
          projectId={projectId}
          projectName={project.name}
          versions={project.orthophotos_json ?? []}
          activeId={project.orthophoto_active_id ?? null}
          legacy={{
            s3Key: project.orthophoto_s3_key ?? null,
            bounds: project.orthophoto_bounds_json ?? null,
            system: project.orthophoto_system ?? null,
          }}
          onSaved={refreshProject}
        />
      )}

      {/* Mapa GIS general — todos los sectores con geometría + ortofoto */}
      {(mapSectors.length > 0 || orthophotos.length > 0) && (
        <div className="bg-white rounded-md border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border">
            <MapIcon size={14} className="text-primary" />
            <p className="text-xs font-bold text-textSecondary">
              {t('webCSectors.mapHeader', { count: mapSectors.length })}{orthophotos.length > 0 ? `${t('webCSectors.mapOrthoActive')}${orthophotos.length > 1 ? t('webCSectors.mapOrthoTiles', { count: orthophotos.length }) : ''}` : ''}
            </p>
          </div>
          <div className="p-2">
            <SectorMap sectors={mapSectors} orthophotos={orthophotos} height={400} />
          </div>
        </div>
      )}

      {/* Modal editar */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-md p-4 w-full max-w-md flex flex-col gap-3">
            <h4 className="text-sm font-bold text-textPrimary">{t('sectorsContent.editTitle')}</h4>
            <label className="text-xs font-bold text-textSecondary">{t('sectorsContent.fieldName')}</label>
            <input
              className="border border-border rounded px-2 py-1.5 text-sm"
              value={editing.name}
              onChange={e => setEditing({ ...editing, name: e.target.value })}
            />
            <label className="text-xs font-bold text-textSecondary">{t('sectorsContent.fieldColor')}</label>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map(c => (
                <button
                  key={c}
                  onClick={() => setEditing({ ...editing, color: c })}
                  className={`w-7 h-7 rounded-full border-2 ${editing.color === c ? 'border-textPrimary' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  type="button"
                />
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setEditing(null)}
                className="flex-1 px-3 py-1.5 text-xs font-bold rounded border border-border text-textSecondary hover:bg-surface">
                {t('common.cancel')}
              </button>
              <button onClick={handleSaveEdit} disabled={busy}
                className="flex-1 px-3 py-1.5 text-xs font-bold rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatLabel(f: string): string {
  switch (f) {
    case 'names-only': return tx('sectorsContent.formatNamesOnly');
    case 'wgs84-flat': return tx('webCSectors.fmtWgs84Flat');
    case 'projected':  return tx('sectorsContent.formatProjected');
    default: return f;
  }
}
