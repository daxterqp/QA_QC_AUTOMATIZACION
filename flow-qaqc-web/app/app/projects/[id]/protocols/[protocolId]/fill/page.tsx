'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Camera, Check, X, Minus, Loader2, Send, ImageIcon,
  AlertTriangle, Lock, Trash2, ZoomIn,
} from 'lucide-react';
import PageHeader from '@components/PageHeader';
import {
  useProtocolFill,
  useSaveItemAnswer,
  useSaveEvidence,
  useDeleteEvidence,
  useSubmitProtocol,
  saveItemObservation,
} from '@hooks/useProtocolFill';
import { useProjects } from '@hooks/useProjects';
import { useLocations } from '@hooks/useLocations';
import { useAuth } from '@lib/auth-context';
import { cn } from '@lib/utils';
import { applyStamp } from '@lib/stamp';
import { uploadBlobToS3, sanitizeSegment, seq, s3ProjectPrefix } from '@lib/s3-upload';
import type { ProtocolItem, Evidence } from '@/types';

// ── Tipos locales ─────────────────────────────────────────────────────────────
type ItemStatus = 'PENDING' | 'OK' | 'OBSERVED' | 'NOK';

type ListRow =
  | { type: 'section'; title: string }
  | { type: 'item'; item: ProtocolItem; index: number };

export default function ProtocolFillPage() {
  const { id: projectId, protocolId } = useParams<{ id: string; protocolId: string }>();
  const router = useRouter();
  const { currentUser } = useAuth();

  const { data: fillData, isLoading } = useProtocolFill(protocolId);
  const { data: projects = [] } = useProjects();
  const { data: locations = [] } = useLocations(projectId);
  const saveAnswer = useSaveItemAnswer(protocolId);
  const saveEvidence = useSaveEvidence(protocolId);
  const deleteEvidence = useDeleteEvidence(protocolId);
  const submitProtocol = useSubmitProtocol(protocolId);

  // Estado local de respuestas (optimistic UI)
  const [itemStatus, setItemStatus] = useState<Record<string, ItemStatus>>({});
  const [itemObs, setItemObs] = useState<Record<string, string>>({});
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const obsTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeItemIdRef = useRef<string | null>(null);

  const project = projects.find(p => p.id === projectId);
  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';

  // Inicializar estado local cuando cargan los datos
  useEffect(() => {
    if (!fillData) return;
    const st: Record<string, ItemStatus> = {};
    const ob: Record<string, string> = {};
    for (const item of fillData.items) {
      st[item.id] = item.status ?? 'PENDING';
      ob[item.id] = item.observations ?? '';
    }
    setItemStatus(st);
    setItemObs(ob);
  }, [fillData]);

  if (isLoading || !fillData) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  const { protocol, items, evidenceMap, location } = fillData;

  const isReadOnly =
    protocol.status === 'APPROVED' ||
    protocol.status === 'IN_PROGRESS';

  const locationObj = location ?? locations.find(l => l.id === protocol.location_id);

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

  const allAnswered = items.every(item => (itemStatus[item.id] ?? 'PENDING') !== 'PENDING');

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAnswer = async (itemId: string, value: ItemStatus) => {
    if (isReadOnly) return;
    // Toggle: mismo botón → vuelve a PENDING
    const current = itemStatus[itemId] ?? 'PENDING';
    const next: ItemStatus = current === value ? 'PENDING' : value;
    setItemStatus(s => ({ ...s, [itemId]: next }));
    await saveAnswer.mutateAsync({ itemId, status: next, observations: itemObs[itemId] });
  };

  const handleObsChange = (itemId: string, text: string) => {
    setItemObs(s => ({ ...s, [itemId]: text }));
    if (obsTimers.current[itemId]) clearTimeout(obsTimers.current[itemId]);
    obsTimers.current[itemId] = setTimeout(() => {
      saveItemObservation(itemId, text);
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
      // 1. Crear blob URL temporal para el canvas
      const blobUrl = URL.createObjectURL(file);

      // 2. Aplicar sello (timestamp + logo si existe)
      const logoUrl = project?.logo_s3_key
        ? `https://${process.env.NEXT_PUBLIC_AWS_BUCKET}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${project.logo_s3_key}`
        : null;

      const stampedBlob = await applyStamp({
        imageUrl: blobUrl,
        logoUrl,
        comment: project?.stamp_comment ?? null,
      });
      URL.revokeObjectURL(blobUrl);

      // 3. Calcular S3 key con la misma convención que el APK
      const projPrefix = s3ProjectPrefix(project?.name ?? projectId);
      const locSegment = locationObj ? sanitizeSegment(locationObj.name) : 'SIN_UBICACION';
      const protoSegment = sanitizeSegment(protocol.protocol_number ?? protocol.id);
      const existingCount = (evidenceMap[itemId] ?? []).length;
      const s3Key = `${projPrefix}/photos/${protoSegment}-${locSegment}-F${seq(existingCount + 1)}.jpg`;

      // 4. Subir a S3
      await uploadBlobToS3(stampedBlob, s3Key, 'image/jpeg');

      // 5. Guardar evidencia en Supabase
      await saveEvidence.mutateAsync({ itemId, s3Key });
    } catch (err) {
      console.error('Error subiendo foto:', err);
    } finally {
      setUploadingItemId(null);
    }
  };

  const handleDeleteEvidence = async (ev: Evidence) => {
    if (!confirm(`¿Eliminar esta foto? (${ev.file_name ?? 'foto'})`)) return;
    await deleteEvidence.mutateAsync(ev.id);
  };

  const handleSubmit = async () => {
    if (!allAnswered || !currentUser) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitProtocol.mutateAsync(currentUser.id);
      router.back();
    } catch (err) {
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
      />

      {/* Banner ubicación */}
      <div className="bg-white border-b border-divider px-5 py-3">
        <p className="text-[10px] font-bold text-[#8896a5] uppercase tracking-wider">Ubicación</p>
        <p className="text-navy font-semibold text-sm mt-0.5">{locationObj?.name ?? '—'}</p>
      </div>

      {/* Banner rechazo */}
      {protocol.status === 'REJECTED' && protocol.observations && (
        <div className="bg-danger/10 border-l-4 border-danger px-5 py-3 flex gap-2">
          <AlertTriangle size={16} className="text-danger flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-danger font-bold text-xs">Protocolo rechazado</p>
            <p className="text-danger/80 text-xs mt-0.5">{protocol.observations}</p>
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
                <div className="bg-primary/10 border-l-3 border-primary rounded-md px-3 py-2">
                  <p className="text-primary font-bold text-xs uppercase tracking-wider">{row.title}</p>
                </div>
              </div>
            );
          }

          const { item, index } = row;
          const status = itemStatus[item.id] ?? 'PENDING';
          const obs = itemObs[item.id] ?? '';
          const evList = evidenceMap[item.id] ?? [];
          const uploading = uploadingItemId === item.id;

          return (
            <ItemCard
              key={item.id}
              item={item}
              index={index}
              status={status}
              obs={obs}
              evidences={evList}
              isReadOnly={isReadOnly}
              uploading={uploading}
              onAnswer={v => handleAnswer(item.id, v)}
              onObsChange={t => handleObsChange(item.id, t)}
              onPhotoClick={() => handlePhotoClick(item.id)}
              onDeleteEvidence={handleDeleteEvidence}
              onOpenLightbox={url => setLightbox(url)}
              projectId={projectId}
            />
          );
        })}

        {/* Botón submit / banner read-only */}
        <div className="mt-2">
          {!isReadOnly ? (
            <>
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
                  Responde Sí, No u Observado en todos los ítems para poder enviar.
                </p>
              )}
            </>
          ) : null}
        </div>
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
  item, index, status, obs, evidences, isReadOnly, uploading,
  onAnswer, onObsChange, onPhotoClick, onDeleteEvidence, onOpenLightbox, projectId,
}: {
  item: ProtocolItem;
  index: number;
  status: ItemStatus;
  obs: string;
  evidences: Evidence[];
  isReadOnly: boolean;
  uploading: boolean;
  onAnswer: (v: ItemStatus) => void;
  onObsChange: (t: string) => void;
  onPhotoClick: () => void;
  onDeleteEvidence: (ev: Evidence) => void;
  onOpenLightbox: (url: string) => void;
  projectId: string;
}) {
  const BUCKET = process.env.NEXT_PUBLIC_AWS_BUCKET;
  const REGION = process.env.NEXT_PUBLIC_AWS_REGION;

  const getEvidenceUrl = (ev: Evidence) => {
    if (ev.s3_key) return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${ev.s3_key}`;
    if (ev.local_uri) return ev.local_uri;
    return null;
  };

  return (
    <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3">
      {/* Cabecera del ítem */}
      <div className="flex items-start gap-3">
        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-navy text-sm font-semibold leading-snug">{item.item_description}</p>
          {item.validation_method && (
            <span className="inline-block mt-1 bg-secondary/15 text-secondary text-[10px] font-bold px-2 py-0.5 rounded">
              {item.validation_method}
            </span>
          )}
        </div>
      </div>

      {/* Botones de respuesta */}
      {!isReadOnly ? (
        <div className="flex gap-2">
          <AnswerBtn
            label="Sí"
            icon={<Check size={13} />}
            active={status === 'OK'}
            activeClass="bg-success text-white border-success"
            onClick={() => onAnswer('OK')}
          />
          <AnswerBtn
            label="No"
            icon={<X size={13} />}
            active={status === 'NOK'}
            activeClass="bg-danger text-white border-danger"
            onClick={() => onAnswer('NOK')}
          />
          <AnswerBtn
            label="Obs."
            icon={<Minus size={13} />}
            active={status === 'OBSERVED'}
            activeClass="bg-warning text-white border-warning"
            onClick={() => onAnswer('OBSERVED')}
          />

          {/* Botón cámara */}
          <button
            onClick={onPhotoClick}
            disabled={uploading}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-surface text-primary text-xs font-semibold hover:border-primary hover:bg-primary/5 transition disabled:opacity-50"
          >
            {uploading
              ? <Loader2 size={13} className="animate-spin" />
              : <Camera size={13} />
            }
            {uploading ? 'Subiendo...' : 'Foto'}
          </button>
        </div>
      ) : (
        // Vista solo lectura
        <div className="flex items-center gap-2">
          <ReadOnlyBadge status={status} />
        </div>
      )}

      {/* Observación */}
      {(!isReadOnly || obs) && (
        <textarea
          value={obs}
          onChange={e => onObsChange(e.target.value)}
          disabled={isReadOnly}
          placeholder="Observación (opcional)"
          rows={2}
          className="w-full text-sm border border-border rounded-lg px-3 py-2 text-navy placeholder:text-[#8896a5] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none transition disabled:bg-surface disabled:text-[#4a5568]"
        />
      )}

      {/* Fotos */}
      {evidences.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {evidences.map(ev => {
            const url = getEvidenceUrl(ev);
            return (
              <div key={ev.id} className="relative group">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt="Evidencia"
                    className="w-16 h-16 object-cover rounded-lg border border-border cursor-pointer hover:opacity-90 transition"
                    onClick={() => onOpenLightbox(url)}
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-surface border border-border flex items-center justify-center">
                    <ImageIcon size={20} className="text-[#8896a5]" />
                  </div>
                )}
                {/* Botón eliminar */}
                {!isReadOnly && (
                  <button
                    onClick={() => onDeleteEvidence(ev)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow"
                  >
                    <Trash2 size={10} />
                  </button>
                )}
                {/* Zoom hint */}
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
          })}
        </div>
      )}
    </div>
  );
}

// ── Componentes pequeños ──────────────────────────────────────────────────────

function AnswerBtn({
  label, icon, active, activeClass, onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  activeClass: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 px-3 py-2 rounded-lg border text-xs font-bold transition',
        active
          ? activeClass
          : 'border-border bg-surface text-[#4a5568] hover:border-primary hover:text-primary'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ReadOnlyBadge({ status }: { status: ItemStatus }) {
  const map: Record<ItemStatus, { label: string; cls: string }> = {
    PENDING:  { label: '—',         cls: 'bg-[#d4dde8] text-[#4a5568]' },
    OK:       { label: 'Sí',        cls: 'bg-success/20 text-success' },
    NOK:      { label: 'No',        cls: 'bg-danger/20 text-danger' },
    OBSERVED: { label: 'Observado', cls: 'bg-warning/20 text-warning' },
  };
  const { label, cls } = map[status];
  return (
    <span className={cn('text-xs font-bold px-3 py-1.5 rounded-lg', cls)}>
      {label}
    </span>
  );
}
