// Renderer de gráficos SVG puros para protocolos numéricos (móvil).
//
// Portado de `flow-qaqc-web/lib/chartRenderer.ts` SIN cambios de lógica: genera un
// string SVG que en móvil se renderiza con `<SvgXml>` de `react-native-svg`. Una
// sola fuente de verdad con la web → los gráficos se ven idénticos en PC y celular.
//
// Sin dependencias de React: solo strings. El único import es el tipo `Scope`.
//
// v32 — Extensiones (todas opcionales, sintaxis legacy intacta):
//   - Múltiples series Y (y2Refs / y3Refs) contra el mismo eje X.
//   - Banda de especificación (bandLoRefs / bandHiRefs): huso granulométrico u
//     otra envolvente normativa, dibujada como área sombreada.
//   - Curva ajustada sobre la serie 1 (`fit`): lineal | poli2 | poli3 | spline | loglog.
//   - Leyenda automática cuando hay >1 serie, banda, ajuste o etiquetas.
//
// v33 — Presentación profesional:
//   - Escala "nice numbers" (Heckbert): ticks en valores con sentido (0, 20, 40…),
//     enteros cuando el paso ≥ 1, todos con los mismos decimales. El dominio del
//     eje se encuadra en múltiplos del paso alrededor del min/max real de los datos.
//   - Grilla jerárquica: líneas mayores en cada tick + subdivisiones menores
//     punteadas. Marco completo del área de plot + tick marks.
//   - Márgenes dinámicos: el margen izquierdo se calcula con el ancho real de las
//     etiquetas del eje Y (no se cortan números largos).
//   - Tipografía de informe técnico (etiquetas 10px, títulos de eje 11px semibold).

import type { Scope } from './formulaEval';

export type ChartMode =
  | 'line'        // gr1: polilínea con marcadores
  | 'smooth'      // gr2: curva Catmull-Rom suavizada
  | 'bars'        // gr3: barras verticales (X categórico, Y numérico)
  | 'log-x'       // gr5: escala log en X (granulometría), Y lineal
  | 'scatter';    // gr7: dispersión + recta de regresión + R²

export type ChartFit = 'lineal' | 'poli2' | 'poli3' | 'spline' | 'loglog';

export interface ChartSpec {
  mode: ChartMode;
  xRefs: string[];
  yRefs: string[];
  title?: string;
  xAxisTitle?: string;
  yAxisTitle?: string;
  // v32:
  y2Refs?: string[];
  y3Refs?: string[];
  /** Etiquetas de leyenda para las series 1..3. */
  seriesLabels?: (string | undefined)[];
  bandLoRefs?: string[];
  bandHiRefs?: string[];
  fit?: ChartFit;
}

export interface ChartOpts {
  width?: number;
  height?: number;
  /** v43.4 — No dibujar la leyenda DENTRO del SVG (la pinta el caller, ej. a la
   *  derecha en HTML). El plot recupera ese alto → gráfico más bajo. */
  noLegend?: boolean;
  /** v43.4 — No dibujar el título DENTRO del SVG (se muestra a la derecha). */
  noTitle?: boolean;
  /** v43.4 — Si se pasa, el renderer vuelca aquí las entradas de leyenda
   *  (color/label/dashed) para que el caller las muestre fuera del SVG. */
  legendSink?: { color: string; label: string; dashed?: boolean; point?: boolean }[];
  /** v43.4 — Tamaño de SALIDA del SVG (atributos width/height). El layout interno
   *  se hace a un ancho base fijo y se escala vía viewBox → fuentes/padding
   *  proporcionales al tamaño final. Si se omite, sale al tamaño de layout. */
  displayW?: number;
  displayH?: number;
}

const COLORS = {
  primary:   '#0064dc',
  secondary: '#f59e0b',
  tertiary:  '#8b5cf6',
  regression:'#10b981',
  band:      '#64748b',
  text:      '#1f2937',
  axisText:  '#374151',
  muted:     '#6b7280',
  gridMajor: '#e2e6ea',
  gridMinor: '#f1f3f5',
  frame:     '#cbd5e1',
  tick:      '#9ca3af',
  bg:        '#ffffff',
};

const SERIES_COLORS = [COLORS.primary, COLORS.secondary, COLORS.tertiary];

const FONT = "-apple-system, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";

/** Contador global para ids únicos de clipPath (varios charts por pantalla). */
let _clipSeq = 0;

// ─── Escala "nice numbers" (Heckbert) ───────────────────────────────────────

export interface NiceScale {
  /** Límite inferior del eje (múltiplo de step). */
  min: number;
  /** Límite superior del eje (múltiplo de step). */
  max: number;
  /** Separación entre ticks: 1 / 2 / 2.5 / 5 × 10^k. */
  step: number;
  /** Valores exactos de los ticks (min..max inclusive). */
  ticks: number[];
  /** Decimales coherentes con step (step ≥ 1 entero → 0 → etiquetas enteras). */
  decimals: number;
}

/** "Número bonito" ≈ range: mantisa 1/2/2.5/5/10. `round` redondea al más
 *  cercano (para el step); sin round toma el techo (para el rango).
 *  2.5 solo cuando el exponente ≥ 1 (25, 250…) para no meter decimales raros. */
function niceNum(range: number, round: boolean): number {
  if (!(range > 0) || !isFinite(range)) return 1;
  const exp = Math.floor(Math.log10(range));
  const frac = range / Math.pow(10, exp);
  let nice: number;
  if (round) {
    if (frac < 1.5) nice = 1;
    else if (frac < 3) nice = 2;
    else if (frac < 4 && exp >= 1) nice = 2.5;
    else if (frac < 7) nice = 5;
    else nice = 10;
  } else {
    if (frac <= 1) nice = 1;
    else if (frac <= 2) nice = 2;
    else if (frac <= 2.5 && exp >= 1) nice = 2.5;
    else if (frac <= 5) nice = 5;
    else nice = 10;
  }
  return nice * Math.pow(10, exp);
}

/** Calcula la escala de un eje a partir del min/max REAL de los datos:
 *  dominio encuadrado en múltiplos de un paso "bonito" y ticks con decimales
 *  consistentes. Es lo que hace que los números de los ejes "hagan sentido". */
export function niceScale(dataMin: number, dataMax: number, maxTicks = 6): NiceScale {
  if (!isFinite(dataMin) || !isFinite(dataMax)) { dataMin = 0; dataMax = 1; }
  if (dataMin > dataMax) { const t = dataMin; dataMin = dataMax; dataMax = t; }
  if (dataMax - dataMin < 1e-12) {
    // Degenerado (todos los valores iguales): abre una ventana alrededor del valor.
    const pad = Math.abs(dataMin) > 1e-12 ? Math.abs(dataMin) * 0.1 : 1;
    dataMin -= pad;
    dataMax += pad;
  }
  const range = niceNum(dataMax - dataMin, false);
  const step = niceNum(range / (Math.max(2, maxTicks) - 1), true);

  let decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  if (Math.abs(Number(step.toFixed(decimals)) - step) > 1e-12) decimals++;

  // Redondear min/max a los decimales del step elimina artefactos float
  // (1.9000000000000001 → 1.9) — el dominio queda EXACTO en límites de tick.
  const min = Number((Math.floor(dataMin / step) * step).toFixed(decimals));
  const max = Number((Math.ceil(dataMax / step) * step).toFixed(decimals));

  const n = Math.round((max - min) / step);
  const ticks: number[] = [];
  for (let i = 0; i <= n; i++) ticks.push(Number((min + i * step).toFixed(decimals)));
  return { min, max, step, ticks, decimals };
}

/** Etiqueta de tick con los decimales de la escala ("-0" → "0"). */
function tickLabel(v: number, decimals: number): string {
  const s = v.toFixed(decimals);
  return s === '-0' || /^-0\.0+$/.test(s) ? (0).toFixed(decimals) : s;
}

/** Formato compacto para etiquetas de DATOS (valores sobre barras, categorías).
 *  Los enteros se muestran SIN decimales (42, no 42.00). */
function fmt(v: number): string {
  if (!isFinite(v)) return '—';
  if (Number.isInteger(v)) return String(v);
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(0);
  if (abs >= 100)  return v.toFixed(1);
  if (abs >= 1)    return v.toFixed(2);
  return v.toPrecision(2);
}

/** Etiqueta de década del eje log: 0.01, 0.1, 1, 10, 100 (sin ceros de relleno). */
function decadeLabel(d: number): string {
  if (d >= 1) return String(Math.round(d));
  return Number(d.toPrecision(1)).toString();
}

type Pt = { x: number; y: number };

/** Extrae los pares (x,y) válidos del scope para un par de listas de refs. */
function collectPairs(xRefs: string[], yRefs: string[], scope: Scope): Pt[] {
  const n = Math.min(xRefs.length, yRefs.length);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const x = scope[xRefs[i]];
    const y = scope[yRefs[i]];
    if (x == null || y == null || !isFinite(x) || !isFinite(y)) continue;
    out.push({ x, y });
  }
  return out;
}

interface SeriesData {
  pts: Pt[];
  color: string;
  label?: string;
}

/** Junta las series 1..3 presentes en el spec (todas comparten xRefs). */
function collectSeries(spec: ChartSpec, scope: Scope): SeriesData[] {
  const out: SeriesData[] = [];
  const yLists = [spec.yRefs, spec.y2Refs, spec.y3Refs];
  for (let i = 0; i < yLists.length; i++) {
    const refs = yLists[i];
    if (!refs) continue;
    out.push({
      pts: collectPairs(spec.xRefs, refs, scope),
      color: SERIES_COLORS[i] ?? COLORS.primary,
      label: spec.seriesLabels?.[i],
    });
  }
  return out;
}

/** Banda de especificación: pares (x, lo) y (x, hi) con X de spec.xRefs. */
function collectBand(spec: ChartSpec, scope: Scope): { lo: Pt[]; hi: Pt[] } | null {
  if (!spec.bandLoRefs || !spec.bandHiRefs) return null;
  const lo = collectPairs(spec.xRefs, spec.bandLoRefs, scope);
  const hi = collectPairs(spec.xRefs, spec.bandHiRefs, scope);
  if (lo.length < 2 || hi.length < 2) return null;
  return { lo, hi };
}

// ─── Layout y chrome ─────────────────────────────────────────────────────────

interface PlotRect { left: number; right: number; top: number; bottom: number }

/** Calcula el área de plot con MARGEN IZQUIERDO DINÁMICO según el ancho real de
 *  las etiquetas Y (≈6.2px por carácter a 10px) y genera el chrome (fondo,
 *  título del gráfico y títulos de ejes). */
function layoutPlot(
  spec: ChartSpec,
  width: number,
  height: number,
  yTickLabels: string[],
  legendH = 0,
  opts: ChartOpts = {},
): { plot: PlotRect; chrome: string } {
  // v43.4 — Título interno opcional (en el PDF se muestra a la derecha → noTitle).
  const showTitle = !!spec.title && !opts.noTitle;
  const titleH = showTitle ? 26 : 10;
  const maxChars = Math.max(1, ...yTickLabels.map(s => s.length));
  const yLabelW = Math.ceil(maxChars * 6.2) + 14;   // etiqueta + gap + tick mark
  const CHARW = 6;                                   // ancho aprox de carácter @ ~11px

  // Estimación 1ª pasada (títulos a 1 línea) para decidir si rompen a 2 líneas.
  const estLeft = 6 + (spec.yAxisTitle ? 18 : 0) + yLabelW;
  const estPlotW = (width - 14) - estLeft;
  const estPlotH = (height - 24 - legendH) - titleH;
  const xLines = spec.xAxisTitle ? splitAxisTitle(spec.xAxisTitle, Math.floor(0.9 * estPlotW / CHARW)) : [];
  const yLines = spec.yAxisTitle ? splitAxisTitle(spec.yAxisTitle, Math.floor(0.9 * estPlotH / CHARW)) : [];

  const xAxisH = spec.xAxisTitle ? (xLines.length > 1 ? 31 : 19) : 4;
  const yAxisW = spec.yAxisTitle ? (yLines.length > 1 ? 28 : 16) : 0;
  const left = 6 + yAxisW + yLabelW;
  const right = width - 14;
  const top = titleH;
  // A5 — la leyenda vive DEBAJO del gráfico: el plot cede esa banda inferior.
  const bottom = height - 24 - xAxisH - legendH;    // 24 = tick marks + etiquetas X

  let chrome = `<rect x="0" y="0" width="${width}" height="${height}" fill="${COLORS.bg}" rx="6"/>`;
  if (showTitle) {
    chrome += `<text x="${width / 2}" y="18" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="700" fill="${COLORS.text}">${escapeXml(spec.title!)}</text>`;
  }
  if (xLines.length) {
    const cx = (left + right) / 2;
    const baseY = height - legendH - 6;
    if (xLines.length === 1) {
      chrome += `<text x="${cx}" y="${baseY}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" fill="${COLORS.axisText}">${escapeXml(xLines[0])}</text>`;
    } else {
      chrome += `<text x="${cx}" y="${baseY - 11}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" fill="${COLORS.axisText}">${escapeXml(xLines[0])}</text>`;
      chrome += `<text x="${cx}" y="${baseY}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" fill="${COLORS.axisText}">${escapeXml(xLines[1])}</text>`;
    }
  }
  if (yLines.length) {
    const cy = (top + bottom) / 2;
    if (yLines.length === 1) {
      chrome += `<text x="14" y="${cy}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" fill="${COLORS.axisText}" transform="rotate(-90 14 ${cy})">${escapeXml(yLines[0])}</text>`;
    } else {
      chrome += `<text x="11" y="${cy}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" fill="${COLORS.axisText}" transform="rotate(-90 11 ${cy})">${escapeXml(yLines[0])}</text>`;
      chrome += `<text x="21" y="${cy}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" fill="${COLORS.axisText}" transform="rotate(-90 21 ${cy})">${escapeXml(yLines[1])}</text>`;
    }
  }
  return { plot: { left, right, top, bottom }, chrome };
}

/** v43.4 — Parte un título de eje en 2 líneas (por el espacio más cercano al
 *  centro) si supera `maxChars`. Sin espacios o si cabe → una sola línea. */
function splitAxisTitle(text: string, maxChars: number): string[] {
  if (!text) return [];
  if (text.length <= Math.max(4, maxChars)) return [text];
  const mid = Math.floor(text.length / 2);
  let best = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  if (best < 0) return [text];
  return [text.slice(0, best), text.slice(best + 1)];
}

/** Marco completo del área de plot (4 lados). */
function frameMarkup(plot: PlotRect): string {
  return `<rect x="${plot.left}" y="${plot.top}" width="${plot.right - plot.left}" height="${plot.bottom - plot.top}" fill="none" stroke="${COLORS.frame}" stroke-width="1"/>`;
}

/** Grilla + tick marks + etiquetas del eje Y (compartido por todos los modos).
 *  Mayores en cada tick; menores punteadas en los medios pasos (si hay espacio). */
function yAxisMarkup(plot: PlotRect, scale: NiceScale, sy: (y: number) => number): string {
  let s = '';
  const minorGap = Math.abs(sy(scale.min) - sy(scale.min + scale.step)) / 2;
  const drawMinor = minorGap >= 7;
  for (let i = 0; i < scale.ticks.length; i++) {
    const v = scale.ticks[i];
    const y = sy(v);
    s += `<line x1="${plot.left}" y1="${y.toFixed(1)}" x2="${plot.right}" y2="${y.toFixed(1)}" stroke="${COLORS.gridMajor}" stroke-width="1"/>`;
    s += `<line x1="${plot.left - 4}" y1="${y.toFixed(1)}" x2="${plot.left}" y2="${y.toFixed(1)}" stroke="${COLORS.tick}" stroke-width="1"/>`;
    s += `<text x="${plot.left - 7}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="10" fill="${COLORS.axisText}">${tickLabel(v, scale.decimals)}</text>`;
    if (drawMinor && i < scale.ticks.length - 1) {
      const ym = sy(v + scale.step / 2);
      s += `<line x1="${plot.left}" y1="${ym.toFixed(1)}" x2="${plot.right}" y2="${ym.toFixed(1)}" stroke="${COLORS.gridMinor}" stroke-width="1" stroke-dasharray="2,3"/>`;
    }
  }
  return s;
}

/** Grilla + tick marks + etiquetas del eje X lineal. */
function xAxisMarkupLinear(plot: PlotRect, scale: NiceScale, sx: (x: number) => number): string {
  let s = '';
  const minorGap = Math.abs(sx(scale.min + scale.step) - sx(scale.min)) / 2;
  const drawMinor = minorGap >= 7;
  for (let i = 0; i < scale.ticks.length; i++) {
    const v = scale.ticks[i];
    const x = sx(v);
    s += `<line x1="${x.toFixed(1)}" y1="${plot.top}" x2="${x.toFixed(1)}" y2="${plot.bottom}" stroke="${COLORS.gridMajor}" stroke-width="1"/>`;
    s += `<line x1="${x.toFixed(1)}" y1="${plot.bottom}" x2="${x.toFixed(1)}" y2="${plot.bottom + 4}" stroke="${COLORS.tick}" stroke-width="1"/>`;
    s += `<text x="${x.toFixed(1)}" y="${plot.bottom + 15}" text-anchor="middle" font-family="${FONT}" font-size="10" fill="${COLORS.axisText}">${tickLabel(v, scale.decimals)}</text>`;
    if (drawMinor && i < scale.ticks.length - 1) {
      const xm = sx(v + scale.step / 2);
      s += `<line x1="${xm.toFixed(1)}" y1="${plot.top}" x2="${xm.toFixed(1)}" y2="${plot.bottom}" stroke="${COLORS.gridMinor}" stroke-width="1" stroke-dasharray="2,3"/>`;
    }
  }
  return s;
}

/** Grilla + etiquetas del eje X logarítmico (décadas mayores + sub-ticks 2–9). */
function xAxisMarkupLog(
  plot: PlotRect,
  logMin: number,
  logMax: number,
  sx: (x: number) => number,
): string {
  let s = '';
  const dLo = Math.floor(logMin);
  const dHi = Math.ceil(logMax);
  for (let p = dLo; p <= dHi; p++) {
    const d = Math.pow(10, p);
    const ld = Math.log10(d);
    if (ld >= logMin - 1e-9 && ld <= logMax + 1e-9) {
      const xp = sx(d);
      s += `<line x1="${xp.toFixed(1)}" y1="${plot.top}" x2="${xp.toFixed(1)}" y2="${plot.bottom}" stroke="${COLORS.gridMajor}" stroke-width="1"/>`;
      s += `<line x1="${xp.toFixed(1)}" y1="${plot.bottom}" x2="${xp.toFixed(1)}" y2="${plot.bottom + 4}" stroke="${COLORS.tick}" stroke-width="1"/>`;
      s += `<text x="${xp.toFixed(1)}" y="${plot.bottom + 15}" text-anchor="middle" font-family="${FONT}" font-size="10" fill="${COLORS.axisText}">${decadeLabel(d)}</text>`;
    }
    // Sub-ticks 2–9 dentro de la década (grilla menor punteada)
    for (let m = 2; m <= 9; m++) {
      const v = d * m;
      const lv = Math.log10(v);
      if (lv < logMin - 1e-9 || lv > logMax + 1e-9) continue;
      const xs2 = sx(v);
      s += `<line x1="${xs2.toFixed(1)}" y1="${plot.top}" x2="${xs2.toFixed(1)}" y2="${plot.bottom}" stroke="${COLORS.gridMinor}" stroke-width="1" stroke-dasharray="2,3"/>`;
    }
  }
  return s;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Mensaje de placeholder cuando no hay puntos suficientes. */
function placeholder(width: number, height: number, msg: string, color = COLORS.muted, opts: ChartOpts = {}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.displayW ?? width}" height="${opts.displayH ?? height}" viewBox="0 0 ${width} ${height}">
    <rect x="0" y="0" width="${width}" height="${height}" fill="${COLORS.bg}" rx="6" stroke="${COLORS.gridMajor}" stroke-width="1"/>
    <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${color}">${escapeXml(msg)}</text>
  </svg>`;
}

/** Camino Catmull-Rom suavizado → segmentos cúbicos Bézier. */
function catmullRomPath(pts: { sx: number; sy: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].sx.toFixed(1)} ${pts[0].sy.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.sx + (p2.sx - p0.sx) / 6;
    const c1y = p1.sy + (p2.sy - p0.sy) / 6;
    const c2x = p2.sx - (p3.sx - p1.sx) / 6;
    const c2y = p2.sy - (p3.sy - p1.sy) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.sx.toFixed(1)} ${p2.sy.toFixed(1)}`;
  }
  return d;
}

/** Regresión lineal por mínimos cuadrados. */
function linearRegression(pts: Pt[]): { slope: number; intercept: number; r2: number } {
  const n = pts.length;
  const sumX  = pts.reduce((s, p) => s + p.x, 0);
  const sumY  = pts.reduce((s, p) => s + p.y, 0);
  const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = pts.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  const ssRes = pts.reduce((s, p) => { const yp = slope * p.x + intercept; return s + (p.y - yp) ** 2; }, 0);
  const ssTot = pts.reduce((s, p) => s + (p.y - sumY / n) ** 2, 0);
  const r2 = ssTot !== 0 ? 1 - ssRes / ssTot : 1;
  return { slope, intercept, r2 };
}

/** Ajuste polinómico por mínimos cuadrados (X centrado para estabilidad). */
function polyfitCentered(pts: Pt[], deg: number): { coef: number[]; mx: number } | null {
  if (pts.length < deg + 1) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const c = pts.map(p => ({ x: p.x - mx, y: p.y }));
  const n = deg + 1;
  const A: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const B: number[] = Array(n).fill(0);
  for (const p of c) {
    const pows: number[] = [1];
    for (let k = 1; k <= 2 * deg; k++) pows.push(pows[k - 1] * p.x);
    for (let r = 0; r < n; r++) {
      for (let cc = 0; cc < n; cc++) A[r][cc] += pows[r + cc];
      B[r] += pows[r] * p.y;
    }
  }
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    [B[col], B[piv]] = [B[piv], B[col]];
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col];
      for (let cc = col; cc < n; cc++) A[r][cc] -= f * A[col][cc];
      B[r] -= f * B[col];
    }
  }
  const coef = Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = B[r];
    for (let cc = r + 1; cc < n; cc++) s -= A[r][cc] * coef[cc];
    coef[r] = s / A[r][r];
  }
  return { coef, mx };
}

function polyval(coef: number[], x: number): number {
  let v = 0;
  for (let i = coef.length - 1; i >= 0; i--) v = v * x + coef[i];
  return v;
}

/** A5 — Extremos Y de la curva ajustada (muestreada igual que fitCurvePath):
 *  el dominio del eje Y debe INCLUIR la curva, no solo los puntos — sin esto
 *  el máximo de la polinómica salía cortado por arriba del plot. */
function fitYExtremes(fit: ChartFit, pts: Pt[], logX: boolean): { min: number; max: number } | null {
  if (pts.length < 2) return null;
  const sorted = [...pts].sort((a, b) => a.x - b.x);
  if (fit === 'spline') return null;   // Catmull-Rom pasa por los puntos: sin excursión relevante
  const minX = sorted[0].x, maxX = sorted[sorted.length - 1].x;
  if (minX === maxX) return null;
  let f: ((x: number) => number) | null = null;
  if (fit === 'lineal') {
    const r = linearRegression(sorted);
    f = (x) => r.slope * x + r.intercept;
  } else if (fit === 'poli2' || fit === 'poli3') {
    const pf = polyfitCentered(sorted, fit === 'poli2' ? 2 : 3);
    if (!pf) return null;
    f = (x) => polyval(pf.coef, x - pf.mx);
  } else if (fit === 'loglog') {
    const valid = sorted.filter(p => p.x > 0 && p.y > 0);
    if (valid.length < 2) return null;
    const r = linearRegression(valid.map(p => ({ x: Math.log10(p.x), y: Math.log10(p.y) })));
    f = (x) => (x > 0 ? Math.pow(10, r.slope * Math.log10(x) + r.intercept) : NaN);
  }
  if (!f) return null;
  const N = 60;
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i <= N; i++) {
    const x = logX && minX > 0
      ? Math.pow(10, Math.log10(minX) + ((Math.log10(maxX) - Math.log10(minX)) * i) / N)
      : minX + ((maxX - minX) * i) / N;
    const y = f(x);
    if (!isFinite(y)) continue;
    if (y < mn) mn = y;
    if (y > mx) mx = y;
  }
  return isFinite(mn) && isFinite(mx) ? { min: mn, max: mx } : null;
}

/** Punto máximo ALGEBRAICO de la curva ajustada poli2/poli3 (derivada = 0,
 *  forma cerrada — mismo criterio que PUNTOMAXIMOX/Y del motor). Null si el
 *  ajuste no aplica o es degenerado. Se usa para marcarlo en el gráfico con
 *  líneas de referencia (estilo informe Proctor). */
function fitMaxPoint(fit: ChartFit, pts: Pt[]): Pt | null {
  if (fit !== 'poli2' && fit !== 'poli3') return null;
  const deg = fit === 'poli2' ? 2 : 3;
  if (pts.length < deg + 1) return null;
  const pf = polyfitCentered(pts, deg);
  if (!pf) return null;
  const xs = pts.map(p => p.x - pf.mx);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  if (lo === hi) return null;
  const c = pf.coef;
  const cands: number[] = [lo, hi];
  if (deg === 2) {
    if (Math.abs(c[2]) > 1e-12) cands.push(-c[1] / (2 * c[2]));
  } else {
    const a = 3 * c[3], b = 2 * c[2], cc = c[1];
    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) > 1e-12) cands.push(-cc / b);
    } else {
      const disc = b * b - 4 * a * cc;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        cands.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
      }
    }
  }
  let bx = lo, by = -Infinity;
  for (const x of cands) {
    if (!isFinite(x) || x < lo - 1e-9 || x > hi + 1e-9) continue;
    const xc = Math.min(hi, Math.max(lo, x));
    const y = polyval(c, xc);
    if (y > by) { by = y; bx = xc; }
  }
  return isFinite(by) ? { x: bx + pf.mx, y: by } : null;
}

/** Marcador del punto máximo: líneas de referencia punteadas a ambos ejes +
 *  punto rojo (réplica del estilo del Excel base de informes Proctor). */
function maxPointMarkup(
  pt: Pt,
  plot: PlotRect,
  sx: (x: number) => number,
  sy: (y: number) => number,
): string {
  const px = sx(pt.x), py = sy(pt.y);
  let s = `<line x1="${plot.left}" y1="${py.toFixed(1)}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="#c0392b" stroke-width="1" stroke-dasharray="4,3"/>`;
  s += `<line x1="${px.toFixed(1)}" y1="${plot.bottom}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="#c0392b" stroke-width="1" stroke-dasharray="4,3"/>`;
  s += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="#c0392b" stroke="${COLORS.bg}" stroke-width="1.2"/>`;
  return s;
}

/** Genera el path SVG de la curva ajustada sobre la serie 1.
 *  `sx`/`sy` mapean coordenadas de datos a pantalla. `logX` muestrea en
 *  exponentes (suavidad en escala log). Devuelve '' si no hay ajuste posible. */
function fitCurvePath(
  fit: ChartFit,
  pts: Pt[],
  sx: (x: number) => number,
  sy: (y: number) => number,
  logX: boolean,
): string {
  if (pts.length < 2) return '';
  const sorted = [...pts].sort((a, b) => a.x - b.x);

  if (fit === 'spline') {
    const screen = sorted.map(p => ({ sx: sx(p.x), sy: sy(p.y) }));
    return catmullRomPath(screen);
  }

  const minX = sorted[0].x, maxX = sorted[sorted.length - 1].x;
  if (minX === maxX) return '';
  const N = 60;
  const xs: number[] = [];
  if (logX && minX > 0) {
    const lo = Math.log10(minX), hi = Math.log10(maxX);
    for (let i = 0; i <= N; i++) xs.push(Math.pow(10, lo + ((hi - lo) * i) / N));
  } else {
    for (let i = 0; i <= N; i++) xs.push(minX + ((maxX - minX) * i) / N);
  }

  let f: ((x: number) => number) | null = null;
  if (fit === 'lineal') {
    const r = linearRegression(sorted);
    f = (x) => r.slope * x + r.intercept;
  } else if (fit === 'poli2' || fit === 'poli3') {
    const deg = fit === 'poli2' ? 2 : 3;
    const pf = polyfitCentered(sorted, deg);
    if (!pf) return '';
    f = (x) => polyval(pf.coef, x - pf.mx);
  } else if (fit === 'loglog') {
    const valid = sorted.filter(p => p.x > 0 && p.y > 0);
    if (valid.length < 2) return '';
    const r = linearRegression(valid.map(p => ({ x: Math.log10(p.x), y: Math.log10(p.y) })));
    f = (x) => (x > 0 ? Math.pow(10, r.slope * Math.log10(x) + r.intercept) : NaN);
  }
  if (!f) return '';

  // Construcción del path con "pluma": un valor no-finito levanta la pluma y el
  // siguiente punto reinicia con M. Sin M huérfanos ni trailing (SVG siempre válido).
  let d = '';
  let pen = false;
  for (const x of xs) {
    const y = f(x);
    if (!isFinite(y)) { pen = false; continue; }
    d += `${pen ? ' L' : (d ? ' M' : 'M')} ${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** Etiqueta legible del tipo de ajuste para la leyenda. */
function fitLabel(fit: ChartFit): string {
  switch (fit) {
    case 'lineal': return 'Ajuste lineal';
    case 'poli2':  return 'Ajuste polinómico (g2)';
    case 'poli3':  return 'Ajuste polinómico (g3)';
    case 'spline': return 'Curva suavizada';
    case 'loglog': return 'Ajuste log-log';
  }
}

/** A5 — Layout de la leyenda inferior: filas centradas bajo el gráfico.
 *  Devuelve filas de entradas + alto total que el plot debe ceder. */
function legendLayout(
  entries: { color: string; label: string; dashed?: boolean; point?: boolean }[],
  width: number,
): { rows: { color: string; label: string; dashed?: boolean; point?: boolean; w: number }[][]; height: number } {
  if (entries.length === 0) return { rows: [], height: 0 };
  const fitted = entries.map(e => ({
    ...e,
    label: e.label.length > 28 ? e.label.slice(0, 27) + '…' : e.label,
  })).map(e => ({ ...e, w: e.label.length * 5.4 + 30 }));
  const maxW = width - 24;
  const rows: typeof fitted[] = [];
  let cur: typeof fitted = [];
  let curW = 0;
  for (const e of fitted) {
    if (cur.length > 0 && curW + e.w > maxW) { rows.push(cur); cur = []; curW = 0; }
    cur.push(e);
    curW += e.w;
  }
  if (cur.length) rows.push(cur);
  return { rows, height: rows.length * 14 + 4 };
}

/** A5 — Leyenda DEBAJO del gráfico (ya no tapa la curva). */
function legendMarkup(
  rows: { color: string; label: string; dashed?: boolean; point?: boolean; w: number }[][],
  width: number,
  height: number,
  legendH: number,
): string {
  if (rows.length === 0) return '';
  let s = '';
  const y0 = height - legendH + 10;
  rows.forEach((row, r) => {
    const totalW = row.reduce((acc, e) => acc + e.w, 0);
    let x = (width - totalW) / 2;
    const cy = y0 + r * 14;
    for (const e of row) {
      if (e.point) {
        // v46.1 — serie de PUNTOS → marcador circular (no línea) en la leyenda.
        s += `<circle cx="${(x + 9).toFixed(1)}" cy="${(cy - 3).toFixed(1)}" r="3.5" fill="${e.color}"/>`;
      } else {
        s += `<line x1="${(x + 2).toFixed(1)}" y1="${cy - 3}" x2="${(x + 16).toFixed(1)}" y2="${cy - 3}" stroke="${e.color}" stroke-width="2"${e.dashed ? ' stroke-dasharray="4,3"' : ''}/>`;
      }
      s += `<text x="${(x + 20).toFixed(1)}" y="${cy}" font-family="${FONT}" font-size="9" fill="${COLORS.text}">${escapeXml(e.label)}</text>`;
      x += e.w;
    }
  });
  return s;
}

/** Construye la lista de entradas de leyenda según lo presente en el spec. */
function buildLegendEntries(
  spec: ChartSpec,
  series: SeriesData[],
  hasBand: boolean,
  hasFit: boolean,
  hasMaxPoint = false,
): { color: string; label: string; dashed?: boolean; point?: boolean }[] {
  const entries: { color: string; label: string; dashed?: boolean; point?: boolean }[] = [];
  const needLegend = series.length > 1 || hasBand || hasFit || (spec.seriesLabels?.some(Boolean) ?? false);
  if (!needLegend) return entries;
  series.forEach((s, i) => {
    // v46.1 — La serie se dibuja como PUNTOS sueltos (no línea) en scatter, o cuando la
    // serie 1 tiene curva de ajuste (los puntos van sueltos y la curva los conecta).
    // En esos casos la leyenda debe mostrar un CÍRCULO, no una línea.
    const point = spec.mode === 'scatter' || (i === 0 && hasFit);
    entries.push({ color: s.color, label: s.label ?? `Serie ${i + 1}`, ...(point ? { point: true } : {}) });
  });
  if (hasBand) entries.push({ color: COLORS.band, label: 'Especificación', dashed: true });
  if (hasFit && spec.fit) entries.push({ color: COLORS.regression, label: fitLabel(spec.fit), dashed: true });
  if (hasMaxPoint) entries.push({ color: '#c0392b', label: 'Punto máximo', dashed: true });
  return entries;
}

/** Área sombreada de la banda de especificación (lo→hi), con bordes punteados. */
function bandMarkup(
  band: { lo: Pt[]; hi: Pt[] },
  sx: (x: number) => number,
  sy: (y: number) => number,
): string {
  const lo = [...band.lo].sort((a, b) => a.x - b.x);
  const hi = [...band.hi].sort((a, b) => a.x - b.x);
  const loPath = lo.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  const hiBack = [...hi].reverse().map(p => `L ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  let s = `<path d="${loPath} ${hiBack} Z" fill="${COLORS.band}" fill-opacity="0.13"/>`;
  const linePath = (pts: Pt[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  s += `<path d="${linePath(lo)}" fill="none" stroke="${COLORS.band}" stroke-width="1" stroke-dasharray="5,3"/>`;
  s += `<path d="${linePath(hi)}" fill="none" stroke="${COLORS.band}" stroke-width="1" stroke-dasharray="5,3"/>`;
  return s;
}

// ─── Renderer principal ────────────────────────────────────────────────────

export function renderChartSvg(spec: ChartSpec, scope: Scope, opts: ChartOpts = {}): string {
  // v43.4 — El LAYOUT se hace a un ancho BASE fijo (470) conservando el aspecto
  // pedido, y el SVG se EMITE al tamaño solicitado vía viewBox. Así las fuentes,
  // trazos y paddings escalan proporcionalmente cuando el gráfico se reduce.
  const reqW = Math.max(110, opts.width ?? 480);
  const reqH = Math.max(80, opts.height ?? 260);
  // Ancho de LAYOUT (fijo). Cuanto menor, mayor es la fuente relativa al gráfico al
  // escalar por viewBox. 360 ⇒ en 1 columna (display ~440) la letra sale ~1.2× más
  // grande que el layout (antes 470 la dejaba pequeña).
  const width = 360;
  const height = Math.max(150, Math.round(width * reqH / reqW));  // alto de layout (mismo aspecto)
  opts = { ...opts, displayW: reqW, displayH: reqH };

  if (spec.xRefs.length !== spec.yRefs.length && spec.mode !== 'bars') {
    return placeholder(width, height, 'Las listas X e Y deben tener la misma cantidad.', '#ef4444', opts);
  }

  const pts = collectPairs(spec.xRefs, spec.yRefs, scope);
  if (pts.length < 2 && spec.mode !== 'bars') {
    return placeholder(width, height, 'Ingresa más valores para visualizar el gráfico.', COLORS.muted, opts);
  }
  if (pts.length < 1 && spec.mode === 'bars') {
    return placeholder(width, height, 'Ingresa valores para visualizar las barras.', COLORS.muted, opts);
  }

  switch (spec.mode) {
    case 'line':
    case 'smooth':
      return renderLine(spec, scope, width, height, opts);
    case 'bars':
      return renderBars(spec, pts, width, height, opts);
    case 'log-x':
      return renderLogX(spec, scope, width, height, opts);
    case 'scatter':
      return renderScatter(spec, scope, width, height, opts);
  }
}

/** Dominio Y conjunto de series + banda (para que nada quede fuera del plot). */
function yDomain(series: SeriesData[], band: { lo: Pt[]; hi: Pt[] } | null): { minY: number; maxY: number } {
  const ys: number[] = [];
  for (const s of series) for (const p of s.pts) ys.push(p.y);
  if (band) { for (const p of band.lo) ys.push(p.y); for (const p of band.hi) ys.push(p.y); }
  return { minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Dominio X conjunto (series + banda). */
function xDomain(series: SeriesData[], band: { lo: Pt[]; hi: Pt[] } | null): { minX: number; maxX: number } {
  const xs: number[] = [];
  for (const s of series) for (const p of s.pts) xs.push(p.x);
  if (band) { for (const p of band.lo) xs.push(p.x); for (const p of band.hi) xs.push(p.x); }
  return { minX: Math.min(...xs), maxX: Math.max(...xs) };
}

function renderLine(
  spec: ChartSpec,
  scope: Scope,
  width: number,
  height: number,
  opts: ChartOpts = {},
): string {
  const series = collectSeries(spec, scope);
  const band = collectBand(spec, scope);
  const { minX, maxX } = xDomain(series, band);
  let { minY, maxY } = yDomain(series, band);

  // A5 — el ajuste y su máximo entran al dominio Y (la curva ya no se corta).
  const fitOk = !!spec.fit && (series[0]?.pts.length ?? 0) >= 2;
  const maxPt = fitOk && (spec.fit === 'poli2' || spec.fit === 'poli3')
    ? fitMaxPoint(spec.fit, series[0].pts) : null;
  if (fitOk) {
    const ext = fitYExtremes(spec.fit!, series[0].pts, false);
    if (ext) { minY = Math.min(minY, ext.min); maxY = Math.max(maxY, ext.max); }
  }
  if (maxPt) { minY = Math.min(minY, maxPt.y); maxY = Math.max(maxY, maxPt.y); }

  const xScale = niceScale(minX, maxX, 7);
  const yScale = niceScale(minY, maxY, 6);
  const yLabels = yScale.ticks.map(v => tickLabel(v, yScale.decimals));
  const _legEntries = buildLegendEntries(spec, series, !!band, fitOk, !!maxPt);
  if (opts.legendSink) opts.legendSink.push(..._legEntries);
  const legend = opts.noLegend ? { rows: [] as any[], height: 0 } : legendLayout(_legEntries, width);
  const { plot, chrome } = layoutPlot(spec, width, height, yLabels, legend.height, opts);

  const sx = (x: number) => plot.left + ((x - xScale.min) / (xScale.max - xScale.min)) * (plot.right - plot.left);
  const sy = (y: number) => plot.bottom - ((y - yScale.min) / (yScale.max - yScale.min)) * (plot.bottom - plot.top);

  const clipId = `plotclip-${++_clipSeq}`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.displayW ?? width}" height="${opts.displayH ?? height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<defs><clipPath id="${clipId}"><rect x="${plot.left}" y="${plot.top}" width="${plot.right - plot.left}" height="${plot.bottom - plot.top}"/></clipPath></defs>`;
  svg += chrome;
  svg += xAxisMarkupLinear(plot, xScale, sx);
  svg += yAxisMarkup(plot, yScale, sy);
  svg += frameMarkup(plot);

  if (band) svg += `<g clip-path="url(#${clipId})">${bandMarkup(band, sx, sy)}</g>`;

  for (let si = 0; si < series.length; si++) {
    const s = series[si];
    if (s.pts.length < 2) continue;
    const screenPts = s.pts.map(p => ({ sx: sx(p.x), sy: sy(p.y) }));
    // v34 — Si la serie 1 tiene curva de ajuste, los puntos van SUELTOS (scatter):
    // la polinómica ES la que conecta visualmente los datos, no líneas directas
    // entre puntos (estilo informe Proctor del Excel base).
    const drawLine = !(si === 0 && spec.fit);
    if (drawLine) {
      if (spec.mode === 'smooth') {
        svg += `<path d="${catmullRomPath(screenPts)}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round"/>`;
      } else {
        const poly = screenPts.map(p => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ');
        svg += `<polyline points="${poly}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
    }
    for (const p of screenPts) {
      svg += `<circle cx="${p.sx.toFixed(1)}" cy="${p.sy.toFixed(1)}" r="3.5" fill="${COLORS.bg}" stroke="${s.color}" stroke-width="1.5"/>`;
    }
  }

  if (fitOk) {
    const d = fitCurvePath(spec.fit!, series[0].pts, sx, sy, false);
    if (d) {
      svg += `<g clip-path="url(#${clipId})"><path d="${d}" fill="none" stroke="${COLORS.regression}" stroke-width="1.8"/></g>`;
      // Punto máximo algebraico con líneas de referencia (poli2/poli3).
      if (maxPt) svg += `<g clip-path="url(#${clipId})">${maxPointMarkup(maxPt, plot, sx, sy)}</g>`;
    }
  }

  svg += legendMarkup(legend.rows, width, height, legend.height);
  svg += '</svg>';
  return svg;
}

function renderBars(
  spec: ChartSpec,
  pts: Pt[],
  width: number,
  height: number,
  opts: ChartOpts = {},
): string {
  // Cada `pts[i]` es una barra. x = índice categórico (se ignora valor para layout).
  // Las extensiones v32 (series extra, banda, ajuste) no aplican a barras.
  const ys = pts.map(p => p.y);
  // El eje Y de un gráfico de barras SIEMPRE incluye el 0 (baseline).
  const yScale = niceScale(Math.min(0, ...ys), Math.max(0, ...ys), 6);
  const yLabels = yScale.ticks.map(v => tickLabel(v, yScale.decimals));
  const { plot, chrome } = layoutPlot(spec, width, height, yLabels, 0, opts);

  const sy = (y: number) => plot.bottom - ((y - yScale.min) / (yScale.max - yScale.min)) * (plot.bottom - plot.top);
  const slot = (plot.right - plot.left) / pts.length;
  const barW = Math.min(slot * 0.7, 40);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.displayW ?? width}" height="${opts.displayH ?? height}" viewBox="0 0 ${width} ${height}">${chrome}`;
  svg += yAxisMarkup(plot, yScale, sy);
  svg += frameMarkup(plot);

  // Línea base en y=0 (más marcada que la grilla)
  svg += `<line x1="${plot.left}" y1="${sy(0).toFixed(1)}" x2="${plot.right}" y2="${sy(0).toFixed(1)}" stroke="${COLORS.tick}" stroke-width="1"/>`;

  for (let i = 0; i < pts.length; i++) {
    const cx = plot.left + slot * (i + 0.5);
    const x = cx - barW / 2;
    const y0 = sy(0);
    const y1 = sy(pts[i].y);
    const top = Math.min(y0, y1);
    const h = Math.abs(y0 - y1);
    svg += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${COLORS.primary}" rx="2"/>`;
    // Etiqueta de valor: sobre la barra si es positiva, DEBAJO si es negativa
    // (antes quedaba dentro de la barra negativa, ilegible).
    const labelY = pts[i].y >= 0 ? top - 3 : top + h + 11;
    svg += `<text x="${cx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="9" font-weight="600" fill="${COLORS.text}">${fmt(pts[i].y)}</text>`;
    // Etiqueta de categoría debajo (usa el valor X como label si es numérico)
    svg += `<text x="${cx.toFixed(1)}" y="${(plot.bottom + 15).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="10" fill="${COLORS.axisText}">${fmt(pts[i].x)}</text>`;
  }
  svg += '</svg>';
  return svg;
}

function renderLogX(
  spec: ChartSpec,
  scope: Scope,
  width: number,
  height: number,
  opts: ChartOpts = {},
): string {
  const allSeries = collectSeries(spec, scope);
  // Filtra puntos con x<=0 (no graficables en log)
  const series = allSeries.map(s => ({ ...s, pts: s.pts.filter(p => p.x > 0) }));
  if ((series[0]?.pts.length ?? 0) < 2) {
    return placeholder(width, height, 'Granulometría: X debe ser positiva (escala log).', '#ef4444', opts);
  }
  const rawBand = collectBand(spec, scope);
  const band = rawBand
    ? { lo: rawBand.lo.filter(p => p.x > 0), hi: rawBand.hi.filter(p => p.x > 0) }
    : null;
  const bandOk = band && band.lo.length >= 2 && band.hi.length >= 2 ? band : null;

  const { minX, maxX } = xDomain(series, bandOk);
  let { minY, maxY } = yDomain(series, bandOk);

  // A5 — el ajuste y su máximo entran al dominio Y (la curva ya no se corta).
  const fitOk = !!spec.fit && (series[0]?.pts.length ?? 0) >= 2;
  const maxPt = fitOk && (spec.fit === 'poli2' || spec.fit === 'poli3')
    ? fitMaxPoint(spec.fit!, series[0].pts) : null;
  if (fitOk) {
    const ext = fitYExtremes(spec.fit!, series[0].pts, true);
    if (ext) { minY = Math.min(minY, ext.min); maxY = Math.max(maxY, ext.max); }
  }
  if (maxPt) { minY = Math.min(minY, maxPt.y); maxY = Math.max(maxY, maxPt.y); }

  // X log: el dominio se encuadra a DÉCADAS COMPLETAS alrededor de los datos
  // (convención de las curvas granulométricas: 0.01 → 100 mm). El epsilon evita
  // que un dato exactamente en una década (p.ej. 100) abra una década extra.
  const logMin = Math.floor(Math.log10(minX) + 1e-9);
  const logMax = Math.ceil(Math.log10(maxX) - 1e-9);
  const logRange = logMax - logMin || 1;

  const yScale = niceScale(minY, maxY, 6);
  const yLabels = yScale.ticks.map(v => tickLabel(v, yScale.decimals));
  const _legEntries = buildLegendEntries(spec, series, !!bandOk, fitOk, !!maxPt);
  if (opts.legendSink) opts.legendSink.push(..._legEntries);
  const legend = opts.noLegend ? { rows: [] as any[], height: 0 } : legendLayout(_legEntries, width);
  const { plot, chrome } = layoutPlot(spec, width, height, yLabels, legend.height, opts);

  const sx = (x: number) => plot.left + ((Math.log10(x) - logMin) / logRange) * (plot.right - plot.left);
  const sy = (y: number) => plot.bottom - ((y - yScale.min) / (yScale.max - yScale.min)) * (plot.bottom - plot.top);

  const clipId = `plotclip-${++_clipSeq}`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.displayW ?? width}" height="${opts.displayH ?? height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<defs><clipPath id="${clipId}"><rect x="${plot.left}" y="${plot.top}" width="${plot.right - plot.left}" height="${plot.bottom - plot.top}"/></clipPath></defs>`;
  svg += chrome;
  svg += xAxisMarkupLog(plot, logMin, logMax, sx);
  svg += yAxisMarkup(plot, yScale, sy);
  svg += frameMarkup(plot);

  if (bandOk) svg += `<g clip-path="url(#${clipId})">${bandMarkup(bandOk, sx, sy)}</g>`;

  for (const s of series) {
    if (s.pts.length < 2) continue;
    // Ordena por X creciente (granulometría se grafica de tamiz menor a mayor)
    const sortedPts = [...s.pts].sort((a, b) => a.x - b.x);
    const screenPts = sortedPts.map(p => ({ sx: sx(p.x), sy: sy(p.y) }));
    const polyline = screenPts.map(p => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ');
    svg += `<polyline points="${polyline}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    for (const p of screenPts) {
      svg += `<circle cx="${p.sx.toFixed(1)}" cy="${p.sy.toFixed(1)}" r="3" fill="${COLORS.bg}" stroke="${s.color}" stroke-width="1.5"/>`;
    }
  }

  if (fitOk) {
    const d = fitCurvePath(spec.fit!, series[0].pts, sx, sy, true);
    if (d) {
      svg += `<g clip-path="url(#${clipId})"><path d="${d}" fill="none" stroke="${COLORS.regression}" stroke-width="1.6" stroke-dasharray="5,3"/></g>`;
      if (maxPt) svg += `<g clip-path="url(#${clipId})">${maxPointMarkup(maxPt, plot, sx, sy)}</g>`;
    }
  }

  svg += legendMarkup(legend.rows, width, height, legend.height);
  svg += '</svg>';
  return svg;
}

function renderScatter(
  spec: ChartSpec,
  scope: Scope,
  width: number,
  height: number,
  opts: ChartOpts = {},
): string {
  const series = collectSeries(spec, scope);
  const band = collectBand(spec, scope);
  const { minX, maxX } = xDomain(series, band);
  let { minY, maxY } = yDomain(series, band);

  // A5 — el ajuste y su máximo entran al dominio Y (la curva ya no se corta).
  const fitOk = !!spec.fit && (series[0]?.pts.length ?? 0) >= 2;
  const maxPt = fitOk && (spec.fit === 'poli2' || spec.fit === 'poli3')
    ? fitMaxPoint(spec.fit!, series[0].pts) : null;
  if (fitOk) {
    const ext = fitYExtremes(spec.fit!, series[0].pts, false);
    if (ext) { minY = Math.min(minY, ext.min); maxY = Math.max(maxY, ext.max); }
  }
  if (maxPt) { minY = Math.min(minY, maxPt.y); maxY = Math.max(maxY, maxPt.y); }

  const xScale = niceScale(minX, maxX, 7);
  const yScale = niceScale(minY, maxY, 6);
  const yLabels = yScale.ticks.map(v => tickLabel(v, yScale.decimals));
  const _legEntries = buildLegendEntries(spec, series, !!band, fitOk, !!maxPt);
  if (opts.legendSink) opts.legendSink.push(..._legEntries);
  const legend = opts.noLegend ? { rows: [] as any[], height: 0 } : legendLayout(_legEntries, width);
  const { plot, chrome } = layoutPlot(spec, width, height, yLabels, legend.height, opts);

  const sx = (x: number) => plot.left + ((x - xScale.min) / (xScale.max - xScale.min)) * (plot.right - plot.left);
  const sy = (y: number) => plot.bottom - ((y - yScale.min) / (yScale.max - yScale.min)) * (plot.bottom - plot.top);

  const clipId = `plotclip-${++_clipSeq}`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.displayW ?? width}" height="${opts.displayH ?? height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<defs><clipPath id="${clipId}"><rect x="${plot.left}" y="${plot.top}" width="${plot.right - plot.left}" height="${plot.bottom - plot.top}"/></clipPath></defs>`;
  svg += chrome;
  svg += xAxisMarkupLinear(plot, xScale, sx);
  svg += yAxisMarkup(plot, yScale, sy);
  svg += frameMarkup(plot);

  if (band) svg += `<g clip-path="url(#${clipId})">${bandMarkup(band, sx, sy)}</g>`;

  const pts = series[0]?.pts ?? [];

  // Curva ajustada: el `fit` explícito reemplaza a la recta de regresión default.
  let hasFit = false;
  if (fitOk && pts.length >= 2) {
    const d = fitCurvePath(spec.fit!, pts, sx, sy, false);
    if (d) {
      svg += `<g clip-path="url(#${clipId})"><path d="${d}" fill="none" stroke="${COLORS.regression}" stroke-width="1.8"/></g>`;
      hasFit = true;
      // Punto máximo algebraico con líneas de referencia (poli2/poli3).
      if (maxPt) svg += `<g clip-path="url(#${clipId})">${maxPointMarkup(maxPt, plot, sx, sy)}</g>`;
    }
  }
  if (!hasFit && pts.length >= 2) {
    // Regresión lineal + R² (comportamiento histórico de gr7)
    const reg = linearRegression(pts);
    const y1 = reg.slope * xScale.min + reg.intercept;
    const y2 = reg.slope * xScale.max + reg.intercept;
    svg += `<g clip-path="url(#${clipId})"><line x1="${sx(xScale.min).toFixed(1)}" y1="${sy(y1).toFixed(1)}" x2="${sx(xScale.max).toFixed(1)}" y2="${sy(y2).toFixed(1)}" stroke="${COLORS.regression}" stroke-width="1.5" stroke-dasharray="4,3"/></g>`;
    // R² abajo a la izquierda para no chocar con la leyenda (arriba a la derecha)
    svg += `<text x="${plot.left + 6}" y="${plot.bottom - 8}" text-anchor="start" font-family="${FONT}" font-size="10" font-weight="700" fill="${COLORS.regression}">R² = ${reg.r2.toFixed(3)}</text>`;
  }

  for (const s of series) {
    for (const p of s.pts) {
      svg += `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3.5" fill="${s.color}" fill-opacity="0.75"/>`;
    }
  }

  svg += legendMarkup(legend.rows, width, height, legend.height);
  svg += '</svg>';
  return svg;
}
