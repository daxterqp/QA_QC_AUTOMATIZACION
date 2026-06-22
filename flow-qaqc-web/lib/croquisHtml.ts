/**
 * croquisHtml (web, v43.6) — Croquis VECTORIAL para el PDF: sectores + ensayo dibujados
 * en SVG, opcionalmente SOBRE la ortofoto del proyecto (georreferenciada por bounds), o
 * sobre fondo blanco. Sin Google Maps (la web no tiene MapView). Layout espejo del móvil:
 * mapa a la IZQUIERDA, leyenda a la DERECHA (como un gráfico). Función PURA (sin I/O).
 */

export interface CroquisSectorIn { name: string; color: string; points: { lat: number; lng: number }[] }
export interface CroquisOrtho { dataUri: string; swLat: number; swLng: number; neLat: number; neLng: number }
export interface CroquisFigureOpts {
  sectors: CroquisSectorIn[];                 // sectores con geometría del proyecto
  point: { lat: number; lng: number };        // ensayo
  ortho?: CroquisOrtho | null;
  showOrtho: boolean;
  baseOpacity: number;                        // 0.3–1 (scrim blanco = 1 - baseOpacity)
  pointSize: number;                          // px del ícono del ensayo
  imgWidth: number;                           // ancho de la imagen (1col 380 / 2col 150)
}

const GRAY = '#9ca3af';
const CW = 400, CH = 300;   // lienzo 4:3 del SVG (viewBox)

function escHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Punto-en-polígono (ray casting) en lat/lng. */
function pointInPolygon(pt: { lat: number; lng: number }, poly: { lat: number; lng: number }[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  const x = pt.lng, y = pt.lat;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng, yi = poly[i].lat, xj = poly[j].lng, yj = poly[j].lat;
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/** Construye la figura del croquis (SVG + leyenda) lista para embeber en el HTML del PDF. */
export function buildCroquisFigureHtml(opts: CroquisFigureOpts): string {
  const { sectors, point, ortho, showOrtho, baseOpacity, pointSize, imgWidth } = opts;
  const imgHeight = Math.round(imgWidth * 0.75);

  // ── bbox de sectores + ensayo, con padding y ajuste a 4:3 (corregido por cos lat) ──
  const all: { lat: number; lng: number }[] = [point];
  for (const s of sectors) for (const p of s.points) all.push(p);
  let minLat = Math.min(...all.map(p => p.lat)), maxLat = Math.max(...all.map(p => p.lat));
  let minLng = Math.min(...all.map(p => p.lng)), maxLng = Math.max(...all.map(p => p.lng));
  let latSpan = (maxLat - minLat) || 0.0008;
  let lngSpan = (maxLng - minLng) || 0.0008;
  // padding 18%
  minLat -= latSpan * 0.18; maxLat += latSpan * 0.18; minLng -= lngSpan * 0.18; maxLng += lngSpan * 0.18;
  latSpan = maxLat - minLat; lngSpan = maxLng - minLng;
  const cosLat = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180) || 1;
  // Forzar relación geográfica = 4:3 (geoW = lngSpan*cosLat, geoH = latSpan).
  const targetRatio = CW / CH; // 4/3
  const geoW = lngSpan * cosLat, geoH = latSpan;
  if (geoW / geoH > targetRatio) {
    // demasiado ancho → expandir lat
    const needH = geoW / targetRatio;
    const extra = (needH - geoH);
    minLat -= extra / 2; maxLat += extra / 2;
  } else {
    const needW = geoH * targetRatio;            // en unidades geo-corregidas
    const extraLng = (needW - geoW) / cosLat;    // de vuelta a grados de lng
    minLng -= extraLng / 2; maxLng += extraLng / 2;
  }
  latSpan = maxLat - minLat; lngSpan = maxLng - minLng;
  const X = (lng: number) => ((lng - minLng) / lngSpan) * CW;
  const Y = (lat: number) => ((maxLat - lat) / latSpan) * CH;

  // ── Fondo: ortofoto (clip al viewBox) o blanco ──
  let bg = `<rect x="0" y="0" width="${CW}" height="${CH}" fill="#ffffff"/>`;
  let scrim = '';
  if (showOrtho && ortho) {
    const ix = X(ortho.swLng), iright = X(ortho.neLng), iy = Y(ortho.neLat), ibottom = Y(ortho.swLat);
    const iw = iright - ix, ih = ibottom - iy;
    if (iw > 0 && ih > 0) {
      bg = `<image href="${ortho.dataUri}" x="${ix.toFixed(1)}" y="${iy.toFixed(1)}" width="${iw.toFixed(1)}" height="${ih.toFixed(1)}" preserveAspectRatio="none"/>`;
      const op = Math.max(0, Math.min(0.7, 1 - baseOpacity));
      if (op > 0) scrim = `<rect x="0" y="0" width="${CW}" height="${CH}" fill="#ffffff" opacity="${op.toFixed(2)}"/>`;
    }
  }

  // ── Sectores: activo (contiene el ensayo) a color; el resto, plomo ──
  const activeSectors: { name: string; color: string }[] = [];
  let hasOther = false;
  let polys = '';
  for (const s of sectors) {
    if (!s.points || s.points.length < 3) continue;
    const active = pointInPolygon(point, s.points);
    const col = active ? (s.color || '#1a4f7a') : GRAY;
    if (active) activeSectors.push({ name: s.name, color: s.color || '#1a4f7a' }); else hasOther = true;
    const pts = s.points.map(p => `${X(p.lng).toFixed(1)},${Y(p.lat).toFixed(1)}`).join(' ');
    polys += `<polygon points="${pts}" fill="${col}${active ? '40' : '22'}" stroke="${col}" stroke-width="${active ? 2 : 1.2}" stroke-linejoin="round"/>`;
  }
  const r = Math.max(3, (pointSize / 2) * (CW / Math.max(1, imgWidth)));
  const dot = `<circle cx="${X(point.lng).toFixed(1)}" cy="${Y(point.lat).toFixed(1)}" r="${r.toFixed(1)}" fill="#c0392b" stroke="#fff" stroke-width="${Math.max(1.5, r / 3.5).toFixed(1)}"/>`;

  const svg = `<svg viewBox="0 0 ${CW} ${CH}" width="${imgWidth}" height="${imgHeight}" preserveAspectRatio="xMidYMid meet" style="display:block;border:1px solid #d8dee6;border-radius:5px;background:#fff;">${bg}${scrim}${polys}${dot}</svg>`;

  // ── Leyenda (a la derecha, como un gráfico) ──
  const row = (swatch: string, label: string) => `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">${swatch}<span style="font-size:9px;color:#333;line-height:1.15;">${escHtml(label)}</span></div>`;
  const dotSw = `<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#c0392b;border:1.5px solid #fff;box-shadow:0 0 0 1px #c0392b;flex-shrink:0;"></span>`;
  const box = (c: string) => `<span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${c}66;border:1.5px solid ${c};flex-shrink:0;"></span>`;
  const mapName = (showOrtho && ortho) ? 'Ortofoto' : '';
  let rows = row(dotSw, 'Ensayo');
  if (hasOther) rows += row(box(GRAY), 'Otros sectores');
  for (const s of activeSectors) rows += row(box(s.color), s.name);
  const legend = `
    <div style="font-size:9.5px;font-weight:700;color:#6b7280;margin-bottom:6px;">Croquis de ubicación del ensayo</div>
    ${rows}
    ${mapName ? `<div style="font-size:8.5px;color:#9ca3af;margin-top:5px;font-style:italic;">${escHtml(mapName)}</div>` : ''}`;

  return `<div style="display:flex;gap:12px;align-items:center;justify-content:center;margin:8px 0 6px;page-break-inside:avoid;">
    <div style="flex:0 0 ${imgWidth}px;">${svg}</div>
    <div style="flex:0 1 auto;min-width:0;">${legend}</div>
  </div>`;
}
