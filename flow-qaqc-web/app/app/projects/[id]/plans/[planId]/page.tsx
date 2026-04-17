'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  X, Check, Trash2, MessageSquare, Send, ChevronDown,
  ChevronUp, Loader2, AlertCircle, ZoomIn, ZoomOut, Maximize,
  MapPin, Camera, ImageIcon,
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import PageHeader from '@components/PageHeader';
import { useAuth } from '@lib/auth-context';
import { s3Url } from '@lib/pdfGenerator';
import { sanitizeSegment, sanitizeFilename, seq, s3ProjectPrefix, uploadBlobToS3 } from '@lib/s3-upload';
import { applyStamp } from '@lib/stamp';
import { cn } from '@lib/utils';
import {
  usePlan,
  useAnnotations,
  useCreateAnnotation,
  useDeleteAnnotation,
  useToggleAnnotationOk,
  useAddComment,
  useAddCommentPhoto,
  useDeleteComment,
  useProtocolHeader,
  usePlansByReference,
  type AnnotationWithComments,
} from '@hooks/usePlanViewer';
import { useProject } from '@hooks/useProjects';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

const annColor = (isOk: boolean) => (isOk ? '#16a34a' : '#dc2626');

// Radio fijo de la viñeta en px de pantalla (independiente del zoom)
const ANN_RADIUS = 12;

interface PendingShape {
  type: 'dot' | 'rect';
  x: number;   // % 0-100
  y: number;
  width?: number;
  height?: number;
}

const ZOOM_LEVELS  = [0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0];
const ZOOM_DEFAULT = 0; // índice → 0.75 (75%)
const MIN_DRAG_PX  = 8;
const PAN_MIN_VIS  = 500; // px mínimos del PDF que deben quedar visibles

export default function PlanViewerPage() {
  const router = useRouter();
  const { id: projectId, planId } = useParams<{ id: string; planId: string }>();
  const searchParams   = useSearchParams();
  const fromProtocolId = searchParams.get('protocolId');
  const fromLocationId = searchParams.get('locationId');

  const { currentUser } = useAuth();
  const { data: project } = useProject(projectId);
  const { data: plan, isLoading: planLoading } = usePlan(planId);
  const { data: annotations, isLoading: annsLoading } = useAnnotations(planId, fromProtocolId);
  const { data: protoHeader } = useProtocolHeader(fromProtocolId);
  const { data: protocolPlans = [] } = usePlansByReference(
    projectId,
    protoHeader?.referencePlan ?? null,
  );

  const createAnn  = useCreateAnnotation(planId);
  const deleteAnn  = useDeleteAnnotation(planId);
  const toggleOk   = useToggleAnnotationOk(planId);
  const addComment = useAddComment(planId);
  const addCommentPhoto = useAddCommentPhoto(planId);
  const delComment = useDeleteComment(planId);
  const commentPhotoRef = useRef<HTMLInputElement>(null);
  const commentPhotoTargetRef = useRef<string | null>(null);
  const [uploadingCommentPhoto, setUploadingCommentPhoto] = useState(false);

  // ── Selector de planos ────────────────────────────────────────────────────
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const switchPlan = (newPlanId: string) => {
    setShowPlanPicker(false);
    const params = new URLSearchParams();
    if (fromProtocolId) params.set('protocolId', fromProtocolId);
    if (fromLocationId) params.set('locationId', fromLocationId);
    router.push(`/app/projects/${projectId}/plans/${newPlanId}?${params.toString()}`);
  };

  // ── Zoom fijo ─────────────────────────────────────────────────────────────
  const [zoomIdx, setZoomIdx] = useState(ZOOM_DEFAULT);
  const zoom    = ZOOM_LEVELS[zoomIdx];
  const zoomIn  = () => setZoomIdx(i => Math.min(ZOOM_LEVELS.length - 1, i + 1));
  const zoomOut = () => setZoomIdx(i => Math.max(0, i - 1));
  const zoomReset = () => { setZoomIdx(ZOOM_DEFAULT); hasCentered.current = false; };

  // ── Refs del viewport y tamaño del canvas PDF ────────────────────────────
  const viewportRef = useRef<HTMLDivElement>(null);
  const [pagePx, setPagePx] = useState({ w: 0, h: 0 });

  // Leer tamaño real del canvas tras cada render de página y centrar al inicio
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const hasCentered = useRef(false);

  const onPageRenderSuccess = useCallback(() => {
    setTimeout(() => {
      const canvas = pageContainerRef.current?.querySelector('canvas');
      if (!canvas) return;
      const pw = canvas.offsetWidth;
      const ph = canvas.offsetHeight;
      setPagePx({ w: pw, h: ph });

      // Centrar el PDF en el viewport la primera vez
      if (!hasCentered.current && viewportRef.current) {
        const vw = viewportRef.current.clientWidth;
        const vh = viewportRef.current.clientHeight;
        hasCentered.current = true;
        setPan({
          x: Math.round((vw - pw) / 2),
          y: Math.round((vh - ph) / 2),
        });
      }
    }, 0);
  }, []);

  // ── Pan con clamp ─────────────────────────────────────────────────────────
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panActive = useRef(false);
  const panOrigin = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  // Leer el viewport directamente desde el ref para evitar closures stale
  const clampPan = useCallback((x: number, y: number, pw = pagePx.w, ph = pagePx.h) => {
    if (pw === 0 || ph === 0) return { x, y };
    const vw = viewportRef.current?.clientWidth  ?? 800;
    const vh = viewportRef.current?.clientHeight ?? 600;
    return {
      x: Math.max(PAN_MIN_VIS - pw, Math.min(vw - PAN_MIN_VIS, x)),
      y: Math.max(PAN_MIN_VIS - ph, Math.min(vh - PAN_MIN_VIS, y)),
    };
  }, [pagePx]);

  // ── Wheel zoom ────────────────────────────────────────────────────────────
  // Usamos window con capture:true para interceptar ANTES de que el canvas PDF
  // procese el evento. Solo actúa si el cursor está sobre el viewport del visor.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!viewportRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      setZoomIdx(i => e.deltaY < 0 ? Math.min(ZOOM_LEVELS.length - 1, i + 1) : Math.max(0, i - 1));
    };
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  // Re-clampear el pan cuando cambia el zoom (el canvas crece/encoge)
  useEffect(() => {
    // Calcular nuevo tamaño del canvas después de cambio de zoom
    // react-pdf renderiza en el siguiente tick; esperamos un frame
    const t = setTimeout(() => {
      const canvas = pageContainerRef.current?.querySelector('canvas');
      if (!canvas) return;
      const pw = canvas.offsetWidth;
      const ph = canvas.offsetHeight;
      setPagePx({ w: pw, h: ph });
      setPan(prev => clampPan(prev.x, prev.y, pw, ph));
    }, 100);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // ── Páginas PDF ───────────────────────────────────────────────────────────
  const [numPages,    setNumPages]    = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  // ── Draw state ────────────────────────────────────────────────────────────
  const [drawMode,   setDrawMode]   = useState(false);
  const [pending,    setPending]    = useState<PendingShape | null>(null);
  const [showModal,  setShowModal]  = useState(false);
  const [modalLabel, setModalLabel] = useState('');
  const [saveError,  setSaveError]  = useState('');
  const mouseStart = useRef<{ x: number; y: number } | null>(null);

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [photoLightbox, setPhotoLightbox] = useState<string | null>(null);
  const [replyText,  setReplyText]  = useState('');
  const [replying,   setReplying]   = useState(false);

  // ── Roles ─────────────────────────────────────────────────────────────────
  const canAnnotate = ['CREATOR','RESIDENT','INSPECTOR'].includes(currentUser?.role ?? '');
  const isJefe      = ['CREATOR','RESIDENT'].includes(currentUser?.role ?? '');

  // ── PDF URL ───────────────────────────────────────────────────────────────
  const [pdfUrl, setPdfUrl]         = useState<string | null>(null);
  const [pdfCaching, setPdfCaching] = useState(false);
  const [pdfResolving, setPdfResolving] = useState(true);

  useEffect(() => {
    if (!plan) return;
    setPdfResolving(true);
    const key = plan.s3_key
      ?? (project?.name
        ? `projects/${sanitizeSegment(project.name)}/plans/${sanitizeSegment(plan.name)}.pdf`
        : null);
    if (!key) { setPdfUrl(null); setPdfResolving(false); return; }
    if (typeof window === 'undefined' || !window.electronAPI) {
      setPdfUrl(s3Url(key)); setPdfResolving(false); return;
    }
    window.electronAPI.checkLocalFile(key).then(localPath => {
      if (localPath) { setPdfUrl(`file:///${localPath.replace(/\\/g, '/')}`); setPdfResolving(false); }
      else {
        const remote = s3Url(key);
        setPdfUrl(remote); setPdfResolving(false); setPdfCaching(true);
        fetch(remote)
          .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
          .then(buf => window.electronAPI!.saveLocalFile(key, buf))
          .then(saved => setPdfUrl(`file:///${saved.replace(/\\/g, '/')}`))
          .catch(e => console.warn('No se pudo cachear PDF:', e))
          .finally(() => setPdfCaching(false));
      }
    }).catch(() => { setPdfUrl(s3Url(key)); setPdfResolving(false); });
  }, [plan?.id, plan?.s3_key, project?.name]);

  // ── Coordenadas mouse → % PDF ─────────────────────────────────────────────
  const toPdfPct = useCallback((clientX: number, clientY: number) => {
    const el = pageContainerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((clientX - rect.left)  / rect.width)  * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top)   / rect.height) * 100)),
    };
  }, []);

  // ── Mouse handlers ────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (drawMode && canAnnotate) {
      e.preventDefault();
      const pos = toPdfPct(e.clientX, e.clientY);
      mouseStart.current = pos;
      setPending({ type: 'dot', ...pos });
      return;
    }
    panActive.current = true;
    panOrigin.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }, [drawMode, canAnnotate, pan, toPdfPct]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (drawMode && mouseStart.current && canAnnotate) {
      const start = mouseStart.current;
      const el = pageContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const sx = rect.left + start.x / 100 * rect.width;
      const sy = rect.top  + start.y / 100 * rect.height;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > MIN_DRAG_PX) {
        const cur = toPdfPct(e.clientX, e.clientY);
        setPending({ type: 'rect', x: Math.min(start.x, cur.x), y: Math.min(start.y, cur.y), width: Math.abs(cur.x - start.x), height: Math.abs(cur.y - start.y) });
      }
      return;
    }
    if (panActive.current) {
      const raw = { x: panOrigin.current.px + (e.clientX - panOrigin.current.mx), y: panOrigin.current.py + (e.clientY - panOrigin.current.my) };
      setPan(clampPan(raw.x, raw.y));
    }
  }, [drawMode, canAnnotate, toPdfPct, clampPan]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (drawMode && mouseStart.current && canAnnotate) {
      const start = mouseStart.current;
      const el = pageContainerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const sx = rect.left + start.x / 100 * rect.width;
        const sy = rect.top  + start.y / 100 * rect.height;
        if (Math.hypot(e.clientX - sx, e.clientY - sy) <= MIN_DRAG_PX) {
          setPending({ type: 'dot', ...toPdfPct(e.clientX, e.clientY) });
        }
      }
      mouseStart.current = null;
      setSaveError(''); setModalLabel(''); setShowModal(true);
      return;
    }
    panActive.current = false;
  }, [drawMode, canAnnotate, toPdfPct]);

  // ── Guardar anotación ─────────────────────────────────────────────────────
  const cancelModal = () => { setPending(null); setShowModal(false); setModalLabel(''); setSaveError(''); };

  const saveAnnotation = async () => {
    if (!pending || !currentUser) { setSaveError('Sin sesión activa. Recarga la página.'); return; }
    setSaveError('');
    const nextSeq = annotations && annotations.length > 0
      ? Math.max(...annotations.map(a => a.parsedData.sequenceNumber)) + 1
      : 1;
    try {
      await createAnn.mutateAsync({
        x: pending.x, y: pending.y,
        label: modalLabel.trim() || null,
        annotationData: { type: pending.type, width: pending.width, height: pending.height, sequenceNumber: nextSeq, isOk: false, page: currentPage },
        userId: currentUser.id,
        protocolId: fromProtocolId ?? null,
      });
      cancelModal();
      setDrawMode(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as Record<string, unknown>)?.message ?? JSON.stringify(err);
      setSaveError(`Error al guardar: ${msg}`);
    }
  };

  // ── Sidebar helpers ───────────────────────────────────────────────────────
  const toggleExpand = (ann: AnnotationWithComments) => { setExpandedId(p => p === ann.id ? null : ann.id); setReplyText(''); };

  const sendReply = async (ann: AnnotationWithComments) => {
    if (!replyText.trim() || !currentUser) return;
    setReplying(true);
    try {
      await addComment.mutateAsync({ annotationId: ann.id, text: replyText.trim(), userId: currentUser.id });
      setReplyText('');
    } finally { setReplying(false); }
  };

  const handleCommentPhotoClick = (commentId: string) => {
    commentPhotoTargetRef.current = commentId;
    commentPhotoRef.current?.click();
  };

  const handleCommentPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const commentId = commentPhotoTargetRef.current;
    if (!file || !commentId) return;
    e.target.value = '';
    setUploadingCommentPhoto(true);
    try {
      const blobUrl = URL.createObjectURL(file);
      const logoKey = project?.logo_s3_key ?? (project?.id ? `logos/project_${project.id}/logo.jpg` : null);
      const logoUrl = logoKey ? `/api/s3-image-nocache?key=${encodeURIComponent(logoKey)}` : null;
      const stampedBlob = await applyStamp({
        imageUrl: blobUrl,
        logoUrl,
        comment: (project as any)?.stamp_comment ?? null,
      });
      URL.revokeObjectURL(blobUrl);

      const projPrefix = s3ProjectPrefix(project?.name ?? projectId);
      const annId = annotations?.flatMap(a => a.comments).find(c => c.id === commentId)?.annotation_id ?? 'unknown';
      const photoCount = annotations?.flatMap(a => a.comments).flatMap(c => c.photos ?? []).length ?? 0;
      const s3Key = `${projPrefix}/photos/obs-${sanitizeFilename(annId)}-F${seq(photoCount + 1)}.jpg`;

      await uploadBlobToS3(stampedBlob, s3Key, 'image/jpeg');
      await addCommentPhoto.mutateAsync({ commentId, s3Key });
    } catch (err) {
      console.error('Error subiendo foto de comentario:', err);
    } finally {
      setUploadingCommentPhoto(false);
    }
  };

  // ── SVG: coordenadas % → px ───────────────────────────────────────────────
  // Sin viewBox ni preserveAspectRatio → los círculos quedan circulares
  const pctToPx = (xPct: number, yPct: number) => ({
    cx: (xPct / 100) * pagePx.w,
    cy: (yPct / 100) * pagePx.h,
  });

  const pageAnns = annotations
    ? annotations.filter(a => a.parsedData.page == null || a.parsedData.page === currentPage)
    : [];

  const renderAnns = () => {
    if (pagePx.w === 0) return null;
    return pageAnns.map(ann => {
      const d = ann.parsedData;
      const c = annColor(d.isOk);
      const { cx, cy } = pctToPx(ann.rect_x, ann.rect_y);
      if (d.type === 'dot') return (
        <g key={ann.id}>
          <circle cx={cx} cy={cy} r={ANN_RADIUS} fill={c} opacity="0.9" />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={ANN_RADIUS * 1.2} fontWeight="bold">{d.sequenceNumber}</text>
        </g>
      );
      const w = d.width ?? 5, h = d.height ?? 5;
      const rx2 = (ann.rect_x + w) / 100 * pagePx.w;
      const strokeW = Math.max(1.5, pagePx.w * 0.003);
      return (
        <g key={ann.id}>
          <rect
            x={(ann.rect_x / 100) * pagePx.w} y={(ann.rect_y / 100) * pagePx.h}
            width={(w / 100) * pagePx.w} height={(h / 100) * pagePx.h}
            fill="none" stroke={c} strokeWidth={strokeW} opacity="0.9"
          />
          <circle cx={rx2} cy={(ann.rect_y / 100) * pagePx.h} r={ANN_RADIUS} fill={c} opacity="0.9" />
          <text x={rx2} y={(ann.rect_y / 100) * pagePx.h} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={ANN_RADIUS * 1.1} fontWeight="bold">{d.sequenceNumber}</text>
        </g>
      );
    });
  };

  const renderPending = () => {
    if (!pending || pagePx.w === 0) return null;
    const { cx, cy } = pctToPx(pending.x, pending.y);
    if (pending.type === 'dot') return <circle cx={cx} cy={cy} r={ANN_RADIUS} fill="#2563eb" opacity="0.6" />;
    const pw = ((pending.width ?? 0) / 100) * pagePx.w;
    const ph = ((pending.height ?? 0) / 100) * pagePx.h;
    const strokeW = Math.max(0.5, pagePx.w * 0.001);
    return <rect x={cx} y={cy} width={pw} height={ph} fill="rgba(37,99,235,0.12)" stroke="#2563eb" strokeWidth={strokeW} strokeDasharray="6 3" />;
  };

  // ── Agrupar viñetas por página ────────────────────────────────────────────
  const annsByPage: Record<number, AnnotationWithComments[]> = {};
  if (annotations) {
    for (const ann of annotations) {
      const pg = ann.parsedData.page ?? 1;
      if (!annsByPage[pg]) annsByPage[pg] = [];
      annsByPage[pg].push(ann);
    }
  }
  const pageGroups = Object.keys(annsByPage).map(Number).sort((a, b) => a - b);

  // ── Títulos header ────────────────────────────────────────────────────────
  const headerTitle = fromProtocolId ? (protoHeader?.protocolNumber ?? 'Protocolo') : plan?.name ?? '…';

  // ── Loading ───────────────────────────────────────────────────────────────
  if (planLoading || pdfResolving) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-3">
        <Loader2 size={28} className="animate-spin text-primary" />
        <p className="text-[#8896a5] text-sm">{pdfResolving ? 'Buscando plano…' : 'Cargando…'}</p>
      </div>
    );
  }
  if (!plan) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-3 text-center p-6">
        <AlertCircle size={40} className="text-danger" />
        <p className="text-navy font-bold">Plano no encontrado</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex flex-col bg-surface" style={{ height: '100vh' }}>
        <PageHeader
          title={headerTitle}
          subtitle={
            fromProtocolId && protoHeader?.locationName
              ? (<span className="flex items-center gap-1"><MapPin size={11} className="opacity-70" />{protoHeader.locationName}</span>)
              : (fromProtocolId ? plan.name : project?.name)
          }
          backHref={fromProtocolId ? `/app/projects/${projectId}/protocols/${fromProtocolId}/fill` : undefined}
          crumbs={[
            { label: 'Proyectos', href: '/app/projects' },
            { label: project?.name ?? '…', href: `/app/projects/${projectId}/locations` },
            ...(fromProtocolId && protoHeader?.locationName && protoHeader?.locationId ? [
              { label: protoHeader.locationName, href: `/app/projects/${projectId}/locations/${protoHeader.locationId}/protocols` },
            ] : []),
            ...(fromProtocolId ? [
              { label: protoHeader?.protocolNumber ?? '…', href: `/app/projects/${projectId}/protocols/${fromProtocolId}/fill` },
            ] : [
              { label: 'Planos', href: `/app/projects/${projectId}/plans` },
            ]),
            { label: plan.name },
          ]}
          rightContent={
            <div className="flex items-center gap-2">
              {/* Selector de planos — solo cuando venimos de un protocolo con múltiples planos */}
              {fromProtocolId && protocolPlans.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowPlanPicker(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-white/10 text-white border border-white/25 hover:bg-white/20 transition"
                  >
                    <span className="max-w-[140px] truncate">{plan.name}</span>
                    <ChevronDown size={11} className={cn('transition-transform flex-shrink-0', showPlanPicker && 'rotate-180')} />
                  </button>
                  {showPlanPicker && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowPlanPicker(false)} />
                      <div className="absolute right-0 top-full mt-1.5 z-40 bg-white rounded-xl shadow-2xl border border-border overflow-hidden min-w-[200px]">
                        {protocolPlans.map(p => (
                          <button
                            key={p.id}
                            onClick={() => switchPlan(p.id)}
                            className={cn(
                              'w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition',
                              p.id === planId ? 'bg-primary/10 text-primary font-bold' : 'text-navy hover:bg-surface hover:text-primary',
                            )}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {canAnnotate && (
                <button
                  onClick={() => { setDrawMode(v => !v); cancelModal(); }}
                  className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition',
                    drawMode ? 'bg-white text-navy border-white' : 'bg-transparent text-white border-white/50 hover:border-white hover:bg-white/10')}
                >
                  {drawMode ? 'Dibujando…' : '+ Anotar plano'}
                </button>
              )}
            </div>
          }
        />

        <div className="flex flex-1 overflow-hidden">

          {/* ── Visor PDF ─────────────────────────────────────────────────── */}
          <div
            ref={viewportRef}
            className="flex-1 relative overflow-hidden bg-gray-900 select-none"
            style={{ cursor: drawMode ? 'crosshair' : 'grab' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { panActive.current = false; mouseStart.current = null; }}
          >
            {/* Canvas PDF + SVG overlay */}
            <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${pan.x}px, ${pan.y}px)` }}>
              <div ref={pageContainerRef} style={{ position: 'relative', display: 'inline-block' }}>
                {pdfUrl && (
                  <Document
                    file={pdfUrl}
                    onLoadSuccess={({ numPages: n }) => { setNumPages(n); setCurrentPage(p => Math.min(p, n)); }}
                    loading={
                      <div className="w-[800px] h-[600px] flex items-center justify-center bg-gray-800">
                        <Loader2 size={32} className="animate-spin text-white/60" />
                      </div>
                    }
                    error={
                      <div className="w-[800px] h-[200px] flex items-center justify-center bg-gray-800 gap-3">
                        <AlertCircle size={24} className="text-danger" />
                        <span className="text-white text-sm">No se pudo cargar el PDF</span>
                      </div>
                    }
                  >
                    <Page
                      pageNumber={currentPage}
                      scale={zoom}
                      renderAnnotationLayer={false}
                      renderTextLayer={false}
                      onRenderSuccess={onPageRenderSuccess}
                    />
                  </Document>
                )}

                {/* SVG overlay — coordenadas en px reales, sin viewBox, círculos perfectos */}
                {pagePx.w > 0 && (
                  <svg
                    width={pagePx.w}
                    height={pagePx.h}
                    style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
                  >
                    {renderAnns()}
                    {renderPending()}
                  </svg>
                )}
              </div>
            </div>

            {pdfCaching && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-navy/80 text-white text-xs font-semibold px-4 py-2 rounded-full flex items-center gap-2 shadow-lg">
                <Loader2 size={12} className="animate-spin" /> Guardando plano localmente…
              </div>
            )}

            {numPages > 1 && (
              <div className="absolute bottom-14 left-4 flex items-center gap-1 z-10">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className="w-7 h-7 bg-white/90 hover:bg-white rounded-lg shadow flex items-center justify-center text-navy disabled:opacity-30 text-xs font-bold transition">◀</button>
                <span className="text-white text-[10px] font-bold bg-black/50 rounded px-2 py-1 min-w-[54px] text-center">{currentPage} / {numPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage === numPages}
                  className="w-7 h-7 bg-white/90 hover:bg-white rounded-lg shadow flex items-center justify-center text-navy disabled:opacity-30 text-xs font-bold transition">▶</button>
              </div>
            )}

            {drawMode && (
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-navy/90 text-white text-xs px-4 py-2 rounded-full pointer-events-none">
                Clic = punto · Arrastra = rectángulo · "+ Anotar plano" para salir
              </div>
            )}

            <div className="absolute bottom-4 right-4 flex flex-col items-center gap-1 z-10">
              <button onClick={zoomIn} disabled={zoomIdx >= ZOOM_LEVELS.length - 1}
                className="w-8 h-8 bg-white/90 hover:bg-white rounded-lg shadow flex items-center justify-center text-navy disabled:opacity-40" title="Acercar">
                <ZoomIn size={15} />
              </button>
              <span className="text-white text-[10px] font-bold bg-black/50 rounded px-1.5 py-0.5 min-w-[36px] text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={zoomOut} disabled={zoomIdx <= 0}
                className="w-8 h-8 bg-white/90 hover:bg-white rounded-lg shadow flex items-center justify-center text-navy disabled:opacity-40" title="Alejar">
                <ZoomOut size={15} />
              </button>
              <button onClick={zoomReset}
                className="w-8 h-8 bg-white/90 hover:bg-white rounded-lg shadow flex items-center justify-center text-navy mt-1" title="Restablecer">
                <Maximize size={13} />
              </button>
            </div>
          </div>

          {/* ── Sidebar viñetas ──────────────────────────────────────────── */}
          <div className="w-80 flex-shrink-0 bg-white border-l border-border flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-surface flex items-center justify-between">
              <span className="text-xs font-bold text-navy uppercase tracking-wider">Viñetas</span>
              <div className="flex items-center gap-2">
                {annsLoading && <Loader2 size={13} className="animate-spin text-muted" />}
                {annotations && <span className="text-xs text-muted">{annotations.length} · {annotations.filter(a => a.parsedData.isOk).length} OK</span>}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {!annsLoading && (!annotations || annotations.length === 0) && (
                <div className="flex flex-col items-center gap-2 py-12 text-center px-4">
                  <MessageSquare size={32} className="text-muted opacity-30" />
                  <p className="text-muted text-xs">{canAnnotate ? 'Activa "+ Anotar plano" y haz clic.' : 'Sin anotaciones aún.'}</p>
                </div>
              )}

              {pageGroups.map(pg => (
                <div key={pg}>
                  {pageGroups.length > 1 && (
                    <div className="px-3 py-1.5 bg-surface border-b border-border flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Página {pg}</span>
                      <span className="text-[10px] text-muted">· {annsByPage[pg].length} viñeta{annsByPage[pg].length !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {annsByPage[pg].map(ann => {
                    const d = ann.parsedData;
                    const color = annColor(d.isOk);
                    const expanded = expandedId === ann.id;
                    return (
                      <div key={ann.id} className="border-b border-border last:border-b-0">
                        <div className="flex items-start gap-2 px-3 py-2.5 hover:bg-surface transition cursor-pointer"
                          onClick={() => { toggleExpand(ann); if (d.page != null) setCurrentPage(d.page); }}>
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[11px] font-bold mt-0.5" style={{ backgroundColor: color }}>
                            {d.sequenceNumber}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-navy truncate">{ann.comment || (d.type === 'dot' ? 'Punto' : 'Área')}</p>
                            <p className="text-[10px] text-muted mt-0.5">{d.isOk ? '✓ Resuelto' : `${ann.comments.length} comentario${ann.comments.length !== 1 ? 's' : ''}`}</p>
                          </div>
                          <div className="text-muted flex-shrink-0">{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</div>
                        </div>
                        {expanded && (
                          <div className="px-3 pb-3 flex flex-col gap-2">
                            {ann.comments.map(c => (
                              <div key={c.id} className="bg-surface rounded-lg px-3 py-2 text-xs text-navy group relative">
                                <p className="leading-relaxed">{c.content}</p>
                                {/* Fotos del comentario */}
                                {(c.photos ?? []).length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                                    {(c.photos ?? []).map(p => {
                                      const photoUrl = p.storage_path
                                        ? `/api/s3-image?key=${encodeURIComponent(p.storage_path)}`
                                        : null;
                                      return photoUrl ? (
                                        <img key={p.id} src={photoUrl} alt="foto"
                                          className="w-14 h-14 object-cover rounded-md border border-border cursor-pointer hover:opacity-80 transition"
                                          onClick={() => setPhotoLightbox(photoUrl)} />
                                      ) : null;
                                    })}
                                  </div>
                                )}
                                <div className="flex items-center justify-between mt-1">
                                  <p className="text-muted text-[10px]">{new Date(c.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</p>
                                  {canAnnotate && (
                                    <button onClick={() => handleCommentPhotoClick(c.id)}
                                      disabled={uploadingCommentPhoto}
                                      className="text-muted hover:text-primary transition" title="Adjuntar foto">
                                      {uploadingCommentPhoto && commentPhotoTargetRef.current === c.id
                                        ? <Loader2 size={11} className="animate-spin" />
                                        : <Camera size={11} />}
                                    </button>
                                  )}
                                </div>
                                {canAnnotate && (
                                  <button onClick={() => delComment.mutate(c.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-muted hover:text-danger transition"><X size={11} /></button>
                                )}
                              </div>
                            ))}
                            {canAnnotate && (
                              <div className="flex items-center gap-2 mt-1">
                                <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') sendReply(ann); }}
                                  placeholder="Agregar comentario…"
                                  className="flex-1 border border-border rounded-lg px-2.5 py-1.5 text-xs text-navy outline-none focus:border-primary transition" />
                                <button onClick={() => sendReply(ann)} disabled={!replyText.trim() || replying}
                                  className="p-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-40 transition">
                                  {replying ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                                </button>
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              {isJefe && (
                                <button onClick={() => toggleOk.mutate({ annotationId: ann.id, isOk: !d.isOk, locationOnly: null, specialty: null })}
                                  className={cn('flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition',
                                    d.isOk ? 'bg-muted/20 text-muted hover:bg-danger/10 hover:text-danger' : 'bg-success/10 text-success hover:bg-success/20')}>
                                  <Check size={12} />{d.isOk ? 'Reabrir' : 'Resolver'}
                                </button>
                              )}
                              {canAnnotate && (
                                <button onClick={() => { if (confirm(`¿Eliminar viñeta ${d.sequenceNumber}?`)) { deleteAnn.mutate(ann.id); setExpandedId(null); } }}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-danger hover:bg-danger/10 transition">
                                  <Trash2 size={12} />Eliminar
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && pending && (
        <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4"
          onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <h3 className="font-bold text-navy text-base">Nueva viñeta — {pending.type === 'dot' ? 'Punto' : 'Área'}</h3>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Comentario (opcional)</label>
              <textarea autoFocus value={modalLabel} onChange={e => setModalLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveAnnotation(); } }}
                placeholder="Describe el hallazgo…" rows={3}
                className="border border-border rounded-xl px-3 py-2.5 text-sm text-navy outline-none focus:border-primary resize-none transition" />
            </div>
            {saveError && <p className="text-danger text-xs font-medium bg-danger/10 rounded-lg px-3 py-2">{saveError}</p>}
            <div className="flex gap-3">
              <button onClick={cancelModal} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:bg-surface transition">Cancelar</button>
              <button onClick={saveAnnotation} disabled={createAnn.isPending}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-60 transition flex items-center justify-center gap-2">
                {createAnn.isPending ? <Loader2 size={15} className="animate-spin" /> : <><Check size={14} /> Guardar viñeta</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for comment photos */}
      <input
        ref={commentPhotoRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCommentPhotoChange}
      />

      {/* Photo lightbox */}
      {photoLightbox && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPhotoLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoLightbox} alt="foto" className="max-w-full max-h-full object-contain rounded-lg"
            onClick={e => e.stopPropagation()} />
          <button className="absolute top-4 right-4 text-white bg-black/40 rounded-full p-2"
            onClick={() => setPhotoLightbox(null)}>
            <X size={20} />
          </button>
        </div>
      )}
    </>
  );
}
