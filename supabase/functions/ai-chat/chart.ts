/**
 * chart.ts — Gráfico de tendencia como SVG string (Deno, sin dependencias).
 *
 * Mirror conceptual de flow-qaqc-web/lib/reports/chart.ts (que usa @resvg — un
 * addon nativo de Node NO disponible en Edge Functions). Aquí devolvemos el SVG
 * crudo y el MÓVIL lo pinta con `SvgXml` de react-native-svg (ya instalada).
 * Línea de datos + puntos + recta de tendencia punteada (mínimos cuadrados).
 */

export interface ChartPoint { x: string; y: number } // x = YYYY-MM-DD

/** Tipos de gráfico del PUENTE compartido: el mismo spec (kind + title +
 *  points) alimenta a Flo hoy y a futuros renderers (reportes ya tienen su
 *  gemelo en flow-qaqc-web/lib/reports/chart.ts — mantener la paridad al
 *  agregar tipos nuevos aquí Y allá). */
export type ChartKind = 'linea' | 'barras';

/** Punto de entrada único del puente. Devuelve '' si no hay datos suficientes. */
export function renderChartSvg(kind: ChartKind, title: string, points: ChartPoint[]): string {
  return kind === 'barras' ? renderBarChartSvg(title, points) : renderTrendChartSvg(title, points);
}

const W = 640, H = 360;
const M = { top: 44, right: 22, bottom: 44, left: 56 };
const NAVY = '#0e213d', PRIMARY = '#394e7d', GRID = '#e2e8f0', MUTED = '#64748b';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Escala "bonita" (mirror del espíritu de niceScale del chartRenderer). */
function niceTicks(min: number, max: number, n = 5): number[] {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2.5 ? 5 : norm >= 2 ? 2.5 : norm >= 1 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step * 0.001; v += step) out.push(+v.toFixed(10));
  return out;
}

const dmy = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[3]}/${m[2]}` : ymd;
};

/** SVG de línea con tendencia. Devuelve '' si hay <2 puntos válidos. */
export function renderTrendChartSvg(title: string, rawPoints: ChartPoint[]): string {
  // Defensa: una fecha no parseable produciría cx="NaN" y el SVG no renderiza.
  const points = rawPoints.filter(p =>
    Number.isFinite(new Date(p.x + 'T00:00:00Z').getTime()) && Number.isFinite(p.y));
  if (points.length < 2) return '';
  const xs = points.map(p => new Date(p.x + 'T00:00:00Z').getTime());
  const ys = points.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const plotW = W - M.left - M.right, plotH = H - M.top - M.bottom;
  const X = (t: number) => M.left + (x1 === x0 ? plotW / 2 : ((t - x0) / (x1 - x0)) * plotW);
  const Y = (v: number) => M.top + plotH - ((v - y0) / (y1 - y0)) * plotH;

  // Tendencia (mínimos cuadrados sobre días).
  const n = points.length;
  const dx = xs.map(t => (t - x0) / 86400000);
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sx += dx[i]; sy += ys[i]; sxy += dx[i] * ys[i]; sxx += dx[i] * dx[i]; }
  const den = n * sxx - sx * sx;
  const slope = Math.abs(den) < 1e-12 ? 0 : (n * sxy - sx * sy) / den;
  const inter = (sy - slope * sx) / n;
  const tAt = (t: number) => inter + slope * ((t - x0) / 86400000);

  const gridLines = ticks.map(v =>
    `<line x1="${M.left}" y1="${Y(v).toFixed(1)}" x2="${W - M.right}" y2="${Y(v).toFixed(1)}" stroke="${GRID}" stroke-width="1"/>` +
    `<text x="${M.left - 8}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="11" fill="${MUTED}">${+v.toFixed(4)}</text>`
  ).join('');

  // Etiquetas X: primera, media(s), última (máx ~5).
  const nx = Math.min(5, n);
  const xLabels = Array.from({ length: nx }, (_, i) => {
    const idx = Math.round((i * (n - 1)) / (nx - 1));
    const t = xs[idx];
    return `<text x="${X(t).toFixed(1)}" y="${H - M.bottom + 18}" text-anchor="middle" font-size="11" fill="${MUTED}">${dmy(points[idx].x)}</text>`;
  }).join('');

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(xs[i]).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  const dots = points.map((p, i) =>
    `<circle cx="${X(xs[i]).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.2" fill="${NAVY}" stroke="#ffffff" stroke-width="1.2"/>`
  ).join('');
  const trend = `<line x1="${X(x0).toFixed(1)}" y1="${Y(Math.max(y0, Math.min(y1, tAt(x0)))).toFixed(1)}" x2="${X(x1).toFixed(1)}" y2="${Y(Math.max(y0, Math.min(y1, tAt(x1)))).toFixed(1)}" stroke="${PRIMARY}" stroke-width="2" stroke-dasharray="6 5" opacity="0.85"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff" rx="8"/>
  <text x="${M.left}" y="26" font-size="15" font-weight="bold" fill="${NAVY}">${esc(title)}</text>
  ${gridLines}
  <line x1="${M.left}" y1="${M.top}" x2="${M.left}" y2="${H - M.bottom}" stroke="${MUTED}" stroke-width="1.2"/>
  <line x1="${M.left}" y1="${H - M.bottom}" x2="${W - M.right}" y2="${H - M.bottom}" stroke="${MUTED}" stroke-width="1.2"/>
  ${xLabels}
  <path d="${path}" fill="none" stroke="${NAVY}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
  ${trend}
  ${dots}
  <text x="${W - M.right}" y="26" text-anchor="end" font-size="11" fill="${MUTED}">— datos  ‑ ‑ tendencia</text>
</svg>`;
}

const MAX_BARS = 48;

/** Barras verticales sobre eje categórico de fechas (ancladas en 0). Si hay
 *  más de MAX_BARS puntos, se muestran los más RECIENTES (con nota). */
export function renderBarChartSvg(title: string, rawPoints: ChartPoint[]): string {
  const valid = rawPoints.filter(p =>
    Number.isFinite(new Date(p.x + 'T00:00:00Z').getTime()) && Number.isFinite(p.y));
  if (valid.length === 0) return '';
  const clipped = valid.length > MAX_BARS;
  const points = clipped ? valid.slice(-MAX_BARS) : valid;
  const ys = points.map(p => p.y);
  const ticks = niceTicks(Math.min(0, ...ys), Math.max(0, ...ys));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const plotW = W - M.left - M.right, plotH = H - M.top - M.bottom;
  const Y = (v: number) => M.top + plotH - ((v - y0) / (y1 - y0)) * plotH;
  const step = plotW / points.length;
  const barW = Math.max(2, step * 0.68);

  const gridLines = ticks.map(v =>
    `<line x1="${M.left}" y1="${Y(v).toFixed(1)}" x2="${W - M.right}" y2="${Y(v).toFixed(1)}" stroke="${GRID}" stroke-width="1"/>` +
    `<text x="${M.left - 8}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="11" fill="${MUTED}">${+v.toFixed(4)}</text>`
  ).join('');

  const bars = points.map((p, i) => {
    const x = M.left + i * step + (step - barW) / 2;
    const yTop = Y(Math.max(0, p.y));
    const h = Math.abs(Y(p.y) - Y(0));
    return `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0.5, h).toFixed(1)}" fill="${NAVY}" opacity="0.88" rx="1.5"/>`;
  }).join('');

  // Etiquetas X: hasta 6, repartidas (centradas bajo su barra).
  const nx = Math.min(6, points.length);
  const xLabels = Array.from({ length: nx }, (_, i) => {
    const idx = nx === 1 ? 0 : Math.round((i * (points.length - 1)) / (nx - 1));
    const cx = M.left + idx * step + step / 2;
    return `<text x="${cx.toFixed(1)}" y="${H - M.bottom + 18}" text-anchor="middle" font-size="11" fill="${MUTED}">${dmy(points[idx].x)}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff" rx="8"/>
  <text x="${M.left}" y="26" font-size="15" font-weight="bold" fill="${NAVY}">${esc(title)}</text>
  ${gridLines}
  <line x1="${M.left}" y1="${M.top}" x2="${M.left}" y2="${H - M.bottom}" stroke="${MUTED}" stroke-width="1.2"/>
  <line x1="${M.left}" y1="${Y(Math.max(y0, Math.min(y1, 0))).toFixed(1)}" x2="${W - M.right}" y2="${Y(Math.max(y0, Math.min(y1, 0))).toFixed(1)}" stroke="${MUTED}" stroke-width="1.2"/>
  ${xLabels}
  ${bars}
  ${clipped ? `<text x="${W - M.right}" y="26" text-anchor="end" font-size="11" fill="${MUTED}">últimos ${MAX_BARS} datos</text>` : ''}
</svg>`;
}
