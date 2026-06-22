'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  ArrowLeft, Loader2, Hand, Ruler, Square, Trash2, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, Maximize, BrickWall, Cuboid, Grid2x2, Check, X,
  Scale, Waypoints, Undo2, Redo2, Triangle, Magnet, Printer, CornerUpLeft,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { usePlan } from '@hooks/usePlanViewer';
import { useProject } from '@hooks/useProjects';
import {
  useMeasurements, useCreateMeasurement, useUpdateMeasurement, useDeleteMeasurement,
  type MeasurementWithData, type MeasurementType,
} from '@hooks/usePlanMeasurements';
import { s3Url } from '@lib/pdfGenerator';
import { sanitizeSegment } from '@lib/s3-upload';
import { cn } from '@lib/utils';
import { useI18n } from '@lib/i18n';
import { BrickCalculatorModal } from '@components/measurement/BrickCalculatorModal';
import { VolumeCalculatorModal } from '@components/measurement/VolumeCalculatorModal';
import { TileCalculatorModal } from '@components/measurement/TileCalculatorModal';
import { FloatingCalculator } from '@components/measurement/FloatingCalculator';
import type { CalcState, BrickCalcState, VolumeCalcState, TileCalcState } from '@lib/MetradosService';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 6.0;
const ZOOM_DEFAULT = 1.0;
const ZOOM_BTN_FACTOR = 1.25;   // botones +/− (escalón perceptible)
const ZOOM_WHEEL_FACTOR = 1.12; // rueda (escalón fino)

const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

type Tool = 'pan' | 'calibrate' | 'line' | 'polyline' | 'polygon';

interface Pt { x: number; y: number; }

// Ángulo (en grados) en el vértice b, formado por a-b-c
function angleAt(a: Pt, b: Pt, c: Pt): number {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * 180) / Math.PI;
}

export default function MeasurePage() {
  const { t } = useI18n();
  const router = useRouter();
  const { id: projectId, planId } = useParams<{ id: string; planId: string }>();
  const { data: project } = useProject(projectId);
  const { data: plan, isLoading: planLoading } = usePlan(planId);
  const { data: measurements = [] } = useMeasurements(planId);
  const createMeasurement = useCreateMeasurement(planId);
  const updateMeasurement = useUpdateMeasurement(planId);
  const deleteMeasurement = useDeleteMeasurement(planId);

  const [tool, setTool] = useState<Tool>('pan');
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [pagePx, setPagePx] = useState({ w: 0, h: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panActive = useRef(false);
  const panOrigin = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const hasCentered = useRef(false);

  // Trazo en construcción (puntos en px del canvas)
  const [drawing, setDrawing] = useState<Pt[]>([]);
  const [pendingCalibrationPx, setPendingCalibrationPx] = useState<number | null>(null);
  const [calibrationInput, setCalibrationInput] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Drag-to-draw (line / calibrate): true mientras el botón está apretado tras un mouseDown válido.
  const lineDragActive = useRef(false);

  // Toggles de visualización
  const [showAreaLabels, setShowAreaLabels] = useState(true);
  const [showAngles, setShowAngles] = useState(false);

  // Undo / Redo: pilas locales sobre creaciones recientes en esta sesión
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<MeasurementWithData[]>([]);

  // Edición de endpoints (sólo líneas + calibración)
  const [editing, setEditing] = useState<{
    id: string; type: string; endpoint: 'a' | 'b'; pos: Pt;
  } | null>(null);
  const editingRef = useRef(editing);
  useEffect(() => { editingRef.current = editing; }, [editing]);

  // Lupa (loupe) — copia un fragmento del canvas del PDF y lo amplía en un círculo
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const [loupePos, setLoupePos] = useState<{ left: number; top: number } | null>(null);
  const LOUPE_SIZE = 120; // px en pantalla
  const LOUPE_ZOOM = 2.2;

  const drawLoupe = useCallback((basePt: Pt, mouseX: number, mouseY: number) => {
    const lc = loupeRef.current;
    if (!lc) return;
    const lctx = lc.getContext('2d');
    const pdfCanvas = pageRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
    const viewport = viewportRef.current;
    if (!lctx || !pdfCanvas || !viewport) return;
    const dpr = window.devicePixelRatio || 1;
    if (lc.width !== LOUPE_SIZE * dpr) {
      lc.width = LOUPE_SIZE * dpr;
      lc.height = LOUPE_SIZE * dpr;
    }
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    lctx.save();
    lctx.beginPath();
    lctx.arc(LOUPE_SIZE / 2, LOUPE_SIZE / 2, LOUPE_SIZE / 2 - 2, 0, Math.PI * 2);
    lctx.clip();
    lctx.fillStyle = '#fff';
    lctx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    const srcW = LOUPE_SIZE / LOUPE_ZOOM;
    const srcH = LOUPE_SIZE / LOUPE_ZOOM;
    // basePt está en coords del canvas a zoom=1. Para drawImage del PDF canvas, primero
    // convertimos a CSS px (* zoom), luego a backing-store px (* sx).
    const sx = pdfCanvas.width / pdfCanvas.clientWidth;
    const sy = pdfCanvas.height / pdfCanvas.clientHeight;
    const cssX = basePt.x * zoom;
    const cssY = basePt.y * zoom;
    lctx.drawImage(
      pdfCanvas,
      (cssX - srcW / 2) * sx, (cssY - srcH / 2) * sy,
      srcW * sx, srcH * sy,
      0, 0, LOUPE_SIZE, LOUPE_SIZE
    );
    // Crosshair
    lctx.strokeStyle = 'rgba(220,30,30,0.85)';
    lctx.lineWidth = 1.5;
    lctx.beginPath();
    lctx.moveTo(LOUPE_SIZE / 2 - 10, LOUPE_SIZE / 2);
    lctx.lineTo(LOUPE_SIZE / 2 + 10, LOUPE_SIZE / 2);
    lctx.moveTo(LOUPE_SIZE / 2, LOUPE_SIZE / 2 - 10);
    lctx.lineTo(LOUPE_SIZE / 2, LOUPE_SIZE / 2 + 10);
    lctx.stroke();
    lctx.restore();
    // Posicionar la lupa cerca del cursor sin taparlo (offset diagonal)
    const vRect = viewport.getBoundingClientRect();
    let left = mouseX - vRect.left + 24;
    let top  = mouseY - vRect.top - LOUPE_SIZE - 24;
    if (top < 8) top = mouseY - vRect.top + 24;
    if (left + LOUPE_SIZE > vRect.width - 8) left = mouseX - vRect.left - LOUPE_SIZE - 24;
    setLoupePos({ left, top });
  }, [zoom]);

  const startEndpointEdit = (m: MeasurementWithData, endpoint: 'a' | 'b') => {
    const pt = endpoint === 'a' ? m.parsed.points[0] : m.parsed.points[1];
    setEditing({ id: m.id, type: m.type, endpoint, pos: { x: pt.x, y: pt.y } });
  };

  // ── Snap a píxel oscuro del PDF (espejo del móvil snapToNearestDark) ────
  // Busca dentro de un radio HIT_RADIUS px (en CSS px del canvas a zoom actual)
  // el píxel más oscuro y devuelve esa coordenada en coords base. Si no encuentra
  // nada significativamente oscuro, devuelve el punto original.
  const [snapEnabled, setSnapEnabled] = useState(true);
  const snapToDark = useCallback((basePt: Pt): Pt => {
    if (!snapEnabled) return basePt;
    const pdfCanvas = pageRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!pdfCanvas) return basePt;
    const ctx = pdfCanvas.getContext('2d');
    if (!ctx) return basePt;
    const sx = pdfCanvas.width / pdfCanvas.clientWidth;
    const sy = pdfCanvas.height / pdfCanvas.clientHeight;
    const HIT_RADIUS_CSS = 6;
    const cx = Math.round(basePt.x * zoom * sx);
    const cy = Math.round(basePt.y * zoom * sy);
    const r  = Math.max(3, Math.round(HIT_RADIUS_CSS * sx));
    const size = r * 2 + 1;
    try {
      const data = ctx.getImageData(cx - r, cy - r, size, size).data;
      let bestDark = 220, bestX = -1, bestY = -1;
      for (let yy = 0; yy < size; yy++) {
        for (let xx = 0; xx < size; xx++) {
          const i = (yy * size + xx) * 4;
          const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (lum < bestDark) {
            bestDark = lum; bestX = xx; bestY = yy;
          }
        }
      }
      if (bestDark < 130 && bestX !== -1) {
        return {
          x: (cx - r + bestX) / sx / zoom,
          y: (cy - r + bestY) / sy / zoom,
        };
      }
    } catch { /* getImageData puede fallar en cross-origin; ignorar */ }
    return basePt;
  }, [snapEnabled, zoom]);

  // Export/print
  const [exporting, setExporting] = useState(false);

  // Modales
  const [showBrick, setShowBrick] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [showTile, setShowTile] = useState(false);

  // ── Escala (px por metro) ────────────────────────────────────────────────
  const calibrationMeasurement = useMemo(
    () => measurements.find(m => m.type === 'calibration' && m.page === currentPage) ?? null,
    [measurements, currentPage]
  );
  const calibrationScale = calibrationMeasurement?.calibration_scale ?? 0;

  // Incluye calibración: queremos verla en el lienzo (en naranja, como el móvil)
  const pageMeasurements = useMemo(
    () => measurements.filter(m => m.page === currentPage),
    [measurements, currentPage]
  );

  // Paleta espejo del móvil
  const COLOR = {
    measure: '#dc1e1e',     // rgba(220,30,30,0.9)
    calibration: '#ff8c00', // rgba(255,140,0,0.85)
    polygon: '#0064dc',     // rgba(0,100,220,*)
    polyline: '#9c27b0',    // rgba(156,39,176,*)
    selected: '#dc1e1e',
    preview: '#16a34a',
  } as const;

  const colorFor = (type: string, isSelected: boolean) => {
    if (isSelected) return COLOR.selected;
    if (type === 'calibration') return COLOR.calibration;
    if (type === 'line') return COLOR.measure;
    if (type === 'polygon') return COLOR.polygon;
    if (type === 'polyline') return COLOR.polyline;
    return COLOR.measure;
  };

  const selected = pageMeasurements.find(m => m.id === selectedId) ?? null;

  // ── PDF URL ──────────────────────────────────────────────────────────────
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!plan) return;
    const key = plan.s3_key
      ?? (project?.name ? `projects/${sanitizeSegment(project.name)}/plans/${sanitizeSegment(plan.name)}.pdf` : null);
    if (!key) { setPdfUrl(null); return; }
    if (typeof window === 'undefined' || !window.electronAPI) {
      setPdfUrl(s3Url(key)); return;
    }
    window.electronAPI.checkLocalFile(key).then(localPath => {
      setPdfUrl(localPath ? `file:///${localPath.replace(/\\/g, '/')}` : s3Url(key));
    });
  }, [plan, project]);

  // ── Page render ──────────────────────────────────────────────────────────
  const onPageRenderSuccess = useCallback(() => {
    setTimeout(() => {
      const canvas = pageRef.current?.querySelector('canvas');
      if (!canvas) return;
      setPagePx({ w: canvas.offsetWidth, h: canvas.offsetHeight });
      if (!hasCentered.current && viewportRef.current) {
        hasCentered.current = true;
        const vw = viewportRef.current.clientWidth;
        const vh = viewportRef.current.clientHeight;
        setPan({
          x: Math.round((vw - canvas.offsetWidth) / 2),
          y: Math.round((vh - canvas.offsetHeight) / 2),
        });
      }
    }, 0);
  }, []);

  // ── Mouse handlers ───────────────────────────────────────────────────────
  // Devuelve coords en "base canvas px" (independientes del zoom). Todos los puntos
  // guardados están en este sistema; al renderizar se multiplican por `zoom`.
  const toCanvasPx = useCallback((mx: number, my: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (mx - rect.left - pan.x) / zoom,
      y: (my - rect.top - pan.y) / zoom,
    };
  }, [pan, zoom]);

  // Helper de render: convierte un punto base a coords visuales (multiplica por zoom).
  const sp = useCallback((p: Pt): Pt => ({ x: p.x * zoom, y: p.y * zoom }), [zoom]);

  // Helper: crea midiendo y empuja a la pila de undo
  const createTracked = (input: Parameters<typeof createMeasurement.mutate>[0]) => {
    createMeasurement.mutate(input, {
      onSuccess: (created) => {
        if (created?.id) {
          undoStackRef.current.push(created.id);
          redoStackRef.current = [];
        }
      },
    });
  };

  const undo = () => {
    const id = undoStackRef.current.pop();
    if (!id) return;
    const m = measurements.find(mm => mm.id === id);
    if (m) redoStackRef.current.push(m);
    deleteMeasurement.mutate(id);
    if (selectedId === id) setSelectedId(null);
  };

  const redo = () => {
    const m = redoStackRef.current.pop();
    if (!m) return;
    createTracked({
      type: m.type as MeasurementType,
      data: m.parsed,
      calibrationScale: m.calibration_scale,
      page: m.page,
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool === 'pan') {
      panActive.current = true;
      panOrigin.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
      return;
    }
    const rawPt = toCanvasPx(e.clientX, e.clientY);
    const pt = snapToDark(rawPt);
    if (tool === 'calibrate' || tool === 'line') {
      if (tool === 'line' && calibrationScale <= 0) {
        alert(t('webProto.calibrateFirst'));
        return;
      }
      // Drag-to-draw: el primer click inicia el segmento; el preview crece mientras se mueve
      // y el segmento se finaliza al soltar el botón (handleMouseUp).
      lineDragActive.current = true;
      setDrawing([pt, pt]);
      drawLoupe(pt, e.clientX, e.clientY);
      return;
    }
    if (tool === 'polyline' || tool === 'polygon') {
      // Click acumula vértice; doble click cierra
      setDrawing(d => [...d, pt]);
    }
  };

  // RAF para coalescer updates durante drags (evita saltos)
  const moveRafRef = useRef<number | null>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    // Endpoint edit con RAF — un solo update por frame, sin batching de React
    if (editingRef.current) {
      const cx = e.clientX, cy = e.clientY;
      if (moveRafRef.current !== null) cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = requestAnimationFrame(() => {
        moveRafRef.current = null;
        const pt = snapToDark(toCanvasPx(cx, cy));
        setEditing(ed => ed ? { ...ed, pos: pt } : ed);
        drawLoupe(pt, cx, cy);
      });
      return;
    }
    // Drag-to-draw de line/calibrate — preview en vivo + lupa
    if (lineDragActive.current) {
      const cx = e.clientX, cy = e.clientY;
      if (moveRafRef.current !== null) cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = requestAnimationFrame(() => {
        moveRafRef.current = null;
        const pt = snapToDark(toCanvasPx(cx, cy));
        setDrawing(d => d.length >= 1 ? [d[0], pt] : [pt]);
        drawLoupe(pt, cx, cy);
      });
      return;
    }
    if (!panActive.current) return;
    setPan({
      x: panOrigin.current.px + (e.clientX - panOrigin.current.mx),
      y: panOrigin.current.py + (e.clientY - panOrigin.current.my),
    });
  };

  // Persiste el endpoint editado al soltar
  const commitEndpointEdit = () => {
    const ed = editingRef.current;
    if (!ed) return;
    const m = measurements.find(mm => mm.id === ed.id);
    if (m) {
      const pts = [...m.parsed.points];
      pts[ed.endpoint === 'a' ? 0 : 1] = ed.pos;
      const distPx = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      // Si era calibración, mantenemos su totalReal — el usuario sólo afina la línea base.
      const totalReal = m.type === 'calibration'
        ? m.parsed.totalReal
        : (calibrationScale > 0 ? distPx / calibrationScale : 0);
      updateMeasurement.mutate({
        id: ed.id,
        data: { ...m.parsed, points: pts, totalPx: distPx, totalReal },
      });
    }
    setEditing(null);
    setLoupePos(null);
  };

  // Finaliza un segmento iniciado con drag (line / calibrate)
  const finalizeLineDrag = () => {
    lineDragActive.current = false;
    setLoupePos(null);
    if (drawing.length !== 2) { setDrawing([]); return; }
    const [a, b] = drawing;
    const distPx = Math.hypot(b.x - a.x, b.y - a.y);
    if (distPx < 4) { setDrawing([]); return; }   // descartar clicks accidentales
    if (tool === 'calibrate') {
      setPendingCalibrationPx(distPx);
      setCalibrationInput('');
      // mantener drawing visible hasta confirmar / cancelar
      return;
    }
    if (tool === 'line' && calibrationScale > 0) {
      createTracked({
        type: 'line',
        data: { points: [a, b], totalPx: distPx, totalReal: distPx / calibrationScale },
        calibrationScale,
        page: currentPage,
      });
      setDrawing([]);
    } else {
      setDrawing([]);
    }
  };

  const handleMouseUp = () => {
    if (editingRef.current) { commitEndpointEdit(); setLoupePos(null); return; }
    if (lineDragActive.current) { finalizeLineDrag(); return; }
    panActive.current = false;
  };

  // Zoom con un factor dado, anclado al centro del viewport (para botones +/−).
  const zoomAroundCenter = (factor: number) => {
    const node = viewportRef.current;
    if (!node) return;
    const cx = node.clientWidth / 2, cy = node.clientHeight / 2;
    setZoom(prev => {
      const next = clampZoom(prev * factor);
      if (next === prev) return prev;
      const ratio = next / prev;
      setPan(p => ({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio }));
      return next;
    });
  };

  // Zoom con la rueda — manteniendo bajo el cursor el mismo punto del plano.
  // Se usa addEventListener nativo con { passive:false } para poder cancelar el scroll de la página.
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Zoom continuo: factor proporcional al delta de la rueda (suave en trackpad, firme en mouse).
      const intensity = Math.min(1, Math.abs(e.deltaY) / 100);
      const step = Math.pow(ZOOM_WHEEL_FACTOR, intensity);
      const factor = e.deltaY < 0 ? step : 1 / step;
      const rect = node.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      setZoom(prev => {
        const next = clampZoom(prev * factor);
        if (next === prev) return prev;
        const ratio = next / prev;
        setPan(p => ({
          x: mx - (mx - p.x) * ratio,
          y: my - (my - p.y) * ratio,
        }));
        return next;
      });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  // Doble click finaliza polyline/polygon
  const finalizePolyShape = () => {
    if (drawing.length < 2 || calibrationScale === 0) {
      if (calibrationScale === 0) alert(t('webProto.calibrateFirst'));
      setDrawing([]);
      return;
    }
    let totalPx = 0;
    for (let i = 1; i < drawing.length; i++) {
      totalPx += Math.hypot(drawing[i].x - drawing[i - 1].x, drawing[i].y - drawing[i - 1].y);
    }
    if (tool === 'polygon') {
      // cerrar polígono
      const closed = [...drawing, drawing[0]];
      let perimPx = 0;
      for (let i = 1; i < closed.length; i++) {
        perimPx += Math.hypot(closed[i].x - closed[i - 1].x, closed[i].y - closed[i - 1].y);
      }
      // shoelace
      let areaPx = 0;
      for (let i = 0; i < drawing.length; i++) {
        const a = drawing[i], b = drawing[(i + 1) % drawing.length];
        areaPx += a.x * b.y - b.x * a.y;
      }
      areaPx = Math.abs(areaPx) / 2;
      const sm2 = calibrationScale * calibrationScale;
      createTracked({
        type: 'polygon',
        data: {
          points: drawing,
          areaPx, areaReal: areaPx / sm2,
          perimPx, perimReal: perimPx / calibrationScale,
          closed: true,
        },
        calibrationScale,
        page: currentPage,
      });
    } else {
      createTracked({
        type: 'polyline',
        data: { points: drawing, totalPx, totalReal: totalPx / calibrationScale },
        calibrationScale,
        page: currentPage,
      });
    }
    setDrawing([]);
  };

  const confirmCalibration = async () => {
    // Aceptar coma o punto como separador decimal (locale ES)
    const normalized = (calibrationInput ?? '').toString().trim().replace(',', '.');
    const realM = Number(normalized);
    if (!isFinite(realM) || realM <= 0) {
      alert(t('webProto.enterValidDistance'));
      return;
    }
    if (!pendingCalibrationPx || drawing.length !== 2) {
      alert(t('webProto.redrawCalibration'));
      setPendingCalibrationPx(null);
      setDrawing([]);
      return;
    }
    const newScale = pendingCalibrationPx / realM;
    try {
      // Reemplazar calibración previa de esta página (espejo del móvil)
      if (calibrationMeasurement) {
        await deleteMeasurement.mutateAsync(calibrationMeasurement.id);
      }
      await createMeasurement.mutateAsync({
        type: 'calibration',
        data: { points: drawing, totalPx: pendingCalibrationPx, totalReal: realM },
        calibrationScale: newScale,
        page: currentPage,
      });
    } catch (e: any) {
      alert(t('webProto.couldNotSaveCalibration', { msg: e?.message ?? e }));
      return;
    }
    setDrawing([]);
    setPendingCalibrationPx(null);
    setCalibrationInput('');
    setTool('pan');
  };

  // Etiqueta de medida estilo móvil: pill blanca con texto coloreado, rotada con el segmento
  const renderLineLabel = (a: Pt, b: Pt, label: string, color: string) => {
    if (!label) return null;
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (angle > 90 || angle < -90) angle += 180; // mantener legible
    const w = label.length * 6.2 + 8;
    const h = 14;
    return (
      <g transform={`translate(${cx} ${cy}) rotate(${angle}) translate(0 -10)`} pointerEvents="none">
        <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="rgba(255,255,255,0.92)" rx={3} />
        <text x={0} y={0} fill={color} fontSize="11" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
          {label}
        </text>
      </g>
    );
  };

  const formatDist = (m: number) => m >= 1 ? `${m.toFixed(2)} m` : `${(m * 100).toFixed(1)} cm`;

  // ── Render trazos guardados ──────────────────────────────────────────────
  // Todos los puntos están en "base canvas px" (zoom 1). Aquí los escalamos por `zoom`
  // antes de pasarlos al SVG. Tamaños visuales (handles, texto, stroke) NO se multiplican
  // para que se mantengan constantes en pantalla independientemente del zoom.
  const renderMeasurements = () => pageMeasurements.map(m => {
    const isSel = m.id === selectedId;
    const stroke = colorFor(m.type, isSel);
    const sw = isSel ? 2.5 : 2;
    const markerStart = m.type === 'line' || m.type === 'calibration' ? `url(#arrowS-${m.type})` : undefined;
    const markerEnd   = m.type === 'line' || m.type === 'calibration' ? `url(#arrowE-${m.type})` : undefined;

    if (m.type === 'line' || m.type === 'calibration') {
      const [a, b] = m.parsed.points;
      if (!a || !b) return null;
      // El editor puede estar arrastrando este endpoint: usar la posición efímera
      const aBase = editing?.id === m.id && editing.endpoint === 'a' ? editing.pos : a;
      const bBase = editing?.id === m.id && editing.endpoint === 'b' ? editing.pos : b;
      const ea = sp(aBase), eb = sp(bBase);
      const real = m.parsed.totalReal ?? 0;
      const label = m.type === 'calibration' ? t('webProto.refSuffix', { dist: formatDist(real) }) : formatDist(real);
      return (
        <g key={m.id} onClick={(e) => { e.stopPropagation(); setSelectedId(m.id); }} style={{ cursor: 'pointer' }}>
          <line x1={ea.x} y1={ea.y} x2={eb.x} y2={eb.y}
                stroke={stroke} strokeWidth={sw} strokeLinecap="round"
                markerStart={markerStart} markerEnd={markerEnd} />
          {renderLineLabel(ea, eb, label, stroke)}
          {isSel && [['a', ea], ['b', eb]].map(([key, pt]) => {
            const p = pt as Pt;
            return (
              <circle key={key as string} cx={p.x} cy={p.y} r={6}
                fill="#fff" stroke={stroke} strokeWidth={2}
                style={{ cursor: 'grab' }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  startEndpointEdit(m, key as 'a' | 'b');
                }} />
            );
          })}
        </g>
      );
    }
    if (m.type === 'polyline') {
      const scaled = m.parsed.points.map(sp);
      const pts = scaled.map(p => `${p.x},${p.y}`).join(' ');
      const last = scaled[scaled.length - 1];
      return (
        <g key={m.id} onClick={(e) => { e.stopPropagation(); setSelectedId(m.id); }} style={{ cursor: 'pointer' }}>
          <polyline points={pts} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          {last && (
            <text x={last.x} y={last.y - 6} fill={stroke} fontSize="11" fontWeight="bold">
              {formatDist(m.parsed.totalReal ?? 0)}
            </text>
          )}
          {isSel && scaled.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#fff" stroke={stroke} strokeWidth={1.5} />
          ))}
          {showAngles && renderAngles(scaled, false, stroke)}
        </g>
      );
    }
    if (m.type === 'polygon') {
      const scaled = m.parsed.points.map(sp);
      const pts = scaled.map(p => `${p.x},${p.y}`).join(' ');
      const cx = scaled.reduce((s, p) => s + p.x, 0) / scaled.length;
      const cy = scaled.reduce((s, p) => s + p.y, 0) / scaled.length;
      return (
        <g key={m.id} onClick={(e) => { e.stopPropagation(); setSelectedId(m.id); }} style={{ cursor: 'pointer' }}>
          <polygon points={pts} fill={stroke + '1f'} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          {showAreaLabels && (
            <g pointerEvents="none">
              <rect x={cx - 32} y={cy - 8} width={64} height={16} fill="rgba(255,255,255,0.92)" rx={3} />
              <text x={cx} y={cy} fill={stroke} fontSize="11" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
                {(m.parsed.areaReal ?? 0).toFixed(2)} m²
              </text>
            </g>
          )}
          {isSel && scaled.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#fff" stroke={stroke} strokeWidth={1.5} />
          ))}
          {showAngles && renderAngles(scaled, true, stroke)}
        </g>
      );
    }
    return null;
  });

  // Etiquetas de ángulos en cada vértice de una polilínea/polígono
  const renderAngles = (pts: Pt[], closed: boolean, stroke: string) => {
    if (pts.length < 3) return null;
    const labels: React.ReactNode[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const isEnd = !closed && (i === 0 || i === n - 1);
      if (isEnd) continue;
      const prev = pts[(i - 1 + n) % n];
      const next = pts[(i + 1) % n];
      const ang = angleAt(prev, pts[i], next);
      if (!isFinite(ang)) continue;
      labels.push(
        <text key={`a-${i}`} x={pts[i].x + 6} y={pts[i].y - 6} fill={stroke} fontSize="9" fontWeight="bold">
          {ang.toFixed(0)}°
        </text>
      );
    }
    return <>{labels}</>;
  };

  // Preview "en vivo" mientras el usuario dibuja. Mismo color que tendrá el trazo final
  // (espejo del móvil) pero con opacity 0.7 y flechas en líneas / calibración desde el primer
  // momento, en vez del clásico verde discontinuo.
  const renderDrawing = () => {
    if (drawing.length === 0) return null;
    const scaled = drawing.map(sp);

    if (tool === 'calibrate' || tool === 'line') {
      const c = tool === 'calibrate' ? COLOR.calibration : COLOR.measure;
      const markerId = tool === 'calibrate' ? 'calibration' : 'line';
      if (scaled.length < 2) {
        return <circle cx={scaled[0].x} cy={scaled[0].y} r={4} fill={c} opacity={0.7} />;
      }
      const [a, b] = scaled;
      return (
        <g opacity={0.7}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={c} strokeWidth={2} strokeLinecap="round"
            markerStart={`url(#arrowS-${markerId})`}
            markerEnd={`url(#arrowE-${markerId})`} />
        </g>
      );
    }
    if (tool === 'polyline' || tool === 'polygon') {
      const c = tool === 'polygon' ? COLOR.polygon : COLOR.polyline;
      const pts = scaled.map(p => `${p.x},${p.y}`).join(' ');
      return (
        <g opacity={0.7}>
          {tool === 'polygon' && scaled.length >= 3 && (
            <polygon points={pts} fill={c + '1f'} stroke="none" />
          )}
          <polyline points={pts} fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {scaled.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#fff" stroke={c} strokeWidth={1.5} />
          ))}
        </g>
      );
    }
    return null;
  };


  // ── Save calc state to selected element ──────────────────────────────────
  const saveCalcState = (state: Partial<CalcState>) => {
    if (!selected) return;
    const merged = { ...selected.parsed, calcState: { ...(selected.parsed.calcState ?? {}), ...state } };
    updateMeasurement.mutate({ id: selected.id, data: merged });
  };

  // Exporta el plano actual + las mediciones a PDF (vía Electron si está, sino window.print)
  const handleExportPlan = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      // Estrategia: re-render SVG sobre el canvas del PDF en alta resolución, luego open print dialog
      const pdfCanvas = pageRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
      if (!pdfCanvas) throw new Error(t('webProto.canvasNotAvailable'));

      // Compongo PDF + SVG en un único canvas
      const out = document.createElement('canvas');
      out.width  = pdfCanvas.width;
      out.height = pdfCanvas.height;
      const octx = out.getContext('2d')!;
      octx.drawImage(pdfCanvas, 0, 0);

      // Serializar SVG y dibujarlo encima
      const svgEl = pageRef.current?.querySelector('svg');
      if (svgEl) {
        const cloned = svgEl.cloneNode(true) as SVGSVGElement;
        // tamaño explícito para que rasterice al tamaño del backing-store del pdf
        cloned.setAttribute('width',  String(pdfCanvas.width));
        cloned.setAttribute('height', String(pdfCanvas.height));
        const xml = new XMLSerializer().serializeToString(cloned);
        const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => { octx.drawImage(img, 0, 0, out.width, out.height); URL.revokeObjectURL(url); resolve(); };
          img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t('webProto.couldNotRasterizeOverlay'))); };
          img.src = url;
        });
      }

      // Datauri + abrir ventana de impresión
      const dataUrl = out.toDataURL('image/png');
      const w = window.open('', '_blank', 'width=900,height=700');
      if (!w) { alert(t('webProto.popupBlocker')); return; }
      const title = (plan?.name ?? t('webProto.plans')) + ' — ' + new Date().toLocaleString('es-PE');
      w.document.write(`<!doctype html><html><head><title>${title}</title>
        <style>@page { size: auto; margin: 8mm; } html,body{margin:0;padding:0;} img{max-width:100%;height:auto;display:block;} .ft{font:11px sans-serif;color:#444;text-align:right;padding-top:6px}</style>
        </head><body onload="setTimeout(()=>{window.print();window.close();},400)">
        <img src="${dataUrl}"/><p class="ft">${title}</p></body></html>`);
      w.document.close();
    } catch (e: any) {
      alert(t('webProto.couldNotExport', { msg: e?.message ?? e }));
    } finally {
      setExporting(false);
    }
  };

  if (planLoading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  const selectedKind: 'polyline' | 'polygon' | null =
    selected?.type === 'polygon' ? 'polygon'
    : selected?.type === 'polyline' ? 'polyline'
    : null;

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <PageHeader
        title={t('webProto.measureModeTitle')}
        subtitle={plan?.name}
        crumbs={[
          { label: t('webProto.projects'), href: '/app/projects' },
          { label: project?.name ?? '…', href: `/app/projects/${projectId}/plans` },
          { label: plan?.name ?? '…' },
        ]}
        rightContent={
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white">
            <ArrowLeft size={14} /> {t('webProto.back')}
          </button>
        }
      />

      {/* Toolbar */}
      <div className="bg-white border-b border-border px-3 py-2 flex items-center gap-1.5 flex-wrap">
        {([
          { key: 'pan',       label: t('webProto.toolPan'),       Icon: Hand },        // mobile: hand-left-outline
          { key: 'calibrate', label: t('webProto.toolCalibrate'), Icon: Scale },       // mobile: scale-balance
          { key: 'line',      label: t('webProto.toolLine'),      Icon: Ruler },       // mobile: vector-line
          { key: 'polyline',  label: t('webProto.toolPolyline'),  Icon: Waypoints },   // mobile: chart-timeline-variant
          { key: 'polygon',   label: t('webProto.toolPolygon'),   Icon: Square },      // mobile: vector-square
        ] as { key: Tool; label: string; Icon: LucideIcon }[]).map(opt => (
          <button key={opt.key} onClick={() => { setTool(opt.key); setDrawing([]); lineDragActive.current = false; }}
            className={cn('flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-bold border transition',
              tool === opt.key ? 'bg-navy text-white border-navy' : 'border-border text-muted hover:text-navy')}>
            <opt.Icon size={13} />
            {opt.label}
          </button>
        ))}

        <div className="w-px h-5 bg-border mx-1" />

        {/* Undo / Redo */}
        <button onClick={undo} disabled={undoStackRef.current.length === 0}
          title={t('webProto.undoLastStroke')}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-bold border border-border text-muted hover:text-navy disabled:opacity-40">
          <Undo2 size={13} />
        </button>
        <button onClick={redo} disabled={redoStackRef.current.length === 0}
          title={t('webProto.redo')}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-bold border border-border text-muted hover:text-navy disabled:opacity-40">
          <Redo2 size={13} />
        </button>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Toggles de visualización */}
        <button onClick={() => setShowAreaLabels(v => !v)}
          title={t('webProto.toggleAreaLabels')}
          className={cn('flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-bold border transition',
            showAreaLabels ? 'bg-navy/10 border-navy text-navy' : 'border-border text-muted hover:text-navy')}>
          <Square size={13} /> A
        </button>
        <button onClick={() => setShowAngles(v => !v)}
          title={t('webProto.toggleAngles')}
          className={cn('flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-bold border transition',
            showAngles ? 'bg-navy/10 border-navy text-navy' : 'border-border text-muted hover:text-navy')}>
          <Triangle size={13} /> θ°
        </button>
        <button onClick={() => setSnapEnabled(v => !v)}
          title={t('webProto.toggleSnap')}
          className={cn('flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-bold border transition',
            snapEnabled ? 'bg-navy/10 border-navy text-navy' : 'border-border text-muted hover:text-navy')}>
          <Magnet size={13} />
        </button>

        {/* Activo solo mientras se construye polilínea/polígono */}
        {(tool === 'polyline' || tool === 'polygon') && drawing.length >= 1 && (
          <>
            <button onClick={() => setDrawing(d => d.slice(0, -1))}
              title={t('webProto.removeLastPoint')}
              className="ml-2 px-2 py-1.5 rounded-md text-xs font-bold border border-warning text-warning hover:bg-warning/10">
              <CornerUpLeft size={13} />
            </button>
            {drawing.length >= 2 && (
              <button onClick={finalizePolyShape} className="px-3 py-1.5 rounded-md text-xs font-bold bg-success text-white">
                <Check size={13} className="inline mr-1" /> {t('webProto.donePts', { n: drawing.length })}
              </button>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {/* Info del seleccionado — espejo del SelectionInfoCarousel del móvil */}
          {selected && <SelectionInfo m={selected} />}
          <span className="text-xs text-muted">
            {calibrationScale > 0 ? t('webProto.scaleLabel', { scale: calibrationScale.toFixed(0) }) : t('webProto.scaleNotCalibrated')}
          </span>
          <button onClick={handleExportPlan}
            title={t('webProto.exportPlanPdf')}
            disabled={exporting}
            className="px-2 py-1.5 rounded-md text-xs font-bold border border-border text-muted hover:text-navy disabled:opacity-40">
            {exporting ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
          </button>
          {selected && (
            <button onClick={() => deleteMeasurement.mutate(selected.id)}
              className="px-2 py-1 rounded text-xs font-semibold text-danger border border-danger hover:bg-danger/10">
              <Trash2 size={12} className="inline mr-1" /> {t('webProto.delete')}
            </button>
          )}
        </div>
      </div>

      {/* Calibration prompt */}
      {pendingCalibrationPx != null && (
        <div className="bg-warning/10 border-b border-warning/30 px-4 py-2 flex items-center gap-2">
          <span className="text-xs font-bold text-warning">{t('webProto.calibrateMetersQuestion')}</span>
          <input
            type="text"
            inputMode="decimal"
            value={calibrationInput}
            onChange={e => setCalibrationInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmCalibration(); } }}
            placeholder={t('webProto.calibratePlaceholder')}
            className="border border-border rounded px-2 py-1 text-xs w-24"
            autoFocus
          />
          <button onClick={confirmCalibration} className="bg-success text-white text-xs font-bold px-3 py-1 rounded">
            <Check size={12} className="inline mr-1" /> {t('webProto.confirm')}
          </button>
          <button onClick={() => { setPendingCalibrationPx(null); setDrawing([]); setCalibrationInput(''); }}
            className="text-muted text-xs px-2"><X size={12} className="inline" /></button>
        </div>
      )}

      {/* Viewport */}
      <div ref={viewportRef}
        className="flex-1 relative overflow-hidden bg-gray-900 select-none"
        style={{ cursor: tool === 'pan' ? 'grab' : 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={() => { if (tool === 'polyline' || tool === 'polygon') finalizePolyShape(); }}
      >
        {pdfUrl ? (
          <div ref={pageRef} style={{ position: 'absolute', left: pan.x, top: pan.y }}>
            <Document file={pdfUrl} onLoadSuccess={d => setNumPages(d.numPages)}>
              <Page
                pageNumber={currentPage}
                scale={zoom}
                onRenderSuccess={onPageRenderSuccess}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Document>
            <svg className="absolute inset-0 pointer-events-none" width={pagePx.w} height={pagePx.h}
              style={{ overflow: 'visible' }}>
              <defs>
                {/* Marcadores de flecha — uno por color para que el fill coincida con el stroke */}
                {([
                  { id: 'line',        color: COLOR.measure },
                  { id: 'calibration', color: COLOR.calibration },
                ]).map(({ id, color }) => (
                  <g key={id}>
                    <marker id={`arrowE-${id}`} markerWidth="10" markerHeight="10" refX="8" refY="3"
                      orient="auto" markerUnits="strokeWidth">
                      <path d="M0,0 L8,3 L0,6 L2,3 Z" fill={color} />
                    </marker>
                    <marker id={`arrowS-${id}`} markerWidth="10" markerHeight="10" refX="0" refY="3"
                      orient="auto" markerUnits="strokeWidth">
                      <path d="M8,0 L0,3 L8,6 L6,3 Z" fill={color} />
                    </marker>
                  </g>
                ))}
              </defs>
              <g style={{ pointerEvents: 'auto' }}>
                {renderMeasurements()}
                {renderDrawing()}
              </g>
            </svg>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-white/60 text-sm">{t('webProto.couldNotLoadPlan')}</div>
        )}

        {/* Controles flotantes */}
        {numPages > 1 && (
          <div className="absolute bottom-4 left-4 flex items-center gap-1 z-10">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="w-8 h-8 bg-white/90 rounded-lg flex items-center justify-center disabled:opacity-30">
              <ChevronLeft size={16} />
            </button>
            <span className="text-white text-xs font-bold bg-black/50 rounded px-2 py-1">{currentPage} / {numPages}</span>
            <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage === numPages}
              className="w-8 h-8 bg-white/90 rounded-lg flex items-center justify-center disabled:opacity-30">
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        <div className="absolute bottom-4 right-4 flex flex-col items-center gap-1 z-10">
          <button onClick={() => zoomAroundCenter(ZOOM_BTN_FACTOR)} disabled={zoom >= ZOOM_MAX}
            className="w-8 h-8 bg-white/90 rounded-lg flex items-center justify-center disabled:opacity-40"><ZoomIn size={15} /></button>
          <span className="text-white text-[10px] font-bold bg-black/50 rounded px-1.5 py-0.5">{Math.round(zoom * 100)}%</span>
          <button onClick={() => zoomAroundCenter(1 / ZOOM_BTN_FACTOR)} disabled={zoom <= ZOOM_MIN}
            className="w-8 h-8 bg-white/90 rounded-lg flex items-center justify-center disabled:opacity-40"><ZoomOut size={15} /></button>
          <button onClick={() => { setZoom(ZOOM_DEFAULT); hasCentered.current = false; }}
            className="w-8 h-8 bg-white/90 rounded-lg flex items-center justify-center mt-1"><Maximize size={13} /></button>
        </div>

        {/* FABs de metrados — siempre visibles. Si no hay trazo seleccionado, avisa. */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10 bg-white rounded-full shadow-xl px-2 py-1.5 border border-border">
          {([
            // Iconos espejo del móvil: wall, cube-outline, checkerboard
            { key: 'bricks', title: t('webProto.bricks'), bg: '#c0392b', Icon: BrickWall, kinds: ['polyline', 'polygon'] as ('polyline' | 'polygon')[], onOpen: () => setShowBrick(true) },
            { key: 'volume', title: t('webProto.volume'), bg: '#1565c0', Icon: Cuboid,    kinds: ['polyline', 'polygon'] as ('polyline' | 'polygon')[], onOpen: () => setShowVolume(true) },
            { key: 'tiles',  title: t('webProto.tiles'),  bg: '#7c4dff', Icon: Grid2x2,   kinds: ['polygon']             as ('polyline' | 'polygon')[], onOpen: () => setShowTile(true) },
          ]).map(fab => (
            <button
              key={fab.key}
              title={fab.title}
              onClick={() => {
                if (!selectedKind) {
                  alert(t('webProto.selectStrokeFirst'));
                  return;
                }
                if (!fab.kinds.includes(selectedKind)) {
                  alert(t('webProto.requiresClosedArea', { name: fab.title }));
                  return;
                }
                fab.onOpen();
              }}
              className="w-10 h-10 rounded-full text-white flex items-center justify-center transition hover:opacity-90"
              style={{ backgroundColor: fab.bg }}
            >
              <fab.Icon size={18} />
            </button>
          ))}
          {selected?.parsed.calcState?.bricks && (
            <span className="text-[10px] font-bold text-navy bg-surface rounded-full px-2 py-1 self-center">🧱 {selected.parsed.calcState.bricks.totalBricks}</span>
          )}
          {selected?.parsed.calcState?.volume && (
            <span className="text-[10px] font-bold text-navy bg-surface rounded-full px-2 py-1 self-center">📦 {selected.parsed.calcState.volume.totalM3.toFixed(2)} m³</span>
          )}
          {selected?.parsed.calcState?.tiles && (
            <span className="text-[10px] font-bold text-navy bg-surface rounded-full px-2 py-1 self-center">🔲 {selected.parsed.calcState.tiles.totalTiles}</span>
          )}
        </div>

        {/* Lupa: visible mientras se edita un endpoint */}
        <canvas
          ref={loupeRef}
          width={LOUPE_SIZE}
          height={LOUPE_SIZE}
          className="absolute pointer-events-none rounded-full shadow-lg z-20"
          style={{
            width: LOUPE_SIZE,
            height: LOUPE_SIZE,
            border: '2px solid rgba(220,30,30,0.8)',
            backgroundColor: '#fff',
            display: loupePos ? 'block' : 'none',
            left: loupePos?.left ?? 0,
            top:  loupePos?.top ?? 0,
          }}
        />
      </div>

      {/* Modales */}
      {selected && selectedKind && (
        <>
          <BrickCalculatorModal
            open={showBrick}
            kind={selectedKind}
            perimeter={selected.parsed.perimReal ?? selected.parsed.totalReal}
            area={selected.parsed.areaReal}
            initialState={selected.parsed.calcState?.bricks}
            onSave={(state: BrickCalcState) => { saveCalcState({ bricks: state }); setShowBrick(false); }}
            onClose={() => setShowBrick(false)}
          />
          <VolumeCalculatorModal
            open={showVolume}
            kind={selectedKind}
            perimeter={selected.parsed.perimReal ?? selected.parsed.totalReal}
            area={selected.parsed.areaReal}
            initialState={selected.parsed.calcState?.volume}
            onSave={(state: VolumeCalcState) => { saveCalcState({ volume: state }); setShowVolume(false); }}
            onClose={() => setShowVolume(false)}
          />
          {selectedKind === 'polygon' && (
            <TileCalculatorModal
              open={showTile}
              area={selected.parsed.areaReal ?? 0}
              initialState={selected.parsed.calcState?.tiles}
              onSave={(state: TileCalcState) => { saveCalcState({ tiles: state }); setShowTile(false); }}
              onClose={() => setShowTile(false)}
            />
          )}
        </>
      )}

      <FloatingCalculator />
    </div>
  );
}

// Info compacta del trazo seleccionado — espejo del SelectionInfoCarousel móvil
// pero sin rotación porque hay espacio horizontal suficiente.
function SelectionInfo({ m }: { m: MeasurementWithData }) {
  const { t } = useI18n();
  const items: { label: string; value: string; cls: string }[] = [];
  if (m.type === 'line' || m.type === 'calibration') {
    items.push({
      label: m.type === 'calibration' ? t('webProto.selCalibration') : t('webProto.selLine'),
      value: fmt(m.parsed.totalReal, 'm'),
      cls: m.type === 'calibration' ? 'text-[#ff8c00]' : 'text-[#dc1e1e]',
    });
  } else if (m.type === 'polyline') {
    items.push({ label: t('webProto.selPath'), value: fmt(m.parsed.totalReal, 'm'), cls: 'text-[#9c27b0]' });
    if (m.parsed.areaReal) items.push({ label: t('webProto.selArea'), value: fmt(m.parsed.areaReal, 'm²'), cls: 'text-[#9c27b0]' });
  } else if (m.type === 'polygon') {
    items.push({ label: t('webProto.selArea'), value: fmt(m.parsed.areaReal, 'm²'), cls: 'text-[#0064dc]' });
    if (m.parsed.perimReal) items.push({ label: t('webProto.selPerimeter'), value: fmt(m.parsed.perimReal, 'm'), cls: 'text-[#0064dc]' });
  }
  const cs = m.parsed.calcState;
  if (cs?.bricks)  items.push({ label: '🧱', value: `${cs.bricks.totalBricks}`,            cls: 'text-[#c0392b]' });
  if (cs?.volume)  items.push({ label: '📦', value: `${cs.volume.totalM3.toFixed(2)} m³`,  cls: 'text-[#1565c0]' });
  if (cs?.tiles)   items.push({ label: '🔲', value: `${cs.tiles.totalTiles}`,              cls: 'text-[#7c4dff]' });

  if (items.length === 0) return null;
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-surface border border-border">
      {items.map((it, i) => (
        <span key={i} className="text-[11px] font-bold flex items-center gap-1">
          <span className="text-muted">{it.label}:</span>
          <span className={it.cls}>{it.value}</span>
        </span>
      ))}
    </div>
  );
}

function fmt(v: number | undefined, unit: string) {
  if (v == null) return '—';
  if (v >= 1) return `${v.toFixed(2)} ${unit}`;
  return unit === 'm' ? `${(v * 100).toFixed(1)} cm` : `${(v * 10000).toFixed(0)} cm²`;
}
