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
import { Table2, Download, ChevronRight, X as XIcon, Loader2, Plus, LineChart, Settings, Filter, Trash2, GripVertical, HelpCircle, ArrowLeft } from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useProjects } from '@hooks/useProjects';
import { useSummaryTemplates, useSummaryRows, useTemplateItems, type SummaryRowData } from '@hooks/useSummaryRows';
import { FIXED_SUMMARY_COLUMNS, dynamicColumnsFromRows, summaryStatus, type SummaryColumn } from '@lib/summaryTable';
import { buildAutoColumns, chartYOptions } from '@lib/summaryColumns';
import { useI18n } from '@lib/i18n';
import { usePageRefresh } from '@hooks/usePageRefresh';

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

// ── Regresión polinómica (mínimos cuadrados) para la línea de tendencia ──────
function polyfit(xs: number[], ys: number[], degree: number): number[] | null {
  const n = xs.length;
  if (n <= degree) return null;
  const m = degree + 1;
  // Matriz normal A (m×m) y vector b (m).
  const A: number[][] = Array.from({ length: m }, () => new Array(m).fill(0));
  const b = new Array(m).fill(0);
  for (let i = 0; i < n; i++) {
    const powers = [1];
    for (let p = 1; p < 2 * degree + 1; p++) powers.push(powers[p - 1] * xs[i]);
    for (let r = 0; r < m; r++) {
      for (let c = 0; c < m; c++) A[r][c] += powers[r + c];
      b[r] += powers[r] * ys[i];
    }
  }
  // Eliminación gaussiana.
  for (let col = 0; col < m; col++) {
    let piv = col;
    for (let r = col + 1; r < m; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]]; [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = 0; r < m; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c < m; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}
const polyval = (coef: number[], x: number) => coef.reduce((acc, c, i) => acc + c * x ** i, 0);

export default function SummaryTablesPage() {
  const { t } = useI18n();
  return <Suspense fallback={<div className="p-8 text-sm text-muted">{t('common.loading')}</div>}><SummaryTablesInner /></Suspense>;
}

type Trend = 'linear' | 'quad' | 'cubic';
type ChartCfg = { id: string; yKey: string; trend: Trend };
const genId = () => `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

function SummaryTablesInner() {
  const { refreshing, onRefresh } = usePageRefresh();
  const { t } = useI18n();
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

  // Dashboard de gráficos: ARRAY ordenado, persistido por tipo de ensayo (templateId).
  const [charts, setCharts] = useState<ChartCfg[]>([]);
  useEffect(() => {
    if (!templateId) { setCharts([]); return; }
    try { const raw = localStorage.getItem(`summary_charts_${templateId}`); setCharts(raw ? JSON.parse(raw) : []); } catch { setCharts([]); }
  }, [templateId]);
  useEffect(() => {
    if (!templateId) return;
    try { localStorage.setItem(`summary_charts_${templateId}`, JSON.stringify(charts)); } catch { /* cuota */ }
  }, [charts, templateId]);

  // Modales
  const [showFilters, setShowFilters] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Form "agregar gráfico" (dentro del modal ⚙)
  const [addY, setAddY] = useState('');
  const [addTrend, setAddTrend] = useState<Trend>('linear');
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

  // Puntos de un gráfico (X = fecha → tiempo; Y = columna elegida).
  const buildPts = (yKey: string) => filtered
    .map(r => ({ x: r.ensayo_date ? new Date(r.ensayo_date + 'T12:00:00').getTime() : NaN, y: num(r.values_json?.[yKey]), code: r.protocol_code ?? '' }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => a.x - b.x);

  // Reordenar gráficos al soltar (drag HTML5).
  const dropChart = (to: number) => {
    setCharts(prev => {
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
            {/* Carrusel de gráficos (scroll horizontal; orden = el del modal ⚙) */}
            {charts.length === 0 ? (
              <button onClick={() => setShowCharts(true)} className="bg-white rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted hover:border-primary/40 hover:text-primary transition flex items-center justify-center gap-2">
                <LineChart size={16} /> {t('webDash.chartsCarouselEmpty')}
              </button>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
                {charts.map(ch => {
                  const pts = buildPts(ch.yKey);
                  return (
                    <div key={ch.id} className="bg-white rounded-xl border border-border p-4 shrink-0 w-[760px] max-w-[90vw] snap-start">
                      <h3 className="text-sm font-bold text-navy mb-2">{t('webDash.scatterVsTime', { param: yLabelOf(ch.yKey) })}</h3>
                      <ScatterChart data={pts} yLabel={yLabelOf(ch.yKey)} trend={ch.trend} />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tabla — congela solo el encabezado (fila de nombres). Sin freeze de 1ª columna. */}
            <div className="bg-white rounded-xl border border-border overflow-auto max-h-[70vh]">
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
                        <span className="flex-1 min-w-0 text-sm text-textPrimary truncate">{yLabelOf(ch.yKey)} <span className="text-[10px] text-gray-400">· {ch.trend === 'linear' ? t('webDash.trendLinear') : ch.trend === 'quad' ? t('webDash.trendQuad') : t('webDash.trendCubic')}</span></span>
                        <button onClick={() => setCharts(prev => prev.filter(c => c.id !== ch.id))} title={t('webDash.deleteChartTitle')} className="text-gray-400 hover:text-danger shrink-0"><Trash2 size={15} /></button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* AGREGAR (igual que el de gráficos) */}
            <div className="border-t border-divider pt-3 flex flex-col gap-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{t('webDash.addChart')}</p>
              <label className="flex flex-col gap-1"><span className="text-xs font-semibold text-gray-600">{t('webDash.axisX')}</span>
                <input disabled value={t('webDash.axisXValue')} className="border border-border rounded px-2 py-1.5 text-sm bg-surface text-gray-500" /></label>
              <label className="flex flex-col gap-1"><span className="text-xs font-semibold text-gray-600">{t('webDash.axisYParam')}</span>
                <select value={addY} onChange={e => setAddY(e.target.value)} className="border border-border rounded px-2 py-1.5 text-sm bg-white">
                  <option value="" disabled>{t('webDash.chooseColumn')}</option>
                  {yOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select></label>
              <label className="flex flex-col gap-1"><span className="text-xs font-semibold text-gray-600">{t('webDash.trendLine')}</span>
                <select value={addTrend} onChange={e => setAddTrend(e.target.value as Trend)} className="border border-border rounded px-2 py-1.5 text-sm bg-white">
                  <option value="linear">{t('webDash.trendLinear')}</option><option value="quad">{t('webDash.trendQuad')}</option><option value="cubic">{t('webDash.trendCubic')}</option>
                </select></label>
              <button onClick={() => { if (addY) { setCharts(prev => [...prev, { id: genId(), yKey: addY, trend: addTrend }]); setAddY(''); setAddTrend('linear'); } }}
                disabled={!addY || yOptions.length === 0}
                className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-40"><Plus size={14} /> {t('webDash.addChart')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Gráfico de dispersión SVG con línea de tendencia ─────────────────────────
function ScatterChart({ data, yLabel, trend }: { data: { x: number; y: number; code: string }[]; yLabel: string; trend: 'linear' | 'quad' | 'cubic' }) {
  const { t } = useI18n();
  const W = 720, H = 320, padL = 56, padR = 16, padT = 12, padB = 48;
  if (data.length === 0) return <p className="text-sm text-muted">{t('webDash.noDataToPlot')}</p>;
  const xs = data.map(d => d.x), ys = data.map(d => d.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs) || minX + 1;
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const dx = maxX - minX || 1, dy = (maxY - minY) || 1;
  const sx = (x: number) => padL + ((x - minX) / dx) * (W - padL - padR);
  const sy = (y: number) => H - padB - ((y - minY) / dy) * (H - padT - padB);
  const degree = trend === 'linear' ? 1 : trend === 'quad' ? 2 : 3;
  // Normalizamos X a [0,1] para estabilidad numérica del ajuste.
  const nx = xs.map(x => (x - minX) / dx);
  const coef = polyfit(nx, ys, degree);
  const trendPts: string[] = [];
  if (coef) for (let i = 0; i <= 60; i++) { const t = i / 60; const xv = minX + t * dx; const yv = polyval(coef, t); trendPts.push(`${sx(xv).toFixed(1)},${sy(yv).toFixed(1)}`); }
  const fmtDate = (t: number) => new Date(t).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const yticks = 5;
  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} className="bg-white">
        {/* ejes */}
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#cbd5e1" />
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#cbd5e1" />
        {/* grid + labels Y */}
        {Array.from({ length: yticks + 1 }, (_, i) => { const yv = minY + (dy * i) / yticks; const yy = sy(yv); return (
          <g key={i}><line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="#eef2f7" />
            <text x={padL - 6} y={yy + 3} textAnchor="end" fontSize="9" fill="#64748b">{Math.abs(yv) >= 100 ? yv.toFixed(0) : yv.toFixed(2)}</text></g>); })}
        {/* labels X (primeras/últimas) */}
        {[minX, (minX + maxX) / 2, maxX].map((xv, i) => (
          <text key={i} x={sx(xv)} y={H - padB + 16} textAnchor="middle" fontSize="9" fill="#64748b">{fmtDate(xv)}</text>))}
        {/* puntos */}
        {data.map((d, i) => <circle key={i} cx={sx(d.x)} cy={sy(d.y)} r={3.5} fill="#1a4f7a" opacity={0.8}><title>{d.code}: {d.y}</title></circle>)}
        {/* tendencia */}
        {coef && <polyline points={trendPts.join(' ')} fill="none" stroke="#e37400" strokeWidth={2} />}
        {/* títulos de ejes */}
        <text x={(W) / 2} y={H - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1a1a2e">{t('webDash.axisTimeDate')}</text>
        <text x={14} y={H / 2} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1a1a2e" transform={`rotate(-90 14 ${H / 2})`}>{yLabel}</text>
      </svg>
      {/* leyenda */}
      <div className="flex items-center gap-4 justify-center mt-1 text-[11px] text-gray-600">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#1a4f7a] inline-block" /> {t('webDash.legendTests')}</span>
        <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-[#e37400] inline-block" /> {trend === 'linear' ? t('webDash.legendTrendLinear') : trend === 'quad' ? t('webDash.legendTrendQuad') : t('webDash.legendTrendCubic')}</span>
      </div>
    </div>
  );
}
