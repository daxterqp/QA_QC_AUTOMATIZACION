/**
 * SummaryTablesScreen (móvil) — Tablas Resumen (Fase 2+3).
 * Selector de tipo de ensayo → tabla consolidada (1 fila por ensayo) con
 * columnas fijas + columnas de la ficha, encabezados agrupados, filtros, KPIs
 * y export CSV. Solo LEE `summary_rows` local (construida al guardar ensayos).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Q } from '@nozbe/watermelondb';
import AppHeader from '@components/AppHeader';
import CalendarPicker from '@components/CalendarPicker';
import { Colors, Radius } from '../theme/colors';
import { summaryRowsCollection, protocolTemplatesCollection, protocolTemplateItemsCollection } from '@db/index';
import { pullSummaryRows, backfillLocalSummary } from '@services/SummaryRowService';
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

type Props = NativeStackScreenProps<RootStackParamList, 'SummaryTables'>;

interface Row {
  id: string; protocolId: string; templateId: string | null;
  protocolCode: string | null; protocolNumber: string | null; ensayoDate: string | null;
  sectorId: string | null; sectorName: string | null;
  locationId: string | null; locationName: string | null;
  status: string | null; values: Record<string, unknown>;
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
      // v43.3 — Mostrar la MISMA cantidad de decimales que la ficha (formatComputed con
      // los decimales de la celda). Antes se mostraba el número crudo (15+ decimales).
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
const fmt = (n: number | null) => n == null ? '' : (Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(2));
// v43.3 — Altura de fila FIJA: la 1ª columna congelada y el cuerpo deben tener filas
// de idéntica altura, si no se desincronizan al hacer scroll vertical (la estructura
// "se rompe"). Con altura fija ambos overlays quedan siempre alineados.
const ROW_H = 46;

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
  const { projectId, projectName } = route.params;
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
  const [firstColKey, setFirstColKey] = useState('ensayo_date'); // 1ª columna (congelada)
  const [showFirstColModal, setShowFirstColModal] = useState(false);
  const [firstColTemp, setFirstColTemp] = useState('ensayo_date');
  const [showChart, setShowChart] = useState(false);
  const [chart, setChart] = useState<{ yKey: string; trend: 'linear' | 'quad' | 'cubic' } | null>(null);
  const [chartForm, setChartForm] = useState<{ yKey: string; trend: 'linear' | 'quad' | 'cubic' }>({ yKey: '', trend: 'linear' });

  // Estructura de la ficha (para encabezados limpios/ordenados).
  useEffect(() => {
    if (!templateId) { setTplItems([]); return; }
    protocolTemplateItemsCollection.query(Q.where('template_id', templateId), Q.sortBy('created_at', Q.asc)).fetch()
      .then((items: any[]) => setTplItems(items.map(it => ({ id: it.id, partida_item: it.partidaItem ?? null, item_description: it.itemDescription ?? '', validation_method: it.validationMethod ?? null, section: it.section ?? null }))))
      .catch(() => setTplItems([]));
  }, [templateId]);

  // Config de medidas (KPIs) GUARDADA por tipo de ensayo.
  useEffect(() => {
    if (!templateId) return;
    AsyncStorage.getItem(`summary_measures_${templateId}`).then(raw => { try { setMeasures(raw ? JSON.parse(raw) : ['avg']); } catch { setMeasures(['avg']); } });
  }, [templateId]);
  useEffect(() => {
    if (!templateId) return;
    AsyncStorage.setItem(`summary_measures_${templateId}`, JSON.stringify(measures)).catch(() => {});
  }, [measures, templateId]);

  // Backfill local solo 1 vez por montaje (los protocolos viejos sin fila).
  const didBackfill = useRef(false);
  // Freeze (Excel): overlays absolutos sincronizados por scroll.
  const headerRef = useRef<ScrollView>(null);   // encabezado congelado (mueve en X)
  const firstColRef = useRef<ScrollView>(null);  // 1ª columna congelada (mueve en Y)
  const [headerH, setHeaderH] = useState(0);

  const load = useCallback(async () => {
    // Orquestación con la nube: backfill (1ª vez) + pull incremental → luego leer local.
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

  const columns = useMemo<SummaryColumn[]>(() => {
    const cfg = templateId ? configByTpl[templateId] : null;
    let data: SummaryColumn[];
    if (cfg?.columns?.length) data = cfg.columns;
    else if (tplItems.length) data = buildAutoColumns(tplItems);
    else data = dynamicColumnsFromRows(rows.map(r => ({ values_json: r.values })));
    const base = [...FIXED_SUMMARY_COLUMNS, ...data];
    // 1ª columna seleccionable: la elegida va primero, Fecha segunda, resto igual.
    if (firstColKey && firstColKey !== 'ensayo_date') {
      const sel = base.find(c => c.key === firstColKey);
      if (sel) {
        const fecha = base.find(c => c.key === 'ensayo_date');
        const rest = base.filter(c => c.key !== firstColKey && c.key !== 'ensayo_date');
        return [sel, ...(fecha ? [fecha] : []), ...rest];
      }
    }
    return base;
  }, [templateId, configByTpl, tplItems, rows, firstColKey]);
  const dataCols = useMemo(() => columns.filter(c => !FIXED_SUMMARY_COLUMNS.some(f => f.key === c.key)), [columns]);
  const groups = useMemo(() => groupSpans(columns), [columns]);
  const hasGroups = groups.some(g => g.title);
  // Ancho JUSTO por columna (según el contenido más largo), no fijo.
  const colWidth = useMemo(() => {
    const w: Record<string, number> = {};
    for (const c of columns) {
      // El ENCABEZADO se reparte en 2 líneas → no necesita el ancho de todo el
      // título; basta la palabra más larga (o la mitad del texto). Así ocupa menos.
      const longestWord = c.label.split(/\s+/).reduce((m, s) => Math.max(m, s.length), 0);
      const labelChars = Math.max(longestWord, Math.ceil(c.label.length / 2));
      // Los DATOS no deben cortarse: usamos su largo completo.
      let dataChars = 0;
      for (const r of filtered) { const v = cellValue(r, c); if (v.length > dataChars) dataChars = v.length; }
      const maxLen = Math.max(labelChars, dataChars);
      w[c.key] = Math.max(52, Math.min(170, 16 + maxLen * 6.6));
    }
    return w;
  }, [columns, filtered]);
  const widthOf = (c: SummaryColumn) => colWidth[c.key] ?? 90;
  // Ancho de cada grupo paraguas = suma de sus columnas.
  const groupWidths = useMemo(() => {
    const out: number[] = []; let idx = 0;
    for (const g of groups) { let sum = 0; for (let k = 0; k < g.span; k++) sum += widthOf(columns[idx + k]); out.push(sum); idx += g.span; }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, columns, colWidth]);
  const yOptions = useMemo(() => chartYOptions(dataCols), [dataCols]);
  const chartData = useMemo(() => {
    if (!chart) return null;
    return filtered
      .map(r => ({ x: r.ensayoDate ? new Date(r.ensayoDate + 'T12:00:00').getTime() : NaN, y: num(r.values[chart.yKey]), code: r.protocolCode ?? '' }))
      .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x);
  }, [chart, filtered]);

  const toggleStatus = (k: string) => setStatusFilter(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  async function exportCsv() {
    try {
      const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
      const header = columns.map(c => esc(c.label)).join(',');
      const lines = filtered.map(r => columns.map(c => esc(cellValue(r, c))).join(','));
      const csv = '﻿' + [header, ...lines].join('\r\n'); // UTF-8 con BOM
      const uri = `${FileSystem.cacheDirectory}resumen_${(templateId && labelByTpl[templateId]) || 'ensayo'}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: t('summary.exportDialogTitle') });
      else Alert.alert(t('summary.csvGenerated'), uri);
    } catch (e) {
      Alert.alert(t('common.error'), t('summary.exportError') + String(e));
    }
  }

  // ── Render reutilizable de celdas (cuerpo + overlays congelados) ───────────
  const firstColW = columns.length ? widthOf(columns[0]) : 90;
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
      <AppHeader title={t('summary.title')} subtitle={projectName} onBack={() => navigation.goBack()} />

      {!templateId ? (
        <ScrollView contentContainerStyle={styles.list}>
          {templates.length === 0 ? (
            <View style={styles.empty}><Ionicons name="grid-outline" size={36} color={Colors.textMuted} /><Text style={styles.emptyText}>{t('summary.emptyNoData')}</Text></View>
          ) : (
            <>
              <Text style={styles.hint}>{t('summary.pickTestType')}</Text>
              {templates.map(t => (
                <TouchableOpacity key={t.id} style={styles.tplCard} onPress={() => setTemplateId(t.id)} activeOpacity={0.8}>
                  <View style={styles.tplIcon}><Ionicons name="grid" size={20} color={Colors.secondary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tplTitle}>{t.label}</Text>
                    <Text style={styles.tplSub}>{tx('summary.testCount', { count: t.count, plural: t.count === 1 ? '' : 's' })}{configByTpl[t.id] ? tx('summary.customConfig') : tx('summary.autoColumns')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Barra superior */}
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => setTemplateId(null)} style={styles.backChip}><Ionicons name="chevron-back" size={14} color={Colors.primary} /><Text style={styles.backChipText}>{t('summary.types')}</Text></TouchableOpacity>
            <Text style={styles.topTitle} numberOfLines={1}>{labelByTpl[templateId] ?? ''}</Text>
            <TouchableOpacity onPress={() => { setChartForm({ yKey: yOptions[0]?.key ?? '', trend: 'linear' }); setShowChart(true); }} disabled={yOptions.length === 0} style={[styles.chartBtn, yOptions.length === 0 && { opacity: 0.4 }]}>
              <Ionicons name="stats-chart-outline" size={14} color={Colors.primary} /><Text style={styles.chartBtnText}>{t('summary.chart')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={exportCsv} disabled={filtered.length === 0} style={[styles.exportBtn, filtered.length === 0 && { opacity: 0.4 }]}>
              <Ionicons name="download-outline" size={14} color={Colors.white} /><Text style={styles.exportText}>{t('summary.csv')}</Text>
            </TouchableOpacity>
          </View>

          {/* Filtros */}
          <View style={styles.filters}>
            <Text style={styles.filterLabel}>{t('summary.status')} · {filtered.length}/{rows.length}</Text>
            <View style={styles.chipRow}>
              {[['APPROVED', t('summary.statusApproved'), '#1e8e3e'], ['SUBMITTED', t('summary.statusInReview'), '#394e7d'], ['REJECTED', t('summary.statusRejected'), '#d93025']].map(([k, l, col]) => {
                const on = statusFilter.has(k);
                return <TouchableOpacity key={k} onPress={() => toggleStatus(k)} style={[styles.ghost, { borderColor: on ? col : Colors.border }]}><Text style={[styles.ghostText, { color: on ? col : Colors.textMuted }]}>{l}</Text></TouchableOpacity>;
              })}
            </View>
            {worksBySectors && (
              <>
                <Text style={styles.filterLabel}>{t('summary.sector')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  <Chip label={t('summary.all')} on={!sectorFilter} onPress={() => setSectorFilter('')} />
                  {sectorOptions.map(o => <Chip key={o.id} label={o.label} on={sectorFilter === o.id} onPress={() => setSectorFilter(o.id)} />)}
                </ScrollView>
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
            {/* 1ª columna congelada: modal para elegir cuál va primero. */}
            <Text style={styles.filterLabel}>{t('summary.firstColLabel')}</Text>
            <TouchableOpacity style={styles.selectField} onPress={() => { setFirstColTemp(firstColKey); setShowFirstColModal(true); }}>
              <Text style={styles.selectFieldValue} numberOfLines={1}>{columns.find(c => c.key === firstColKey)?.label ?? t('summary.dateColFallback')}</Text>
              <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {filtered.length === 0 ? (
            <ScrollView style={{ flex: 1 }}><View style={styles.empty}><Text style={styles.emptyText}>{t('summary.noneMatch')}</Text></View></ScrollView>
          ) : (
            <View style={{ flex: 1 }}>
              {/* CUERPO: scroll vertical + horizontal; sincroniza los overlays. */}
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}
                scrollEventThrottle={16}
                onScroll={e => firstColRef.current?.scrollTo({ y: e.nativeEvent.contentOffset.y, animated: false })}>
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
                <View style={styles.measureBar}>
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
                {/* v42e — El gráfico generado se muestra en un Modal (abajo), NO embebido
                    aquí: como overlay, los overlays absolutos de la 1ª columna/header
                    congelados (bottom:0) lo cubrían y la columna quedaba "pegada" encima. */}
              </ScrollView>

              {/* OVERLAY: encabezado CONGELADO (columnas 1..n), refleja el scroll horizontal. */}
              {headerH > 0 && (
                <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: firstColW, right: 0, height: headerH }}>
                  <ScrollView horizontal ref={headerRef} scrollEnabled={false} showsHorizontalScrollIndicator={false}>
                    <View>
                      {hasGroups && renderGroupRow(columns.slice(1))}
                      {renderNameRow(columns.slice(1))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* OVERLAY: PRIMERA columna CONGELADA, refleja el scroll vertical. */}
              {headerH > 0 && (
                <View pointerEvents="none" style={{ position: 'absolute', top: headerH, left: 0, width: firstColW, bottom: 0 }}>
                  <ScrollView ref={firstColRef} scrollEnabled={false} showsVerticalScrollIndicator={false}>
                    {filtered.map((r, ri) => (
                      <View key={r.id} style={{ flexDirection: 'row', height: ROW_H, backgroundColor: rowBg(ri) }}>{renderRowCells(r, [columns[0]])}</View>
                    ))}
                    {measures.map((op, mi) => (
                      <View key={op} style={{ flexDirection: 'row', height: ROW_H, backgroundColor: footerBg(mi), borderTopWidth: mi === 0 ? 2 : 1, borderTopColor: mi === 0 ? Colors.navy : '#dbe2ec' }}>{renderFooterCells(op, [columns[0]])}</View>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* CORNER: encabezado de la 1ª columna (cruce fijo). */}
              {headerH > 0 && (
                <View style={{ position: 'absolute', top: 0, left: 0, width: firstColW, height: headerH, backgroundColor: Colors.navy }}>
                  {hasGroups && <View style={[styles.gHead, { width: firstColW }]}><Text style={styles.gHeadText}> </Text></View>}
                  <View style={[styles.th, { width: firstColW, flex: 1 }]}><Text style={styles.thText} numberOfLines={2}>{columns[0]?.label ?? ''}</Text></View>
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

      {/* Modal generar gráfico */}
      <Modal visible={showChart} transparent animationType="fade" onRequestClose={() => setShowChart(false)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowChart(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('summary.genScatterTitle')}</Text>
            <Text style={styles.chartFieldLabel}>{t('summary.axisX')}</Text>
            <View style={styles.chartFixedField}><Text style={styles.chartFixedText}>{t('summary.axisXFixed')}</Text></View>
            <Text style={styles.chartFieldLabel}>{t('summary.axisYParam')}</Text>
            <ScrollView style={{ maxHeight: 180 }}>
              {yOptions.map(o => {
                const on = chartForm.yKey === o.key;
                return <TouchableOpacity key={o.key} style={[styles.dateRow, on && { backgroundColor: Colors.primary + '12' }]} onPress={() => setChartForm(f => ({ ...f, yKey: o.key }))}>
                  <Text style={[styles.dateRowText, on && { color: Colors.primary, fontWeight: '800' }]}>{o.label}</Text></TouchableOpacity>;
              })}
            </ScrollView>
            <Text style={styles.chartFieldLabel}>{t('summary.trendLine')}</Text>
            <View style={styles.chipRow}>
              {([['linear', t('summary.trendLinear')], ['quad', t('summary.trendQuad')], ['cubic', t('summary.trendCubic')]] as [('linear' | 'quad' | 'cubic'), string][]).map(([k, l]) => (
                <TouchableOpacity key={k} onPress={() => setChartForm(f => ({ ...f, trend: k }))} style={[styles.choice, chartForm.trend === k && styles.choiceOn]}>
                  <Text style={[styles.choiceText, chartForm.trend === k && styles.choiceTextOn]}>{l}</Text></TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <TouchableOpacity onPress={() => setShowChart(false)}><Text style={{ color: Colors.textSecondary, fontWeight: '700', padding: 8 }}>{t('summary.cancel')}</Text></TouchableOpacity>
              <TouchableOpacity disabled={!chartForm.yKey} onPress={() => { setChart({ yKey: chartForm.yKey, trend: chartForm.trend }); setShowChart(false); }} style={[styles.genBtn, !chartForm.yKey && { opacity: 0.4 }]}>
                <Text style={styles.genBtnText}>{t('summary.generate')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* v42e — Modal con el gráfico generado (antes embebido bajo la tabla, donde
          los overlays congelados lo tapaban). Aquí va por encima de todo. */}
      <Modal visible={!!chart && !!chartData && chartData.length > 0} transparent animationType="fade" onRequestClose={() => setChart(null)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setChart(null)} />
          <View style={styles.modalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={styles.chartTitle} numberOfLines={1}>{yOptions.find(o => o.key === chart?.yKey)?.label}{t('summary.vsTime')}</Text>
              <TouchableOpacity onPress={() => setChart(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close" size={20} color={Colors.textMuted} /></TouchableOpacity>
            </View>
            {chart && chartData && chartData.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <ScatterChartRN data={chartData} yLabel={yOptions.find(o => o.key === chart.yKey)?.label ?? t('summary.value')} trend={chart.trend} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal: elegir 1ª columna (fija) */}
      <Modal visible={showFirstColModal} transparent animationType="fade" onRequestClose={() => setShowFirstColModal(false)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowFirstColModal(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('summary.firstColModalTitle')}</Text>
            <ScrollView style={{ maxHeight: 340 }}>
              {columns.map(c => {
                const on = firstColTemp === c.key;
                return (
                  <TouchableOpacity key={c.key} style={[styles.dateRow, on && { backgroundColor: Colors.primary + '12' }]} onPress={() => setFirstColTemp(c.key)}>
                    <Text style={[styles.dateRowText, on && { color: Colors.primary, fontWeight: '800' }]}>{c.group ? `${c.group} · ${c.label}` : c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <TouchableOpacity onPress={() => setShowFirstColModal(false)}><Text style={{ color: Colors.textSecondary, fontWeight: '700', padding: 8 }}>{t('summary.cancel')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { setFirstColKey(firstColTemp); setShowFirstColModal(false); }} style={styles.genBtn}><Text style={styles.genBtnText}>{t('summary.accept')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
  if (coef) for (let i = 0; i <= 50; i++) { const t = i / 50; trendPts.push(`${sx(minX + t * dx).toFixed(1)},${sy(polyval(coef, t)).toFixed(1)}`); }
  const fmtD = (t: number) => { const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`; };
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

  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backChip: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backChipText: { color: Colors.primary, fontWeight: '800', fontSize: 12 },
  topTitle: { flex: 1, fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 6 },
  exportText: { color: Colors.white, fontWeight: '800', fontSize: 12 },

  filters: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  filterLabel: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  ghost: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.white },
  ghostText: { fontSize: 11, fontWeight: '800' },
  choice: { borderWidth: 1, borderColor: Colors.border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.white },
  choiceOn: { borderColor: Colors.primary, backgroundColor: Colors.primary + '12' },
  choiceText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', maxWidth: 160 },
  choiceTextOn: { color: Colors.primary, fontWeight: '800' },
  dateField: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: Colors.white },
  selectField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 9, backgroundColor: Colors.white },
  selectFieldValue: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  dateFieldLabel: { fontSize: 9, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase' },
  dateFieldValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginTop: 2 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14, width: '100%', maxWidth: 360 },
  modalTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  dateRow: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dateRowText: { fontSize: 14, color: Colors.textPrimary },
  chartBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 5 },
  chartBtnText: { color: Colors.primary, fontWeight: '800', fontSize: 12 },
  measureBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 10, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border },
  measureChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.white },
  measureChipOn: { borderColor: Colors.primary, backgroundColor: Colors.primary + '10' },
  measureChipText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  chartCard: { margin: 10, padding: 12, backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },
  chartTitle: { flex: 1, fontSize: 13, fontWeight: '800', color: Colors.navy },
  chartFieldLabel: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', marginTop: 8, marginBottom: 3 },
  chartFixedField: { backgroundColor: Colors.surface, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, paddingVertical: 8 },
  chartFixedText: { fontSize: 13, color: Colors.textMuted },
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
