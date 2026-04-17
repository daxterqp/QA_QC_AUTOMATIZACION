'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  CheckCircle, XCircle, Loader2, ShieldCheck, ShieldX,
  AlertTriangle, Camera, ZoomIn, Pencil, Plus, Trash2, Map,
} from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useProtocolFill } from '@hooks/useProtocolFill';
import { useApproveProtocol, useRejectProtocol } from '@hooks/useProtocolAudit';
import { useAuth } from '@lib/auth-context';
import { cn } from '@lib/utils';
import { applyStamp } from '@lib/stamp';
import { uploadBlobToS3, sanitizeFilename, seq, s3ProjectPrefix } from '@lib/s3-upload';
import { usePlansByReference } from '@hooks/usePlanViewer';
import type { ProtocolItem, Evidence } from '@/types';

// ── helpers ───────────────────────────────────────────────────────────────────
function s3Url(key: string) {
  const B = process.env.NEXT_PUBLIC_AWS_BUCKET;
  const R = process.env.NEXT_PUBLIC_AWS_REGION;
  return `https://${B}.s3.${R}.amazonaws.com/${key}`;
}

function evidenceUrl(ev: Evidence): string | null {
  if (ev.s3_url_placeholder) return `/api/s3-image?key=${encodeURIComponent(ev.s3_url_placeholder)}`;
  return null;
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    DRAFT: 'Borrador', IN_PROGRESS: 'En progreso', SUBMITTED: 'En revisión',
    APPROVED: 'Aprobado', REJECTED: 'Rechazado',
  };
  return map[status] ?? status;
}

function statusClasses(status: string) {
  const map: Record<string, string> = {
    DRAFT: 'bg-gray-400 text-white',
    IN_PROGRESS: 'bg-warning text-white',
    SUBMITTED: 'bg-primary text-white',
    APPROVED: 'bg-success text-white',
    REJECTED: 'bg-danger text-white',
  };
  return map[status] ?? 'bg-gray-400 text-white';
}

function itemBadge(item: ProtocolItem) {
  if (item.is_na) return { label: 'N/A', cls: 'bg-gray-100 text-gray-500' };
  if (item.is_compliant === true)  return { label: 'Sí', cls: 'bg-green-100 text-green-700' };
  if (item.is_compliant === false) return { label: 'No', cls: 'bg-red-100 text-red-700' };
  return { label: '—', cls: 'bg-gray-100 text-gray-400' };
}

// ── types ─────────────────────────────────────────────────────────────────────
type SectionHeader = { type: 'section'; title: string };
type ItemRow = { type: 'item'; item: ProtocolItem; idx: number };
type Row = SectionHeader | ItemRow;

// ── main component ────────────────────────────────────────────────────────────
export default function ProtocolAuditPage() {
  const { id: projectId, protocolId } = useParams<{ id: string; protocolId: string }>();
  const router = useRouter();
  const { currentUser } = useAuth();

  const { data: fillData, isLoading } = useProtocolFill(protocolId);
  const approveProtocol = useApproveProtocol(protocolId);
  const rejectProtocol = useRejectProtocol(protocolId);
  const referencePlan = fillData?.location?.reference_plan;
  const { data: locationPlans = [] } = usePlansByReference(projectId, referencePlan);

  const [lightbox, setLightbox] = useState<string | null>(null);
  // approve modal
  const [showApproveModal, setShowApproveModal] = useState(false);
  // reject modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  const [uploadingExtra, setUploadingExtra] = useState(false);
  const extraFileRef = useRef<HTMLInputElement>(null);

  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';

  // Load extra photos from S3
  useEffect(() => {
    if (!fillData) return;
    const { protocol, location, project } = fillData;
    if (!project) return;
    const prefix = `${s3ProjectPrefix(project.name)}/photos/`;
    const protoSeg = sanitizeFilename(protocol.protocol_number ?? protocol.id);
    const locSeg = location ? sanitizeFilename(location.name) : 'SIN_UBICACION';
    const extraPrefix = `${prefix}${protoSeg}-${locSeg}-extra-`;

    fetch(`/api/s3-list?prefix=${encodeURIComponent(extraPrefix)}`)
      .then(r => r.ok ? r.json() : { keys: [] })
      .then(({ keys }) => setExtraPhotos(keys as string[]))
      .catch(() => {});
  }, [fillData]);

  async function handleExtraPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !fillData) return;
    e.target.value = '';
    setUploadingExtra(true);
    try {
      const { protocol, location, project } = fillData;
      const blobUrl = URL.createObjectURL(file);
      const logoKey = project?.logo_s3_key ?? (project?.id ? `logos/project_${project.id}/logo.jpg` : null);
      const logoUrl = logoKey ? `/api/s3-image-nocache?key=${encodeURIComponent(logoKey)}` : null;
      const stampedBlob = await applyStamp({ imageUrl: blobUrl, logoUrl, comment: project?.stamp_comment ?? null });
      URL.revokeObjectURL(blobUrl);

      const projPrefix = s3ProjectPrefix(project?.name ?? projectId);
      const locSeg = location ? sanitizeFilename(location.name) : 'SIN_UBICACION';
      const protoSeg = sanitizeFilename(protocol.protocol_number ?? protocol.id);
      const pos = extraPhotos.length + 1;
      const s3Key = `${projPrefix}/photos/${protoSeg}-${locSeg}-extra-F${seq(pos)}.jpg`;

      await uploadBlobToS3(stampedBlob, s3Key, 'image/jpeg');
      setExtraPhotos(prev => [...prev, s3Key]);
    } catch (err) {
      console.error('Error subiendo foto extra:', err);
    } finally {
      setUploadingExtra(false);
    }
  }

  async function handleDeleteExtra(s3Key: string) {
    if (!confirm('¿Eliminar esta foto extra?')) return;
    try {
      await fetch('/api/s3-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: s3Key }),
      });
      setExtraPhotos(prev => prev.filter(k => k !== s3Key));
    } catch (err) {
      console.error('Error eliminando foto extra:', err);
    }
  }

  // ── guard: loading ───────────────────────────────────────────────────────
  if (isLoading || !fillData) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-surface">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const { protocol, items, evidenceMap, location } = fillData;
  const p = protocol as any;
  const status: string = p.status ?? 'DRAFT';

  // Summary counts
  const okCount   = items.filter(i => !i.is_na && i.is_compliant === true).length;
  const nokCount  = items.filter(i => !i.is_na && i.is_compliant === false).length;
  const naCount   = items.filter(i => i.is_na).length;
  const pendCount = items.filter(i => !i.has_answer).length;

  // canApprove: todos respondidos y ninguno es No
  const canApprove =
    items.length > 0 &&
    items.every(i => i.has_answer) &&
    nokCount === 0;

  // Build section-interleaved rows
  const rows: Row[] = [];
  let lastSection = '';
  items.forEach((item, idx) => {
    const section = item.section ?? '';
    if (section && section !== lastSection) {
      rows.push({ type: 'section', title: section });
      lastSection = section;
    }
    rows.push({ type: 'item', item, idx });
  });

  // ── handlers ─────────────────────────────────────────────────────────────
  async function handleApprove() {
    if (!currentUser) return;
    setSaving(true);
    setSaveError(null);
    try {
      await approveProtocol.mutateAsync(currentUser.id);
      setShowApproveModal(false);
      router.push(`/app/projects/${projectId}/locations/${protocol.location_id}/protocols`);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Error al aprobar');
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await rejectProtocol.mutateAsync(rejectReason.trim());
      setShowRejectModal(false);
      setRejectReason('');
      router.push(`/app/projects/${projectId}/locations/${protocol.location_id}/protocols`);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Error al rechazar');
    } finally {
      setSaving(false);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <PageHeader
        title={p.id_protocolo ?? p.protocol_number ?? 'Protocolo'}
        subtitle={location?.name ?? 'Sin ubicación'}
        crumbs={[
          { label: 'Protocolos', href: `/app/projects/${projectId}/locations/${p.location_id}/protocols` },
          { label: p.id_protocolo ?? 'Protocolo' },
        ]}
        rightContent={
          <div className="flex items-center gap-2">
            {locationPlans.length > 0 && (
              <button
                onClick={() => router.push(`/app/projects/${projectId}/plans/${locationPlans[0].id}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-white border border-white/20 hover:bg-white/20 transition"
              >
                <Map size={12} />
                Planos
              </button>
            )}
            {['CREATOR', 'RESIDENT'].includes(currentUser?.role ?? '') && (status === 'SUBMITTED' || status === 'APPROVED') && (
              <button
                onClick={() => router.push(`/app/projects/${projectId}/protocols/${protocolId}/fill?edit=true`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-white border border-white/20 hover:bg-white/20 transition"
              >
                <Pencil size={12} />
                Editar
              </button>
            )}
            <span className={cn('text-xs font-bold px-3 py-1 rounded-full', statusClasses(status))}>
              {statusLabel(status)}
            </span>
          </div>
        }
      />

      <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-5 flex flex-col gap-4">

        {/* ── Summary cards ─────────────────────────────────────────────── */}
        <div className="flex justify-center gap-3">
          <SummaryCard value={okCount}   label="Cumple"     color="text-success"  border="border-success" />
          <SummaryCard value={nokCount}  label="No cumple"  color="text-danger"   border="border-danger"  />
          <SummaryCard value={naCount}   label="N/A"        color="text-gray-400" border="border-gray-300" />
        </div>

        {/* ── Metadata ──────────────────────────────────────────────────── */}
        {(p.updated_at || p.signed_at) && (
          <div className="bg-white rounded-lg px-4 py-3 shadow-subtle text-xs text-gray-500 flex flex-col gap-1">
            {p.updated_at && (
              <span>Enviado: {new Date(p.updated_at).toLocaleString('es-PE')}</span>
            )}
            {p.signed_at && (
              <span>Firmado: {new Date(p.signed_at).toLocaleString('es-PE')}</span>
            )}
          </div>
        )}

        {/* ── Rejection banner ──────────────────────────────────────────── */}
        {status === 'REJECTED' && p.rejection_reason && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex gap-3 items-start">
            <AlertTriangle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-danger mb-1">Protocolo rechazado</p>
              <p className="text-xs text-red-700 leading-relaxed">{p.rejection_reason}</p>
            </div>
          </div>
        )}

        {/* ── Items list ────────────────────────────────────────────────── */}
        {rows.map((row, ri) => {
          if (row.type === 'section') {
            return (
              <div key={`sec-${ri}`}
                className="text-xs font-bold uppercase tracking-wider text-primary px-1 pt-1">
                {row.title}
              </div>
            );
          }
          const { item, idx } = row;
          const evs: Evidence[] = evidenceMap[item.id] ?? [];
          const badge = itemBadge(item);

          return (
            <div key={item.id} className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-2">
              {/* header */}
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-light text-primary text-[11px] font-bold
                                 flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <p className="flex-1 text-sm text-gray-800 leading-snug">
                  {item.item_description ?? ''}
                </p>
                <span className={cn('text-xs font-bold px-2.5 py-1 rounded-md', badge.cls)}>
                  {badge.label}
                </span>
              </div>

              {/* observations */}
              {item.comments && (
                <p className="text-xs text-gray-500 pl-9 leading-relaxed">
                  Comentario: {item.comments}
                </p>
              )}

              {/* evidence thumbnails */}
              {evs.length > 0 && (
                <div className="pl-9 flex flex-wrap gap-2 pt-1">
                  {evs.map((ev) => {
                    const url = evidenceUrl(ev);
                    if (!url) return null;
                    return (
                      <button
                        key={ev.id}
                        onClick={() => setLightbox(url)}
                        className="relative w-20 h-20 rounded-lg overflow-hidden bg-light group"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="evidencia" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100
                                        transition-opacity flex items-center justify-center">
                          <ZoomIn className="w-5 h-5 text-white" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* ── Extra photos ──────────────────────────────────────────────── */}
        {isJefe && (
          <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-700">Evidencia fotográfica extra</p>
              <button
                onClick={() => extraFileRef.current?.click()}
                disabled={uploadingExtra}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                           border border-primary/30 text-primary hover:bg-primary/5 transition disabled:opacity-50"
              >
                {uploadingExtra ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                Agregar foto
              </button>
            </div>
            {extraPhotos.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {extraPhotos.map(key => {
                  const url = `/api/s3-image?key=${encodeURIComponent(key)}`;
                  return (
                    <div key={key} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="extra"
                        className="w-20 h-20 object-cover rounded-lg border border-border cursor-pointer hover:opacity-90 transition"
                        onClick={() => setLightbox(url)}
                      />
                      <button
                        onClick={() => handleDeleteExtra(key)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger text-white rounded-full
                                   flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Sin fotos extra adjuntas.</p>
            )}
          </div>
        )}

        {/* ── Signed banner ─────────────────────────────────────────────── */}
        {status === 'APPROVED' && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex flex-col
                          items-center gap-1 text-center">
            <CheckCircle className="w-6 h-6 text-success" />
            <p className="text-sm font-bold text-success">Firmado digitalmente</p>
            {p.signed_at && (
              <p className="text-xs text-gray-500">
                {new Date(p.signed_at).toLocaleString('es-PE')}
              </p>
            )}
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {saveError && (
          <p className="text-xs text-danger text-center font-medium">{saveError}</p>
        )}

        {/* ── Action buttons — only jefe + status SUBMITTED ─────────────── */}
        {isJefe && (status === 'SUBMITTED' || status === 'IN_PROGRESS') && (
          <div className="flex gap-3 pt-2 pb-6">
            {canApprove && (
              <button
                onClick={() => setShowApproveModal(true)}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                           border-2 border-success bg-green-50 text-success font-bold text-sm
                           hover:bg-green-100 transition-colors disabled:opacity-50"
              >
                <ShieldCheck className="w-5 h-5" />
                Aprobar y Firmar
              </button>
            )}
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                         border-2 border-danger bg-red-50 text-danger font-bold text-sm
                         hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <ShieldX className="w-5 h-5" />
              Rechazar
            </button>
          </div>
        )}
      </div>

      {/* Hidden file input for extra photos */}
      <input
        ref={extraFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleExtraPhoto}
      />

      {/* ── Lightbox ──────────────────────────────────────────────────────── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="foto"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* ── Approve confirmation modal ────────────────────────────────────── */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4 shadow-modal">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-7 h-7 text-success shrink-0" />
              <div>
                <h3 className="text-base font-bold text-gray-900">Aprobar y Firmar</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  ¿Confirmas la aprobación? El protocolo quedará bloqueado para edición.
                </p>
              </div>
            </div>
            {saveError && (
              <p className="text-xs text-danger font-medium">{saveError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowApproveModal(false)}
                disabled={saving}
                className="px-4 py-2 text-sm text-gray-600 font-semibold hover:text-gray-800
                           transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleApprove}
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-success text-white text-sm font-bold
                           hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Aprobar y Firmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject modal ──────────────────────────────────────────────────── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4 shadow-modal">
            <div>
              <h3 className="text-base font-bold text-danger">Motivo del rechazo</h3>
              <p className="text-sm text-gray-500 mt-1">
                El supervisor verá este mensaje al abrir el protocolo rechazado.
              </p>
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Describe el motivo del rechazo..."
              autoFocus
              rows={4}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2
                         text-sm text-gray-800 placeholder-gray-400 resize-none
                         focus:outline-none focus:ring-2 focus:ring-danger/30 focus:border-danger"
            />
            {saveError && (
              <p className="text-xs text-danger font-medium">{saveError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                disabled={saving}
                className="px-4 py-2 text-sm text-gray-600 font-semibold hover:text-gray-800
                           transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleReject}
                disabled={saving || !rejectReason.trim()}
                className="px-5 py-2 rounded-lg bg-danger text-white text-sm font-bold
                           hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-component: summary card ───────────────────────────────────────────────
function SummaryCard({
  value, label, color, border,
}: { value: number; label: string; color: string; border: string }) {
  return (
    <div className={cn('bg-white rounded-xl shadow-subtle border-2 p-3 flex flex-col items-center gap-1 w-28', border)}>
      <span className={cn('text-2xl font-black', color)}>{value}</span>
      <span className="text-[10px] text-gray-400 font-medium text-center leading-tight">{label}</span>
    </div>
  );
}
