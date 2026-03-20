import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, Image, Modal, Dimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import {
  database, plansCollection, planAnnotationsCollection,
  annotationCommentsCollection, annotationCommentPhotosCollection, usersCollection,
  protocolsCollection,
} from '@db/index';
import { Q } from '@nozbe/watermelondb';
import type Plan from '@models/Plan';
import type PlanAnnotation from '@models/PlanAnnotation';
import type AnnotationComment from '@models/AnnotationComment';
import { Colors, Radius, Shadow } from '../theme/colors';
import { pullProjectFromCloud } from '@services/SupabaseSyncService';

type Props = NativeStackScreenProps<RootStackParamList, 'AnnotationComments'>;

interface AnnRow {
  annotation: PlanAnnotation;
  plan: Plan;
  initialComment: string | null;
  initialPhotos: string[];
  creatorName: string;
  protocolNumber: string | null;
  locationReference: string | null;
  lastReply: { authorName: string; date: Date; content: string | null; photoUris: string[] } | null;
}

export default function AnnotationCommentsScreen({ navigation, route }: Props) {
  const { projectId, projectName } = route.params;
  const [rows, setRows] = useState<AnnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const plans = await plansCollection.query(Q.where('project_id', projectId)).fetch();
      if (plans.length === 0) { setRows([]); return; }

      const planIds = plans.map((p) => p.id);
      const planMap: Record<string, Plan> = {};
      for (const p of plans) planMap[p.id] = p;

      // Obtener TODAS las anotaciones de esos planos, más recientes primero
      const annotations = await planAnnotationsCollection
        .query(Q.where('plan_id', Q.oneOf(planIds)), Q.sortBy('created_at', Q.desc))
        .fetch();

      // Cargar usuarios para nombres
      const userCache: Record<string, string> = {};
      const getUser = async (uid: string): Promise<string> => {
        if (userCache[uid]) return userCache[uid];
        try {
          const u = await usersCollection.find(uid);
          const name = `${(u as any).name} ${(u as any).apellido ?? ''}`.trim();
          userCache[uid] = name;
          return name;
        } catch { userCache[uid] = uid; return uid; }
      };

      const result: AnnRow[] = [];
      for (const ann of annotations) {
        const annAny = ann as any;
        const plan = planMap[annAny.planId];
        if (!plan) continue;

        const creatorName = await getUser(annAny.createdById);

        // Comentarios del hilo ordenados por fecha
        const comments = await annotationCommentsCollection
          .query(Q.where('annotation_id', ann.id), Q.sortBy('created_at', Q.asc))
          .fetch() as AnnotationComment[];

        // Comentario inicial: siempre el texto con que se creó la viñeta
        const initialComment = annAny.comment ?? null;

        // Fotos del primer comentario del creador → mostrar junto al comentario inicial
        let initialPhotos: string[] = [];
        let lastReply: AnnRow['lastReply'] = null;

        if (comments.length > 0) {
          const first = comments[0] as any;
          const firstIsCreator = first.authorId === annAny.createdById;
          if (firstIsCreator) {
            const firstPhotos = await annotationCommentPhotosCollection
              .query(Q.where('annotation_comment_id', first.id))
              .fetch();
            initialPhotos = firstPhotos.map((p) => (p as any).localUri as string).filter(Boolean);
          }
          // "Última respuesta" = comentarios posteriores al primero del creador
          const replyStart = firstIsCreator ? 1 : 0;
          const replyComments = comments.slice(replyStart);
          if (replyComments.length > 0) {
            const last = replyComments[replyComments.length - 1] as any;
            const authorName = await getUser(last.authorId);
            const lastPhotos = await annotationCommentPhotosCollection
              .query(Q.where('annotation_comment_id', last.id))
              .fetch();
            const photoUris = lastPhotos.map((p) => (p as any).localUri as string).filter(Boolean);
            lastReply = { authorName, date: new Date(last.createdAt), content: last.content ?? null, photoUris };
          }
        }

        // Protocolo asociado
        let protocolNumber: string | null = null;
        let locationReference: string | null = null;
        if (annAny.protocolId) {
          try {
            const proto = await protocolsCollection.find(annAny.protocolId) as any;
            protocolNumber = proto.protocolNumber ?? null;
            locationReference = proto.locationReference ?? null;
          } catch { /* sin protocolo */ }
        }

        result.push({ annotation: ann as PlanAnnotation, plan, initialComment, initialPhotos, creatorName, protocolNumber, locationReference, lastReply });
      }
      setRows(result);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => {
    pullProjectFromCloud(projectId).catch(() => {});
    loadData();
  }, [loadData, projectId]));

  const handleOk = async (row: AnnRow) => {
    await database.write(async () => {
      await row.annotation.update((a) => { a.isOk = true; (a as any).status = 'CLOSED'; });
    });
    await loadData();
  };

  const handleDelete = (row: AnnRow) => {
    Alert.alert(
      'Eliminar observación',
      `¿Estás seguro de eliminar la viñeta ${(row.annotation as any).sequenceNumber}? Se eliminarán también todos sus comentarios y fotos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: async () => {
          await database.write(async () => {
            const comments = await annotationCommentsCollection
              .query(Q.where('annotation_id', row.annotation.id))
              .fetch();
            for (const c of comments) {
              const photos = await annotationCommentPhotosCollection
                .query(Q.where('annotation_comment_id', c.id))
                .fetch();
              for (const p of photos) await p.destroyPermanently();
              await c.destroyPermanently();
            }
            await row.annotation.destroyPermanently();
          });
          await loadData();
        }},
      ]
    );
  };

  const handleGo = (row: AnnRow) => {
    navigation.navigate('PlanViewer', {
      planId: row.plan.id,
      planName: row.plan.name,
      protocolId: row.annotation.protocolId ?? undefined,
      annotationId: row.annotation.id,
      locationId: row.plan.locationId ?? undefined,
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.title}>OBSERVACIONES</Text>
          <Text style={styles.subtitle}>{projectName}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.annotation.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No hay observaciones en los planos de este proyecto.</Text>}
          renderItem={({ item: row }) => {
            const ann = row.annotation as any;
            const isClosed = ann.isOk || ann.status === 'CLOSED';
            return (
              <TouchableOpacity
                style={[styles.card, isClosed && styles.cardClosed]}
                onLongPress={() => handleDelete(row)}
                delayLongPress={500}
                activeOpacity={0.92}
              >
                {/* Cabecera: número + plano */}
                <View style={styles.cardTop}>
                  <View style={[styles.numBadge, { backgroundColor: isClosed ? Colors.success : Colors.danger }]}>
                    <Text style={styles.numBadgeText}>{isClosed ? 'OK' : String(ann.sequenceNumber)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    {row.protocolNumber ? (
                      <Text style={styles.planNameBold} numberOfLines={1}>{row.protocolNumber}</Text>
                    ) : null}
                    <Text style={styles.subPlanName} numberOfLines={1}>
                      {[row.locationReference, row.plan.name, row.creatorName].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>

                {/* Comentario inicial */}
                <Text style={styles.commentText} numberOfLines={3}>
                  {row.initialComment || '(sin descripción)'}
                </Text>

                {/* Fotos del comentario inicial (del creador) */}
                {row.initialPhotos.length > 0 && (
                  <View style={styles.photosRow}>
                    {row.initialPhotos.map((uri) => (
                      <TouchableOpacity key={uri} onPress={() => setFullscreenPhoto(uri)}>
                        <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Fecha creación */}
                <Text style={styles.dateText}>{new Date(ann.createdAt).toLocaleString('es-CL')}</Text>

                {/* Última respuesta (solo comentarios posteriores al inicial) */}
                {row.lastReply && (
                  <View style={styles.lastReplyRow}>
                    <Text style={styles.lastReplyLabel}>Última respuesta:</Text>
                    <Text style={styles.lastReplyText}>
                      {row.lastReply.authorName} · {row.lastReply.date.toLocaleString('es-CL')}
                    </Text>
                    {row.lastReply.content ? (
                      <Text style={styles.lastReplyContent} numberOfLines={2}>{row.lastReply.content}</Text>
                    ) : null}
                    {row.lastReply.photoUris.length > 0 ? (
                      <View style={styles.photosRow}>
                        {row.lastReply.photoUris.map((uri) => (
                          <TouchableOpacity key={uri} onPress={() => setFullscreenPhoto(uri)}>
                            <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>
                )}

                {/* Acciones */}
                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.goBtn} onPress={() => handleGo(row)}>
                    <Text style={styles.goBtnText}>Ir al plano →</Text>
                  </TouchableOpacity>
                  {!isClosed && (
                    <TouchableOpacity style={styles.okBtn} onPress={() => handleOk(row)}>
                      <Text style={styles.okBtnText}>OK</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {!isClosed && (
                  <Text style={styles.longPressHint}>Mantén presionado para eliminar</Text>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
      {/* Foto pantalla completa */}
      <Modal visible={!!fullscreenPhoto} transparent animationType="fade" onRequestClose={() => setFullscreenPhoto(null)}>
        <TouchableOpacity style={styles.photoOverlay} activeOpacity={1} onPress={() => setFullscreenPhoto(null)}>
          {fullscreenPhoto && (
            <Image source={{ uri: fullscreenPhoto }} style={styles.photoFullscreen} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16,
    backgroundColor: Colors.navy,
  },
  backBtn: { padding: 4, minWidth: 60 },
  backText: { color: Colors.light, fontSize: 14, fontWeight: '600' },
  title: { fontSize: 14, fontWeight: '700', color: Colors.white, textAlign: 'center', letterSpacing: 1 },
  subtitle: { fontSize: 11, color: Colors.light, textAlign: 'center' },
  list: { padding: 16, gap: 12 },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: 40, lineHeight: 24 },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14,
    gap: 8, ...Shadow.subtle, borderLeftWidth: 3, borderLeftColor: Colors.danger,
  },
  cardClosed: { borderLeftColor: Colors.success },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  numBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  numBadgeText: { color: Colors.white, fontSize: 11, fontWeight: '900' },
  planName: { fontSize: 12, fontWeight: '400', color: Colors.textMuted },
  planNameBold: { fontSize: 13, fontWeight: '700', color: Colors.navy },
  subPlanName: { fontSize: 11, color: Colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  creatorText: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  statusBadge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  statusBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.white, letterSpacing: 0.5 },
  commentText: { fontSize: 13, color: Colors.textPrimary, lineHeight: 20 },
  dateText: { fontSize: 11, color: Colors.textMuted },
  lastReplyRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: 8 },
  lastReplyLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  lastReplyText: { fontSize: 11, color: Colors.textMuted },
  lastReplyContent: { fontSize: 12, color: Colors.textPrimary, marginTop: 4, width: '100%' },
  lastReplyPhoto: { width: '100%', height: 140, borderRadius: Radius.sm, marginTop: 6 },
  cardActions: { flexDirection: 'row', gap: 10 },
  goBtn: {
    flex: 1, backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 10, alignItems: 'center',
  },
  goBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  okBtn: {
    borderWidth: 1.5, borderColor: Colors.success, borderRadius: Radius.md,
    paddingVertical: 10, paddingHorizontal: 18, alignItems: 'center',
  },
  okBtnText: { color: Colors.success, fontWeight: '700', fontSize: 13 },
  longPressHint: { fontSize: 9, color: Colors.textMuted, textAlign: 'right', fontStyle: 'italic', marginTop: -4 },
  photosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, width: '100%', marginTop: 4 },
  photoThumb: { width: 72, height: 72, borderRadius: Radius.sm, backgroundColor: Colors.surface },
  photoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  photoFullscreen: { width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.85 },
});
