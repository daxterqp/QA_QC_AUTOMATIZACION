/**
 * TraceabilityRunningScreen — pantalla del cronómetro con SlideToConfirm para
 * pausar/reanudar + botón Stop (tap + modal de confirmación).
 *
 * Diseño:
 *  - Cronómetro grande (mm:ss o hh:mm:ss) actualizado cada segundo.
 *  - Chip de estado (ACTIVA / PAUSADA).
 *  - Lista colapsable de intervals con duraciones.
 *  - Si ACTIVA: SlideToConfirm ámbar "Desliza para pausar".
 *  - Si PAUSADA: SlideToConfirm verde "Desliza para reanudar".
 *  - SIEMPRE: botón Stop rojo (tap), abre modal de confirmación.
 *
 *  Si el user actual NO es el dueño device de la sesión → solo lectura (sin
 *  controles). Decisión #12 device lock.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { Colors, Radius } from '../theme/colors';
import { SlideToConfirm } from '@components/SlideToConfirm';
import { showToast } from '@components/Toast';
import {
  workSessionsCollection, workSessionIntervalsCollection,
  equipmentCollection, activitiesCollection, projectSectorsCollection,
  projectsCollection,
  equipmentActivitiesCollection, sessionFormTemplatesCollection,
} from '@db/index';
import type WorkSession from '@models/WorkSession';
import type WorkSessionInterval from '@models/WorkSessionInterval';
import {
  pauseSession, resumeSession, closeSession,
  effectiveDurationMs, pausedDurationMs, isTracking,
} from '@services/WorkSessionService';
import { useAuth } from '@context/AuthContext';
import { useTour } from '@context/TourContext';
import { useTourStep } from '@hooks/useTourStep';
import { getDeviceId } from '@utils/deviceId';
import { parseFeatureFlagsJson } from '@utils/featureFlags';
import { useI18n } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'TraceabilityRunning'>;

function fmtClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function TraceabilityRunningScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const insets = useSafeAreaInsets();
  const { jumpToStep, isActive: tourActive, isContextual, dismissTour } = useTour();
  const traceRunTimerRef = useTourStep('trace_run_timer');
  const traceRunActionsRef = useTourStep('trace_run_actions');

  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);

  const [session, setSession] = useState<WorkSession | null>(null);
  const [intervals, setIntervals] = useState<WorkSessionInterval[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [equipName, setEquipName] = useState('');
  const [activityName, setActivityName] = useState('');
  const [sectorName, setSectorName] = useState('');
  const [gpsPolling, setGpsPolling] = useState<'off' | 'foreground' | 'background'>('off');
  const [gpsInterval, setGpsInterval] = useState(3);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [working, setWorking] = useState(false);

  useEffect(() => { getDeviceId().then(setDeviceId).catch(() => {}); }, []);

  // Sub a sesión
  useEffect(() => {
    const sub = workSessionsCollection.findAndObserve(sessionId).subscribe((s) => {
      if (!s) return;
      setSession(s as WorkSession);
      const sAny = s as any;
      equipmentCollection.find(sAny.equipmentId).then((e: any) => setEquipName(`${e.code} — ${e.name}`)).catch(() => {});
      activitiesCollection.find(sAny.activityId).then((a: any) => setActivityName(a.name)).catch(() => {});
      if (sAny.sectorId) {
        projectSectorsCollection.find(sAny.sectorId).then((s2: any) => setSectorName(s2.name)).catch(() => {});
      }
      // Cargar nombre del template del checklist (si existe vínculo equipo-actividad-template)
      (async () => {
        try {
          const links = await equipmentActivitiesCollection
            .query(Q.where('equipment_id', sAny.equipmentId), Q.where('activity_id', sAny.activityId))
            .fetch();
          const link = links[0] as any;
          if (link?.formTemplateId) {
            const tmpl = await sessionFormTemplatesCollection.find(link.formTemplateId).catch(() => null);
            if (tmpl) setTemplateName((tmpl as any).name);
          } else {
            setTemplateName(null);
          }
        } catch { /* sin template */ }
      })();
      projectsCollection.find(sAny.projectId).then((p: any) => {
        const flags = parseFeatureFlagsJson(p?.featureFlags);
        setGpsPolling(flags.traceability_gps_polling);
        setGpsInterval(flags.traceability_gps_interval_seconds || 3);
      }).catch(() => {});
    });
    return () => sub.unsubscribe();
  }, [sessionId]);

  // Sub a intervals
  useEffect(() => {
    const sub = workSessionIntervalsCollection
      .query(Q.where('session_id', sessionId), Q.sortBy('started_at', Q.asc))
      .observe()
      .subscribe(setIntervals);
    return () => sub.unsubscribe();
  }, [sessionId]);

  // Tick cronómetro — Fix C5: corre durante ACTIVE y PAUSED para que el contador
  // de tiempo pausado avance en pantalla. Solo se detiene cuando CLOSED.
  useEffect(() => {
    if (!session || (session as any).status === 'CLOSED') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session]);

  const effMs = useMemo(() => effectiveDurationMs(intervals, now), [intervals, now]);
  const pauMs = useMemo(() => pausedDurationMs(intervals, now), [intervals, now]);

  if (!session) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const status = (session as any).status as 'ACTIVE' | 'PAUSED' | 'CLOSED';
  const sAny = session as any;
  const isOwnerOfDevice = deviceId && (!sAny.startedOnDeviceId || sAny.startedOnDeviceId === deviceId);
  const isMine = currentUser?.id === sAny.userId;
  const canControl = status !== 'CLOSED' && isMine && isOwnerOfDevice;
  const gpsActive = isTracking(sessionId);

  const handlePause = async () => {
    if (working) return;
    setWorking(true);
    try { await pauseSession(sessionId); showToast(t('traceRunning.toast.paused'), 'warning'); }
    catch (e) { showToast((e as Error).message || t('traceRunning.toast.pauseError'), 'danger'); }
    finally { setWorking(false); }
  };
  const handleResume = async () => {
    if (working) return;
    setWorking(true);
    try {
      // Fix A3: pasar deviceId para que el tracker background filtre la sesión
      // activa por device. Si aún no se cargó, getDeviceId() lo obtiene.
      const did = deviceId ?? await getDeviceId();
      await resumeSession(sessionId, gpsPolling, gpsInterval, did);
      showToast(t('traceRunning.toast.resumed'), 'success');
    }
    catch (e) { showToast((e as Error).message || t('traceRunning.toast.resumeError'), 'danger'); }
    finally { setWorking(false); }
  };
  const handleStop = () => {
    Alert.alert(
      t('traceRunning.close.title'),
      t('traceRunning.close.message', {
        effective: fmtClock(effMs),
        paused: pauMs > 0 ? t('traceRunning.close.pausedLine', { paused: fmtClock(pauMs) }) : '',
      }),
      [
        { text: t('traceRunning.close.cancel'), style: 'cancel' },
        {
          text: t('traceRunning.close.confirm'), style: 'destructive', onPress: async () => {
            setWorking(true);
            try {
              await closeSession(sessionId);
              showToast(t('traceRunning.toast.closed'), 'success');
              navigation.replace('WorkSessionDetail' as any, { sessionId });
            } catch (e) {
              showToast((e as Error).message || t('traceRunning.toast.closeError'), 'danger');
            } finally { setWorking(false); }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title={t('traceRunning.title')}
        subtitle={equipName}
        onBack={() => navigation.goBack()}
        rightContent={
          <TouchableOpacity onPress={() => jumpToStep('trace_run_timer')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(60, insets.bottom + 60) }]}>
        {/* Status + cronómetro */}
        <View ref={traceRunTimerRef} style={[styles.bigCard, { borderColor: status === 'ACTIVE' ? Colors.success : status === 'PAUSED' ? Colors.warning : Colors.textMuted }]}>
          <View style={[styles.statusChip, { backgroundColor: status === 'ACTIVE' ? Colors.success : status === 'PAUSED' ? Colors.warning : Colors.textMuted }]}>
            <Text style={styles.statusChipText}>{status === 'ACTIVE' ? t('traceRunning.status.active') : status === 'PAUSED' ? t('traceRunning.status.paused') : t('traceRunning.status.closed')}</Text>
          </View>
          <Text style={styles.clock}>{fmtClock(effMs)}</Text>
          <Text style={styles.clockLabel}>{t('traceRunning.effectiveTime')}</Text>
          {pauMs > 0 && <Text style={styles.pausedTotal}>{t('traceRunning.pausedTotal', { clock: fmtClock(pauMs) })}</Text>}
          <View style={styles.metaIcons}>
            {gpsPolling !== 'off' && (
              <View style={styles.iconRow}>
                <Ionicons name={gpsActive ? 'location' : 'location-outline'} size={14} color={gpsActive ? Colors.success : Colors.textMuted} />
                <Text style={[styles.iconText, { color: gpsActive ? Colors.success : Colors.textMuted }]}>
                  {gpsActive ? t('traceRunning.gps.active') : t('traceRunning.gps.paused')}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          <InfoRow label={t('traceRunning.info.equipment')} value={equipName} />
          <InfoRow label={t('traceRunning.info.activity')} value={activityName} />
          {sectorName && <InfoRow label={t('traceRunning.info.sector')} value={sectorName} />}
          <InfoRow label={t('traceRunning.info.start')} value={new Date(sAny.startedAt).toLocaleString()} />
        </View>

        {/* Controles — todos basados en deslizamiento (v29 UX) */}
        <View ref={traceRunActionsRef}>
        {canControl && status === 'ACTIVE' && (
          <View style={{ marginTop: 8 }}>
            <SlideToConfirm
              label={t('traceRunning.slide.pause')}
              tone="warning"
              action="pause"
              onConfirm={handlePause}
              disabled={working}
            />
          </View>
        )}
        {canControl && status === 'PAUSED' && (
          <View style={{ marginTop: 8 }}>
            <SlideToConfirm
              label={t('traceRunning.slide.resume')}
              tone="success"
              action="play"
              onConfirm={handleResume}
              disabled={working}
            />
          </View>
        )}
        {canControl && (
          <View style={{ marginTop: 12 }}>
            <SlideToConfirm
              label={t('traceRunning.slide.finish')}
              tone="danger"
              action="stop"
              onConfirm={handleStop}
              disabled={working}
            />
          </View>
        )}
        </View>
        {!canControl && status !== 'CLOSED' && (
          <View style={styles.readOnlyBanner}>
            <Ionicons name="eye-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.readOnlyText}>
              {!isMine ? t('traceRunning.readOnly.otherUser')
                : t('traceRunning.readOnly.otherDevice')}
            </Text>
          </View>
        )}

        {/* Botón Ver checklist (v30) — solo si la actividad tiene template */}
        {templateName && (
          <TouchableOpacity
            style={styles.checklistBtn}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('ChecklistView' as any, { sessionId })}
          >
            <Ionicons name="checkbox-outline" size={16} color={Colors.primary} />
            <Text style={styles.checklistBtnText}>{t('traceRunning.checklist.view', { name: templateName })}</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
          </TouchableOpacity>
        )}

        {/* Intervals */}
        <Text style={styles.sectionTitle}>{t('traceRunning.intervals.title')}</Text>
        {intervals.map((it, idx) => {
          const k = (it as any).kind;
          const dur = ((it as any).endedAt ?? now) - (it as any).startedAt;
          return (
            <View key={it.id} style={[styles.intervalRow, { borderLeftColor: k === 'active' ? Colors.success : Colors.warning }]}>
              <Text style={styles.intervalText}>
                {idx + 1}. {k === 'active' ? t('traceRunning.intervals.active') : t('traceRunning.intervals.pause')} — {fmtClock(dur)}
              </Text>
              <Text style={styles.intervalSub}>
                {new Date((it as any).startedAt).toLocaleTimeString()}
                {(it as any).endedAt ? ` → ${new Date((it as any).endedAt).toLocaleTimeString()}` : ` → ${t('traceRunning.intervals.inProgress')}`}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 12, paddingBottom: 60 },
  bigCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 2, padding: 18, alignItems: 'center', gap: 6 },
  statusChip: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 10 },
  statusChipText: { color: Colors.white, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  clock: { fontSize: 56, fontWeight: '900', color: Colors.textPrimary, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  clockLabel: { fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  pausedTotal: { fontSize: 12, color: Colors.warning, fontStyle: 'italic', marginTop: 4 },
  metaIcons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconText: { fontSize: 11, fontWeight: '600' },
  infoCard: { backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 10, marginTop: 12, marginBottom: 12 },
  infoRow: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  infoLabel: { fontSize: 11, color: Colors.textMuted, width: 70 },
  infoValue: { fontSize: 12, color: Colors.textPrimary, fontWeight: '600', flex: 1 },
  readOnlyBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, padding: 10, backgroundColor: Colors.surface, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  readOnlyText: { fontSize: 12, color: Colors.textMuted, flex: 1, fontStyle: 'italic' },
  sectionTitle: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1, marginTop: 16, marginBottom: 6 },
  checklistBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: Colors.primary + '10',
    borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.primary + '30',
  },
  checklistBtnText: { flex: 1, fontSize: 12, fontWeight: '700', color: Colors.primary },
  intervalRow: { backgroundColor: Colors.white, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4, padding: 8, marginBottom: 4 },
  intervalText: { fontSize: 12, color: Colors.textPrimary, fontWeight: '700' },
  intervalSub: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
});
