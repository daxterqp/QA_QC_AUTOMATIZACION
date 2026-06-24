'use client';

/**
 * Detalle de muestra (web) — datos generales + ensayos vinculados + alta de
 * ensayos POR MUESTRA. Espejo del SampleDetailScreen móvil (MVP, sin PDF/QR).
 */
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Plus, X, ChevronRight } from 'lucide-react';
import { useProjects } from '@hooks/useProjects';
import { useEnsayosData, createEnsayoInstances } from '@hooks/useEnsayos';
import { useSample } from '@hooks/useSamples';
import PageHeader from '@components/PageHeader';
import { useI18n } from '@lib/i18n';
import { cn } from '@lib/utils';
import type { ProtocolStatus } from '@/types';

// Paridad EXACTA con el móvil/ensayos (mismo hue + tinte ~10%).
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-warning/10 text-warning', IN_PROGRESS: 'bg-warning/10 text-warning',
  SUBMITTED: 'bg-primary/10 text-primary', APPROVED: 'bg-success/10 text-success', REJECTED: 'bg-danger/10 text-danger',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'sampleDetail.status.inProgress', IN_PROGRESS: 'sampleDetail.status.inProgress',
  SUBMITTED: 'sampleDetail.status.inReview', APPROVED: 'sampleDetail.status.approved', REJECTED: 'sampleDetail.status.rejected',
};
const canFill = (s: string) => s === 'DRAFT' || s === 'IN_PROGRESS' || s === 'REJECTED';

export default function SampleDetailPage() {
  const { t } = useI18n();
  const { id: projectId, sampleId } = useParams<{ id: string; sampleId: string }>();
  const qc = useQueryClient();
  const { data: projects = [] } = useProjects();
  const project = projects.find(p => p.id === projectId);
  const { data: ens } = useEnsayosData(projectId);
  const { data, isLoading } = useSample(projectId, sampleId);
  const [showAdd, setShowAdd] = useState(false);

  const sample = data?.sample ?? null;
  const protocols = data?.protocols ?? [];
  const templates = (ens?.templates ?? []).filter(tt => !tt.is_hidden);

  const fields: { label: string; value: string }[] = sample ? [
    { label: t('sampleDetail.field.code'), value: sample.sample_code },
    { label: t('sampleDetail.field.date'), value: sample.sample_date ?? '' },
    { label: t('sampleDetail.field.materialType'), value: sample.material_type ?? '' },
    { label: t('sampleDetail.field.condition'), value: sample.condition === 'ALTERADA' ? t('sampleDetail.condition.altered') : sample.condition === 'INALTERADA' ? t('sampleDetail.condition.unaltered') : '' },
    { label: t('sampleDetail.field.depthM'), value: (sample.depth_from != null || sample.depth_to != null) ? `${sample.depth_from ?? '?'} – ${sample.depth_to ?? '?'}` : '' },
  ].filter(f => f.value) : [];

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <PageHeader
        title={sample?.sample_code ?? t('sampleDetail.title')}
        subtitle={project?.name}
        crumbs={[
          { label: t('webEnsayos.menu.crumbProjects'), href: '/app/projects' },
          { label: t('samples.title'), href: `/app/projects/${projectId}/samples` },
          { label: sample?.sample_code ?? '…' },
        ]}
      />

      <div className="flex-1 p-4 max-w-3xl w-full mx-auto flex flex-col gap-4">
        {isLoading ? (
          <p className="text-sm text-textMuted text-center py-8">…</p>
        ) : !sample ? (
          <p className="text-sm text-danger text-center py-8">{t('sampleDetail.notFound')}</p>
        ) : (
          <>
            {/* Datos generales */}
            <div className="bg-white rounded-xl shadow-card border border-border p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">{t('sampleDetail.pdf.generalData')}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {fields.map(f => (
                  <div key={f.label} className="flex flex-col">
                    <span className="text-[10px] text-textMuted uppercase">{f.label}</span>
                    <span className="text-sm text-textPrimary font-semibold break-words">{f.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ensayos */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-textPrimary">{t('sampleDetail.tests', { count: protocols.length })}</h3>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-primary text-white hover:bg-primary/90 transition">
                <Plus size={14} /> {t('sampleDetail.addTest')}
              </button>
            </div>

            {protocols.length === 0 ? (
              <p className="text-sm text-textMuted text-center py-6">{t('sampleDetail.noTests')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {protocols.map(p => {
                  const status = (p.status ?? 'DRAFT') as ProtocolStatus;
                  const href = `/app/projects/${projectId}/protocols/${p.id}/${canFill(status) ? 'fill' : 'audit'}`;
                  return (
                    <Link key={p.id} href={href}
                      className="bg-white rounded-xl shadow-card border border-border p-3 flex items-center gap-3 hover:shadow-lg hover:border-primary/30 transition group">
                      <div className="w-9 h-9 rounded-lg bg-secondary/10 border border-secondary/30 flex items-center justify-center shrink-0">
                        <FlaskConical size={16} className="text-secondary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-textPrimary truncate">{p.protocol_code || p.protocol_number || p.id}</p>
                        <p className="text-[11px] text-textSecondary truncate">{[p.protocol_number, p.ensayo_date].filter(Boolean).join(' · ')}</p>
                      </div>
                      <span className={cn('text-[10px] font-bold rounded px-1.5 py-0.5 shrink-0', STATUS_COLORS[status])}>
                        {t(STATUS_LABELS[status])}
                      </span>
                      <ChevronRight size={18} className="text-textMuted group-hover:text-primary transition" />
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {showAdd && sample && (
        <AddTestModal
          templates={templates}
          onClose={() => setShowAdd(false)}
          onCreate={async (templateId, count) => {
            const tpl = templates.find(tt => tt.id === templateId);
            if (!tpl) { alert(t('sampleDetail.alert.missingTypeMsg')); return; }
            try {
              await createEnsayoInstances({
                projectId, templateId: tpl.id, templateName: tpl.name,
                templateIdProtocolo: tpl.id_protocolo ?? null,
                count, sampleId,
                sectorId: sample.sector_id, locationId: sample.location_id,
                ensayoDate: sample.sample_date,
              });
              await qc.invalidateQueries({ queryKey: ['sample', projectId, sampleId] });
              setShowAdd(false);
            } catch (e) { alert((e as Error).message || t('sampleDetail.alert.createFailed')); }
          }}
        />
      )}
    </div>
  );
}

function AddTestModal({ templates, onClose, onCreate }: {
  templates: { id: string; name: string; id_protocolo?: string | null }[];
  onClose: () => void;
  onCreate: (templateId: string, count: number) => Promise<void>;
}) {
  const { t } = useI18n();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [count, setCount] = useState('1');
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-[60] bg-navy/50 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-md p-4 flex flex-col gap-3 shadow-modal" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-textPrimary">{t('sampleDetail.modal.title')}</h3>
          {!busy && <button onClick={onClose}><X size={16} className="text-textMuted" /></button>}
        </div>
        {templates.length === 0 ? (
          <p className="text-sm text-textMuted">{t('sampleDetail.modal.noTypes')}</p>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-textSecondary">{t('sampleDetail.modal.testType')}</span>
              <select value={templateId} onChange={e => setTemplateId(e.target.value)}
                className="text-sm border border-border rounded px-2 py-2 bg-white focus:outline-none focus:border-primary">
                {templates.map(tt => <option key={tt.id} value={tt.id}>{tt.id_protocolo ? `${tt.id_protocolo} — ${tt.name}` : tt.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 w-24">
              <span className="text-xs font-bold text-textSecondary">{t('sampleDetail.modal.quantity')}</span>
              <input type="number" min={1} max={50} value={count} onChange={e => setCount(e.target.value)}
                className="text-sm border border-border rounded px-2 py-2 focus:outline-none focus:border-primary" />
            </label>
            <div className="flex justify-end gap-2 mt-1">
              <button onClick={onClose} disabled={busy} className="px-3 py-1.5 text-xs font-bold text-textSecondary hover:text-textPrimary disabled:opacity-40">{t('common.cancel')}</button>
              <button disabled={busy || !templateId}
                onClick={async () => { setBusy(true); await onCreate(templateId, Math.max(1, Math.min(50, parseInt(count, 10) || 1))); setBusy(false); }}
                className="px-4 py-1.5 text-xs font-bold rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-40">
                {busy ? t('sampleDetail.modal.creating') : t('sampleDetail.modal.create')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
