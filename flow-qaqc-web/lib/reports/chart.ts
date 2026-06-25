/**
 * chart.ts — Render server-side de los gráficos del reporte (sin navegador): un SVG simple de
 * línea/barras (x = fecha de ensayo, y = valor de la columna del resumen) → PNG con @resvg/resvg-js.
 * Independiente de chartRenderer (que es por-celda); este es por-fila del resumen.
 */
import { Resvg } from '@resvg/resvg-js';

export interface ChartPoint { x: string; y: number }
export interface ReportChartInput { title: string; type: 'line' | 'bars'; points: ChartPoint[]; color?: string }

const W = 680, H = 300, ML = 58, MR = 20, MT = 40, MB = 64;
const PLOT_W = W - ML - MR, PLOT_H = H - MT - MB;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtNum = (v: number) => { const a = Math.abs(v); const d = a >= 100 ? 0 : a >= 1 ? 1 : 2; return v.toFixed(d); };

/** SVG de un gráfico del reporte. Si no hay datos, devuelve un placeholder. */
export function renderReportChartSvg(input: ReportChartInput): string {
  const pts = input.points.filter(p => Number.isFinite(p.y));
  const color = input.color ?? '#00bcb4';
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect width="100%" height="100%" fill="#ffffff"/>`
    + `<text x="${W / 2}" y="24" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#1e293b">${esc(input.title)}</text>`;
  if (pts.length === 0) {
    return head + `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#94a3b8">Sin datos</text></svg>`;
  }

  const ys = pts.map(p => p.y);
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const span = yMax - yMin; yMin -= span * 0.1; yMax += span * 0.1;
  const xOf = (i: number) => ML + (pts.length === 1 ? PLOT_W / 2 : (i / (pts.length - 1)) * PLOT_W);
  const yOf = (v: number) => MT + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H;
  const base = MT + PLOT_H;

  let body = '';
  for (let i = 0; i <= 4; i++) {
    const tk = yMin + (yMax - yMin) * i / 4;
    const y = yOf(tk);
    body += `<line x1="${ML}" y1="${y.toFixed(1)}" x2="${ML + PLOT_W}" y2="${y.toFixed(1)}" stroke="#eef0f3" stroke-width="1"/>`;
    body += `<text x="${ML - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-family="Arial, sans-serif" font-size="11" fill="#64748b">${fmtNum(tk)}</text>`;
  }

  if (input.type === 'bars') {
    const bw = pts.length === 1 ? 40 : Math.max(6, Math.min(48, (PLOT_W / pts.length) * 0.6));
    pts.forEach((p, i) => {
      const x = xOf(i), y = yOf(p.y);
      body += `<rect x="${(x - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, base - y).toFixed(1)}" fill="${color}" rx="2"/>`;
    });
  } else {
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.y).toFixed(1)}`).join(' ');
    body += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    pts.forEach((p, i) => { body += `<circle cx="${xOf(i).toFixed(1)}" cy="${yOf(p.y).toFixed(1)}" r="3" fill="${color}"/>`; });
  }

  const step = Math.max(1, Math.ceil(pts.length / 8));
  pts.forEach((p, i) => {
    if (i % step !== 0 && i !== pts.length - 1) return;
    body += `<text x="${xOf(i).toFixed(1)}" y="${base + 18}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#64748b">${esc((p.x || '').slice(0, 10))}</text>`;
  });
  body += `<line x1="${ML}" y1="${base}" x2="${ML + PLOT_W}" y2="${base}" stroke="#cbd5e1" stroke-width="1"/>`;
  body += `<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${base}" stroke="#cbd5e1" stroke-width="1"/>`;

  return head + body + '</svg>';
}

/** Rasteriza un SVG a PNG (Buffer) con resvg. Doble resolución para que se vea nítido en el correo. */
export function svgToPng(svg: string): Buffer {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: W * 2 }, font: { loadSystemFonts: true } });
  return Buffer.from(r.render().asPng());
}
