/**
 * ChecklistViewScreen (v30) — vista read-only del checklist lleno de una
 * sesión. Accesible desde:
 *   - TraceabilityRunningScreen (sesión activa)
 *   - WorkSessionDetailScreen (sesión cerrada)
 *   - Pestaña Checklists del análisis
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Image, TouchableOpacity, Modal, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { Colors, Radius } from '../theme/colors';
import {
  workSessionsCollection, workSessionFormItemsCollection, evidencesCollection,
  equipmentCollection, activitiesCollection, sessionFormTemplatesCollection,
  equipmentActivitiesCollection, projectsCollection,
} from '@db/index';
import type WorkSessionFormItem from '@models/WorkSessionFormItem';
import type Evidence from '@models/Evidence';
import { generateChecklistPdf } from '@services/ChecklistPdfService';
import { useAuth } from '@context/AuthContext';
import { useI18n } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'ChecklistView'>;

interface FormItemRow {
  item: WorkSessionFormItem;
  photos: Evidence[];
}

export default function ChecklistViewScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const insets = useSafeAreaInsets();

  const [rows, setRows] = useState<FormItemRow[]>([]);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [equipName, setEquipName] = useState('');
  const [activityName, setActivityName] = useState('');
  const [sessionLabel, setSessionLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [photoOpen, setPhotoOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [projectName, setProjectName] = useState('');
  const { currentUser } = useAuth();
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await workSessionsCollection.find(sessionId).catch(() => null);
        if (!session) return;
        const sAny = session as any;
        const [items, equip, activity, links] = await Promise.all([
          workSessionFormItemsCollection
            .query(Q.where('session_id', sessionId), Q.sortBy('created_at', Q.asc))
            .fetch(),
          equipmentCollection.find(sAny.equipmentId).catch(() => null),
          activitiesCollection.find(sAny.activityId).catch(() => null),
          equipmentActivitiesCollection
            .query(Q.where('equipment_id', sAny.equipmentId), Q.where('activity_id', sAny.activityId))
            .fetch(),
        ]);
        if (cancelled) return;
        if (equip) setEquipName(`${(equip as any).code} — ${(equip as any).name}`);
        if (activity) setActivityName((activity as any).name);
        try {
          const proj = await projectsCollection.find(sAny.projectId);
          setProjectName((proj as any)?.name ?? '');
        } catch { /* opcional */ }
        const link = (links as any[])[0];
        if (link?.formTemplateId) {
          const t = await sessionFormTemplatesCollection.find(link.formTemplateId).catch(() => null);
          if (!cancelled && t) setTemplateName((t as any).name);
        }
        const started = new Date(sAny.startedAt);
        const pad = (n: number) => String(n).padStart(2, '0');
        setSessionLabel(`${pad(started.getDate())}/${pad(started.getMonth() + 1)}/${started.getFullYear()} ${pad(started.getHours())}:${pad(started.getMinutes())}`);

        // Cargar fotos por item
        const itemIds = (items as any[]).map(i => i.id);
        const allPhotos = itemIds.length > 0
          ? await evidencesCollection.query(Q.where('session_form_item_id', Q.oneOf(itemIds))).fetch()
          : [];
        const photosByItem: Record<string, Evidence[]> = {};
        for (const p of allPhotos as any[]) {
          const sfi = p.sessionFormItemId;
          if (!sfi) continue;
          if (!photosByItem[sfi]) photosByItem[sfi] = [];
          photosByItem[sfi].push(p);
        }
        if (cancelled) return;
        setRows((items as WorkSessionFormItem[]).map(it => ({
          item: it,
          photos: photosByItem[(it as any).id] ?? [],
        })));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader
        title={`${t('checklistView.headerTitle')}${templateName ? ' — ' + templateName : ''}`}
        subtitle={sessionLabel}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(40, insets.bottom + 24) }]}>
        <View style={styles.metaCard}>
          <Text style={styles.metaRow}>{t('checklistView.metaEquipment')} <Text style={styles.metaStrong}>{equipName || '—'}</Text></Text>
          <Text style={styles.metaRow}>{t('checklistView.metaActivity')} <Text style={styles.metaStrong}>{activityName || '—'}</Text></Text>
        </View>

        {rows.length > 0 && (
          <TouchableOpacity
            style={styles.exportBtn}
            disabled={exporting}
            onPress={async () => {
              setExporting(true);
              try {
                const uri = await generateChecklistPdf({
                  sessionId,
                  projectName: projectName || t('checklistView.fallbackProject'),
                  exporterName: `${currentUser?.name ?? ''}${currentUser?.apellido ? ' ' + currentUser.apellido : ''}`.trim() || t('checklistView.fallbackExporter'),
                  previewOnly: true,
                });
                navigation.navigate('DossierPreview' as any, { pdfUri: uri, projectName: projectName || t('checklistView.headerTitle') });
              } catch (e) {
                Alert.alert(t('checklistView.exportErrorTitle'), (e as Error).message);
              } finally {
                setExporting(false);
              }
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="document-text-outline" size={16} color="#fff" />
            <Text style={styles.exportBtnText}>{exporting ? t('checklistView.exportGenerating') : t('checklistView.exportButton')}</Text>
          </TouchableOpacity>
        )}

        {rows.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>{t('checklistView.emptyChecklist')}</Text>
          </View>
        ) : rows.map(({ item, photos }) => {
          const a = item as any;
          const tone = a.isNa ? Colors.textMuted : a.isCompliant === true ? Colors.success : a.isCompliant === false ? Colors.danger : Colors.textMuted;
          const label = a.isNa ? t('checklistView.answerNa') : a.isCompliant === true ? t('checklistView.answerYes') : a.isCompliant === false ? t('checklistView.answerNo') : '—';
          return (
            <View key={a.id} style={styles.itemCard}>
              <View style={styles.itemHead}>
                {a.partidaItem ? <Text style={styles.partida}>{a.partidaItem}</Text> : null}
                <Text style={styles.desc}>{a.itemDescription}</Text>
                {a.validationMethod ? <Text style={styles.hint}>{t('checklistView.methodLabel')} {a.validationMethod}</Text> : null}
              </View>
              <View style={styles.answerRow}>
                <View style={[styles.ansBadge, { borderColor: tone, backgroundColor: tone + '15' }]}>
                  <Text style={[styles.ansBadgeText, { color: tone }]}>{label}</Text>
                </View>
                {a.hasAnswer || a.isNa ? null : (
                  <Text style={styles.unanswered}>{t('checklistView.unanswered')}</Text>
                )}
              </View>
              {a.comments ? (
                <View style={styles.commentsBox}>
                  <Text style={styles.commentsLabel}>{t('checklistView.comments')}</Text>
                  <Text style={styles.commentsText}>{a.comments}</Text>
                </View>
              ) : null}
              {photos.length > 0 ? (
                <View style={styles.photosRow}>
                  {photos.map(p => (
                    <TouchableOpacity key={(p as any).id} onPress={() => setPhotoOpen((p as any).localUri)}>
                      <Image source={{ uri: (p as any).localUri }} style={styles.photoThumb} />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={!!photoOpen} transparent onRequestClose={() => setPhotoOpen(null)}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setPhotoOpen(null)} />
          {photoOpen ? <Image source={{ uri: photoOpen }} style={styles.modalImg} resizeMode="contain" /> : null}
          <TouchableOpacity style={styles.modalClose} onPress={() => setPhotoOpen(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 12 },
  metaCard: { backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 10, marginBottom: 10 },
  metaRow: { fontSize: 12, color: Colors.textSecondary, paddingVertical: 2 },
  metaStrong: { color: Colors.textPrimary, fontWeight: '700' },
  itemCard: { backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 10, marginBottom: 8 },
  itemHead: { marginBottom: 6 },
  partida: { fontSize: 10, fontWeight: '900', color: Colors.textMuted, letterSpacing: 0.5, marginBottom: 2 },
  desc: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600', lineHeight: 18 },
  hint: { fontSize: 10, color: Colors.textMuted, marginTop: 4, fontStyle: 'italic' },
  answerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ansBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1 },
  ansBadgeText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  unanswered: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },
  commentsBox: { marginTop: 8, padding: 8, backgroundColor: Colors.surface, borderRadius: Radius.sm },
  commentsLabel: { fontSize: 9, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', marginBottom: 2 },
  commentsText: { fontSize: 12, color: Colors.textPrimary },
  photosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  photoThumb: { width: 64, height: 64, borderRadius: Radius.sm, backgroundColor: Colors.border },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, paddingVertical: 12, borderRadius: Radius.md,
    marginBottom: 12,
  },
  exportBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  empty: { alignItems: 'center', padding: 40, gap: 8 },
  emptyText: { color: Colors.textMuted, fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
  modalImg: { width: '95%', height: '85%' },
  modalClose: { position: 'absolute', top: 40, right: 20 },
});
