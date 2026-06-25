'use client';

/**
 * Ensayos por sector / tipo / fecha (v31, Parte D).
 *
 * Una sola página para los 3 modos (param de ruta `mode`): grupos DESPLEGABLES
 * (sectores / tipos de ensayo / fechas) con los ensayos dentro y el botón
 * "+ Adicionar ensayo" (tipo + cantidad N + fecha + hora).
 *
 * v32 — Mejoras UI/UX: buscador + filtros cruzados (fecha → calendario;
 * sector/tipo → modal; default "todos"), botón adicionar OUTLINE justo debajo
 * de la tarjeta del grupo, cards más altas, y captura de HORA de inicio
 * (default: hora del sistema al guardar; editable).
 */

import { useMemo, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronDown, ChevronRight, Plus, Loader2, FlaskConical, Search, X,
  CalendarDays, Grid3x3, Settings, LayoutList, MousePointerClick, ArrowDownUp, Trash2,
} from 'lucide-react';
import { cn } from '@lib/utils';
import { useAuth } from '@lib/auth-context';
import { useI18n } from '@lib/i18n';
import PageHeader from '@components/PageHeader';
import { useQueryClient } from '@tanstack/react-query';
import { useProjects, useProjectFlags, useUpdateProjectFlags } from '@hooks/useProjects';
import { useEnsayosData, useCreateEnsayos, useDeleteEnsayo, type EnsayosMode } from '@hooks/useEnsayos';
import { renumberProject } from '@lib/renumber';
import { todayEnsayoDate, parseEnsayoDate, pickMask, seqFromCode } from '@lib/protocolCode';
import type { Protocol, ProtocolStatus } from '@/types';

// Paridad EXACTA con el móvil (EnsayosScreen): mismo hue + tinte ~10% (móvil usa color+'18').
// DRAFT se ve igual que IN_PROGRESS (warning) porque ambos rotulan "En progreso".
const STATUS_COLORS: Record<ProtocolStatus, string> = {
  DRAFT:       'bg-warning/10 text-warning',
  IN_PROGRESS: 'bg-warning/10 text-warning',
  SUBMITTED:   'bg-primary/10 text-primary',
  APPROVED:    'bg-success/10 text-success',
  REJECTED:    'bg-danger/10 text-danger',
};

const STATUS_LABELS: Record<ProtocolStatus, string> = {
  // DRAFT rotula "En progreso" (igual que el móvil: DRAFT→inProgress), no "Sin iniciar".
  DRAFT:       'webEnsayos.list.statusInProgress',
  IN_PROGRESS: 'webEnsayos.list.statusInProgress',
  SUBMITTED:   'webEnsayos.list.statusSubmitted',
  APPROVED:    'webEnsayos.list.statusApproved',
  REJECTED:    'webEnsayos.list.statusRejected',
};

const MODE_TITLES: Record<EnsayosMode, string> = {
  sector: 'webEnsayos.list.modeSector',
  type: 'webEnsayos.list.modeType',
  date: 'webEnsayos.list.modeDate',
};

interface Group {
  key: string;
  label: string;
  sectorId?: string;
  sectorName?: string;
  templateId?: string;
  ensayoDate?: string | null;
  /** v39 — tipo oculto: se muestra (tiene registros) pero NO permite crear nuevos. */
  hidden?: boolean;
}

function fmtFecha(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** v62 — created_at en ms (bigint). Robusto si llegara como string ISO o numérico. */
function createdMs(p: { created_at?: unknown }): number {
  const n = Number(p?.created_at);
  return Number.isFinite(n) ? n : (Date.parse(String(p?.created_at)) || 0);
}

export default function EnsayosPage() {
  const { t } = useI18n();
  const { id: projectId, mode: modeParam } = useParams<{ id: string; mode: string }>();
  const mode = (['sector', 'type', 'date'].includes(modeParam) ? modeParam : 'sector') as EnsayosMode;
  const router = useRouter();
  const { currentUser } = useAuth();
  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR' || currentUser?.role === 'SUPERVISOR';

  const { data: projects = [] } = useProjects();
  const project = projects.find(p => p.id === projectId);
  const { data, isLoading } = useEnsayosData(projectId);
  const createEnsayos = useCreateEnsayos(projectId);

  // ── Control de visualización (config por proyecto, en feature_flags) ──────────
  const { data: flags } = useProjectFlags(projectId);
  const updateFlags = useUpdateProjectFlags(projectId);
  const viewMode: 'cards' | 'modal' = flags?.ensayos_view_mode === 'modal' ? 'modal' : 'cards';
  const [showViewCfg, setShowViewCfg] = useState(false);
  // v63 — Restablecer numeración (modo B).
  const qc = useQueryClient();
  const [renumbering, setRenumbering] = useState(false);
  const onRenumber = async () => {
    if (renumbering) return;
    if (!(currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR')) { window.alert('Solo el Jefe o el Creador pueden renumerar.'); return; }
    if (!window.confirm('Reasigna los códigos desde 1 dentro de cada grupo, por fecha de ensayo, eliminando los huecos. Las referencias entre ensayos NO se rompen (son por id). ¿Continuar?')) return;
    setRenumbering(true);
    const r = await renumberProject(projectId);
    setRenumbering(false);
    if (!r.ok) {
      window.alert(r.reason === 'no_coding' ? 'El proyecto no usa codificación correlativa de ensayos.' : 'No se pudo renumerar. Revisa tu conexión.');
    } else {
      window.alert(`Numeración restablecida: ${r.count ?? 0} ensayo(s) recodificados.`);
      qc.invalidateQueries({ queryKey: ['ensayos-data', projectId] });
    }
  };

  // v62 — Borrado de ensayos (paridad con móvil): gating por deletion_mode + liberar correlativo.
  const deleteEnsayo = useDeleteEnsayo(projectId);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const canDeleteEnsayo = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';
  const deletionMode = flags?.deletion_mode ?? 'last_only';
  const codingInfoOf = useCallback((p: any): { groupKey: string; seq: number | null } | null => {
    if (!flags || !data) return null;
    const tpl = data.templates.find(t => t.id === p.template_id);
    const tipo = tpl?.id_protocolo ?? null;
    if (!tipo) return null;
    const date = parseEnsayoDate(p.ensayo_date) ?? new Date();
    const resetScope = flags.coding_seq_reset === 'year_sector' ? { sector: true }
      : flags.coding_seq_reset === 'year_month' ? { month: true } : {};
    const sectorName = p.sector_id ? (data.sectors.find(s => s.id === p.sector_id)?.name ?? null) : null;
    const mask = pickMask(flags.coding_mask_default, flags.coding_mask_by_type, tipo);
    const sectorPart = resetScope.sector ? `|${(sectorName ?? '').trim().toUpperCase().replace(/\s+/g, '')}` : '';
    const monthPart = resetScope.month ? `|M${date.getMonth() + 1}` : '';
    return { groupKey: `${tipo}|${date.getFullYear()}${sectorPart}${monthPart}`, seq: seqFromCode(p.protocol_code, mask, tipo, date, sectorName, resetScope) };
  }, [flags, data]);
  const deletableIds = useMemo<Set<string> | null>(() => {
    if ((flags?.deletion_mode ?? 'last_only') !== 'last_only') return null;
    const top = new Map<string, { id: string; created: number }>();
    for (const p of (data?.protocols ?? [])) {
      const gk = codingInfoOf(p)?.groupKey ?? `__t:${p.template_id}`;
      const created = createdMs(p);
      const cur = top.get(gk);
      if (!cur || created > cur.created) top.set(gk, { id: p.id, created });
    }
    return new Set(Array.from(top.values()).map(v => v.id));
  }, [data, flags, codingInfoOf]);
  const onDeleteEnsayo = async (p: any) => {
    if (!canDeleteEnsayo) { window.alert('Solo el Jefe o el Creador pueden eliminar ensayos.'); return; }
    if (deletableIds && !deletableIds.has(p.id)) {
      window.alert('En este proyecto solo se puede eliminar el ÚLTIMO ensayo creado de su grupo (evita huecos). Para borrar dentro de la lista, cambia el "Modo de eliminación" en la Configuración del proyecto.');
      return;
    }
    const label = p.protocol_code ?? p.protocol_number ?? 'este ensayo';
    if (!window.confirm(`¿Eliminar ${label}? Va a la papelera (se puede restaurar).`)) return;
    setDeletingId(p.id);
    const info = codingInfoOf(p);
    try {
      await deleteEnsayo.mutateAsync({
        protocolId: p.id, deletedById: currentUser?.id ?? null,
        deletedByName: (currentUser as { name?: string } | null)?.name ?? null,
        releaseGroupKey: info?.groupKey ?? null, releaseSeq: info?.seq ?? null,
      });
    } catch { window.alert('No se pudo eliminar. Revisa tu conexión.'); }
    finally { setDeletingId(null); }
  };

  const [savingView, setSavingView] = useState(false);
  const [selGroupKey, setSelGroupKey] = useState<string | null>(null);   // modo modal
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const saveViewMode = async (m: 'cards' | 'modal') => {
    if (!flags) return;
    setSavingView(true);
    try { await updateFlags.mutateAsync({ ...flags, ensayos_view_mode: m }); setShowViewCfg(false); }
    catch (e) { alert((e as Error).message); }
    finally { setSavingView(false); }
  };

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ── v32: buscador + filtros cruzados (default: todos) ────────────────────
  const [search, setSearch] = useState('');
  // Fecha: RANGO desde/hasta (mismo día = solo ese día). Comparación
  // lexicográfica YYYY-MM-DD = orden cronológico.
  const [filterFrom, setFilterFrom] = useState<string | null>(null);
  const [filterTo, setFilterTo] = useState<string | null>(null);
  // Tipo/Sector: MULTISELECCIÓN (vacío = todos).
  const [filterTemplateIds, setFilterTemplateIds] = useState<Set<string>>(new Set());
  const [filterSectorIds, setFilterSectorIds] = useState<Set<string>>(new Set());
  const [showFilterPicker, setShowFilterPicker] = useState<null | 'tipo' | 'sector'>(null);
  // v62 — Orden de la lista. Default: CREACIÓN ascendente (antiguos arriba, nuevos abajo).
  const [sortBy, setSortBy] = useState<'creation' | 'ensayo' | 'code'>('creation');
  const [sortAsc, setSortAsc] = useState(true);

  const toggleInSet = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  };

  // Modal Adicionar
  const [modalGroup, setModalGroup] = useState<Group | null>(null);
  const [selTemplateId, setSelTemplateId] = useState('');
  const [countText, setCountText] = useState('1');
  const [fechaText, setFechaText] = useState(todayEnsayoDate());
  const [horaText, setHoraText] = useState(nowHHMM());
  const [horaTouched, setHoraTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtersActive = search.trim() !== '' || filterFrom != null || filterTo != null || filterTemplateIds.size > 0 || filterSectorIds.size > 0;

  const groups: Group[] = useMemo(() => {
    if (!data) return [];
    if (mode === 'sector') {
      return data.sectors.map(s => ({ key: `sec:${s.id}`, label: s.name, sectorId: s.id, sectorName: s.name }));
    }
    if (mode === 'type') {
      // v39 — un tipo oculto solo aparece si TIENE registros (para no perderlos);
      // su tarjeta no permitirá crear ensayos nuevos.
      const usedTpl = new Set(data.protocols.map(p => p.template_id));
      return data.templates
        .filter(t => !t.is_hidden || usedTpl.has(t.id))
        .map(t => ({
          key: `tpl:${t.id}`,
          label: t.id_protocolo ? `${t.id_protocolo} — ${t.name}` : t.name,
          templateId: t.id,
          hidden: !!t.is_hidden,
        }));
    }
    const dates = new Set<string>();
    let hasNull = false;
    for (const p of data.protocols) {
      if (p.ensayo_date) dates.add(p.ensayo_date);
      else hasNull = true;
    }
    const today = todayEnsayoDate();
    dates.add(today);
    const gs: Group[] = Array.from(dates).sort((a, b) => b.localeCompare(a)).map(d => ({
      key: `date:${d}`,
      label: d === today ? t('webEnsayos.list.dateToday', { date: fmtFecha(d) }) : fmtFecha(d),
      ensayoDate: d,
    }));
    if (hasNull) gs.push({ key: 'date:__null__', label: t('webEnsayos.list.noDate'), ensayoDate: null });
    return gs;
  }, [data, mode, t]);

  const protosOf = (g: Group): Protocol[] => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const list = data.protocols.filter(p => {
      if (g.sectorId != null) { if (p.sector_id !== g.sectorId) return false; }
      else if (g.templateId != null) { if (p.template_id !== g.templateId) return false; }
      else if (g.ensayoDate !== undefined) {
        if (g.ensayoDate === null ? !!p.ensayo_date : p.ensayo_date !== g.ensayoDate) return false;
      } else return false;
      // Filtros cruzados
      if (filterFrom != null || filterTo != null) {
        if (!p.ensayo_date) return false;
        if (filterFrom != null && p.ensayo_date < filterFrom) return false;
        if (filterTo != null && p.ensayo_date > filterTo) return false;
      }
      if (filterTemplateIds.size > 0 && !filterTemplateIds.has(p.template_id ?? '')) return false;
      if (filterSectorIds.size > 0 && !filterSectorIds.has(p.sector_id ?? '')) return false;
      // Buscador
      if (q) {
        const hay = `${p.protocol_code ?? ''} ${p.protocol_number ?? ''} ${p.location_reference ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // v62 — Orden configurable. Default: creación ascendente (antiguos arriba). Desempate estable
    // por creación. El "último creado" queda al final en el default.
    return list.sort((a, b) => {
      let cmp: number;
      if (sortBy === 'ensayo') cmp = (a.ensayo_date ?? '').localeCompare(b.ensayo_date ?? '');
      else if (sortBy === 'code') cmp = (a.protocol_code ?? '').localeCompare(b.protocol_code ?? '');
      else cmp = createdMs(a) - createdMs(b);
      if (cmp === 0) cmp = createdMs(a) - createdMs(b);
      return sortAsc ? cmp : -cmp;
    });
  };

  const toggle = (key: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const openProtocol = (p: Protocol) => {
    const status = p.status ?? 'DRAFT';
    const canFill = status === 'DRAFT' || status === 'IN_PROGRESS' || status === 'REJECTED';
    if (isJefe && !canFill) router.push(`/app/projects/${projectId}/protocols/${p.id}/audit`);
    else router.push(`/app/projects/${projectId}/protocols/${p.id}/fill`);
  };

  const openAddModal = (g: Group) => {
    setError(null);
    setModalGroup(g);
    // En modos sector/fecha se elige el tipo en el modal → primer tipo NO oculto.
    const firstCreatable = data?.templates.find(t => !t.is_hidden);
    setSelTemplateId(g.templateId ?? (firstCreatable?.id ?? ''));
    setCountText('1');
    setFechaText(g.ensayoDate ?? todayEnsayoDate());
    setHoraText(nowHHMM());
    setHoraTouched(false);
  };

  const handleCreate = async () => {
    if (!modalGroup || !data) return;
    setError(null);
    const template = data.templates.find(t => t.id === (modalGroup.templateId ?? selTemplateId));
    if (!template) { setError(t('webEnsayos.list.errChooseType')); return; }
    if (template.is_hidden) { setError(t('webEnsayos.list.errHiddenType')); return; }
    const count = Math.max(1, Math.min(50, parseInt(countText, 10) || 1));
    const fecha = fechaText.trim();
    if (!parseEnsayoDate(fecha)) { setError(t('webEnsayos.list.errInvalidDate')); return; }
    // v32 — hora de inicio: si no la tocó, la del sistema AL GUARDAR.
    const hora = horaTouched && /^\d{2}:\d{2}$/.test(horaText.trim()) ? horaText.trim() : nowHHMM();
    try {
      const { codes, warnings } = await createEnsayos.mutateAsync({
        templateId: template.id,
        templateName: template.name,
        templateIdProtocolo: template.id_protocolo,
        count,
        locationId: null,
        sectorId: modalGroup.sectorId ?? null,
        sectorName: modalGroup.sectorName ?? null,
        ensayoDate: fecha,
        ensayoTime: hora,
      });
      setModalGroup(null);
      setExpanded(prev => new Set(prev).add(modalGroup.key));
      const assigned = codes.filter(Boolean);
      if (warnings.length > 0) alert(t('webEnsayos.list.createdWithWarnings', { warnings: warnings.join('\n') }));
      else if (assigned.length > 0) alert(t('webEnsayos.list.createdOk', { n: count, codes: `${assigned[0]}${assigned.length > 1 ? ` … ${assigned[assigned.length - 1]}` : ''}` }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // ── Filtros visibles según el modo ─────────────────────────────────────────
  const showFechaFilter = mode !== 'date';
  const showTipoFilter = mode !== 'type';
  const showSectorFilter = mode !== 'sector' && (data?.sectors.length ?? 0) > 0;

  const tipoFilterLabel = filterTemplateIds.size === 0
    ? t('webEnsayos.list.typeAll')
    : filterTemplateIds.size === 1
      ? (data?.templates.find(tpl => filterTemplateIds.has(tpl.id))?.id_protocolo ?? t('webEnsayos.list.typeOne'))
      : t('webEnsayos.list.typeN', { n: filterTemplateIds.size });
  const sectorFilterLabel = filterSectorIds.size === 0
    ? t('webEnsayos.list.sectorAll')
    : filterSectorIds.size === 1
      ? (data?.sectors.find(s => filterSectorIds.has(s.id))?.name ?? t('webEnsayos.list.sectorOne'))
      : t('webEnsayos.list.sectorN', { n: filterSectorIds.size });

  // Modo modal: se muestra UN solo grupo a la vez (el elegido en el selector; por defecto el primero).
  const selectedKey = selGroupKey ?? (viewMode === 'modal' ? (groups[0]?.key ?? null) : null);
  const displayGroups = viewMode === 'modal' ? groups.filter(g => g.key === selectedKey) : groups;
  const selectedGroup = groups.find(g => g.key === selectedKey) ?? null;

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title={t(MODE_TITLES[mode])}
        subtitle={project?.name ?? ''}
        crumbs={[
          { label: t('webEnsayos.list.crumbProjects'), href: '/app/projects' },
          { label: project?.name ?? '…', href: `/app/projects/${projectId}/menu` },
          { label: t(MODE_TITLES[mode]) },
        ]}
        syncing={isLoading}
      />

      <div className="flex-1 p-4 max-w-3xl w-full mx-auto flex flex-col gap-2">
        {/* ── v32: buscador + filtros cruzados ── */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 bg-white border border-border rounded-md px-3">
            <Search size={14} className="text-textMuted shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('webEnsayos.list.searchPlaceholder')}
              className="flex-1 text-xs py-2.5 focus:outline-none"
            />
            {search !== '' && (
              <button onClick={() => setSearch('')}><X size={14} className="text-textMuted" /></button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {showFechaFilter && (
              <div className={cn(
                'flex items-center gap-1.5 border rounded-full px-3 py-1.5 bg-white',
                (filterFrom || filterTo) ? 'border-primary' : 'border-border',
              )}>
                <CalendarDays size={13} className={(filterFrom || filterTo) ? 'text-primary' : 'text-textMuted'} />
                <span className="text-[10px] font-bold text-textMuted">{t('webEnsayos.list.filterFrom')}</span>
                <input
                  type="date"
                  value={filterFrom ?? ''}
                  max={filterTo ?? undefined}
                  onChange={e => setFilterFrom(e.target.value || null)}
                  className={cn('text-[11px] font-bold bg-transparent focus:outline-none', filterFrom ? 'text-primary' : 'text-textSecondary')}
                />
                <span className="text-[10px] font-bold text-textMuted">{t('webEnsayos.list.filterTo')}</span>
                <input
                  type="date"
                  value={filterTo ?? ''}
                  min={filterFrom ?? undefined}
                  onChange={e => setFilterTo(e.target.value || null)}
                  className={cn('text-[11px] font-bold bg-transparent focus:outline-none', filterTo ? 'text-primary' : 'text-textSecondary')}
                />
                {(filterFrom || filterTo) && (
                  <button onClick={() => { setFilterFrom(null); setFilterTo(null); }}><X size={13} className="text-primary" /></button>
                )}
              </div>
            )}
            {showTipoFilter && (
              <button
                onClick={() => setShowFilterPicker('tipo')}
                className={cn(
                  'flex items-center gap-1.5 border rounded-full px-3 py-1.5 bg-white text-[11px] font-bold transition hover:border-primary/60',
                  filterTemplateIds.size > 0 ? 'border-primary text-primary' : 'border-border text-textSecondary',
                )}
              >
                <FlaskConical size={13} />
                {tipoFilterLabel}
                {filterTemplateIds.size > 0 && (
                  <X size={13} onClick={e => { e.stopPropagation(); setFilterTemplateIds(new Set()); }} />
                )}
              </button>
            )}
            {showSectorFilter && (
              <button
                onClick={() => setShowFilterPicker('sector')}
                className={cn(
                  'flex items-center gap-1.5 border rounded-full px-3 py-1.5 bg-white text-[11px] font-bold transition hover:border-primary/60',
                  filterSectorIds.size > 0 ? 'border-primary text-primary' : 'border-border text-textSecondary',
                )}
              >
                <Grid3x3 size={13} />
                {sectorFilterLabel}
                {filterSectorIds.size > 0 && (
                  <X size={13} onClick={e => { e.stopPropagation(); setFilterSectorIds(new Set()); }} />
                )}
              </button>
            )}
            {/* v62 — Orden de la lista. */}
            <div className="flex items-center gap-1 ml-auto">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as 'creation' | 'ensayo' | 'code')}
                title="Ordenar por"
                className="border border-border rounded-full px-2.5 py-1.5 bg-white text-[11px] font-bold text-textSecondary focus:outline-none focus:border-primary"
              >
                <option value="creation">Orden: Creación</option>
                <option value="ensayo">Orden: Fecha ensayo</option>
                <option value="code">Orden: Código</option>
              </select>
              <button
                onClick={() => setSortAsc(v => !v)}
                title={sortAsc ? 'Ascendente' : 'Descendente'}
                className="flex items-center border border-border rounded-full px-2.5 py-1.5 bg-white text-[11px] font-bold text-textSecondary hover:border-primary/60 transition"
              >
                {sortAsc ? '↑' : '↓'}
              </button>
            </div>
            {/* Tuerca: modo de visualización (config por proyecto, se guarda una vez para todos). */}
            <button onClick={() => setShowViewCfg(true)} title="Modo de visualización"
              className="flex items-center gap-1.5 border border-border rounded-full px-3 py-1.5 bg-white text-[11px] font-bold text-textSecondary hover:border-primary/60 transition">
              <Settings size={13} /> {viewMode === 'modal' ? 'Selector' : 'Tarjetas'}
            </button>
          </div>
        </div>

        {/* v63 — Restablecer numeración (modo B / código flexible). */}
        {flags?.deletion_mode === 'in_list_reassignable' && canDeleteEnsayo && (
          <button onClick={onRenumber} disabled={renumbering}
            className="flex items-center justify-center gap-1.5 mt-2 w-full border-[1.5px] border-primary bg-primary/5 text-primary text-xs font-extrabold rounded-lg py-2 hover:bg-primary/10 disabled:opacity-50 transition">
            {renumbering ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownUp size={14} />}
            Restablecer numeración
          </button>
        )}

        {/* Modo modal: casilla de selección → abre el picker de grupo. */}
        {viewMode === 'modal' && !isLoading && groups.length > 0 && (
          <button onClick={() => setShowGroupPicker(true)}
            className="flex items-center justify-between gap-2 w-full bg-white border-2 border-primary/40 rounded-lg px-3 py-2.5 text-sm font-bold text-textPrimary hover:border-primary transition">
            <span className="flex items-center gap-2 min-w-0">
              <MousePointerClick size={15} className="text-primary shrink-0" />
              <span className="truncate">{selectedGroup?.label ?? 'Elegí un grupo…'}</span>
            </span>
            <ChevronDown size={15} className="text-primary shrink-0" />
          </button>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
        ) : groups.length === 0 ? (
          <div className="bg-white border border-border rounded-md p-6 text-center text-sm text-textMuted">
            {mode === 'sector'
              ? t('webEnsayos.list.emptySectors')
              : t('webEnsayos.list.emptyTemplates')}
          </div>
        ) : displayGroups.map(g => {
          const items = protosOf(g);
          const isOpen = viewMode === 'modal' || expanded.has(g.key) || (filtersActive && items.length > 0);
          const approved = items.filter(p => p.status === 'APPROVED').length;
          const submitted = items.filter(p => p.status === 'SUBMITTED').length;
          return (
            <div key={g.key} className="flex flex-col">
              {/* Tarjeta BLANCA con listón navy al costado izquierdo (paridad con tarjetas del dossier). */}
              <button onClick={() => toggle(g.key)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-3.5 bg-white text-navy border-l-[3px] border-navy shadow-subtle transition hover:bg-surface',
                  isOpen ? 'rounded-t-md' : 'rounded-md',
                )}>
                {isOpen ? <ChevronDown size={15} className="text-navy" /> : <ChevronRight size={15} className="text-navy" />}
                <span className="flex-1 text-left text-sm font-extrabold truncate">{g.label}</span>
                {approved > 0 && <span className="bg-success text-white text-[10px] font-bold rounded px-1.5 py-0.5">{approved}</span>}
                {submitted > 0 && <span className="bg-secondary text-white text-[10px] font-bold rounded px-1.5 py-0.5">{submitted}</span>}
                <span className="text-[11px] text-textMuted">{items.length === 1 ? t('webEnsayos.list.countTest', { n: items.length }) : t('webEnsayos.list.countTests', { n: items.length })}</span>
              </button>

              {/* v32 — Panel desplegado: fondo plomo tipo tapiz (estilo "Planos") */}
              {isOpen && (
                <div className="flex flex-col gap-1.5 bg-[#e6eaf0] rounded-b-md px-2.5 py-2.5">
                  {isJefe && g.hidden && (
                    <p className="text-[11px] text-textMuted italic text-center py-1.5">
                      {t('webEnsayos.list.hiddenType')}
                    </p>
                  )}
                  {isJefe && !g.hidden && (
                    <button onClick={() => openAddModal(g)}
                      className="flex items-center justify-center gap-1.5 py-2 rounded border-[1.5px] border-primary bg-white text-primary text-xs font-bold hover:bg-primary/5 transition">
                      <Plus size={13} /> {t('webEnsayos.list.addTest')}
                    </button>
                  )}
                  {items.length === 0 && (
                    <p className="text-xs text-textMuted italic pl-1">
                      {filtersActive ? t('webEnsayos.list.emptyFiltered') : t('webEnsayos.list.emptyNone')}
                    </p>
                  )}
                  {items.map(p => (
                    <div key={p.id} className="flex items-stretch gap-1">
                      <button onClick={() => openProtocol(p)}
                        className="flex-1 flex items-center gap-3 border border-border bg-white rounded-md px-3 py-3 hover:border-primary/40 hover:bg-primary/5 transition text-left shadow-subtle min-w-0">
                        <div className="flex-1 flex flex-col gap-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {p.protocol_code && (
                              <span className="bg-navy text-white text-[10px] font-black rounded px-1.5 py-0.5 tracking-wide shrink-0">{p.protocol_code}</span>
                            )}
                            <span className={cn('text-[10px] font-bold rounded px-1.5 py-0.5 shrink-0', STATUS_COLORS[p.status])}>
                              {t(STATUS_LABELS[p.status])}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-textPrimary truncate">{p.protocol_number}</span>
                          <span className="text-[10px] text-textMuted truncate">
                            {p.ensayo_date ? fmtFecha(p.ensayo_date) : '—'}
                            {(p as { ensayo_time?: string | null }).ensayo_time ? `  ·  ${(p as { ensayo_time?: string | null }).ensayo_time}` : ''}
                            {p.location_reference ? `  ·  ${p.location_reference}` : ''}
                          </span>
                        </div>
                        <ChevronRight size={15} className="text-textMuted shrink-0" />
                      </button>
                      {canDeleteEnsayo && (deletionMode !== 'last_only' || deletableIds?.has(p.id)) && (
                        <button onClick={() => onDeleteEnsayo(p)} disabled={deletingId === p.id} title="Eliminar ensayo"
                          className="shrink-0 flex items-center justify-center px-2.5 border border-danger/40 bg-white text-danger rounded-md hover:bg-danger/10 disabled:opacity-50 transition">
                          {deletingId === p.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Modal selección de filtro tipo/sector ── */}
      {showFilterPicker && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4" onClick={() => setShowFilterPicker(null)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-4 flex flex-col gap-2 shadow-modal max-h-[70vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-textPrimary">
                {showFilterPicker === 'tipo' ? t('webEnsayos.list.filterByType') : t('webEnsayos.list.filterBySector')}
              </h3>
              <button onClick={() => setShowFilterPicker(null)}><X size={16} className="text-textPrimary" /></button>
            </div>
            <p className="text-[10px] text-textMuted italic">{t('webEnsayos.list.filterHint')}</p>
            <div className="overflow-y-auto flex flex-col gap-0.5">
              <button
                className="text-left text-xs italic text-textSecondary px-3 py-2.5 rounded hover:bg-surface transition"
                onClick={() => {
                  if (showFilterPicker === 'tipo') setFilterTemplateIds(new Set()); else setFilterSectorIds(new Set());
                }}
              >
                {t('webEnsayos.list.filterClearAll')}
              </button>
              {showFilterPicker === 'tipo' && (data?.templates ?? []).map(t => {
                const sel = filterTemplateIds.has(t.id);
                return (
                  <button key={t.id}
                    className={cn('flex items-center gap-2.5 text-left text-xs px-3 py-2.5 rounded hover:bg-surface transition',
                      sel && 'bg-primary/10 text-primary font-bold')}
                    onClick={() => setFilterTemplateIds(prev => toggleInSet(prev, t.id))}
                  >
                    <span className={cn('w-4 h-4 rounded border-[1.5px] flex items-center justify-center shrink-0',
                      sel ? 'bg-primary border-primary text-white' : 'border-border bg-white')}>
                      {sel && '✓'}
                    </span>
                    <span className="truncate">{t.id_protocolo ? `${t.id_protocolo} — ${t.name}` : t.name}</span>
                  </button>
                );
              })}
              {showFilterPicker === 'sector' && (data?.sectors ?? []).map(s => {
                const sel = filterSectorIds.has(s.id);
                return (
                  <button key={s.id}
                    className={cn('flex items-center gap-2.5 text-left text-xs px-3 py-2.5 rounded hover:bg-surface transition',
                      sel && 'bg-primary/10 text-primary font-bold')}
                    onClick={() => setFilterSectorIds(prev => toggleInSet(prev, s.id))}
                  >
                    <span className={cn('w-4 h-4 rounded border-[1.5px] flex items-center justify-center shrink-0',
                      sel ? 'bg-primary border-primary text-white' : 'border-border bg-white')}>
                      {sel && '✓'}
                    </span>
                    <span className="truncate">{s.name}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setShowFilterPicker(null)}
              className="mt-1 py-2 rounded bg-primary text-white text-xs font-bold hover:bg-primary/90 transition">
              {t('webEnsayos.list.apply')}
            </button>
          </div>
        </div>
      )}

      {/* ── Modal Adicionar ensayo ── */}
      {modalGroup && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4" onClick={() => setModalGroup(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-4 flex flex-col gap-3 shadow-modal" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <FlaskConical size={15} className="text-primary" />
              <h3 className="text-sm font-extrabold text-textPrimary">{t('webEnsayos.list.addTestForGroup', { group: modalGroup.label })}</h3>
            </div>

            {mode !== 'type' && (
              <div>
                <label className="text-xs font-bold text-textSecondary">{t('webEnsayos.list.fieldType')}</label>
                <select value={selTemplateId} onChange={e => setSelTemplateId(e.target.value)}
                  className="mt-1 w-full text-xs border border-border rounded px-2 py-2 bg-white focus:outline-none focus:border-primary">
                  {(data?.templates ?? []).filter(t => !t.is_hidden).map(t => (
                    <option key={t.id} value={t.id}>{t.id_protocolo ? `${t.id_protocolo} — ${t.name}` : t.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-3">
              <div className="w-20">
                <label className="text-xs font-bold text-textSecondary">{t('webEnsayos.list.fieldCount')}</label>
                <input type="number" min={1} max={50} value={countText} onChange={e => setCountText(e.target.value)}
                  className="mt-1 w-full text-xs border border-border rounded px-2 py-2 focus:outline-none focus:border-primary" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-textSecondary">{t('webEnsayos.list.fieldDate')}</label>
                <input type="date" value={fechaText} onChange={e => setFechaText(e.target.value)}
                  className="mt-1 w-full text-xs border border-border rounded px-2 py-2 focus:outline-none focus:border-primary" />
              </div>
              <div className="w-24">
                <label className="text-xs font-bold text-textSecondary">{t('webEnsayos.list.fieldTime')}</label>
                <input type="time" value={horaText}
                  onChange={e => { setHoraText(e.target.value); setHoraTouched(true); }}
                  className="mt-1 w-full text-xs border border-border rounded px-2 py-2 focus:outline-none focus:border-primary" />
              </div>
            </div>
            <p className="text-[10px] text-textMuted italic -mt-1">{t('webEnsayos.list.timeHint')}</p>

            {error && <p className="text-xs text-danger">⚠ {error}</p>}

            <div className="flex gap-2 justify-end mt-1">
              <button onClick={() => setModalGroup(null)} disabled={createEnsayos.isPending}
                className="px-4 py-1.5 text-xs font-bold rounded border border-border text-textSecondary hover:bg-surface transition">
                {t('common.cancel')}
              </button>
              <button onClick={handleCreate} disabled={createEnsayos.isPending}
                className="px-4 py-1.5 text-xs font-bold rounded bg-primary text-white hover:bg-primary/90 transition flex items-center gap-1.5">
                {createEnsayos.isPending && <Loader2 size={12} className="animate-spin" />}
                {createEnsayos.isPending ? t('webEnsayos.list.creating') : t('webEnsayos.list.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Config de la tuerca: modo de visualización (se guarda para TODO el proyecto). */}
      {showViewCfg && (
        <div className="fixed inset-0 z-[60] bg-navy/50 flex items-center justify-center p-4" onClick={() => !savingView && setShowViewCfg(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-4 flex flex-col gap-3 shadow-modal" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-textPrimary flex items-center gap-2"><Settings size={15} className="text-primary" /> Modo de visualización</h3>
              {!savingView && <button onClick={() => setShowViewCfg(false)}><X size={16} className="text-textMuted" /></button>}
            </div>
            <p className="text-[11px] text-textMuted">Se guarda una vez para todo el proyecto (todos lo verán igual).</p>
            <button disabled={savingView} onClick={() => saveViewMode('cards')}
              className={cn('flex items-start gap-3 p-3 rounded-lg border text-left transition', viewMode === 'cards' ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface')}>
              <LayoutList size={18} className={cn('mt-0.5', viewMode === 'cards' ? 'text-primary' : 'text-textMuted')} />
              <span className="flex-1">
                <span className="block text-sm font-bold text-textPrimary">Tarjetas desplegables</span>
                <span className="block text-[11px] text-textMuted">Todos los grupos en pantalla; se despliegan hacia abajo (modo actual).</span>
              </span>
              {viewMode === 'cards' && <span className="text-xs font-bold text-primary">✓</span>}
            </button>
            <button disabled={savingView} onClick={() => saveViewMode('modal')}
              className={cn('flex items-start gap-3 p-3 rounded-lg border text-left transition', viewMode === 'modal' ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface')}>
              <MousePointerClick size={18} className={cn('mt-0.5', viewMode === 'modal' ? 'text-primary' : 'text-textMuted')} />
              <span className="flex-1">
                <span className="block text-sm font-bold text-textPrimary">Selector (un grupo a la vez)</span>
                <span className="block text-[11px] text-textMuted">Elegís un grupo en un selector y solo se cargan esos ensayos. Menos desorden.</span>
              </span>
              {viewMode === 'modal' && <span className="text-xs font-bold text-primary">✓</span>}
            </button>
            {savingView && <p className="text-[11px] text-textMuted flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Guardando…</p>}
          </div>
        </div>
      )}

      {/* Picker de grupo (modo selector). */}
      {showGroupPicker && (
        <div className="fixed inset-0 z-[60] bg-navy/50 flex items-center justify-center p-4" onClick={() => setShowGroupPicker(false)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-4 flex flex-col gap-2 shadow-modal max-h-[70vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-textPrimary">{t(MODE_TITLES[mode])}</h3>
              <button onClick={() => setShowGroupPicker(false)}><X size={16} className="text-textPrimary" /></button>
            </div>
            <div className="overflow-y-auto flex flex-col gap-0.5">
              {groups.map(g => (
                <button key={g.key}
                  onClick={() => { setSelGroupKey(g.key); setShowGroupPicker(false); }}
                  className={cn('flex items-center justify-between gap-2 text-left text-sm px-3 py-2.5 rounded hover:bg-surface transition',
                    g.key === selectedKey && 'bg-primary/10 text-primary font-bold')}>
                  <span className="truncate">{g.label}</span>
                  <span className="text-[11px] text-textMuted shrink-0">{protosOf(g).length}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
