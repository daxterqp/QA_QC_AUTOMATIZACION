/**
 * WorkSessionDetailScreen — vista de detalle de una sesión CERRADA.
 *
 * - Resumen: equipo, actividad, sector, turno, fechas, duración efectiva,
 *   tiempo pausado, # puntos GPS.
 * - Lista de intervals.
 * - Si user es CREATOR/RESIDENT: edición de `notes` + botón eliminar.
 * - Si sesión no está cerrada y es del user actual: redirige a Running.
 *
 *  La edición de timestamps queda fuera de scope v1 (requiere recalcular intervals).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, Modal } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { Colors, Radius } from '../theme/colors';
import {
  workSessionsCollection, workSessionIntervalsCollection,
  workSessionGpsPointsCollection, workSessionFormItemsCollection,
  equipmentCollection, activitiesCollection, projectSectorsCollection,
  workShiftsCollection, database,
} from '@db/index';
import { useAuth } from '@context/AuthContext';
import { useTour } from '@context/TourContext';
import { useTourStep } from '@hooks/useTourStep';
import { enqueue as enqueueSync } from '@services/SyncQueueService';
import { effectiveDurationMs, pausedDurationMs, updateEndedAt } from '@services/WorkSessionService';
import type WorkSession from '@models/WorkSession';
import type WorkSessionInterval from '@models/WorkSessionInterval';
import { useI18n } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkSessionDetail'>;

function fmtClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function WorkSessionDetailScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const insets = useSafeAreaInsets();
  const isAdmin = currentUser?.role === 'CREATOR' || currentUser?.role === 'RESIDENT';
  const { jumpToStep, isActive: tourActive, isContextual, dismissTour } = useTour();
  const wsdSummaryRef = useTourStep('wsd_summary');
  const wsdInfoRef = useTourStep('wsd_info');
  const wsdNotesRef = useTourStep('wsd_notes');

  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);

  const [session, setSession] = useState<WorkSession | null>(null);
  const [intervals, setIntervals] = useState<WorkSessionInterval[]>([]);
  const [equipName, setEquipName] = useState('');
  const [activityName, setActivityName] = useState('');
  const [sectorName, setSectorName] = useState('');
  const [shiftName, setShiftName] = useState('');
  const [gpsCount, setGpsCount] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  // v30 — Edición de hora de cierre (solo CREATOR/RESIDENT).
  const [editEndOpen, setEditEndOpen] = useState(false);
  const [editYmd, setEditYmd] = useState<string>('');
  const [editHour, setEditHour] = useState('');
  const [editMin, setEditMin] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    const sub = workSessionsCollection.findAndObserve(sessionId).subscribe((s) => {
      if (!s) return;
      setSession(s as WorkSession);
      const sAny = s as any;
      setNotes(sAny.notes ?? '');
      equipmentCollection.find(sAny.equipmentId).then((e: any) => setEquipName(`${e.code} — ${e.name}`)).catch(() => {});
      activitiesCollection.find(sAny.activityId).then((a: any) => setActivityName(a.name)).catch(() => {});
      if (sAny.sectorId) projectSectorsCollection.find(sAny.sectorId).then((x: any) => setSectorName(x.name)).catch(() => {});
      if (sAny.shiftId) workShiftsCollection.find(sAny.shiftId).then((x: any) => setShiftName(x.name)).catch(() => {});
    });
    return () => sub.unsubscribe();
  }, [sessionId]);

  useEffect(() => {
    const sub = workSessionIntervalsCollection
      .query(Q.where('session_id', sessionId), Q.sortBy('started_at', Q.asc))
      .observe()
      .subscribe(setIntervals);
    return () => sub.unsubscribe();
  }, [sessionId]);

  useEffect(() => {
    workSessionGpsPointsCollection.query(Q.where('session_id', sessionId)).fetchCount()
      .then(setGpsCount).catch(() => {});
  }, [sessionId, intervals]);

  if (!session) return <View style={styles.loadingWrap}><Text>{t('workSession.loading')}</Text></View>;

  // Fix C4: redirect sincrono dentro del render. Evita que un CREATOR vea
  // brevemente botones de eliminar/save sobre una sesion ACTIVE/PAUSED y
  // dispare un markAsDeleted antes de que el navigation.replace asincrono se
  // ejecute (lo que dejaba Running con un sessionId borrado -> spinner perpetuo).
  {
    const st = (session as any).status;
    if (st !== 'CLOSED' && (session as any).userId === currentUser?.id) {
      setTimeout(() => navigation.replace('TraceabilityRunning' as any, { sessionId }), 0);
      return (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      );
    }
  }

  const sAny = session as any;
  const effMs = effectiveDurationMs(intervals);
  const pauMs = pausedDurationMs(intervals);

  const handleSaveNotes = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      await database.write(async () => {
        await (session as any).update((r: any) => { r.notes = notes; });
      });
      enqueueSync({ opType: 'PUSH_WORK_SESSION', entityId: sessionId, projectId: sAny.projectId }).catch(() => {});
    } finally { setSaving(false); }
  };

  const openEditEnd = () => {
    if (!sAny.endedAt) return;
    const d = new Date(sAny.endedAt);
    const pad = (n: number) => String(n).padStart(2, '0');
    setEditYmd(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setEditHour(String(d.getHours()));
    setEditMin(pad(d.getMinutes()));
    setEditEndOpen(true);
  };
  const handleSaveEditEnd = async () => {
    setEditSaving(true);
    try {
      const [y, m, d] = editYmd.split('-').map(n => parseInt(n, 10));
      const h = parseInt(editHour, 10);
      const mi = parseInt(editMin, 10);
      if (!isFinite(y) || !isFinite(m) || !isFinite(d) || !isFinite(h) || !isFinite(mi)) {
        Alert.alert(t('workSession.alert.invalidDataTitle'), t('workSession.alert.invalidDataMsg'));
        return;
      }
      const newMs = new Date(y, m - 1, d, h, mi, 0, 0).getTime();
      await updateEndedAt(sessionId, newMs);
      setEditEndOpen(false);
    } catch (e) {
      Alert.alert(t('workSession.alert.fixFailedTitle'), (e as Error).message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('workSession.alert.deleteTitle'),
      t('workSession.alert.deleteMsg'),
      [
        { text: t('workSession.alert.cancel'), style: 'cancel' },
        {
          text: t('workSession.alert.delete'), style: 'destructive', onPress: async () => {
            try {
              // Fix #8.2 — WMDB no cascadea automáticamente. Borramos los
              // hijos (intervals, form_items, gps_points) manualmente para
              // evitar registros huérfanos en SQLite local (Supabase ya
              // cascadea remoto via FK SQL).
              const [intervalsToDelete, formItemsToDelete, gpsToDelete] = await Promise.all([
                workSessionIntervalsCollection.query(Q.where('session_id', sessionId)).fetch(),
                workSessionFormItemsCollection.query(Q.where('session_id', sessionId)).fetch(),
                workSessionGpsPointsCollection.query(Q.where('session_id', sessionId)).fetch(),
              ]);
              await database.write(async () => {
                await database.batch([
                  ...intervalsToDelete.map((i: any) => i.prepareDestroyPermanently()),
                  ...formItemsToDelete.map((f: any) => f.prepareDestroyPermanently()),
                  ...gpsToDelete.map((g: any) => g.prepareDestroyPermanently()),
                  (session as any).prepareMarkAsDeleted(),
                ]);
              });
              enqueueSync({ opType: 'DELETE_WORK_SESSION', entityId: sessionId, projectId: sAny.projectId }).catch(() => {});
              navigation.goBack();
            } catch (e) {
              Alert.alert(t('workSession.alert.errorTitle'), (e as Error).message);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader title={t('workSession.title')} subtitle={equipName} onBack={() => {
        // v30 — Volver siempre al Home de Trazabilidad, no a Nueva Sesión que
        // queda en la pila por el flujo Capture → Checklist → Running → Detail.
        const state = (navigation as any).getState?.();
        const routes = state?.routes ?? [];
        const homeIdx = routes.findIndex((r: any) => r.name === 'TraceabilityHome');
        if (homeIdx >= 0) {
          const popCount = routes.length - 1 - homeIdx;
          if (popCount > 0) { (navigation as any).pop?.(popCount); return; }
        }
        navigation.goBack();
      }}
      rightContent={
        <TouchableOpacity onPress={() => jumpToStep('wsd_summary')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
        </TouchableOpacity>
      }
      />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(60, insets.bottom + 60) }]}>
        {sAny.autoClosed && (
          <View style={styles.banner}>
            <Ionicons name="alarm" size={14} color={Colors.warning} />
            <Text style={styles.bannerText}>{t('workSession.autoClosedBanner')}</Text>
          </View>
        )}

        <View ref={wsdSummaryRef} style={styles.bigCard}>
          <Text style={styles.clock}>{fmtClock(effMs)}</Text>
          <Text style={styles.clockLabel}>{t('workSession.effectiveTime')}</Text>
          {pauMs > 0 && <Text style={styles.pausedTotal}>{t('workSession.pausedTotal', { time: fmtClock(pauMs) })}</Text>}
        </View>

        <View ref={wsdInfoRef} style={styles.infoCard}>
          <InfoRow label={t('workSession.field.equipment')} value={equipName} />
          <InfoRow label={t('workSession.field.activity')} value={activityName} />
          {sectorName ? <InfoRow label={t('workSession.field.sector')} value={sectorName} /> : <InfoRow label={t('workSession.field.sector')} value="—" />}
          {shiftName ? <InfoRow label={t('workSession.field.shift')} value={shiftName} /> : null}
          <InfoRow label={t('workSession.field.start')} value={new Date(sAny.startedAt).toLocaleString()} />
          {sAny.endedAt && <InfoRow label={t('workSession.field.end')} value={new Date(sAny.endedAt).toLocaleString()} />}
          <InfoRow label={t('workSession.field.gpsPoints')} value={String(gpsCount)} />
        </View>

        {isAdmin && sAny.endedAt && (
          <TouchableOpacity style={styles.editEndBtn} onPress={openEditEnd} activeOpacity={0.8}>
            <Ionicons name="time-outline" size={14} color={Colors.primary} />
            <Text style={styles.editEndBtnText}>{t('workSession.editEnd')}</Text>
          </TouchableOpacity>
        )}

        {/* v30 — Ver checklist (si esta sesión tiene items del template) */}
        <ChecklistButtonIfAny
          sessionId={sessionId}
          onOpen={() => navigation.navigate('ChecklistView' as any, { sessionId })}
        />

        <Text style={styles.sectionTitle}>{t('workSession.notes')}</Text>
        {isAdmin ? (
          <>
            <View ref={wsdNotesRef}>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder={t('workSession.notesPlaceholder')}
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveNotes} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? t('workSession.saving') : t('workSession.saveNotes')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.notesReadOnly}>
            <Text style={styles.notesText}>{notes || t('workSession.noNotes')}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>{t('workSession.intervals')}</Text>
        {intervals.map((it, idx) => {
          const k = (it as any).kind;
          const dur = ((it as any).endedAt ?? Date.now()) - (it as any).startedAt;
          return (
            <View key={it.id} style={[styles.intervalRow, { borderLeftColor: k === 'active' ? Colors.success : Colors.warning }]}>
              <Text style={styles.intervalText}>
                {idx + 1}. {k === 'active' ? t('workSession.interval.active') : t('workSession.interval.pause')} — {fmtClock(dur)}
              </Text>
              <Text style={styles.intervalSub}>
                {new Date((it as any).startedAt).toLocaleTimeString()}
                {(it as any).endedAt ? ` → ${new Date((it as any).endedAt).toLocaleTimeString()}` : t('workSession.interval.open')}
              </Text>
            </View>
          );
        })}

        {isAdmin && (
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Ionicons name="trash" size={16} color={Colors.white} />
            <Text style={styles.deleteBtnText}>{t('workSession.delete')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal visible={editEndOpen} animationType="fade" transparent onRequestClose={() => setEditEndOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('workSession.editEnd')}</Text>
            <Text style={styles.modalSub}>
              {t('workSession.editEnd.sub')}
            </Text>
            <Calendar
              current={editYmd || undefined}
              onDayPress={(day: any) => setEditYmd(day.dateString)}
              markedDates={editYmd ? { [editYmd]: { selected: true, selectedColor: Colors.primary } } : {}}
              maxDate={(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()}
              theme={{ todayTextColor: Colors.primary, arrowColor: Colors.primary }}
            />
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>{t('workSession.editEnd.timeLabel')}</Text>
              <TextInput
                style={styles.timeInput}
                value={editHour}
                onChangeText={(t) => setEditHour(t.replace(/[^\d]/g, '').slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="HH"
              />
              <Text style={styles.timeSep}>:</Text>
              <TextInput
                style={styles.timeInput}
                value={editMin}
                onChangeText={(t) => setEditMin(t.replace(/[^\d]/g, '').slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="mm"
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditEndOpen(false)} disabled={editSaving}>
                <Text style={styles.modalCancelText}>{t('workSession.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveEditEnd} disabled={editSaving}>
                <Text style={styles.modalSaveText}>{editSaving ? t('workSession.saving') : t('workSession.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ChecklistButtonIfAny({ sessionId, onOpen }: { sessionId: string; onOpen: () => void }) {
  const { t } = useI18n();
  const [hasItems, setHasItems] = useState(false);
  useEffect(() => {
    workSessionFormItemsCollection.query(Q.where('session_id', sessionId)).fetchCount()
      .then(n => setHasItems(n > 0)).catch(() => {});
  }, [sessionId]);
  if (!hasItems) return null;
  return (
    <TouchableOpacity style={styles.checklistBtn} onPress={onOpen} activeOpacity={0.8}>
      <Ionicons name="checkbox-outline" size={14} color={Colors.primary} />
      <Text style={styles.checklistBtnText}>{t('workSession.viewChecklist')}</Text>
      <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
    </TouchableOpacity>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 12, paddingBottom: 60 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginBottom: 10, backgroundColor: Colors.warning + '15', borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.warning + '50' },
  bannerText: { fontSize: 12, color: Colors.warning, flex: 1 },
  bigCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 18, alignItems: 'center' },
  clock: { fontSize: 48, fontWeight: '900', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  clockLabel: { fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  pausedTotal: { fontSize: 12, color: Colors.warning, fontStyle: 'italic', marginTop: 6 },
  infoCard: { backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 10, marginTop: 12 },
  infoRow: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  infoLabel: { fontSize: 11, color: Colors.textMuted, width: 90 },
  infoValue: { fontSize: 12, color: Colors.textPrimary, fontWeight: '600', flex: 1 },
  sectionTitle: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1, marginTop: 16, marginBottom: 6 },
  notesInput: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: 10, minHeight: 80, fontSize: 13, color: Colors.textPrimary, textAlignVertical: 'top' },
  notesReadOnly: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: 10, minHeight: 40 },
  notesText: { fontSize: 13, color: Colors.textSecondary },
  saveBtn: { backgroundColor: Colors.primary, padding: 10, borderRadius: Radius.sm, alignItems: 'center', marginTop: 6 },
  saveBtnText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
  intervalRow: { backgroundColor: Colors.white, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4, padding: 8, marginBottom: 4 },
  intervalText: { fontSize: 12, color: Colors.textPrimary, fontWeight: '700' },
  intervalSub: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.danger, padding: 12, borderRadius: Radius.md, marginTop: 16 },
  deleteBtnText: { color: Colors.white, fontSize: 13, fontWeight: '800' },

  // v30 — Edición de hora de cierre (CREATOR/RESIDENT).
  editEndBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 10, paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: Colors.primary + '10', borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.primary + '30',
  },
  editEndBtnText: { color: Colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  checklistBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 8, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: Colors.primary + '08',
    borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.primary + '30',
  },
  checklistBtnText: { flex: 1, color: Colors.primary, fontSize: 12, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14 },
  modalTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  modalSub: { fontSize: 11, color: Colors.textMuted, marginBottom: 8 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  timeLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '700' },
  timeInput: {
    width: 56, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingVertical: 6, paddingHorizontal: 8, textAlign: 'center',
    fontSize: 14, color: Colors.textPrimary, fontVariant: ['tabular-nums'],
  },
  timeSep: { fontSize: 16, color: Colors.textPrimary, fontWeight: '800' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  modalCancelBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.sm },
  modalCancelText: { color: Colors.textSecondary, fontWeight: '700' },
  modalSaveBtn: { backgroundColor: Colors.primary, paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.sm },
  modalSaveText: { color: Colors.white, fontWeight: '800' },
});
