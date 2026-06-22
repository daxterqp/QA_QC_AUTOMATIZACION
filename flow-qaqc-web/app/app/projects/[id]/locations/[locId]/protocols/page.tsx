'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronRight, Loader2, FileText, AlertCircle } from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useLocations, useLocationProtocols, useCreateProtocolInstance, fetchTemplateDirectives, type TemplateRow } from '@hooks/useLocations';
import { useProjects, useProjectFlags } from '@hooks/useProjects';
import { RepeatPromptModal } from '@components/parametric/RepeatPromptModal';
import type { RepeatDirective } from '@lib/parametricExpand';
import { useAuth } from '@lib/auth-context';
import { cn } from '@lib/utils';
import { useI18n } from '@lib/i18n';
import type { ProtocolStatus } from '@/types';

const STATUS_COLORS: Record<ProtocolStatus, string> = {
  DRAFT:       'bg-[#d4dde8] text-[#4a5568]',
  IN_PROGRESS: 'bg-warning/20 text-warning',
  SUBMITTED:   'bg-primary/20 text-primary',
  APPROVED:    'bg-success/20 text-success',
  REJECTED:    'bg-danger/20 text-danger',
};

const STATUS_LABEL_KEYS: Record<ProtocolStatus, string> = {
  DRAFT:       'webMisc.statusDraft',
  IN_PROGRESS: 'webMisc.statusInProgress',
  SUBMITTED:   'webMisc.statusSubmitted',
  APPROVED:    'webMisc.statusApproved',
  REJECTED:    'webMisc.statusRejected',
};

export default function LocationProtocolsPage() {
  const { id: projectId, locId: locationId } = useParams<{ id: string; locId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { currentUser } = useAuth();

  const { data: projects = [] } = useProjects();
  const { data: locations = [] } = useLocations(projectId);
  const { data: rows = [], isLoading } = useLocationProtocols(locationId, projectId);
  const createInstance = useCreateProtocolInstance(locationId, projectId);

  const project = projects.find(p => p.id === projectId);
  const location = locations.find(l => l.id === locationId);

  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';

  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  // v25 — Plantillas paramétricas: si el flag está activo y la plantilla tiene
  // directivas `repeat-[...]`, mostramos un modal pidiendo N por grupo ANTES
  // de crear la instancia. Llamamos `fetchTemplateDirectives` imperativamente
  // (no hook reactivo) para evitar races cuando el usuario hace clics rápidos
  // en diferentes plantillas.
  const { data: projectFlags } = useProjectFlags(projectId);
  const [pendingModal, setPendingModal] = useState<{ row: TemplateRow; directives: RepeatDirective[] } | null>(null);

  async function createAndNavigate(row: TemplateRow, repeatChoices?: Record<string, number>) {
    setPendingTemplateId(row.template.id);
    try {
      const { protocol: created, warnings } = await createInstance.mutateAsync({
        templateId: row.template.id,
        templateName: row.template.name,
        locationName: location?.name ?? '',
        repeatChoices,
      });
      // v25 — Si la expansión paramétrica encontró cross-offset refs no soportadas,
      // mostrar warnings ANTES de navegar para que el usuario sepa que parte del
      // protocolo tendrá celdas con error inline.
      if (warnings.length > 0) {
        alert(t('webMisc.protocolCreatedWarnings', { warnings: warnings.join('\n\n') }));
      }
      router.push(`/app/projects/${projectId}/protocols/${created.id}/fill`);
    } finally {
      setPendingTemplateId(null);
    }
  }

  const handleOpenProtocol = async (row: TemplateRow) => {
    if (pendingTemplateId) return;  // Evitar doble tap
    const instanceId = row.instance?.id;

    if (!instanceId) {
      // Plantillas paramétricas: fetch imperativo de directivas, sin race con react-query.
      if (projectFlags?.parametric_templates) {
        setPendingTemplateId(row.template.id);
        try {
          const directives = await fetchTemplateDirectives(row.template.id);
          if (directives.length > 0) {
            setPendingModal({ row, directives });
            return; // El usuario confirma en el modal → createAndNavigate(row, choices)
          }
        } catch (e) {
          console.warn('[parametric] fetchTemplateDirectives falló:', e);
        } finally {
          setPendingTemplateId(null);
        }
      }
      // Sin directivas o flag OFF → crear directo
      await createAndNavigate(row);
      return;
    }

    const status = row.instance?.status ?? 'DRAFT';
    const canFill = status === 'DRAFT' || status === 'IN_PROGRESS' || status === 'REJECTED';
    if (isJefe && !canFill) {
      router.push(`/app/projects/${projectId}/protocols/${instanceId}/audit`);
    } else {
      router.push(`/app/projects/${projectId}/protocols/${instanceId}/fill`);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title={location?.name ?? t('webMisc.locationFallback')}
        subtitle={t('webMisc.requiredProtocols')}
        crumbs={[
          { label: t('webMisc.crumbProjects'), href: '/app/projects' },
          { label: project?.name ?? '...', href: `/app/projects/${projectId}/locations` },
          { label: location?.name ?? '...' },
        ]}
        syncing={isLoading}
      />

      <div className="flex-1 p-4 flex flex-col gap-2.5">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-subtle p-4 flex items-center gap-3 animate-pulse">
              <div className="w-9 h-9 rounded-md bg-gray-200 flex-shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <div className="h-4 bg-gray-200 rounded w-2/3" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
              <div className="h-7 w-20 bg-gray-100 rounded-md" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <AlertCircle size={36} className="text-[#8896a5]" />
            <p className="text-[#8896a5] text-sm text-center leading-relaxed">
              {t('webMisc.noLinkedProtocols')}<br />
              {t('webMisc.checkProtocolColumn')}
            </p>
          </div>
        ) : (
          rows.map((row) => (
            <ProtocolRow
              key={row.template.id}
              row={row}
              isJefe={isJefe}
              onOpen={() => handleOpenProtocol(row)}
              loading={pendingTemplateId === row.template.id}
              disabled={!!pendingTemplateId}
            />
          ))
        )}
      </div>

      {/* v25 — Modal de prompt N para plantillas paramétricas */}
      {pendingModal && (
        <RepeatPromptModal
          directives={pendingModal.directives}
          onCancel={() => setPendingModal(null)}
          onConfirm={(choices) => {
            const row = pendingModal.row;
            setPendingModal(null);
            void createAndNavigate(row, choices);
          }}
        />
      )}
    </div>
  );
}

// ── Fila de protocolo ─────────────────────────────────────────────────────────
function ProtocolRow({
  row, isJefe, onOpen, loading, disabled,
}: {
  row: TemplateRow;
  isJefe: boolean;
  onOpen: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const status = row.instance?.status ?? null;
  const canFill = isJefe && (!status || status === 'DRAFT' || status === 'IN_PROGRESS' || status === 'REJECTED');

  const cls = cn(
    'w-full bg-white rounded-xl shadow-subtle p-4 flex items-center justify-between gap-3 text-left border transition group',
    'hover:shadow-card border-transparent hover:border-primary/20 disabled:opacity-60',
  );

  return (
    <button onClick={onOpen} disabled={disabled} className={cls}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <FileText size={16} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-navy font-semibold text-[14px] leading-tight group-hover:text-primary transition truncate">
            {row.template.name}
          </p>
          <p className="text-[#8896a5] text-[11px] mt-0.5">ID: {row.template.id_protocolo}</p>
          {canFill && (
            <p className="text-primary text-[11px] font-bold mt-1">
              {t('webMisc.tapToFill')}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {loading ? (
          <Loader2 size={16} className="animate-spin text-primary" />
        ) : (
          <>
            <StatusBadge status={status} />
            <ChevronRight size={16} className="text-[#8896a5]" />
          </>
        )}
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: ProtocolStatus | null }) {
  const { t } = useI18n();
  const s = status ?? 'DRAFT';
  return (
    <span className={cn(
      'text-[11px] font-bold px-2.5 py-1 rounded-md',
      STATUS_COLORS[s]
    )}>
      {t(STATUS_LABEL_KEYS[s])}
    </span>
  );
}
