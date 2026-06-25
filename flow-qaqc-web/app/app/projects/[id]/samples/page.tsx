'use client';

/**
 * Ensayos por muestra (web) — lista de muestras físicas del proyecto + alta.
 * Espejo del SamplesScreen móvil (MVP): lista, búsqueda, filtro por sector y
 * creación con los campos configurables (sample_form_rows). La captura GPS de
 * coordenadas se hace en el MÓVIL (en PC se omite esa fila).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FlaskConical, Plus, Search, X, ChevronRight, Layers, Trash2, Loader2, ArrowDownUp } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useProjects, useProjectFlags } from '@hooks/useProjects';
import { renumberSamples } from '@lib/renumber';
import { useAuth } from '@lib/auth-context';
import { useEnsayosData } from '@hooks/useEnsayos';
import { useSamples, useCreateSample, useDeleteSample } from '@hooks/useSamples';
import { todaySampleDate } from '@lib/sampleCode';
import PageHeader from '@components/PageHeader';
import { useI18n } from '@lib/i18n';

export default function SamplesPage() {
  const { t } = useI18n();
  const { id: projectId } = useParams<{ id: string }>();
  const { currentUser } = useAuth();
  const { data: projects = [] } = useProjects();
  const project = projects.find(p => p.id === projectId);
  const { data: flags } = useProjectFlags(projectId);
  const { data: ens } = useEnsayosData(projectId);
  const { data, isLoading } = useSamples(projectId);
  const createSample = useCreateSample(projectId);
  const deleteSample = useDeleteSample(projectId);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const canDelete = currentUser?.role === 'CREATOR' || currentUser?.role === 'RESIDENT';
  const deletionMode = flags?.deletion_mode ?? 'last_only';
  const qc = useQueryClient();
  const [renumbering, setRenumbering] = useState(false);
  const onRenumberSamples = async () => {
    if (renumbering) return;
    if (!window.confirm('Reasigna los códigos de las muestras desde 1, por fecha de muestra, eliminando los huecos. ¿Continuar?')) return;
    setRenumbering(true);
    const r = await renumberSamples(projectId);
    setRenumbering(false);
    if (!r.ok) window.alert('No se pudo renumerar. Revisa tu conexión.');
    else { window.alert(`Numeración restablecida: ${r.count ?? 0} muestra(s) recodificadas.`); qc.invalidateQueries({ queryKey: ['samples', projectId] }); }
  };

  const sectors = ens?.sectors ?? [];
  const samples = data?.samples ?? [];
  const counts = data?.countBySample ?? {};
  const sampleIdentifier = (project as { sample_identifier?: string | null } | undefined)?.sample_identifier ?? '';
  const materials = flags?.sample_materials ?? [];
  const rows = { material: true, condition: true, depth: false, coords: true, layers: false, ...(flags?.sample_form_rows ?? {}) };

  const [search, setSearch] = useState('');
  const [filterSector, setFilterSector] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return samples.filter(s => {
      if (filterSector && s.sector_id !== filterSector) return false;
      if (!q) return true;
      return (s.sample_code ?? '').toLowerCase().includes(q) || (s.material_type ?? '').toLowerCase().includes(q);
    });
  }, [samples, search, filterSector]);

  const sectorName = (sid: string | null) => sectors.find(s => s.id === sid)?.name ?? '';

  // v64 — Última muestra creada (mayor seq). En 'last_only' solo ESTA es borrable.
  const lastSampleId = useMemo(() => {
    let best: { id: string; seq: number | null } | null = null;
    for (const s of samples) if (!best || ((s.seq ?? 0) > (best.seq ?? 0))) best = s;
    return best?.id ?? null;
  }, [samples]);

  const onDeleteSample = async (s: { id: string; sample_code: string | null }) => {
    if (!canDelete) { window.alert('Solo el Jefe o el Creador pueden eliminar muestras.'); return; }
    const cnt = counts[s.id] ?? 0;
    if (cnt > 0) { window.alert(`Esta muestra tiene ${cnt} ensayo(s) vinculados. Elimínalos o muévelos primero.`); return; }
    if (!window.confirm(`¿Eliminar ${s.sample_code ?? 'la muestra'}? Va a la papelera (se puede restaurar).`)) return;
    setDeletingId(s.id);
    try {
      await deleteSample.mutateAsync({ sampleId: s.id, deletedById: currentUser?.id ?? null, deletedByName: (currentUser as { name?: string } | null)?.name ?? null });
    } catch (e: any) {
      const hp = (e?.message ?? '').match(/has_protocols:(\d+)/);
      window.alert(hp ? `La muestra tiene ${hp[1]} ensayo(s) vinculados.` : 'No se pudo eliminar. Revisa tu conexión.');
    } finally { setDeletingId(null); }
  };

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <PageHeader
        title={t('samples.title')}
        subtitle={project?.name}
        crumbs={[{ label: t('webEnsayos.menu.crumbProjects'), href: '/app/projects' }, { label: project?.name ?? '…' }]}
      />

      <div className="flex-1 p-4 max-w-3xl w-full mx-auto flex flex-col gap-3">
        {/* Filtros */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-white border border-border rounded-lg px-3 py-2">
            <Search size={15} className="text-textMuted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('samples.searchPlaceholder')}
              className="flex-1 text-sm focus:outline-none bg-transparent" />
          </div>
          {sectors.length > 0 && (
            <select value={filterSector} onChange={e => setFilterSector(e.target.value)}
              className="text-xs border border-border rounded-lg px-2 py-2 bg-white max-w-[40%]">
              <option value="">{t('samples.allSegments')}</option>
              {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        {!sampleIdentifier && (
          <p className="text-xs text-warning bg-warning/5 border border-warning/30 rounded-md p-2">{t('samples.identifierWarning')}</p>
        )}

        <button onClick={() => setShowAdd(true)}
          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-bold bg-primary/5 border border-primary/30 text-primary hover:bg-primary/10 transition">
          <Plus size={15} /> {t('samples.addSample')}
        </button>

        {deletionMode === 'in_list_reassignable' && canDelete && (
          <button onClick={onRenumberSamples} disabled={renumbering}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-extrabold bg-primary/5 border-[1.5px] border-primary text-primary hover:bg-primary/10 disabled:opacity-50 transition">
            {renumbering ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownUp size={14} />}
            Restablecer numeración
          </button>
        )}

        {/* Lista */}
        {isLoading ? (
          <p className="text-sm text-textMuted text-center py-8">…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-textMuted text-center py-8">{t('samples.empty')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map(s => (
              <Link key={s.id} href={`/app/projects/${projectId}/samples/${s.id}`}
                className="bg-white rounded-xl shadow-card border border-border border-t-[3px] p-3 flex items-center gap-3 hover:shadow-lg hover:border-primary/30 transition group"
                style={{ borderTopColor: 'var(--color-primary, #00bcb4)' }}>
                <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                  <FlaskConical size={18} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold text-textPrimary truncate">{s.sample_code}</p>
                  <p className="text-[11px] text-textSecondary truncate">
                    {[s.sample_date, s.material_type, sectorName(s.sector_id)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="text-[10px] font-bold rounded px-1.5 py-0.5 bg-primary/10 text-primary shrink-0">
                  {counts[s.id] ?? 0} {t('samples.testsLabel')}
                </span>
                {canDelete && (deletionMode !== 'last_only' || s.id === lastSampleId) && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteSample(s); }}
                    disabled={deletingId === s.id}
                    title="Eliminar muestra"
                    className="shrink-0 text-danger hover:bg-danger/10 rounded p-1 disabled:opacity-50">
                    {deletingId === s.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                )}
                <ChevronRight size={18} className="text-textMuted group-hover:text-primary transition" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <AddSampleModal
          rows={rows} materials={materials} sectors={sectors}
          busy={createSample.isPending}
          onClose={() => setShowAdd(false)}
          onCreate={async (args) => {
            try { await createSample.mutateAsync({ ...args, createdById: currentUser?.id ?? null }); setShowAdd(false); }
            catch (e) { alert((e as Error).message || t('samples.createError')); }
          }}
        />
      )}
    </div>
  );
}

// ── Modal nueva muestra ──────────────────────────────────────────────────────
function AddSampleModal({ rows, materials, sectors, busy, onClose, onCreate }: {
  rows: { material: boolean; condition: boolean; depth: boolean; coords: boolean; layers: boolean };
  materials: string[];
  sectors: { id: string; name: string }[];
  busy: boolean;
  onClose: () => void;
  onCreate: (args: { sampleDate: string; materialType: string | null; condition: string | null; depthFrom: number | null; depthTo: number | null; sectorId: string | null; layer: string | null }) => void;
}) {
  const { t } = useI18n();
  const [date, setDate] = useState(todaySampleDate());
  const [material, setMaterial] = useState('');
  const [condition, setCondition] = useState('');
  const [depthFrom, setDepthFrom] = useState('');
  const [depthTo, setDepthTo] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [layer, setLayer] = useState('');
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date.trim());

  return (
    <div className="fixed inset-0 z-[60] bg-navy/50 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-md p-4 flex flex-col gap-3 shadow-modal max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-textPrimary flex items-center gap-2"><FlaskConical size={15} className="text-primary" /> {t('samples.newSample')}</h3>
          {!busy && <button onClick={onClose}><X size={16} className="text-textMuted" /></button>}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-textSecondary">{t('samples.sampleDate')}</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="text-sm border border-border rounded px-2 py-2 focus:outline-none focus:border-primary" />
        </label>

        {sectors.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-textSecondary">{t('samples.sector')}</span>
            <select value={sectorId} onChange={e => setSectorId(e.target.value)}
              className="text-sm border border-border rounded px-2 py-2 bg-white focus:outline-none focus:border-primary">
              <option value="">{t('samples.select')}</option>
              {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}

        {rows.material && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-textSecondary">{t('samples.materialType')}</span>
            {materials.length > 0 ? (
              <select value={material} onChange={e => setMaterial(e.target.value)}
                className="text-sm border border-border rounded px-2 py-2 bg-white focus:outline-none focus:border-primary">
                <option value="">{t('samples.select')}</option>
                {materials.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input value={material} onChange={e => setMaterial(e.target.value)}
                className="text-sm border border-border rounded px-2 py-2 focus:outline-none focus:border-primary" />
            )}
          </label>
        )}

        {rows.condition && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-textSecondary">{t('samples.condition')}</span>
            <div className="flex gap-2">
              {[{ v: 'ALTERADA', l: t('samples.altered') }, { v: 'INALTERADA', l: t('samples.undisturbed') }].map(o => (
                <button key={o.v} onClick={() => setCondition(condition === o.v ? '' : o.v)}
                  className={`flex-1 px-2 py-1.5 rounded border text-xs font-bold transition ${condition === o.v ? 'bg-primary text-white border-primary' : 'bg-white text-textSecondary border-border hover:bg-surface'}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        )}

        {rows.depth && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-textSecondary">{t('samples.depth')}</span>
            <div className="flex gap-2">
              <input type="number" step="0.01" value={depthFrom} onChange={e => setDepthFrom(e.target.value)} placeholder={t('samples.depthFrom')}
                className="flex-1 text-sm border border-border rounded px-2 py-2 focus:outline-none focus:border-primary" />
              <input type="number" step="0.01" value={depthTo} onChange={e => setDepthTo(e.target.value)} placeholder={t('samples.depthTo')}
                className="flex-1 text-sm border border-border rounded px-2 py-2 focus:outline-none focus:border-primary" />
            </div>
          </div>
        )}

        {rows.layers && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-textSecondary flex items-center gap-1"><Layers size={12} /> {t('samples.layerInfo')}</span>
            <input value={layer} onChange={e => setLayer(e.target.value)} placeholder={t('samples.numberPlaceholder')}
              className="text-sm border border-border rounded px-2 py-2 focus:outline-none focus:border-primary" />
          </label>
        )}

        {rows.coords && (
          <p className="text-[11px] text-textMuted italic bg-surface border border-border rounded p-2">
            📱 {t('samples.captureCoords')} — desde el móvil (la PC no captura GPS).
          </p>
        )}

        <div className="flex justify-end gap-2 mt-1">
          <button onClick={onClose} disabled={busy} className="px-3 py-1.5 text-xs font-bold text-textSecondary hover:text-textPrimary disabled:opacity-40">{t('common.cancel')}</button>
          <button
            disabled={busy || !dateOk}
            onClick={() => onCreate({
              sampleDate: date.trim(),
              materialType: material.trim() || null,
              condition: condition || null,
              depthFrom: depthFrom ? Number(depthFrom) : null,
              depthTo: depthTo ? Number(depthTo) : null,
              sectorId: sectorId || null,
              layer: layer.trim() || null,
            })}
            className="px-4 py-1.5 text-xs font-bold rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-40">
            {busy ? t('samples.creating') : t('samples.createSample')}
          </button>
        </div>
      </div>
    </div>
  );
}
