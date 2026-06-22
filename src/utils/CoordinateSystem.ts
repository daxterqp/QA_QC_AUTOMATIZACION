/**
 * CoordinateSystem.ts — Conversiones rigurosas entre sistemas geodésicos.
 *
 * Sistemas soportados:
 *  - WGS84 Lat/Lng     (EPSG:4326) — nativo del GPS del celular
 *  - WGS84 UTM         (EPSG:32717/32718/32719) — zonas 17S/18S/19S Perú
 *  - PSAD56 Lat/Lng    (EPSG:4248)
 *  - PSAD56 UTM        (EPSG:24877/24878/24879) — zonas 17S/18S/19S Perú
 *
 * Transformación de datum WGS84 ↔ PSAD56 usa parámetros Bursa-Wolf de 3
 * parámetros para Perú (towgs84: -288, +175, -376) — los oficiales del IGN.
 * Precisión típica: ±1m, suficiente para uso de georeferenciación de ensayos.
 *
 * Los polígonos de sectores y las coords almacenadas SIEMPRE están en WGS84
 * Lat/Lng canónico. El sistema configurado por el proyecto solo afecta el
 * DISPLAY al usuario. La conversión es lazy en el momento de mostrar.
 *
 * Algoritmo point-in-polygon (ray casting) opera en WGS84 directo — esto es
 * aceptable porque los polígonos de obra son pequeños (km a decenas de km),
 * la distorsión por usar coords geográficas como cartesianas es despreciable.
 */

import proj4 from 'proj4';

export type CoordinateSystem = 'WGS84_LATLNG' | 'WGS84_UTM' | 'PSAD56_LATLNG' | 'PSAD56_UTM';

// Definiciones EPSG estáticas (datums geográficos).
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs('EPSG:4248', '+proj=longlat +ellps=intl +towgs84=-288,175,-376,0,0,0,0 +no_defs');

// B5 — Registro dinámico lazy de zonas UTM (1..60), ambos hemisferios y ambos
// datums. Esto evita el fallback silencioso "cualquier zona ≠ 17,18,19 → 19"
// que producía coords desplazadas por cientos de km cuando un proyecto cae en
// otra zona (Bolivia=20, Chile=18-19, Colombia=18, etc.).
function utmEpsgCode(datum: 'WGS84' | 'PSAD56', zone: number, hemisphere: 'N' | 'S'): string {
  if (!Number.isInteger(zone) || zone < 1 || zone > 60) {
    throw new Error(`Zona UTM fuera de rango: ${zone} (válido: 1..60)`);
  }
  let code: string;
  if (datum === 'WGS84') {
    code = `EPSG:${hemisphere === 'N' ? 32600 + zone : 32700 + zone}`;
  } else {
    // PSAD56 — EPSG estándar solo cubre zonas 17S/18S/19S (24877/8/9 sur, 24817/8/9 norte).
    // Para zonas fuera, generamos definición ad-hoc con los parámetros Bursa-Wolf de Perú.
    code = `EPSG:PSAD56_UTM_${hemisphere}_${zone}`;
  }
  if (!proj4.defs(code)) {
    const south = hemisphere === 'S' ? ' +south' : '';
    if (datum === 'WGS84') {
      proj4.defs(code, `+proj=utm +zone=${zone}${south} +datum=WGS84 +units=m +no_defs`);
    } else {
      proj4.defs(code, `+proj=utm +zone=${zone}${south} +ellps=intl +towgs84=-288,175,-376,0,0,0,0 +units=m +no_defs`);
    }
  }
  return code;
}

export interface LatLng { lat: number; lng: number }
export interface UtmCoord { zone: number; hemisphere: 'N' | 'S'; easting: number; northing: number }

/** Auto-detecta zona UTM para una longitud (Perú: zonas 17, 18, 19 sur).
 *  Acota a 1..60 — en lng=±180 la fórmula daría zona 61, fuera de rango. */
export function autoDetectUtmZone(lng: number): number {
  const z = Math.floor((lng + 180) / 6) + 1;
  if (z < 1) return 1;
  if (z > 60) return 60;
  return z;
}

/** Convierte WGS84 lat/lng → coordenadas UTM (cualquier zona). */
export function wgs84ToUtm(lat: number, lng: number, zone?: number): UtmCoord {
  const z = zone ?? autoDetectUtmZone(lng);
  const hemisphere: 'N' | 'S' = lat < 0 ? 'S' : 'N';
  const epsg = utmEpsgCode('WGS84', z, hemisphere);
  const [easting, northing] = proj4('EPSG:4326', epsg, [lng, lat]);
  return { zone: z, hemisphere, easting, northing };
}

/** Convierte WGS84 lat/lng → PSAD56 lat/lng (datum transformation). */
export function wgs84ToPsad56LatLng(lat: number, lng: number): LatLng {
  const [psadLng, psadLat] = proj4('EPSG:4326', 'EPSG:4248', [lng, lat]);
  return { lat: psadLat, lng: psadLng };
}

/** Convierte WGS84 lat/lng → PSAD56 UTM. */
export function wgs84ToPsad56Utm(lat: number, lng: number, zone?: number): UtmCoord {
  const z = zone ?? autoDetectUtmZone(lng);
  const hemisphere: 'N' | 'S' = lat < 0 ? 'S' : 'N';
  const epsg = utmEpsgCode('PSAD56', z, hemisphere);
  const [easting, northing] = proj4('EPSG:4326', epsg, [lng, lat]);
  return { zone: z, hemisphere, easting, northing };
}

/** Convierte UTM → WGS84 lat/lng (para importar coords proyectadas).
 *  El hemisferio se asume S por defecto (caso Perú); pasar 'N' explícito si aplica. */
export function utmToWgs84(easting: number, northing: number, zone: number, datum: 'WGS84' | 'PSAD56' = 'WGS84', hemisphere: 'N' | 'S' = 'S'): LatLng {
  const epsg = utmEpsgCode(datum, zone, hemisphere);
  const [lng, lat] = proj4(epsg, 'EPSG:4326', [easting, northing]);
  return { lat, lng };
}

/** Convierte PSAD56 lat/lng → WGS84 lat/lng (al importar coords en PSAD56). */
export function psad56LatLngToWgs84(lat: number, lng: number): LatLng {
  const [wgsLng, wgsLat] = proj4('EPSG:4248', 'EPSG:4326', [lng, lat]);
  return { lat: wgsLat, lng: wgsLng };
}

// ─── Formateo para display ──────────────────────────────────────────────────

/** Devuelve string legible de las coords en el sistema solicitado.
 *  Entrada SIEMPRE en WGS84 lat/lng (canónico). */
export function formatCoords(lat: number, lng: number, system: CoordinateSystem): string {
  if (system === 'WGS84_LATLNG') {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
  if (system === 'WGS84_UTM') {
    const u = wgs84ToUtm(lat, lng);
    return `Zona ${u.zone}${u.hemisphere} · E:${u.easting.toFixed(0)} N:${u.northing.toFixed(0)}`;
  }
  if (system === 'PSAD56_LATLNG') {
    const p = wgs84ToPsad56LatLng(lat, lng);
    return `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)} (PSAD56)`;
  }
  if (system === 'PSAD56_UTM') {
    const u = wgs84ToPsad56Utm(lat, lng);
    return `Zona ${u.zone}${u.hemisphere} · E:${u.easting.toFixed(0)} N:${u.northing.toFixed(0)} (PSAD56)`;
  }
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

// ─── Point-in-polygon (ray casting) ─────────────────────────────────────────

/** Algoritmo ray casting estándar. Funciona con polígono en sentido horario o
 *  antihorario indiferentemente. Coords en WGS84 lat/lng directo (la distorsión
 *  geográfica es despreciable para polígonos de obra <50km). */
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

/** Encuentra el primer sector del proyecto cuya geometría contiene el punto.
 *  Sectores sin geometría (pointsJson=null) se ignoran. */
export function findSectorByPoint(
  point: LatLng,
  sectors: { id: string; name: string; points: LatLng[] | null }[],
): { id: string; name: string } | null {
  for (const s of sectors) {
    if (!s.points || s.points.length < 3) continue;
    if (pointInPolygon(point, s.points)) return { id: s.id, name: s.name };
  }
  return null;
}
