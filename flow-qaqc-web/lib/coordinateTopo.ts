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
