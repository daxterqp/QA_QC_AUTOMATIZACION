import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, TextInput, Dimensions, PanResponder, Modal,
  ActivityIndicator, Image, Linking,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import Pdf from 'react-native-pdf';
import {
  database, plansCollection, planAnnotationsCollection,
  annotationCommentsCollection, annotationCommentPhotosCollection,
  usersCollection, protocolsCollection, projectsCollection, locationsCollection,
} from '@db/index';
import { useAuth } from '@context/AuthContext';
import { useTour } from '@context/TourContext';
import { useTourStep, useTourStepWithLayout } from '@hooks/useTourStep';
import { Q } from '@nozbe/watermelondb';
import type Plan from '@models/Plan';
import type PlanAnnotation from '@models/PlanAnnotation';
import type AnnotationComment from '@models/AnnotationComment';
import type AnnotationCommentPhoto from '@models/AnnotationCommentPhoto';
import { Colors, Shadow, Radius } from '../theme/colors';
import { pushProjectToSupabase } from '@services/SupabaseSyncService';
import { supabase } from '@config/supabase';
import { downloadFromS3 } from '@services/S3Service';
import { s3ProjectPrefix } from '@config/aws';
import { notifyNewAnnotation, notifyNewReply } from '@services/NotificationService';
import AppHeader from '@components/AppHeader';
import { PriorityChip, PrioritySelector, PriorityPickerModal, Priority } from '@components/PriorityChip';
import { useI18n } from '@i18n/index';

const { width: SCREEN_W } = Dimensions.get('window');
const PDF_H_BASE = 440;
const ZOOM_LEVELS = [1, 1.5, 2, 2.5] as const;
type ZoomLevel = typeof ZOOM_LEVELS[number];

type Props = NativeStackScreenProps<RootStackParamList, 'PlanViewer'>;

interface PendingRect { x: number; y: number; width: number; height: number; }
interface PendingDot  { x: number; y: number; }

/** Datos de anotación pre-guardada (cuando usuario pide cámara antes de confirmar) */
interface PreSavedAnn { annotationId: string; commentId: string; }

export default function PlanViewerScreen({ navigation, route }: Props) {
  const { planId: initialPlanId, planName: initialPlanName, protocolId, annotationId: highlightAnnotationId, locationId } = route.params;
  const { currentUser } = useAuth();
  const { t } = useI18n();
  const { isActive: tourActive, currentStep: tourStep, nextStep: tourNextStep, jumpToStep, isContextual, dismissTour, unregisterMeasure } = useTour();
  const mainScrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  // Tour refs
  const pdfAreaRef = useTourStep('plan_viewer_pdf_area');
  const drawToggleRef = useTourStep('plan_viewer_draw_toggle');
  const { ref: annotationListRef, onLayout: annotationListLayout } = useTourStepWithLayout('plan_viewer_annotation_list');
  const { ref: zoomBarRef, onLayout: zoomBarLayout } = useTourStepWithLayout('plan_zoom_options');
  const dwgBtnRef = useTourStep('plan_dwg_btn');
  const measurementBtnRef = useTourStep('plan_measurement_btn');
  const planSelectorRef = useTourStep('plan_selector');
  const annotationExpandRef = useTourStep('plan_annotation_expand');
  const { ref: planHeaderRef, onLayout: planHeaderLayout } = useTourStepWithLayout('plan_header_info');
  const { ref: replyBtnRef, onLayout: replyBtnLayout } = useTourStepWithLayout('plan_reply_btn');
  const { ref: replyFormRef, onLayout: replyFormLayout } = useTourStepWithLayout('plan_reply_form');

  const [activePlanId, setActivePlanId] = useState(initialPlanId);
  const [activePlanName, setActivePlanName] = useState(initialPlanName);
  const [locationPlans, setLocationPlans] = useState<Plan[]>([]);
  const [showPlanDropdown, setShowPlanDropdown] = useState(false);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  const [protocolNumber, setProtocolNumber] = useState<string | null>(null);
  const [protocolLocation, setProtocolLocation] = useState<string | null>(null);
  const [locationOnly, setLocationOnly] = useState<string | null>(null);
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<PlanAnnotation[]>([]);
  const [pdfLoading, setPdfLoadingState] = useState(true);
  const pdfLoadingRef = useRef(true);
  // Setter base (sincroniza ref + state)
  const setPdfLoading = useCallback((v: boolean) => {
    pdfLoadingRef.current = v;
    setPdfLoadingState(v);
  }, []);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [fileReady, setFileReady] = useState<boolean | null>(null); // null=verificando, true=existe, false=falta
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [isDrawing, setIsDrawing] = useState(false);
  const [pendingRect, setPendingRect] = useState<PendingRect | null>(null);
  const [pendingDot, setPendingDot] = useState<PendingDot | null>(null);
  const [comment, setComment] = useState('');
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [priority, setPriority] = useState<Priority | null>(null);
  const [priorityPickerForAnnId, setPriorityPickerForAnnId] = useState<string | null>(null);

  const updateAnnotationPriority = useCallback(async (annId: string, newPriority: Priority | null) => {
    // Guard: solo aceptamos valores válidos. Un valor inválido haría que el upsert a Supabase
    // fallara silencioso contra el CHECK constraint (priority IN 'low'|'medium'|'high'|null).
    if (newPriority !== null && !['low', 'medium', 'high'].includes(newPriority)) {
      console.warn('[Annotation] priority inválido, ignorando:', newPriority);
      return;
    }
    try {
      let projectIdForSync: string | null = null;
      await database.write(async () => {
        const ann = await planAnnotationsCollection.find(annId);
        await ann.update((a: any) => { a.priority = newPriority; });
        // Resolver projectId vía el plano para sincronizar después.
        try {
          const pl = await plansCollection.find((ann as any).planId);
          projectIdForSync = (pl as any).projectId ?? null;
        } catch { /* ignore */ }
      });
      if (projectIdForSync) {
        pushProjectToSupabase(projectIdForSync).catch(() => {});
      }
    } catch (e) { console.warn('[Annotation] priority update error:', e); }
  }, []);

  const hScrollRef = useRef(0); // scroll horizontal offset del PDF
  const hScrollViewRef = useRef<ScrollView>(null); // ref al ScrollView horizontal

  // Fotos pendientes en el modal de creación (pre-guardadas antes de confirmar)
  const [preSavedAnn, setPreSavedAnn] = useState<PreSavedAnn | null>(null);
  const [pendingModalPhotos, setPendingModalPhotos] = useState<AnnotationCommentPhoto[]>([]);

  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);

  const startPos = useRef({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<ZoomLevel>(1);
  // pendingZoom = lo que el usuario acaba de elegir (feedback visual inmediato).
  // El zoom real (que recarga el PDF) se aplica cuando pasan 400ms sin más toques
  // Y el PDF anterior terminó de cargar (onLoadComplete + 200ms de margen).
  // pendingZoom = feedback visual inmediato. El zoom real se aplica después de
  // 2 s desde la última aplicación (la primera vez arranca con el load inicial).
  // Durante la ventana, los clicks siguen actualizando pendingZoom; al final
  // solo se commitea el ÚLTIMO valor seleccionado.
  const [pendingZoom, setPendingZoom] = useState<ZoomLevel>(1);
  const pendingZoomRef = useRef<ZoomLevel | null>(null);
  const zoomCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAppliedAtRef = useRef<number>(Date.now());
  const zoomRefCurrent = useRef<ZoomLevel>(1);
  useEffect(() => { zoomRefCurrent.current = zoom; }, [zoom]);

  const scheduleZoomCommit = useCallback(() => {
    if (zoomCommitTimerRef.current) clearTimeout(zoomCommitTimerRef.current);
    const elapsed = Date.now() - lastAppliedAtRef.current;
    // Mínimo 2 s desde la última aplicación. Si el usuario sigue tocando,
    // 300 ms como ventana de debounce para capturar la elección final.
    const delay = Math.max(2000 - elapsed, 300);
    zoomCommitTimerRef.current = setTimeout(() => {
      zoomCommitTimerRef.current = null;
      const target = pendingZoomRef.current;
      pendingZoomRef.current = null;
      if (target != null && target !== zoomRefCurrent.current) {
        lastAppliedAtRef.current = Date.now();
        setZoom(target);
      }
    }, delay);
  }, []);

  const handleZoomChange = useCallback((z: ZoomLevel) => {
    setPendingZoom(z);
    setIsDrawing(false);
    pendingZoomRef.current = z;
    scheduleZoomCommit();
  }, [scheduleZoomCommit]);

  useEffect(() => () => {
    if (zoomCommitTimerRef.current) clearTimeout(zoomCommitTimerRef.current);
  }, []);
  const [pageAspect, setPageAspect] = useState<number>(PDF_H_BASE / SCREEN_W);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const planChangingRef = useRef(true); // cooldown inicial para cambio de plano PDF
  // Liberar cooldown inicial al montar la pantalla
  useEffect(() => {
    const t = setTimeout(() => { planChangingRef.current = false; }, 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);

  // Scroll al fondo antes de mostrar la lista de anotaciones (paso 19).
  // Limpia pre-medición obsoleta (upcomingStep pre-scroll) y usa scroll animado.
  useEffect(() => {
    if (tourActive && tourStep?.elementId === 'plan_viewer_annotation_list') {
      unregisterMeasure('plan_viewer_annotation_list');
      setTimeout(() => mainScrollRef.current?.scrollToEnd({ animated: true }), 60);
    }
  }, [tourActive, tourStep?.elementId]);

  const [hasDwg, setHasDwg] = useState(false);
  const pdfW = SCREEN_W * zoom;
  const pdfH = pdfW * pageAspect;
  const pdfWRef = useRef(pdfW);
  const pdfHRef = useRef(pdfH);
  useEffect(() => { pdfWRef.current = pdfW; pdfHRef.current = pdfH; }, [pdfW, pdfH]);

  // Timeout de seguridad: si pdfLoading lleva más de 20s sin resolverse, forzar a false
  useEffect(() => {
    if (!pdfLoading) return;
    const t = setTimeout(() => setPdfLoading(false), 20000);
    return () => clearTimeout(t);
  }, [pdfLoading]);

  // ── Hilo de comentarios (tarjeta desplegable inline) ─────────────────────
  const [selectedAnn, setSelectedAnn] = useState<PlanAnnotation | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadComments, setThreadComments] = useState<AnnotationComment[]>([]);
  const [threadPhotos, setThreadPhotos] = useState<Record<string, AnnotationCommentPhoto[]>>({});
  const [threadUserNames, setThreadUserNames] = useState<Record<string, string>>({});
  // Formulario de respuesta inline
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyPreSaved, setReplyPreSaved] = useState<string | null>(null); // commentId pre-creado
  const [replyPrePhotos, setReplyPrePhotos] = useState<AnnotationCommentPhoto[]>([]);

  // Ref para detectar retorno de cámara
  const cameraTargetRef = useRef<'creation' | 'reply' | null>(null);

  // Refs que espejan preSavedAnn y replyPreSaved para useFocusEffect con deps vacías
  // (evita que useFocusEffect se dispare cuando el estado cambia, antes de ir a Camera)
  const preSavedAnnRef = useRef<PreSavedAnn | null>(null);
  const replyPreSavedRef = useRef<string | null>(null);

  const canAnnotate = ['SUPERVISOR', 'RESIDENT', 'CREATOR'].includes(currentUser?.role ?? '');
  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';

  // Cargar número y ubicación del protocolo para el header
  useEffect(() => {
    if (!protocolId) return;
    protocolsCollection.find(protocolId).then(async (p: any) => {
      setProtocolNumber(p.protocolNumber ?? null);
      setProtocolLocation(p.locationReference ?? null);
      if (p.locationId) {
        try {
          const loc = await locationsCollection.find(p.locationId) as any;
          setLocationOnly(loc.locationOnly ?? null);
          setSpecialty(loc.specialty ?? null);
        } catch { /* sin ubicación */ }
      }
    }).catch(() => {});
  }, [protocolId]);

  // Load all plans for this location (for chip tabs)
  useEffect(() => {
    if (!locationId) return;
    plansCollection
      .query(Q.where('location_id', locationId))
      .fetch()
      .then((plans) => {
        // Deduplicar: mismo s3_key (o mismo name si no hay key) = mismo plano.
        // Mantenemos el más reciente por updatedAt.
        const byKey = new Map<string, Plan>();
        for (const p of plans) {
          const key = (p as any).s3Key || `name:${p.name}`;
          const prev = byKey.get(key);
          if (!prev || ((p as any).updatedAt ?? 0) > ((prev as any).updatedAt ?? 0)) {
            byKey.set(key, p);
          }
        }
        setLocationPlans(Array.from(byKey.values()));
      })
      .catch(() => {});
  }, [locationId]);

  // Cargar nombre del proyecto cuando se carga el plan
  useEffect(() => {
    if (!plan?.projectId) return;
    projectsCollection.query(Q.where('id', plan.projectId)).fetch()
      .then((res) => { if (res.length > 0) setProjectName((res[0] as any).name ?? ''); })
      .catch(() => {});
  }, [plan?.projectId]);

  useEffect(() => {
    let cancelled = false;
    plansCollection.find(activePlanId)
      .then((p) => { if (!cancelled) setPlan(p); })
      .catch(() => {});
    const protocolFilter = protocolId
      ? Q.where('protocol_id', protocolId)
      : Q.where('protocol_id', Q.eq(null));
    const sub = planAnnotationsCollection
      .query(Q.where('plan_id', activePlanId), protocolFilter, Q.sortBy('sequence_number', Q.asc))
      .observe()
      .subscribe((anns) => { if (!cancelled) setAnnotations(anns); });
    return () => { cancelled = true; sub.unsubscribe(); };
  }, [activePlanId]);

  // Verificar si el archivo PDF existe en el dispositivo
  useEffect(() => {
    if (!plan?.fileUri) { setFileReady(false); return; }
    setFileReady(null);
    setPdfError(null);
    setPdfLoading(true);
    FileSystem.getInfoAsync(plan.fileUri)
      .then((info) => setFileReady(info.exists))
      .catch(() => setFileReady(false));
  }, [plan?.fileUri]);

  // Comprobar si existe DWG asociado al plan activo
  useEffect(() => {
    const dwgPath = `${FileSystem.documentDirectory}plansdwg/${activePlanName}.dwg`;
    FileSystem.getInfoAsync(dwgPath)
      .then((info) => setHasDwg(info.exists))
      .catch(() => setHasDwg(false));
  }, [activePlanName]);

  const openDwg = async () => {
    const fileUri = `${FileSystem.documentDirectory}plansdwg/${activePlanName}.dwg`;
    try {
      const contentUri = await FileSystem.getContentUriAsync(fileUri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: 'application/dwg',
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });
    } catch {
      Alert.alert(t('planViewer.dwg.errorTitle'), t('planViewer.dwg.errorMsg'));
    }
  };

  const handleDownloadPdf = async () => {
    if (!projectName || !plan) return;
    setDownloadingPdf(true);
    setPdfError(null);
    try {
      const destDir = `${FileSystem.documentDirectory}plans/`;
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      const fileName = activePlanName + '.pdf';
      const localUri = `${destDir}${fileName}`;
      const s3Key = `${s3ProjectPrefix(projectName)}/plans/${fileName}`;
      await downloadFromS3(s3Key, localUri);
      await database.write(async () => {
        await plan.update((p: any) => { p.fileUri = localUri; });
      });
      setFileReady(true);
      setPdfLoading(true);
    } catch {
      setPdfError(t('planViewer.download.cloudError'));
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Recargar fotos pendientes al volver de la cámara
  // Deps vacías: usa refs para evitar que el efecto se dispare prematuramente
  // cuando preSavedAnn cambia (mientras PlanViewer sigue en foco)
  useFocusEffect(useCallback(() => {
    if (cameraTargetRef.current === 'creation' && preSavedAnnRef.current) {
      annotationCommentPhotosCollection
        .query(Q.where('annotation_comment_id', preSavedAnnRef.current.commentId))
        .fetch()
        .then(setPendingModalPhotos)
        .catch(() => {});
      setShowCommentModal(true);
    }
    if (cameraTargetRef.current === 'reply' && replyPreSavedRef.current) {
      annotationCommentPhotosCollection
        .query(Q.where('annotation_comment_id', replyPreSavedRef.current))
        .fetch()
        .then(setReplyPrePhotos)
        .catch(() => {});
    }
    cameraTargetRef.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  // Mantener refs sincronizadas con el estado (para useFocusEffect con deps vacías)
  useEffect(() => { preSavedAnnRef.current = preSavedAnn; }, [preSavedAnn]);
  useEffect(() => { replyPreSavedRef.current = replyPreSaved; }, [replyPreSaved]);

  // Zoom controlado únicamente por los botones de la barra (sin pinch-to-zoom)
  const zoomRef = useRef<ZoomLevel>(1);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // ── PanResponder ─────────────────────────────────────────────────────────
  const isDrawingRef = useRef(false);
  useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isDrawingRef.current,
      onMoveShouldSetPanResponder:  () => isDrawingRef.current,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        startPos.current = { x: locationX, y: locationY };
        setPendingRect({ x: locationX, y: locationY, width: 0, height: 0 });
        setPendingDot(null);
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        const x = Math.min(startPos.current.x, locationX);
        const y = Math.min(startPos.current.y, locationY);
        setPendingRect({ x, y, width: Math.abs(locationX - startPos.current.x), height: Math.abs(locationY - startPos.current.y) });
      },
      onPanResponderRelease: (_e, gs) => {
        const isTap = Math.abs(gs.dx) < 12 && Math.abs(gs.dy) < 12;
        if (isTap) {
          setPendingRect(null);
          setPendingDot({ x: startPos.current.x, y: startPos.current.y });
          setShowCommentModal(true);
        } else if (Math.abs(gs.dx) > 15 && Math.abs(gs.dy) > 15) {
          setPendingDot(null);
          setShowCommentModal(true);
        } else {
          setPendingRect(null); setPendingDot(null);
        }
        setIsDrawing(false); isDrawingRef.current = false;
      },
    })
  ).current;

  // ── Guardar anotación ─────────────────────────────────────────────────────
  // nextSeq se calcula desde estado para mostrar en el modal (preview)
  const nextSeq = annotations.length > 0
    ? Math.max(...annotations.map((a) => a.sequenceNumber)) + 1 : 1;

  const saveAnnotation = async () => {
    if (!currentUser) return;
    if (preSavedAnn) {
      // Ya pre-guardada — actualizar texto y prioridad
      await database.write(async () => {
        const ann = await planAnnotationsCollection.find(preSavedAnn.annotationId);
        await ann.update((a) => {
          a.comment = comment.trim() || null;
          (a as any).priority = priority ?? null;
        });
        const c = await annotationCommentsCollection.find(preSavedAnn.commentId);
        await c.update((cm: any) => { cm.content = comment.trim() || null; });
      });
    } else {
      if (!pendingRect && !pendingDot) return;
      // Consultar DB directamente para evitar usar estado stale (race condition)
      const freshAnns = await planAnnotationsCollection
        .query(Q.where('plan_id', activePlanId))
        .fetch();
      const safeSeq = freshAnns.length > 0
        ? Math.max(...freshAnns.map((a) => (a as any).sequenceNumber ?? 0)) + 1 : 1;
      await database.write(async () => {
        await planAnnotationsCollection.create((a) => {
          a.planId = activePlanId;
          a.protocolId = protocolId ?? null;
          if (pendingDot) {
            a.rectX = (pendingDot.x / pdfWRef.current) * 100;
            a.rectY = (pendingDot.y / pdfHRef.current) * 100;
            a.rectWidth = 0; a.rectHeight = 0;
          } else {
            a.rectX = (pendingRect!.x / pdfWRef.current) * 100;
            a.rectY = (pendingRect!.y / pdfHRef.current) * 100;
            a.rectWidth = (pendingRect!.width / pdfWRef.current) * 100;
            a.rectHeight = (pendingRect!.height / pdfHRef.current) * 100;
          }
          a.comment = comment.trim() || null;
          a.sequenceNumber = safeSeq;
          a.isOk = false;
          (a as any).status = 'OPEN';
          (a as any).page = currentPage;
          (a as any).priority = priority ?? null;
          a.createdById = currentUser.id;
        });
      });
    }
    setPendingRect(null); setPendingDot(null);
    setComment(''); setShowCommentModal(false);
    setPreSavedAnn(null); setPendingModalPhotos([]);
    setPriority(null);
    if (plan?.projectId) {
      pushProjectToSupabase(plan.projectId).catch(() => {});
      notifyNewAnnotation(plan.projectId, projectName, locationOnly, specialty, comment.trim() || null);
    }
  };

  // Agregar foto durante creación — pre-guarda la anotación si aún no existe
  const handleCreationCamera = async () => {
    if (!currentUser || (!pendingRect && !pendingDot)) return;
    let commentId = preSavedAnn?.commentId ?? '';
    if (!preSavedAnn) {
      let annId = '';
      // Consultar DB directamente para secuencia correcta (evita estado stale)
      const freshAnns = await planAnnotationsCollection
        .query(Q.where('plan_id', activePlanId))
        .fetch();
      const safeSeq = freshAnns.length > 0
        ? Math.max(...freshAnns.map((a) => (a as any).sequenceNumber ?? 0)) + 1 : 1;
      await database.write(async () => {
        const draftText = comment.trim() || null;
        const ann = await planAnnotationsCollection.create((a) => {
          a.planId = activePlanId;
          a.protocolId = protocolId ?? null;
          if (pendingDot) {
            a.rectX = (pendingDot.x / pdfWRef.current) * 100;
            a.rectY = (pendingDot.y / pdfHRef.current) * 100;
            a.rectWidth = 0; a.rectHeight = 0;
          } else {
            a.rectX = (pendingRect!.x / pdfWRef.current) * 100;
            a.rectY = (pendingRect!.y / pdfHRef.current) * 100;
            a.rectWidth = (pendingRect!.width / pdfWRef.current) * 100;
            a.rectHeight = (pendingRect!.height / pdfHRef.current) * 100;
          }
          a.comment = draftText; // guardar texto actual, no quedar como "Sin comentario"
          a.sequenceNumber = safeSeq;
          a.isOk = false;
          (a as any).status = 'OPEN';
          (a as any).page = currentPage;
          a.createdById = currentUser.id;
        });
        const c = await annotationCommentsCollection.create((cm: any) => {
          cm.annotationId = ann.id;
          cm.authorId = currentUser.id;
          cm.content = draftText;
          cm.readByCreator = true;
        });
        annId = ann.id; commentId = c.id;
      });
      setPreSavedAnn({ annotationId: annId, commentId });
    }
    cameraTargetRef.current = 'creation';
    setShowCommentModal(false); // cerrar modal antes de navegar (evita superposición nativa en Android)
    navigation.navigate('Camera', { annotationCommentId: commentId, projectId: plan?.projectId });
  };

  const cancelModal = async () => {
    if (preSavedAnn) {
      // Borrar la anotación pre-guardada + comentario + fotos
      await database.write(async () => {
        try {
          const photos = await annotationCommentPhotosCollection
            .query(Q.where('annotation_comment_id', preSavedAnn.commentId))
            .fetch();
          for (const p of photos) await p.destroyPermanently();
          const c = await annotationCommentsCollection.find(preSavedAnn.commentId);
          await c.destroyPermanently();
          const ann = await planAnnotationsCollection.find(preSavedAnn.annotationId);
          await ann.destroyPermanently();
        } catch { /* ya eliminado */ }
      });
      setPreSavedAnn(null); setPendingModalPhotos([]);
    }
    setShowCommentModal(false); setPendingRect(null); setPendingDot(null); setComment('');
    setPriority(null);
  };


  const markOk = async (ann: PlanAnnotation) => {
    if (!isJefe) return;
    await database.write(async () => {
      await ann.update((a) => { a.isOk = true; (a as any).status = 'CLOSED'; });
    });
    // ann es mutado in-place por WatermelonDB — forzar re-render inmediato
    setAnnotations(prev => [...prev]);
  };

  const deleteAnnotation = (ann: PlanAnnotation) => {
    Alert.alert(
      t('planViewer.deleteAnn.title'),
      t('planViewer.deleteAnn.message', { n: ann.sequenceNumber }),
      [
        { text: t('planViewer.common.cancel'), style: 'cancel' },
        { text: t('planViewer.common.delete'), style: 'destructive', onPress: async () => {
          await database.write(async () => {
            const comments = await annotationCommentsCollection
              .query(Q.where('annotation_id', ann.id))
              .fetch();
            for (const c of comments) {
              const photos = await annotationCommentPhotosCollection
                .query(Q.where('annotation_comment_id', c.id))
                .fetch();
              for (const p of photos) await p.destroyPermanently();
              await c.destroyPermanently();
            }
            await ann.destroyPermanently();
          });
        }},
      ]
    );
  };


  // ── Hilo de comentarios (expandible inline) ──────────────────────────────
  const toggleExpand = async (ann: PlanAnnotation) => {
    if (selectedAnn?.id === ann.id) {
      // Contraer
      setSelectedAnn(null);
      setShowReplyForm(false);
      setReplyText('');
      setReplyPreSaved(null);
      setReplyPrePhotos([]);
      setThreadComments([]);
      setThreadPhotos({});
      setThreadUserNames({});
      return;
    }
    // Expandir
    setSelectedAnn(ann);
    setShowReplyForm(false);
    setReplyText('');
    setReplyPreSaved(null);
    setReplyPrePhotos([]);
    setThreadLoading(true);
    await loadThread(ann);
    setThreadLoading(false);
    // Marcar como leído si soy el creador
    if (ann.createdById === currentUser?.id) {
      const unread = await annotationCommentsCollection
        .query(Q.where('annotation_id', ann.id), Q.where('read_by_creator', false))
        .fetch();
      if (unread.length > 0) {
        await database.write(async () => {
          for (const c of unread) await (c as any).update((x: any) => { x.readByCreator = true; });
        });
      }
    }
  };

  const loadThread = async (ann: PlanAnnotation) => {
    const comments = await annotationCommentsCollection
      .query(Q.where('annotation_id', ann.id), Q.sortBy('created_at', Q.asc))
      .fetch();
    setThreadComments(comments as AnnotationComment[]);
    // Fotos por comentario
    const photoMap: Record<string, AnnotationCommentPhoto[]> = {};
    const authorIds = new Set<string>();
    for (const c of comments) {
      const cAny = c as any;
      authorIds.add(cAny.authorId);
      const photos = await annotationCommentPhotosCollection
        .query(Q.where('annotation_comment_id', c.id))
        .fetch();
      photoMap[c.id] = photos as AnnotationCommentPhoto[];
    }
    setThreadPhotos(photoMap);
    // Nombres de autores
    const nameMap: Record<string, string> = {};
    for (const uid of authorIds) {
      try {
        const u = await usersCollection.find(uid);
        nameMap[uid] = `${(u as any).name} ${(u as any).apellido ?? ''}`.trim();
      } catch { nameMap[uid] = uid; }
    }
    setThreadUserNames(nameMap);
  };

  const handleReplyCamera = async () => {
    if (!currentUser || !selectedAnn) return;
    let commentId = replyPreSaved ?? '';
    if (!replyPreSaved) {
      await database.write(async () => {
        const c = await annotationCommentsCollection.create((cm: any) => {
          cm.annotationId = selectedAnn.id;
          cm.authorId = currentUser.id;
          cm.content = null;
          cm.readByCreator = selectedAnn.createdById === currentUser.id;
        });
        commentId = c.id;
      });
      setReplyPreSaved(commentId);
    }
    cameraTargetRef.current = 'reply';
    // no se cierra nada — la tarjeta queda expandida y la cámara se superpone
    navigation.navigate('Camera', { annotationCommentId: commentId, projectId: plan?.projectId });
  };

  const sendReply = async () => {
    if (!currentUser || !selectedAnn) return;
    if (!replyText.trim() && replyPrePhotos.length === 0) {
      if (replyPreSaved) {
        // Borrar comentario vacío sin fotos
        await database.write(async () => {
          try {
            const c = await annotationCommentsCollection.find(replyPreSaved);
            await c.destroyPermanently();
          } catch { /* */ }
        });
      }
      setShowReplyForm(false); setReplyText(''); setReplyPreSaved(null); setReplyPrePhotos([]);
      return;
    }
    await database.write(async () => {
      if (replyPreSaved) {
        const c = await annotationCommentsCollection.find(replyPreSaved);
        await (c as any).update((cm: any) => {
          cm.content = replyText.trim() || null;
          cm.readByCreator = selectedAnn.createdById === currentUser.id;
        });
      } else {
        await annotationCommentsCollection.create((cm: any) => {
          cm.annotationId = selectedAnn.id;
          cm.authorId = currentUser.id;
          cm.content = replyText.trim() || null;
          cm.readByCreator = selectedAnn.createdById === currentUser.id;
        });
      }
    });
    await loadThread(selectedAnn);
    setShowReplyForm(false); setReplyText(''); setReplyPreSaved(null); setReplyPrePhotos([]);
    if (plan?.projectId) {
      pushProjectToSupabase(plan.projectId).catch(() => {});
      notifyNewReply(plan.projectId, projectName, locationOnly, specialty, replyText.trim() || null);
    }
  };

  const deletePhoto = (photo: AnnotationCommentPhoto, _commentId: string, isThread: boolean) => {
    Alert.alert(t('planViewer.deletePhoto.title'), t('planViewer.deletePhoto.message'), [
      { text: t('planViewer.common.cancel'), style: 'cancel' },
      { text: t('planViewer.common.delete'), style: 'destructive', onPress: async () => {
        const photoId = photo.id;
        await database.write(async () => { await photo.destroyPermanently(); });
        // Eliminar de Supabase (el archivo S3 se conserva para mantener secuencia)
        supabase.from('annotation_comment_photos').delete().eq('id', photoId).then(() => {});
        if (isThread && selectedAnn) {
          await loadThread(selectedAnn);
        } else {
          setPendingModalPhotos((p) => p.filter((x) => x.id !== photo.id));
          setReplyPrePhotos((p) => p.filter((x) => x.id !== photo.id));
        }
      }},
    ]);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  /** Anotaciones visibles en la página actual para el overlay del PDF */
  const pageAnnotations = annotations.filter((a) => {
    const pg = (a as any).page;
    return pg == null || pg === 0 || pg === currentPage;
  });

  /** Todas las anotaciones agrupadas por página para la lista */
  const annGroups: Array<{ page: number; anns: PlanAnnotation[] }> = (() => {
    const groupMap = new Map<number, PlanAnnotation[]>();
    for (const ann of annotations) {
      const pg = (ann as any).page;
      const key = (!pg || pg === 0) ? 1 : pg;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(ann);
    }
    return Array.from(groupMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([page, anns]) => ({ page, anns }));
  })();

  const isDot = (ann: PlanAnnotation) => ann.rectWidth === 0 && ann.rectHeight === 0;
  const pdfSource = (plan?.fileUri && fileReady === true) ? { uri: plan.fileUri, cache: true } : null;

  const renderAnnotation = (ann: PlanAnnotation) => {
    const highlighted = highlightAnnotationId === ann.id;
    // Color: si está cerrada → verde; si tiene prioridad → color de la prioridad; si no → rojo (pendiente).
    const priorityColor = (() => {
      const p = (ann as any).priority;
      if (p === 'low') return '#1976d2';
      if (p === 'medium') return '#e67e22';
      if (p === 'high') return '#c0392b';
      return null;
    })();
    const color = ann.isOk ? Colors.success : (priorityColor ?? Colors.danger);
    if (isDot(ann)) {
      // Pin de ubicación: el tip del pin cae sobre el punto marcado.
      const PIN_SIZE = 30;
      const cx = (ann.rectX / 100) * pdfW - PIN_SIZE / 2;
      const cy = (ann.rectY / 100) * pdfH - PIN_SIZE;
      // Disco de color del mismo tono que el pin, centrado sobre el agujero
      // del icono (≈ 35% desde arriba). Tapa el hueco blanco del glifo.
      const BADGE_SIZE = PIN_SIZE * 0.46;
      const BADGE_TOP = PIN_SIZE * 0.2;
      return (
        <View key={ann.id} style={[styles.pinMarker, { left: cx, top: cy, width: PIN_SIZE, height: PIN_SIZE }]}>
          <Ionicons name="location" size={PIN_SIZE} color={color} />
          <View
            style={[
              styles.pinNumberBadge,
              {
                width: BADGE_SIZE,
                height: BADGE_SIZE,
                borderRadius: BADGE_SIZE / 2,
                top: BADGE_TOP,
                left: (PIN_SIZE - BADGE_SIZE) / 2,
                backgroundColor: color,
              },
            ]}
          >
            <Text style={styles.pinNumberText}>{String(ann.sequenceNumber)}</Text>
          </View>
        </View>
      );
    }
    return (
      <View key={ann.id} style={[styles.annotRect, {
        left: (ann.rectX / 100) * pdfW, top: (ann.rectY / 100) * pdfH,
        width: (ann.rectWidth / 100) * pdfW, height: (ann.rectHeight / 100) * pdfH,
        borderColor: color,
      }]}>
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Text style={styles.badgeText}>{String(ann.sequenceNumber)}</Text>
        </View>
      </View>
    );
  };

  const renderPhotoRow = (photos: AnnotationCommentPhoto[], isThread: boolean, commentId: string) => (
    <View style={styles.photosRow}>
      {photos.map((p) => (
        <TouchableOpacity
          key={p.id}
          onPress={() => setFullscreenPhoto(p.localUri)}
          onLongPress={() => deletePhoto(p, commentId, isThread)}
        >
          <Image source={{ uri: p.localUri }} style={styles.photoThumb} resizeMode="cover" />
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <View ref={planHeaderRef} onLayout={planHeaderLayout}>
      <AppHeader
        title={protocolId ? (protocolNumber ?? '—') : activePlanName}
        subtitle={protocolId && protocolLocation ? protocolLocation : undefined}
        onBack={() => navigation.goBack()}
        rightContent={
          <TouchableOpacity onPress={() => jumpToStep('plan_viewer_draw_toggle')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
          </TouchableOpacity>
        }
      />
      </View>

      {/* Dropdown selector de plano cuando hay múltiples */}
      {locationPlans.length > 1 && (
        <View ref={planSelectorRef} style={styles.planSelectorWrap}>
          <TouchableOpacity
            style={styles.planSelectorBtn}
            onPress={() => setShowPlanDropdown((v) => !v)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.planSelectorLabel}>{t('planViewer.selector.activeLabel')}</Text>
              <Text style={styles.planSelectorName} numberOfLines={1}>{activePlanName}</Text>
            </View>
            <Text style={styles.planSelectorChevron}>{showPlanDropdown ? '▴' : '▾'}</Text>
          </TouchableOpacity>
          {showPlanDropdown && (
            <View style={styles.planDropdownList}>
              {locationPlans.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.planDropdownItem, activePlanId === p.id && styles.planDropdownItemActive]}
                  disabled={pdfLoading}
                  onPress={() => {
                    // Ignora si no han pasado 2 s desde la última aplicación
                    if (activePlanId === p.id) { setShowPlanDropdown(false); return; }
                    if (Date.now() - lastAppliedAtRef.current < 2000) { setShowPlanDropdown(false); return; }
                    if (!planChangingRef.current) {
                      planChangingRef.current = true;
                      setTimeout(() => { planChangingRef.current = false; }, 5000);
                      lastAppliedAtRef.current = Date.now();
                      setAnnotations([]);
                      setPdfLoading(true);
                      setPdfError(null);
                      setSelectedAnn(null);
                      setThreadComments([]);
                      setThreadPhotos({});
                      setShowReplyForm(false);
                      setPendingRect(null);
                      setPendingDot(null);
                      setIsDrawing(false);
                      setCurrentPage(1);
                      setTotalPages(1);
                      setActivePlanId(p.id);
                      setActivePlanName(p.name);
                    }
                    setShowPlanDropdown(false);
                  }}
                >
                  <Text style={[styles.planDropdownItemText, activePlanId === p.id && styles.planDropdownItemTextActive]}>
                    {p.name}
                  </Text>
                  {activePlanId === p.id && <Text style={styles.planDropdownCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Toolbar — todo en una sola cinta */}
      {canAnnotate && (
        <View style={styles.floatingToolbar}>
          <View style={styles.toolbarRow}>
            <View ref={zoomBarRef} onLayout={zoomBarLayout} style={styles.zoomBtnGroup}>
              {ZOOM_LEVELS.map((z) => (
                <TouchableOpacity
                  key={z}
                  style={[styles.zoomBtn, pendingZoom === z && styles.zoomBtnActive]}
                  onPress={() => handleZoomChange(z)}
                >
                  <Text style={[styles.zoomBtnText, pendingZoom === z && styles.zoomBtnTextActive]}>{`${z}x`}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {hasDwg && (
              <View style={styles.toolSlot}>
                <TouchableOpacity ref={dwgBtnRef} style={styles.toolIcon} onPress={openDwg} activeOpacity={0.75}>
                  <Ionicons name="layers-outline" size={20} color={Colors.navy} />
                </TouchableOpacity>
                <Text style={styles.toolLabel}>DWG</Text>
              </View>
            )}
            <View style={styles.toolSlot}>
              <TouchableOpacity
                ref={measurementBtnRef}
                style={styles.toolIcon}
                onPress={() => navigation.navigate('Measurement', { planId: activePlanId, planName: activePlanName })}
              >
                <MaterialCommunityIcons name="tape-measure" size={20} color={Colors.navy} />
              </TouchableOpacity>
              <Text style={styles.toolLabel}>{t('planViewer.toolbar.measure')}</Text>
            </View>

            <TouchableOpacity
              ref={drawToggleRef}
              style={[styles.observacionBtn, isDrawing && styles.observacionBtnActive]}
              onPress={() => { setIsDrawing(!isDrawing); setPendingRect(null); setPendingDot(null); }}
              activeOpacity={0.8}
            >
              <Text style={styles.observacionBtnText} numberOfLines={1}>
                {isDrawing ? t('planViewer.toolbar.drawing') : t('planViewer.toolbar.addObservation')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView ref={mainScrollRef} showsVerticalScrollIndicator={false} scrollEnabled={!isDrawing}>
        {/* PDF */}
        <View style={styles.pdfSection}>
          <ScrollView ref={hScrollViewRef} horizontal scrollEnabled={!isDrawing && zoom > 1} showsHorizontalScrollIndicator={zoom > 1} style={{ borderRadius: Radius.md }} onScroll={(e) => { hScrollRef.current = e.nativeEvent.contentOffset.x; }} scrollEventThrottle={16}>
            <View ref={pdfAreaRef} style={[styles.pdfContainer, { width: pdfW, height: pdfH }]}>
              {pdfSource ? (
                // key incluye zoom para forzar re-render a la resolución correcta
                Array.from({ length: Math.max(totalPages, 1) }, (_, i) => i + 1).map((pg) => (
                  <Pdf
                    key={`p${pg}-z${zoom}`}
                    source={pdfSource}
                    page={pg}
                    style={[StyleSheet.absoluteFill, { opacity: pg === currentPage ? 1 : 0 }]}
                    onLoadComplete={(pages, _pa, { width, height }) => {
                      if (pg === 1) {
                        setPdfError(null);
                        if (width > 0) setPageAspect(height / width);
                        setTotalPages(pages);
                        // Dejar 200ms de margen para asegurar que el render se estabilizó
                        setTimeout(() => {
                          setPdfLoading(false);
                          // Reiniciar el reloj del cooldown: la próxima acción ya puede
                          // commitear tras 2 s de ESTA carga real (no de la anterior).
                          lastAppliedAtRef.current = Date.now();
                        }, 200);
                      }
                    }}
                    onError={() => {
                      if (pg === 1) { setPdfLoading(false); setPdfError(t('planViewer.pdf.loadError')); }
                    }}
                    enablePaging={false} horizontal={false} fitPolicy={0} minScale={1} maxScale={1} scrollEnabled={false}
                  />
                ))
              ) : (
                <View style={styles.pdfPlaceholder}>
                  <Text style={styles.pdfPlaceholderText}>
                    {fileReady === false ? t('planViewer.pdf.notDownloaded') : t('planViewer.pdf.noPlan')}
                  </Text>
                  {fileReady === false && projectName && !downloadingPdf && (
                    <TouchableOpacity style={styles.downloadBtn} onPress={handleDownloadPdf}>
                      <Text style={styles.downloadBtnText}>{t('planViewer.pdf.downloadBtn')}</Text>
                    </TouchableOpacity>
                  )}
                  {downloadingPdf && (
                    <ActivityIndicator color={Colors.primary} style={{ marginTop: 12 }} />
                  )}
                </View>
              )}
              <View style={[StyleSheet.absoluteFill, { zIndex: 1 }]} pointerEvents="none">
                {pageAnnotations.map(renderAnnotation)}
                {pendingRect && pendingRect.width > 4 && (
                  <View style={[styles.annotRect, { left: pendingRect.x, top: pendingRect.y, width: pendingRect.width, height: pendingRect.height, borderColor: Colors.primary, borderStyle: 'dashed' }]} />
                )}
                {pendingDot && (
                  <View style={[styles.pinMarker, { left: pendingDot.x - 15, top: pendingDot.y - 30, width: 30, height: 30, opacity: 0.7 }]}>
                    <Ionicons name="location" size={30} color={Colors.primary} />
                  </View>
                )}
              </View>
              {isDrawing && <View style={[StyleSheet.absoluteFill, { zIndex: 2 }]} {...panResponder.panHandlers} />}
              {pdfLoading && pdfSource && (
                <View style={[StyleSheet.absoluteFill, styles.loadingOverlay, { zIndex: 3 }]}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={styles.loadingText}>{t('planViewer.pdf.loading')}</Text>
                </View>
              )}
              {pdfError && !downloadingPdf && (
                <View style={[StyleSheet.absoluteFill, styles.errorOverlay, { zIndex: 3 }]}>
                  <Text style={styles.errorText}>{pdfError}</Text>
                  {projectName && (
                    <TouchableOpacity style={styles.downloadBtn} onPress={handleDownloadPdf}>
                      <Text style={styles.downloadBtnText}>{t('planViewer.pdf.downloadBtn')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {downloadingPdf && (
                <View style={[StyleSheet.absoluteFill, styles.loadingOverlay, { zIndex: 3 }]}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={styles.loadingText}>{t('planViewer.pdf.downloading')}</Text>
                </View>
              )}
            </View>
          </ScrollView>
          {canAnnotate && <Text style={styles.hint}>{t('planViewer.pdf.hint')}</Text>}

          {/* Navegación de páginas */}
          {totalPages > 1 && (
            <View style={styles.pageNav}>
              <TouchableOpacity
                style={[styles.pageNavBtn, currentPage === 1 && styles.btnDisabled]}
                disabled={currentPage === 1}
                onPress={() => {
                  // Ignora el click si aún no pasaron 2s desde la última aplicación
                  if (Date.now() - lastAppliedAtRef.current < 2000) return;
                  lastAppliedAtRef.current = Date.now();
                  setCurrentPage((p) => Math.max(1, p - 1));
                  setSelectedAnn(null); setThreadComments([]); setThreadPhotos({}); setShowReplyForm(false);
                }}
              >
                <Text style={styles.pageNavBtnText}>{t('planViewer.page.prev')}</Text>
              </TouchableOpacity>
              <Text style={styles.pageNavText}>{t('planViewer.page.indicator', { current: currentPage, total: totalPages })}</Text>
              <TouchableOpacity
                style={[styles.pageNavBtn, currentPage === totalPages && styles.btnDisabled]}
                disabled={currentPage === totalPages}
                onPress={() => {
                  if (Date.now() - lastAppliedAtRef.current < 2000) return;
                  lastAppliedAtRef.current = Date.now();
                  setCurrentPage((p) => Math.min(totalPages, p + 1));
                  setSelectedAnn(null); setThreadComments([]); setThreadPhotos({}); setShowReplyForm(false);
                }}
              >
                <Text style={styles.pageNavBtnText}>{t('planViewer.page.next')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Lista observaciones — todas las páginas agrupadas */}
        <View ref={annotationListRef} onLayout={annotationListLayout} style={styles.listSection}>
          {annotations.length === 0 ? (
            <Text style={styles.empty}>{t('planViewer.list.empty')}</Text>
          ) : (
            annGroups.map(({ page, anns }, groupIdx) => (
              <View key={page}>
                {/* Encabezado de página: solo si el PDF tiene más de 1 página */}
                {totalPages > 1 && (
                  <Text style={styles.sectionLabel}>
                    {t('planViewer.list.sectionPage', { page, count: anns.length })}
                  </Text>
                )}
                {totalPages === 1 && page === annGroups[0].page && (
                  <Text style={styles.sectionLabel}>{t('planViewer.list.section', { count: anns.length })}</Text>
                )}
                {anns.map((ann, annIdx) => {
              const isExpanded = selectedAnn?.id === ann.id;
              return (
                <View key={ann.id} style={[styles.annItem, ann.isOk && styles.annItemOk, highlightAnnotationId === ann.id && styles.annItemHighlight]}>
                  {/* Cabecera: tap para desplegar/contraer */}
                  <TouchableOpacity
                    ref={groupIdx === 0 && annIdx === 0 ? annotationExpandRef : undefined}
                    style={styles.annHeaderRow}
                    onPress={() => toggleExpand(ann)}
                    onLongPress={() => {
                      if (ann.isOk) return;
                      if (!(isJefe || canAnnotate)) return;
                      setPriorityPickerForAnnId(ann.id);
                    }}
                    delayLongPress={350}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.numBadge, { backgroundColor: ann.isOk ? Colors.success : Colors.danger }]}>
                      <Text style={styles.numBadgeText}>{String(ann.sequenceNumber)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.annComment}>{ann.comment || t('planViewer.list.noComment')}</Text>
                      <Text style={styles.annDate}>{new Date(ann.createdAt).toLocaleString('es-CL')}</Text>
                      {ann.isOk ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <View style={[styles.statusChip, { backgroundColor: Colors.success, marginTop: 0 }]}>
                            <Text style={styles.statusChipText}>{t('planViewer.list.closed')}</Text>
                          </View>
                          {(ann as any).priority ? (
                            <PriorityChip value={(ann as any).priority} size="sm" />
                          ) : null}
                        </View>
                      ) : (
                        (ann as any).priority ? (
                          <View style={{ marginTop: 4 }}>
                            <PriorityChip value={(ann as any).priority} size="sm" />
                          </View>
                        ) : null
                      )}
                    </View>
                    {(isJefe || canAnnotate) && (
                      <View style={styles.annActions}>
                        {isJefe && !ann.isOk && (
                          <TouchableOpacity style={styles.okBtn} onPress={() => markOk(ann)}>
                            <Text style={styles.okBtnText}>{t('planViewer.list.completed')}</Text>
                          </TouchableOpacity>
                        )}
                        {canAnnotate && (
                          <TouchableOpacity style={styles.delBtn} onPress={() => deleteAnnotation(ann)}>
                            <Text style={styles.delBtnText}>{t('planViewer.common.delete')}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                    <Text style={styles.expandChevron}>{isExpanded ? '▾' : '▸'}</Text>
                  </TouchableOpacity>

                  {/* Hilo desplegado */}
                  {isExpanded && (
                    <View style={styles.threadInline}>
                      {threadLoading ? (
                        <ActivityIndicator size="small" color={Colors.primary} style={{ margin: 12 }} />
                      ) : threadComments.length === 0 ? (
                        <Text style={styles.threadEmptyText}>{t('planViewer.thread.empty')}</Text>
                      ) : (
                        threadComments.map((c, idx) => {
                          const cAny = c as any;
                          const photos = threadPhotos[c.id] ?? [];
                          const isFirst = idx === 0;
                          return (
                            <View key={c.id} style={[styles.commentBubble, isFirst && styles.commentBubbleFirst]}>
                              <View style={styles.commentMeta}>
                                <Text style={styles.commentAuthor}>{threadUserNames[cAny.authorId] || cAny.authorId}</Text>
                                {isFirst && <Text style={styles.firstLabel}>{t('planViewer.thread.start')}</Text>}
                                <Text style={styles.commentDate}>{new Date(c.createdAt).toLocaleString('es-CL')}</Text>
                              </View>
                              {cAny.content ? (
                                <Text style={styles.commentContent}>{cAny.content}</Text>
                              ) : (
                                <Text style={styles.commentContentEmpty}>{t('planViewer.thread.photosOnly')}</Text>
                              )}
                              {photos.length > 0 && renderPhotoRow(photos, true, c.id)}
                            </View>
                          );
                        })
                      )}

                      {/* Formulario de respuesta o botón */}
                      {showReplyForm ? (
                        <View
                          ref={groupIdx === 0 && annIdx === 0 ? replyFormRef : undefined}
                          onLayout={groupIdx === 0 && annIdx === 0 ? replyFormLayout : undefined}
                          style={styles.replyFormContainer}
                        >
                          <TextInput
                            style={styles.replyFormInput}
                            placeholder={t('planViewer.thread.replyPlaceholder')}
                            placeholderTextColor={Colors.textMuted}
                            value={replyText}
                            onChangeText={setReplyText}
                            multiline
                            numberOfLines={3}
                          />
                          {replyPrePhotos.length > 0 && renderPhotoRow(replyPrePhotos, false, replyPreSaved ?? '')}
                          <View style={styles.replyFormActions}>
                            <TouchableOpacity style={styles.cameraModalBtn} onPress={handleReplyCamera}>
                              <Ionicons name="camera-outline" size={20} color={Colors.navy} />
                            </TouchableOpacity>
                            <View style={{ flex: 1 }} />
                            <TouchableOpacity style={styles.cancelBtn} onPress={async () => {
                              if (replyPreSaved) {
                                await database.write(async () => {
                                  try {
                                    const photos = await annotationCommentPhotosCollection.query(Q.where('annotation_comment_id', replyPreSaved)).fetch();
                                    for (const p of photos) await p.destroyPermanently();
                                    const c = await annotationCommentsCollection.find(replyPreSaved);
                                    await c.destroyPermanently();
                                  } catch { /* */ }
                                });
                                setReplyPreSaved(null); setReplyPrePhotos([]);
                              }
                              setShowReplyForm(false); setReplyText('');
                            }}>
                              <Text style={styles.cancelBtnText}>{t('planViewer.common.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={sendReply}>
                              <Text style={styles.saveBtnText}>{t('planViewer.thread.send')}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity
                          ref={groupIdx === 0 && annIdx === 0 ? replyBtnRef : undefined}
                          onLayout={groupIdx === 0 && annIdx === 0 ? replyBtnLayout : undefined}
                          style={styles.replyBtn}
                          onPress={() => {
                            setReplyText(''); setReplyPreSaved(null); setReplyPrePhotos([]); setShowReplyForm(true);
                            if (tourActive && tourStep?.id === 'plan_reply_btn') tourNextStep();
                          }}
                        >
                          <Text style={styles.replyBtnText}>{t('planViewer.thread.reply')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
                })}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* ── Modal de creación de anotación ───────────────────────────────── */}
      <Modal visible={showCommentModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>
                {t('planViewer.modal.title')}
              </Text>
              <View style={styles.modalSeqBadge}>
                <Text style={styles.modalSeqBadgeText}>
                  {t('planViewer.modal.seqBadge', { value: preSavedAnn ? '—' : String(nextSeq) })}
                </Text>
              </View>
            </View>

            {/* Sección: Descripción */}
            <TextInput
              style={styles.commentInput}
              placeholder={t('planViewer.modal.descPlaceholder')}
              placeholderTextColor={Colors.textMuted}
              value={comment} onChangeText={setComment}
              multiline numberOfLines={3} autoFocus
            />

            <View style={styles.modalDivider} />

            {/* Sección: Adjuntos y prioridad — dos cajas lado a lado */}
            <View style={styles.modalDualRow}>
              <View style={styles.modalDualBox}>
                <Text style={styles.modalDualLabel}>{t('planViewer.modal.attachments')}</Text>
                <TouchableOpacity style={styles.modalCameraBtn} onPress={handleCreationCamera} activeOpacity={0.75}>
                  <Ionicons name="camera-outline" size={16} color={Colors.navy} />
                  <Text style={styles.modalCameraBtnText}>{t('planViewer.modal.photo')}</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.modalDualBox, { flex: 1 }]}>
                <Text style={styles.modalDualLabel}>{t('planViewer.modal.priority')}</Text>
                <PrioritySelector value={priority} onChange={setPriority} compact />
              </View>
            </View>
            {pendingModalPhotos.length > 0 && (
              <View style={{ marginTop: 8 }}>
                {renderPhotoRow(pendingModalPhotos, false, preSavedAnn?.commentId ?? '')}
              </View>
            )}

            <View style={styles.modalDivider} />

            {/* Acciones */}
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={cancelModal}>
                <Text style={styles.cancelBtnText}>{t('planViewer.common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveAnnotation}>
                <Text style={styles.saveBtnText}>{t('planViewer.modal.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>


      {/* ── Foto fullscreen ───────────────────────────────────────────────── */}
      <Modal visible={!!fullscreenPhoto} transparent animationType="fade" onRequestClose={() => setFullscreenPhoto(null)}>
        <TouchableOpacity style={styles.photoOverlay} activeOpacity={1} onPress={() => setFullscreenPhoto(null)}>
          {fullscreenPhoto && <Image source={{ uri: fullscreenPhoto }} style={styles.photoFullscreen} resizeMode="contain" />}
        </TouchableOpacity>
      </Modal>

      {/* ── Selector de prioridad (long-press en tarjeta) ─────────────────── */}
      <PriorityPickerModal
        visible={!!priorityPickerForAnnId}
        value={priorityPickerForAnnId
          ? ((annotations.find((a) => a.id === priorityPickerForAnnId) as any)?.priority ?? null)
          : null}
        onSelect={(p) => {
          if (priorityPickerForAnnId) updateAnnotationPriority(priorityPickerForAnnId, p);
        }}
        onClose={() => setPriorityPickerForAnnId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  title: { fontSize: 11, fontWeight: '700', color: Colors.white, textAlign: 'center', letterSpacing: 0.4, lineHeight: 16 },
  protocolBadge: { fontSize: 9, color: Colors.secondary, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
  protocolLocation: { fontSize: 11, color: Colors.light, fontWeight: '500', marginTop: 2, textAlign: 'center' },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1.5, marginBottom: 6 },
  hint: { fontSize: 11, color: Colors.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 16 },
  floatingToolbar: { backgroundColor: Colors.white, paddingHorizontal: 14, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, ...Shadow.card },
  toolbarRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  toolSlot: { alignItems: 'center', gap: 2 },
  toolIcon: {
    width: 30, height: 30, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  toolIconActive: { backgroundColor: Colors.warning, borderColor: Colors.warning },
  toolLabel: { fontSize: 9, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },
  observacionBtn: {
    marginLeft: 'auto',
    flexShrink: 0,
    minWidth: 100,
    backgroundColor: Colors.danger,
    borderRadius: Radius.md,
    paddingHorizontal: 8, height: 30,
    alignItems: 'center', justifyContent: 'center',
    ...Shadow.subtle,
  },
  observacionBtnActive: { backgroundColor: Colors.warning },
  observacionBtnText: { color: Colors.white, fontWeight: '800', fontSize: 11, letterSpacing: 0.2 },
  pdfSection: { margin: 16, gap: 8 },
  undoBar: { },
  btnDisabled: { opacity: 0.35 },
  zoomBar: { flex: 1, alignItems: 'flex-end', justifyContent: 'center' },
  zoomBtnGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoomBtn: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  zoomBtnActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  zoomBtnText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  zoomBtnTextActive: { color: Colors.white },
  drawBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, padding: 13, alignItems: 'center' },
  drawBtnActive: { backgroundColor: Colors.warning },
  drawBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  measureBtn: { backgroundColor: Colors.navy, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 13, alignItems: 'center' },
  toolbarTopRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  topActionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: Radius.md, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.subtle,
  },
  topActionBtnText: { fontSize: 12, fontWeight: '700', color: Colors.navy, letterSpacing: 0.3 },
  pdfContainer: { borderRadius: Radius.md, overflow: 'hidden', backgroundColor: '#f0f0f0', ...Shadow.card, borderWidth: 1, borderColor: Colors.border },
  pdfPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pdfPlaceholderText: { color: Colors.textMuted, fontSize: 13 },
  loadingOverlay: { backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: Colors.textSecondary, fontSize: 13 },
  errorOverlay: { backgroundColor: '#fdecea', alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: Colors.danger, fontSize: 13, textAlign: 'center', fontWeight: '600' },
  downloadBtn: { marginTop: 14, backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: Radius.md },
  downloadBtnText: { color: Colors.white, fontSize: 13, fontWeight: '600' },
  annotRect: { position: 'absolute', borderWidth: 2.5 },
  badge: { position: 'absolute', top: -11, left: -11, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: Colors.white, fontSize: 10, fontWeight: '900' },
  dotMarker: { position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 2, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  dotLabel: { fontSize: 8, fontWeight: '900' },
  pinMarker: {
    position: 'absolute',
    alignItems: 'center', justifyContent: 'flex-start',
  },
  pinNumberBadge: {
    position: 'absolute',
    alignItems: 'center', justifyContent: 'center',
  },
  pinNumberText: {
    color: '#ffffff',
    fontSize: 10, fontWeight: '900',
    lineHeight: 12,
  },
  priorityLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textSecondary,
    letterSpacing: 0.3, marginTop: 4, marginBottom: 4,
  },

  // Creation modal
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
    marginBottom: 12,
  },
  modalHeaderTitle: {
    flex: 1,
    fontSize: 16, fontWeight: '800', color: Colors.navy,
    letterSpacing: 0.3,
  },
  modalSeqBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 10, backgroundColor: Colors.navy,
  },
  modalSeqBadgeText: { color: Colors.white, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  modalSectionLabel: {
    fontSize: 10, fontWeight: '800', color: Colors.textMuted,
    letterSpacing: 1.2, textTransform: 'uppercase',
    marginBottom: 6,
  },
  modalDivider: {
    height: 1, backgroundColor: Colors.divider,
    marginVertical: 12,
  },
  modalDualRow: {
    flexDirection: 'row', alignItems: 'stretch', gap: 10,
  },
  modalDualBox: {
    backgroundColor: '#f7f9fc',
    borderRadius: Radius.md,
    paddingHorizontal: 10, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
    gap: 8,
  },
  modalDualLabel: {
    fontSize: 10, fontWeight: '800', color: Colors.textMuted,
    letterSpacing: 1, textTransform: 'uppercase',
    marginTop: 2,
  },
  modalCameraBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5, borderColor: Colors.navy,
    backgroundColor: 'transparent',
  },
  modalCameraBtnText: { color: Colors.navy, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  listSection: { marginHorizontal: 16, marginBottom: 32, gap: 8 },
  empty: { color: Colors.textMuted, textAlign: 'center', padding: 24, fontSize: 13 },
  annItem: { backgroundColor: Colors.white, borderRadius: Radius.md, borderLeftWidth: 3, borderLeftColor: Colors.danger, ...Shadow.subtle, overflow: 'hidden' },
  annItemOk: { borderLeftColor: Colors.success },
  annItemHighlight: { borderLeftColor: Colors.warning, borderLeftWidth: 4 },
  annHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 },
  numBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  numBadgeText: { color: Colors.white, fontSize: 11, fontWeight: '900' },
  annType: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, marginBottom: 2 },
  annComment: { fontSize: 13, color: Colors.textPrimary, lineHeight: 20 },
  annDate: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  statusChip: { borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 },
  statusChipText: { fontSize: 9, fontWeight: '700', color: Colors.white, letterSpacing: 0.8 },
  annActions: { gap: 6, alignItems: 'flex-end' },
  expandChevron: { fontSize: 14, color: Colors.textMuted, alignSelf: 'center', marginLeft: 4 },
  okBtn: { borderWidth: 1.5, borderColor: Colors.success, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 5, minWidth: 90, alignItems: 'center', backgroundColor: 'transparent' },
  okBtnText: { color: Colors.success, fontSize: 11, fontWeight: '700' },
  delBtn: { borderWidth: 1.5, borderColor: Colors.danger, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 5, minWidth: 90, alignItems: 'center', backgroundColor: 'transparent' },
  delBtnText: { color: Colors.danger, fontSize: 11, fontWeight: '700' },
  // Hilo inline desplegable
  threadInline: { borderTopWidth: 1, borderTopColor: Colors.divider, paddingHorizontal: 14, paddingBottom: 14, gap: 8, backgroundColor: '#f8faff' },
  threadEmptyText: { color: Colors.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: 8 },
  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(14,33,61,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: Colors.white, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: 24, gap: 14 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: Colors.navy },
  commentInput: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14, fontSize: 14, borderWidth: 1, borderColor: Colors.border, minHeight: 80, textAlignVertical: 'top', color: Colors.textPrimary },
  cameraModalBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border, alignSelf: 'flex-start' },
  cameraModalBtnText: { fontSize: 13, fontWeight: '600', color: Colors.navy },
  modalBtns: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  cancelBtn: { padding: 12 },
  cancelBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 24, paddingVertical: 12 },
  saveBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  commentBubble: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 12, gap: 6, marginBottom: 8, borderLeftWidth: 2, borderLeftColor: Colors.border },
  commentBubbleFirst: { borderLeftColor: Colors.primary, backgroundColor: '#f0f4ff' },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  commentAuthor: { fontSize: 12, fontWeight: '700', color: Colors.navy },
  firstLabel: { fontSize: 9, fontWeight: '700', color: Colors.primary, backgroundColor: Colors.light, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, letterSpacing: 0.5 },
  commentDate: { fontSize: 11, color: Colors.textMuted, marginLeft: 'auto' },
  commentDelBtn: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: Colors.danger },
  commentDelBtnText: { fontSize: 10, color: Colors.danger, fontWeight: '600' },
  commentContent: { fontSize: 13, color: Colors.textPrimary, lineHeight: 20 },
  commentContentEmpty: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
  replyFormContainer: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, gap: 10 },
  replyFormInput: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 12, fontSize: 14, borderWidth: 1, borderColor: Colors.border, minHeight: 70, textAlignVertical: 'top', color: Colors.textPrimary },
  replyFormActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, padding: 10, alignItems: 'center' },
  replyBtnText: { color: Colors.white, fontWeight: '700', fontSize: 12 },
  // Photos
  photosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  photoThumb: { width: 72, height: 72, borderRadius: Radius.sm, backgroundColor: Colors.surface },
  photoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  photoFullscreen: { width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.85 },
  // DWG button in header
  dwgBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.navy, borderRadius: Radius.md,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  dwgBtnText: { color: Colors.white, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  // Page navigation
  pageNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 8, backgroundColor: Colors.white, borderRadius: Radius.md,
    padding: 10, ...Shadow.subtle,
  },
  pageNavBtn: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.white,
  },
  pageNavBtnText: { fontSize: 12, fontWeight: '700', color: Colors.navy },
  pageNavText: { fontSize: 13, fontWeight: '700', color: Colors.navy },
  // Plan dropdown selector
  planSelectorWrap: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, zIndex: 10 },
  planSelectorBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  planSelectorLabel: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2 },
  planSelectorName: { fontSize: 14, fontWeight: '700', color: Colors.navy, marginTop: 1 },
  planSelectorChevron: { fontSize: 14, color: Colors.textSecondary },
  planDropdownList: { borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.white },
  planDropdownItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  planDropdownItemActive: { backgroundColor: '#eef2ff' },
  planDropdownItemText: { flex: 1, fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  planDropdownItemTextActive: { fontWeight: '700', color: Colors.primary },
  planDropdownCheck: { fontSize: 14, color: Colors.primary, fontWeight: '700' },
});
