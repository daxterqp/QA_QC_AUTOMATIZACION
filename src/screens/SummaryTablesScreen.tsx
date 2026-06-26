/**
 * SummaryTablesScreen (móvil) — "Dashboard" (ex Tablas Resumen).
 * Selector de tipo de ensayo → header condensado (1 línea) con back + acciones
 * (tutorial · CSV · filtros · ⚙ gráficos). Filtros en modal. Carrusel de gráficos
 * configurable (agregar / eliminar / reordenar arrastrando) por tipo de ensayo, y
 * tabla consolidada debajo. La tabla congela SOLO el encabezado (fila de nombres);
 * el freeze de la 1ª columna se eliminó por errores visuales.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Modal, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Q } from '@nozbe/watermelondb';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import AppHeader from '@components/AppHeader';
import CalendarPicker from '@components/CalendarPicker';
import { Colors, Radius } from '../theme/colors';
import { summaryRowsCollection, protocolTemplatesCollection, protocolTemplateItemsCollection } from '@db/index';
import { pullSummaryRows, backfillLocalSummary } from '@services/SummaryRowService';
import { useRealtimeProjectPull } from '@hooks/useRealtimeProjectPull';
import {
  FIXED_SUMMARY_COLUMNS, dynamicColumnsFromRows, parseSummaryConfig, summaryStatus,
  type SummaryColumn,
} from '@utils/summaryTable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildAutoColumns, chartYOptions } from '@utils/summaryColumns';
import { formatComputed } from '@utils/numericProtocol';
import Svg, { Line as SvgLine, Circle as SvgCircle, Polyline as SvgPolyline, Text as SvgText } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { useI18n, tx } from '@i18n/index';
import { useTourStep } from '@hooks/useTourStep';
import { useTour } from '@context/TourContext';

type Props = NativeStackScreenProps<RootStackParamList, 'SummaryTables'>;

interface Row {
  id: string; protocolId: string; templateId: string | null;
  protocolCode: string | null; protocolNumber: string | null; ensayoDate: string | null;
  sectorId: string | null; sectorName: string | null;
  locationId: string | null; locationName: string | null;
  status: string | null; values: Record<string, unknown>;
}

type Trend = 'linear' | 'quad' | 'cubic';
type ChartCfg = { id: string; yKey: string; trend: Trend };
const genId = () => `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}
function cellValue(r: Row, c: SummaryColumn): string {
  switch (c.key) {
    case 'ensayo_date': return r.ensayoDate ?? '';
    case 'protocol_code': return r.protocolCode ?? r.protocolNumber ?? '';
    case 'project_name': return String(r.values.project_name ?? '');
    case 'sector_name': return r.sectorName ?? '';
    case 'location_name': return r.locationName ?? '';
    case 'estado': return summaryStatus(String(r.values.estado ?? r.status ?? '')).label;
    default: {
      const v = r.values[c.key];
      if (v == null || v === '') return '';
      if (c.kind === 'number') { const n = num(v); if (Number.isFinite(n)) return formatComputed(n, c.decimals); }
      return String(v);
    }
  }
}
function groupSpans(cols: SummaryColumn[]) {
  const out: { title: string | null; span: number }[] = [];
  for (const c of cols) {
    const g = c.group ?? null;
    const last = out[out.length - 1];
    if (last && last.title === g) last.span++; else out.push({ title: g, span: 1 });
  }
  return out;
}

type MeasureOp = 'avg' | 'std' | 'max' | 'min';
const MEASURE_LABEL_KEY: Record<MeasureOp, string> = { avg: 'summary.measureAvg', std: 'summary.measureStd', max: 'summary.measureMax', min: 'summary.measureMin' };
const measureLabel = (op: MeasureOp): string => tx(MEASURE_LABEL_KEY[op]);
function measure(values: number[], op: MeasureOp): number | null {
  const ns = values.filter(Number.isFinite);
  if (ns.length === 0) return null;
  if (op === 'max') return Math.max(...ns);
  if (op === 'min') return Math.min(...ns);
  const mean = ns.reduce((a, b) => a + b, 0) / ns.length;
  if (op === 'avg') return mean;
  if (ns.length < 2) return 0;
  return Math.sqrt(ns.reduce((a, b) => a + (b - mean) ** 2, 0) / (ns.length - 1));
}
// v43.3 — Altura de fila FIJA para que el encabezado congelado y el cuerpo queden alineados.
const ROW_H = 46;
const MGR_H = 50; // alto de cada fila en la gestión de gráficos (para el drag)

// Regresión polinómica (mínimos cuadrados) para la tendencia.
function polyfit(xs: number[], ys: number[], degree: number): number[] | null {
  const n = xs.length; if (n <= degree) return null;
  const m = degree + 1;
  const A: number[][] = Array.from({ length: m }, () => new Array(m).fill(0));
  const b = new Array(m).fill(0);
  for (let i = 0; i < n; i++) {
    const pw = [1]; for (let p = 1; p < 2 * degree + 1; p++) pw.push(pw[p - 1] * xs[i]);
    for (let r = 0; r < m; r++) { for (let c = 0; c < m; c++) A[r][c] += pw[r + c]; b[r] += pw[r] * ys[i]; }
  }
  for (let col = 0; col < m; col++) {
    let piv = col; for (let r = col + 1; r < m; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]]; [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = 0; r < m; r++) { if (r === col) continue; const f = A[r][col] / A[col][col]; for (let c = col; c < m; c++) A[r][c] -= f * A[col][c]; b[r] -= f * b[col]; }
  }
  return b.map((v, i) => v / A[i][i]);
}
const polyval = (coef: number[], x: number) => coef.reduce((acc, c, i) => acc + c * x ** i, 0);

export default function SummaryTablesScreen({ route, navigation }: Props) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { projectId, projectName } = route.params;

  // Tour contextual (botón de ayuda / tutorial)
  const { jumpToStep, isActive: tourActive, isContextual, dismissTour } = useTour();
  const summaryTestTypeRef = useTourStep('summary_test_type');
  const summaryChartExportRef = useTourStep('summary_chart_export');
  const summaryFiltersRef = useTourStep('summary_filters');
  const summaryMeasuresRef = useTourStep('summary_measures');
  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);

  const [allRows, setAllRows] = useState<Row[]>([]);
  const [configByTpl, setConfigByTpl] = useState<Record<string, ReturnType<typeof parseSummaryConfig>>>({});
  const [labelByTpl, setLabelByTpl] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [templateId, setTemplateId] = useState<string | null>(null);

  // Filtros
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(['APPROVED', 'SUBMITTED', 'REJECTED']));
  const [sectorFilter, setSectorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [tplItems, setTplItems] = useState<{ id: string; partida_item: string | null; item_description: string; validation_method: string | null; section: string | null }[]>([]);
  const [datePicker, setDatePicker] = useState<null | 'from' | 'to'>(null);
  const [measures, setMeasures] = useState<MeasureOp[]>(['avg']);

  // Modales
  const [showFilters, setShowFilters] = useState(false);
  const [showCharts, setShowCharts] = useState(false);

  // Dashboard de gráficos: ARRAY ordenado, persistido por tipo de ensayo.
  const [charts, setCharts] = useState<ChartCfg[]>([]);
  const [addY, setAddY] = useState('');
  const [addTrend, setAddTrend] = useState<Trend>('linear');

  // Estructura de la ficha (para encabezados limpios/ordenados).
  useEffect(() => {
    if (!templateId) { setTplItems([]); return; }
    protocolTemplateItemsCollection.query(Q.where('template_id', templateId), Q.sortBy('created_at', Q.asc)).fetch()
      .then((items: any[]) => setTplItems(items.map(it => ({ id: it.id, partida_item: it.partidaItem ?? null, item_description: it.itemDescription ?? '', validation_method: it.validationMethod ?? null, section: it.section ?? null }))))
      .catch(() => setTplItems([]));
  }, [templateId]);

  // Medidas (KPIs) guardadas por tipo de ensayo.
  useEffect(() => {
    if (!templateId) return;
    AsyncStorage.getItem(`summary_measures_${templateId}`).then(raw => { try { setMeasures(raw ? JSON.parse(raw) : ['avg']); } catch { setMeasures(['avg']); } });
  }, [templateId]);
  useEffect(() => {
    if (!templateId) return;
    AsyncStorage.setItem(`summary_measures_${templateId}`, JSON.stringify(measures)).catch(() => {});
  }, [measures, templateId]);

  // Gráficos (dashboard) guardados por tipo de ensayo.
  useEffect(() => {
    if (!templateId) { setCharts([]); return; }
    AsyncStorage.getItem(`summary_charts_${templateId}`).then(raw => { try { setCharts(raw ? JSON.parse(raw) : []); } catch { setCharts([]); } });
  }, [templateId]);
  useEffect(() => {
    if (!templateId) return;
    AsyncStorage.setItem(`summary_charts_${templateId}`, JSON.stringify(charts)).catch(() => {});
  }, [charts, templateId]);

  // Backfill local solo 1 vez por montaje (los protocolos viejos sin fila).
  const didBackfill = useRef(false);
  // Freeze del encabezado: overlay absoluto sincronizado por scroll horizontal.
  const headerRef = useRef<ScrollView>(null);
  const [headerH, setHeaderH] = useState(0);

  const load = useCallback(async () => {
    if (!didBackfill.current) { didBackfill.current = true; await backfillLocalSummary(projectId); }
    await pullSummaryRows(projectId);
    const recs: any[] = await summaryRowsCollection.query(Q.where('project_id', projectId)).fetch();
    const rows: Row[] = recs.map(r => {
      let values: Record<string, unknown> = {};
      try { values = r.valuesJson ? JSON.parse(r.valuesJson) : {}; } catch { values = {}; }
      return {
        id: r.id, protocolId: r.protocolId, templateId: r.templateId,
        protocolCode: r.protocolCode, protocolNumber: r.protocolNumber, ensayoDate: r.ensayoDate,
        sectorId: r.sectorId, sectorName: r.sectorName, locationId: r.locationId, locationName: r.locationName,
        status: r.status, values,
      };
    });
    setAllRows(rows);
    const tpls: any[] = await protocolTemplatesCollection.query(Q.where('project_id', projectId)).fetch();
    const cfg: Record<string, any> = {}; const lbl: Record<string, string> = {};
    for (const t of tpls) {
      cfg[t.id] = parseSummaryConfig((t as any).summaryConfigJson);
      lbl[t.id] = (t as any).idProtocolo || (t as any).name || tx('summary.testTypeFallback');
    }
    setConfigByTpl(cfg); setLabelByTpl(lbl);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // #7B — Pull-to-refresh: load() ya hace pullSummaryRows (baja de la nube) + recarga.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } catch { /* ignore */ } finally { setRefreshing(false); }
  }, [load]);

  // #7C — Tiempo real: ensayos aprobados/cambiados actualizan el resumen solo.
  useRealtimeProjectPull(projectId, load);

  // Tipos de ensayo con datos.
  const templates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of allRows) if (r.templateId) counts.set(r.templateId, (counts.get(r.templateId) ?? 0) + 1);
    return Array.from(counts, ([id, count]) => ({ id, count, label: labelByTpl[id] ?? id }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allRows, labelByTpl]);

  const rows = useMemo(() => allRows.filter(r => r.templateId === templateId), [allRows, templateId]);
  const worksBySectors = rows.some(r => r.sectorId);
  const sectorOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach(r => { if (r.sectorId) m.set(r.sectorId, r.sectorName ?? r.sectorId); });
    return Array.from(m, ([id, label]) => ({ id, label }));
  }, [rows]);
  const dateChoices = useMemo(() => {
    const s = new Set<string>(); rows.forEach(r => { if (r.ensayoDate) s.add(r.ensayoDate); });
    return Array.from(s).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (!statusFilter.has(r.status ?? '')) return false;
    if (sectorFilter && r.sectorId !== sectorFilter) return false;
    if (dateFrom && (r.ensayoDate ?? '') < dateFrom) return false;
    if (dateTo && (r.ensayoDate ?? '') > dateTo) return false;
    return true;
  }), [rows, statusFilter, sectorFilter, dateFrom, dateTo]);

  // Columnas (sin reordenar por 1ª columna: ese freeze se eliminó).
  const columns = useMemo<SummaryColumn[]>(() => {
    const cfg = templateId ? configByTpl[templateId] : null;
    let data: SummaryColumn[];
    if (cfg?.columns?.length) data = cfg.columns;
    else if (tplItems.length) data = buildAutoColumns(tplItems);
    else data = dynamicColumnsFromRows(rows.map(r => ({ values_json: r.values })));
    return [...FIXED_SUMMARY_COLUMNS, ...data];
  }, [templateId, configByTpl, tplItems, rows]);
  const dataCols = useMemo(() => columns.filter(c => !FIXED_SUMMARY_COLUMNS.some(f => f.key === c.key)), [columns]);
  const groups = useMemo(() => groupSpans(columns), [columns]);
  const hasGroups = groups.some(g => g.title);
  const colWidth = useMemo(() => {
    const w: Record<string, number> = {};
    for (const c of columns) {
      const longestWord = c.label.split(/\s+/).reduce((m, s) => Math.max(m, s.length), 0);
      const labelChars = Math.max(longestWord, Math.ceil(c.label.length / 2));
      let dataChars = 0;
      for (const r of filtered) { const v = cellValue(r, c); if (v.length > dataChars) dataChars = v.length; }
      const maxLen = Math.max(labelChars, dataChars);
      w[c.key] = Math.max(52, Math.min(170, 16 + maxLen * 6.6));
    }
    return w;
  }, [columns, filtered]);
  const widthOf = (c: SummaryColumn) => colWidth[c.key] ?? 90;
  const yOptions = useMemo(() => chartYOptions(dataCols), [dataCols]);
  const yLabelOf = (yKey: string) => yOptions.find(o => o.key === yKey)?.label ?? t('summary.value');

  // Puntos de un gráfico (X = fecha → tiempo; Y = columna).
  const buildPts = useCallback((yKey: string) => filtered
    .map(r => ({ x: r.ensayoDate ? new Date(r.ensayoDate + 'T12:00:00').getTime() : NaN, y: num(r.values[yKey]), code: r.protocolCode ?? '' }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => a.x - b.x), [filtered]);

  const toggleStatus = (k: string) => setStatusFilter(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const activeFilterCount = (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (sectorFilter ? 1 : 0) + (statusFilter.size !== 3 ? 1 : 0);
  const clearFilters = () => { setStatusFilter(new Set(['APPROVED', 'SUBMITTED', 'REJECTED'])); setSectorFilter(''); setDateFrom(''); setDateTo(''); };
  const reorderCharts = useCallback((from: number, to: number) => setCharts(prev => {
    if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
    const n = [...prev]; const [m] = n.splice(from, 1); n.splice(to, 0, m); return n;
  }), []);

  async function exportCsv() {
    try {
      const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
      const header = columns.map(c => esc(c.label)).join(',');
      const lines = filtered.map(r => columns.map(c => esc(cellValue(r, c))).join(','));
      const csv = '﻿' + [header, ...lines].join('\r\n'); // UTF-8 con BOM
      const uri = `${FileSystem.cacheDirectory}dashboard_${(templateId && labelByTpl[templateId]) || 'ensayo'}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: t('summary.exportDialogTitle') });
      else Alert.alert(t('summary.csvGenerated'), uri);
    } catch (e) {
      Alert.alert(t('common.error'), t('summary.exportError') + String(e));
    }
  }

  // ── Render reutilizable de celdas ─────────────────────────────────────────
  const rowBg = (ri: number) => (ri % 2 ? '#f7f9fc' : Colors.white);
  const footerBg = (mi: number) => (mi % 2 ? '#e3e9f2' : '#eef2f7');
  const renderGroupRow = (cols: SummaryColumn[]) => {
    const gs = groupSpans(cols); let idx = 0;
    return (
      <View style={{ flexDirection: 'row' }}>
        {gs.map((g, i) => { let w = 0; for (let k = 0; k < g.span; k++) w += widthOf(cols[idx + k]); idx += g.span; return <View key={i} style={[styles.gHead, { width: w }]}><Text style={styles.gHeadText} numberOfLines={1}>{g.title ?? ' '}</Text></View>; })}
      </View>
    );
  };
  const renderNameRow = (cols: SummaryColumn[]) => (
    <View style={{ flexDirection: 'row' }}>
      {cols.map(c => <View key={c.key} style={[styles.th, { width: widthOf(c) }]}><Text style={styles.thText} numberOfLines={2}>{c.label}</Text></View>)}
    </View>
  );
  const renderRowCells = (r: Row, cols: SummaryColumn[]) => cols.map(c => {
    if (c.key === 'estado') { const st = summaryStatus(String(r.values.estado ?? r.status ?? '')); return <View key={c.key} style={[styles.td, { width: widthOf(c) }]}><Text style={[styles.tdText, { color: st.color, fontWeight: '800' }]} numberOfLines={1}>{st.label}</Text></View>; }
    if (c.key === 'protocol_code') { const code = cellValue(r, c); return <View key={c.key} style={[styles.td, { width: widthOf(c) }]}><TouchableOpacity onPress={() => navigation.navigate('ProtocolFill', { protocolId: r.protocolId })}><Text style={[styles.tdText, { color: Colors.primary, fontWeight: '800', textDecorationLine: 'underline' }]} numberOfLines={1}>{code || '—'}</Text></TouchableOpacity></View>; }
    return <View key={c.key} style={[styles.td, { width: widthOf(c) }]}><Text style={styles.tdText} numberOfLines={2}>{cellValue(r, c) || '—'}</Text></View>;
  });
  const renderFooterCells = (op: MeasureOp, cols: SummaryColumn[]) => cols.map((c, i) => {
    const isData = dataCols.some(d => d.key === c.key);
    const m = isData ? measure(filtered.map(r => num(r.values[c.key])), op) : null;
    const val = i === 0 && c.key === columns[0]?.key ? measureLabel(op).toUpperCase() : (m == null ? '' : formatComputed(m, c.decimals));
    return <View key={c.key} style={[styles.tdFoot, { width: widthOf(c) }]}><Text style={styles.tdFootText} numberOfLines={1}>{val}</Text></View>;
  });

  if (loading) {
    return <View style={styles.container}><AppHeader title={t('summary.title')} subtitle={projectName} onBack={() => navigation.goBack()} /><View style={styles.center}><ActivityIndicator color={Colors.primary} /></View></View>;
  }

  return (
    <View style={styles.container}>
      <AppHeader
        title={t('summary.title')}
        subtitle={templateId ? undefined : projectName}
        onBack={templateId ? () => setTemplateId(null) : () => navigation.goBack()}
        rightContent={
          templateId ? (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={() => jumpToStep('summary_test_type')} hitSlop={8} style={styles.headerBtn}><Ionicons name="help-circle-outline" size={21} color={Colors.white} /></TouchableOpacity>
              <TouchableOpacity onPress={exportCsv} disabled={filtered.length === 0} hitSlop={8} style={[styles.headerBtn, filtered.length === 0 && { opacity: 0.4 }]}><Ionicons name="download-outline" size={20} color={Colors.white} /></TouchableOpacity>
              <TouchableOpacity ref={summaryFiltersRef} onPress={() => setShowFilters(true)} hitSlop={8} style={styles.headerBtn}>
                <Ionicons name="filter" size={19} color={Colors.white} />
                {activeFilterCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{activeFilterCount}</Text></View>}
              </TouchableOpacity>
              <TouchableOpacity ref={summaryChartExportRef} onPress={() => setShowCharts(true)} hitSlop={8} style={styles.headerBtn}><Ionicons name="settings-outline" size={19} color={Colors.white} /></TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => jumpToStep('summary_test_type')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
            </TouchableOpacity>
          )
        }
      />

      {!templateId ? (
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}>

          {templates.length === 0 ? (
            <View style={styles.empty}><Ionicons name="grid-outline" size={36} color={Colors.textMuted} /><Text style={styles.emptyText}>{t('summary.emptyNoData')}</Text></View>
          ) : (
            <>
              <Text style={styles.hint}>{t('summary.pickTestType')}</Text>
              {templates.map((tp, i) => (
                <TouchableOpacity ref={i === 0 ? summaryTestTypeRef : undefined} key={tp.id} style={styles.tplCard} onPress={() => setTemplateId(tp.id)} activeOpacity={0.8}>
                  <View style={styles.tplIcon}><Ionicons name="grid" size={20} color={Colors.secondary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tplTitle}>{tp.label}</Text>
                    <Text style={styles.tplSub}>{tx('summary.testCount', { count: tp.count, plural: tp.count === 1 ? '' : 's' })}{configByTpl[tp.id] ? tx('summary.customConfig') : tx('summary.autoColumns')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Carrusel de gráficos (orden = el del modal ⚙) */}
          {charts.length === 0 ? (
            <TouchableOpacity style={styles.carouselEmpty} onPress={() => setShowCharts(true)} activeOpacity={0.8}>
              <Ionicons name="stats-chart-outline" size={16} color={Colors.primary} />
              <Text style={styles.carouselEmptyText}>{t('summary.chartsEmpty')}</Text>
            </TouchableOpacity>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carousel} contentContainerStyle={{ gap: 10, padding: 10 }}>
              {charts.map(ch => {
                const data = buildPts(ch.yKey);
                return (
                  <View key={ch.id} style={styles.chartCard}>
                    <Text style={styles.chartTitle} numberOfLines={1}>{yLabelOf(ch.yKey)}{t('summary.vsTime')}</Text>
                    {data.length > 0 ? <ScatterChartRN data={data} yLabel={yLabelOf(ch.yKey)} trend={ch.trend} />
                      : <View style={styles.chartEmpty}><Text style={styles.emptyText}>{t('summary.noneMatch')}</Text></View>}
                  </View>
                );
              })}
            </ScrollView>
          )}

          {filtered.length === 0 ? (
            <ScrollView style={{ flex: 1 }}><View style={styles.empty}><Text style={styles.emptyText}>{t('summary.noneMatch')}</Text></View></ScrollView>
          ) : (
            <View style={{ flex: 1 }}>
              {/* CUERPO: scroll vertical + horizontal; sincroniza el encabezado congelado. */}
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} scrollEventThrottle={16}>
                <ScrollView horizontal scrollEventThrottle={16}
                  onScroll={e => headerRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false })}>
                  <View>
                    <View onLayout={e => setHeaderH(e.nativeEvent.layout.height)}>
                      {hasGroups && renderGroupRow(columns)}
                      {renderNameRow(columns)}
                    </View>
                    {filtered.map((r, ri) => (
                      <View key={r.id} style={{ flexDirection: 'row', height: ROW_H, backgroundColor: rowBg(ri) }}>{renderRowCells(r, columns)}</View>
                    ))}
                    {measures.map((op, mi) => (
                      <View key={op} style={{ flexDirection: 'row', height: ROW_H, backgroundColor: footerBg(mi), borderTopWidth: mi === 0 ? 2 : 1, borderTopColor: mi === 0 ? Colors.navy : '#dbe2ec' }}>{renderFooterCells(op, columns)}</View>
                    ))}
                  </View>
                </ScrollView>

                {/* + Nueva medida */}
                <View ref={summaryMeasuresRef} style={styles.measureBar}>
                  {(['avg', 'std', 'max', 'min'] as MeasureOp[]).map(op => {
                    const on = measures.includes(op);
                    return (
                      <TouchableOpacity key={op} onPress={() => setMeasures(m => on ? (op === 'avg' ? m : m.filter(x => x !== op)) : [...m, op])}
                        style={[styles.measureChip, on && styles.measureChipOn]}>
                        <Ionicons name={on ? 'checkmark-circle' : 'add-circle-outline'} size={13} color={on ? Colors.primary : Colors.textMuted} />
                        <Text style={[styles.measureChipText, on && { color: Colors.primary, fontWeight: '800' }]}>{measureLabel(op)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* OVERLAY: encabezado CONGELADO (todas las columnas), refleja el scroll horizontal. */}
              {headerH > 0 && (
                <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: headerH }}>
                  <ScrollView horizontal ref={headerRef} scrollEnabled={false} showsHorizontalScrollIndicator={false}>
                    <View>
                      {hasGroups && renderGroupRow(columns)}
                      {renderNameRow(columns)}
                    </View>
                  </ScrollView>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* Modal calendario (fecha inicial / final) */}
      <Modal visible={!!datePicker} transparent animationType="fade" onRequestClose={() => setDatePicker(null)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setDatePicker(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{datePicker === 'from' ? t('summary.from') : t('summary.to')}</Text>
            <CalendarPicker
              value={(datePicker === 'from' ? dateFrom : dateTo) || undefined}
              onSelect={d => { if (datePicker === 'from') setDateFrom(d); else setDateTo(d); setDatePicker(null); }}
              onClear={() => { if (datePicker === 'from') setDateFrom(''); else setDateTo(''); setDatePicker(null); }}
            />
          </View>
        </View>
      </Modal>

      {/* Modal: FILTROS (todos en un lugar) */}
      <Modal visible={showFilters} transparent animationType="fade" onRequestClose={() => setShowFilters(false)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowFilters(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeadRow}>
              <Text style={styles.modalTitle}>{t('summary.filtersTitle')}</Text>
              <Text style={styles.modalCount}>{filtered.length}/{rows.length}</Text>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={styles.filterLabel}>{t('summary.status')}</Text>
              <View style={styles.chipRow}>
                {[['APPROVED', t('summary.statusApproved'), '#1e8e3e'], ['SUBMITTED', t('summary.statusInReview'), '#394e7d'], ['REJECTED', t('summary.statusRejected'), '#d93025']].map(([k, l, col]) => {
                  const on = statusFilter.has(k);
                  return <TouchableOpacity key={k} onPress={() => toggleStatus(k)} style={[styles.ghost, { borderColor: on ? col : Colors.border }]}><Text style={[styles.ghostText, { color: on ? col : Colors.textMuted }]}>{l}</Text></TouchableOpacity>;
                })}
              </View>
              {worksBySectors && (
                <>
                  <Text style={styles.filterLabel}>{t('summary.sector')}</Text>
                  <View style={styles.chipRow}>
                    <Chip label={t('summary.all')} on={!sectorFilter} onPress={() => setSectorFilter('')} />
                    {sectorOptions.map(o => <Chip key={o.id} label={o.label} on={sectorFilter === o.id} onPress={() => setSectorFilter(o.id)} />)}
                  </View>
                </>
              )}
              {dateChoices.length > 0 && (
                <>
                  <Text style={styles.filterLabel}>{t('summary.dateRange')}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={styles.dateField} onPress={() => setDatePicker('from')}>
                      <Text style={styles.dateFieldLabel}>{t('summary.dateFrom')}</Text>
                      <Text style={styles.dateFieldValue}>{dateFrom || '—'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.dateField} onPress={() => setDatePicker('to')}>
                      <Text style={styles.dateFieldLabel}>{t('summary.dateTo')}</Text>
                      <Text style={styles.dateFieldValue}>{dateTo || '—'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
            <View style={styles.modalFootRow}>
              <TouchableOpacity onPress={clearFilters} disabled={activeFilterCount === 0}><Text style={[styles.clearText, activeFilterCount === 0 && { opacity: 0.4 }]}>{t('summary.clear')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setShowFilters(false)} style={styles.genBtn}><Text style={styles.genBtnText}>{t('summary.done')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: ⚙ CONFIGURAR GRÁFICOS (gestión arriba con drag + agregar abajo) */}
      <Modal visible={showCharts} transparent animationType="fade" onRequestClose={() => setShowCharts(false)}>
        <GestureHandlerRootView style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowCharts(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeadRow}>
              <Text style={styles.modalTitle}>{t('summary.chartsConfig')}</Text>
              <TouchableOpacity onPress={() => setShowCharts(false)} hitSlop={8}><Ionicons name="close" size={20} color={Colors.textMuted} /></TouchableOpacity>
            </View>

            {/* GESTIÓN: reordenar (mantén y arrastra) + eliminar */}
            <Text style={styles.filterLabel}>{t('summary.manageCharts')}</Text>
            {charts.length === 0 ? <Text style={styles.smallMuted}>{t('summary.noChartsYet')}</Text> : (
              <>
                <Text style={styles.smallMuted}>{t('summary.reorderHint')}</Text>
                <View style={{ height: charts.length * MGR_H, marginTop: 4 }}>
                  {charts.map((ch, i) => (
                    <ManagerRow key={ch.id} index={i} count={charts.length}
                      label={yLabelOf(ch.yKey)}
                      sub={ch.trend === 'linear' ? t('summary.trendLinear') : ch.trend === 'quad' ? t('summary.trendQuad') : t('summary.trendCubic')}
                      onReorder={reorderCharts}
                      onDelete={() => setCharts(prev => prev.filter(c => c.id !== ch.id))} />
                  ))}
                </View>
              </>
            )}

            {/* AGREGAR */}
            <View style={styles.addDivider} />
            <Text style={styles.filterLabel}>{t('summary.addChart')}</Text>
            <Text style={styles.chartFieldLabel}>{t('summary.axisX')}</Text>
            <View style={styles.chartFixedField}><Text style={styles.chartFixedText}>{t('summary.axisXFixed')}</Text></View>
            <Text style={styles.chartFieldLabel}>{t('summary.axisYParam')}</Text>
            <ScrollView style={{ maxHeight: 150 }}>
              {yOptions.map(o => {
                const on = addY === o.key;
                return <TouchableOpacity key={o.key} style={[styles.dateRow, on && { backgroundColor: Colors.primary + '12' }]} onPress={() => setAddY(o.key)}>
                  <Text style={[styles.dateRowText, on && { color: Colors.primary, fontWeight: '800' }]}>{o.label}</Text></TouchableOpacity>;
              })}
            </ScrollView>
            <Text style={styles.chartFieldLabel}>{t('summary.trendLine')}</Text>
            <View style={styles.chipRow}>
              {([['linear', t('summary.trendLinear')], ['quad', t('summary.trendQuad')], ['cubic', t('summary.trendCubic')]] as [Trend, string][]).map(([k, l]) => (
                <TouchableOpacity key={k} onPress={() => setAddTrend(k)} style={[styles.choice, addTrend === k && styles.choiceOn]}>
                  <Text style={[styles.choiceText, addTrend === k && styles.choiceTextOn]}>{l}</Text></TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity disabled={!addY || yOptions.length === 0}
              onPress={() => { if (addY) { setCharts(prev => [...prev, { id: genId(), yKey: addY, trend: addTrend }]); setAddY(''); setAddTrend('linear'); } }}
              style={[styles.addBtn, (!addY || yOptions.length === 0) && { opacity: 0.4 }]}>
              <Ionicons name="add" size={16} color={Colors.white} /><Text style={styles.genBtnText}>{t('summary.addChart')}</Text>
            </TouchableOpacity>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

// Fila de gestión de gráficos: mantén presionado y arrastra para reordenar.
function ManagerRow({ index, count, label, sub, onReorder, onDelete }: {
  index: number; count: number; label: string; sub: string; onReorder: (from: number, to: number) => void; onDelete: () => void;
}) {
  const ty = useSharedValue(0);
  const active = useSharedValue(0);
  const pan = Gesture.Pan()
    .activateAfterLongPress(160)
    .onStart(() => { active.value = 1; })
    .onUpdate(e => { ty.value = e.translationY; })
    .onEnd(e => {
      const delta = Math.round(e.translationY / MGR_H);
      let to = index + delta; if (to < 0) to = 0; if (to > count - 1) to = count - 1;
      if (to !== index) runOnJS(onReorder)(index, to);
      ty.value = 0; active.value = 0;
    });
  const aStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }, { scale: active.value ? 1.03 : 1 }],
    zIndex: active.value ? 20 : 0,
    shadowOpacity: active.value ? 0.18 : 0,
  }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.mgrRow, aStyle]}>
        <Ionicons name="reorder-three" size={22} color={Colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={styles.mgrLabel} numberOfLines={1}>{label}</Text>
          <Text style={styles.mgrSub}>{sub}</Text>
        </View>
        <TouchableOpacity onPress={onDelete} hitSlop={10}><Ionicons name="trash-outline" size={18} color="#d93025" /></TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return <TouchableOpacity onPress={onPress} style={[styles.choice, on && styles.choiceOn]}><Text style={[styles.choiceText, on && styles.choiceTextOn]} numberOfLines={1}>{label}</Text></TouchableOpacity>;
}

// ── Gráfico de dispersión (react-native-svg) con tendencia ───────────────────
function ScatterChartRN({ data, yLabel, trend }: { data: { x: number; y: number; code: string }[]; yLabel: string; trend: 'linear' | 'quad' | 'cubic' }) {
  const { t } = useI18n();
  const W = 320, H = 230, padL = 40, padR = 10, padT = 10, padB = 38;
  const xs = data.map(d => d.x), ys = data.map(d => d.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs) || minX + 1;
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const dx = maxX - minX || 1, dy = (maxY - minY) || 1;
  const sx = (x: number) => padL + ((x - minX) / dx) * (W - padL - padR);
  const sy = (y: number) => H - padB - ((y - minY) / dy) * (H - padT - padB);
  const degree = trend === 'linear' ? 1 : trend === 'quad' ? 2 : 3;
  const nx = xs.map(x => (x - minX) / dx);
  const coef = polyfit(nx, ys, degree);
  const trendPts: string[] = [];
  if (coef) for (let i = 0; i <= 50; i++) { const tt = i / 50; trendPts.push(`${sx(minX + tt * dx).toFixed(1)},${sy(polyval(coef, tt)).toFixed(1)}`); }
  const fmtD = (tm: number) => { const d = new Date(tm); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`; };
  return (
    <View>
      <Svg width={W} height={H}>
        <SvgLine x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#cbd5e1" strokeWidth={1} />
        <SvgLine x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#cbd5e1" strokeWidth={1} />
        {Array.from({ length: 5 }, (_, i) => { const yv = minY + (dy * i) / 4; const yy = sy(yv); return (
          <React.Fragment key={i}>
            <SvgLine x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="#eef2f7" strokeWidth={1} />
            <SvgText x={padL - 4} y={yy + 3} fontSize={8} fill="#64748b" textAnchor="end">{Math.abs(yv) >= 100 ? yv.toFixed(0) : yv.toFixed(1)}</SvgText>
          </React.Fragment>); })}
        {[minX, (minX + maxX) / 2, maxX].map((xv, i) => <SvgText key={i} x={sx(xv)} y={H - padB + 14} fontSize={8} fill="#64748b" textAnchor="middle">{fmtD(xv)}</SvgText>)}
        {data.map((d, i) => <SvgCircle key={i} cx={sx(d.x)} cy={sy(d.y)} r={3} fill="#1a4f7a" opacity={0.8} />)}
        {coef ? <SvgPolyline points={trendPts.join(' ')} fill="none" stroke="#e37400" strokeWidth={2} /> : null}
        <SvgText x={W / 2} y={H - 4} fontSize={9} fontWeight="700" fill="#1a1a2e" textAnchor="middle">{t('summary.timeAxisLabel')}</SvgText>
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 2 }}>
        <Text style={{ fontSize: 10, color: '#64748b' }}>{t('summary.testsLegend', { label: yLabel })}</Text>
        <Text style={{ fontSize: 10, color: '#e37400' }}>{t('summary.trendLegend', { kind: trend === 'linear' ? t('summary.trendKindLinear') : trend === 'quad' ? t('summary.trendKindQuad') : t('summary.trendKindCubic') })}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 12, gap: 8 },
  hint: { fontSize: 13, color: Colors.textSecondary, marginBottom: 4 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  tplCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 14 },
  tplIcon: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.secondary + '18', borderWidth: 1, borderColor: Colors.secondary + '40' },
  tplTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  tplSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  // Header condensado: fila de iconos a la derecha.
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, paddingHorizontal: 3, borderRadius: 7, backgroundColor: Colors.secondary, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: Colors.white, fontSize: 8, fontWeight: '800' },

  // Carrusel de gráficos
  carousel: { flexGrow: 0, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  carouselEmpty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 10, padding: 14, borderRadius: Radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border, backgroundColor: Colors.white },
  carouselEmptyText: { fontSize: 12.5, color: Colors.primary, fontWeight: '700' },
  chartCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 12, width: 344 },
  chartTitle: { fontSize: 13, fontWeight: '800', color: Colors.navy, marginBottom: 6 },
  chartEmpty: { height: 200, alignItems: 'center', justifyContent: 'center' },

  filterLabel: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', marginTop: 8 },
  smallMuted: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 4 },
  ghost: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.white },
  ghostText: { fontSize: 11, fontWeight: '800' },
  choice: { borderWidth: 1, borderColor: Colors.border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.white },
  choiceOn: { borderColor: Colors.primary, backgroundColor: Colors.primary + '12' },
  choiceText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', maxWidth: 160 },
  choiceTextOn: { color: Colors.primary, fontWeight: '800' },
  dateField: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: Colors.white, marginTop: 4 },
  dateFieldLabel: { fontSize: 9, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase' },
  dateFieldValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginTop: 2 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14, width: '100%', maxWidth: 380 },
  modalTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  modalHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalCount: { fontSize: 11, color: Colors.textMuted, fontWeight: '700' },
  modalFootRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  clearText: { color: Colors.primary, fontWeight: '800', fontSize: 12, padding: 6 },
  dateRow: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dateRowText: { fontSize: 14, color: Colors.textPrimary },

  measureBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 10, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border },
  measureChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.white },
  measureChipOn: { borderColor: Colors.primary, backgroundColor: Colors.primary + '10' },
  measureChipText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },

  // Gestión de gráficos (drag)
  mgrRow: { position: 'absolute', left: 0, right: 0, height: MGR_H, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, marginBottom: 6, shadowColor: Colors.navy, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  mgrLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  mgrSub: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },

  addDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  chartFieldLabel: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', marginTop: 8, marginBottom: 3 },
  chartFixedField: { backgroundColor: Colors.surface, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, paddingVertical: 8 },
  chartFixedText: { fontSize: 13, color: Colors.textMuted },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 10, marginTop: 12 },
  genBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 8 },
  genBtnText: { color: Colors.white, fontWeight: '800', fontSize: 13 },

  gHead: { backgroundColor: '#0f2d4a', paddingVertical: 9, paddingHorizontal: 4, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  gHeadText: { color: Colors.white, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.2 },
  th: { backgroundColor: Colors.navy, paddingVertical: 6, paddingHorizontal: 5, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  thText: { color: Colors.white, fontSize: 8.5, fontWeight: '800', textTransform: 'uppercase', textAlign: 'center', lineHeight: 11 },
  td: { paddingVertical: 6, paddingHorizontal: 5, borderTopWidth: 1, borderTopColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  tdText: { fontSize: 11, color: Colors.textPrimary, textAlign: 'center' },
  tdFoot: { paddingVertical: 7, paddingHorizontal: 5, borderTopWidth: 2, borderTopColor: Colors.navy, justifyContent: 'center', alignItems: 'center' },
  tdFootText: { fontSize: 10, fontWeight: '800', color: Colors.navy, textAlign: 'center' },
});
