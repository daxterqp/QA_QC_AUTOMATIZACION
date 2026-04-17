'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronRight, Loader2, FileText, AlertCircle, Trash2 } from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useLocations, useLocationProtocols, useCreateProtocolInstance, useDeleteProtocols, type TemplateRow } from '@hooks/useLocations';
import { useProjects } from '@hooks/useProjects';
import { useAuth } from '@lib/auth-context';
import { cn } from '@lib/utils';
import type { ProtocolStatus } from '@/types';

const STATUS_COLORS: Record<ProtocolStatus, string> = {
  DRAFT:       'bg-[#d4dde8] text-[#4a5568]',
  IN_PROGRESS: 'bg-warning/20 text-warning',
  SUBMITTED:   'bg-primary/20 text-primary',
  APPROVED:    'bg-success/20 text-success',
  REJECTED:    'bg-danger/20 text-danger',
};

const STATUS_LABELS: Record<ProtocolStatus, string> = {
  DRAFT:       'Sin iniciar',
  IN_PROGRESS: 'En progreso',
  SUBMITTED:   'En revisión',
  APPROVED:    'Aprobado',
  REJECTED:    'Rechazado',
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
  const deleteProtocols = useDeleteProtocols(locationId, projectId);

  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleDelete() {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      await deleteProtocols.mutateAsync(Array.from(selected));
      setSelected(new Set());
      setDeleteMode(false);
    } catch (e) {
      console.error('[protocols/delete] error:', e);
    } finally {
      setDeleting(false);
    }
  }

  const hasInstances = rows.some(r => r.instance !== null);

  const handleOpenProtocol = async (row: TemplateRow) => {
    if (pendingTemplateId) return;  // Evitar doble tap
    let instanceId = row.instance?.id;

    if (!instanceId) {
      setPendingTemplateId(row.template.id);
      try {
        const created = await createInstance.mutateAsync({
          templateId: row.template.id,
          templateName: row.template.name,
          locationName: location?.name ?? '',
        });
        instanceId = created.id;
      } finally {
        setPendingTemplateId(null);
      }
    }

    const status = row.instance?.status ?? 'DRAFT';
    const canFill = !row.instance || status === 'DRAFT' || status === 'IN_PROGRESS' || status === 'REJECTED';

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
        rightContent={isJefe && !deleteMode ? (
          <button
            onClick={() => { setDeleteMode(true); setSelected(new Set()); }}
            disabled={!hasInstances}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25
                       text-white text-xs font-bold transition-colors disabled:opacity-40"
            title="Eliminar protocolos"
          >
            <Trash2 size={14} />
          </button>
        ) : undefined}
      />

      {/* Barra de eliminación */}
      {deleteMode && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 flex items-center justify-between">
          <span className="text-sm font-semibold text-danger">
            {selected.size > 0
              ? `${selected.size} protocolo${selected.size !== 1 ? 's' : ''} seleccionado${selected.size !== 1 ? 's' : ''}`
              : 'Selecciona protocolos a eliminar'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setDeleteMode(false); setSelected(new Set()); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100 transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={selected.size === 0 || deleting}
              className="px-3 py-1.5 rounded-lg bg-danger text-white text-xs font-bold
                         disabled:opacity-40 hover:bg-red-700 transition flex items-center gap-1.5"
            >
              {deleting && <Loader2 size={12} className="animate-spin" />}
              {deleting ? 'Eliminando...' : `Confirmar (${selected.size})`}
            </button>
          </div>
        </div>
      )}

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
              Esta ubicación no tiene protocolos vinculados.<br />
              Revisa la columna ID_Protocolos en el Excel de ubicaciones.
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
              deleteMode={deleteMode}
              isSelected={row.instance ? selected.has(row.instance.id) : false}
              onToggle={row.instance ? () => toggleSelect(row.instance!.id) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Fila de protocolo ─────────────────────────────────────────────────────────
function ProtocolRow({
  row, isJefe, onOpen, loading, disabled, deleteMode, isSelected, onToggle,
}: {
  row: TemplateRow;
  isJefe: boolean;
  onOpen: () => void;
  loading?: boolean;
  disabled?: boolean;
  deleteMode?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
}) {
  const status = row.instance?.status ?? null;
  const canFill = isJefe && (!status || status === 'DRAFT' || status === 'IN_PROGRESS' || status === 'REJECTED');
  const canSelect = deleteMode && row.instance !== null;

  const cls = cn(
    'w-full bg-white rounded-xl shadow-subtle p-4 flex items-center justify-between gap-3 text-left border transition group',
    deleteMode && isSelected ? 'ring-2 ring-danger/50 bg-red-50/30 border-danger/20' :
    deleteMode && !canSelect ? 'opacity-40 border-transparent' :
    deleteMode ? 'border-transparent hover:border-danger/20' :
    'hover:shadow-card border-transparent hover:border-primary/20 disabled:opacity-60',
  );

  return (
    <button
      onClick={deleteMode ? (canSelect ? onToggle : undefined) : onOpen}
      disabled={deleteMode ? !canSelect : disabled}
      className={cls}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {canSelect && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggle}
            className="w-4 h-4 rounded border-gray-300 text-danger focus:ring-danger/30 flex-shrink-0 mt-2.5"
            onClick={e => e.stopPropagation()}
          />
        )}
        <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <FileText size={16} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-navy font-semibold text-[14px] leading-tight group-hover:text-primary transition truncate">
            {row.template.name}
          </p>
          <p className="text-[#8896a5] text-[11px] mt-0.5">ID: {row.template.id_protocolo}</p>
          {!deleteMode && canFill && (
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
            {!deleteMode && <ChevronRight size={16} className="text-[#8896a5]" />}
          </>
        )}
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: ProtocolStatus | null }) {
  const s = status ?? 'DRAFT';
  return (
    <span className={cn(
      'text-[11px] font-bold px-2.5 py-1 rounded-md',
      STATUS_COLORS[s]
    )}>
      {STATUS_LABELS[s]}
    </span>
  );
}
