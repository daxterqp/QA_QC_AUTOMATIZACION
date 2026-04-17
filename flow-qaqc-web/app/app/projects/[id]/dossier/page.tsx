'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  FileText, Loader2, CheckCircle, XCircle, Clock, ChevronRight,
} from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useProjects, useProject } from '@hooks/useProjects';
import { useDossierProtocols, type DossierProtocol } from '@hooks/useDossier';
import { useHistoricalLocations } from '@hooks/useHistorical';
import { useProjectPreload } from '@hooks/useProjectPreload';
import { useApproveProtocol, useRejectProtocol } from '@hooks/useProtocolAudit';
import { useAuth } from '@lib/auth-context';
import { cn } from '@lib/utils';
import { exportFullDossier, exportSingleProtocolPdf } from '@lib/pdfGenerator';
import type { Location } from '@/types';

// ── helpers ───────────────────────────────────────────────────────────────────

function formatDay(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-PE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function toDateKey(val: unknown): string {
  if (typeof val === 'number' && val > 0) return new Date(val).toISOString().slice(0, 10);
  if (typeof val === 'string' && val.length >= 10) return val.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function statusConfig(status: string) {
  if (status === 'APPROVED')  return { label: 'Aprobado',    cls: 'bg-success text-white', icon: CheckCircle };
  if (status === 'REJECTED')  return { label: 'Rechazado',   cls: 'bg-danger text-white',  icon: XCircle    };
  if (status === 'SUBMITTED') return { label: 'En revisión', cls: 'bg-primary text-white', icon: Clock      };
  return                              { label: status,        cls: 'bg-gray-400 text-white', icon: Clock      };
}

// ── Protocol card ─────────────────────────────────────────────────────────────

function ProtocolCard({
  protocol, projectId, projectName, logoS3Key, locMap, userMap, isJefe, onAction,
}: {
  protocol: DossierProtocol;
  projectId: string;
  projectName: string;
  logoS3Key: string | null;
  locMap: Record<string, Location>;
  userMap: Record<string, string>;
  isJefe: boolean;
  onAction: () => void;
}) {
  const router = useRouter();
  const [exportingThis, setExportingThis] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const approveProtocol = useApproveProtocol(protocol.id);
  const rejectProtocol  = useRejectProtocol(protocol.id);

  const { currentUser } = useAuth();
  const cfg = statusConfig(protocol.status);
  const isPending = protocol.status === 'SUBMITTED';

  const borderColor =
    protocol.status === 'APPROVED' ? 'border-l-success' :
    protocol.status === 'REJECTED' ? 'border-l-danger' :
    'border-l-primary';

  async function handleExportSingle() {
    if (!currentUser) return;
    setExportingThis(true);
    try {
      await exportSingleProtocolPdf(
        protocol.id,
        projectName,
        currentUser.name,
        currentUser.id,
        logoS3Key,
        locMap,
        userMap,
      );
    } catch (e) {
      console.error('Error exporting PDF:', e);
    } finally {
      setExportingThis(false);
    }
  }

  async function handleApprove() {
    if (!currentUser) return;
    await approveProtocol.mutateAsync(currentUser.id);
    onAction();
  }

  async function handleReject() {
    if (!rejectReason.trim()) return;
    await rejectProtocol.mutateAsync(rejectReason.trim());
    setShowRejectModal(false);
    setRejectReason('');
    onAction();
  }

  return (
    <>
      <div
        className={cn(
          'bg-white rounded-xl shadow-subtle border-l-4 px-4 py-3 flex flex-col gap-2 cursor-pointer hover:shadow-card transition-shadow',
          borderColor,
        )}
        onClick={() => router.push(
          protocol.status === 'REJECTED'
            ? `/app/projects/${projectId}/protocols/${protocol.id}/fill`
            : `/app/projects/${projectId}/protocols/${protocol.id}/audit`
        )}
      >
        {/* Top row */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-navy truncate">
            {protocol.protocol_number ?? protocol.id}
          </span>
          <div className="flex items-center gap-2">
            {/* Export single */}
            <button
              onClick={e => { e.stopPropagation(); handleExportSingle(); }}
              disabled={exportingThis}
              className="text-primary hover:text-primary/70 transition-colors disabled:opacity-40"
              title="Exportar protocolo como PDF"
            >
              {exportingThis
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <FileText className="w-4 h-4" />
              }
            </button>
            {/* Status badge */}
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', cfg.cls)}>
              {cfg.label}
            </span>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-col gap-0.5">
          {protocol.location && (
            <p className="text-xs text-gray-500 truncate">Ubicación: {protocol.location.name}</p>
          )}
          {protocol.filledByName && (
            <p className="text-xs text-gray-400">Supervisor: {protocol.filledByName}</p>
          )}
          {protocol.signedByName && (
            <p className="text-xs text-gray-400">Aprobado por: {protocol.signedByName}</p>
          )}
        </div>

        {/* Quick actions for jefe on pending */}
        {isJefe && isPending && (
          <div
            className="flex gap-2 pt-1"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={handleApprove}
              disabled={approveProtocol.isPending}
              className="flex-1 py-1.5 rounded-lg border-2 border-success bg-green-50 text-success
                         text-xs font-bold hover:bg-green-100 transition-colors disabled:opacity-50"
            >
              {approveProtocol.isPending ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'Aprobar'}
            </button>
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={rejectProtocol.isPending}
              className="flex-1 py-1.5 rounded-lg border-2 border-danger bg-red-50 text-danger
                         text-xs font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              Rechazar
            </button>
          </div>
        )}
      </div>

      {/* Reject modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowRejectModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4 shadow-modal"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-danger">Motivo del rechazo</h3>
            <p className="text-sm text-gray-500">El supervisor verá este mensaje al abrir el protocolo.</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Describe el motivo del rechazo..."
              autoFocus rows={4}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm
                         text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-danger/30 focus:border-danger"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className="px-4 py-2 text-sm text-gray-600 font-semibold hover:text-gray-800">
                Cancelar
              </button>
              <button onClick={handleReject}
                disabled={!rejectReason.trim() || rejectProtocol.isPending}
                className="px-5 py-2 rounded-lg bg-danger text-white text-sm font-bold
                           disabled:opacity-50 hover:bg-red-700 transition-colors flex items-center gap-2">
                {rejectProtocol.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DossierPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { currentUser } = useAuth();
  const { data: projects = [] } = useProjects();
  const { data: protocols = [], isLoading, refetch } = useDossierProtocols(projectId);
  const { data: locations = [] } = useHistoricalLocations(projectId);
  const { data: preloaded } = useProjectPreload(projectId);

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');

  const project = projects.find(p => p.id === projectId);
  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';

  // Derived maps for PDF generation
  const locMap = useMemo(() => {
    const m: Record<string, Location> = {};
    locations.forEach(l => { m[l.id] = l; });
    return m;
  }, [locations]);

  const userMap = useMemo(() => {
    const m: Record<string, string> = {};
    protocols.forEach(p => {
      if (p.filledByName && p.filled_by_id) m[p.filled_by_id] = p.filledByName;
      if (p.signedByName && p.signed_by_id)  m[p.signed_by_id]  = p.signedByName;
    });
    return m;
  }, [protocols]);

  // Group protocols by day (desc) — APPROVED uses signed_at, others use updated_at
  const sections = useMemo(() => {
    const grouped: Record<string, DossierProtocol[]> = {};
    for (const p of protocols) {
      const pa = p as any;
      const dateField =
        p.status === 'APPROVED' && pa.signed_at ? pa.signed_at :
        p.status === 'SUBMITTED' && pa.submitted_at ? pa.submitted_at :
        p.status === 'REJECTED' && pa.updated_at ? pa.updated_at :
        pa.updated_at ?? pa.created_at;
      const day = toDateKey(dateField);
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(p);
    }
    return Object.keys(grouped)
      .sort((a, b) => b.localeCompare(a))
      .map(day => ({ title: formatDay(day), day, data: grouped[day] }));
  }, [protocols]);

  async function handleExportFull() {
    if (!currentUser || !project) return;
    setExporting(true);
    setExportProgress('Iniciando...');
    try {
      await exportFullDossier({
        projectId,
        projectName: project.name,
        projectCreatedAt: (project as any).created_at ?? null,
        signerName: `${currentUser.name} ${currentUser.apellido ?? ''}`.trim(),
        signerUserId: currentUser.id,
        logoS3Key: (project as any).logo_s3_key ?? `logos/project_${project.id}/logo.jpg`,
        protocols,
        locations,
        preloaded: preloaded ?? null,
        onProgress: setExportProgress,
      });
    } catch (e) {
      console.error('Error exporting dossier:', e);
    } finally {
      setExporting(false);
      setExportProgress('');
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <PageHeader
        title="Dosier de Protocolos"
        subtitle={project?.name}
        crumbs={[
          { label: 'Proyectos', href: '/app/projects' },
          { label: project?.name ?? '…' },
        ]}
        syncing={isLoading}
        rightContent={
          isJefe ? (
            <button
              onClick={handleExportFull}
              disabled={exporting || protocols.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25
                         text-white text-xs font-bold transition-colors disabled:opacity-40"
              title="Exportar dossier completo como PDF"
            >
              {exporting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <FileText className="w-4 h-4" />
              }
              {exporting ? exportProgress || 'Generando...' : 'Exportar PDF'}
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-5 flex flex-col gap-4">

        {isLoading && (
          <div className="flex flex-col gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-card p-4 flex flex-col gap-3 animate-pulse">
                <div className="flex gap-3 items-start">
                  <div className="w-2 h-16 rounded bg-gray-200" />
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                    <div className="h-3 bg-gray-100 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && protocols.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <FileText className="w-12 h-12 text-gray-200" />
            <p className="text-sm font-semibold text-gray-500">Sin protocolos enviados aún</p>
            <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
              Los protocolos aparecerán aquí cuando un supervisor los envíe a revisión.
            </p>
          </div>
        )}

        {sections.map(section => (
          <div key={section.day} className="flex flex-col gap-2">
            {/* Day header */}
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-bold text-gray-600 capitalize">{section.title}</p>
              <span className="text-[10px] text-gray-400 font-medium">
                {section.data.length} protocolo{section.data.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Protocol cards */}
            {section.data.map(protocol => (
              <ProtocolCard
                key={protocol.id}
                protocol={protocol}
                projectId={projectId}
                projectName={project?.name ?? ''}
                logoS3Key={(project as any)?.logo_s3_key ?? `logos/project_${projectId}/logo.jpg`}
                locMap={locMap}
                userMap={userMap}
                isJefe={isJefe}
                onAction={() => refetch()}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Export progress overlay */}
      {exporting && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-navy text-white
                        px-5 py-3 rounded-full shadow-modal flex items-center gap-2 text-sm font-semibold">
          <Loader2 className="w-4 h-4 animate-spin" />
          {exportProgress || 'Generando PDF...'}
        </div>
      )}
    </div>
  );
}
