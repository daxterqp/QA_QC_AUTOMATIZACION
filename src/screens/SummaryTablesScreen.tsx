/**
 * SummaryTablesScreen (móvil) — "Dashboard" (ex Tablas Resumen).
 * Selector de tipo de ensayo → header condensado (1 línea) con back + acciones
 * (tutorial · CSV · filtros · ⚙ gráficos). Filtros en modal. Carrusel de gráficos
 * configurable (agregar / eliminar / reordenar arrastrando) por tipo de ensayo, y
 * tabla consolidada debajo. La tabla congela SOLO el encabezado (fila de nombres);
 * el freeze de la 1ª columna se eliminó por errores visuales.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Modal, RefreshControl, TextInput, Switch } from 'react-native';
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
import { summaryRowsCollection, protocolTemplatesCollection, protocolTemplateItemsCollection, projectsCollection } from '@db/index';
import { pullSummaryRows, backfillLocalSummary } from '@services/SummaryRowService';
import { parseFeatureFlagsJson, isLinearProject } from '@utils/featureFlags';
import { useRealtimeProjectPull } from '@hooks/useRealtimeProjectPull';
import {
  FIXED_SUMMARY_COLUMNS, dynamicColumnsFromRows, parseSummaryConfig, summaryStatus,
  type SummaryColumn,
} from '@utils/summaryTable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildAutoColumns, chartYOptions } from '@utils/summaryColumns';
import { formatComputed } from '@utils/numericProtocol';
import Svg, { Line as SvgLine, Circle as SvgCircle, Polyline as SvgPolyline, Path as SvgPath, Text as SvgText } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { useFonts, Poppins_400Regular, Poppins_400Regular_Italic, Poppins_500Medium, Poppins_700Bold } from '@expo-google-fonts/poppins';
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

type Trend = 'none' | 'linear' | 'quad' | 'cubic';
type Join = 'none' | 'linear' | 'smooth'; // v100j — unión de puntos (tipo Excel)
/** v100d — Config por gráfico (persistida): ejes manuales + fechas verticales.
 *  yMin/yMax null/undefined = automático; xMin/xMax = YYYY-MM-DD o null.
 *  v100e — limMin/limMax = líneas horizontales de límite (punteadas) o null.
 *  v100j — xKey = variable del eje X (null/undefined = Tiempo); join = unión de
 *  puntos; vxMin/vxMax = rango manual del eje X cuando es variable. */
type ChartCfg = {
  id: string; yKey: string; trend: Trend;
  yMin?: number | null; yMax?: number | null;
  xMin?: string | null; xMax?: string | null;
  xVertical?: boolean;
  limMin?: number | null; limMax?: number | null;
  showEq?: boolean;      // v100f — ecuación de ajuste (default OFF)
  showStats?: boolean;   // v100f — media/σ/n (default ON; undefined = ON)
  showLegend?: boolean;  // v100g — leyenda de líneas (default OFF)
  showVGrid?: boolean;   // v100g — cuadrícula vertical (default ON; undefined = ON)
  xKey?: string | null;  // v100j — variable del eje X (null = Tiempo)
  join?: Join;           // v100j — unión de puntos (default 'none')
  vxMin?: number | null; vxMax?: number | null; // v100j — rango X manual (solo variable)
};
const genId = () => `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/** v100d — Rango Y "bonito": centra los valores TÍPICOS (cuantiles 10-90, los
 *  atípicos no participan del centrado) + padding 25% a cada lado. Overrides
 *  manuales (cfg) mandan. Degenerado (todos iguales) → abre una ventana mínima. */
function niceYRange(ys: number[], yMinCfg?: number | null, yMaxCfg?: number | null): { lo: number; hi: number } {
  const sorted = ys.filter(Number.isFinite).sort((a, b) => a - b);
  let lo = 0, hi = 1;
  if (sorted.length > 0) {
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
    lo = q(0.1); hi = q(0.9);
    if (hi - lo <= 0) { const base = Math.max(Math.abs(hi) * 0.01, 0.5); lo -= base; hi += base; }
    const pad = (hi - lo) * 0.25;
    lo -= pad; hi += pad;
  }
  if (yMinCfg != null && Number.isFinite(yMinCfg)) lo = yMinCfg;
  if (yMaxCfg != null && Number.isFinite(yMaxCfg)) hi = yMaxCfg;
  if (hi <= lo) hi = lo + 1;
  return { lo, hi };
}

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

// v100e — Formato compacto de coeficientes (3-4 cifras significativas; notación
// científica solo para magnitudes extremas) y armado de la ecuación de ajuste.
function fmtCoef(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e5)) return v.toExponential(2);
  return String(Number(v.toPrecision(4)));
}
const SUP = ['', '', '²', '³'];
/** coef en base i (coef[0] + coef[1]·sym + …); sym = 't' (días) o 'x' (variable). */
function equationStr(coef: number[], degree: number, sym = 't'): string {
  let s = '';
  for (let i = degree; i >= 0; i--) {
    const c = coef[i]; if (!Number.isFinite(c)) continue;
    const body = i === 0 ? fmtCoef(Math.abs(c)) : `${fmtCoef(Math.abs(c))}·${sym}${SUP[i] || ''}`;
    if (s === '') s = (c < 0 ? '−' : '') + body;
    else s += (c < 0 ? ' − ' : ' + ') + body;
  }
  return `y = ${s}`;
}
/** v100j — Camino suavizado (spline Catmull-Rom → curvas Bézier) por los puntos
 *  YA ordenados por X, como la "línea suavizada" de Excel. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}
/** v100h — Paso "bonito" (1 · 2 · 2.5 · 5 · 10 ×10^k) para ~target divisiones. */
function niceStep(range: number, target: number): number {
  if (!(range > 0) || target <= 0) return 1;
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return mult * mag;
}
/** Marcas redondas DENTRO de [lo,hi] (el rango del eje no se altera). */
function niceTicks(lo: number, hi: number, target: number): { ticks: number[]; step: number } {
  const step = niceStep(hi - lo, target);
  const ticks: number[] = [];
  const start = Math.ceil(lo / step - 1e-9) * step;
  for (let v = start, guard = 0; v <= hi + step * 1e-9 && guard < 64; v += step, guard++) {
    ticks.push(Number(v.toFixed(10)));
  }
  return { ticks, step };
}
function rSquared(ys: number[], yhat: number[]): number | null {
  const n = ys.length; if (n < 2) return null;
  const mean = ys.reduce((a, b) => a + b, 0) / n;
  const ssTot = ys.reduce((a, b) => a + (b - mean) ** 2, 0);
  if (ssTot <= 0) return 1;
  const ssRes = ys.reduce((a, b, i) => a + (b - yhat[i]) ** 2, 0);
  return 1 - ssRes / ssTot;
}

export default function SummaryTablesScreen({ route, navigation }: Props) {
  const { t } = useI18n();
  // v100i — tipografía geométrica de los gráficos (sustituta libre de Century Gothic).
  useFonts({ Poppins_400Regular, Poppins_400Regular_Italic, Poppins_500Medium, Poppins_700Bold });
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
  // v100c — Obra lineal: Sector→"Tramo", + Subtramo/Progresiva, − Ubicación.
  const [isLinear, setIsLinear] = useState(false);
  // v100c — Ordenamiento por columna. Default: código, el más NUEVO arriba.
  const [sortKey, setSortKey] = useState('protocol_code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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
  const [addX, setAddX] = useState(''); // v100j — '' = Tiempo (default); si no, key de variable
  const [addJoin, setAddJoin] = useState<Join>('none');

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
    // v100c — PULL PRIMERO: si la nube ya tiene filas frescas (_sv al día), el
    // backfill las ve y NO regenera desde datos locales posiblemente stale.
    await pullSummaryRows(projectId);
    if (!didBackfill.current) { didBackfill.current = true; await backfillLocalSummary(projectId); }
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
    try {
      const proj: any = await projectsCollection.find(projectId);
      setIsLinear(isLinearProject(parseFeatureFlagsJson(proj?.featureFlags)));
    } catch { /* deja el valor previo */ }
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

  // v100c — Al cambiar de tipo, volver al orden default (código más nuevo arriba).
  useEffect(() => { setSortKey('protocol_code'); setSortDir('desc'); }, [templateId]);
  const onSort = useCallback((key: string) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); return prev; }
      // Fechas y código arrancan DESC (lo más nuevo arriba); el resto ASC.
      setSortDir(key === 'protocol_code' || key === 'ensayo_date' || key === 'fecha_aprobacion' ? 'desc' : 'asc');
      return key;
    });
  }, []);

  // v100c — Columnas FIJAS según tipo de proyecto: en obra lineal el sector se
  // llama "Tramo", entran Subtramo + Progresiva y sale Ubicación.
  const fixedCols = useMemo<SummaryColumn[]>(() => {
    if (!isLinear) return FIXED_SUMMARY_COLUMNS;
    const base = FIXED_SUMMARY_COLUMNS.filter(c => c.key !== 'location_name')
      .map(c => (c.key === 'sector_name' ? { ...c, label: 'Tramo' } : c));
    const i = base.findIndex(c => c.key === 'sector_name');
    base.splice(i + 1, 0,
      { key: 'subtramo', label: 'Subtramo', from: 'key:subtramo', kind: 'text', group: 'Identificación' },
      { key: 'progresiva', label: 'Progresiva', from: 'key:progresiva', kind: 'text', group: 'Identificación' },
    );
    return base;
  }, [isLinear]);

  // Columnas (sin reordenar por 1ª columna: ese freeze se eliminó).
  const columns = useMemo<SummaryColumn[]>(() => {
    const cfg = templateId ? configByTpl[templateId] : null;
    let data: SummaryColumn[];
    if (cfg?.columns?.length) data = cfg.columns;
    else if (tplItems.length) data = buildAutoColumns(tplItems);
    else data = dynamicColumnsFromRows(rows.map(r => ({ values_json: r.values })));
    return [...fixedCols, ...data];
  }, [templateId, configByTpl, tplItems, rows, fixedCols]);
  const dataCols = useMemo(() => columns.filter(c => !fixedCols.some(f => f.key === c.key)), [columns, fixedCols]);

  // v100c — Filas ORDENADAS por la columna elegida (numérico o alfabético según el
  // tipo de la columna); celdas vacías siempre al final. Default: código desc.
  const sorted = useMemo(() => {
    const col = columns.find(c => c.key === sortKey) ?? columns.find(c => c.key === 'protocol_code');
    if (!col) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (col.kind === 'number') {
        const na = num(a.values[col.key]), nb = num(b.values[col.key]);
        const aOk = Number.isFinite(na), bOk = Number.isFinite(nb);
        if (aOk && bOk) return (na - nb) * dir;
        if (aOk) return -1;
        if (bOk) return 1;
        return 0;
      }
      const va = cellValue(a, col), vb = cellValue(b, col);
      if (va === '' && vb === '') return 0;
      if (va === '') return 1;
      if (vb === '') return -1;
      return va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
    return arr;
  }, [filtered, columns, sortKey, sortDir]);

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

  // Puntos de un gráfico. v100j — el eje X puede ser el TIEMPO (default) o
  // cualquier variable numérica (ch.xKey); siempre ordenados por X para que la
  // unión de puntos tenga sentido. El rango de fechas (xMin/xMax) solo aplica
  // cuando X es tiempo.
  const buildPts = useCallback((ch: ChartCfg) => {
    const xk = ch.xKey || null;
    return filtered
      .filter(r => xk ? true : (!ch.xMin || (r.ensayoDate ?? '') >= ch.xMin) && (!ch.xMax || (r.ensayoDate ?? '') <= ch.xMax))
      .map(r => ({
        x: xk ? num(r.values[xk]) : (r.ensayoDate ? new Date(r.ensayoDate + 'T12:00:00').getTime() : NaN),
        y: num(r.values[ch.yKey]), code: r.protocolCode ?? '',
      }))
      .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x);
  }, [filtered]);
  // v100d — decimales de la columna del eje Y (los ticks usan los MISMOS decimales).
  const decimalsOf = useCallback((yKey: string) => dataCols.find(c => c.key === yKey)?.decimals, [dataCols]);

  // v100e — captura + compartir imagen de cada gráfico.
  const chartShotRefs = useRef<Record<string, any>>({});
  const shareChart = useCallback(async (id: string) => {
    try {
      const node = chartShotRefs.current[id];
      if (!node) return;
      const uri = await captureRef(node, { format: 'png', quality: 1, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('summary.shareChart') });
    } catch { Alert.alert(t('summary.shareChart'), t('common.error')); }
  }, [t]);

  // v100d — Config de ejes por gráfico (mantener presionado el gráfico / ruedita).
  const [axisChart, setAxisChart] = useState<ChartCfg | null>(null);
  const [axYMin, setAxYMin] = useState(''); const [axYMax, setAxYMax] = useState('');
  const [axXMin, setAxXMin] = useState(''); const [axXMax, setAxXMax] = useState('');
  const [axVert, setAxVert] = useState(false);
  const [axDatePick, setAxDatePick] = useState<null | 'from' | 'to'>(null);
  // v100e — límites horizontales + tendencia editable por gráfico.
  const [axLimMin, setAxLimMin] = useState(''); const [axLimMax, setAxLimMax] = useState('');
  const [axTrend, setAxTrend] = useState<Trend>('linear');
  // v100f — flags de ecuación (default OFF) y estadística (default ON).
  const [axShowEq, setAxShowEq] = useState(false); const [axShowStats, setAxShowStats] = useState(true);
  // v100g — leyenda de líneas (default OFF) y cuadrícula vertical (default ON).
  const [axShowLegend, setAxShowLegend] = useState(false); const [axShowVGrid, setAxShowVGrid] = useState(true);
  // v100j — unión de puntos + rango X numérico (cuando el eje X es una variable).
  const [axJoin, setAxJoin] = useState<Join>('none');
  const [axVxMin, setAxVxMin] = useState(''); const [axVxMax, setAxVxMax] = useState('');
  const openAxisCfg = useCallback((ch: ChartCfg) => {
    setAxisChart(ch);
    setAxYMin(ch.yMin != null ? String(ch.yMin) : '');
    setAxYMax(ch.yMax != null ? String(ch.yMax) : '');
    setAxXMin(ch.xMin ?? ''); setAxXMax(ch.xMax ?? '');
    setAxVert(!!ch.xVertical); setAxDatePick(null);
    setAxLimMin(ch.limMin != null ? String(ch.limMin) : '');
    setAxLimMax(ch.limMax != null ? String(ch.limMax) : '');
    setAxTrend(ch.trend ?? 'linear');
    setAxShowEq(!!ch.showEq); setAxShowStats(ch.showStats !== false);
    setAxShowLegend(!!ch.showLegend); setAxShowVGrid(ch.showVGrid !== false);
    setAxJoin(ch.join ?? 'none');
    setAxVxMin(ch.vxMin != null ? String(ch.vxMin) : '');
    setAxVxMax(ch.vxMax != null ? String(ch.vxMax) : '');
  }, []);
  const saveAxisCfg = useCallback(() => {
    if (!axisChart) return;
    const numOrNull = (s: string) => { const n = Number(String(s).trim().replace(',', '.')); return s.trim() !== '' && Number.isFinite(n) ? n : null; };
    setCharts(prev => prev.map(c => c.id === axisChart.id ? {
      ...c, yMin: numOrNull(axYMin), yMax: numOrNull(axYMax),
      xMin: axXMin || null, xMax: axXMax || null, xVertical: axVert,
      limMin: numOrNull(axLimMin), limMax: numOrNull(axLimMax), trend: axTrend,
      showEq: axShowEq, showStats: axShowStats, showLegend: axShowLegend, showVGrid: axShowVGrid,
      join: axJoin, vxMin: numOrNull(axVxMin), vxMax: numOrNull(axVxMax),
    } : c));
    setAxisChart(null);
  }, [axisChart, axYMin, axYMax, axXMin, axXMax, axVert, axLimMin, axLimMax, axTrend, axShowEq, axShowStats, axShowLegend, axShowVGrid, axJoin, axVxMin, axVxMax]);

  // v100f — ocultar temporalmente los gráficos para ver la tabla completa (móvil).
  const [chartsHidden, setChartsHidden] = useState(false);

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
      const lines = sorted.map(r => columns.map(c => esc(cellValue(r, c))).join(','));
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
  // v100c — Encabezados CLICKEABLES: tocar ordena por esa columna (asc↔desc). El
  // triangulito indica el estado: ▽ tenue = ordenable; ▲/▼ blanco = orden activo.
  const renderNameRow = (cols: SummaryColumn[]) => (
    <View style={{ flexDirection: 'row' }}>
      {cols.map(c => {
        const active = sortKey === c.key;
        return (
          <TouchableOpacity key={c.key} style={[styles.th, { width: widthOf(c) }]} activeOpacity={0.6} onPress={() => onSort(c.key)}>
            <Text style={styles.thText} numberOfLines={2}>{c.label}</Text>
            <Text style={[styles.thSort, active && styles.thSortOn]}>{active ? (sortDir === 'asc' ? '▲' : '▼') : '▽'}</Text>
          </TouchableOpacity>
        );
      })}
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
              {charts.length > 0 && (
                <TouchableOpacity onPress={() => setChartsHidden(h => !h)} hitSlop={8} style={styles.headerBtn}>
                  <Ionicons name={chartsHidden ? 'bar-chart-outline' : 'eye-off-outline'} size={19} color={Colors.white} />
                </TouchableOpacity>
              )}
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
          {/* Carrusel de gráficos (orden = el del modal ⚙). v100f — se puede ocultar (👁) para ver la tabla completa. */}
          {chartsHidden && charts.length > 0 ? (
            <TouchableOpacity style={styles.chartsHiddenBar} onPress={() => setChartsHidden(false)} activeOpacity={0.8}>
              <Ionicons name="bar-chart-outline" size={15} color={Colors.primary} />
              <Text style={styles.carouselEmptyText}>{t('summary.chartsShow')}</Text>
            </TouchableOpacity>
          ) : charts.length === 0 ? (
            <TouchableOpacity style={styles.carouselEmpty} onPress={() => setShowCharts(true)} activeOpacity={0.8}>
              <Ionicons name="stats-chart-outline" size={16} color={Colors.primary} />
              <Text style={styles.carouselEmptyText}>{t('summary.chartsEmpty')}</Text>
            </TouchableOpacity>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carousel} contentContainerStyle={{ gap: 10, padding: 10 }}>
              {charts.map(ch => {
                const data = buildPts(ch);
                return (
                  /* v100d/e — mantener presionado (o la ruedita) abre la config; los íconos
                     van FUERA del área capturable para que no salgan en la imagen compartida. */
                  <View key={ch.id} style={styles.chartCard}>
                    <View style={styles.chartIcons}>
                      <TouchableOpacity onPress={() => shareChart(ch.id)} hitSlop={8} style={styles.chartIconBtn}><Ionicons name="share-social-outline" size={16} color={Colors.textMuted} /></TouchableOpacity>
                      <TouchableOpacity onPress={() => openAxisCfg(ch)} hitSlop={8} style={styles.chartIconBtn}><Ionicons name="settings-outline" size={16} color={Colors.textMuted} /></TouchableOpacity>
                    </View>
                    <TouchableOpacity activeOpacity={1} onLongPress={() => openAxisCfg(ch)} delayLongPress={350}>
                      <View ref={(r) => { chartShotRefs.current[ch.id] = r; }} collapsable={false} style={styles.chartShot}>
                        <Text style={styles.chartTitle} numberOfLines={2}>
                          {yLabelOf(ch.yKey)}{ch.xKey ? ` vs ${yLabelOf(ch.xKey)}` : t('summary.vsTime')}
                        </Text>
                        {data.length > 0
                          ? <ScatterChartRN data={data} yLabel={yLabelOf(ch.yKey)} trend={ch.trend}
                              decimals={decimalsOf(ch.yKey)} yMin={ch.yMin} yMax={ch.yMax} xVertical={!!ch.xVertical}
                              limMin={ch.limMin} limMax={ch.limMax} showEq={!!ch.showEq} showStats={ch.showStats !== false}
                              showLegend={!!ch.showLegend} showVGrid={ch.showVGrid !== false}
                              xLabel={ch.xKey ? yLabelOf(ch.xKey) : undefined} xDecimals={ch.xKey ? decimalsOf(ch.xKey) : undefined}
                              join={ch.join ?? 'none'} vxMin={ch.vxMin} vxMax={ch.vxMax} />
                          : <View style={styles.chartEmpty}><Text style={styles.emptyText}>{t('summary.noneMatch')}</Text></View>}
                      </View>
                    </TouchableOpacity>
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
                    {sorted.map((r, ri) => (
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

              {/* OVERLAY: encabezado CONGELADO (todas las columnas), refleja el scroll horizontal.
                  v100c — box-none: los taps caen en los encabezados (ordenar) y el resto pasa. */}
              {headerH > 0 && (
                <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: headerH }}>
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
          <View style={[styles.modalCard, { maxHeight: '88%' }]}>
            <View style={styles.modalHeadRow}>
              <Text style={styles.modalTitle}>{t('summary.chartsConfig')}</Text>
              <TouchableOpacity onPress={() => setShowCharts(false)} hitSlop={8}><Ionicons name="close" size={20} color={Colors.textMuted} /></TouchableOpacity>
            </View>
            {/* v100j — contenido scrolleable; el botón Agregar queda SIEMPRE visible abajo */}
            <ScrollView style={{ flexShrink: 1 }} nestedScrollEnabled>

            {/* GESTIÓN: reordenar (mantén y arrastra) + eliminar */}
            <Text style={styles.filterLabel}>{t('summary.manageCharts')}</Text>
            {charts.length === 0 ? <Text style={styles.smallMuted}>{t('summary.noChartsYet')}</Text> : (
              <>
                <Text style={styles.smallMuted}>{t('summary.reorderHint')}</Text>
                <View style={{ height: charts.length * MGR_H, marginTop: 4 }}>
                  {charts.map((ch, i) => (
                    <ManagerRow key={ch.id} index={i} count={charts.length}
                      label={`${yLabelOf(ch.yKey)}${ch.xKey ? ` vs ${yLabelOf(ch.xKey)}` : ''}`}
                      sub={ch.trend === 'none' ? t('summary.trendNone') : ch.trend === 'linear' ? t('summary.trendLinear') : ch.trend === 'quad' ? t('summary.trendQuad') : t('summary.trendCubic')}
                      onReorder={reorderCharts}
                      onDelete={() => setCharts(prev => prev.filter(c => c.id !== ch.id))} />
                  ))}
                </View>
              </>
            )}

            {/* AGREGAR */}
            <View style={styles.addDivider} />
            <Text style={styles.filterLabel}>{t('summary.addChart')}</Text>
            {/* v100j — el eje X ya no es fijo: Tiempo (default) o cualquier variable */}
            <Text style={styles.chartFieldLabel}>{t('summary.axisX')}</Text>
            <ScrollView style={{ maxHeight: 96 }} nestedScrollEnabled>
              <TouchableOpacity style={[styles.dateRow, !addX && { backgroundColor: Colors.primary + '12' }]} onPress={() => setAddX('')}>
                <Text style={[styles.dateRowText, !addX && { color: Colors.primary, fontWeight: '800' }]}>{t('summary.axisXFixed')}</Text></TouchableOpacity>
              {yOptions.map(o => {
                const on = addX === o.key;
                return <TouchableOpacity key={o.key} style={[styles.dateRow, on && { backgroundColor: Colors.primary + '12' }]} onPress={() => setAddX(o.key)}>
                  <Text style={[styles.dateRowText, on && { color: Colors.primary, fontWeight: '800' }]}>{o.label}</Text></TouchableOpacity>;
              })}
            </ScrollView>
            <Text style={styles.chartFieldLabel}>{t('summary.axisYParam')}</Text>
            <ScrollView style={{ maxHeight: 120 }} nestedScrollEnabled>
              {yOptions.map(o => {
                const on = addY === o.key;
                return <TouchableOpacity key={o.key} style={[styles.dateRow, on && { backgroundColor: Colors.primary + '12' }]} onPress={() => setAddY(o.key)}>
                  <Text style={[styles.dateRowText, on && { color: Colors.primary, fontWeight: '800' }]}>{o.label}</Text></TouchableOpacity>;
              })}
            </ScrollView>
            <Text style={styles.chartFieldLabel}>{t('summary.trendLine')}</Text>
            <View style={styles.chipRow}>
              {([['none', t('summary.trendNone')], ['linear', t('summary.trendLinear')], ['quad', t('summary.trendQuad')], ['cubic', t('summary.trendCubic')]] as [Trend, string][]).map(([k, l]) => (
                <TouchableOpacity key={k} onPress={() => setAddTrend(k)} style={[styles.choice, addTrend === k && styles.choiceOn]}>
                  <Text style={[styles.choiceText, addTrend === k && styles.choiceTextOn]}>{l}</Text></TouchableOpacity>
              ))}
            </View>
            {/* v100j — unión de puntos tipo Excel */}
            <Text style={styles.chartFieldLabel}>{t('summary.joinLine')}</Text>
            <View style={styles.chipRow}>
              {([['none', t('summary.joinNone')], ['linear', t('summary.joinLinear')], ['smooth', t('summary.joinSmooth')]] as [Join, string][]).map(([k, l]) => (
                <TouchableOpacity key={k} onPress={() => setAddJoin(k)} style={[styles.choice, addJoin === k && styles.choiceOn]}>
                  <Text style={[styles.choiceText, addJoin === k && styles.choiceTextOn]}>{l}</Text></TouchableOpacity>
              ))}
            </View>
            </ScrollView>
            <TouchableOpacity disabled={!addY || yOptions.length === 0}
              onPress={() => { if (addY) { setCharts(prev => [...prev, { id: genId(), yKey: addY, trend: addTrend, xKey: addX || null, join: addJoin }]); setAddY(''); setAddTrend('linear'); setAddX(''); setAddJoin('none'); } }}
              style={[styles.addBtn, (!addY || yOptions.length === 0) && { opacity: 0.4 }]}>
              <Ionicons name="add" size={16} color={Colors.white} /><Text style={styles.genBtnText}>{t('summary.addChart')}</Text>
            </TouchableOpacity>
          </View>
        </GestureHandlerRootView>
      </Modal>

      {/* v100d — Modal: EJES del gráfico (mantener presionado / ruedita). Se persiste por gráfico. */}
      <Modal visible={!!axisChart} transparent animationType="fade" onRequestClose={() => setAxisChart(null)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setAxisChart(null)} />
          <View style={[styles.modalCard, { maxHeight: '88%' }]}>
            <View style={styles.modalHeadRow}>
              <Text style={styles.modalTitle}>Ejes del gráfico</Text>
              <TouchableOpacity onPress={() => setAxisChart(null)} hitSlop={8}><Ionicons name="close" size={20} color={Colors.textMuted} /></TouchableOpacity>
            </View>
            <Text style={styles.smallMuted}>{axisChart ? `${yLabelOf(axisChart.yKey)}${axisChart.xKey ? ` vs ${yLabelOf(axisChart.xKey)}` : ''}` : ''}</Text>
            {/* v100j — contenido scrolleable; Cancelar/Guardar SIEMPRE visibles abajo */}
            <ScrollView style={{ flexShrink: 1 }} nestedScrollEnabled>

            <Text style={styles.filterLabel}>Eje Y — rango (vacío = automático)</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <View style={styles.dateField}>
                <Text style={styles.dateFieldLabel}>Mínimo</Text>
                <TextInput style={styles.axisInput} keyboardType="numeric" value={axYMin} onChangeText={setAxYMin} placeholder="auto" />
              </View>
              <View style={styles.dateField}>
                <Text style={styles.dateFieldLabel}>Máximo</Text>
                <TextInput style={styles.axisInput} keyboardType="numeric" value={axYMax} onChangeText={setAxYMax} placeholder="auto" />
              </View>
            </View>

            <Text style={styles.filterLabel}>Líneas de límite (horizontales punteadas)</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <View style={styles.dateField}>
                <Text style={[styles.dateFieldLabel, { color: '#2563eb' }]}>Límite mín.</Text>
                <TextInput style={styles.axisInput} keyboardType="numeric" value={axLimMin} onChangeText={setAxLimMin} placeholder="ninguno" />
              </View>
              <View style={styles.dateField}>
                <Text style={[styles.dateFieldLabel, { color: '#d93025' }]}>Límite máx.</Text>
                <TextInput style={styles.axisInput} keyboardType="numeric" value={axLimMax} onChangeText={setAxLimMax} placeholder="ninguno" />
              </View>
            </View>

            <Text style={styles.filterLabel}>Línea de tendencia</Text>
            <View style={styles.chipRow}>
              {([['none', t('summary.trendNone')], ['linear', t('summary.trendLinear')], ['quad', t('summary.trendQuad')], ['cubic', t('summary.trendCubic')]] as [Trend, string][]).map(([k, l]) => (
                <TouchableOpacity key={k} onPress={() => setAxTrend(k)} style={[styles.choice, axTrend === k && styles.choiceOn]}>
                  <Text style={[styles.choiceText, axTrend === k && styles.choiceTextOn]}>{l}</Text></TouchableOpacity>
              ))}
            </View>

            {/* v100j — unión de puntos tipo Excel (editable también aquí) */}
            <Text style={styles.filterLabel}>{t('summary.joinLine')}</Text>
            <View style={styles.chipRow}>
              {([['none', t('summary.joinNone')], ['linear', t('summary.joinLinear')], ['smooth', t('summary.joinSmooth')]] as [Join, string][]).map(([k, l]) => (
                <TouchableOpacity key={k} onPress={() => setAxJoin(k)} style={[styles.choice, axJoin === k && styles.choiceOn]}>
                  <Text style={[styles.choiceText, axJoin === k && styles.choiceTextOn]}>{l}</Text></TouchableOpacity>
              ))}
            </View>

            <View style={[styles.modalHeadRow, { marginTop: 8 }]}>
              <Text style={styles.dateRowText}>Mostrar leyenda de líneas</Text>
              <Switch value={axShowLegend} onValueChange={setAxShowLegend} />
            </View>
            <View style={styles.modalHeadRow}>
              <Text style={styles.dateRowText}>Cuadrícula vertical</Text>
              <Switch value={axShowVGrid} onValueChange={setAxShowVGrid} />
            </View>
            <View style={styles.modalHeadRow}>
              <Text style={styles.dateRowText}>Mostrar ecuación de ajuste y R²</Text>
              <Switch value={axShowEq} onValueChange={setAxShowEq} disabled={axTrend === 'none'} />
            </View>
            <View style={styles.modalHeadRow}>
              <Text style={styles.dateRowText}>Mostrar cálculos (media, σ, n)</Text>
              <Switch value={axShowStats} onValueChange={setAxShowStats} />
            </View>

            {!axisChart?.xKey ? (
              <>
                <Text style={styles.filterLabel}>Eje X — rango de fechas (vacío = automático)</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={styles.dateField} onPress={() => setAxDatePick(axDatePick === 'from' ? null : 'from')}>
                    <Text style={styles.dateFieldLabel}>Inicial</Text>
                    <Text style={styles.dateFieldValue}>{axXMin || '—'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dateField} onPress={() => setAxDatePick(axDatePick === 'to' ? null : 'to')}>
                    <Text style={styles.dateFieldLabel}>Final</Text>
                    <Text style={styles.dateFieldValue}>{axXMax || '—'}</Text>
                  </TouchableOpacity>
                </View>
                {axDatePick && (
                  <CalendarPicker
                    value={(axDatePick === 'from' ? axXMin : axXMax) || undefined}
                    onSelect={d => { if (axDatePick === 'from') setAxXMin(d); else setAxXMax(d); setAxDatePick(null); }}
                    onClear={() => { if (axDatePick === 'from') setAxXMin(''); else setAxXMax(''); setAxDatePick(null); }}
                  />
                )}
              </>
            ) : (
              /* v100j — eje X variable → rango numérico manual */
              <>
                <Text style={styles.filterLabel}>Eje X — rango (vacío = automático)</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <View style={styles.dateField}>
                    <Text style={styles.dateFieldLabel}>Mínimo</Text>
                    <TextInput style={styles.axisInput} keyboardType="numeric" value={axVxMin} onChangeText={setAxVxMin} placeholder="auto" />
                  </View>
                  <View style={styles.dateField}>
                    <Text style={styles.dateFieldLabel}>Máximo</Text>
                    <TextInput style={styles.axisInput} keyboardType="numeric" value={axVxMax} onChangeText={setAxVxMax} placeholder="auto" />
                  </View>
                </View>
              </>
            )}

            <View style={[styles.modalHeadRow, { marginTop: 10 }]}>
              <Text style={styles.dateRowText}>{axisChart?.xKey ? 'Etiquetas del eje X en vertical' : 'Fechas del eje X en vertical'}</Text>
              <Switch value={axVert} onValueChange={setAxVert} />
            </View>
            </ScrollView>

            <View style={styles.modalFootRow}>
              <TouchableOpacity onPress={() => setAxisChart(null)}><Text style={styles.clearText}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity onPress={saveAxisCfg} style={styles.genBtn}><Text style={styles.genBtnText}>Guardar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
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
      <Animated.View style={[styles.mgrRow, { top: index * MGR_H }, aStyle]}>
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
// v100e — Presentación profesional: título de eje Y rotado (usa el espacio muerto
// de la izquierda), líneas de límite punteadas con etiqueta al ARRANQUE (no
// desbordan), tendencia punteada con ecuación de ajuste + R², y panel de
// estadística (media / desviación / n) debajo. Rango Y centrado en los valores
// típicos (atípicos recortados al borde); ticks con los decimales de la columna.
// v100g — Paleta del gráfico. Grises unificados (ejes + cuadrícula horizontal
// = mismo plomo; cuadrícula vertical más clara). Líneas de referencia con los
// colores pedidos: máx rojo, mín azul, tendencia verde.
const AXIS_GRAY = '#c3ccd8';       // ejes + cuadrícula horizontal (mismo plomo)
const VGRID_GRAY = '#e4e9f0';      // cuadrícula vertical (más clara)
const C_MAX = '#c90c0c';           // límite máximo
const C_MIN = '#254ca5';           // límite mínimo
const C_TREND = '#21de83';         // línea de tendencia
const C_POINT = '#1a4f7a';         // puntos de ensayo
// v100i — Tipografía de los gráficos. Century Gothic es propietaria (Monotype) y
// no se puede redistribuir; Poppins es la geométrica libre más cercana (mismas
// formas circulares y 'a' de un piso). Si algún día se licencia la real, basta
// con cambiar estas tres constantes.
const FONT_REG = 'Poppins_400Regular';
const FONT_ITALIC = 'Poppins_400Regular_Italic';
const FONT_MED = 'Poppins_500Medium';
const FONT_BOLD = 'Poppins_700Bold';
/** v100h — Muestra de línea punteada para la leyenda: EXACTAMENTE 3 tramos
 *  (5 + 3 + 5 + 3 + 5 = 21 px), mismo grosor que las líneas del gráfico. */
function LegendDash({ color }: { color: string }) {
  return (
    <Svg width={21} height={4}>
      <SvgLine x1={0} y1={2} x2={21} y2={2} stroke={color} strokeWidth={1.8} strokeDasharray="5,3" />
    </Svg>
  );
}
function ScatterChartRN({ data, yLabel, trend, decimals, yMin, yMax, xVertical, limMin, limMax, showEq, showStats, showLegend, showVGrid, xLabel, xDecimals, join, vxMin, vxMax }: {
  data: { x: number; y: number; code: string }[]; yLabel: string; trend: Trend;
  decimals?: number; yMin?: number | null; yMax?: number | null; xVertical?: boolean;
  limMin?: number | null; limMax?: number | null; showEq?: boolean; showStats?: boolean;
  showLegend?: boolean; showVGrid?: boolean;
  // v100j — eje X variable (xLabel presente = variable; ausente = tiempo) + unión de puntos.
  xLabel?: string; xDecimals?: number; join?: Join; vxMin?: number | null; vxMax?: number | null;
}) {
  const { t } = useI18n();
  const isVar = xLabel != null; // eje X = variable (no tiempo)
  // Márgenes simétricos: padL alberga los ticks + el título vertical del eje Y.
  const W = 320, H = 232, padL = 50, padR = 16, padT = 12, padB = xVertical ? 64 : 40;
  const xs = data.map(d => d.x), ys = data.map(d => d.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs) || minX + 1;
  // v100j — Rango X: tiempo = extensión de los datos; variable = datos + 6% de
  // aire a cada lado, con overrides manuales (vxMin/vxMax) que mandan.
  let xlo = minX, xhi = maxX;
  if (isVar) {
    const padX = (maxX - minX || Math.max(Math.abs(maxX) * 0.01, 0.5)) * 0.06;
    xlo = minX - padX; xhi = maxX + padX;
    if (vxMin != null && Number.isFinite(vxMin)) xlo = vxMin;
    if (vxMax != null && Number.isFinite(vxMax)) xhi = vxMax;
    if (xhi <= xlo) xhi = xlo + 1;
  }
  const dx = xhi - xlo || 1;
  // Rango Y: los límites configurados deben quedar VISIBLES dentro del área de ploteo.
  let { lo, hi } = niceYRange(ys, yMin, yMax);
  if (yMin == null && limMin != null && Number.isFinite(limMin)) lo = Math.min(lo, limMin);
  if (yMax == null && limMax != null && Number.isFinite(limMax)) hi = Math.max(hi, limMax);
  if (hi <= lo) hi = lo + 1;
  const dy = hi - lo;
  const sxRaw = (x: number) => padL + ((x - xlo) / dx) * (W - padL - padR);
  const syRaw = (y: number) => H - padB - ((y - lo) / dy) * (H - padT - padB);
  // Atípicos fuera del rango → recortados al borde del área de ploteo.
  const sx = (x: number) => Math.max(padL, Math.min(W - padR, sxRaw(x)));
  const sy = (y: number) => Math.max(padT, Math.min(H - padB, syRaw(y)));
  // v100h — Densidad de cuadrícula calculada del rango: marcas REDONDAS dentro de
  // [lo,hi] con ~7 divisiones en Y y ~5-6 en X (el rango del eje no cambia).
  const { ticks: yTicks, step } = niceTicks(lo, hi, 7);
  const V_DIV = 6; // divisiones verticales (modo tiempo)
  // Decimales de los ticks: los de la columna; si el paso entre marcas es más fino
  // (rango chico), sube la precisión lo justo para que no salgan repetidos.
  const needed = step > 0 ? Math.max(0, Math.min(6, Math.ceil(-Math.log10(step)))) : 0;
  const tickDec = Math.max(decimals ?? 0, needed);
  // v100j — Ticks del eje X en modo variable (marcas redondas + decimales de SU columna).
  const { ticks: xVarTicks, step: xStep } = niceTicks(xlo, xhi, 5);
  const xNeeded = xStep > 0 ? Math.max(0, Math.min(6, Math.ceil(-Math.log10(xStep)))) : 0;
  const xTickDec = Math.max(xDecimals ?? 0, xNeeded);
  // v100e/j — tendencia opcional y punteada. Con X=tiempo la regresión va en DÍAS
  // (t = días desde el 1er ensayo); con X=variable, en las unidades de la variable.
  const degree = trend === 'linear' ? 1 : trend === 'quad' ? 2 : trend === 'cubic' ? 3 : 0;
  const DAY = 86400000;
  const tx2 = isVar ? xs : xs.map(x => (x - minX) / DAY);
  const coef = trend === 'none' ? null : polyfit(tx2, ys, degree);
  const toT = (xv: number) => isVar ? xv : (xv - minX) / DAY;
  const trendPts: string[] = [];
  if (coef) for (let i = 0; i <= 50; i++) { const tt = i / 50; const xv = xlo + tt * dx; trendPts.push(`${sx(xv).toFixed(1)},${sy(polyval(coef, toT(xv))).toFixed(1)}`); }
  const trendVisible = !!coef && trend !== 'none';
  const r2 = coef ? rSquared(ys, tx2.map(v => polyval(coef, v))) : null;
  const eq = coef ? equationStr(coef, degree, isVar ? 'x' : 't') : '';
  // v100j — Unión de puntos (tipo Excel): ninguna / lineal / suavizada.
  const joinMode: Join = join ?? 'none';
  const pxy = data.map(d => ({ x: sx(d.x), y: sy(d.y) }));
  const joinLinearPts = joinMode === 'linear' && pxy.length > 1 ? pxy.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') : '';
  const joinSmoothD = joinMode === 'smooth' && pxy.length > 1 ? smoothPath(pxy) : '';
  // Estadística descriptiva.
  const n = ys.length;
  const mean = n ? ys.reduce((a, b) => a + b, 0) / n : 0;
  const std = n > 1 ? Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const statDec = Math.max(decimals ?? 0, 2);
  const fmtD = (tm: number) => { const d = new Date(tm); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`; };
  // Ticks del eje X: variable → marcas redondas; tiempo vertical → todas las
  // fechas (dedup); tiempo horizontal → 3 marcas.
  const xTicks = isVar ? xVarTicks : (xVertical
    ? Array.from(new Set(xs)).sort((a, b) => a - b)
    : [minX, (minX + maxX) / 2, maxX]);
  const fmtX = (xv: number) => isVar ? xv.toFixed(xTickDec) : fmtD(xv);
  const trendKind = trend === 'linear' ? t('summary.trendKindLinear') : trend === 'quad' ? t('summary.trendKindQuad') : trend === 'cubic' ? t('summary.trendKindCubic') : '';
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={W} height={H}>
        {/* Título del eje Y (vertical) — ocupa la banda muerta de la izquierda */}
        <SvgText x={12} y={(padT + H - padB) / 2} fontSize={9} fontFamily={FONT_BOLD} fill="#1a1a2e" textAnchor="middle"
          transform={`rotate(-90, 12, ${(padT + H - padB) / 2})`}>{yLabel}</SvgText>
        {/* v100g/h/j — Cuadrícula VERTICAL (más clara), detrás de todo. Variable →
            alineada a las marcas redondas del eje X; tiempo → divisiones uniformes. */}
        {showVGrid ? (isVar
          ? xVarTicks.map((xv, k) => <SvgLine key={`v${k}`} x1={sxRaw(xv)} y1={padT} x2={sxRaw(xv)} y2={H - padB} stroke={VGRID_GRAY} strokeWidth={1} />)
          : Array.from({ length: V_DIV - 1 }, (_, k) => { const xx = padL + ((W - padL - padR) * (k + 1)) / V_DIV; return (
            <SvgLine key={`v${k}`} x1={xx} y1={padT} x2={xx} y2={H - padB} stroke={VGRID_GRAY} strokeWidth={1} />
          ); })) : null}
        {/* Marco: eje Y (izq.), eje X (abajo) y v100i — cierre por la DERECHA */}
        <SvgLine x1={padL} y1={padT} x2={padL} y2={H - padB} stroke={AXIS_GRAY} strokeWidth={1} />
        <SvgLine x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke={AXIS_GRAY} strokeWidth={1} />
        <SvgLine x1={W - padR} y1={padT} x2={W - padR} y2={H - padB} stroke={AXIS_GRAY} strokeWidth={1} />
        {yTicks.map((yv, i) => { const yy = syRaw(yv); return (
          <React.Fragment key={i}>
            <SvgLine x1={padL} y1={yy} x2={W - padR} y2={yy} stroke={AXIS_GRAY} strokeWidth={1} />
            <SvgText x={padL - 4} y={yy + 3} fontSize={8} fontFamily={FONT_REG} fill="#64748b" textAnchor="end">{yv.toFixed(tickDec)}</SvgText>
          </React.Fragment>); })}
        {xTicks.map((xv, i) => xVertical
          ? <SvgText key={i} x={sxRaw(xv)} y={H - padB + 6} fontSize={7.5} fontFamily={FONT_REG} fill="#64748b" textAnchor="end" transform={`rotate(-90, ${sxRaw(xv)}, ${H - padB + 6})`} dy={3}>{fmtX(xv)}</SvgText>
          : <SvgText key={i} x={sxRaw(xv)} y={H - padB + 14} fontSize={8} fontFamily={FONT_REG} fill="#64748b" textAnchor="middle">{fmtX(xv)}</SvgText>)}
        {/* Líneas de límite (punteadas): mín. azul, máx. rojo. Etiqueta al ARRANQUE (izq.) para no desbordar. */}
        {limMax != null && Number.isFinite(limMax) && limMax >= lo && limMax <= hi
          ? <React.Fragment>
              <SvgLine x1={padL} y1={syRaw(limMax)} x2={W - padR} y2={syRaw(limMax)} stroke={C_MAX} strokeWidth={1.6} strokeDasharray="6,4" />
              <SvgText x={padL + 3} y={syRaw(limMax) - 3} fontSize={7.5} fontFamily={FONT_BOLD} fill={C_MAX} textAnchor="start">{t('summary.limMaxShort')} {limMax.toFixed(tickDec)}</SvgText>
            </React.Fragment> : null}
        {limMin != null && Number.isFinite(limMin) && limMin >= lo && limMin <= hi
          ? <React.Fragment>
              <SvgLine x1={padL} y1={syRaw(limMin)} x2={W - padR} y2={syRaw(limMin)} stroke={C_MIN} strokeWidth={1.6} strokeDasharray="6,4" />
              <SvgText x={padL + 3} y={syRaw(limMin) - 3} fontSize={7.5} fontFamily={FONT_BOLD} fill={C_MIN} textAnchor="start">{t('summary.limMinShort')} {limMin.toFixed(tickDec)}</SvgText>
            </React.Fragment> : null}
        {/* v100j — Unión de puntos (debajo de los puntos): lineal o suavizada, sólida */}
        {joinLinearPts ? <SvgPolyline points={joinLinearPts} fill="none" stroke={C_POINT} strokeWidth={1.6} /> : null}
        {joinSmoothD ? <SvgPath d={joinSmoothD} fill="none" stroke={C_POINT} strokeWidth={1.6} /> : null}
        {data.map((d, i) => <SvgCircle key={i} cx={sx(d.x)} cy={sy(d.y)} r={3} fill={C_POINT} opacity={0.85} />)}
        {/* Tendencia: MISMO ancho y patrón que las líneas de límite */}
        {trendVisible ? <SvgPolyline points={trendPts.join(' ')} fill="none" stroke={C_TREND} strokeWidth={1.6} strokeDasharray="6,4" /> : null}
        <SvgText x={(padL + W - padR) / 2} y={H - 3} fontSize={9} fontFamily={FONT_BOLD} fill="#1a1a2e" textAnchor="middle">{isVar ? xLabel : t('summary.timeAxisLabel')}</SvgText>
      </Svg>

      {/* v100h — Pie en DOS columnas: izquierda la leyenda (muestra de línea
          punteada de 3 tramos + rótulo), derecha primero la estadística y luego
          la ecuación. Cada bloque detrás de su propio flag. */}
      {(showLegend || (showEq && trendVisible) || showStats) ? (
        <View style={styles.chartFooter}>
          {showLegend ? (
            <View style={styles.footerLeft}>
              {limMax != null && Number.isFinite(limMax) ? (
                <View style={styles.legendItem}><LegendDash color={C_MAX} /><Text style={[styles.legendTxt, { color: C_MAX }]}>{t('summary.limMaxShort')} {limMax.toFixed(tickDec)}</Text></View>
              ) : null}
              {limMin != null && Number.isFinite(limMin) ? (
                <View style={styles.legendItem}><LegendDash color={C_MIN} /><Text style={[styles.legendTxt, { color: C_MIN }]}>{t('summary.limMinShort')} {limMin.toFixed(tickDec)}</Text></View>
              ) : null}
              {trendVisible ? (
                <View style={styles.legendItem}><LegendDash color={C_TREND} /><Text style={[styles.legendTxt, { color: C_TREND }]}>{t('summary.trendLegend', { kind: trendKind })}</Text></View>
              ) : null}
            </View>
          ) : null}
          {/* v100i — divisor vertical entre las dos secciones del pie */}
          {showLegend && (showStats || (showEq && trendVisible)) ? <View style={styles.footerDivider} /> : null}
          {(showStats || (showEq && trendVisible)) ? (
            <View style={[styles.footerRight, { alignItems: showLegend ? 'flex-end' : 'flex-start' }]}>
              {showStats ? (
                <View style={styles.chartStatsRow}>
                  <Text style={styles.chartStat}>n = {n}</Text>
                  <Text style={styles.chartStat}>x̄ = {mean.toFixed(statDec)}</Text>
                  <Text style={styles.chartStat}>σ = {std.toFixed(statDec)}</Text>
                </View>
              ) : null}
              {showEq && trendVisible ? (
                <View style={{ alignItems: showLegend ? 'flex-end' : 'flex-start' }}>
                  {/* v100j — R² arriba junto a la ecuación; la descripción de la
                      variable debajo, en plomo claro e itálica (solo modo tiempo) */}
                  <Text style={[styles.chartEq, { textAlign: showLegend ? 'right' : 'left' }]} numberOfLines={2}>
                    {eq}  ·  R² = {r2 != null ? r2.toFixed(3) : '—'}
                  </Text>
                  {!isVar ? (
                    <Text style={[styles.chartEqNote, { textAlign: showLegend ? 'right' : 'left' }]}>{t('summary.daysNote')}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
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
  chartCard: { position: 'relative', backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 12, width: 344 },
  chartIcons: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 2, zIndex: 5 },
  chartIconBtn: { padding: 4 },
  chartShot: { backgroundColor: Colors.white, borderRadius: Radius.md, paddingTop: 2, paddingBottom: 4 },
  chartTitle: { fontSize: 12.5, fontFamily: FONT_BOLD, color: Colors.navy, textAlign: 'center', textDecorationLine: 'underline', paddingHorizontal: 36, marginBottom: 8 },
  chartFooter: { width: '100%', flexDirection: 'row', marginTop: 4, paddingTop: 6, paddingHorizontal: 2, borderTopWidth: 1, borderTopColor: '#eef2f7', gap: 8 },
  footerLeft: { flex: 1, alignItems: 'flex-start', gap: 3 },
  footerDivider: { width: 1, alignSelf: 'stretch', backgroundColor: '#e4e9f0' },
  footerRight: { flex: 1.2, gap: 3 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendTxt: { fontSize: 10, color: '#64748b', fontFamily: FONT_MED },
  // v100i — cálculos y ecuación SIN negrita, mismo cuerpo de letra.
  chartEq: { fontSize: 10, color: '#334155', fontFamily: FONT_REG },
  // v100j — descripción de la variable t: plomo más claro e itálica.
  chartEqNote: { fontSize: 9, color: '#a8b3c2', fontFamily: FONT_ITALIC },
  chartStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chartStat: { fontSize: 10, color: '#334155', fontFamily: FONT_REG },
  chartsHiddenBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 8, paddingVertical: 8, borderRadius: Radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border, backgroundColor: Colors.white },
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
  // v100d — inputs numéricos del modal de ejes.
  axisInput: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, paddingVertical: 2, padding: 0, marginTop: 2 },

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
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 10, marginTop: 12 },
  genBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 8 },
  genBtnText: { color: Colors.white, fontWeight: '800', fontSize: 13 },

  gHead: { backgroundColor: '#0f2d4a', paddingVertical: 9, paddingHorizontal: 4, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  gHeadText: { color: Colors.white, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.2 },
  th: { backgroundColor: Colors.navy, paddingVertical: 6, paddingHorizontal: 5, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  thText: { color: Colors.white, fontSize: 8.5, fontWeight: '800', textTransform: 'uppercase', textAlign: 'center', lineHeight: 11 },
  // v100c — indicador de orden: ▽ tenue (ordenable) / ▲▼ blanco (orden activo).
  thSort: { color: 'rgba(255,255,255,0.4)', fontSize: 7, lineHeight: 9, marginTop: 1 },
  thSortOn: { color: Colors.white, fontSize: 8, lineHeight: 10, fontWeight: '800' },
  td: { paddingVertical: 6, paddingHorizontal: 5, borderTopWidth: 1, borderTopColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  tdText: { fontSize: 11, color: Colors.textPrimary, textAlign: 'center' },
  tdFoot: { paddingVertical: 7, paddingHorizontal: 5, borderTopWidth: 2, borderTopColor: Colors.navy, justifyContent: 'center', alignItems: 'center' },
  tdFootText: { fontSize: 10, fontWeight: '800', color: Colors.navy, textAlign: 'center' },
});
