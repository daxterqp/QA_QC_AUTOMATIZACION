'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Loader2, RefreshCw, AlertCircle, MessageSquare, Check, Trash2,
  ExternalLink, ChevronDown, ChevronUp, MapPin, FileText,
  User,
} from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useAuth } from '@lib/auth-context';
import { useProject } from '@hooks/useProjects';
import {
  useProjectObservations,
  useToggleObservationOk,
  useDeleteObservation,
  type ObservationRow,
} from '@hooks/useObservations';
import { cn } from '@lib/utils';
import { useI18n } from '@lib/i18n';
import { PriorityChip, PriorityPickerModal, PRIORITY_META } from '@components/priority/PriorityChip';
import { useUpdateAnnotationPriority } from '@hooks/usePlanViewer';
import type { Priority } from '@/types';

type Filter = 'all' | 'open' | 'closed';
type PriorityFilter = 'all' | Priority | 'none';

// Color del pin/borde: verde si resuelto, rojo si abierto. La prioridad va solo en el chip.
const statusColor = (isOk: boolean) => (isOk ? '#16a34a' : '#dc2626');

export default function ObservationsPage() {
  const { t } = useI18n();
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentUser } = useAuth();
  const { data: project } = useProject(projectId);
  const { data: rows = [], isLoading, isFetching, refetch } = useProjectObservations(projectId);

  const qc = useQueryClient();
  const toggleOk  = useToggleObservationOk(projectId);
  const deleteObs = useDeleteObservation(projectId);
  const updatePriority = useUpdateAnnotationPriority('__observations__');

  const [filter,         setFilter]         = useState<Filter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [expandedId,     setExpandedId]     = useState<string | null>(null);
  const [priorityPickerId, setPriorityPickerId] = useState<string | null>(null);

  const isJefe = ['CREATOR', 'RESIDENT'].includes(currentUser?.role ?? '');
  const canAnnotate = ['CREATOR', 'RESIDENT', 'INSPECTOR'].includes(currentUser?.role ?? '');

  // ── Filtrado ──────────────────────────────────────────────────────────────
  const filtered = rows.filter(r => {
    if (filter === 'open'   && r.isOk) return false;
    if (filter === 'closed' && !r.isOk) return false;
    const p = r.annotation.priority;
    if (priorityFilter === 'none' && p) return false;
    if (priorityFilter !== 'all' && priorityFilter !== 'none' && p !== priorityFilter) return false;
    return true;
  });

  const openCount   = rows.filter(r => !r.isOk).length;
  const closedCount = rows.filter(r => r.isOk).length;

  // ── Navegar al visor del plano ────────────────────────────────────────────
  const goToViewer = (row: ObservationRow) => {
    const params = new URLSearchParams();
    if (row.annotation.protocol_id) params.set('protocolId', row.annotation.protocol_id);
    router.push(`/app/projects/${projectId}/plans/${row.plan.id}?${params.toString()}`);
  };

  // ── Render card ───────────────────────────────────────────────────────────
  const renderCard = (row: ObservationRow) => {
    const color    = statusColor(row.isOk);
    const expanded = expandedId === row.annotation.id;
    const lastReply = row.comments.length > 0 ? row.comments[row.comments.length - 1] : null;

    return (
      <div
        key={row.annotation.id}
        className="bg-white rounded-xl shadow-sm overflow-hidden"
        style={{ borderLeft: `4px solid ${color}` }}
      >
        {/* ── Cabecera de la card ── */}
        <div
          className="flex items-start gap-3 px-4 pt-4 pb-3 cursor-pointer"
          onClick={() => setExpandedId(p => p === row.annotation.id ? null : row.annotation.id)}
          onContextMenu={(e) => {
            if (!(isJefe || canAnnotate) || row.isOk) return;
            e.preventDefault();
            setPriorityPickerId(row.annotation.id);
          }}
          title={isJefe || canAnnotate ? t('webEnsayos.obs.changePriorityHint') : undefined}
        >
          {/* Badge numérico */}
          <div
            className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white font-black text-sm shadow-sm"
            style={{ backgroundColor: color }}
          >
            {row.sequenceNumber}
          </div>

          {/* Metadatos */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {row.protocolNumber && (
                <span className="text-[10px] font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5">{row.protocolNumber}</span>
              )}
              {row.annotation.priority && (
                <PriorityChip value={row.annotation.priority} size="sm" />
              )}
              {(row.locationOnly ?? row.locationName) && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted">
                  <MapPin size={9} />
                  {[row.locationOnly ?? row.locationName, row.specialty].filter(Boolean).join(' · ')}
                </span>
              )}
              {row.authorName && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted">
                  <User size={9} /> {row.authorName}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted truncate mt-0.5">
              {new Date(row.annotation.created_at).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-sm font-semibold text-navy mt-1 line-clamp-2">
              {row.comment || (row.type === 'dot' ? t('webEnsayos.obs.dotNoDescription') : t('webEnsayos.obs.areaNoDescription'))}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn('text-[10px] font-bold', row.isOk ? 'text-success' : 'text-danger')}>
                {row.isOk ? t('webEnsayos.obs.resolved') : t('webEnsayos.obs.open')}
              </span>
              {row.comments.length > 0 && (
                <span className="text-[10px] text-muted flex items-center gap-0.5">
                  <MessageSquare size={9} /> {row.comments.length}
                </span>
              )}
            </div>
          </div>

          {/* Acciones rápidas */}
          <div className="flex items-center gap-1 flex-shrink-0 ml-1">
            <button
              onClick={e => { e.stopPropagation(); goToViewer(row); }}
              title={t('webEnsayos.obs.viewOnPlan')}
              className="w-8 h-8 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center transition"
            >
              <ExternalLink size={13} />
            </button>
            <div className="text-muted">{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</div>
          </div>
        </div>

        {/* ── Contenido expandido ── */}
        {expanded && (
          <div className="px-4 pb-4 flex flex-col gap-3 border-t border-border pt-3">

            {/* Hilo de comentarios */}
            {row.comments.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider">{t('webEnsayos.obs.comments')}</p>
                {row.comments.map(c => (
                  <div key={c.id} className="bg-surface rounded-lg px-3 py-2">
                    <p className="text-xs text-navy leading-relaxed">{c.content}</p>
                    <p className="text-[10px] text-muted mt-1">
                      {new Date(typeof c.created_at === 'number' ? c.created_at : c.created_at)
                        .toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Última respuesta (resumen) — solo si hay más de 1 comentario */}
            {lastReply && row.comments.length > 1 && (
              <div className="bg-gray-50 rounded-lg px-3 py-2 border border-border">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">{t('webEnsayos.obs.lastReply')}</p>
                <p className="text-xs text-navy line-clamp-2">{lastReply.content}</p>
              </div>
            )}

            {/* Botones de acción */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => goToViewer(row)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition"
              >
                <FileText size={12} /> {t('webEnsayos.obs.viewOnPlan')}
              </button>

              {(isJefe || canAnnotate) && !row.isOk && (
                <button
                  onClick={() => setPriorityPickerId(row.annotation.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted hover:text-navy hover:border-navy transition"
                  title={t('webEnsayos.obs.changePriority')}
                >
                  <AlertCircle size={12} />
                  {t('webEnsayos.obs.priority')}
                </button>
              )}

              {isJefe && (
                <button
                  onClick={() => toggleOk.mutate({ annotationId: row.annotation.id, isOk: !row.isOk, locationOnly: row.locationOnly, specialty: row.specialty })}
                  disabled={toggleOk.isPending}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-50',
                    row.isOk
                      ? 'border-muted text-muted hover:border-danger hover:text-danger'
                      : 'border-success text-success hover:bg-success/10',
                  )}
                >
                  <Check size={12} />
                  {row.isOk ? t('webEnsayos.obs.reopen') : t('webEnsayos.obs.resolve')}
                </button>
              )}

              {canAnnotate && (
                <button
                  onClick={() => {
                    if (confirm(t('webEnsayos.obs.deleteConfirm', { n: row.sequenceNumber }))) {
                      deleteObs.mutate(row.annotation.id);
                      setExpandedId(null);
                    }
                  }}
                  disabled={deleteObs.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-danger hover:bg-danger/10 transition disabled:opacity-50"
                >
                  <Trash2 size={12} /> {t('common.delete')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render principal ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title={t('webEnsayos.obs.title')}
        subtitle={project?.name}
        crumbs={[
          { label: t('webEnsayos.obs.crumbProjects'), href: '/app/projects' },
          { label: project?.name ?? '…', href: `/app/projects/${projectId}/locations` },
          { label: t('webEnsayos.obs.crumbObservations') },
        ]}
        rightContent={
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-lg border border-white/30 text-white/80 hover:text-white hover:border-white/60 transition disabled:opacity-60"
            title={t('webEnsayos.obs.refresh')}
          >
            {isFetching
              ? <Loader2 size={15} className="animate-spin" />
              : <RefreshCw size={15} />}
          </button>
        }
      />

      {/* ── Filtros (estado + prioridad, separados por divisor) ── */}
      <div className="px-4 pt-3 pb-1">
        <div className="bg-white border border-border rounded-xl shadow-sm px-3 py-2.5 flex flex-col">
          {/* Estado */}
          <div className="flex flex-wrap gap-1.5">
            {([
              { key: 'all',    label: t('webEnsayos.obs.filterAll'),    count: rows.length },
              { key: 'open',   label: t('webEnsayos.obs.filterOpen'),   count: openCount },
              { key: 'closed', label: t('webEnsayos.obs.filterClosed'), count: closedCount },
            ] as { key: Filter; label: string; count: number }[]).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold transition border',
                  filter === f.key
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white text-muted border-border hover:text-navy',
                )}
              >
                {f.label} · {f.count}
              </button>
            ))}
          </div>

          <div className="h-px bg-divider my-2.5" />

          {/* Prioridad */}
          <div className="flex flex-wrap gap-1.5">
            {([
              { key: 'all',    label: t('webEnsayos.obs.filterAll') },
              { key: 'high',   label: t(PRIORITY_META.high.labelKey),   color: PRIORITY_META.high.bg,   Icon: PRIORITY_META.high.Icon },
              { key: 'medium', label: t(PRIORITY_META.medium.labelKey), color: PRIORITY_META.medium.bg, Icon: PRIORITY_META.medium.Icon },
              { key: 'low',    label: t(PRIORITY_META.low.labelKey),    color: PRIORITY_META.low.bg,    Icon: PRIORITY_META.low.Icon },
              { key: 'none',   label: t('webEnsayos.obs.priorityNone'), color: '#6b7a8c' },
            ] as { key: PriorityFilter; label: string; color?: string; Icon?: React.ComponentType<{ size?: number }> }[]).map(opt => {
              const active = priorityFilter === opt.key;
              const Icon = opt.Icon;
              return (
                <button
                  key={opt.key}
                  onClick={() => setPriorityFilter(opt.key)}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold transition border',
                    !opt.color && !active && 'bg-white text-muted border-border hover:text-navy',
                    !opt.color && active && 'bg-navy text-white border-navy',
                  )}
                  style={opt.color ? {
                    borderColor: opt.color,
                    backgroundColor: active ? opt.color : 'white',
                    color: active ? 'white' : opt.color,
                  } : undefined}
                >
                  {Icon ? <Icon size={12} /> : null}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Lista ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-16">
            <Loader2 size={28} className="animate-spin text-primary" />
            <p className="text-muted text-sm">{t('webEnsayos.obs.loading')}</p>
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle size={36} className="text-muted opacity-30" />
            <p className="text-muted text-sm font-semibold">
              {filter === 'all' ? t('webEnsayos.obs.emptyAll') : (filter === 'open' ? t('webEnsayos.obs.emptyOpen') : t('webEnsayos.obs.emptyClosed'))}
            </p>
          </div>
        )}

        {!isLoading && filtered.map(renderCard)}
      </div>

      {/* Modal de prioridad (long-press / botón dedicado) */}
      <PriorityPickerModal
        open={!!priorityPickerId}
        value={priorityPickerId
          ? (rows.find(r => r.annotation.id === priorityPickerId)?.annotation.priority ?? null)
          : null}
        onSelect={async (p) => {
          if (!priorityPickerId) return;
          await updatePriority.mutateAsync({ annotationId: priorityPickerId, priority: p });
          qc.invalidateQueries({ queryKey: ['project-observations', projectId] });
        }}
        onClose={() => setPriorityPickerId(null)}
      />
    </div>
  );
}
