/**
 * coordinateTopo.ts (web) — Asignación de sector con TOLERANCIA para el módulo
 * topográfico. Espejo EXACTO de findSectorByPointWithTolerance de
 * src/utils/CoordinateSystem.ts. Usa proyección equirectangular local a metros
 * (sin proj4): exacta para distancias chicas (el "radio de gracia" en metros).
 */

export interface LatLng { lat: number; lng: number }

/** Ray casting estándar (lat/lng directo; distorsión despreciable a escala de obra). */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  const x = point.lng, y = point.lat;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = ((yi > y) !== (yj > y)) &&
                       (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

const M_PER_DEG_LAT = 111_320;

function llToLocalMeters(p: LatLng, origin: LatLng): { x: number; y: number } {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return { x: (p.lng - origin.lng) * mPerDegLng, y: (p.lat - origin.lat) * M_PER_DEG_LAT };
}

function pointSegDistanceM(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Paso 1 dentro→gana (dist 0); Paso 2 si fuera, distancia mínima al borde;
 * Paso 3 más cercano si ≤ toleranceM, si no null. `toleranceM` en metros (0 = estricto).
 */
export function findSectorByPointWithTolerance(
  point: LatLng,
  sectors: { id: string; name: string; points: LatLng[] | null }[],
  toleranceM: number,
): { id: string; name: string; distanceM: number } | null {
  for (const s of sectors) {
    if (!s.points || s.points.length < 3) continue;
    if (pointInPolygon(point, s.points)) return { id: s.id, name: s.name, distanceM: 0 };
  }
  let best: { id: string; name: string; distanceM: number } | null = null;
  for (const s of sectors) {
    if (!s.points || s.points.length < 3) continue;
    const verts = s.points.map((v) => llToLocalMeters(v, point));
    let dmin = Infinity;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const d = pointSegDistanceM(0, 0, verts[j].x, verts[j].y, verts[i].x, verts[i].y);
      if (d < dmin) dmin = d;
    }
    if (!best || dmin < best.distanceM) best = { id: s.id, name: s.name, distanceM: dmin };
  }
  if (best && Number.isFinite(toleranceM) && best.distanceM <= toleranceM) return best;
  return null;
}

// ─── v100b — Progresivas de OBRA LINEAL (chainage) ──────────────────────────
// ESPEJO EXACTO de src/utils/CoordinateSystem.ts — mantener sincronizado.
// El "tramo" de un ensayo = su sector (point-in-polygon). La progresiva se obtiene
// proyectando el punto sobre el EJE del polígono del tramo y escalando por la
// LONGITUD DECLARADA (station_end − station_start).

export interface TramoInfo {
  id: string;
  name: string;
  points: LatLng[] | null;
  stationStart: number | null;
  stationEnd: number | null;
}
export interface ChainageResult {
  tramoId: string;
  tramoName: string;
  progresiva: number;
  subtramoIndex: number;
}

type LocalPt = { x: number; y: number };
const _finiteTramo = (t: TramoInfo): boolean =>
  !!t.points && t.points.length >= 3 &&
  typeof t.stationStart === 'number' && Number.isFinite(t.stationStart) &&
  typeof t.stationEnd === 'number' && Number.isFinite(t.stationEnd) &&
  (t.stationEnd as number) > (t.stationStart as number);

function _centroidLocal(points: LatLng[], origin: LatLng): LocalPt {
  let sx = 0, sy = 0;
  for (const p of points) { const m = llToLocalMeters(p, origin); sx += m.x; sy += m.y; }
  return { x: sx / points.length, y: sy / points.length };
}

function _principalAxis(pts: LocalPt[]): [LocalPt, LocalPt] {
  const n = pts.length;
  let mx = 0, my = 0;
  for (const p of pts) { mx += p.x; my += p.y; }
  mx /= n; my /= n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(theta), uy = Math.sin(theta);
  let tmin = Infinity, tmax = -Infinity, pmin = pts[0], pmax = pts[0];
  for (const p of pts) {
    const t = (p.x - mx) * ux + (p.y - my) * uy;
    if (t < tmin) { tmin = t; pmin = p; }
    if (t > tmax) { tmax = t; pmax = p; }
  }
  return [pmin, pmax];
}

function _tramoAxisLocal(points: LatLng[], origin: LatLng): [LocalPt, LocalPt] {
  const pts = points.map((p) => llToLocalMeters(p, origin));
  if (pts.length === 4) {
    const len = (a: LocalPt, b: LocalPt) => Math.hypot(a.x - b.x, a.y - b.y);
    const mid = (a: LocalPt, b: LocalPt): LocalPt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const sum02 = len(pts[0], pts[1]) + len(pts[2], pts[3]);
    const sum13 = len(pts[1], pts[2]) + len(pts[3], pts[0]);
    return sum02 <= sum13
      ? [mid(pts[0], pts[1]), mid(pts[2], pts[3])]
      : [mid(pts[1], pts[2]), mid(pts[3], pts[0])];
  }
  return _principalAxis(pts);
}

export function subtramoCount(stationStart: number, stationEnd: number, subLenM: number): number {
  const len = stationEnd - stationStart;
  const sub = (subLenM > 0 && Number.isFinite(subLenM)) ? subLenM : len;
  return Math.max(1, Math.ceil(len / sub - 1e-9));
}

export function computeChainage(
  point: LatLng,
  tramos: TramoInfo[],
  subtramoLengthM: number,
): ChainageResult | null {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  const valid = tramos.filter(_finiteTramo);
  if (valid.length === 0) return null;

  const container = valid.find((t) => pointInPolygon(point, t.points as LatLng[]));
  if (!container) return null;

  const origin = point;

  const ordered = [...valid].sort((a, b) => (a.stationStart as number) - (b.stationStart as number));
  let dir: LocalPt;
  if (ordered.length >= 2) {
    const c0 = _centroidLocal(ordered[0].points as LatLng[], origin);
    const cN = _centroidLocal(ordered[ordered.length - 1].points as LatLng[], origin);
    dir = { x: cN.x - c0.x, y: cN.y - c0.y };
  } else {
    const [a, b] = _tramoAxisLocal(container.points as LatLng[], origin);
    dir = { x: b.x - a.x, y: b.y - a.y };
  }
  if (dir.x === 0 && dir.y === 0) dir = { x: 1, y: 0 };

  let [A, B] = _tramoAxisLocal(container.points as LatLng[], origin);
  if ((B.x - A.x) * dir.x + (B.y - A.y) * dir.y < 0) { const tmp = A; A = B; B = tmp; }

  const abx = B.x - A.x, aby = B.y - A.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? ((-A.x) * abx + (-A.y) * aby) / len2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;

  const s0 = container.stationStart as number;
  const s1 = container.stationEnd as number;
  const progresiva = s0 + t * (s1 - s0);

  const subLen = (subtramoLengthM > 0 && Number.isFinite(subtramoLengthM)) ? subtramoLengthM : (s1 - s0);
  const nSub = subtramoCount(s0, s1, subLen);
  let idx = Math.floor((progresiva - s0) / subLen);
  if (idx < 0) idx = 0; else if (idx > nSub - 1) idx = nSub - 1;

  return { tramoId: container.id, tramoName: container.name, progresiva, subtramoIndex: idx };
}

/** Formatea una progresiva en metros al convención "km+mmm(.d)": 12.5→"0+012.5",
 *  375→"0+375", 1080→"1+080". */
export function formatProgresiva(m: number): string {
  if (!Number.isFinite(m)) return '—';
  const neg = m < 0;
  const rounded = Math.round(Math.abs(m) * 10) / 10;
  const km = Math.floor(rounded / 1000);
  const rest = rounded - km * 1000;
  const rInt = Math.floor(rest);
  const dec = Math.round((rest - rInt) * 10);
  const decStr = dec > 0 ? `.${dec}` : '';
  return `${neg ? '-' : ''}${km}+${String(rInt).padStart(3, '0')}${decStr}`;
}

/** Rango de progresivas de un subtramo, ej "0+000 – 0+060". */
export function subtramoRangeLabel(stationStart: number, idx: number, subLenM: number, stationEnd: number): string {
  const s = stationStart + idx * subLenM;
  const e = Math.min(stationStart + (idx + 1) * subLenM, stationEnd);
  return `${formatProgresiva(s)} – ${formatProgresiva(e)}`;
}

// ─── v44 — Conversión de coordenadas topográficas → WGS84 (espejo del móvil) ───
import proj4 from 'proj4';

export type CoordinateSystem = 'WGS84_LATLNG' | 'WGS84_UTM' | 'PSAD56_LATLNG' | 'PSAD56_UTM';

proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs('EPSG:4248', '+proj=longlat +ellps=intl +towgs84=-288,175,-376,0,0,0,0 +no_defs');

function utmEpsgCode(datum: 'WGS84' | 'PSAD56', zone: number, hemisphere: 'N' | 'S'): string {
  if (!Number.isInteger(zone) || zone < 1 || zone > 60) throw new Error(`Zona UTM fuera de rango: ${zone}`);
  let code: string;
  if (datum === 'WGS84') code = `EPSG:${hemisphere === 'N' ? 32600 + zone : 32700 + zone}`;
  else code = `EPSG:PSAD56_UTM_${hemisphere}_${zone}`;
  if (!proj4.defs(code)) {
    const south = hemisphere === 'S' ? ' +south' : '';
    if (datum === 'WGS84') proj4.defs(code, `+proj=utm +zone=${zone}${south} +datum=WGS84 +units=m +no_defs`);
    else proj4.defs(code, `+proj=utm +zone=${zone}${south} +ellps=intl +towgs84=-288,175,-376,0,0,0,0 +units=m +no_defs`);
  }
  return code;
}

export function autoDetectUtmZone(lng: number): number {
  const z = Math.floor((lng + 180) / 6) + 1;
  return z < 1 ? 1 : z > 60 ? 60 : z;
}

export function utmToWgs84(easting: number, northing: number, zone: number, datum: 'WGS84' | 'PSAD56' = 'WGS84', hemisphere: 'N' | 'S' = 'S'): LatLng {
  const [lng, lat] = proj4(utmEpsgCode(datum, zone, hemisphere), 'EPSG:4326', [easting, northing]);
  return { lat, lng };
}

export function psad56LatLngToWgs84(lat: number, lng: number): LatLng {
  const [wgsLng, wgsLat] = proj4('EPSG:4248', 'EPSG:4326', [lng, lat]);
  return { lat: wgsLat, lng: wgsLng };
}

/** Zona UTM + hemisferio del proyecto, del centroide de los polígonos de sectores. */
export function utmFrameFromSectors(sectors: { points: LatLng[] | null }[]): { zone: number; hemisphere: 'N' | 'S' } | null {
  let sumLat = 0, sumLng = 0, n = 0;
  for (const s of sectors) for (const p of (s.points ?? [])) {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) { sumLat += p.lat; sumLng += p.lng; n++; }
  }
  if (n === 0) return null;
  const lat = sumLat / n, lng = sumLng / n;
  return { zone: autoDetectUtmZone(lng), hemisphere: lat < 0 ? 'S' : 'N' };
}

/** Convierte (c1=Este/X/lng, c2=Norte/Y/lat) a WGS84 lat/lng según el sistema del proyecto. */
export function topoCoordsToLatLng(
  c1: number, c2: number, system: CoordinateSystem,
  frame: { zone: number; hemisphere: 'N' | 'S' } | null,
): LatLng | null {
  if (!Number.isFinite(c1) || !Number.isFinite(c2)) return null;
  if (system === 'WGS84_LATLNG') return { lat: c2, lng: c1 };
  if (system === 'PSAD56_LATLNG') return psad56LatLngToWgs84(c2, c1);
  if (!frame) return null;
  const datum = system === 'PSAD56_UTM' ? 'PSAD56' : 'WGS84';
  try { return utmToWgs84(c1, c2, frame.zone, datum, frame.hemisphere); } catch { return null; }
}
