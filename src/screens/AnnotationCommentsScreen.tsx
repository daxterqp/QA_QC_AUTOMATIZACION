import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, Image, Modal, Dimensions,
} from 'react-native';
import AppHeader from '@components/AppHeader';
import { Ionicons } from '@expo/vector-icons';
import { PriorityChip, PRIORITY_META, Priority } from '@components/PriorityChip';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import {
  database, plansCollection, planAnnotationsCollection,
  annotationCommentsCollection, annotationCommentPhotosCollection, usersCollection,
  protocolsCollection, locationsCollection,
} from '@db/index';
import { useAuth } from '@context/AuthContext';
import { useTour } from '@context/TourContext';
import { useTourStep } from '@hooks/useTourStep';
import { Q } from '@nozbe/watermelondb';
import type Plan from '@models/Plan';
import type PlanAnnotation from '@models/PlanAnnotation';
import type AnnotationComment from '@models/AnnotationComment';
import { Colors, Radius, Shadow } from '../theme/colors';
import { pullProjectFromCloud, pushProjectToSupabase } from '@services/SupabaseSyncService';
import { notifyAnnotationClosed } from '@services/NotificationService';
import { useI18n } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'AnnotationComments'>;

interface AnnRow {
  annotation: PlanAnnotation;
  plan: Plan;
  initialComment: string | null;
  initialPhotos: string[];
  creatorName: string;
  protocolNumber: string | null;
  locationReference: string | null;
  locationOnly: string | null;
  specialty: string | null;
  lastReply: { authorName: string; date: Date; content: string | null; photoUris: string[] } | null;
}

export default function AnnotationCommentsScreen({ navigation, route }: Props) {
  const { projectId, projectName } = route.params;
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';
  const { isActive: tourActive, currentStep: tourStep, nextStep: tourNextStep, jumpToStep, isContextual, dismissTour } = useTour();

  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);

  // Tour refs
  const annotationRowRef = useTourStep('annotation_row');
  const annotationStatusBadgeRef = useTourStep('annotation_status_badge');

  const [rows, setRows] = useState<AnnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority | 'none'>('all');

  const filteredRows = React.useMemo(() => {
    return rows.filter((r) => {
      const ann = r.annotation as any;
      const isClosed = ann.isOk || ann.status === 'CLOSED';
      if (statusFilter === 'open' && isClosed) return false;
      if (statusFilter === 'closed' && !isClosed) return false;
      const p = ann.priority as Priority | null | undefined;
      if (priorityFilter === 'none' && p) return false;
      if (priorityFilter !== 'all' && priorityFilter !== 'none' && p !== priorityFilter) return false;
      return true;
    });
  }, [rows, statusFilter, priorityFilter]);

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
        } catch { const fallback = t('annotComments.inspector'); userCache[uid] = fallback; return fallback; }
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

        // Protocolo asociado + ubicación
        let protocolNumber: string | null = null;
        let locationReference: string | null = null;
        let locationOnly: string | null = null;
        let specialty: string | null = null;
        if (annAny.protocolId) {
          try {
            const proto = await protocolsCollection.find(annAny.protocolId) as any;
            protocolNumber = proto.protocolNumber ?? null;
            locationReference = proto.locationReference ?? null;
            if (proto.locationId) {
              try {
                const loc = await locationsCollection.find(proto.locationId) as any;
                locationOnly = loc.locationOnly ?? null;
                specialty = loc.specialty ?? null;
              } catch { /* sin ubicación */ }
            }
          } catch { /* sin protocolo */ }
        }

        result.push({ annotation: ann as PlanAnnotation, plan, initialComment, initialPhotos, creatorName, protocolNumber, locationReference, locationOnly, specialty, lastReply });
      }
      setRows(result);
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => {
    loadData();
    pullProjectFromCloud(projectId)
      .catch(() => {})
      .finally(() => loadData());
  }, [loadData, projectId]));

  const handleOk = async (row: AnnRow) => {
    await database.write(async () => {
      await row.annotation.update((a) => { a.isOk = true; (a as any).status = 'CLOSED'; });
    });
    // Push a Supabase para que el cambio persista en la nube
    pushProjectToSupabase(projectId).catch(() => {});
    notifyAnnotationClosed(projectId, projectName, row.locationOnly, row.specialty);
    await loadData();
  };

  const handleDelete = (row: AnnRow) => {
    Alert.alert(
      t('annotComments.delete.title'),
      t('annotComments.delete.message', { number: (row.annotation as any).sequenceNumber }),
      [
        { text: t('annotComments.delete.cancel'), style: 'cancel' },
        { text: t('annotComments.delete.confirm'), style: 'destructive', onPress: async () => {
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
      <AppHeader
        title={t('annotComments.title')}
        subtitle={projectName}
        onBack={() => navigation.goBack()}
        rightContent={
          <TouchableOpacity onPress={() => jumpToStep('annotation_row')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
          </TouchableOpacity>
        }
      />

      {/* Barra de filtros */}
      {!loading && rows.length > 0 && (
        <View style={styles.filterBar}>
          <View style={styles.filterSection}>
            <View style={styles.filterGroup}>
            {([
              { key: 'all',    label: t('annotComments.filter.all'),    count: rows.length },
              { key: 'open',   label: t('annotComments.filter.open'), count: rows.filter((r) => !((r.annotation as any).isOk || (r.annotation as any).status === 'CLOSED')).length },
              { key: 'closed', label: t('annotComments.filter.closed'), count: rows.filter((r) =>  ((r.annotation as any).isOk || (r.annotation as any).status === 'CLOSED')).length },
            ] as const).map((opt) => {
              const active = statusFilter === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setStatusFilter(opt.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {opt.label} · {opt.count}
                  </Text>
                </TouchableOpacity>
              );
            })}
            </View>
          </View>

          <View style={styles.filterDivider} />

          <View style={styles.filterSection}>
            <View style={styles.filterGroup}>
            {([
              { key: 'all',    label: t('annotComments.filter.all') },
              { key: 'high',   label: PRIORITY_META.high.label,   color: PRIORITY_META.high.bg,   icon: PRIORITY_META.high.icon },
              { key: 'medium', label: PRIORITY_META.medium.label, color: PRIORITY_META.medium.bg, icon: PRIORITY_META.medium.icon },
              { key: 'low',    label: PRIORITY_META.low.label,    color: PRIORITY_META.low.bg,    icon: PRIORITY_META.low.icon },
              { key: 'none',   label: t('annotComments.priority.none'), color: '#6b7a8c' },
            ] as const).map((opt) => {
              const active = priorityFilter === opt.key;
              const color = (opt as any).color as string | undefined;
              const icon = (opt as any).icon as keyof typeof Ionicons.glyphMap | undefined;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.filterChip,
                    color ? { borderColor: color } : null,
                    active && (color ? { backgroundColor: color, borderColor: color } : styles.filterChipActive),
                  ]}
                  onPress={() => setPriorityFilter(opt.key)}
                  activeOpacity={0.8}
                >
                  {icon ? (
                    <Ionicons
                      name={icon}
                      size={12}
                      color={active ? Colors.white : (color ?? Colors.navy)}
                      style={{ marginRight: 4 }}
                    />
                  ) : null}
                  <Text style={[
                    styles.filterChipText,
                    color && !active ? { color } : null,
                    active && styles.filterChipTextActive,
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            </View>
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredRows}
          keyExtractor={(r) => r.annotation.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {rows.length === 0
                ? t('annotComments.empty.noAnnotations')
                : t('annotComments.empty.noMatch')}
            </Text>
          }
          renderItem={({ item: row, index }) => {
            const ann = row.annotation as any;
            const isClosed = ann.isOk || ann.status === 'CLOSED';
            return (
              <TouchableOpacity
                ref={index === 0 ? annotationRowRef : undefined}
                style={[styles.card, isClosed && styles.cardClosed]}
                onPress={() => {
                  if (index === 0 && tourActive && tourStep?.id === 'annotation_tap_row') tourNextStep();
                  handleGo(row);
                }}
                onLongPress={() => handleDelete(row)}
                delayLongPress={500}
                activeOpacity={0.92}
              >
                {/* Cabecera: número + plano */}
                <View style={styles.cardTop}>
                  <View
                    ref={index === 0 ? annotationStatusBadgeRef : undefined}
                    style={[styles.numBadge, { backgroundColor: isClosed ? Colors.success : Colors.danger }]}
                  >
                    <Text style={styles.numBadgeText}>{String(ann.sequenceNumber)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    {row.protocolNumber ? (
                      <Text style={styles.planNameBold} numberOfLines={1}>{row.protocolNumber}</Text>
                    ) : null}
                    <View style={styles.subInfoRow}>
                      {(row.locationOnly || row.specialty) ? (
                        <View style={styles.subInfoItem}>
                          <Ionicons name="location-outline" size={10} color={Colors.textMuted} />
                          <Text style={styles.subInfoText} numberOfLines={1}>
                            {[row.locationOnly, row.specialty].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                      ) : null}
                      {row.creatorName ? (
                        <View style={styles.subInfoItem}>
                          <Ionicons name="person-outline" size={10} color={Colors.textMuted} />
                          <Text style={styles.subInfoText} numberOfLines={1}>{row.creatorName}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  {(ann as any).priority ? (
                    <PriorityChip value={(ann as any).priority} size="sm" />
                  ) : null}
                </View>

                {/* Comentario inicial */}
                <Text style={styles.commentText} numberOfLines={3}>
                  {row.initialComment || t('annotComments.noDescription')}
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
                    <Text style={styles.lastReplyLabel}>{t('annotComments.lastReply')}</Text>
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

                {/* Acciones — solo jefe/creador */}
                {!isClosed && isJefe && (
                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.okBtn} onPress={() => handleOk(row)}>
                      <Text style={styles.okBtnText}>{t('annotComments.completed')}</Text>
                    </TouchableOpacity>
                  </View>
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
  list: { padding: 16, gap: 12 },
  filterBar: {
    marginHorizontal: 12, marginTop: 10, marginBottom: 4,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.divider,
    paddingHorizontal: 12, paddingVertical: 10,
    ...Shadow.subtle,
  },
  filterSection: { gap: 6 },
  filterSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  filterSectionLabel: {
    fontSize: 10, fontWeight: '800', color: Colors.textMuted,
    letterSpacing: 1.2,
  },
  filterDivider: {
    height: 1, backgroundColor: Colors.divider, marginVertical: 10,
  },
  filterGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  filterChipActive: {
    backgroundColor: Colors.navy, borderColor: Colors.navy,
  },
  filterChipText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.2 },
  filterChipTextActive: { color: Colors.white },
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
  subInfoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 3 },
  subInfoItem: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  subInfoText: { fontSize: 10, color: Colors.textMuted },
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
  cardActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  okBtn: {
    borderWidth: 1.5, borderColor: Colors.success, borderRadius: Radius.md,
    paddingVertical: 10, paddingHorizontal: 18, alignItems: 'center',
  },
  okBtnText: { color: Colors.success, fontWeight: '700', fontSize: 13 },
  photosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, width: '100%', marginTop: 4 },
  photoThumb: { width: 72, height: 72, borderRadius: Radius.sm, backgroundColor: Colors.surface },
  photoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  photoFullscreen: { width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.85 },
});
