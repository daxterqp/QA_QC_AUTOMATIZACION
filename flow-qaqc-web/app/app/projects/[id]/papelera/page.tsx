'use client';

/**
 * Papelera de Reciclaje (web, v43).
 *
 * Historial de respaldo SOLO LECTURA de los ensayos eliminados, ordenado por
 * fecha de eliminación (desc). Estos datos no interactúan con el resto del
 * sistema: no se recalcula nada, el código puede repetirse y no afecta métricas
 * ni Tablas Resumen. Solo sirve como respaldo por si se eliminó un ensayo por
 * error.
 */
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Trash2, ChevronDown, ChevronUp, Info, Loader2 } from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useProjects } from '@hooks/useProjects';
import { useRecycleBin, type RecycleBinEntry } from '@hooks/useRecycleBin';
import { useI18n } from '@lib/i18n';

function fmtDateTime(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function Detail({ entry }: { entry: RecycleBinEntry }) {
  const { t } = useI18n();
  const snap = entry.snapshot_json ?? {};
  const counts = [
    { label: t('webEnsayos.bin.countItems'), n: (snap.items ?? []).length },
    { label: t('webEnsayos.bin.countEvidences'), n: (snap.evidences ?? []).length },
    { label: t('webEnsayos.bin.countApprovals'), n: (snap.approvals ?? []).length },
    { label: t('webEnsayos.bin.countNonConformities'), n: (snap.non_conformities ?? []).length },
    { label: t('webEnsayos.bin.countEquipment'), n: (snap.protocol_equipment ?? []).length },
    { label: t('webEnsayos.bin.countAnnotations'), n: (snap.plan_annotations ?? []).length },
  ].filter(c => c.n > 0);
  return (
    <div className="border-t border-divider bg-surface px-4 py-3">
      {counts.length === 0 ? (
        <p className="text-xs text-muted italic">{t('webEnsayos.bin.noRecords')}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {counts.map(c => (
            <div key={c.label} className="flex items-center justify-between bg-white border border-border rounded px-2 py-1">
              <span className="text-xs text-textSecondary">{c.label}</span>
              <span className="text-xs font-bold text-textPrimary">{c.n}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted italic mt-2">{t('webEnsayos.bin.staticBackup')}</p>
    </div>
  );
}

export default function PapeleraPage() {
  const { t } = useI18n();
  const { id: projectId } = useParams<{ id: string }>();
  const { data: projects = [] } = useProjects();
  const project = projects.find(p => p.id === projectId);
  const { data: entries = [], isLoading } = useRecycleBin(projectId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const statusLabel = (s: string | null): string => {
    switch (s) {
      case 'APPROVED': return t('webEnsayos.bin.statusApproved');
      case 'SUBMITTED': return t('webEnsayos.bin.statusSubmitted');
      case 'REJECTED': return t('webEnsayos.bin.statusRejected');
      case 'DRAFT': return t('webEnsayos.bin.statusDraft');
      default: return s ?? '—';
    }
  };

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <PageHeader
        title={t('webEnsayos.bin.title')}
        subtitle={project?.name}
        crumbs={[
          { label: t('webEnsayos.bin.crumbProjects'), href: '/app/projects' },
          { label: project?.name ?? '…', href: `/app/projects/${projectId}/menu` },
          { label: t('webEnsayos.bin.crumbBin') },
        ]}
      />

      <div className="flex-1 p-4 max-w-3xl w-full mx-auto">
        <div className="flex items-start gap-2 bg-white border border-border rounded-md p-3 mb-4">
          <Info size={16} className="text-textSecondary shrink-0 mt-0.5" />
          <p className="text-xs text-textSecondary leading-relaxed">
            {t('webEnsayos.bin.infoBanner')}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted"><Loader2 className="animate-spin" /></div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted">
            <Trash2 size={40} className="opacity-40" />
            <p className="text-sm">{t('webEnsayos.bin.emptyTests')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map(e => {
              const isOpen = expanded.has(e.id);
              return (
                <div key={e.id} className="bg-white border border-border rounded-md overflow-hidden">
                  <button onClick={() => toggle(e.id)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface">
                    <div className="w-10 h-10 rounded shrink-0 flex items-center justify-center border border-border bg-surface text-textSecondary">
                      <Trash2 size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-extrabold text-textPrimary truncate">{e.protocol_code ?? e.protocol_number ?? t('webEnsayos.bin.fallbackTest')}</p>
                      <p className="text-[11px] text-textSecondary truncate">
                        {[e.template_name, e.location_name, e.sector_name].filter(Boolean).join(' · ') || '—'}
                      </p>
                      <p className="text-[10px] text-muted truncate">
                        {t('webEnsayos.bin.deletedAt', { date: fmtDateTime(e.deleted_at) })}{e.deleted_by_name ? t('webEnsayos.bin.deletedBy', { name: e.deleted_by_name }) : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[9px] font-extrabold text-textSecondary bg-surface border border-border rounded px-1.5 py-0.5">{statusLabel(e.status)}</span>
                      {isOpen ? <ChevronUp size={16} className="text-textMuted" /> : <ChevronDown size={16} className="text-textMuted" />}
                    </div>
                  </button>
                  {isOpen && <Detail entry={e} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
