/**
 * chartMath — Matemática y paleta de los gráficos del Dashboard (Tablas Resumen).
 *
 * ⚠ ESPEJO EXACTO: src/utils/chartMath.ts ↔ flow-qaqc-web/lib/chartMath.ts
 * Ambos archivos deben mantenerse byte a byte iguales. Toda la lógica pura del
 * gráfico (rangos, marcas, regresión, suavizado, colores) vive aquí para que el
 * móvil y la PC no puedan divergir; lo ÚNICO que difiere entre plataformas es el
 * render (react-native-svg vs SVG del DOM).
 */

/** Tipo de línea de tendencia por gráfico. */
export type Trend = 'none' | 'linear' | 'quad' | 'cubic';
/** Unión de puntos (tipo Excel). */
export type Join = 'none' | 'linear' | 'smooth';

/** Config persistida de un gráfico (misma forma en móvil y web). */
export type ChartCfg = {
  id: string; yKey: string; trend: Trend;
  yMin?: number | null; yMax?: number | null;
  xMin?: string | null; xMax?: string | null;
  xVertical?: boolean;
  limMin?: number | null; limMax?: number | null;
  showEq?: boolean;      // ecuación de ajuste (default OFF)
  showStats?: boolean;   // media/σ/n (default ON; undefined = ON)
  showLegend?: boolean;  // leyenda de líneas (default OFF)
  showVGrid?: boolean;   // cuadrícula vertical (default ON; undefined = ON)
  xKey?: string | null;  // variable del eje X (null = Tiempo)
  join?: Join;           // unión de puntos (default 'none')
  vxMin?: number | null; vxMax?: number | null; // rango X manual (solo variable)
  // Separación manual entre divisiones (null = automática). El paso de X se
  // interpreta en unidades de la variable, o en DÍAS cuando el eje X es tiempo.
  yStep?: number | null; xStep?: number | null;
};

// ── Paleta ───────────────────────────────────────────────────────────────────
export const AXIS_GRAY = '#c3ccd8';   // ejes + cuadrícula horizontal (mismo plomo)
export const VGRID_GRAY = '#e4e9f0';  // cuadrícula vertical (más clara)
export const C_MAX = '#c90c0c';       // límite máximo
export const C_MIN = '#254ca5';       // límite mínimo
export const C_TREND = '#1fcc79';     // línea de tendencia
export const C_POINT = '#1a4f7a';     // puntos de ensayo
export const DAY_MS = 86400000;
export const V_DIV = 6;               // divisiones verticales automáticas (modo tiempo)

/** Rango Y "bonito": centra los valores TÍPICOS (cuantiles 10-90, los atípicos no
 *  participan del centrado) + padding 25% a cada lado. Overrides manuales mandan.
 *  Degenerado (todos iguales) → abre una ventana mínima. */
export function niceYRange(ys: number[], yMinCfg?: number | null, yMaxCfg?: number | null): { lo: number; hi: number } {
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

/** Paso "bonito" (1 · 2 · 2.5 · 5 · 10 ×10^k) para ~target divisiones. */
export function niceStep(range: number, target: number): number {
  if (!(range > 0) || target <= 0) return 1;
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return mult * mag;
}

/** Marcas redondas DENTRO de [lo,hi] (el rango del eje no se altera). */
export function niceTicks(lo: number, hi: number, target: number): { ticks: number[]; step: number } {
  const step = niceStep(hi - lo, target);
  const ticks: number[] = [];
  const start = Math.ceil(lo / step - 1e-9) * step;
  for (let v = start, guard = 0; v <= hi + step * 1e-9 && guard < 64; v += step, guard++) {
    ticks.push(Number(v.toFixed(10)));
  }
  return { ticks, step };
}

/** Marcas con separación FIJA (la que pide el usuario). Devuelve null si el paso
 *  es inválido o generaría demasiadas líneas → se cae a automático. */
export function ticksWithStep(lo: number, hi: number, step?: number | null): number[] | null {
  if (step == null || !Number.isFinite(step) || step <= 0) return null;
  const count = (hi - lo) / step;
  if (!Number.isFinite(count) || count > 60) return null;
  const out: number[] = [];
  const start = Math.ceil(lo / step - 1e-9) * step;
  for (let v = start, g = 0; v <= hi + step * 1e-9 && g < 64; v += step, g++) out.push(Number(v.toFixed(10)));
  return out.length ? out : null;
}

/** Regresión polinómica (mínimos cuadrados) para la tendencia. */
export function polyfit(xs: number[], ys: number[], degree: number): number[] | null {
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
export const polyval = (coef: number[], x: number) => coef.reduce((acc, c, i) => acc + c * x ** i, 0);

/** Formato compacto de coeficientes (3-4 cifras significativas; notación
 *  científica solo para magnitudes extremas). */
export function fmtCoef(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e5)) return v.toExponential(2);
  return String(Number(v.toPrecision(4)));
}
const SUP = ['', '', '²', '³'];
/** coef en base i (coef[0] + coef[1]·sym + …); sym = 't' (días) o 'x' (variable). */
export function equationStr(coef: number[], degree: number, sym = 't'): string {
  let s = '';
  for (let i = degree; i >= 0; i--) {
    const c = coef[i]; if (!Number.isFinite(c)) continue;
    const body = i === 0 ? fmtCoef(Math.abs(c)) : `${fmtCoef(Math.abs(c))}·${sym}${SUP[i] || ''}`;
    if (s === '') s = (c < 0 ? '−' : '') + body;
    else s += (c < 0 ? ' − ' : ' + ') + body;
  }
  return `y = ${s}`;
}

/** Coeficiente de determinación del ajuste. */
export function rSquared(ys: number[], yhat: number[]): number | null {
  const n = ys.length; if (n < 2) return null;
  const mean = ys.reduce((a, b) => a + b, 0) / n;
  const ssTot = ys.reduce((a, b) => a + (b - mean) ** 2, 0);
  if (ssTot <= 0) return 1;
  const ssRes = ys.reduce((a, b, i) => a + (b - yhat[i]) ** 2, 0);
  return 1 - ssRes / ssTot;
}

/** Camino suavizado (spline Catmull-Rom → curvas Bézier) por los puntos YA
 *  ordenados por X, como la "línea suavizada" de Excel. */
export function smoothPath(pts: { x: number; y: number }[]): string {
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

/** Estadística descriptiva de la serie Y. */
export function describe(ys: number[]): { n: number; mean: number; std: number } {
  const n = ys.length;
  const mean = n ? ys.reduce((a, b) => a + b, 0) / n : 0;
  const std = n > 1 ? Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, std };
}

/** Decimales de las marcas: los de la columna, subiendo la precisión solo si el
 *  paso entre marcas lo exige (rangos chicos). */
export function tickDecimals(step: number, columnDecimals?: number): number {
  const needed = step > 0 ? Math.max(0, Math.min(6, Math.ceil(-Math.log10(step)))) : 0;
  return Math.max(columnDecimals ?? 0, needed);
}

/** Fecha corta dd/mm/aa para el eje de tiempo. */
export function fmtShortDate(tm: number): string {
  const d = new Date(tm);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
}
