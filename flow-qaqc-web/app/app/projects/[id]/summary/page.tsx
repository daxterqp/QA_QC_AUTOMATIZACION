'use client';

/**
 * Tablas Resumen (web) — Fase 2+3 (avanzada).
 * Selector de tipo → tabla consolidada con encabezados limpios/jerárquicos
 * (paraguas), ORDEN de la ficha, columnas fijas + "Realizado/Aprobado por",
 * filtros (rango de fechas estándar), KPIs personalizables (+ Nueva medida),
 * gráfico de dispersión con línea de tendencia, y export CSV.
 */
import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Table2, Download, ChevronRight, X as XIcon, Loader2, Plus, LineChart, Settings, Filter, Trash2, GripVertical, HelpCircle, ArrowLeft, Share2 } from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useProjects } from '@hooks/useProjects';
import { useSummaryTemplates, useSummaryRows, useTemplateItems, type SummaryRowData } from '@hooks/useSummaryRows';
import { FIXED_SUMMARY_COLUMNS, dynamicColumnsFromRows, summaryStatus, type SummaryColumn } from '@lib/summaryTable';
import { buildAutoColumns, chartYOptions } from '@lib/summaryColumns';
import { useI18n } from '@lib/i18n';
import { usePageRefresh } from '@hooks/usePageRefresh';
import { createClient } from '@lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
// v100l — Espejo EXACTO de src/utils/chartMath.ts: toda la matemática y la paleta
// de los gráficos es compartida con el móvil para que no puedan divergir.
import {
  type Trend, type Join, type ChartCfg,
  AXIS_GRAY, VGRID_GRAY, C_MAX, C_MIN, C_TREND, C_POINT, DAY_MS, V_DIV,
  niceYRange, niceTicks, ticksWithStep, polyfit, polyval, equationStr, rSquared,
  smoothPath, describe, tickDecimals, fmtShortDate, parseChartsConfig, mergeChartsIntoConfig,
} from '@lib/chartMath';

const supabase = createClient();

const STATUS_FILTERS = [
  { key: 'APPROVED', labelKey: 'webDash.approved', color: '#1e8e3e' },
  { key: 'SUBMITTED', labelKey: 'webDash.statusInReview', color: '#394e7d' },
  { key: 'REJECTED', labelKey: 'webDash.rejected', color: '#d93025' },
];
type MeasureOp = 'avg' | 'std' | 'max' | 'min';
const MEASURE_LABEL_KEYS: Record<MeasureOp, string> = { avg: 'webDash.measureAvg', std: 'webDash.measureStd', max: 'webDash.measureMax', min: 'webDash.measureMin' };

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}
function measure(values: number[], op: MeasureOp): number | null {
  const ns = values.filter(Number.isFinite);
  if (ns.length === 0) return null;
  if (op === 'max') return Math.max(...ns);
  if (op === 'min') return Math.min(...ns);
  const mean = ns.reduce((a, b) => a + b, 0) / ns.length;
  if (op === 'avg') return mean;
  // std muestral
  if (ns.length < 2) return 0;
  const variance = ns.reduce((a, b) => a + (b - mean) ** 2, 0) / (ns.length - 1);
  return Math.sqrt(variance);
}
function fmt(n: number | null): string {
  if (n == null) return '';
  return Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(2);
}
function cellValue(row: SummaryRowData, col: SummaryColumn): string {
  switch (col.key) {
    case 'ensayo_date': return row.ensayo_date ?? '';
    case 'protocol_code': return row.protocol_code ?? row.protocol_number ?? '';
    case 'project_name': return String(row.values_json?.project_name ?? '');
    case 'sector_name': return row.sector_name ?? '';
    case 'location_name': return row.location_name ?? '';
    case 'realizado_por': return String(row.values_json?.realizado_por ?? '');
    case 'aprobado_por': return String(row.values_json?.aprobado_por ?? '');
    case 'estado': return summaryStatus(String(row.values_json?.estado ?? row.status ?? '')).label;
    case 'fecha_aprobacion': return String(row.values_json?.fecha_aprobacion ?? '');
    default: { const v = row.values_json?.[col.key]; return v == null ? '' : String(v); }
  }
}
function groupSpans(cols: SummaryColumn[]): { title: string | null; span: number }[] {
  const out: { title: string | null; span: number }[] = [];
  for (const c of cols) {
    const g = c.group ?? null;
    const last = out[out.length - 1];
    if (last && last.title === g) last.span++; else out.push({ title: g, span: 1 });
  }
  return out;
}

export default function SummaryTablesPage() {
  const { t } = useI18n();
  return <Suspense fallback={<div className="p-8 text-sm text-muted">{t('common.loading')}</div>}><SummaryTablesInner /></Suspense>;
}

const genId = () => `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

function SummaryTablesInner() {
  const { refreshing, onRefresh } = usePageRefresh();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: projects = [] } = useProjects();
  const project = projects.find(p => p.id === projectId);
  const { data: templates = [], isLoading: loadingTpl } = useSummaryTemplates(projectId);
  // El tipo seleccionado vive en la URL (?t=) → al volver del ensayo se restaura la tabla.
  const templateId = searchParams.get('t') || null;
  const setTemplateId = (id: string | null) => router.push(`/app/projects/${projectId}/summary${id ? `?t=${id}` : ''}`);
  const selectedTpl = templates.find(t => t.id === templateId) ?? null;
  const { data: rows = [], isLoading: loadingRows } = useSummaryRows(projectId, templateId);
  const { data: tplItems = [] } = useTemplateItems(templateId);

  // Filtros
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [locFilter, setLocFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(['APPROVED', 'SUBMITTED', 'REJECTED']));

  // KPIs / medidas (filas de estadística). Se GUARDA por tipo de ensayo.
  const [measures, setMeasures] = useState<MeasureOp[]>(['avg']);
  const [addingMeasure, setAddingMeasure] = useState(false);
  useEffect(() => {
    if (!templateId) return;
    try { const raw = localStorage.getItem(`summary_measures_${templateId}`); setMeasures(raw ? JSON.parse(raw) : ['avg']); } catch { setMeasures(['avg']); }
  }, [templateId]);
  useEffect(() => {
    if (!templateId) return;
    try { localStorage.setItem(`summary_measures_${templateId}`, JSON.stringify(measures)); } catch { /* cuota */ }
  }, [measures, templateId]);

  // v100m — Gráficos del dashboard: viven EN LA NUBE dentro de
  // protocol_templates.summary_config_json (clave `charts`), no en el navegador.
  // Así todos los usuarios (PC y móvil) ven el MISMO dashboard.
  // Migración suave: si la nube aún no tiene gráficos pero este navegador tenía
  // los suyos en localStorage, se suben una vez y se limpia el local.
  const [charts, setCharts] = useState<ChartCfg[]>([]);
  useEffect(() => {
    if (!templateId) { setCharts([]); return; }
    // ⚠ Espera a que la plantilla esté CARGADA: si migráramos el legacy antes,
    // el push pisaría los gráficos que ya viven en la nube.
    if (!selectedTpl) return;
    const cloud = parseChartsConfig(selectedTpl.rawConfig);
    if (cloud.length > 0) { setCharts(cloud); return; }
    let legacy: ChartCfg[] = [];
    try { const raw = localStorage.getItem(`summary_charts_${templateId}`); legacy = raw ? JSON.parse(raw) : []; } catch { legacy = []; }
    setCharts(legacy);
    if (legacy.length > 0) {
      pushChartsToCloud(templateId, legacy);
      try { localStorage.removeItem(`summary_charts_${templateId}`); } catch { /* ignore */ }
    }
    // selectedTpl?.rawConfig entra como dependencia para recargar al llegar los datos
  }, [templateId, selectedTpl?.rawConfig]);

  /** Persiste los gráficos en la nube (summary_config_json.charts) sin pisar columns. */
  const pushChartsToCloud = async (tplId: string, next: ChartCfg[]) => {
    const merged = mergeChartsIntoConfig(selectedTpl?.rawConfig, next);
    const { error } = await supabase.from('protocol_templates').update({ summary_config_json: merged }).eq('id', tplId);
    if (error) { console.warn('[charts push] no se pudo guardar en la nube:', error.message); return; }
    queryClient.invalidateQueries({ queryKey: ['summary-template-labels', projectId] });
  };
  /** Cambia los gráficos en pantalla y los guarda en la nube. */
  const updateCharts = (updater: (prev: ChartCfg[]) => ChartCfg[]) => {
    setCharts(prev => {
      const next = updater(prev);
      if (templateId) pushChartsToCloud(templateId, next);
      return next;
    });
  };

  // Modales
  const [showFilters, setShowFilters] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Form "agregar gráfico" (dentro del modal ⚙)
  const [addY, setAddY] = useState('');
  const [addTrend, setAddTrend] = useState<Trend>('linear');
  // v100l — eje X seleccionable ('' = Tiempo) + unión de puntos (espejo del móvil)
  const [addX, setAddX] = useState('');
  const [addJoin, setAddJoin] = useState<Join>('none');
  // v100l — config por gráfico (equivalente al modal "Ejes del gráfico" del móvil)
  const [axisChart, setAxisChart] = useState<ChartCfg | null>(null);
  const [ax, setAx] = useState({
    yMin: '', yMax: '', xMin: '', xMax: '', vxMin: '', vxMax: '', yStep: '', xStep: '',
    limMin: '', limMax: '', trend: 'linear' as Trend, join: 'none' as Join,
    vert: false, showEq: false, showStats: true, showLegend: false, showVGrid: true,
  });
  const openAxisCfg = (ch: ChartCfg) => {
    setAxisChart(ch);
    const s = (v: number | null | undefined) => v != null ? String(v) : '';
    setAx({
      yMin: s(ch.yMin), yMax: s(ch.yMax), xMin: ch.xMin ?? '', xMax: ch.xMax ?? '',
      vxMin: s(ch.vxMin), vxMax: s(ch.vxMax), yStep: s(ch.yStep), xStep: s(ch.xStep),
      limMin: s(ch.limMin), limMax: s(ch.limMax), trend: ch.trend ?? 'linear', join: ch.join ?? 'none',
      vert: !!ch.xVertical, showEq: !!ch.showEq, showStats: ch.showStats !== false,
      showLegend: !!ch.showLegend, showVGrid: ch.showVGrid !== false,
    });
  };
  const saveAxisCfg = () => {
    if (!axisChart) return;
    const nOrNull = (v: string) => { const x = Number(String(v).trim().replace(',', '.')); return v.trim() !== '' && Number.isFinite(x) ? x : null; };
    updateCharts(prev => prev.map(c => c.id === axisChart.id ? {
      ...c, yMin: nOrNull(ax.yMin), yMax: nOrNull(ax.yMax), xMin: ax.xMin || null, xMax: ax.xMax || null,
      vxMin: nOrNull(ax.vxMin), vxMax: nOrNull(ax.vxMax), yStep: nOrNull(ax.yStep), xStep: nOrNull(ax.xStep),
      limMin: nOrNull(ax.limMin), limMax: nOrNull(ax.limMax), trend: ax.trend, join: ax.join,
      xVertical: ax.vert, showEq: ax.showEq, showStats: ax.showStats, showLegend: ax.showLegend, showVGrid: ax.showVGrid,
    } : c));
    setAxisChart(null);
  };
  // v100l — Compartir/descargar el gráfico como PNG (equivalente al captureRef del móvil).
  const shareChart = async (chartId: string, title: string) => {
    const svg = document.getElementById(`chart-svg-${chartId}`) as SVGSVGElement | null;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    await new Promise(res => { img.onload = res; img.onerror = res; });
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = img.width * scale; canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${title.replace(/[^\w\s-]/g, '').trim() || 'grafico'}.png`; a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };
  // Drag-reorder (HTML5)
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const worksBySectors = rows.some(r => r.sector_id);
  const worksByLocations = rows.some(r => r.location_id);
  const sectorOptions = useMemo(() => { const m = new Map<string, string>(); rows.forEach(r => { if (r.sector_id) m.set(r.sector_id, r.sector_name ?? r.sector_id); }); return Array.from(m, ([id, label]) => ({ id, label })); }, [rows]);
  const locOptions = useMemo(() => { const m = new Map<string, string>(); rows.forEach(r => { if (r.location_id) m.set(r.location_id, r.location_name ?? r.location_id); }); return Array.from(m, ([id, label]) => ({ id, label })); }, [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (!statusFilter.has(r.status ?? '')) return false;
    if (sectorFilter && r.sector_id !== sectorFilter) return false;
    if (locFilter && r.location_id !== locFilter) return false;
    if (dateFrom || dateTo) { const d = r.ensayo_date ?? ''; if (!d) return false; if (dateFrom && d < dateFrom) return false; if (dateTo && d > dateTo) return false; }
    return true;
  }), [rows, statusFilter, sectorFilter, locFilter, dateFrom, dateTo]);

  // Columnas: config de plantilla → auto desde la ficha (ordenado/jerárquico) → fallback datos.
  // (Sin reordenar por "1ª columna": el freeze de la 1ª columna se eliminó por errores visuales.)
  const columns = useMemo<SummaryColumn[]>(() => {
    let data: SummaryColumn[];
    if (selectedTpl?.config?.columns?.length) data = selectedTpl.config.columns;
    else if (tplItems.length) data = buildAutoColumns(tplItems);
    else data = dynamicColumnsFromRows(rows);
    return [...FIXED_SUMMARY_COLUMNS, ...data];
  }, [selectedTpl, tplItems, rows]);
  const dataCols = useMemo(() => columns.filter(c => !FIXED_SUMMARY_COLUMNS.some(f => f.key === c.key)), [columns]);
  const groups = useMemo(() => groupSpans(columns), [columns]);
  const hasGroups = groups.some(g => g.title);
  const yOptions = useMemo(() => chartYOptions(dataCols), [dataCols]);
  const yLabelOf = (yKey: string) => yOptions.find(o => o.key === yKey)?.label ?? t('webDash.value');

  const hasActiveFilters = !!dateFrom || !!dateTo || !!sectorFilter || !!locFilter || statusFilter.size !== 3;
  const activeFilterCount = (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (sectorFilter ? 1 : 0) + (locFilter ? 1 : 0) + (statusFilter.size !== 3 ? 1 : 0);
  const clearFilters = () => { setDateFrom(''); setDateTo(''); setSectorFilter(''); setLocFilter(''); setStatusFilter(new Set(['APPROVED', 'SUBMITTED', 'REJECTED'])); };
  const toggleStatus = (k: string) => setStatusFilter(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  function exportCsv() {
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const header = columns.map(c => esc(c.group ? `${c.group} - ${c.label}` : c.label)).join(',');
    const lines = filtered.map(r => columns.map(c => esc(cellValue(r, c))).join(','));
    const csv = '﻿' + [header, ...lines].join('\r\n'); // UTF-8 con BOM
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `dashboard_${selectedTpl?.id_protocolo ?? 'ensayo'}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // Puntos de un gráfico. v100l — el eje X puede ser el TIEMPO (default) o
  // cualquier variable numérica (ch.xKey); siempre ordenados por X para que la
  // unión de puntos tenga sentido (espejo del móvil).
  const buildPts = (ch: ChartCfg) => {
    const xk = ch.xKey || null;
    return filtered
      .filter(r => xk ? true : (!ch.xMin || (r.ensayo_date ?? '') >= ch.xMin) && (!ch.xMax || (r.ensayo_date ?? '') <= ch.xMax))
      .map(r => ({
        x: xk ? num(r.values_json?.[xk]) : (r.ensayo_date ? new Date(r.ensayo_date + 'T12:00:00').getTime() : NaN),
        y: num(r.values_json?.[ch.yKey]), code: r.protocol_code ?? '',
      }))
      .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x);
  };
  const decimalsOf = (key: string) => dataCols.find(c => c.key === key)?.decimals;

  // Reordenar gráficos al soltar (drag HTML5).
  const dropChart = (to: number) => {
    updateCharts(prev => {
      if (dragIdx === null || dragIdx === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDragIdx(null);
  };

  // Botones de acción del header condensado (tutorial · CSV · filtros · ⚙).
  const HeaderActions = (
    <div className="ml-auto flex items-center gap-1">
      <button onClick={() => setShowHelp(true)} title={t('webDash.tutorial')} aria-label={t('webDash.tutorial')}
        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/90"><HelpCircle size={18} /></button>
      <button onClick={exportCsv} disabled={filtered.length === 0} title={t('webDash.exportCsv')} aria-label={t('webDash.exportCsv')}
        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/90 disabled:opacity-40"><Download size={18} /></button>
      <button onClick={() => setShowFilters(true)} title={t('webDash.openFilters')} aria-label={t('webDash.openFilters')}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/90"><Filter size={18} />
        {activeFilterCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-secondary text-[9px] font-bold flex items-center justify-center text-white">{activeFilterCount}</span>}</button>
      <button onClick={() => setShowCharts(true)} title={t('webDash.chartsConfig')} aria-label={t('webDash.chartsConfig')}
        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/90"><Settings size={18} /></button>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      {/* SELECTOR (tipos de ensayo): header normal. DASHBOARD: header condensado a 1 línea. */}
      {!templateId ? (
        <PageHeader onRefresh={onRefresh} refreshing={refreshing} title={t('webDash.summaryTitle')} subtitle={project?.name}
          crumbs={[{ label: t('webDash.crumbProjects'), href: '/app/projects' }, { label: project?.name ?? '…', href: `/app/projects/${projectId}/menu` }, { label: t('webDash.summaryTitle') }]} />
      ) : (
        <div className="sticky top-0 z-40 bg-navy text-white flex items-center gap-2 px-3 h-12 shadow-md">
          <button onClick={() => setTemplateId(null)} aria-label={t('webDash.backToTestTypes')}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10"><ArrowLeft size={20} /></button>
          <span className="text-base font-extrabold tracking-wide">{t('webDash.summaryTitle')}</span>
          {HeaderActions}
        </div>
      )}

      <div className="flex-1 w-full max-w-[1400px] mx-auto px-4 py-5 flex flex-col gap-4">
        {/* Selector de tipo */}
        {!templateId && (
          <>
            <p className="text-sm text-textSecondary">{t('webDash.choseTestType')}</p>
            {loadingTpl ? <div className="flex items-center gap-2 text-muted text-sm"><Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}</div>
              : templates.length === 0 ? <div className="bg-white rounded-xl border border-border p-8 text-center text-sm text-muted">{t('webDash.noSummaryData')} <strong>{t('webDash.noSummaryDataBold')}</strong>.</div>
              : <div className="flex flex-col gap-2">{templates.map(tpl => (
                  <button key={tpl.id} onClick={() => setTemplateId(tpl.id)} className="bg-white rounded-xl border border-border p-4 flex items-center gap-4 hover:border-primary/40 hover:shadow-card transition text-left">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-secondary/10 border border-secondary/30 text-secondary"><Table2 size={22} /></div>
                    <div className="flex-1 min-w-0"><h3 className="text-sm font-extrabold text-textPrimary truncate">{tpl.id_protocolo}{tpl.name ? ` — ${tpl.name}` : ''}</h3>
                      <p className="text-xs text-textSecondary mt-0.5">{tpl.count === 1 ? t('webDash.testCountOne', { n: tpl.count }) : t('webDash.testCountMany', { n: tpl.count })}{tpl.config ? t('webDash.customConfig') : t('webDash.autoColumns')}</p></div>
                    <ChevronRight size={18} className="text-textMuted" />
                  </button>))}</div>}
          </>
        )}

        {templateId && (
          <>
            {/* Carrusel de gráficos (scroll horizontal; orden = el del modal ⚙).
                v100n — `min-w-0` es OBLIGATORIO: sin él, este hijo flex toma
                min-width:auto y se estira al ancho de las tarjetas, desbordando
                la página entera (el gráfico se cortaba y los botones del header
                quedaban fuera de pantalla). `pretty-scroll` = barra visible. */}
            {charts.length === 0 ? (
              <button onClick={() => setShowCharts(true)} className="bg-white rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted hover:border-primary/40 hover:text-primary transition flex items-center justify-center gap-2">
                <LineChart size={16} /> {t('webDash.chartsCarouselEmpty')}
              </button>
            ) : (
              <div className="min-w-0 flex gap-4 overflow-x-auto pb-2 snap-x pretty-scroll">
                {charts.map(ch => {
                  const pts = buildPts(ch);
                  const title = ch.xKey
                    ? `${yLabelOf(ch.yKey)} vs ${yLabelOf(ch.xKey)}`
                    : t('webDash.scatterVsTime', { param: yLabelOf(ch.yKey) });
                  return (
                    <div key={ch.id} className="relative bg-white rounded-xl border border-border p-4 shrink-0 w-[760px] max-w-[90vw] snap-start">
                      {/* v100l — íconos APILADOS: configuración arriba, compartir debajo */}
                      <div className="absolute top-3 right-3 flex flex-col items-center gap-1 z-10">
                        <button onClick={() => openAxisCfg(ch)} title={t('webDash.chartAxesTitle')} className="p-1 text-muted hover:text-primary transition"><Settings size={15} /></button>
                        <button onClick={() => shareChart(ch.id, title)} title={t('webDash.shareChart')} className="p-1 text-muted hover:text-primary transition"><Share2 size={15} /></button>
                      </div>
                      <h3 className="text-sm font-bold text-navy mb-2 text-center underline underline-offset-4 px-10 chart-font">{title}</h3>
                      <div id={`chart-svg-wrap-${ch.id}`}>
                        <ScatterChart data={pts} yLabel={yLabelOf(ch.yKey)} trend={ch.trend}
                          decimals={decimalsOf(ch.yKey)} yMin={ch.yMin} yMax={ch.yMax} xVertical={!!ch.xVertical}
                          limMin={ch.limMin} limMax={ch.limMax} showEq={!!ch.showEq} showStats={ch.showStats !== false}
                          showLegend={!!ch.showLegend} showVGrid={ch.showVGrid !== false}
                          xLabel={ch.xKey ? yLabelOf(ch.xKey) : undefined} xDecimals={ch.xKey ? decimalsOf(ch.xKey) : undefined}
                          join={ch.join ?? 'none'} vxMin={ch.vxMin} vxMax={ch.vxMax}
                          yStep={ch.yStep} xStep={ch.xStep} svgId={`chart-svg-${ch.id}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tabla — congela solo el encabezado (fila de nombres). Sin freeze de 1ª columna. */}
            <div className="min-w-0 bg-white rounded-xl border border-border overflow-auto max-h-[70vh] pretty-scroll">
              {loadingRows ? <div className="flex items-center gap-2 text-muted text-sm p-8"><Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}</div>
                : filtered.length === 0 ? <div className="p-8 text-center text-sm text-muted">{t('webDash.noTestMatches')}</div>
                : <table className="text-[12px] border-collapse">
                  <thead>
                    {hasGroups && <tr className="bg-[#0f2d4a] text-white">{groups.map((g, i) => <th key={i} colSpan={g.span} className="px-2 py-2.5 text-center text-[13px] font-extrabold uppercase tracking-wide border-l border-white/20 sticky top-0 z-20">{g.title ?? ''}</th>)}</tr>}
                    <tr className="bg-navy text-white">{columns.map((c) => <th key={c.key} className="px-2.5 py-2 text-center text-[11px] font-bold uppercase tracking-wider border-l border-white/15 whitespace-nowrap bg-navy sticky top-0 z-20">{c.label}</th>)}</tr>
                  </thead>
                  <tbody>{filtered.map((r, ri) => (
                    <tr key={r.id} className={ri % 2 ? 'bg-surface/40' : 'bg-white'}>{columns.map((c) => {
                      const txt = cellValue(r, c);
                      let content: ReactNode = txt || <span className="text-gray-300">—</span>;
                      if (c.key === 'estado') {
                        const st = summaryStatus(String(r.values_json?.estado ?? r.status ?? ''));
                        content = <span className="text-[10px] font-bold rounded-full border px-1.5 py-0.5" style={{ borderColor: st.color, color: st.color }}>{st.label}</span>;
                      } else if (c.key === 'protocol_code' && txt) {
                        // Enlace al ensayo; volver (atrás) regresa a la tabla (?t en la URL).
                        content = <Link href={`/app/projects/${projectId}/protocols/${r.protocol_id}/audit`} className="text-primary font-bold hover:underline">{txt}</Link>;
                      }
                      return <td key={c.key} className={`px-2.5 py-1.5 border-t border-divider whitespace-nowrap text-center ${c.kind === 'number' ? 'tabular-nums' : ''}`}>{content}</td>;
                    })}</tr>))}</tbody>
                  {/* Footer: una fila por MEDIDA. Divisor FUERTE solo entre datos y cálculos. */}
                  <tfoot>{measures.map((op, mi) => (
                    <tr key={op} className="bg-[#eef2f7] font-bold text-navy">{columns.map((c, ci) => {
                      const div = mi === 0 ? 'border-t-2 border-navy' : 'border-t border-gray-200';
                      if (ci === 0) return <td key={c.key} className={`px-2.5 py-2 ${div} text-[11px] uppercase`}>{t(MEASURE_LABEL_KEYS[op])}</td>;
                      const isData = dataCols.some(d => d.key === c.key);
                      const val = isData ? measure(filtered.map(r => num(r.values_json?.[c.key])), op) : null;
                      return <td key={c.key} className={`px-2.5 py-2 ${div} text-center tabular-nums`}>{val != null ? fmt(val) : ''}</td>;
                    })}</tr>))}</tfoot>
                </table>}
            </div>

            {/* + Nueva medida */}
            {filtered.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {addingMeasure ? (
                  <select autoFocus className="border border-border rounded px-2 py-1.5 text-xs bg-white"
                    onChange={e => { const op = e.target.value as MeasureOp; if (op && !measures.includes(op)) setMeasures(m => [...m, op]); setAddingMeasure(false); }}
                    onBlur={() => setAddingMeasure(false)} defaultValue="">
                    <option value="" disabled>{t('webDash.chooseMeasure')}</option>
                    {(['avg', 'std', 'max', 'min'] as MeasureOp[]).filter(op => !measures.includes(op)).map(op => <option key={op} value={op}>{t(MEASURE_LABEL_KEYS[op])}</option>)}
                  </select>
                ) : (
                  <button onClick={() => setAddingMeasure(true)} disabled={measures.length >= 4}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-dashed border-primary text-primary hover:bg-primary/5 disabled:opacity-40"><Plus size={13} /> {t('webDash.newMeasure')}</button>
                )}
                {measures.filter(op => op !== 'avg').map(op => (
                  <button key={op} onClick={() => setMeasures(m => m.filter(x => x !== op))} className="flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-danger">{t(MEASURE_LABEL_KEYS[op])} <XIcon className="w-3 h-3" /></button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal: TUTORIAL (ayuda breve) */}
      {showHelp && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4" onClick={() => setShowHelp(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-navy">{t('webDash.tutorial')}</h3>
            <ul className="text-sm text-textSecondary list-disc pl-5 flex flex-col gap-1.5">
              <li>{t('webDash.chartsConfig')} ⚙: {t('webDash.reorderHint')}.</li>
              <li>{t('webDash.openFilters')}: {t('webDash.filtersModalTitle')}.</li>
              <li>{t('webDash.exportCsv')}.</li>
            </ul>
            <div className="flex justify-end"><button onClick={() => setShowHelp(false)} className="px-4 py-1.5 text-xs font-bold rounded bg-primary text-white hover:bg-primary/90">{t('webDash.done')}</button></div>
          </div>
        </div>
      )}

      {/* Modal: FILTROS (todos en un solo lugar) */}
      {showFilters && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4" onClick={() => setShowFilters(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-navy">{t('webDash.filtersModalTitle')}</h3>
              <span className="text-[11px] text-gray-400">{t('webDash.filteredOf', { shown: filtered.length, total: rows.length })}</span>
            </div>
            <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-gray-500">{t('webDash.dateFrom')}</span>
              <input type="date" value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)} className="border border-border rounded px-2 py-1.5 text-sm" /></label>
            <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-gray-500">{t('webDash.dateTo')}</span>
              <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} className="border border-border rounded px-2 py-1.5 text-sm" /></label>
            <div className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-gray-500">{t('webDash.status')}</span>
              <div className="flex flex-wrap gap-1.5">{STATUS_FILTERS.map(s => { const on = statusFilter.has(s.key); return (
                <button key={s.key} onClick={() => toggleStatus(s.key)} style={on ? { borderColor: s.color, color: s.color } : undefined} className={`text-[11px] font-bold rounded-full border px-2.5 py-1 bg-white ${on ? '' : 'border-gray-200 text-gray-300'}`}>{t(s.labelKey)}</button>); })}</div></div>
            {worksBySectors && <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-gray-500">{t('webDash.sector')}</span>
              <select value={sectorFilter} onChange={e => setSectorFilter(e.target.value)} className="border border-border rounded px-2 py-1.5 text-sm bg-white"><option value="">{t('webDash.allMale')}</option>{sectorOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>}
            {worksByLocations && <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-gray-500">{t('webDash.location')}</span>
              <select value={locFilter} onChange={e => setLocFilter(e.target.value)} className="border border-border rounded px-2 py-1.5 text-sm bg-white"><option value="">{t('webDash.allFemale')}</option>{locOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>}
            <div className="flex justify-between gap-2 mt-1">
              <button onClick={clearFilters} disabled={!hasActiveFilters} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-primary hover:underline disabled:opacity-40"><XIcon className="w-3 h-3" /> {t('webDash.clear')}</button>
              <button onClick={() => setShowFilters(false)} className="px-4 py-1.5 text-xs font-bold rounded bg-primary text-white hover:bg-primary/90">{t('webDash.done')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: ⚙ CONFIGURAR GRÁFICOS (gestión arriba + agregar abajo) */}
      {showCharts && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4" onClick={() => setShowCharts(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 flex flex-col gap-3 max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-navy">{t('webDash.chartsConfig')}</h3>
              <button onClick={() => setShowCharts(false)} className="text-gray-400 hover:text-danger"><XIcon size={18} /></button>
            </div>

            {/* GESTIÓN: reordenar (drag) + eliminar */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{t('webDash.manageCharts')}</p>
              {charts.length === 0 ? <p className="text-xs text-muted">{t('webDash.noChartsYet')}</p> : (
                <>
                  <p className="text-[10px] text-gray-400">{t('webDash.reorderHint')}</p>
                  <div className="flex flex-col gap-1">
                    {charts.map((ch, i) => (
                      <div key={ch.id} draggable onDragStart={() => setDragIdx(i)} onDragOver={e => e.preventDefault()} onDrop={() => dropChart(i)}
                        className={`flex items-center gap-2 px-2 py-2 rounded-lg border bg-surface/60 ${dragIdx === i ? 'border-primary opacity-60' : 'border-border'}`}>
                        <GripVertical size={16} className="text-gray-400 cursor-grab shrink-0" />
                        <span className="flex-1 min-w-0 text-sm text-textPrimary truncate">{yLabelOf(ch.yKey)}{ch.xKey ? ` vs ${yLabelOf(ch.xKey)}` : ''} <span className="text-[10px] text-gray-400">· {ch.trend === 'none' ? t('webDash.trendNone') : ch.trend === 'linear' ? t('webDash.trendLinear') : ch.trend === 'quad' ? t('webDash.trendQuad') : t('webDash.trendCubic')}</span></span>
                        <button onClick={() => updateCharts(prev => prev.filter(c => c.id !== ch.id))} title={t('webDash.deleteChartTitle')} className="text-gray-400 hover:text-danger shrink-0"><Trash2 size={15} /></button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* AGREGAR (igual que el de gráficos) */}
            <div className="border-t border-divider pt-3 flex flex-col gap-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{t('webDash.addChart')}</p>
              {/* v100l — el eje X ya no es fijo: Tiempo (default) o cualquier variable */}
              <label className="flex flex-col gap-1"><span className="text-xs font-semibold text-gray-600">{t('webDash.axisX')}</span>
                <select value={addX} onChange={e => setAddX(e.target.value)} className="border border-border rounded px-2 py-1.5 text-sm bg-white">
                  <option value="">{t('webDash.axisXValue')}</option>
                  {yOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select></label>
              <label className="flex flex-col gap-1"><span className="text-xs font-semibold text-gray-600">{t('webDash.axisYParam')}</span>
                <select value={addY} onChange={e => setAddY(e.target.value)} className="border border-border rounded px-2 py-1.5 text-sm bg-white">
                  <option value="" disabled>{t('webDash.chooseColumn')}</option>
                  {yOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select></label>
              <label className="flex flex-col gap-1"><span className="text-xs font-semibold text-gray-600">{t('webDash.trendLine')}</span>
                <select value={addTrend} onChange={e => setAddTrend(e.target.value as Trend)} className="border border-border rounded px-2 py-1.5 text-sm bg-white">
                  <option value="none">{t('webDash.trendNone')}</option>
                  <option value="linear">{t('webDash.trendLinear')}</option><option value="quad">{t('webDash.trendQuad')}</option><option value="cubic">{t('webDash.trendCubic')}</option>
                </select></label>
              {/* v100l — unión de puntos tipo Excel */}
              <label className="flex flex-col gap-1"><span className="text-xs font-semibold text-gray-600">{t('webDash.joinLine')}</span>
                <select value={addJoin} onChange={e => setAddJoin(e.target.value as Join)} className="border border-border rounded px-2 py-1.5 text-sm bg-white">
                  <option value="none">{t('webDash.joinNone')}</option><option value="linear">{t('webDash.joinLinear')}</option><option value="smooth">{t('webDash.joinSmooth')}</option>
                </select></label>
              <button onClick={() => { if (addY) { updateCharts(prev => [...prev, { id: genId(), yKey: addY, trend: addTrend, xKey: addX || null, join: addJoin }]); setAddY(''); setAddTrend('linear'); setAddX(''); setAddJoin('none'); } }}
                disabled={!addY || yOptions.length === 0}
                className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-40"><Plus size={14} /> {t('webDash.addChart')}</button>
            </div>
          </div>
        </div>
      )}

      {/* v100l — Modal: EJES del gráfico (espejo del móvil). Se persiste por gráfico. */}
      {axisChart && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4" onClick={() => setAxisChart(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 flex flex-col gap-3 max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-navy">{t('webDash.chartAxesTitle')}</h3>
              <button onClick={() => setAxisChart(null)} className="text-gray-400 hover:text-danger"><XIcon size={18} /></button>
            </div>
            <p className="text-xs text-muted -mt-2">{yLabelOf(axisChart.yKey)}{axisChart.xKey ? ` vs ${yLabelOf(axisChart.xKey)}` : ''}</p>

            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{t('webDash.axisYRange')}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase text-gray-400">{t('webDash.min')}</span>
                <input inputMode="decimal" value={ax.yMin} onChange={e => setAx(a => ({ ...a, yMin: e.target.value }))} placeholder="auto" className="border border-border rounded px-2 py-1.5 text-sm" /></label>
              <label className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase text-gray-400">{t('webDash.max')}</span>
                <input inputMode="decimal" value={ax.yMax} onChange={e => setAx(a => ({ ...a, yMax: e.target.value }))} placeholder="auto" className="border border-border rounded px-2 py-1.5 text-sm" /></label>
            </div>

            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{t('webDash.gridSpacing')}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase text-gray-400">{t('webDash.gridH')}</span>
                <input inputMode="decimal" value={ax.yStep} onChange={e => setAx(a => ({ ...a, yStep: e.target.value }))} placeholder="auto" className="border border-border rounded px-2 py-1.5 text-sm" /></label>
              <label className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase text-gray-400">{axisChart.xKey ? t('webDash.gridV') : t('webDash.gridVDays')}</span>
                <input inputMode="decimal" value={ax.xStep} onChange={e => setAx(a => ({ ...a, xStep: e.target.value }))} placeholder="auto" className="border border-border rounded px-2 py-1.5 text-sm" /></label>
            </div>

            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{t('webDash.limitLines')}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase" style={{ color: C_MIN }}>{t('webDash.limitMin')}</span>
                <input inputMode="decimal" value={ax.limMin} onChange={e => setAx(a => ({ ...a, limMin: e.target.value }))} placeholder={t('webDash.none')} className="border border-border rounded px-2 py-1.5 text-sm" /></label>
              <label className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase" style={{ color: C_MAX }}>{t('webDash.limitMax')}</span>
                <input inputMode="decimal" value={ax.limMax} onChange={e => setAx(a => ({ ...a, limMax: e.target.value }))} placeholder={t('webDash.none')} className="border border-border rounded px-2 py-1.5 text-sm" /></label>
            </div>

            <label className="flex flex-col gap-1"><span className="text-xs font-semibold text-gray-600">{t('webDash.trendLine')}</span>
              <select value={ax.trend} onChange={e => setAx(a => ({ ...a, trend: e.target.value as Trend }))} className="border border-border rounded px-2 py-1.5 text-sm bg-white">
                <option value="none">{t('webDash.trendNone')}</option>
                <option value="linear">{t('webDash.trendLinear')}</option><option value="quad">{t('webDash.trendQuad')}</option><option value="cubic">{t('webDash.trendCubic')}</option>
              </select></label>
            <label className="flex flex-col gap-1"><span className="text-xs font-semibold text-gray-600">{t('webDash.joinLine')}</span>
              <select value={ax.join} onChange={e => setAx(a => ({ ...a, join: e.target.value as Join }))} className="border border-border rounded px-2 py-1.5 text-sm bg-white">
                <option value="none">{t('webDash.joinNone')}</option><option value="linear">{t('webDash.joinLinear')}</option><option value="smooth">{t('webDash.joinSmooth')}</option>
              </select></label>

            <label className="flex items-center justify-between gap-2 text-sm text-textPrimary">
              <span>{t('webDash.showLegend')}</span>
              <input type="checkbox" checked={ax.showLegend} onChange={e => setAx(a => ({ ...a, showLegend: e.target.checked }))} className="w-4 h-4 accent-primary" /></label>
            <label className="flex items-center justify-between gap-2 text-sm text-textPrimary">
              <span>{t('webDash.showVGrid')}</span>
              <input type="checkbox" checked={ax.showVGrid} onChange={e => setAx(a => ({ ...a, showVGrid: e.target.checked }))} className="w-4 h-4 accent-primary" /></label>
            <label className="flex items-center justify-between gap-2 text-sm text-textPrimary">
              <span>{t('webDash.showEq')}</span>
              <input type="checkbox" disabled={ax.trend === 'none'} checked={ax.showEq} onChange={e => setAx(a => ({ ...a, showEq: e.target.checked }))} className="w-4 h-4 accent-primary disabled:opacity-40" /></label>
            <label className="flex items-center justify-between gap-2 text-sm text-textPrimary">
              <span>{t('webDash.showStats')}</span>
              <input type="checkbox" checked={ax.showStats} onChange={e => setAx(a => ({ ...a, showStats: e.target.checked }))} className="w-4 h-4 accent-primary" /></label>

            {!axisChart.xKey ? (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{t('webDash.axisXDates')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase text-gray-400">{t('webDash.dateFrom')}</span>
                    <input type="date" value={ax.xMin} onChange={e => setAx(a => ({ ...a, xMin: e.target.value }))} className="border border-border rounded px-2 py-1.5 text-sm" /></label>
                  <label className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase text-gray-400">{t('webDash.dateTo')}</span>
                    <input type="date" value={ax.xMax} onChange={e => setAx(a => ({ ...a, xMax: e.target.value }))} className="border border-border rounded px-2 py-1.5 text-sm" /></label>
                </div>
              </>
            ) : (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{t('webDash.axisXRange')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase text-gray-400">{t('webDash.min')}</span>
                    <input inputMode="decimal" value={ax.vxMin} onChange={e => setAx(a => ({ ...a, vxMin: e.target.value }))} placeholder="auto" className="border border-border rounded px-2 py-1.5 text-sm" /></label>
                  <label className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase text-gray-400">{t('webDash.max')}</span>
                    <input inputMode="decimal" value={ax.vxMax} onChange={e => setAx(a => ({ ...a, vxMax: e.target.value }))} placeholder="auto" className="border border-border rounded px-2 py-1.5 text-sm" /></label>
                </div>
              </>
            )}

            <label className="flex items-center justify-between gap-2 text-sm text-textPrimary">
              <span>{axisChart.xKey ? t('webDash.xLabelsVertical') : t('webDash.xDatesVertical')}</span>
              <input type="checkbox" checked={ax.vert} onChange={e => setAx(a => ({ ...a, vert: e.target.checked }))} className="w-4 h-4 accent-primary" /></label>

            <div className="flex items-center justify-between border-t border-divider pt-3">
              <button onClick={() => setAxisChart(null)} className="text-xs font-bold text-gray-500 hover:text-danger">{t('common.cancel')}</button>
              <button onClick={saveAxisCfg} className="px-4 py-2 text-xs font-bold rounded-lg bg-primary text-white hover:bg-primary/90">{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Gráfico de dispersión SVG ────────────────────────────────────────────────
// v100l — ESPEJO VISUAL del móvil (ScatterChartRN en SummaryTablesScreen.tsx):
// marco cerrado por los 4 lados, cuadrícula con densidad calculada (o separación
// fija), título del eje Y rotado, límites máx/mín punteados con etiqueta al
// arranque, tendencia punteada + ecuación/R², unión de puntos (lineal/suavizada),
// eje X por tiempo o por variable, y pie en dos columnas (leyenda | stats+ecuación).
// La matemática y la paleta vienen de @lib/chartMath (espejo con el móvil).
function ScatterChart({ data, yLabel, trend, decimals, yMin, yMax, xVertical, limMin, limMax, showEq, showStats, showLegend, showVGrid, xLabel, xDecimals, join, vxMin, vxMax, yStep, xStep, svgId }: {
  data: { x: number; y: number; code: string }[]; yLabel: string; trend: Trend;
  decimals?: number; yMin?: number | null; yMax?: number | null; xVertical?: boolean;
  limMin?: number | null; limMax?: number | null; showEq?: boolean; showStats?: boolean;
  showLegend?: boolean; showVGrid?: boolean;
  xLabel?: string; xDecimals?: number; join?: Join; vxMin?: number | null; vxMax?: number | null;
  yStep?: number | null; xStep?: number | null; svgId?: string;
}) {
  const { t } = useI18n();
  if (data.length === 0) return <p className="text-sm text-muted">{t('webDash.noDataToPlot')}</p>;
  const isVar = xLabel != null;
  const W = 720, H = 340, padL = 68, padR = 22, padT = 16, padB = xVertical ? 78 : 52;
  const xs = data.map(d => d.x), ys = data.map(d => d.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs) || minX + 1;
  // Rango X: tiempo = extensión de los datos; variable = datos + 6% de aire,
  // con overrides manuales (vxMin/vxMax) que mandan.
  let xlo = minX, xhi = maxX;
  if (isVar) {
    const padX = (maxX - minX || Math.max(Math.abs(maxX) * 0.01, 0.5)) * 0.06;
    xlo = minX - padX; xhi = maxX + padX;
    if (vxMin != null && Number.isFinite(vxMin)) xlo = vxMin;
    if (vxMax != null && Number.isFinite(vxMax)) xhi = vxMax;
    if (xhi <= xlo) xhi = xlo + 1;
  }
  const dx = xhi - xlo || 1;
  // Rango Y: los límites configurados deben quedar VISIBLES.
  let { lo, hi } = niceYRange(ys, yMin, yMax);
  if (yMin == null && limMin != null && Number.isFinite(limMin)) lo = Math.min(lo, limMin);
  if (yMax == null && limMax != null && Number.isFinite(limMax)) hi = Math.max(hi, limMax);
  if (hi <= lo) hi = lo + 1;
  const dy = hi - lo;
  const sxRaw = (x: number) => padL + ((x - xlo) / dx) * (W - padL - padR);
  const syRaw = (y: number) => H - padB - ((y - lo) / dy) * (H - padT - padB);
  const sx = (x: number) => Math.max(padL, Math.min(W - padR, sxRaw(x)));
  const sy = (y: number) => Math.max(padT, Math.min(H - padB, syRaw(y)));
  // Cuadrícula: densidad calculada, o separación fija si el usuario la fijó.
  const autoY = niceTicks(lo, hi, 7);
  const forcedY = ticksWithStep(lo, hi, yStep);
  const yTicks = forcedY ?? autoY.ticks;
  const step = forcedY ? (yStep as number) : autoY.step;
  const tickDec = tickDecimals(step, decimals);
  const autoX = niceTicks(xlo, xhi, 5);
  const forcedX = isVar ? ticksWithStep(xlo, xhi, xStep) : null;
  const xVarTicks = forcedX ?? autoX.ticks;
  const xStepEff = forcedX ? (xStep as number) : autoX.step;
  const xTickDec = tickDecimals(xStepEff, xDecimals);
  // Tendencia: base DÍAS con X=tiempo, unidades de la variable con X=variable.
  const degree = trend === 'linear' ? 1 : trend === 'quad' ? 2 : trend === 'cubic' ? 3 : 0;
  const timeGridXs = !isVar ? ticksWithStep(xlo, xhi, xStep != null && xStep > 0 ? xStep * DAY_MS : null) : null;
  const tx2 = isVar ? xs : xs.map(x => (x - minX) / DAY_MS);
  const coef = trend === 'none' ? null : polyfit(tx2, ys, degree);
  const toT = (xv: number) => isVar ? xv : (xv - minX) / DAY_MS;
  const trendPts: string[] = [];
  if (coef) for (let i = 0; i <= 60; i++) { const tt = i / 60; const xv = xlo + tt * dx; trendPts.push(`${sx(xv).toFixed(1)},${sy(polyval(coef, toT(xv))).toFixed(1)}`); }
  const trendVisible = !!coef && trend !== 'none';
  const r2 = coef ? rSquared(ys, tx2.map(v => polyval(coef, v))) : null;
  const eq = coef ? equationStr(coef, degree, isVar ? 'x' : 't') : '';
  // Unión de puntos (tipo Excel).
  const joinMode: Join = join ?? 'none';
  const pxy = data.map(d => ({ x: sx(d.x), y: sy(d.y) }));
  const joinLinearPts = joinMode === 'linear' && pxy.length > 1 ? pxy.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') : '';
  const joinSmoothD = joinMode === 'smooth' && pxy.length > 1 ? smoothPath(pxy) : '';
  const { n, mean, std } = describe(ys);
  const statDec = Math.max(decimals ?? 0, 2);
  const xTicks = isVar ? xVarTicks : (xVertical
    ? Array.from(new Set(xs)).sort((a, b) => a - b)
    : [minX, (minX + maxX) / 2, maxX]);
  const fmtX = (xv: number) => isVar ? xv.toFixed(xTickDec) : fmtShortDate(xv);
  const trendKind = trend === 'linear' ? t('webDash.trendKindLinear') : trend === 'quad' ? t('webDash.trendKindQuad') : trend === 'cubic' ? t('webDash.trendKindCubic') : '';
  const hasFooter = showLegend || (showEq && trendVisible) || showStats;
  return (
    <div className="overflow-x-auto">
      <svg id={svgId} width={W} height={H} className="bg-white chart-font">
        {/* Título del eje Y (vertical) */}
        <text x={16} y={(padT + H - padB) / 2} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1a1a2e"
          transform={`rotate(-90 16 ${(padT + H - padB) / 2})`}>{yLabel}</text>
        {/* Cuadrícula VERTICAL (más clara), detrás de todo */}
        {showVGrid && ((isVar ? xVarTicks : timeGridXs)
          ? (isVar ? xVarTicks : timeGridXs!).map((xv, k) => <line key={`v${k}`} x1={sxRaw(xv)} y1={padT} x2={sxRaw(xv)} y2={H - padB} stroke={VGRID_GRAY} />)
          : Array.from({ length: V_DIV - 1 }, (_, k) => { const xx = padL + ((W - padL - padR) * (k + 1)) / V_DIV; return (
            <line key={`v${k}`} x1={xx} y1={padT} x2={xx} y2={H - padB} stroke={VGRID_GRAY} />); }))}
        {/* Marco COMPLETO: siempre cerrado por los 4 lados */}
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke={AXIS_GRAY} />
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke={AXIS_GRAY} />
        <line x1={W - padR} y1={padT} x2={W - padR} y2={H - padB} stroke={AXIS_GRAY} />
        <line x1={padL} y1={padT} x2={W - padR} y2={padT} stroke={AXIS_GRAY} />
        {/* Cuadrícula horizontal + marcas Y */}
        {yTicks.map((yv, i) => { const yy = syRaw(yv); return (
          <g key={i}><line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke={AXIS_GRAY} />
            <text x={padL - 6} y={yy + 3.5} textAnchor="end" fontSize="10" fill="#64748b">{yv.toFixed(tickDec)}</text></g>); })}
        {/* Marcas X */}
        {xTicks.map((xv, i) => xVertical
          ? <text key={i} x={sxRaw(xv)} y={H - padB + 8} textAnchor="end" fontSize="9.5" fill="#64748b" transform={`rotate(-90 ${sxRaw(xv)} ${H - padB + 8})`} dy={3.5}>{fmtX(xv)}</text>
          : <text key={i} x={sxRaw(xv)} y={H - padB + 18} textAnchor="middle" fontSize="10" fill="#64748b">{fmtX(xv)}</text>)}
        {/* Líneas de límite (punteadas), etiqueta al ARRANQUE para no desbordar */}
        {limMax != null && Number.isFinite(limMax) && limMax >= lo && limMax <= hi && (
          <g><line x1={padL} y1={syRaw(limMax)} x2={W - padR} y2={syRaw(limMax)} stroke={C_MAX} strokeWidth={1.6} strokeDasharray="6,4" />
            <text x={padL + 4} y={syRaw(limMax) - 4} fontSize="9.5" fontWeight="700" fill={C_MAX}>{t('webDash.limMaxShort')} {limMax.toFixed(tickDec)}</text></g>)}
        {limMin != null && Number.isFinite(limMin) && limMin >= lo && limMin <= hi && (
          <g><line x1={padL} y1={syRaw(limMin)} x2={W - padR} y2={syRaw(limMin)} stroke={C_MIN} strokeWidth={1.6} strokeDasharray="6,4" />
            <text x={padL + 4} y={syRaw(limMin) - 4} fontSize="9.5" fontWeight="700" fill={C_MIN}>{t('webDash.limMinShort')} {limMin.toFixed(tickDec)}</text></g>)}
        {/* Unión de puntos (debajo de los puntos) */}
        {joinLinearPts && <polyline points={joinLinearPts} fill="none" stroke={C_POINT} strokeWidth={1.8} />}
        {joinSmoothD && <path d={joinSmoothD} fill="none" stroke={C_POINT} strokeWidth={1.8} />}
        {data.map((d, i) => <circle key={i} cx={sx(d.x)} cy={sy(d.y)} r={3.5} fill={C_POINT} opacity={0.85}><title>{d.code}: {d.y}</title></circle>)}
        {/* Tendencia: MISMO ancho y patrón que las líneas de límite */}
        {trendVisible && <polyline points={trendPts.join(' ')} fill="none" stroke={C_TREND} strokeWidth={1.6} strokeDasharray="6,4" />}
        <text x={(padL + W - padR) / 2} y={H - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1a1a2e">{isVar ? xLabel : t('webDash.axisTimeDate')}</text>
      </svg>

      {/* Pie en DOS columnas: izquierda la leyenda, derecha stats + ecuación */}
      {hasFooter && (
        <div className="flex gap-3 mt-1 pt-1.5 border-t border-[#eef2f7] chart-font" style={{ width: W }}>
          {showLegend && (
            <div className="flex-1 flex flex-col items-start gap-0.5">
              {limMax != null && Number.isFinite(limMax) && (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: C_MAX }}><LegendDash color={C_MAX} /> {t('webDash.limMaxShort')} {limMax.toFixed(tickDec)}</span>)}
              {limMin != null && Number.isFinite(limMin) && (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: C_MIN }}><LegendDash color={C_MIN} /> {t('webDash.limMinShort')} {limMin.toFixed(tickDec)}</span>)}
              {trendVisible && (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: C_TREND }}><LegendDash color={C_TREND} /> {t('webDash.trendLegend', { kind: trendKind })}</span>)}
            </div>
          )}
          {showLegend && (showStats || (showEq && trendVisible)) && <div className="w-px self-stretch bg-[#e4e9f0]" />}
          {(showStats || (showEq && trendVisible)) && (
            <div className={`flex-[1.2] flex flex-col gap-0.5 ${showLegend ? 'items-end text-right' : 'items-start text-left'}`}>
              {showStats && (
                <div className="flex flex-wrap gap-3 text-[11.5px] text-[#334155]">
                  <span>n = {n}</span><span>x&#772; = {mean.toFixed(statDec)}</span><span>&#963; = {std.toFixed(statDec)}</span>
                </div>
              )}
              {showEq && trendVisible && (
                <>
                  {/* 'R² = 0.0' con espacios DUROS: si no entra, baja completo */}
                  <span className="text-[11px] text-[#334155]">{`${eq}  ·  R² = ${r2 != null ? r2.toFixed(1) : '—'}`}</span>
                  {!isVar && <span className="text-[10px] italic text-[#a8b3c2]">{t('webDash.daysNote')}</span>}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Muestra de línea punteada para la leyenda: EXACTAMENTE 3 tramos (espejo del móvil). */
function LegendDash({ color }: { color: string }) {
  return <svg width={21} height={4}><line x1={0} y1={2} x2={21} y2={2} stroke={color} strokeWidth={1.8} strokeDasharray="5,3" /></svg>;
}
