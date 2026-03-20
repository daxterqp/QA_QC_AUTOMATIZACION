import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, TextInput, Dimensions, PanResponder, Modal,
  ActivityIndicator, Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import Pdf from 'react-native-pdf';
import {
  database, plansCollection, planAnnotationsCollection,
  annotationCommentsCollection, annotationCommentPhotosCollection,
  usersCollection, protocolsCollection, projectsCollection,
} from '@db/index';
import { useAuth } from '@context/AuthContext';
import { Q } from '@nozbe/watermelondb';
import type Plan from '@models/Plan';
import type PlanAnnotation from '@models/PlanAnnotation';
import type AnnotationComment from '@models/AnnotationComment';
import type AnnotationCommentPhoto from '@models/AnnotationCommentPhoto';
import { Colors, Shadow, Radius } from '../theme/colors';
import { pushProjectToSupabase } from '@services/SupabaseSyncService';
import { supabase } from '@config/supabase';
import { notifyNewAnnotation, notifyNewReply } from '@services/NotificationService';

const { width: SCREEN_W } = Dimensions.get('window');
const PDF_H_BASE = 440;
const ZOOM_LEVELS = [1, 1.5, 2, 3] as const;
type ZoomLevel = typeof ZOOM_LEVELS[number];

type Props = NativeStackScreenProps<RootStackParamList, 'PlanViewer'>;

interface PendingRect { x: number; y: number; width: number; height: number; }
interface PendingDot  { x: number; y: number; }
interface UndoneData  { rectX: number; rectY: number; rectWidth: number; rectHeight: number; comment: string | null; sequenceNumber: number; }

/** Datos de anotación pre-guardada (cuando usuario pide cámara antes de confirmar) */
interface PreSavedAnn { annotationId: string; commentId: string; }

export default function PlanViewerScreen({ navigation, route }: Props) {
  const { planId: initialPlanId, planName: initialPlanName, protocolId, annotationId: highlightAnnotationId, locationId } = route.params;
  const { currentUser } = useAuth();

  const [activePlanId, setActivePlanId] = useState(initialPlanId);
  const [activePlanName, setActivePlanName] = useState(initialPlanName);
  const [locationPlans, setLocationPlans] = useState<Plan[]>([]);
  const [showPlanDropdown, setShowPlanDropdown] = useState(false);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  const [protocolNumber, setProtocolNumber] = useState<string | null>(null);
  const [protocolLocation, setProtocolLocation] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<PlanAnnotation[]>([]);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [pendingRect, setPendingRect] = useState<PendingRect | null>(null);
  const [pendingDot, setPendingDot] = useState<PendingDot | null>(null);
  const [comment, setComment] = useState('');
  const [showCommentModal, setShowCommentModal] = useState(false);

  // Fotos pendientes en el modal de creación (pre-guardadas antes de confirmar)
  const [preSavedAnn, setPreSavedAnn] = useState<PreSavedAnn | null>(null);
  const [pendingModalPhotos, setPendingModalPhotos] = useState<AnnotationCommentPhoto[]>([]);

  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);

  const startPos = useRef({ x: 0, y: 0 });
  const [undoneStack, setUndoneStack] = useState<UndoneData[]>([]);
  const [zoom, setZoom] = useState<ZoomLevel>(1);
  const [pageAspect, setPageAspect] = useState<number>(PDF_H_BASE / SCREEN_W);
  const pdfW = SCREEN_W * zoom;
  const pdfH = pdfW * pageAspect;
  const pdfWRef = useRef(pdfW);
  const pdfHRef = useRef(pdfH);
  useEffect(() => { pdfWRef.current = pdfW; pdfHRef.current = pdfH; }, [pdfW, pdfH]);

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
    protocolsCollection.find(protocolId).then((p: any) => {
      setProtocolNumber(p.protocolNumber ?? null);
      setProtocolLocation(p.locationReference ?? null);
    }).catch(() => {});
  }, [protocolId]);

  // Load all plans for this location (for chip tabs)
  useEffect(() => {
    if (!locationId) return;
    plansCollection
      .query(Q.where('location_id', locationId))
      .fetch()
      .then(setLocationPlans)
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
    plansCollection.find(activePlanId).then(setPlan).catch(() => {});
    const protocolFilter = protocolId
      ? Q.where('protocol_id', protocolId)
      : Q.where('protocol_id', Q.eq(null));
    const sub = planAnnotationsCollection
      .query(Q.where('plan_id', activePlanId), protocolFilter, Q.sortBy('sequence_number', Q.asc))
      .observe()
      .subscribe(setAnnotations);
    return () => sub.unsubscribe();
  }, [activePlanId]);

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
  const nextSeq = annotations.length > 0
    ? Math.max(...annotations.map((a) => a.sequenceNumber)) + 1 : 1;

  const saveAnnotation = async () => {
    if (!currentUser) return;
    if (preSavedAnn) {
      // Ya pre-guardada — solo actualizar el texto del comentario
      await database.write(async () => {
        const ann = await planAnnotationsCollection.find(preSavedAnn.annotationId);
        await ann.update((a) => { a.comment = comment.trim() || null; });
        const c = await annotationCommentsCollection.find(preSavedAnn.commentId);
        await c.update((cm: any) => { cm.content = comment.trim() || null; });
      });
    } else {
      if (!pendingRect && !pendingDot) return;
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
          a.sequenceNumber = nextSeq;
          a.isOk = false;
          (a as any).status = 'OPEN';
          a.createdById = currentUser.id;
        });
      });
    }
    setUndoneStack([]);
    setPendingRect(null); setPendingDot(null);
    setComment(''); setShowCommentModal(false);
    setPreSavedAnn(null); setPendingModalPhotos([]);
    if (plan?.projectId) {
      pushProjectToSupabase(plan.projectId).catch(() => {});
      const locationRef = protocolLocation ?? protocolNumber ?? activePlanName;
      notifyNewAnnotation(plan.projectId, projectName, locationRef, comment.trim() || null);
    }
  };

  // Agregar foto durante creación — pre-guarda la anotación si aún no existe
  const handleCreationCamera = async () => {
    if (!currentUser || (!pendingRect && !pendingDot)) return;
    let commentId = preSavedAnn?.commentId ?? '';
    if (!preSavedAnn) {
      let annId = '';
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
          a.sequenceNumber = nextSeq;
          a.isOk = false;
          (a as any).status = 'OPEN';
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
    navigation.navigate('Camera', { annotationCommentId: commentId });
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
  };

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  const handleUndo = async () => {
    if (annotations.length === 0) return;
    const last = [...annotations].sort((a, b) => b.sequenceNumber - a.sequenceNumber)[0];
    const saved: UndoneData = { rectX: last.rectX, rectY: last.rectY, rectWidth: last.rectWidth, rectHeight: last.rectHeight, comment: last.comment, sequenceNumber: last.sequenceNumber };
    await database.write(async () => { await last.destroyPermanently(); });
    setUndoneStack((p) => [...p, saved]);
  };

  const handleRedo = async () => {
    if (undoneStack.length === 0 || !currentUser) return;
    const data = undoneStack[undoneStack.length - 1];
    await database.write(async () => {
      await planAnnotationsCollection.create((a) => {
        a.planId = activePlanId; a.protocolId = protocolId ?? null;
        a.rectX = data.rectX; a.rectY = data.rectY;
        a.rectWidth = data.rectWidth; a.rectHeight = data.rectHeight;
        a.comment = data.comment; a.sequenceNumber = data.sequenceNumber;
        a.isOk = false; (a as any).status = 'OPEN'; a.createdById = currentUser.id;
      });
    });
    setUndoneStack((p) => p.slice(0, -1));
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
      'Eliminar viñeta',
      `¿Estás seguro de eliminar la viñeta ${ann.sequenceNumber}? Se eliminarán también todos sus comentarios y fotos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: async () => {
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
    navigation.navigate('Camera', { annotationCommentId: commentId });
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
      const locationRef = protocolLocation ?? protocolNumber ?? activePlanName;
      notifyNewReply(plan.projectId, projectName, locationRef, replyText.trim() || null);
    }
  };

  const deletePhoto = (photo: AnnotationCommentPhoto, _commentId: string, isThread: boolean) => {
    Alert.alert('Eliminar foto', '¿Eliminar esta foto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
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
  const isDot = (ann: PlanAnnotation) => ann.rectWidth === 0 && ann.rectHeight === 0;
  const pdfSource = plan?.fileUri ? { uri: plan.fileUri, cache: true } : null;

  const renderAnnotation = (ann: PlanAnnotation) => {
    const highlighted = highlightAnnotationId === ann.id;
    const color = ann.isOk ? Colors.success : Colors.danger;
    if (isDot(ann)) {
      const cx = (ann.rectX / 100) * pdfW - 9;
      const cy = (ann.rectY / 100) * pdfH - 9;
      return (
        <View key={ann.id} style={[styles.dotMarker, { left: cx, top: cy, borderColor: color }]}>
          <Text style={[styles.dotLabel, { color }]}>{String(ann.sequenceNumber)}</Text>
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          {protocolId ? (
            <>
              <Text style={styles.title} numberOfLines={2}>{protocolNumber ?? '—'}</Text>
              {protocolLocation ? (
                <Text style={styles.protocolLocation} numberOfLines={2}>{protocolLocation}</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.title} numberOfLines={1}>{activePlanName}</Text>
          )}
        </View>
        <View style={{ width: 64 }} />
      </View>

      {/* Dropdown selector de plano cuando hay múltiples */}
      {locationPlans.length > 1 && (
        <View style={styles.planSelectorWrap}>
          <TouchableOpacity
            style={styles.planSelectorBtn}
            onPress={() => setShowPlanDropdown((v) => !v)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.planSelectorLabel}>PLANO ACTIVO</Text>
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
                  onPress={() => {
                    if (activePlanId !== p.id) {
                      setAnnotations([]);
                      setPdfLoading(true);
                      setPdfError(null);
                      setSelectedAnn(null);
                      setShowReplyForm(false);
                      setUndoneStack([]);
                      setPendingRect(null);
                      setPendingDot(null);
                      setIsDrawing(false);
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

      {/* Toolbar */}
      {canAnnotate && (
        <View style={styles.floatingToolbar}>
          <View style={styles.toolbarRow}>
            <View style={styles.undoBar}>
              <TouchableOpacity style={[styles.undoBtn, annotations.length === 0 && styles.btnDisabled]} onPress={handleUndo} disabled={annotations.length === 0}>
                <Text style={styles.undoBtnText}>Deshacer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.undoBtn, undoneStack.length === 0 && styles.btnDisabled]} onPress={handleRedo} disabled={undoneStack.length === 0}>
                <Text style={styles.undoBtnText}>Rehacer</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.zoomBar}>
              {ZOOM_LEVELS.map((z) => (
                <TouchableOpacity key={z} style={[styles.zoomBtn, zoom === z && styles.zoomBtnActive]} onPress={() => { setZoom(z); setIsDrawing(false); }}>
                  <Text style={[styles.zoomBtnText, zoom === z && styles.zoomBtnTextActive]}>
                    {z === 1 ? '1x' : z === 1.5 ? '1.5x' : z === 2 ? '2x' : '3x'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TouchableOpacity style={[styles.drawBtn, isDrawing && styles.drawBtnActive]} onPress={() => { setIsDrawing(!isDrawing); setPendingRect(null); setPendingDot(null); }}>
            <Text style={styles.drawBtnText}>{isDrawing ? 'Dibujando — toca o arrastra' : '+ Anotar plano'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} scrollEnabled={!isDrawing}>
        {/* PDF */}
        <View style={styles.pdfSection}>
          <Text style={styles.sectionLabel}>PLANO</Text>
          <ScrollView horizontal scrollEnabled={!isDrawing && zoom > 1} showsHorizontalScrollIndicator={zoom > 1} style={{ borderRadius: Radius.md }}>
            <View style={[styles.pdfContainer, { width: pdfW, height: pdfH }]}>
              {pdfSource ? (
                <Pdf source={pdfSource} style={StyleSheet.absoluteFill}
                  onLoadComplete={(_p, _pa, { width, height }) => { setPdfLoading(false); setPdfError(null); if (width > 0) setPageAspect(height / width); }}
                  onError={() => { setPdfLoading(false); setPdfError('No se pudo cargar el PDF.'); }}
                  enablePaging={false} horizontal={false} fitPolicy={0} minScale={1} maxScale={1} scrollEnabled={false}
                />
              ) : (
                <View style={styles.pdfPlaceholder}><Text style={styles.pdfPlaceholderText}>Sin plano cargado</Text></View>
              )}
              <View style={[StyleSheet.absoluteFill, { zIndex: 1 }]} pointerEvents="none">
                {annotations.map(renderAnnotation)}
                {pendingRect && pendingRect.width > 4 && (
                  <View style={[styles.annotRect, { left: pendingRect.x, top: pendingRect.y, width: pendingRect.width, height: pendingRect.height, borderColor: Colors.primary, borderStyle: 'dashed' }]} />
                )}
                {pendingDot && (
                  <View style={[styles.dotMarker, { left: pendingDot.x - 9, top: pendingDot.y - 9, borderColor: Colors.primary, opacity: 0.7 }]} />
                )}
              </View>
              {isDrawing && <View style={[StyleSheet.absoluteFill, { zIndex: 2 }]} {...panResponder.panHandlers} />}
              {pdfLoading && pdfSource && (
                <View style={[StyleSheet.absoluteFill, styles.loadingOverlay, { zIndex: 3 }]}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={styles.loadingText}>Cargando plano...</Text>
                </View>
              )}
              {pdfError && (
                <View style={[StyleSheet.absoluteFill, styles.errorOverlay, { zIndex: 3 }]}>
                  <Text style={styles.errorText}>{pdfError}</Text>
                </View>
              )}
            </View>
          </ScrollView>
          {canAnnotate && <Text style={styles.hint}>Activa "Anotar plano": toca un punto o arrastra una zona.</Text>}
        </View>

        {/* Lista observaciones */}
        <View style={styles.listSection}>
          <Text style={styles.sectionLabel}>OBSERVACIONES ({annotations.length})</Text>
          {annotations.length === 0 ? (
            <Text style={styles.empty}>Sin observaciones registradas.</Text>
          ) : (
            annotations.map((ann) => {
              const isExpanded = selectedAnn?.id === ann.id;
              return (
                <View key={ann.id} style={[styles.annItem, ann.isOk && styles.annItemOk, highlightAnnotationId === ann.id && styles.annItemHighlight]}>
                  {/* Cabecera: tap para desplegar/contraer */}
                  <TouchableOpacity
                    style={styles.annHeaderRow}
                    onPress={() => toggleExpand(ann)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.numBadge, { backgroundColor: ann.isOk ? Colors.success : Colors.danger }]}>
                      <Text style={styles.numBadgeText}>{String(ann.sequenceNumber)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.annType}>{isDot(ann) ? 'PUNTO' : 'ZONA'}</Text>
                      <Text style={styles.annComment}>{ann.comment || 'Sin comentario'}</Text>
                      <Text style={styles.annDate}>{new Date(ann.createdAt).toLocaleString('es-CL')}</Text>
                      <View style={[styles.statusChip, { backgroundColor: ann.isOk ? Colors.success : Colors.danger }]}>
                        <Text style={styles.statusChipText}>{ann.isOk ? 'CERRADO' : 'PENDIENTE'}</Text>
                      </View>
                    </View>
                    {(isJefe || canAnnotate) && (
                      <View style={styles.annActions}>
                        {isJefe && !ann.isOk && (
                          <TouchableOpacity style={styles.okBtn} onPress={() => markOk(ann)}>
                            <Text style={styles.okBtnText}>Completado</Text>
                          </TouchableOpacity>
                        )}
                        {canAnnotate && (
                          <TouchableOpacity style={styles.delBtn} onPress={() => deleteAnnotation(ann)}>
                            <Text style={styles.delBtnText}>Eliminar</Text>
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
                        <Text style={styles.threadEmptyText}>Sin comentarios aún.</Text>
                      ) : (
                        threadComments.map((c, idx) => {
                          const cAny = c as any;
                          const photos = threadPhotos[c.id] ?? [];
                          const isFirst = idx === 0;
                          return (
                            <View key={c.id} style={[styles.commentBubble, isFirst && styles.commentBubbleFirst]}>
                              <View style={styles.commentMeta}>
                                <Text style={styles.commentAuthor}>{threadUserNames[cAny.authorId] || cAny.authorId}</Text>
                                {isFirst && <Text style={styles.firstLabel}>INICIO</Text>}
                                <Text style={styles.commentDate}>{new Date(c.createdAt).toLocaleString('es-CL')}</Text>
                              </View>
                              {cAny.content ? (
                                <Text style={styles.commentContent}>{cAny.content}</Text>
                              ) : (
                                <Text style={styles.commentContentEmpty}>(solo fotos)</Text>
                              )}
                              {photos.length > 0 && renderPhotoRow(photos, true, c.id)}
                            </View>
                          );
                        })
                      )}

                      {/* Formulario de respuesta o botón */}
                      {showReplyForm ? (
                        <View style={styles.replyFormContainer}>
                          <TextInput
                            style={styles.replyFormInput}
                            placeholder="Escribe un comentario..."
                            placeholderTextColor={Colors.textMuted}
                            value={replyText}
                            onChangeText={setReplyText}
                            multiline
                            numberOfLines={3}
                          />
                          {replyPrePhotos.length > 0 && renderPhotoRow(replyPrePhotos, false, replyPreSaved ?? '')}
                          <View style={styles.replyFormActions}>
                            <TouchableOpacity style={styles.cameraModalBtn} onPress={handleReplyCamera}>
                              <Text style={styles.cameraModalBtnText}>📷 Foto</Text>
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
                              <Text style={styles.cancelBtnText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={sendReply}>
                              <Text style={styles.saveBtnText}>Enviar</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.replyBtn}
                          onPress={() => { setReplyText(''); setReplyPreSaved(null); setReplyPrePhotos([]); setShowReplyForm(true); }}
                        >
                          <Text style={styles.replyBtnText}>+ Responder</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ── Modal de creación de anotación ───────────────────────────────── */}
      <Modal visible={showCommentModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {pendingDot ? 'Punto puntual' : 'Zona marcada'} — Viñeta {preSavedAnn ? '(guardada)' : String(nextSeq)}
            </Text>
            <TextInput
              style={styles.commentInput}
              placeholder="Descripcion de la observacion (opcional)"
              placeholderTextColor={Colors.textMuted}
              value={comment} onChangeText={setComment}
              multiline numberOfLines={3} autoFocus
            />
            {/* Fotos del modal de creación */}
            {pendingModalPhotos.length > 0 && renderPhotoRow(pendingModalPhotos, false, preSavedAnn?.commentId ?? '')}
            <TouchableOpacity style={styles.cameraModalBtn} onPress={handleCreationCamera}>
              <Text style={styles.cameraModalBtnText}>📷 Agregar foto</Text>
            </TouchableOpacity>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={cancelModal}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveAnnotation}>
                <Text style={styles.saveBtnText}>Guardar</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16, backgroundColor: Colors.navy,
  },
  backBtn: { minWidth: 64, paddingVertical: 4 },
  backText: { color: Colors.light, fontSize: 14, fontWeight: '600' },
  title: { fontSize: 11, fontWeight: '700', color: Colors.white, textAlign: 'center', letterSpacing: 0.4, lineHeight: 16 },
  protocolBadge: { fontSize: 9, color: Colors.secondary, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
  protocolLocation: { fontSize: 11, color: Colors.light, fontWeight: '500', marginTop: 2, textAlign: 'center' },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1.5, marginBottom: 6 },
  hint: { fontSize: 11, color: Colors.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 16 },
  floatingToolbar: { backgroundColor: Colors.white, paddingHorizontal: 14, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, ...Shadow.card },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pdfSection: { margin: 16, gap: 8 },
  undoBar: { flexDirection: 'row', gap: 6 },
  undoBtn: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', backgroundColor: Colors.white },
  btnDisabled: { opacity: 0.35 },
  undoBtnText: { fontSize: 11, fontWeight: '700', color: Colors.navy },
  zoomBar: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'flex-end' },
  zoomBtn: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  zoomBtnActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  zoomBtnText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  zoomBtnTextActive: { color: Colors.white },
  drawBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, padding: 13, alignItems: 'center' },
  drawBtnActive: { backgroundColor: Colors.warning },
  drawBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  pdfContainer: { borderRadius: Radius.md, overflow: 'hidden', backgroundColor: '#f0f0f0', ...Shadow.card, borderWidth: 1, borderColor: Colors.border },
  pdfPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pdfPlaceholderText: { color: Colors.textMuted, fontSize: 13 },
  loadingOverlay: { backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: Colors.textSecondary, fontSize: 13 },
  errorOverlay: { backgroundColor: '#fdecea', alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: Colors.danger, fontSize: 13, textAlign: 'center', fontWeight: '600' },
  annotRect: { position: 'absolute', borderWidth: 2.5 },
  badge: { position: 'absolute', top: -11, left: -11, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: Colors.white, fontSize: 10, fontWeight: '900' },
  dotMarker: { position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 2, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  dotLabel: { fontSize: 8, fontWeight: '900' },
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
  okBtn: { backgroundColor: Colors.success, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 5 },
  okBtnText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  delBtn: { backgroundColor: Colors.surface, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
  delBtnText: { color: Colors.danger, fontSize: 11, fontWeight: '600' },
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
