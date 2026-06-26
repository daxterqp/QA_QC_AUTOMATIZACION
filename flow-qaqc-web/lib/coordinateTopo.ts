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
