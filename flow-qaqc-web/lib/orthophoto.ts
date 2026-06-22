/**
 * orthophoto.ts — Conversión de las esquinas de georreferencia de una ortofoto
 * al sistema canónico WGS84 lat/lng que usa todo el mapa (Leaflet/react-native-maps).
 *
 * El usuario elige el sistema ORIGINAL de la ortofoto al importarla; aquí se
 * convierten las 2 esquinas (SO y NE del bounding box) a WGS84. Usa proj4
 * directo (ya es dep de la web) con los mismos parámetros Bursa-Wolf de Perú
 * que el resto del sistema.
 */
import proj4 from 'proj4';

export type OrthoSystem = 'WGS84_LATLNG' | 'PSAD56_LATLNG' | 'WGS84_UTM' | 'PSAD56_UTM' | 'CUSTOM';

export const ORTHO_SYSTEM_LABELS: Record<OrthoSystem, string> = {
  WGS84_LATLNG: 'WGS84 — Lat/Lng (grados)',
  PSAD56_LATLNG: 'PSAD56 — Lat/Lng (grados)',
  WGS84_UTM: 'WGS84 — UTM (Este/Norte)',
  PSAD56_UTM: 'PSAD56 — UTM (Este/Norte)',
  CUSTOM: 'Personalizada (referencia propia, se asume WGS84)',
};

export interface LatLng { lat: number; lng: number }
/** Una esquina: lat/lng para sistemas geográficos; easting/northing para UTM. */
export interface CornerInput {
  lat?: number; lng?: number;          // geográficos
  easting?: number; northing?: number; // UTM
}

proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs('EPSG:4248', '+proj=longlat +ellps=intl +towgs84=-288,175,-376,0,0,0,0 +no_defs');

function utmEpsg(datum: 'WGS84' | 'PSAD56', zone: number, hemisphere: 'N' | 'S'): string {
  if (!Number.isInteger(zone) || zone < 1 || zone > 60) throw new Error(`Zona UTM inválida: ${zone}`);
  const code = datum === 'WGS84'
    ? `EPSG:${hemisphere === 'N' ? 32600 + zone : 32700 + zone}`
    : `EPSG:PSAD56_UTM_${hemisphere}_${zone}`;
  if (!proj4.defs(code)) {
    const south = hemisphere === 'S' ? ' +south' : '';
    proj4.defs(code, datum === 'WGS84'
      ? `+proj=utm +zone=${zone}${south} +datum=WGS84 +units=m +no_defs`
      : `+proj=utm +zone=${zone}${south} +ellps=intl +towgs84=-288,175,-376,0,0,0,0 +units=m +no_defs`);
  }
  return code;
}

/** Convierte una esquina en el sistema indicado → WGS84 lat/lng. */
export function cornerToWgs84(
  c: CornerInput,
  system: OrthoSystem,
  opts?: { zone?: number; hemisphere?: 'N' | 'S' },
): LatLng {
  if (system === 'WGS84_LATLNG' || system === 'CUSTOM') {
    return { lat: c.lat!, lng: c.lng! };
  }
  if (system === 'PSAD56_LATLNG') {
    const [lng, lat] = proj4('EPSG:4248', 'EPSG:4326', [c.lng!, c.lat!]);
    return { lat, lng };
  }
  // UTM (WGS84 o PSAD56)
  const datum = system === 'PSAD56_UTM' ? 'PSAD56' : 'WGS84';
  const zone = opts?.zone ?? 18;
  const hemisphere = opts?.hemisphere ?? 'S';
  const epsg = utmEpsg(datum, zone, hemisphere);
  const [lng, lat] = proj4(epsg, 'EPSG:4326', [c.easting!, c.northing!]);
  return { lat, lng };
}

/** Bounding box WGS84 de Leaflet: [[southLat, westLng], [northLat, eastLng]]. */
export type LeafletBounds = [[number, number], [number, number]];

/** A partir de dos esquinas opuestas (cualquier par diagonal) → bounds normalizado. */
export function cornersToBounds(a: LatLng, b: LatLng): LeafletBounds {
  return [
    [Math.min(a.lat, b.lat), Math.min(a.lng, b.lng)],
    [Math.max(a.lat, b.lat), Math.max(a.lng, b.lng)],
  ];
}

export const isUtm = (s: OrthoSystem) => s === 'WGS84_UTM' || s === 'PSAD56_UTM';

/**
 * Normaliza un bounds de CUALQUIER forma a exactamente [[s,w],[n,e]] con 4
 * números finitos. Defensa contra datos persistidos con anidamiento extra
 * (que hacían a Leaflet recursar en `LatLngBounds.extend` →
 * "RangeError: Maximum call stack size exceeded"). Devuelve null si no logra
 * extraer 4 coordenadas válidas.
 */
export function normalizeBounds(raw: unknown): LeafletBounds | null {
  const nums: number[] = [];
  const walk = (v: any, depth: number) => {
    if (nums.length >= 4 || depth > 12) return;
    if (typeof v === 'number' && Number.isFinite(v)) { nums.push(v); return; }
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) { nums.push(Number(v)); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.lat === 'number' && typeof (o.lng ?? o.lon) === 'number') { nums.push(o.lat as number, (o.lng ?? o.lon) as number); return; }
      for (const k of Object.keys(o)) walk(o[k], depth + 1);
    }
  };
  walk(raw, 0);
  if (nums.length < 4 || !nums.slice(0, 4).every(Number.isFinite)) return null;
  const [sLat, wLng, nLat, eLng] = nums;
  return [[Math.min(sLat, nLat), Math.min(wLng, eLng)], [Math.max(sLat, nLat), Math.max(wLng, eLng)]];
}
