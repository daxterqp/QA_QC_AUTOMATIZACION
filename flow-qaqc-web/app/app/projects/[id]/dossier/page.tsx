'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  FileText, Loader2, ChevronRight, X as XIcon,
} from 'lucide-react';
import { useProjectSectors } from '@hooks/useFileUpload';
import PageHeader from '@components/PageHeader';
import { useProjects, useProject, useProjectFlags } from '@hooks/useProjects';
import { useDossierProtocols, type DossierProtocol } from '@hooks/useDossier';
import { useHistoricalLocations } from '@hooks/useHistorical';
import { useProjectPreload } from '@hooks/useProjectPreload';
import { useApproveProtocol, useRejectProtocol } from '@hooks/useProtocolAudit';
import { useAuth } from '@lib/auth-context';
import { useI18n } from '@lib/i18n';
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

/** Fecha representativa del protocolo (YYYY-MM-DD) para agrupar y filtrar:
 *  prioriza la fecha del ensayo; si no, la fecha de su estado. */
function protocolDayKey(p: { status: string; ensayo_date?: string | null; signed_at?: unknown; submitted_at?: unknown; updated_at?: unknown; created_at?: unknown }): string {
  const pa = p as any;
  if (pa.ensayo_date) return toDateKey(pa.ensayo_date);
  const dateField =
    p.status === 'APPROVED' && pa.signed_at ? pa.signed_at :
    p.status === 'SUBMITTED' && pa.submitted_at ? pa.submitted_at :
    p.status === 'REJECTED' && pa.updated_at ? pa.updated_at :
    pa.updated_at ?? pa.created_at;
  return toDateKey(dateField);
}

const STATUS_FILTERS: { key: string; labelKey: string; border: string; text: string }[] = [
  { key: 'APPROVED',  labelKey: 'webDossier.statusApproved', border: 'border-success', text: 'text-success' },
  { key: 'SUBMITTED', labelKey: 'webDossier.statusInReview', border: 'border-primary', text: 'text-primary' },
  { key: 'REJECTED',  labelKey: 'webDossier.statusRejected', border: 'border-danger',  text: 'text-danger' },
];

// ── Protocol card ─────────────────────────────────────────────────────────────

function ProtocolCard({
  protocol, projectId, projectName, logoS3Key, locMap, userMap, isJefe, onAction, includeQrCode, includeEquipment,
}: {
  protocol: DossierProtocol;
  projectId: string;
  projectName: string;
  logoS3Key: string | null;
  locMap: Record<string, Location>;
  userMap: Record<string, string>;
  isJefe: boolean;
  onAction: () => void;
  includeQrCode?: boolean;
  includeEquipment?: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [exportingThis, setExportingThis] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const approveProtocol = useApproveProtocol(protocol.id);
  const rejectProtocol  = useRejectProtocol(protocol.id);

  const { currentUser } = useAuth();
  const isPending = protocol.status === 'SUBMITTED';

  const borderColor =
    protocol.status === 'APPROVED' ? 'border-l-success' :
    protocol.status === 'REJECTED' ? 'border-l-danger' :
    'border-l-primary'; // en revisión = primary (igual que la tarjeta del Dossier)

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
        includeQrCode,
        includeEquipment,
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
        {/* Top row — el estado se entiende por el color del borde izquierdo y por
            "Aprobado por"; no se muestra badge (paridad con el celular). El código
            ya no se trunca: hace wrap para no cortarse en revisión. */}
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-bold text-navy break-words min-w-0 flex-1">
            {(protocol as { protocol_code?: string | null }).protocol_code ? `${(protocol as { protocol_code?: string | null }).protocol_code} · ` : ''}{protocol.protocol_number ?? protocol.id}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {/* Export single */}
            <button
              onClick={e => { e.stopPropagation(); handleExportSingle(); }}
              disabled={exportingThis}
              className="text-primary hover:text-primary/70 transition-colors disabled:opacity-40"
              title={t('webDossier.exportProtocolPdf')}
            >
              {exportingThis
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <FileText className="w-4 h-4" />
              }
            </button>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-col gap-0.5">
          {protocol.location && (
            <p className="text-xs text-gray-500 truncate">{t('webDossier.cardLocation', { name: protocol.location.name })}</p>
          )}
          {protocol.filledByName && (
            <p className="text-xs text-gray-400">{t('webDossier.cardSupervisor', { name: protocol.filledByName })}</p>
          )}
          {protocol.signedByName && (
            <p className="text-xs text-gray-400">{t('webDossier.cardApprovedBy', { name: protocol.signedByName })}</p>
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
              {approveProtocol.isPending ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : t('webDossier.approve')}
            </button>
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={rejectProtocol.isPending}
              className="flex-1 py-1.5 rounded-lg border-2 border-danger bg-red-50 text-danger
                         text-xs font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              {t('webDossier.reject')}
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
            <h3 className="text-base font-bold text-danger">{t('webDossier.rejectReasonTitle')}</h3>
            <p className="text-sm text-gray-500">{t('webDossier.rejectReasonHelp')}</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder={t('webDossier.rejectReasonPlaceholder')}
              autoFocus rows={4}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm
                         text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-danger/30 focus:border-danger"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className="px-4 py-2 text-sm text-gray-600 font-semibold hover:text-gray-800">
                {t('webDossier.cancel')}
              </button>
              <button onClick={handleReject}
                disabled={!rejectReason.trim() || rejectProtocol.isPending}
                className="px-5 py-2 rounded-lg bg-danger text-white text-sm font-bold
                           disabled:opacity-50 hover:bg-red-700 transition-colors flex items-center gap-2">
                {rejectProtocol.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('webDossier.confirmReject')}
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
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const { data: projects = [] } = useProjects();
  const { data: protocols = [], isLoading, refetch } = useDossierProtocols(projectId);
  const { data: locations = [] } = useHistoricalLocations(projectId);
  const { data: sectors = [] } = useProjectSectors(projectId);
  const { data: preloaded } = useProjectPreload(projectId);

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');

  // ── Filtros del Dossier ───────────────────────────────────────────────────
  // Dinámicos: Ubicación solo si el proyecto subió ubicaciones; Sector solo si
  // trabaja por sectores. Fecha/Estado/Tipo siempre.
  const worksByLocations = locations.length > 0;
  const worksBySectors = sectors.length > 0;
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(['APPROVED', 'SUBMITTED', 'REJECTED']));
  const [typeFilter, setTypeFilter] = useState('');     // '' = todos
  const [locFilter, setLocFilter] = useState('');       // '' = todas (location_id)
  const [sectorFilter, setSectorFilter] = useState(''); // '' = todos (sector_id)

  const toggleStatus = (k: string) => setStatusFilter(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  // Opciones de "Tipo de ensayo" (id_protocolo distinto entre los protocolos).
  const typeOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of protocols) {
      const id = (p as { template_id?: string | null }).template_id;
      if (id) m.set(id, p.templateLabel ?? id);
    }
    return Array.from(m, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [protocols]);

  const filteredProtocols = useMemo(() => protocols.filter(p => {
    if (!statusFilter.has(p.status)) return false;
    if (typeFilter && (p as { template_id?: string | null }).template_id !== typeFilter) return false;
    if (worksByLocations && locFilter && p.location_id !== locFilter) return false;
    if (worksBySectors && sectorFilter && (p as { sector_id?: string | null }).sector_id !== sectorFilter) return false;
    if (dateFrom || dateTo) {
      const day = protocolDayKey(p);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
    }
    return true;
  }), [protocols, statusFilter, typeFilter, locFilter, sectorFilter, dateFrom, dateTo, worksByLocations, worksBySectors]);

  const hasActiveFilters = !!dateFrom || !!dateTo || !!typeFilter || !!locFilter || !!sectorFilter || statusFilter.size !== 3;
  const clearFilters = () => {
    setDateFrom(''); setDateTo(''); setTypeFilter(''); setLocFilter(''); setSectorFilter('');
    setStatusFilter(new Set(['APPROVED', 'SUBMITTED', 'REJECTED']));
  };

  const project = projects.find(p => p.id === projectId);
  const { data: projectFlags } = useProjectFlags(projectId);
  const includeQrCode = true; // v29 — qr_codes deprecated, siempre activo
  const includeEquipment = !!projectFlags?.equipment_catalog;
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

  // Agrupa por día (desc) usando la fecha representativa. Opera sobre la lista
  // YA filtrada para que la vista refleje exactamente lo que se exportará.
  const sections = useMemo(() => {
    const grouped: Record<string, DossierProtocol[]> = {};
    for (const p of filteredProtocols) {
      const day = protocolDayKey(p);
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(p);
    }
    return Object.keys(grouped)
      .sort((a, b) => b.localeCompare(a))
      .map(day => ({ title: formatDay(day), day, data: grouped[day] }));
  }, [filteredProtocols]);

  async function handleExportFull() {
    if (!currentUser || !project) return;
    setExporting(true);
    setExportProgress(t('webDossier.exportStarting'));
    try {
      await exportFullDossier({
        projectId,
        projectName: project.name,
        projectCreatedAt: (project as any).created_at ?? null,
        signerName: `${currentUser.name} ${currentUser.apellido ?? ''}`.trim(),
        signerUserId: currentUser.id,
        logoS3Key: (project as any).logo_s3_key ?? `logos/project_${project.id}/logo.jpg`,
        protocols: filteredProtocols,
        locations,
        preloaded: preloaded ?? null,
        onProgress: setExportProgress,
        includeQrCodes: includeQrCode,
        includeEquipment,
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
        title={t('webDossier.dossierTitle')}
        subtitle={project?.name}
        crumbs={[
          { label: t('webDossier.crumbProjects'), href: '/app/projects' },
          { label: project?.name ?? '…' },
        ]}
        syncing={isLoading}
        rightContent={
          isJefe ? (
            <button
              onClick={handleExportFull}
              disabled={exporting || filteredProtocols.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25
                         text-white text-xs font-bold transition-colors disabled:opacity-40"
              title={t('webDossier.exportFullPdf')}
            >
              {exporting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <FileText className="w-4 h-4" />
              }
              {exporting ? exportProgress || t('webDossier.generating') : t('webDossier.exportPdf')}
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-5 flex flex-col gap-4">

        {/* ── Filtros inteligentes (dinámicos según configuración del proyecto) ── */}
        {!isLoading && protocols.length > 0 && (
          <div className="bg-white rounded-xl shadow-card border border-border p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{t('webDossier.filters')}</p>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
                  <XIcon className="w-3 h-3" /> {t('webDossier.clearFilters')}
                </button>
              )}
            </div>

            {/* Fila 1: Fecha inicial · Fecha final · Estado · Tipo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-gray-500">{t('webDossier.dateFrom')}</span>
                <input type="date" value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)}
                  className="border border-border rounded px-2 py-1.5 text-xs focus:border-primary focus:outline-none" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-gray-500">{t('webDossier.dateTo')}</span>
                <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)}
                  className="border border-border rounded px-2 py-1.5 text-xs focus:border-primary focus:outline-none" />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-gray-500">{t('webDossier.statusLabel')}</span>
                <div className="flex flex-wrap gap-1">
                  {STATUS_FILTERS.map(s => {
                    const on = statusFilter.has(s.key);
                    return (
                      <button key={s.key} onClick={() => toggleStatus(s.key)}
                        className={cn(
                          'text-[10px] font-bold rounded-full border px-2 py-1 bg-white transition',
                          on ? `${s.border} ${s.text}` : 'border-gray-200 text-gray-300',
                        )}>
                        {t(s.labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-gray-500">{t('webDossier.testType')}</span>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                  className="border border-border rounded px-2 py-1.5 text-xs bg-white focus:border-primary focus:outline-none">
                  <option value="">{t('webDossier.optionAll')}</option>
                  {typeOptions.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
            </div>

            {/* Fila 2: Ubicación (si aplica) · Sector (si aplica) */}
            {(worksByLocations || worksBySectors) && (
              <div className="grid grid-cols-2 gap-2">
                {worksByLocations && (
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold text-gray-500">{t('webDossier.location')}</span>
                    <select value={locFilter} onChange={e => setLocFilter(e.target.value)}
                      className="border border-border rounded px-2 py-1.5 text-xs bg-white focus:border-primary focus:outline-none">
                      <option value="">{t('webDossier.optionAllFem')}</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </label>
                )}
                {worksBySectors && (
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold text-gray-500">{t('webDossier.sector')}</span>
                    <select value={sectorFilter} onChange={e => setSectorFilter(e.target.value)}
                      className="border border-border rounded px-2 py-1.5 text-xs bg-white focus:border-primary focus:outline-none">
                      <option value="">{t('webDossier.optionAll')}</option>
                      {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                )}
              </div>
            )}

            {/* Conteo del resultado filtrado */}
            <p className="text-[11px] text-gray-400">
              {t('webDossier.countProtocols', { filtered: filteredProtocols.length, total: protocols.length, plural: protocols.length !== 1 ? 's' : '' })}
              {hasActiveFilters ? t('webDossier.filteredSuffix') : ''}
            </p>
          </div>
        )}

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
            <p className="text-sm font-semibold text-gray-500">{t('webDossier.emptyTitle')}</p>
            <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
              {t('webDossier.emptyDesc')}
            </p>
          </div>
        )}

        {!isLoading && protocols.length > 0 && filteredProtocols.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <FileText className="w-10 h-10 text-gray-200" />
            <p className="text-sm font-semibold text-gray-500">{t('webDossier.noMatch')}</p>
            <button onClick={clearFilters} className="text-xs font-bold text-primary hover:underline">{t('webDossier.clearFilters')}</button>
          </div>
        )}

        {sections.map(section => (
          <div key={section.day} className="flex flex-col gap-2">
            {/* Day header */}
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-bold text-gray-600 capitalize">{section.title}</p>
              <span className="text-[10px] text-gray-400 font-medium">
                {t('webDossier.protocolsCount', { n: section.data.length, plural: section.data.length !== 1 ? 's' : '' })}
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
                includeQrCode={includeQrCode}
                includeEquipment={includeEquipment}
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
          {exportProgress || t('webDossier.generatingPdf')}
        </div>
      )}
    </div>
  );
}
