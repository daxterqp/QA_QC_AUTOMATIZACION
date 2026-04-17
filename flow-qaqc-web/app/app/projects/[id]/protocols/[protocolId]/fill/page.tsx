'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Camera, Loader2, Send, ImageIcon, Pencil,
  AlertTriangle, Lock, Trash2, ZoomIn, FileText, X,
} from 'lucide-react';
import PageHeader from '@components/PageHeader';
import {
  useProtocolFill,
  useSaveItemAnswer,
  useSaveEvidence,
  useDeleteEvidence,
  useSubmitProtocol,
  useResubmitProtocol,
  saveItemComment,
} from '@hooks/useProtocolFill';
import { useProjects } from '@hooks/useProjects';
import { useLocations } from '@hooks/useLocations';
import { usePlansByReference } from '@hooks/usePlanViewer';
import { useAuth } from '@lib/auth-context';
import { cn } from '@lib/utils';
import { applyStamp } from '@lib/stamp';
import { uploadBlobToS3, sanitizeFilename, seq, s3ProjectPrefix } from '@lib/s3-upload';
import { useS3Url } from '@hooks/useS3Url';
import type { ProtocolItem, Evidence } from '@/types';

// ── Tipos locales ─────────────────────────────────────────────────────────────

/** Estado de respuesta local de cada ítem */
interface ItemAnswer {
  isCompliant: boolean | null; // null = sin respuesta
  isNa: boolean;
  comment: string;
}

type ListRow =
  | { type: 'section'; title: string }
  | { type: 'item'; item: ProtocolItem; index: number };

export default function ProtocolFillPage() {
  const { id: projectId, protocolId } = useParams<{ id: string; protocolId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editParam = searchParams.get('edit') === 'true';
  const { currentUser } = useAuth();

  const { data: fillData, isLoading, isError } = useProtocolFill(protocolId);
  const { data: projects = [] } = useProjects();
  const { data: locations = [] } = useLocations(projectId);
  const saveAnswer = useSaveItemAnswer(protocolId);
  const saveEvidence = useSaveEvidence(protocolId);
  const deleteEvidence = useDeleteEvidence(protocolId);
  const submitProtocol = useSubmitProtocol(protocolId);
  const resubmitProtocol = useResubmitProtocol(protocolId);

  // Estado local de respuestas (optimistic UI)
  const [answers, setAnswers] = useState<Record<string, ItemAnswer>>({});
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const commentTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeItemIdRef = useRef<string | null>(null);

  const project = projects.find(p => p.id === projectId);

  // Derivar locationObj y planes ANTES de cualquier early return (Rules of Hooks)
  const locationObj = fillData?.location ?? locations.find(l => l.id === fillData?.protocol.location_id);
  const { data: refPlans = [] } = usePlansByReference(projectId, locationObj?.reference_plan);

  // Auto-edit si viene ?edit=true (desde audit page)
  useEffect(() => {
    if (!editParam || !fillData) return;
    const proto = fillData.protocol;
    const jefe = ['CREATOR', 'RESIDENT'].includes(currentUser?.role ?? '');
    if (jefe && (proto.status === 'APPROVED' || proto.status === 'SUBMITTED')) {
      setShowEditConfirm(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillData?.protocol.id]);

  // Inicializar estado local cuando cargan los datos
  useEffect(() => {
    if (!fillData) return;
    const init: Record<string, ItemAnswer> = {};
    for (const item of fillData.items) {
      init[item.id] = {
        isCompliant: item.has_answer && !item.is_na ? item.is_compliant : null,
        isNa: item.is_na ?? false,
        comment: item.comments ?? '',
      };
    }
    setAnswers(init);
  }, [fillData]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <div className="bg-navy px-6 py-4 flex items-center gap-3">
          <div className="h-5 bg-white/20 rounded w-48 animate-pulse" />
        </div>
        <div className="flex-1 p-4 flex flex-col gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 flex flex-col gap-2 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
              <div className="flex gap-2 mt-1">
                <div className="h-8 bg-gray-100 rounded-lg w-16" />
                <div className="h-8 bg-gray-100 rounded-lg w-16" />
                <div className="h-8 bg-gray-100 rounded-lg w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError || !fillData) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle size={40} className="text-warning" />
        <p className="text-navy font-bold text-base">No se pudo cargar el protocolo</p>
        <p className="text-gray-500 text-sm max-w-xs">
          Verifica tu conexión o que tengas acceso a este protocolo.
        </p>
        <button
          onClick={() => window.history.back()}
          className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold"
        >
          Volver
        </button>
      </div>
    );
  }

  const { protocol, items, evidenceMap } = fillData;

  const isJefe = ['CREATOR', 'RESIDENT'].includes(currentUser?.role ?? '');
  const canEdit = isJefe && (protocol.status === 'APPROVED' || protocol.status === 'SUBMITTED');
  const isReadOnly = canEdit ? !editing : (protocol.status === 'APPROVED' || protocol.status === 'SUBMITTED');

  const handleOpenPlans = () => {
    if (refPlans.length === 0) return;
    const locationId = locationObj?.id ?? '';
    router.push(`/app/projects/${projectId}/plans/${refPlans[0].id}?protocolId=${protocolId}&locationId=${locationId}`);
  };

  // Construir lista con cabeceras de sección intercaladas
  const listData: ListRow[] = [];
  let currentSection: string | undefined;
  let itemIndex = 0;
  for (const item of items) {
    const sec = item.section && item.section.trim() && item.section.trim().toUpperCase() !== 'NA'
      ? item.section.trim() : null;
    if (sec !== currentSection) {
      currentSection = sec ?? undefined;
      if (sec) listData.push({ type: 'section', title: sec });
    }
    listData.push({ type: 'item', item, index: itemIndex });
    itemIndex++;
  }

  // Todos respondidos cuando has_answer === true para cada uno (o en estado local)
  const allAnswered = items.every(item => {
    const a = answers[item.id];
    if (!a) return item.has_answer;
    return a.isNa || a.isCompliant !== null;
  });

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAnswer = async (itemId: string, btn: 'SI' | 'NO' | 'NA') => {
    if (isReadOnly) return;
    const prev = answers[itemId] ?? { isCompliant: null, isNa: false, comment: '' };

    // Toggle: mismo botón activo → limpiar respuesta
    const isSameBtn =
      (btn === 'SI' && prev.isCompliant === true && !prev.isNa) ||
      (btn === 'NO' && prev.isCompliant === false && !prev.isNa) ||
      (btn === 'NA' && prev.isNa);

    const next: ItemAnswer = isSameBtn
      ? { ...prev, isCompliant: null, isNa: false }
      : {
          ...prev,
          isCompliant: btn === 'SI' ? true : btn === 'NO' ? false : null,
          isNa: btn === 'NA',
        };

    setAnswers(s => ({ ...s, [itemId]: next }));
    setHasChanges(true);
    await saveAnswer.mutateAsync({
      itemId,
      isCompliant: next.isNa ? null : next.isCompliant,
      isNa: next.isNa,
    });
  };

  const handleCommentChange = (itemId: string, text: string) => {
    setAnswers(s => ({ ...s, [itemId]: { ...(s[itemId] ?? { isCompliant: null, isNa: false }), comment: text } }));
    setHasChanges(true);
    if (commentTimers.current[itemId]) clearTimeout(commentTimers.current[itemId]);
    commentTimers.current[itemId] = setTimeout(() => {
      saveItemComment(itemId, text);
    }, 600);
  };

  const handlePhotoClick = (itemId: string) => {
    activeItemIdRef.current = itemId;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeItemIdRef.current) return;
    const itemId = activeItemIdRef.current;
    e.target.value = '';

    setUploadingItemId(itemId);
    try {
      const blobUrl = URL.createObjectURL(file);

      // Resolve logo — use no-cache endpoint to always get latest
      const logoKey = project?.logo_s3_key ?? (project?.id ? `logos/project_${project.id}/logo.jpg` : null);
      const logoUrl = logoKey ? `/api/s3-image-nocache?key=${encodeURIComponent(logoKey)}` : null;

      const stampedBlob = await applyStamp({
        imageUrl: blobUrl,
        logoUrl,
        comment: project?.stamp_comment ?? null,
      });
      URL.revokeObjectURL(blobUrl);

      const projPrefix = s3ProjectPrefix(project?.name ?? projectId);
      const locSegment = locationObj ? sanitizeFilename(locationObj.name) : 'SIN_UBICACION';
      const protoSegment = sanitizeFilename(protocol.protocol_number ?? protocol.id);
      // Count ALL evidences across all items to avoid S3 key collisions
      const totalEvidences = Object.values(evidenceMap).reduce((sum, evs) => sum + evs.length, 0);
      const s3Key = `${projPrefix}/photos/${protoSegment}-${locSegment}-F${seq(totalEvidences + 1)}.jpg`;

      await uploadBlobToS3(stampedBlob, s3Key, 'image/jpeg');
      await saveEvidence.mutateAsync({ itemId, s3Key });
      setHasChanges(true);
    } catch (err) {
      console.error('Error subiendo foto:', err);
    } finally {
      setUploadingItemId(null);
    }
  };

  const handleDeleteEvidence = async (ev: Evidence) => {
    if (!confirm(`¿Eliminar esta foto? (${ev.s3_url_placeholder?.split('/').pop() ?? 'foto'})`)) return;
    await deleteEvidence.mutateAsync(ev.id);
  };

  const handleSubmit = async () => {
    if (!allAnswered || !currentUser) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitProtocol.mutateAsync(currentUser.id);
      router.push(`/app/projects/${projectId}/locations/${protocol.location_id}/protocols`);
    } catch {
      setSubmitError('No se pudo enviar el protocolo. Intenta nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title={protocol.protocol_number ?? 'Protocolo'}
        subtitle={new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        crumbs={[
          { label: 'Proyectos', href: '/app/projects' },
          { label: project?.name ?? '...', href: `/app/projects/${projectId}/locations` },
          { label: locationObj?.name ?? '...', href: `/app/projects/${projectId}/locations/${protocol.location_id}/protocols` },
        ]}
        rightContent={
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={async () => {
                  if (editing) {
                    if (hasChanges) {
                      await resubmitProtocol.mutateAsync();
                    }
                    setEditing(false);
                    setHasChanges(false);
                    router.push(`/app/projects/${projectId}/protocols/${protocolId}/audit`);
                  } else {
                    setShowEditConfirm(true);
                  }
                }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold border transition',
                  editing
                    ? 'bg-warning/20 text-warning border-warning/40 hover:bg-warning/30'
                    : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                )}
              >
                <Pencil size={12} />
                {editing ? (hasChanges ? 'Guardar cambios' : 'Dejar de editar') : 'Editar'}
              </button>
            )}
            {refPlans.length > 0 && (
              <button
                onClick={handleOpenPlans}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-white/10 text-white border border-white/20 hover:bg-white/20 transition"
              >
                <FileText size={13} />
                Planos
              </button>
            )}
          </div>
        }
      />

      {/* Banner ubicación */}
      <div className="bg-white border-b border-divider px-5 py-3">
        <p className="text-[10px] font-bold text-[#8896a5] uppercase tracking-wider">Ubicación</p>
        <p className="text-navy font-semibold text-sm mt-0.5">{locationObj?.name ?? '—'}</p>
      </div>

      {/* Banner rechazo */}
      {protocol.status === 'REJECTED' && protocol.rejection_reason && (
        <div className="bg-danger/10 border-l-4 border-danger px-5 py-3 flex gap-2">
          <AlertTriangle size={16} className="text-danger flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-danger font-bold text-xs">Protocolo rechazado</p>
            <p className="text-danger/80 text-xs mt-0.5">{protocol.rejection_reason}</p>
          </div>
        </div>
      )}

      {/* Read-only banner */}
      {isReadOnly && (
        <div className="bg-primary/10 border-l-4 border-primary px-5 py-3 flex items-center gap-2">
          <Lock size={14} className="text-primary" />
          <p className="text-primary font-semibold text-xs">
            {protocol.status === 'APPROVED'
              ? 'Protocolo aprobado y bloqueado'
              : 'En revisión por el Jefe de Calidad'}
          </p>
        </div>
      )}

      {/* Lista de ítems */}
      <div className="flex-1 px-4 py-3 flex flex-col gap-3 pb-6">
        {listData.map((row, ri) => {
          if (row.type === 'section') {
            return (
              <div key={`sec-${row.title}-${ri}`} className="mt-2 first:mt-0">
                <div className="bg-primary/10 border-l-4 border-primary rounded-md px-3 py-2">
                  <p className="text-primary font-bold text-xs uppercase tracking-wider">{row.title}</p>
                </div>
              </div>
            );
          }

          const { item, index } = row;
          const answer = answers[item.id] ?? { isCompliant: null, isNa: false, comment: item.comments ?? '' };
          const evList = evidenceMap[item.id] ?? [];
          const uploading = uploadingItemId === item.id;

          return (
            <ItemCard
              key={item.id}
              item={item}
              index={index}
              answer={answer}
              evidences={evList}
              isReadOnly={isReadOnly}
              uploading={uploading}
              onAnswer={btn => handleAnswer(item.id, btn)}
              onCommentChange={t => handleCommentChange(item.id, t)}
              onPhotoClick={() => handlePhotoClick(item.id)}
              onDeleteEvidence={handleDeleteEvidence}
              onOpenLightbox={url => setLightbox(url)}
            />
          );
        })}

        {/* Botón submit */}
        {!isReadOnly && (
          <div className="mt-2">
            {submitError && (
              <p className="text-danger text-xs text-center mb-2">{submitError}</p>
            )}
            <button
              onClick={handleSubmit}
              disabled={!allAnswered || submitting}
              className={cn(
                'w-full flex items-center justify-center gap-2 rounded-xl py-4 font-bold text-sm transition',
                allAnswered && !submitting
                  ? 'bg-primary text-white hover:bg-navy'
                  : 'bg-light text-[#8896a5] cursor-not-allowed'
              )}
            >
              {submitting
                ? <Loader2 size={16} className="animate-spin" />
                : <Send size={16} />
              }
              {submitting ? 'Enviando...' : 'Enviar para aprobación'}
            </button>
            {!allAnswered && (
              <p className="text-center text-[11px] text-[#8896a5] mt-2">
                Responde Sí, No o N/A en todos los ítems para poder enviar.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Input file oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Modal confirmación de edición */}
      {showEditConfirm && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4 shadow-modal" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-warning/15 flex items-center justify-center flex-shrink-0">
                <Pencil size={18} className="text-warning" />
              </div>
              <div>
                <p className="text-navy font-bold text-sm">Modo edición</p>
                <p className="text-gray-500 text-xs mt-0.5">Los cambios realizados pasarán por la revisión del jefe antes de ser aprobados.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowEditConfirm(false)}
                className="flex-1 border border-border rounded-lg py-2.5 text-sm font-semibold text-gray-500 hover:bg-surface transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setShowEditConfirm(false); setEditing(true); }}
                className="flex-1 bg-primary text-white rounded-lg py-2.5 text-sm font-bold hover:bg-navy transition"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Foto evidencia"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white bg-black/40 rounded-full p-2"
            onClick={() => setLightbox(null)}
          >
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tarjeta de ítem ───────────────────────────────────────────────────────────

function ItemCard({
  item, index, answer, evidences, isReadOnly, uploading,
  onAnswer, onCommentChange, onPhotoClick, onDeleteEvidence, onOpenLightbox,
}: {
  item: ProtocolItem;
  index: number;
  answer: { isCompliant: boolean | null; isNa: boolean; comment: string };
  evidences: Evidence[];
  isReadOnly: boolean;
  uploading: boolean;
  onAnswer: (btn: 'SI' | 'NO' | 'NA') => void;
  onCommentChange: (t: string) => void;
  onPhotoClick: () => void;
  onDeleteEvidence: (ev: Evidence) => void;
  onOpenLightbox: (url: string) => void;
}) {
  const siActive = answer.isCompliant === true && !answer.isNa;
  const noActive = answer.isCompliant === false && !answer.isNa;
  const naActive = answer.isNa;

  return (
    <div className="bg-white rounded-xl shadow-subtle overflow-hidden">
      <div className="flex divide-x divide-border">

        {/* Columna 1 — Pregunta (fijo ~40%) */}
        <div className="flex items-start gap-2 px-3 py-2 w-[40%] min-w-0">
          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-navy text-xs font-semibold leading-snug">{item.item_description}</p>
            {item.validation_method && (
              <span className="inline-block mt-0.5 bg-secondary/15 text-secondary text-[9px] font-bold px-1.5 py-0.5 rounded">
                {item.validation_method}
              </span>
            )}
          </div>
        </div>

        {/* Columna 2 — Botones Sí / No / N/A (fijo) */}
        <div className="px-4 py-2 flex items-center justify-center w-[130px] flex-shrink-0">
          {!isReadOnly ? (
            <div className="flex gap-1">
              <AnswerBtn label="Sí"  active={siActive} color="success" onClick={() => onAnswer('SI')} />
              <AnswerBtn label="No"  active={noActive} color="danger"  onClick={() => onAnswer('NO')} />
              <AnswerBtn label="N/A" active={naActive} color="gray"    onClick={() => onAnswer('NA')} />
            </div>
          ) : (
            <ReadOnlyBadge isCompliant={answer.isCompliant} isNa={answer.isNa} />
          )}
        </div>

        {/* Columna 3 — Observación (fijo ~25%) */}
        <div className="px-2 py-2 w-[25%]">
          <textarea
            value={answer.comment}
            onChange={e => onCommentChange(e.target.value)}
            disabled={isReadOnly}
            placeholder="Observación"
            rows={1}
            className="w-full text-xs border-0 text-navy placeholder:text-[#8896a5] focus:outline-none resize-none bg-transparent disabled:text-[#4a5568]"
          />
        </div>

        {/* Columna 4 — Fotos */}
        <PhotosCell
          evidences={evidences}
          isReadOnly={isReadOnly}
          uploading={uploading}
          onPhotoClick={onPhotoClick}
          onDeleteEvidence={onDeleteEvidence}
          onOpenLightbox={onOpenLightbox}
        />
      </div>
    </div>
  );
}

// ── Componentes pequeños ──────────────────────────────────────────────────────

function PhotosCell({
  evidences, isReadOnly, uploading, onPhotoClick, onDeleteEvidence, onOpenLightbox,
}: {
  evidences: Evidence[];
  isReadOnly: boolean;
  uploading: boolean;
  onPhotoClick: () => void;
  onDeleteEvidence: (ev: Evidence) => void;
  onOpenLightbox: (url: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const total = evidences.length;
  const maxVisible = total <= 4 ? 4 : 3;
  const hasOverflow = total > maxVisible;
  const visible = expanded ? evidences : evidences.slice(0, maxVisible);

  return (
    <>
      {/* Columna 4a — Fotos (solo si hay) */}
      {total > 0 && (
        <div className="px-2 py-2 flex-shrink-0">
          <div className={cn(
            'grid gap-1',
            expanded ? 'grid-cols-4' : 'flex flex-nowrap'
          )}>
            {visible.map(ev => (
              <EvidenceThumb
                key={ev.id}
                ev={ev}
                isReadOnly={isReadOnly}
                onDelete={() => onDeleteEvidence(ev)}
                onOpenLightbox={onOpenLightbox}
              />
            ))}
            {hasOverflow && !expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="w-10 h-10 rounded bg-primary/10 text-primary text-xs font-bold flex items-center justify-center hover:bg-primary/20 transition flex-shrink-0"
              >
                +{total - maxVisible}
              </button>
            )}
            {expanded && hasOverflow && (
              <button
                onClick={() => setExpanded(false)}
                className="w-10 h-10 rounded bg-gray-100 text-gray-500 text-sm font-bold flex items-center justify-center hover:bg-gray-200 transition"
              >
                −
              </button>
            )}
          </div>
        </div>
      )}
      {/* Columna última — Botón cámara pegado a la derecha */}
      {!isReadOnly && (
        <div className="ml-auto px-3 py-2 flex items-center flex-shrink-0 border-l border-border">
          <button
            onClick={onPhotoClick}
            disabled={uploading}
            className="w-8 h-8 rounded border border-dashed border-border text-primary flex items-center justify-center hover:border-primary hover:bg-primary/5 transition disabled:opacity-50"
            title="Agregar foto"
          >
            {uploading ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
          </button>
        </div>
      )}
    </>
  );
}

function AnswerBtn({
  label, active, color, onClick,
}: {
  label: string;
  active: boolean;
  color: 'success' | 'danger' | 'gray';
  onClick: () => void;
}) {
  const colors = {
    success: 'border-success text-success bg-success/10',
    danger:  'border-danger text-danger bg-danger/10',
    gray:    'border-warning text-warning bg-warning/10',
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-9 py-1 rounded-md border-2 text-[11px] font-bold transition text-center',
        active
          ? colors[color]
          : 'border-border bg-surface text-[#4a5568] hover:border-primary hover:text-primary'
      )}
    >
      {label}
    </button>
  );
}

// ── Thumbnail de evidencia con presigned URL ──────────────────────────────────

function EvidenceThumb({
  ev, isReadOnly, onDelete, onOpenLightbox,
}: {
  ev: Evidence;
  isReadOnly: boolean;
  onDelete: () => void;
  onOpenLightbox: (url: string) => void;
}) {
  const url = useS3Url(ev.s3_url_placeholder);

  return (
    <div className="relative group">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Evidencia"
          className="w-10 h-10 object-cover rounded border border-border cursor-pointer hover:opacity-90 transition"
          onClick={() => onOpenLightbox(url)}
        />
      ) : (
        <div className="w-10 h-10 rounded bg-surface border border-border flex items-center justify-center">
          <ImageIcon size={20} className="text-[#8896a5]" />
        </div>
      )}
      {!isReadOnly && (
        <button
          onClick={onDelete}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow"
        >
          <Trash2 size={10} />
        </button>
      )}
      {url && (
        <div
          className="absolute inset-0 rounded-lg flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition cursor-pointer"
          onClick={() => onOpenLightbox(url)}
        >
          <ZoomIn size={16} className="text-white" />
        </div>
      )}
    </div>
  );
}

function ReadOnlyBadge({ isCompliant, isNa }: { isCompliant: boolean | null; isNa: boolean }) {
  if (isNa) return <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500">N/A</span>;
  if (isCompliant === true) return <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-success/20 text-success">Sí</span>;
  if (isCompliant === false) return <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-danger/20 text-danger">No</span>;
  return <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#d4dde8] text-[#4a5568]">—</span>;
}
