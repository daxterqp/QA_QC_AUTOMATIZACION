/**
 * SectorImporter — Parser de Excel/CSV de sectores con detección automática
 * de formato. Soporta TRES formatos:
 *
 *  1. Solo nombres:           columnas `name` → sectores sin geometría
 *  2. Geometría WGS84 plana:  columnas `name, lat, lng` → polígonos en sentido lectura
 *  3. Geometría proyectada:   columnas `name, x, y, system` → convierte a WGS84
 *
 * Detección por presencia de columnas (case-insensitive, tolerante a tildes).
 * Polígonos se cierran automáticamente si primer ≠ último punto.
 */

import * as XLSX from 'xlsx';
import { utmToWgs84, psad56LatLngToWgs84, type LatLng } from '@utils/CoordinateSystem';

export interface ParsedSector {
  name: string;
  points: LatLng[] | null;
  sourceSystem: string | null;
}

export interface SectorImportResult {
  format: 'names-only' | 'wgs84-flat' | 'projected';
  sectors: ParsedSector[];
  warnings: string[];
}

const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const parseSystemHint = (raw: string | undefined): { datum: 'WGS84' | 'PSAD56'; type: 'LATLNG' | 'UTM'; zone: number | null; hemisphere: 'N' | 'S' } | null => {
  if (!raw) return null;
  const s = normalize(raw).replace(/[\s\-_]/g, '');
  // B4 — Si el hint no contiene NINGUNA palabra reconocida (utm/latlng/latlon),
  // devolver null en lugar de defaults silenciosos. Sistemas tipográficamente
  // distintos ("WSG84 UTM18S", "Gauss-Krüger") deben fallar explícitamente.
  const recognizedType = s.includes('utm') || s.includes('latlng') || s.includes('latlon');
  const recognizedDatum = s.includes('wgs84') || s.includes('psad');
  if (!recognizedType && !recognizedDatum) return null;
  let datum: 'WGS84' | 'PSAD56' = 'WGS84';
  if (s.includes('psad')) datum = 'PSAD56';
  let type: 'LATLNG' | 'UTM' = 'LATLNG';
  if (s.includes('utm')) type = 'UTM';
  if (s.includes('latlng') || s.includes('latlon')) type = 'LATLNG';
  let zone: number | null = null;
  let hemisphere: 'N' | 'S' = 'S'; // Perú por defecto
  if (type === 'UTM') {
    // A9 — Capturar dígitos que sigan inmediatamente a "utm" (no los del nombre
    // del datum: "PSAD56UTM18S" debe dar zona 18, no 56). C2 — capturar también
    // el hemisferio (N/S) que sigue a la zona; sin esto un "UTM 18N" se ubicaba
    // ~10,000 km al sur (se asumía siempre Sur).
    const m = s.match(/utm(\d{1,2})([ns])?/);
    if (m) { zone = parseInt(m[1], 10); if (m[2]) hemisphere = m[2] === 'n' ? 'N' : 'S'; }
    else {
      // Fallback: si el texto solo contiene la zona aislada (p.ej. "UTM 18S")
      const m2 = s.replace(/(wgs84|psad56)/g, '').match(/(\d{1,2})([ns])?/);
      if (m2) { zone = parseInt(m2[1], 10); if (m2[2]) hemisphere = m2[2] === 'n' ? 'N' : 'S'; }
    }
  }
  return { datum, type, zone, hemisphere };
};

// Normaliza a anillo ABIERTO: si el archivo trae el primer punto repetido al
// final (cierre explícito de GeoJSON/Shapefile), lo elimina. Los polígonos se
// cierran solos al renderizar (react-native-maps, Leaflet), así que un cuadri-
// látero de 4 vértices se almacena con 4 puntos — no 5. (Antes se AGREGABA el
// primer punto, lo que generaba el vértice extra reportado.)
const closeRing = (points: LatLng[]): LatLng[] => {
  if (points.length < 2) return points;
  const f = points[0], l = points[points.length - 1];
  if (Math.abs(f.lat - l.lat) < 1e-9 && Math.abs(f.lng - l.lng) < 1e-9) {
    return points.slice(0, -1);
  }
  return points;
};

export function parseSectorFile(input: ArrayBuffer | string, fileName?: string): SectorImportResult {
  const isText = typeof input === 'string';
  const wb = XLSX.read(input, { type: isText ? 'string' : 'array', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('El archivo no contiene hojas válidas.');

  // header:1 entrega filas como arrays; luego construimos objetos con headers normalizados
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  if (rows.length < 2) throw new Error('El archivo está vacío o no tiene datos.');

  const headerRaw = rows[0].map(c => (c == null ? '' : String(c)));
  const header = headerRaw.map(normalize);
  const idxOf = (...candidates: string[]): number => {
    for (const c of candidates) {
      const i = header.indexOf(c);
      if (i !== -1) return i;
    }
    return -1;
  };

  const iName   = idxOf('name', 'nombre', 'sector');
  const iLat    = idxOf('lat', 'latitud', 'latitude');
  const iLng    = idxOf('lng', 'long', 'longitud', 'longitude');
  const iX      = idxOf('x', 'este', 'easting', 'e');
  const iY      = idxOf('y', 'norte', 'northing', 'n');
  const iSystem = idxOf('system', 'sistema', 'srs', 'crs', 'epsg');

  if (iName === -1) throw new Error('La primera fila debe tener una columna "name" (o "nombre" / "sector").');

  const dataRows = rows.slice(1).filter(r => r.some(c => c != null && String(c).trim() !== ''));
  const warnings: string[] = [];

  // Detectar formato
  let format: SectorImportResult['format'];
  if (iLat !== -1 && iLng !== -1) format = 'wgs84-flat';
  else if (iX !== -1 && iY !== -1 && iSystem !== -1) format = 'projected';
  else if (iX !== -1 && iY !== -1) {
    format = 'projected';
    warnings.push('Faltó columna "system" — se asume WGS84 UTM 18S por defecto. Verifica si esto es correcto.');
  } else format = 'names-only';

  // Caso 1: solo nombres
  if (format === 'names-only') {
    const seen = new Set<string>();
    const sectors: ParsedSector[] = [];
    for (const r of dataRows) {
      const name = String(r[iName] ?? '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) {
        warnings.push(`Nombre duplicado "${name}" — se omitió la repetición.`);
        continue;
      }
      seen.add(key);
      sectors.push({ name, points: null, sourceSystem: null });
    }
    if (sectors.length === 0) throw new Error('No se encontró ningún sector con nombre válido.');
    return { format, sectors, warnings };
  }

  // Casos 2 y 3: agrupar por name consecutivo o no-consecutivo (toleramos ambos)
  const byName = new Map<string, { name: string; rows: unknown[][]; sysHint: string | null }>();
  for (const r of dataRows) {
    const name = String(r[iName] ?? '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!byName.has(key)) {
      const sys = iSystem !== -1 ? (r[iSystem] != null ? String(r[iSystem]) : null) : null;
      byName.set(key, { name, rows: [], sysHint: sys });
    }
    byName.get(key)!.rows.push(r);
  }

  const sectors: ParsedSector[] = [];

  for (const entry of byName.values()) {
    const pts: LatLng[] = [];
    let sourceSystem: string | null = entry.sysHint;

    for (const r of entry.rows) {
      if (format === 'wgs84-flat') {
        const lat = Number(r[iLat]);
        const lng = Number(r[iLng]);
        if (!isFinite(lat) || !isFinite(lng)) {
          warnings.push(`Fila inválida en "${entry.name}" (lat/lng no numéricos) — omitida.`);
          continue;
        }
        pts.push({ lat, lng });
      } else {
        // projected
        const x = Number(r[iX]);
        const y = Number(r[iY]);
        if (!isFinite(x) || !isFinite(y)) {
          warnings.push(`Fila inválida en "${entry.name}" (x/y no numéricos) — omitida.`);
          continue;
        }
        const rowSys = iSystem !== -1 ? (r[iSystem] != null ? String(r[iSystem]) : null) : null;
        const hint = parseSystemHint(rowSys ?? entry.sysHint ?? 'WGS84_UTM18S');
        if (!hint) {
          // B4 — sistema no reconocido: descartar la fila explícitamente en
          // lugar de inventarse un default que produciría coords basura.
          warnings.push(`Sistema desconocido "${rowSys ?? entry.sysHint}" en "${entry.name}" — fila omitida.`);
          continue;
        }
        const datum = hint.datum;
        const type = hint.type;
        const zone = hint.zone ?? 18;
        if (type === 'UTM') {
          pts.push(utmToWgs84(x, y, zone, datum, hint.hemisphere));
        } else {
          // LATLNG en PSAD56 — x=lng, y=lat (igual a UTM por consistencia: primero E/lng, luego N/lat)
          if (datum === 'PSAD56') pts.push(psad56LatLngToWgs84(y, x));
          else pts.push({ lat: y, lng: x });
        }
        if (!sourceSystem) sourceSystem = rowSys ?? entry.sysHint ?? `${datum}_${type}${zone ?? ''}`.replace(/_$/, '');
      }
    }

    // C3 — normalizar el anillo (quitar vértice de cierre duplicado) ANTES de
    // validar el mínimo de 3 puntos: un triángulo exportado cerrado (A,B,C,A con
    // alguna fila intermedia descartada) podía quedar en 2 puntos tras el strip.
    const ring = closeRing(pts);
    if (ring.length < 3) {
      warnings.push(`Sector "${entry.name}" tiene menos de 3 puntos válidos — se omitió.`);
      continue;
    }
    sectors.push({ name: entry.name, points: ring, sourceSystem: sourceSystem ?? null });
  }

  if (sectors.length === 0) throw new Error('No se pudo construir ningún polígono válido del archivo.');

  void fileName; // reservado por si en el futuro lo usamos en warnings
  return { format, sectors, warnings };
}
