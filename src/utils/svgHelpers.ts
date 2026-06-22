/**
 * svgHelpers — generadores de paths SVG reutilizables (UI + PDF inline).
 *
 * Funciones puras, sin estado. Salida = strings de coordenadas SVG.
 */

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

export interface PieSliceDescriptor extends PieSlice {
  pathD: string;
  percent: number;
}

/** Construye los `path d` para un pie chart dado un set de slices.
 *  Devuelve para cada slice el descriptor con `pathD` listo para usar en
 *  <Path d=...> (UI) o en `<path d="...">` (PDF inline). */
export function buildPieSlicePaths(
  slices: PieSlice[],
  size: number,
): PieSliceDescriptor[] {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;
  const total = slices.reduce((a, s) => a + Math.max(0, s.value), 0);
  if (total <= 0) return [];

  // Caso especial: un solo slice → círculo completo (no se puede dibujar arco
  // de 360° con A/L; se construye como 2 semicírculos).
  if (slices.length === 1) {
    return [{
      ...slices[0],
      percent: 1,
      pathD:
        `M ${cx - r} ${cy} ` +
        `A ${r} ${r} 0 1 1 ${cx + r} ${cy} ` +
        `A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`,
    }];
  }

  const out: PieSliceDescriptor[] = [];
  let angle = -Math.PI / 2; // inicio a las 12 en punto
  for (const s of slices) {
    const value = Math.max(0, s.value);
    if (value === 0) {
      out.push({ ...s, percent: 0, pathD: '' });
      continue;
    }
    const frac = value / total;
    const sweep = frac * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle + sweep);
    const y2 = cy + r * Math.sin(angle + sweep);
    const largeArc = sweep > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    out.push({ ...s, percent: frac, pathD: d });
    angle += sweep;
  }
  return out;
}

export interface TimelineSegmentLite {
  startMs: number;
  endMs: number;
  color: string;
}

/** Genera <rect> SVG inline para una línea de tiempo horizontal. */
export function buildTimelineRectsSvg(
  segments: TimelineSegmentLite[],
  fromMs: number,
  toMs: number,
  width: number,
  height: number,
  emptyColor: string = '#D1D5DB',
): string {
  const span = Math.max(1, toMs - fromMs);
  const out: string[] = [];
  out.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${emptyColor}" />`);
  for (const seg of segments) {
    const s = Math.max(fromMs, seg.startMs);
    const e = Math.min(toMs, seg.endMs);
    if (e <= s) continue;
    const x = ((s - fromMs) / span) * width;
    const w = Math.max(1, ((e - s) / span) * width);
    out.push(`<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="${seg.color}" />`);
  }
  return out.join('');
}

function readableTextColor(bgHex: string): string {
  const h = bgHex.replace('#', '');
  if (h.length !== 6) return '#fff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1f2937' : '#ffffff';
}

/** Convierte la lista de slices a SVG inline completo (para PDF). v31: incluye
 *  los porcentajes dentro de cada slice (oculta si la fracción es <6%). */
export function buildPieSvg(
  slices: PieSlice[],
  size: number,
): string {
  const paths = buildPieSlicePaths(slices, size);
  const inner = paths.filter(p => p.pathD).map(p =>
    `<path d="${p.pathD}" fill="${p.color}" stroke="#fff" stroke-width="0.5" />`
  ).join('');
  const cx = size / 2, cy = size / 2, labelR = size * 0.32;
  let accum = -Math.PI / 2;
  const labels = paths.map(p => {
    const sweep = p.percent * Math.PI * 2;
    const mid = accum + sweep / 2;
    accum += sweep;
    return { pct: Math.round(p.percent * 100), x: cx + Math.cos(mid) * labelR, y: cy + Math.sin(mid) * labelR, color: readableTextColor(p.color), visible: p.percent >= 0.06 };
  });
  const texts = labels.map(l => l.visible
    ? `<text x="${l.x.toFixed(2)}" y="${(l.y + 3).toFixed(2)}" fill="${l.color}" font-size="${Math.max(9, Math.round(size * 0.075))}" font-weight="700" text-anchor="middle">${l.pct}%</text>`
    : ''
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${inner}${texts}</svg>`;
}
