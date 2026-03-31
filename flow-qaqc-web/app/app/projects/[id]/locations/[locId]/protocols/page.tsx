'use client';

import { useParams, useRouter } from 'next/navigation';
import { ChevronRight, Loader2, FileText, AlertCircle } from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useLocations, useLocationProtocols, useCreateProtocolInstance, type TemplateRow } from '@hooks/useLocations';
import { useProjects } from '@hooks/useProjects';
import { useAuth } from '@lib/auth-context';
import { cn } from '@lib/utils';
import type { ProtocolStatus } from '@/types';

const STATUS_COLORS: Record<ProtocolStatus, string> = {
  PENDING:     'bg-[#d4dde8] text-[#4a5568]',
  IN_PROGRESS: 'bg-warning/20 text-warning',
  APPROVED:    'bg-success/20 text-success',
  REJECTED:    'bg-danger/20 text-danger',
  OBSERVED:    'bg-orange-100 text-orange-700',
};

const STATUS_LABELS: Record<ProtocolStatus, string> = {
  PENDING:     'Sin iniciar',
  IN_PROGRESS: 'En progreso',
  APPROVED:    'Aprobado',
  REJECTED:    'Rechazado',
  OBSERVED:    'Observado',
};

export default function LocationProtocolsPage() {
  const { id: projectId, locId: locationId } = useParams<{ id: string; locId: string }>();
  const router = useRouter();
  const { currentUser } = useAuth();

  const { data: projects = [] } = useProjects();
  const { data: locations = [] } = useLocations(projectId);
  const { data: rows = [], isLoading } = useLocationProtocols(locationId, projectId);
  const createInstance = useCreateProtocolInstance(locationId, projectId);

  const project = projects.find(p => p.id === projectId);
  const location = locations.find(l => l.id === locationId);

  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';

  const handleOpenProtocol = async (row: TemplateRow) => {
    let instanceId = row.instance?.id;

    if (!instanceId) {
      // Crear instancia desde plantilla
      const created = await createInstance.mutateAsync({
        templateId: row.template.id,
        templateName: row.template.name,
        locationName: location?.name ?? '',
      });
      instanceId = created.id;
    }

    const status = row.instance?.status ?? 'PENDING';
    const canFill = status === 'PENDING' || status === 'IN_PROGRESS' || status === 'REJECTED';

    if (isJefe && !canFill) {
      router.push(`/app/projects/${projectId}/protocols/${instanceId}/audit`);
    } else {
      router.push(`/app/projects/${projectId}/protocols/${instanceId}/fill`);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title={location?.name ?? 'Ubicación'}
        subtitle="Protocolos requeridos"
        crumbs={[
          { label: 'Proyectos', href: '/app/projects' },
          { label: project?.name ?? '...', href: `/app/projects/${projectId}/locations` },
          { label: location?.name ?? '...' },
        ]}
        syncing={isLoading}
      />

      <div className="flex-1 p-4 flex flex-col gap-2.5">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <AlertCircle size={36} className="text-[#8896a5]" />
            <p className="text-[#8896a5] text-sm text-center leading-relaxed">
              Esta ubicación no tiene protocolos vinculados.<br />
              Revisa la columna ID_Protocolos en el Excel de ubicaciones.
            </p>
          </div>
        ) : (
          rows.map((row, idx) => (
            <ProtocolRow
              key={row.template.id}
              row={row}
              isJefe={isJefe}
              onOpen={() => handleOpenProtocol(row)}
              loading={createInstance.isPending && idx === 0}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Fila de protocolo ─────────────────────────────────────────────────────────
function ProtocolRow({
  row, isJefe, onOpen, loading,
}: {
  row: TemplateRow;
  isJefe: boolean;
  onOpen: () => void;
  loading?: boolean;
}) {
  const status = row.instance?.status ?? null;
  const canFill = isJefe && (!status || status === 'PENDING' || status === 'IN_PROGRESS' || status === 'REJECTED');

  return (
    <button
      onClick={onOpen}
      disabled={loading}
      className="w-full bg-white rounded-xl shadow-subtle p-4 flex items-center justify-between gap-3 text-left hover:shadow-card border border-transparent hover:border-primary/20 transition group disabled:opacity-60"
    >
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
              Toca para rellenar ›
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
  const s = status ?? 'PENDING';
  return (
    <span className={cn(
      'text-[11px] font-bold px-2.5 py-1 rounded-md',
      STATUS_COLORS[s]
    )}>
      {STATUS_LABELS[s]}
    </span>
  );
}
