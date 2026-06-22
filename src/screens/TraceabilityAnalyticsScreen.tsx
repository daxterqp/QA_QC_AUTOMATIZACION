/**
 * TraceabilityAnalyticsScreen — vistas analíticas consolidadas (v29 móvil, refactor).
 *
 * Espejo simplificado de `flow-qaqc-web/app/app/projects/[id]/traceability/page.tsx`.
 * Acceso restringido a CREATOR / RESIDENT (gate en TraceabilityHomeScreen).
 *
 * 3 tabs:
 *   1. Sector — agrupado por sector. Card expandible muestra TimelineBar +
 *      leyenda con colores + "Ver cronología". Debajo: equipos + tiempos.
 *   2. Equipo — focus en "dónde trabajó / qué actividades hizo". Solo 2 métricas
 *      (Productivo / Detenciones). Desglose por sector con actividades. Timeline
 *      por sector visitado + "Ver cronología".
 *   3. Resumen — tabla cruzada equipo × actividad.
 *
 * Eliminadas vs versión anterior: Personal y Cronología independiente.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Dimensions, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { Colors, Radius } from '../theme/colors';
import {
  workSessionsCollection, workSessionIntervalsCollection,
  equipmentCollection, activitiesCollection, projectSectorsCollection,
  projectsCollection, workSessionFormItemsCollection,
} from '@db/index';
import {
  groupBy, fmtHm, filterByDateRange,
  effectiveDurationMs, pausedDurationMs,
  mergeShortPauses,
  type SessionWithIntervals, type IntervalLike,
} from '@utils/traceabilityAggregates';
import {
  pullActivities, pullWorkShifts, pullSessionFormTemplates,
  pullEquipmentActivities, pullEquipment, pullProjectSectors,
  pullWorkSessions,
} from '@services/SupabaseSyncService';
import { DateRangePicker } from '@components/DateRangePicker';
import { TimelineBar, colorAt, TIMELINE_EMPTY, type TimelineSegment } from '@components/TimelineBar';
import { ChronologyModal, type ChronologyItem } from '@components/ChronologyModal';
import { PieChart } from '@components/PieChart';
import { generateTraceabilityPdf } from '@services/TraceabilityPdfService';
import { generateConsolidatedChecklistsPdf } from '@services/ChecklistPdfService';
import { useAuth } from '@context/AuthContext';
import { useTour } from '@context/TourContext';
import { useTourStep } from '@hooks/useTourStep';
import { useI18n, tx } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'TraceabilityAnalytics'>;
type Tab = 'sector' | 'equipo' | 'checklists' | 'resumen';

const TABS: { key: Tab; labelKey: string; icon: string }[] = [
  { key: 'sector',     labelKey: 'traceAnalytics.tabSector',     icon: 'shapes-outline' },
  { key: 'equipo',     labelKey: 'traceAnalytics.tabEquipo',     icon: 'construct-outline' },
  { key: 'checklists', labelKey: 'traceAnalytics.tabChecklists', icon: 'checkbox-outline' },
  { key: 'resumen',    labelKey: 'traceAnalytics.tabPdf',        icon: 'document-text-outline' },
];

const ONE_DAY = 86400000;

export default function TraceabilityAnalyticsScreen({ route, navigation }: Props) {
  const { t } = useI18n();
  const { projectId, projectName } = route.params;
  const insets = useSafeAreaInsets();
  const { jumpToStep, isActive: tourActive, isContextual, dismissTour } = useTour();
  const traceAnTabsRef = useTourStep('trace_an_tabs');
  const traceAnFiltersRef = useTourStep('trace_an_filters');

  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);

  const [activeTab, setActiveTab] = useState<Tab>('sector');
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionWithIntervals[]>([]);
  const [equipNames, setEquipNames] = useState<Record<string, string>>({});
  const [actNames, setActNames] = useState<Record<string, string>>({});
  const [sectorNames, setSectorNames] = useState<Record<string, string>>({});
  // v30 — Lista ordenada de TODOS los sectores del proyecto (incluyendo los que
  // aún no tienen sesiones). Orden = sort_order del Excel ASC, luego nombre.
  const [allSectors, setAllSectors] = useState<Array<{ id: string; name: string; sortOrder: number }>>([]);

  const [fromMs, setFromMs] = useState<number | null>(null);
  const [toMs, setToMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        try {
          await Promise.all([
            pullEquipment(projectId),
            pullActivities(projectId),
            pullProjectSectors(projectId),
            pullWorkShifts(projectId),
            pullSessionFormTemplates(projectId),
            pullEquipmentActivities(projectId),
            pullWorkSessions(projectId),
          ]);
        } catch { /* offline OK */ }

        const [rawSessions, allIntervals, eqs, acts, secs, _proj] = await Promise.all([
          workSessionsCollection.query(Q.where('project_id', projectId)).fetch(),
          workSessionIntervalsCollection.query().fetch(),
          equipmentCollection.query(Q.where('project_id', projectId)).fetch(),
          activitiesCollection.query(Q.where('project_id', projectId)).fetch(),
          projectSectorsCollection.query(Q.where('project_id', projectId)).fetch(),
          projectsCollection.find(projectId).catch(() => null),
        ]);
        if (cancelled) return;

        const intervalsBySession: Record<string, IntervalLike[]> = {};
        for (const it of allIntervals as any[]) {
          const sid = it.sessionId;
          if (!intervalsBySession[sid]) intervalsBySession[sid] = [];
          intervalsBySession[sid].push({ kind: it.kind, startedAt: it.startedAt, endedAt: it.endedAt ?? null });
        }
        const items: SessionWithIntervals[] = (rawSessions as any[]).map(s => ({
          session: {
            id: s.id,
            equipmentId: s.equipmentId,
            activityId: s.activityId,
            sectorId: s.sectorId ?? null,
            shiftId: s.shiftId ?? null,
            userId: s.userId,
            startedAt: s.startedAt,
            endedAt: s.endedAt ?? null,
            status: s.status,
          },
          // v29 — Pausas < 5 min se fusionan con el active adyacente (suaviza
          // el análisis: pausas cortas casi siempre son errores del operador).
          // La BD conserva los intervals crudos; esto solo afecta esta vista.
          intervals: mergeShortPauses(intervalsBySession[s.id] ?? []),
        }));

        const eqM: Record<string, string> = {};
        for (const e of eqs as any[]) eqM[e.id] = `${e.code} — ${e.name}`;
        const aM: Record<string, string> = {};
        for (const a of acts as any[]) aM[a.id] = a.name;
        const sM: Record<string, string> = {};
        const sList: Array<{ id: string; name: string; sortOrder: number }> = [];
        for (const s of secs as any[]) {
          sM[s.id] = s.name;
          sList.push({ id: s.id, name: s.name, sortOrder: s.sortOrder ?? 0 });
        }
        // sort_order ASC; los legacy (0/null) van al final, ordenados por nombre.
        sList.sort((a, b) => {
          const ao = a.sortOrder > 0 ? a.sortOrder : Number.MAX_SAFE_INTEGER;
          const bo = b.sortOrder > 0 ? b.sortOrder : Number.MAX_SAFE_INTEGER;
          if (ao !== bo) return ao - bo;
          return a.name.localeCompare(b.name);
        });

        setSessions(items);
        setEquipNames(eqM);
        setActNames(aM);
        setSectorNames(sM);
        setAllSectors(sList);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // Filtro por fecha
  const filteredSessions = useMemo(
    () => filterByDateRange(sessions, fromMs, toMs),
    [sessions, fromMs, toMs],
  );

  // Rango efectivo del timeline. Si no hay filtro, usamos min/max startedAt.
  const [effectiveFrom, effectiveTo] = useMemo<[number, number]>(() => {
    if (fromMs != null && toMs != null) return [fromMs, toMs];
    if (filteredSessions.length === 0) {
      const now = Date.now();
      return [now - ONE_DAY, now];
    }
    let minS = Infinity, maxE = -Infinity;
    for (const x of filteredSessions) {
      minS = Math.min(minS, x.session.startedAt);
      for (const it of x.intervals) {
        const e = it.endedAt ?? Date.now();
        maxE = Math.max(maxE, e);
      }
    }
    const from = fromMs ?? startOfDay(minS);
    const to = toMs ?? endOfDay(maxE);
    return [from, to];
  }, [fromMs, toMs, filteredSessions]);

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader
          title={t('traceAnalytics.title')}
          subtitle={projectName}
          onBack={() => navigation.goBack()}
          rightContent={
            <TouchableOpacity onPress={() => jumpToStep('trace_an_tabs')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
            </TouchableOpacity>
          }
        />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </View>
    );
  }

  // KPIs globales (sobre filteredSessions)
  const totalMs = filteredSessions.reduce((a, x) => a + effectiveDurationMs(x.intervals as any), 0);
  const uniqEquip = new Set(filteredSessions.map(x => x.session.equipmentId)).size;
  const uniqSector = new Set(filteredSessions.map(x => x.session.sectorId).filter(Boolean)).size;

  return (
    <View style={styles.container}>
      <AppHeader
        title={t('traceAnalytics.title')}
        subtitle={projectName}
        onBack={() => navigation.goBack()}
        rightContent={
          <TouchableOpacity onPress={() => jumpToStep('trace_an_tabs')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
          </TouchableOpacity>
        }
      />

      {/* Filtros — calendarios */}
      <View ref={traceAnFiltersRef} style={styles.filtersBar}>
        <DateRangePicker fromMs={fromMs} toMs={toMs} onChange={(f, t) => { setFromMs(f); setToMs(t); }} />
      </View>

      {/* KPIs — carrusel con auto-rebote izq↔der (v30). Paleta pastel navy v31. */}
      <KpiCarousel
        items={[
          { label: t('traceAnalytics.kpiMachineHours'), value: fmtHm(totalMs), bg: '#E6EAF5', border: '#1E3A8A', text: '#1E3A8A' },
          { label: t('traceAnalytics.kpiSessions'), value: String(filteredSessions.length), bg: '#EAF0FA', border: '#2B4FA0', text: '#2B4FA0' },
          { label: t('traceAnalytics.kpiActiveEquipment'), value: String(uniqEquip), bg: '#EEF1F8', border: '#3B5BB1', text: '#3B5BB1' },
          { label: t('traceAnalytics.kpiSectorsWorked'), value: String(uniqSector), bg: '#F1F4FA', border: '#4F6BBE', text: '#4F6BBE' },
        ]}
      />

      {/* Tabs */}
      <View ref={traceAnTabsRef} style={styles.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
            onPress={() => setActiveTab(t.key)}
            activeOpacity={0.7}
          >
            <Ionicons name={t.icon as any} size={14} color={activeTab === t.key ? Colors.primary : Colors.textMuted} />
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>{tx(t.labelKey)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Contenido del tab */}
      <View style={{ flex: 1, paddingBottom: Math.max(8, insets.bottom) }}>
        {activeTab === 'sector' && (
          <BySectorView
            items={filteredSessions}
            sectorNames={sectorNames}
            equipNames={equipNames}
            actNames={actNames}
            allSectors={allSectors}
            fromMs={effectiveFrom}
            toMs={effectiveTo}
          />
        )}
        {activeTab === 'equipo' && (
          <ByEquipmentView
            items={filteredSessions}
            equipNames={equipNames}
            sectorNames={sectorNames}
            actNames={actNames}
            fromMs={effectiveFrom}
            toMs={effectiveTo}
          />
        )}
        {activeTab === 'checklists' && (
          <ChecklistsTab
            items={filteredSessions}
            equipNames={equipNames}
            sectorNames={sectorNames}
            actNames={actNames}
            fromMs={effectiveFrom}
            toMs={effectiveTo}
            projectName={projectName}
            onOpen={(sid) => navigation.navigate('ChecklistView' as any, { sessionId: sid })}
            onExportConsolidated={async (sessionIds, exporterName) => {
              try {
                const uri = await generateConsolidatedChecklistsPdf({
                  sessionIds,
                  projectName,
                  exporterName,
                  fromMs: effectiveFrom,
                  toMs: effectiveTo,
                  previewOnly: true,
                });
                navigation.navigate('DossierPreview' as any, { pdfUri: uri, projectName });
              } catch (e) {
                Alert.alert(t('traceAnalytics.cannotGeneratePdf'), (e as Error).message);
              }
            }}
          />
        )}
        {activeTab === 'resumen' && (
          <PdfTab
            items={filteredSessions}
            equipNames={equipNames}
            sectorNames={sectorNames}
            allSectors={allSectors}
            fromMs={effectiveFrom}
            toMs={effectiveTo}
            projectName={projectName}
          />
        )}
      </View>
    </View>
  );
}

// ─────────────────────────── Vista: SECTOR ─────────────────────────────────

function BySectorView({
  items, sectorNames, equipNames, actNames, allSectors, fromMs, toMs,
}: {
  items: SessionWithIntervals[];
  sectorNames: Record<string, string>;
  equipNames: Record<string, string>;
  actNames: Record<string, string>;
  allSectors: Array<{ id: string; name: string; sortOrder: number }>;
  fromMs: number; toMs: number;
}) {
  const { t } = useI18n();
  // v30 — Construimos la lista en orden del Excel (allSectors) e inyectamos
  // los datos del groupBy donde existan. Sectores sin sesiones aparecen con
  // duración 0 y se renderizan vacíos (cronología sin eventos).
  const groups = useMemo(() => groupBy(items, s => s.sectorId ?? '_none'), [items]);
  const groupByKey = useMemo(() => {
    const m = new Map<string, { durationMs: number; count: number }>();
    for (const g of groups) m.set(String(g.key), { durationMs: g.durationMs, count: g.count });
    return m;
  }, [groups]);

  // Mostramos: todos los sectores del Excel + (si hay sesiones sin sector) el
  // chip "(Sin sector asignado)" al final.
  const display = useMemo(() => {
    const out: Array<{ key: string; isNone: boolean }> = allSectors.map(s => ({ key: s.id, isNone: false }));
    if (groupByKey.has('_none')) out.push({ key: '_none', isNone: true });
    return out;
  }, [allSectors, groupByKey]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [chronOpen, setChronOpen] = useState<null | { title: string; segments: ChronologyItem[]; legend: { colorIdx: number; label: string }[] }>(null);

  if (display.length === 0) return <EmptyView label={t('traceAnalytics.emptyNoSectors')} />;

  return (
    <>
      <FlatList
        data={display}
        keyExtractor={g => g.key}
        contentContainerStyle={styles.listPad}
        renderItem={({ item: row }) => {
          const sid = row.key;
          const isNoSector = row.isNone;
          const groupData = groupByKey.get(sid) ?? { durationMs: 0, count: 0 };
          const item = { key: sid, durationMs: groupData.durationMs, count: groupData.count };
          const sectorTitle = isNoSector ? t('traceAnalytics.noSectorAssigned') : (sectorNames[sid] ?? t('traceAnalytics.sectorFallback'));
          const isOpen = expanded.has(sid);

          // Sesiones de este sector
          const sectorSessions = isNoSector
            ? items.filter(x => !x.session.sectorId)
            : items.filter(x => x.session.sectorId === sid);

          // Asignar color por equipo (orden de primera aparición en este sector)
          const equipOrder: string[] = [];
          for (const x of sectorSessions) {
            if (!equipOrder.includes(x.session.equipmentId)) equipOrder.push(x.session.equipmentId);
          }
          const colorIdxOf = (eqId: string) => equipOrder.indexOf(eqId);

          // Tiempo acumulado por equipo (con orden = duración desc)
          const byEquip = new Map<string, { eqId: string; durationMs: number; activities: Map<string, number> }>();
          for (const x of sectorSessions) {
            const dur = effectiveDurationMs(x.intervals as any);
            const e = byEquip.get(x.session.equipmentId) ?? { eqId: x.session.equipmentId, durationMs: 0, activities: new Map() };
            e.durationMs += dur;
            e.activities.set(x.session.activityId, (e.activities.get(x.session.activityId) ?? 0) + dur);
            byEquip.set(x.session.equipmentId, e);
          }
          const equipRows = Array.from(byEquip.values()).sort((a, b) => b.durationMs - a.durationMs);

          // Segmentos para TimelineBar (intervals activos de cada sesión del sector)
          const segments: TimelineSegment[] = [];
          for (const x of sectorSessions) {
            const ci = colorIdxOf(x.session.equipmentId);
            for (const it of x.intervals) {
              if (it.kind !== 'active') continue;
              segments.push({
                startMs: it.startedAt,
                endMs: it.endedAt ?? Date.now(),
                colorIdx: ci,
                label: equipNames[x.session.equipmentId] ?? t('traceAnalytics.equipmentFallback'),
              });
            }
          }

          // Para ChronologyModal: items con primary/secondary
          const chronItems: ChronologyItem[] = sectorSessions.flatMap(x =>
            x.intervals.filter(i => i.kind === 'active').map(i => ({
              startMs: i.startedAt,
              endMs: i.endedAt ?? Date.now(),
              colorIdx: colorIdxOf(x.session.equipmentId),
              primary: `${equipNames[x.session.equipmentId] ?? t('traceAnalytics.equipmentFallback')} — ${actNames[x.session.activityId] ?? t('traceAnalytics.activityFallback')}`,
              secondary: sectorTitle,
            })),
          );

          const legend = equipOrder.map(eqId => ({
            colorIdx: colorIdxOf(eqId),
            label: equipNames[eqId] ?? t('traceAnalytics.equipmentFallback'),
          }));

          return (
            <View style={styles.groupCard}>
              <TouchableOpacity
                style={styles.groupHead}
                onPress={() => {
                  const next = new Set(expanded);
                  if (isOpen) next.delete(sid); else next.add(sid);
                  setExpanded(next);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.iconBubble, { backgroundColor: Colors.navy + '15', borderColor: Colors.navy + '40' }]}>
                  <Ionicons name="shapes" size={18} color={Colors.navy} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupTitle} numberOfLines={1}>{sectorTitle}</Text>
                  <Text style={styles.groupSubtitle}>
                    {item.count === 0
                      ? t('traceAnalytics.notWorked')
                      : t('traceAnalytics.sessionsSummary', {
                          duration: fmtHm(item.durationMs),
                          count: item.count,
                          sessionWord: item.count === 1 ? t('traceAnalytics.sessionSingular') : t('traceAnalytics.sessionPlural'),
                        })}
                  </Text>
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
              </TouchableOpacity>

              {isOpen && (
                <>
                  {/* Línea de tiempo */}
                  <View style={styles.timelineWrap}>
                    <TimelineBar fromMs={fromMs} toMs={toMs} segments={segments} />
                  </View>

                  {/* Pie chart: % de uso por equipo + "No trabajado" */}
                  {(() => {
                    const window = Math.max(0, toMs - fromMs);
                    const usedMs = equipRows.reduce((a, r) => a + r.durationMs, 0);
                    const pieSlices = [
                      ...equipRows.map(e => ({
                        label: equipNames[e.eqId] ?? t('traceAnalytics.equipmentFallback'),
                        value: e.durationMs,
                        color: colorAt(colorIdxOf(e.eqId)),
                      })),
                      ...(window > usedMs ? [{ label: t('traceAnalytics.notWorked'), value: window - usedMs, color: TIMELINE_EMPTY }] : []),
                    ];
                    return (
                      <View style={styles.pieWrap}>
                        <PieChart slices={pieSlices} size={140} />
                      </View>
                    );
                  })()}

                  {/* Botón Ver cronología */}
                  <TouchableOpacity
                    style={styles.chronBtn}
                    activeOpacity={0.7}
                    onPress={() => setChronOpen({
                      title: sectorTitle,
                      segments: chronItems,
                      legend,
                    })}
                  >
                    <Ionicons name="time-outline" size={14} color={Colors.primary} />
                    <Text style={styles.chronBtnText}>{t('traceAnalytics.viewChronology')}</Text>
                  </TouchableOpacity>

                  {/* Leyenda + equipos */}
                  <View style={styles.subList}>
                    <Text style={styles.subListLabel}>{t('traceAnalytics.equipmentInSector')}</Text>
                    {equipRows.map(e => (
                      <View key={e.eqId} style={styles.subRow}>
                        <View style={[styles.legendDot, { backgroundColor: colorAt(colorIdxOf(e.eqId)) }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.subRowMain} numberOfLines={1}>{equipNames[e.eqId] ?? t('traceAnalytics.equipmentFallback')}</Text>
                          <Text style={styles.subRowSub} numberOfLines={1}>
                            {Array.from(e.activities.entries())
                              .sort((a, b) => b[1] - a[1])
                              .map(([aid, ms]) => `${actNames[aid] ?? t('traceAnalytics.activityShort')} ${fmtHm(ms)}`)
                              .join(' · ')}
                          </Text>
                        </View>
                        <Text style={styles.subRowMeta}>{fmtHm(e.durationMs)}</Text>
                      </View>
                    ))}
                    <View style={styles.subRow}>
                      <View style={[styles.legendDot, { backgroundColor: TIMELINE_EMPTY }]} />
                      <Text style={[styles.subRowMain, { color: Colors.textMuted, fontStyle: 'italic' }]}>{t('traceAnalytics.notWorked')}</Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          );
        }}
      />

      <ChronologyModal
        visible={!!chronOpen}
        onClose={() => setChronOpen(null)}
        title={chronOpen?.title ?? ''}
        fromMs={fromMs}
        toMs={toMs}
        items={chronOpen?.segments ?? []}
        legend={chronOpen?.legend}
      />
    </>
  );
}

// ─────────────────────────── Vista: EQUIPO ─────────────────────────────────

function ByEquipmentView({
  items, equipNames, sectorNames, actNames, fromMs, toMs,
}: {
  items: SessionWithIntervals[];
  equipNames: Record<string, string>;
  sectorNames: Record<string, string>;
  actNames: Record<string, string>;
  fromMs: number; toMs: number;
}) {
  const { t } = useI18n();
  const groups = useMemo(() => groupBy(items, s => s.equipmentId), [items]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [chronOpen, setChronOpen] = useState<null | { title: string; segments: ChronologyItem[]; legend: { colorIdx: number; label: string }[] }>(null);

  if (groups.length === 0) return <EmptyView label={t('traceAnalytics.emptyNoSessionsRange')} />;

  return (
    <>
      <FlatList
        data={groups}
        keyExtractor={g => String(g.key)}
        contentContainerStyle={styles.listPad}
        renderItem={({ item }) => {
          const eqId = String(item.key);
          const subset = items.filter(x => x.session.equipmentId === eqId);
          const isOpen = expanded.has(eqId);

          // Productivo = suma de intervals 'active'. Detenciones = 'paused'.
          let productiveMs = 0, downMs = 0;
          for (const x of subset) {
            productiveMs += effectiveDurationMs(x.intervals as any);
            downMs += pausedDurationMs(x.intervals as any);
          }

          // Sectores únicos (con orden por aparición → color)
          const sectorOrder: string[] = [];
          for (const x of subset) {
            const sid = x.session.sectorId ?? '_none';
            if (!sectorOrder.includes(sid)) sectorOrder.push(sid);
          }
          const colorIdxOf = (sid: string) => sectorOrder.indexOf(sid);

          // Desglose por sector → actividades
          const bySector = new Map<string, { sid: string; durationMs: number; sessions: number; acts: Map<string, number> }>();
          for (const x of subset) {
            const sid = x.session.sectorId ?? '_none';
            const dur = effectiveDurationMs(x.intervals as any);
            const r = bySector.get(sid) ?? { sid, durationMs: 0, sessions: 0, acts: new Map() };
            r.durationMs += dur;
            r.sessions += 1;
            r.acts.set(x.session.activityId, (r.acts.get(x.session.activityId) ?? 0) + dur);
            bySector.set(sid, r);
          }
          const sectorRows = Array.from(bySector.values()).sort((a, b) => b.durationMs - a.durationMs);

          // Segmentos timeline — coloreados por sector
          const segments: TimelineSegment[] = [];
          for (const x of subset) {
            const sid = x.session.sectorId ?? '_none';
            const ci = colorIdxOf(sid);
            for (const it of x.intervals) {
              if (it.kind !== 'active') continue;
              segments.push({
                startMs: it.startedAt,
                endMs: it.endedAt ?? Date.now(),
                colorIdx: ci,
              });
            }
          }
          const chronItems: ChronologyItem[] = subset.flatMap(x => {
            const sid = x.session.sectorId ?? '_none';
            return x.intervals.filter(i => i.kind === 'active').map(i => ({
              startMs: i.startedAt,
              endMs: i.endedAt ?? Date.now(),
              colorIdx: colorIdxOf(sid),
              primary: `${actNames[x.session.activityId] ?? t('traceAnalytics.activityFallback')}`,
              secondary: sid === '_none' ? t('traceAnalytics.noSector') : (sectorNames[sid] ?? t('traceAnalytics.sectorFallback')),
            }));
          });
          const legend = sectorOrder.map(sid => ({
            colorIdx: colorIdxOf(sid),
            label: sid === '_none' ? t('traceAnalytics.noSector') : (sectorNames[sid] ?? t('traceAnalytics.sectorFallback')),
          }));

          return (
            <View style={styles.groupCard}>
              <TouchableOpacity
                style={styles.groupHead}
                onPress={() => {
                  const next = new Set(expanded);
                  if (isOpen) next.delete(eqId); else next.add(eqId);
                  setExpanded(next);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.iconBubble, { backgroundColor: Colors.warning + '15', borderColor: Colors.warning + '40' }]}>
                  <Ionicons name="construct" size={18} color={Colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupTitle} numberOfLines={1}>{equipNames[eqId] ?? t('traceAnalytics.equipmentFallback')}</Text>
                  <Text style={styles.groupSubtitle}>
                    {t('traceAnalytics.sessionsSummary', {
                      duration: fmtHm(item.durationMs),
                      count: item.count,
                      sessionWord: item.count === 1 ? t('traceAnalytics.sessionSingular') : t('traceAnalytics.sessionPlural'),
                    })}
                  </Text>
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* 2 métricas: Productivo + Detenciones */}
              <View style={styles.metricsGrid}>
                <MetricCell label={t('traceAnalytics.hoursWorked')} value={fmtHm(productiveMs)} color={Colors.success} />
                <MetricCell label={t('traceAnalytics.downtime')} value={fmtHm(downMs)} color={Colors.warning} />
              </View>

              {isOpen && (
                <>
                  {/* Línea de tiempo */}
                  <View style={styles.timelineWrap}>
                    <TimelineBar fromMs={fromMs} toMs={toMs} segments={segments} />
                  </View>

                  {/* Pie chart: % de uso por sector + "No trabajado" */}
                  {(() => {
                    const window = Math.max(0, toMs - fromMs);
                    const usedMs = sectorRows.reduce((a, r) => a + r.durationMs, 0);
                    const pieSlices = [
                      ...sectorRows.map(r => ({
                        label: r.sid === '_none' ? t('traceAnalytics.noSector') : (sectorNames[r.sid] ?? t('traceAnalytics.sectorFallback')),
                        value: r.durationMs,
                        color: colorAt(colorIdxOf(r.sid)),
                      })),
                      ...(window > usedMs ? [{ label: t('traceAnalytics.notWorked'), value: window - usedMs, color: TIMELINE_EMPTY }] : []),
                    ];
                    return (
                      <View style={styles.pieWrap}>
                        <PieChart slices={pieSlices} size={140} />
                      </View>
                    );
                  })()}

                  {/* Botón Ver cronología */}
                  <TouchableOpacity
                    style={styles.chronBtn}
                    activeOpacity={0.7}
                    onPress={() => setChronOpen({
                      title: equipNames[eqId] ?? t('traceAnalytics.equipmentFallback'),
                      segments: chronItems,
                      legend,
                    })}
                  >
                    <Ionicons name="time-outline" size={14} color={Colors.primary} />
                    <Text style={styles.chronBtnText}>{t('traceAnalytics.viewChronology')}</Text>
                  </TouchableOpacity>

                  {/* Desglose por sector → actividades */}
                  <View style={styles.subList}>
                    <Text style={styles.subListLabel}>{t('traceAnalytics.whereAndWhat')}</Text>
                    {sectorRows.map(s => (
                      <View key={s.sid} style={styles.sectorBlock}>
                        <View style={styles.sectorBlockHead}>
                          <View style={[styles.legendDot, { backgroundColor: colorAt(colorIdxOf(s.sid)) }]} />
                          <Text style={styles.sectorBlockTitle} numberOfLines={1}>
                            {s.sid === '_none' ? t('traceAnalytics.noSector') : (sectorNames[s.sid] ?? t('traceAnalytics.sectorFallback'))}
                          </Text>
                          <Text style={styles.sectorBlockMeta}>{fmtHm(s.durationMs)}</Text>
                        </View>
                        {Array.from(s.acts.entries())
                          .sort((a, b) => b[1] - a[1])
                          .map(([aid, ms]) => (
                            <View key={aid} style={styles.actRow}>
                              <Text style={styles.actName} numberOfLines={1}>· {actNames[aid] ?? t('traceAnalytics.activityFallback')}</Text>
                              <Text style={styles.actDur}>{fmtHm(ms)}</Text>
                            </View>
                          ))}
                      </View>
                    ))}
                    <View style={styles.subRow}>
                      <View style={[styles.legendDot, { backgroundColor: TIMELINE_EMPTY }]} />
                      <Text style={[styles.subRowMain, { color: Colors.textMuted, fontStyle: 'italic' }]}>{t('traceAnalytics.notWorked')}</Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          );
        }}
      />

      <ChronologyModal
        visible={!!chronOpen}
        onClose={() => setChronOpen(null)}
        title={chronOpen?.title ?? ''}
        fromMs={fromMs}
        toMs={toMs}
        items={chronOpen?.segments ?? []}
        legend={chronOpen?.legend}
      />
    </>
  );
}

// ─────────────────────────── Vista: CHECKLISTS (v30) ──────────────────────

function ChecklistsTab({
  items, equipNames, sectorNames, actNames, fromMs: _f, toMs: _t, projectName: _p,
  onOpen, onExportConsolidated,
}: {
  items: SessionWithIntervals[];
  equipNames: Record<string, string>;
  sectorNames: Record<string, string>;
  actNames: Record<string, string>;
  fromMs: number; toMs: number; projectName: string;
  onOpen: (sessionId: string) => void;
  onExportConsolidated: (sessionIds: string[], exporterName: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState<Record<string, { total: number; answered: number; ok: number; ko: number; na: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sIds = items.map(x => x.session.id);
        if (sIds.length === 0) { if (!cancelled) { setStats({}); setLoading(false); } return; }
        const formItems = await workSessionFormItemsCollection
          .query(Q.where('session_id', Q.oneOf(sIds))).fetch();
        const m: Record<string, { total: number; answered: number; ok: number; ko: number; na: number }> = {};
        for (const fi of formItems as any[]) {
          const sid = fi.sessionId;
          const cur = m[sid] ?? { total: 0, answered: 0, ok: 0, ko: 0, na: 0 };
          cur.total++;
          if (fi.hasAnswer || fi.isNa) cur.answered++;
          if (fi.isNa) cur.na++;
          else if (fi.isCompliant === true) cur.ok++;
          else if (fi.isCompliant === false) cur.ko++;
          m[sid] = cur;
        }
        if (!cancelled) setStats(m);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [items]);

  const rows = useMemo(() => {
    return items
      .filter(x => stats[x.session.id]?.total > 0)
      .sort((a, b) => b.session.startedAt - a.session.startedAt);
  }, [items, stats]);

  if (loading) {
    return <View style={styles.loadingWrap}><ActivityIndicator color={Colors.primary} /></View>;
  }
  if (rows.length === 0) {
    return <EmptyView label={t('traceAnalytics.emptyNoChecklistSessions')} />;
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={r => r.session.id}
      contentContainerStyle={styles.listPad}
      ListHeaderComponent={
        <TouchableOpacity
          style={[styles.dossierBtn, exporting && { opacity: 0.5 }]}
          disabled={exporting}
          onPress={async () => {
            setExporting(true);
            try {
              await onExportConsolidated(
                rows.map(r => r.session.id),
                `${currentUser?.name ?? ''}${currentUser?.apellido ? ' ' + currentUser.apellido : ''}`.trim() || t('traceAnalytics.noName'),
              );
            } finally { setExporting(false); }
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="albums-outline" size={16} color="#fff" />
          <Text style={styles.dossierBtnText}>
            {exporting ? t('traceAnalytics.generating') : t('traceAnalytics.exportConsolidatedDossier', { count: rows.length })}
          </Text>
        </TouchableOpacity>
      }
      renderItem={({ item }) => {
        const s = item.session;
        const st = stats[s.id]!;
        const fmt = (ts: number) => {
          const d = new Date(ts);
          const pad = (n: number) => String(n).padStart(2, '0');
          return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };
        const statusTone = s.status === 'ACTIVE' ? Colors.success : s.status === 'PAUSED' ? Colors.warning : Colors.textMuted;
        const allOk = st.answered === st.total && st.ko === 0;
        const incomplete = st.answered < st.total;
        const completionTone = incomplete ? Colors.warning : allOk ? Colors.success : Colors.danger;
        const completionLabel = incomplete
          ? t('traceAnalytics.completionIncomplete', { answered: st.answered, total: st.total })
          : allOk
            ? t('traceAnalytics.completionCompliant', { total: st.total })
            : t('traceAnalytics.completionWithNo', { ok: st.ok, ko: st.ko, na: st.na });
        return (
          <TouchableOpacity
            style={styles.checklistRow}
            onPress={() => onOpen(s.id)}
            activeOpacity={0.7}
          >
            <View style={styles.checklistRowHead}>
              <View style={[styles.checklistStatusChip, { backgroundColor: statusTone + '22', borderColor: statusTone }]}>
                <Text style={[styles.checklistStatusText, { color: statusTone }]}>
                  {s.status === 'ACTIVE' ? t('traceAnalytics.statusActive') : s.status === 'PAUSED' ? t('traceAnalytics.statusPaused') : t('traceAnalytics.statusClosed')}
                </Text>
              </View>
              <Text style={styles.checklistDate}>{fmt(s.startedAt)}</Text>
            </View>
            <Text style={styles.checklistTitle} numberOfLines={1}>
              {equipNames[s.equipmentId] ?? t('traceAnalytics.equipmentFallback')}
            </Text>
            <Text style={styles.checklistSub} numberOfLines={1}>
              {actNames[s.activityId] ?? t('traceAnalytics.activityFallback')}
              {s.sectorId ? ` · ${sectorNames[s.sectorId] ?? t('traceAnalytics.sectorFallback')}` : ''}
            </Text>
            <View style={[styles.checklistCompletionChip, { backgroundColor: completionTone + '15', borderColor: completionTone + '50' }]}>
              <Ionicons name="checkbox-outline" size={11} color={completionTone} />
              <Text style={[styles.checklistCompletionText, { color: completionTone }]}>{completionLabel}</Text>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

// ─────────────────────────── Vista: PDF (v30) ──────────────────────────────

function PdfTab({
  items, equipNames, sectorNames, allSectors, fromMs, toMs, projectName,
}: {
  items: SessionWithIntervals[];
  equipNames: Record<string, string>;
  sectorNames: Record<string, string>;
  allSectors: Array<{ id: string; name: string; sortOrder: number }>;
  fromMs: number; toMs: number;
  projectName: string;
}) {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const [generating, setGenerating] = useState(false);
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmtRange = (ms: number) => {
    const d = new Date(ms);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };
  const navigation = (require('@react-navigation/native').useNavigation)();
  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      // v31 — Generar PDF y abrir DossierPreviewScreen (preview interno
      // antes de compartir). El usuario decide compartir desde el preview.
      const uri = await generateTraceabilityPdf({
        projectName,
        exporterName: `${currentUser?.name ?? ''}${currentUser?.apellido ? ' ' + currentUser.apellido : ''}`.trim() || t('traceAnalytics.noName'),
        fromMs, toMs,
        sessions: items,
        equipNames, sectorNames, allSectors,
        previewOnly: true,
      });
      navigation.navigate('DossierPreview' as any, { pdfUri: uri, projectName });
    } catch (e) {
      Alert.alert(t('traceAnalytics.cannotGeneratePdf'), (e as Error).message);
    } finally {
      setGenerating(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.listPad}>
      <View style={styles.pdfMetaCard}>
        <Text style={styles.pdfMetaTitle}>{t('traceAnalytics.pdfSummary')}</Text>
        <Text style={styles.pdfMetaRow}>{t('traceAnalytics.pdfProject')} <Text style={styles.pdfMetaStrong}>{projectName}</Text></Text>
        <Text style={styles.pdfMetaRow}>{t('traceAnalytics.pdfRange')} <Text style={styles.pdfMetaStrong}>{fmtRange(fromMs)} – {fmtRange(toMs)}</Text></Text>
        <Text style={styles.pdfMetaRow}>{t('traceAnalytics.pdfExporter')} <Text style={styles.pdfMetaStrong}>
          {`${currentUser?.name ?? ''}${currentUser?.apellido ? ' ' + currentUser.apellido : ''}`.trim() || t('traceAnalytics.noName')}
        </Text></Text>
        <Text style={styles.pdfMetaRow}>{t('traceAnalytics.pdfSessions')} <Text style={styles.pdfMetaStrong}>{items.length}</Text></Text>
      </View>
      <Text style={styles.pdfInfo}>
        {t('traceAnalytics.pdfInfo')}
      </Text>
      <TouchableOpacity
        style={[styles.pdfBtn, generating && { opacity: 0.6 }]}
        onPress={handleGenerate}
        disabled={generating}
        activeOpacity={0.85}
      >
        <Ionicons name="document-text-outline" size={18} color={Colors.white} />
        <Text style={styles.pdfBtnText}>{generating ? t('traceAnalytics.generating') : t('traceAnalytics.generatePdf')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─────────────────────────── Subcomponentes ────────────────────────────────

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

/** v30 — Carrusel deslizable de KPIs con auto-rebote izq↔der. Pausa al tocar
 *  y se reanuda 5s después del último gesto. v31: cards más compactas + paleta
 *  pastel basada en matices del navy. */
function KpiCarousel({ items }: { items: Array<{ label: string; value: string; bg?: string; border?: string; text?: string }> }) {
  const screenW = Dimensions.get('window').width;
  const cardW = Math.round(screenW * 0.40);
  const gap = 8;
  const listRef = useRef<FlatList<any>>(null);
  const dirRef = useRef<1 | -1>(1);
  const userPausedRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const offsetRef = useRef(0);

  // Auto-scroll loop
  useEffect(() => {
    const totalContent = items.length * (cardW + gap);
    const maxOffset = Math.max(0, totalContent - screenW + 16);
    if (maxOffset <= 0) return;

    const STEP_PX = 1.2; // velocidad de auto-desplazamiento
    tickRef.current = setInterval(() => {
      if (userPausedRef.current || !listRef.current) return;
      let next = offsetRef.current + STEP_PX * dirRef.current;
      if (next >= maxOffset) { next = maxOffset; dirRef.current = -1; }
      else if (next <= 0)    { next = 0;         dirRef.current = 1; }
      offsetRef.current = next;
      listRef.current.scrollToOffset({ offset: next, animated: false });
    }, 30);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [items.length, cardW, screenW]);

  const handleBeginDrag = () => {
    userPausedRef.current = true;
    if (resumeTimerRef.current) { clearTimeout(resumeTimerRef.current); resumeTimerRef.current = null; }
  };
  const handleEndDrag = (e: any) => {
    offsetRef.current = e.nativeEvent.contentOffset.x;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => { userPausedRef.current = false; }, 5000);
  };

  return (
    <View style={styles.kpiCarouselWrap}>
      <FlatList
        ref={listRef}
        data={items}
        horizontal
        keyExtractor={(_, i) => String(i)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 8 }}
        ItemSeparatorComponent={() => <View style={{ width: gap }} />}
        onScrollBeginDrag={handleBeginDrag}
        onScrollEndDrag={handleEndDrag}
        onMomentumScrollEnd={handleEndDrag}
        renderItem={({ item }) => (
          <View style={[
            styles.kpiBigCard,
            { width: cardW, backgroundColor: item.bg ?? Colors.surface, borderColor: item.border ?? Colors.border },
          ]}>
            <Text style={[styles.kpiBigValue, { color: item.text ?? Colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>{item.value}</Text>
            <Text style={[styles.kpiBigLabel, { color: item.text ?? Colors.textMuted }]} numberOfLines={2}>{item.label}</Text>
          </View>
        )}
      />
    </View>
  );
}

function MetricCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.metricCell}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function EmptyView({ label }: { label: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="bar-chart-outline" size={40} color={Colors.textMuted} />
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

// ─────────────────────────── Helpers ───────────────────────────────────────

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}
function endOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

// ─────────────────────────── Estilos ───────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  filtersBar: {
    padding: 8, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },

  kpiRow: { flexDirection: 'row', gap: 6, padding: 8, backgroundColor: Colors.white },
  kpiCard: {
    flex: 1, padding: 8, borderRadius: Radius.sm, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: 2,
  },
  kpiValue: { fontSize: 14, fontWeight: '900', color: Colors.textPrimary, letterSpacing: -0.3 },
  kpiLabel: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },

  // v30 — Carrusel de KPIs. v31: cards compactas con paleta navy pastel.
  kpiCarouselWrap: { paddingVertical: 8, backgroundColor: Colors.white },
  kpiBigCard: {
    padding: 10, borderRadius: Radius.md,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    minHeight: 72,
  },
  kpiBigValue: { fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  kpiBigLabel: { fontSize: 9, fontWeight: '700', textAlign: 'center', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },

  tabBar: {
    flexDirection: 'row', backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  tab: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, gap: 3,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 11, fontWeight: '600', color: Colors.textMuted, letterSpacing: 0.3 },
  tabTextActive: { color: Colors.primary, fontWeight: '800' },

  listPad: { padding: 10, gap: 8, paddingBottom: 60 },

  groupCard: {
    backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.border, padding: 12, marginBottom: 8,
  },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBubble: {
    width: 38, height: 38, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  groupTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  groupSubtitle: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  metricsGrid: { flexDirection: 'row', gap: 6, marginTop: 10 },
  metricCell: {
    flex: 1, padding: 8, borderRadius: Radius.sm,
    backgroundColor: Colors.surface, alignItems: 'center', gap: 2,
  },
  metricValue: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  metricLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: '700', textTransform: 'uppercase' },

  timelineWrap: {
    marginTop: 12, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  pieWrap: { alignItems: 'center', marginTop: 10 },
  chronBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 8,
    paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: Colors.primary + '10',
    borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.primary + '30',
  },
  chronBtnText: { fontSize: 12, fontWeight: '800', color: Colors.primary, letterSpacing: 0.3 },

  subList: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.divider },
  subListLabel: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', marginBottom: 4 },
  subRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 8 },
  subRowMain: { flex: 1, fontSize: 12, color: Colors.textPrimary, fontWeight: '600' },
  subRowSub: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  subRowMeta: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700' },

  legendDot: { width: 12, height: 12, borderRadius: 6 },

  // Desglose por sector (vista Equipo)
  sectorBlock: {
    marginTop: 6, paddingTop: 6,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  sectorBlockHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4,
  },
  sectorBlockTitle: { flex: 1, fontSize: 12, fontWeight: '800', color: Colors.textPrimary },
  sectorBlockMeta: { fontSize: 11, color: Colors.primary, fontWeight: '700' },
  actRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 2, paddingLeft: 20,
  },
  actName: { flex: 1, fontSize: 11, color: Colors.textSecondary },
  actDur: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700' },

  empty: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8, flex: 1 },
  emptyText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },

  // v30 — Tab Checklists
  checklistRow: {
    backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.border, padding: 10, marginBottom: 8,
  },
  checklistRowHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  checklistStatusChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  checklistStatusText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  checklistDate: { flex: 1, fontSize: 11, color: Colors.textMuted, textAlign: 'right' },
  checklistTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  checklistSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  checklistCompletionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', marginTop: 6,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1,
  },
  checklistCompletionText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  dossierBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.navy, paddingVertical: 12, borderRadius: Radius.md,
    marginBottom: 10,
  },
  dossierBtnText: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 0.3 },

  // v30 — Tab PDF
  pdfMetaCard: {
    backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.border, padding: 12, marginBottom: 12, gap: 4,
  },
  pdfMetaTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  pdfMetaRow: { fontSize: 12, color: Colors.textSecondary },
  pdfMetaStrong: { color: Colors.textPrimary, fontWeight: '700' },
  pdfInfo: { fontSize: 11, color: Colors.textMuted, marginBottom: 14, lineHeight: 16 },
  pdfBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: Radius.md,
  },
  pdfBtnText: { color: Colors.white, fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
});
