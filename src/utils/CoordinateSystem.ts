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

// ─── v44 — Asignación de sector con TOLERANCIA (módulo topográfico) ──────────
// Proyección equirectangular local a metros: exacta para distancias chicas (el
// "radio de gracia" en metros), idéntica en móvil y web, sin depender de proj4.
const M_PER_DEG_LAT = 111_320;

function llToLocalMeters(p: LatLng, origin: LatLng): { x: number; y: number } {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return { x: (p.lng - origin.lng) * mPerDegLng, y: (p.lat - origin.lat) * M_PER_DEG_LAT };
}

/** Distancia (m) de un punto a un SEGMENTO en el plano local (todo en metros). */
function pointSegDistanceM(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Asigna un sector a un punto con tolerancia (decisión del usuario):
 *  Paso 1 — point-in-polygon: si cae DENTRO de algún sector, ese gana (distancia 0).
 *  Paso 2 — si está fuera de todos, distancia mínima al BORDE (segmentos) de cada sector.
 *  Paso 3 — el más cercano se asigna SOLO si `distMin ≤ toleranceM`; si no, null ("No encontrado").
 * `toleranceM` en metros (0 = estricto: solo dentro).
 */
export function findSectorByPointWithTolerance(
  point: LatLng,
  sectors: { id: string; name: string; points: LatLng[] | null }[],
  toleranceM: number,
): { id: string; name: string; distanceM: number } | null {
  // Paso 1 — dentro gana siempre.
  for (const s of sectors) {
    if (!s.points || s.points.length < 3) continue;
    if (pointInPolygon(point, s.points)) return { id: s.id, name: s.name, distanceM: 0 };
  }
  // Paso 2+3 — más cercano por distancia al borde, en metros locales (origen = punto).
  let best: { id: string; name: string; distanceM: number } | null = null;
  for (const s of sectors) {
    if (!s.points || s.points.length < 3) continue;
    const verts = s.points.map((v) => llToLocalMeters(v, point)); // el punto queda en (0,0)
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
// El "tramo" de un ensayo = su sector (point-in-polygon). Dentro del tramo, la
// progresiva se obtiene PROYECTANDO el punto sobre el EJE del polígono del tramo
// y escalando por la LONGITUD DECLARADA (station_end - station_start). Así la
// imperfección geométrica del polígono no altera la progresiva declarada.
//
// ESPEJO EXACTO en flow-qaqc-web/lib/coordinateTopo.ts — mantener sincronizado.

export interface TramoInfo {
  id: string;
  name: string;
  points: LatLng[] | null;
  stationStart: number | null;   // progresiva de inicio (m, continua en el corredor)
  stationEnd: number | null;     // progresiva de fin (m)
}
export interface ChainageResult {
  tramoId: string;
  tramoName: string;
  progresiva: number;            // m a lo largo del corredor
  subtramoIndex: number;         // 0-based dentro del tramo
}

type LocalPt = { x: number; y: number };
const _finiteTramo = (t: TramoInfo): boolean =>
  !!t.points && t.points.length >= 3 &&
  typeof t.stationStart === 'number' && Number.isFinite(t.stationStart) &&
  typeof t.stationEnd === 'number' && Number.isFinite(t.stationEnd) &&
  (t.stationEnd as number) > (t.stationStart as number);

/** Centroide de un tramo en metros locales (origen dado). */
function _centroidLocal(points: LatLng[], origin: LatLng): LocalPt {
  let sx = 0, sy = 0;
  for (const p of points) { const m = llToLocalMeters(p, origin); sx += m.x; sy += m.y; }
  return { x: sx / points.length, y: sy / points.length };
}

/** Eje principal (fallback PCA) de una nube de puntos locales: extremos = puntos
 *  de proyección mín/máx sobre el eigenvector principal. */
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

/** Eje (en metros locales, origen dado) del polígono de un tramo, SIN orientar.
 *  Cuadrilátero alargado → puntos medios del par de aristas OPUESTAS más cortas
 *  (secciones transversales). Otros polígonos → eje principal (PCA). */
function _tramoAxisLocal(points: LatLng[], origin: LatLng): [LocalPt, LocalPt] {
  const pts = points.map((p) => llToLocalMeters(p, origin));
  if (pts.length === 4) {
    const len = (a: LocalPt, b: LocalPt) => Math.hypot(a.x - b.x, a.y - b.y);
    const mid = (a: LocalPt, b: LocalPt): LocalPt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    // Aristas: e0=[0,1] e1=[1,2] e2=[2,3] e3=[3,0]. Pares opuestos (e0,e2),(e1,e3).
    const sum02 = len(pts[0], pts[1]) + len(pts[2], pts[3]);
    const sum13 = len(pts[1], pts[2]) + len(pts[3], pts[0]);
    // El par MÁS CORTO son las secciones transversales; su eje conecta sus centros.
    return sum02 <= sum13
      ? [mid(pts[0], pts[1]), mid(pts[2], pts[3])]
      : [mid(pts[1], pts[2]), mid(pts[3], pts[0])];
  }
  return _principalAxis(pts);
}

/** Nº de subtramos de un tramo dada la longitud de subtramo. */
export function subtramoCount(stationStart: number, stationEnd: number, subLenM: number): number {
  const len = stationEnd - stationStart;
  const sub = (subLenM > 0 && Number.isFinite(subLenM)) ? subLenM : len;
  return Math.max(1, Math.ceil(len / sub - 1e-9));
}

/**
 * Progresiva + subtramo de un punto en una obra lineal.
 * 1. tramo = primer tramo (con geometría + stations) que CONTIENE el punto.
 * 2. eje del tramo, orientado por la dirección global del corredor (centroide del
 *    tramo de menor station → el de mayor). entry = extremo de menor proyección.
 * 3. progresiva = station_start + t·(station_end − station_start), t∈[0,1].
 * 4. subtramo_index = clamp(floor((progresiva−station_start)/subLen), 0, nSub−1).
 * Devuelve null si el punto no cae en ningún tramo válido.
 */
export function computeChainage(
  point: LatLng,
  tramos: TramoInfo[],
  subtramoLengthM: number,
): ChainageResult | null {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  const valid = tramos.filter(_finiteTramo);
  if (valid.length === 0) return null;

  // 1 — tramo contenedor.
  const container = valid.find((t) => pointInPolygon(point, t.points as LatLng[]));
  if (!container) return null;

  // Frame local con origen en el propio punto (el punto queda en (0,0)).
  const origin = point;

  // 2 — dirección del corredor.
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

  // 3 — eje del tramo contenedor, orientado (entry = station_start).
  let [A, B] = _tramoAxisLocal(container.points as LatLng[], origin);
  if ((B.x - A.x) * dir.x + (B.y - A.y) * dir.y < 0) { const tmp = A; A = B; B = tmp; }

  const abx = B.x - A.x, aby = B.y - A.y;
  const len2 = abx * abx + aby * aby;
  // El punto está en (0,0); t = proj de (P−A) sobre (B−A).
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

// ─── v44 — Coordenadas topográficas → WGS84 lat/lng (para el motor de sector) ──

/** Zona UTM + hemisferio del proyecto, derivados del CENTROIDE de los polígonos de
 *  sectores (todos en WGS84 lat/lng). Necesario para convertir Este/Norte (UTM) → lat/lng. */
export function utmFrameFromSectors(sectors: { points: LatLng[] | null }[]): { zone: number; hemisphere: 'N' | 'S' } | null {
  let sumLat = 0, sumLng = 0, n = 0;
  for (const s of sectors) {
    for (const p of (s.points ?? [])) {
      if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) { sumLat += p.lat; sumLng += p.lng; n++; }
    }
  }
  if (n === 0) return null;
  const lat = sumLat / n, lng = sumLng / n;
  return { zone: autoDetectUtmZone(lng), hemisphere: lat < 0 ? 'S' : 'N' };
}

/** Convierte las 2 coords topográficas (c1=Este/X/lng, c2=Norte/Y/lat) a WGS84 lat/lng
 *  según el sistema del proyecto. `frame` (zona/hemisferio, de los sectores) solo se usa
 *  para UTM. Devuelve null si faltan datos o no se puede convertir. */
export function topoCoordsToLatLng(
  c1: number, c2: number, system: CoordinateSystem,
  frame: { zone: number; hemisphere: 'N' | 'S' } | null,
): LatLng | null {
  if (!Number.isFinite(c1) || !Number.isFinite(c2)) return null;
  if (system === 'WGS84_LATLNG') return { lat: c2, lng: c1 };
  if (system === 'PSAD56_LATLNG') return psad56LatLngToWgs84(c2, c1);
  if (!frame) return null; // UTM sin zona conocida (no hay sectores) → no se puede ubicar
  const datum = system === 'PSAD56_UTM' ? 'PSAD56' : 'WGS84';
  try { return utmToWgs84(c1, c2, frame.zone, datum, frame.hemisphere); } catch { return null; }
}
