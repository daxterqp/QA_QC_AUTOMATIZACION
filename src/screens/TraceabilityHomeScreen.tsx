/**
 * TraceabilityHomeScreen — Listado de sesiones del técnico en el proyecto.
 *
 *  - Top: sesión ACTIVA o PAUSADA del user actual si existe (card destacada).
 *  - Body: sesiones cerradas recientes con duración + chip "Cerrada
 *    automáticamente" si auto_closed=true.
 *  - FAB "+ Nueva sesión" → TraceabilityCapture.
 *  - Pull al montar para refrescar desde Supabase (best-effort offline).
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, FlatList, SectionList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { Colors, Radius } from '../theme/colors';
import {
  workSessionsCollection, workSessionIntervalsCollection,
  equipmentCollection, activitiesCollection, projectSectorsCollection,
} from '@db/index';
import type WorkSession from '@models/WorkSession';
import type WorkSessionInterval from '@models/WorkSessionInterval';
import { useAuth } from '@context/AuthContext';
import {
  pullActivities, pullWorkShifts, pullSessionFormTemplates,
  pullSessionFormTemplateItems, pullEquipmentActivities,
  pullEquipment, pullProjectSectors,
} from '@services/SupabaseSyncService';
import { effectiveDurationMs, pausedDurationMs } from '@services/WorkSessionService';
import { projectsCollection } from '@db/index';
import { parseFeatureFlagsJson, isTraceabilityEnabled } from '@utils/featureFlags';
import { groupByDay } from '@utils/dateGrouping';
import { useTourStep } from '@hooks/useTourStep';
import { useTour } from '@context/TourContext';
import { useI18n } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'TraceabilityHome'>;

function fmtDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TraceabilityHomeScreen({ route, navigation }: Props) {
  const { projectId, projectName } = route.params;
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const userId = currentUser?.id ?? '';
  const insets = useSafeAreaInsets();

  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [intervalsBySession, setIntervalsBySession] = useState<Record<string, WorkSessionInterval[]>>({});
  const [equipNames, setEquipNames] = useState<Record<string, string>>({});
  const [activityNames, setActivityNames] = useState<Record<string, string>>({});
  const [sectorNames, setSectorNames] = useState<Record<string, string>>({});
  // v29 — tick cada segundo para que el cronómetro de la SESIÓN ACTUAL avance
  // sin esperar a que cambien los intervals en WMDB.
  const [now, setNow] = useState(Date.now());

  const latestReqId = useRef(0);

  const { jumpToStep, isActive: tourActive, isContextual, dismissTour } = useTour();
  const traceHomeNewRef = useTourStep('trace_home_new');
  const traceHomeAnalyticsRef = useTourStep('trace_home_analytics');
  const traceHomeSessionRef = useTourStep('trace_home_session');

  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);

  // v29 — Guard de flag: si traceability_module está OFF, no permitimos abrir
  // este screen aunque el usuario llegue vía link directo o long-press viejo.
  useEffect(() => {
    projectsCollection.find(projectId).then((p: any) => {
      const flags = parseFeatureFlagsJson(p?.featureFlags);
      if (!isTraceabilityEnabled(flags)) {
        Alert.alert(
          t('traceHome.moduleUnavailableTitle'),
          t('traceHome.moduleUnavailableMsg'),
          [{ text: t('traceHome.ok'), onPress: () => navigation.goBack() }],
        );
      }
    }).catch(() => {});
  }, [projectId, navigation]);

  useEffect(() => {
    // Pull catálogos + sesiones (best-effort). pullEquipment debe ir antes que
    // pullEquipmentActivities (este requiere equipos locales para resolver FKs).
    (async () => {
      try {
        await Promise.all([
          pullEquipment(projectId),
          pullActivities(projectId),
          pullWorkShifts(projectId),
          pullSessionFormTemplates(projectId),
          pullProjectSectors(projectId),
        ]);
        // Estos requieren los catálogos de arriba ya descargados.
        // v29 — Removido `pullMyWorkSessions`: las sesiones del operador son
        // local-first. Pulleábamos cada vez que entraba a Home y eso podía
        // tocar la sesión activa y "reiniciar" el cronómetro. El SyncWorker
        // se encarga de PUSHEAR los cambios locales a Supabase; ya no
        // pulleamos de vuelta sobre nuestro propio trabajo.
        await Promise.all([
          pullSessionFormTemplateItems(projectId),
          pullEquipmentActivities(projectId),
        ]);
      } catch {}
    })();

    let cancelled = false;

    const sub = workSessionsCollection
      .query(
        Q.where('project_id', projectId),
        Q.where('user_id', userId),
        Q.sortBy('started_at', Q.desc),
        Q.take(50),
      )
      .observe()
      .subscribe(async (ss) => {
        if (cancelled) return;
        latestReqId.current += 1;
        const myReqId = latestReqId.current;
        if (myReqId !== latestReqId.current) return;
        setSessions(ss);
        // Cargar intervals por sesión en UNA sola query (evita N+1)
        const allIds = ss.map(s => s.id);
        if (allIds.length === 0) {
          if (cancelled || myReqId !== latestReqId.current) return;
          setIntervalsBySession({});
          return;
        }
        const allIntervals = await workSessionIntervalsCollection
          .query(Q.where('session_id', Q.oneOf(allIds)), Q.sortBy('started_at', Q.asc))
          .fetch();
        if (cancelled || myReqId !== latestReqId.current) return;
        const map: Record<string, WorkSessionInterval[]> = {};
        for (const it of allIntervals as any[]) {
          const sid = it.sessionId;
          if (!map[sid]) map[sid] = [];
          map[sid].push(it);
        }
        setIntervalsBySession(map);
      });

    // Cache de nombres
    equipmentCollection.query(Q.where('project_id', projectId)).fetch().then((rows) => {
      const map: Record<string, string> = {};
      for (const e of rows as any[]) map[e.id] = `${e.code} — ${e.name}`;
      setEquipNames(map);
    }).catch(() => {});
    activitiesCollection.query(Q.where('project_id', projectId)).fetch().then((rows) => {
      const map: Record<string, string> = {};
      for (const a of rows as any[]) map[a.id] = a.name;
      setActivityNames(map);
    }).catch(() => {});
    projectSectorsCollection.query(Q.where('project_id', projectId)).fetch().then((rows) => {
      const map: Record<string, string> = {};
      for (const s of rows as any[]) map[s.id] = s.name;
      setSectorNames(map);
    }).catch(() => {});

    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, [projectId, userId]);

  const active = useMemo(
    () => sessions.find(s => (s as any).status === 'ACTIVE' || (s as any).status === 'PAUSED'),
    [sessions],
  );
  const closed = useMemo(
    () => sessions.filter(s => (s as any).status === 'CLOSED'),
    [sessions],
  );

  // v30 — Historial agrupado por día calendario (encabezado HOY / AYER / fecha).
  const closedSections = useMemo(
    () => groupByDay(closed, (s: any) => s.startedAt as number, now),
    // `now` cambia cada segundo cuando hay sesión activa — solo dispara
    // recompute si cambió el dayKey real (startOfDay(now)). Para mantenerlo
    // simple, dependemos de `closed` y aceptamos que el header "HOY/AYER"
    // pueda quedar 1 día desfasado si la app queda abierta cruzando medianoche.
    [closed], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // v29 — Tick por segundo solo cuando hay sesión activa (no consume batería
  // cuando no aplica). Re-renderiza la card para que el cronómetro avance.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  // v29 — Cuando la pantalla recibe foco (regreso de Running, etc.), forzamos
  // un re-fetch silencioso para no esperar a que el observable refresque.
  useFocusEffect(
    React.useCallback(() => {
      let stillFocused = true;
      (async () => {
        const ss = await workSessionsCollection
          .query(
            Q.where('project_id', projectId),
            Q.where('user_id', userId),
            Q.sortBy('started_at', Q.desc),
            Q.take(50),
          ).fetch();
        if (!stillFocused) return;
        setSessions(ss);
        const ids = ss.map(s => s.id);
        if (ids.length === 0) { setIntervalsBySession({}); return; }
        const allI = await workSessionIntervalsCollection
          .query(Q.where('session_id', Q.oneOf(ids)), Q.sortBy('started_at', Q.asc)).fetch();
        if (!stillFocused) return;
        const map: Record<string, WorkSessionInterval[]> = {};
        for (const it of allI as any[]) {
          const sid = it.sessionId;
          if (!map[sid]) map[sid] = [];
          map[sid].push(it);
        }
        setIntervalsBySession(map);
      })().catch(() => {});
      return () => { stillFocused = false; };
    }, [projectId, userId]),
  );

  const renderSessionCard = (s: WorkSession, isActive: boolean, tourRef?: React.RefObject<View>) => {
    const intervals = intervalsBySession[s.id] ?? [];
    const eff = effectiveDurationMs(intervals, now);
    const paused = pausedDurationMs(intervals, now);
    const status = (s as any).status;
    const tone = status === 'ACTIVE' ? Colors.success : status === 'PAUSED' ? Colors.warning : Colors.textMuted;
    return (
      <TouchableOpacity
        key={s.id}
        ref={tourRef as any}
        style={[styles.card, isActive && styles.cardActive]}
        onPress={() => {
          if (isActive) navigation.navigate('TraceabilityRunning' as any, { sessionId: s.id });
          else navigation.navigate('WorkSessionDetail' as any, { sessionId: s.id });
        }}
      >
        <View style={styles.cardHead}>
          <View style={[styles.statusChip, { backgroundColor: tone + '22', borderColor: tone }]}>
            <Text style={[styles.statusChipText, { color: tone }]}>
              {status === 'ACTIVE' ? t('traceHome.statusActive') : status === 'PAUSED' ? t('traceHome.statusPaused') : t('traceHome.statusClosed')}
            </Text>
          </View>
          {(s as any).autoClosed && (
            <View style={[styles.statusChip, { backgroundColor: Colors.warning + '15', borderColor: Colors.warning }]}>
              <Ionicons name="alarm-outline" size={11} color={Colors.warning} />
              <Text style={[styles.statusChipText, { color: Colors.warning, marginLeft: 2 }]}>{t('traceHome.autoClosed')}</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Text style={styles.dateText}>{fmtDate((s as any).startedAt)}</Text>
        </View>
        <Text style={styles.equipText} numberOfLines={1}>
          {equipNames[(s as any).equipmentId] ?? t('traceHome.equipmentFallback')}
        </Text>
        <Text style={styles.activityText} numberOfLines={1}>
          {activityNames[(s as any).activityId] ?? t('traceHome.activityFallback')}
          {(s as any).sectorId && ` · ${sectorNames[(s as any).sectorId] ?? t('traceHome.sectorFallback')}`}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.durationText}>{t('traceHome.effectiveDuration', { duration: fmtDuration(eff) })}</Text>
          {paused > 0 && (
            <Text style={styles.pausedText}>{t('traceHome.pausedDuration', { duration: fmtDuration(paused) })}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // v29 — Análisis de actividades solo para CREATOR / JEFE.
  const canSeeAnalytics = currentUser?.role === 'CREATOR' || currentUser?.role === 'RESIDENT';

  // v29 — Bloquea iniciar nueva actividad si ya hay una en curso (ACTIVE/PAUSED).
  const handleNewActivity = () => {
    if (active) {
      Alert.alert(
        t('traceHome.activityInProgressTitle'),
        t('traceHome.activityInProgressMsg'),
        [
          { text: t('traceHome.ok'), style: 'cancel' },
          { text: t('traceHome.goToActivity'), onPress: () => navigation.navigate('TraceabilityRunning' as any, { sessionId: active.id }) },
        ],
      );
      return;
    }
    navigation.navigate('TraceabilityCapture' as any, { projectId, projectName });
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title={t('traceHome.title')}
        subtitle={projectName}
        onBack={() => navigation.goBack()}
        rightContent={
          <TouchableOpacity onPress={() => jumpToStep('trace_home_new')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
          </TouchableOpacity>
        }
      />

      <SectionList
        sections={closedSections}
        keyExtractor={(s: any) => s.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text style={styles.dayHeaderText}>{section.title}</Text>
          </View>
        )}
        ListHeaderComponent={
          <View>
            {/* v29 — Botones de acción arriba (outlined navy). Orden: Análisis a la izquierda · Nueva a la derecha. */}
            <View style={styles.actionRow}>
              {canSeeAnalytics ? (
                <TouchableOpacity
                  ref={traceHomeAnalyticsRef as any}
                  style={[styles.actionBtn, { borderColor: Colors.success }]}
                  onPress={() => navigation.navigate('TraceabilityAnalytics' as any, { projectId, projectName })}
                  activeOpacity={0.85}
                >
                  <Ionicons name="bar-chart-outline" size={18} color={Colors.success} />
                  <Text style={[styles.actionBtnText, { color: Colors.success }]}>{t('traceHome.analyticsResults')}</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              <TouchableOpacity
                ref={traceHomeNewRef as any}
                style={[styles.actionBtn, { borderColor: Colors.primary, opacity: active ? 0.5 : 1 }]}
                onPress={handleNewActivity}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                <Text style={[styles.actionBtnText, { color: Colors.primary }]}>{t('traceHome.newActivity')}</Text>
              </TouchableOpacity>
            </View>

            {active && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.sectionTitle}>{t('traceHome.currentSession')}</Text>
                {renderSessionCard(active, true, traceHomeSessionRef)}
              </View>
            )}
            <Text style={styles.sectionTitle}>{t('traceHome.history')}</Text>
          </View>
        }
        renderItem={({ item, index, section }) =>
          renderSessionCard(
            item as any,
            false,
            // Si no hay sesión activa, el ref del tour va a la primera tarjeta
            // del historial (primer item de la primera sección).
            !active && index === 0 && section === closedSections[0] ? traceHomeSessionRef : undefined,
          )
        }
        contentContainerStyle={{ padding: 12, paddingBottom: Math.max(24, insets.bottom + 16) }}
        ListEmptyComponent={
          !active ? (
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>{t('traceHome.emptyTitle')}</Text>
              <Text style={styles.emptyHint}>{t('traceHome.emptyHint')}</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  sectionTitle: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1, marginBottom: 6, marginTop: 4 },
  card: { backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 8 },
  cardActive: { borderColor: Colors.primary, borderWidth: 2, backgroundColor: Colors.primary + '06' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  statusChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  statusChipText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  dateText: { fontSize: 11, color: Colors.textMuted },
  equipText: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  activityText: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  durationText: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  pausedText: { fontSize: 11, color: Colors.warning, fontStyle: 'italic' },
  // v30 — Header de día en historial agrupado (HOY / AYER / fecha).
  dayHeader: {
    marginTop: 8, marginBottom: 4, paddingVertical: 4, paddingHorizontal: 8,
    backgroundColor: Colors.surface, borderRadius: Radius.sm, alignSelf: 'center',
  },
  dayHeaderText: { fontSize: 10, fontWeight: '900', color: Colors.textSecondary, letterSpacing: 1 },
  empty: { alignItems: 'center', padding: 40, gap: 8 },
  emptyText: { color: Colors.textSecondary, fontWeight: '700', textAlign: 'center' },
  emptyHint: { color: Colors.textMuted, fontSize: 12, textAlign: 'center' },
  // v29 — Botones de acción arriba (outlined navy)
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, paddingHorizontal: 10,
    borderRadius: Radius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
  },
  actionBtnText: { fontWeight: '800', fontSize: 12, letterSpacing: 0.3 },
});
