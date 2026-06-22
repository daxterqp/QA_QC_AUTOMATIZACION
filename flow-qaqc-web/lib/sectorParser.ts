/**
 * sectorParser.ts — Port web del parser de sectores móvil (src/services/SectorImporter.ts).
 *
 * Mantiene la lógica idéntica: detecta 3 formatos automáticamente
 * (names-only, wgs84-flat, projected) y devuelve polígonos en WGS84.
 *
 * Diferencias con móvil:
 *  - acepta `File` directo (web) y extrae el ArrayBuffer
 *  - importa proj4 directamente (ya está en deps de web)
 */

import * as XLSX from 'xlsx';
import proj4 from 'proj4';

export interface LatLng { lat: number; lng: number }

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

// ── Coordinate System (subconjunto necesario) ────────────────────────────────

proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs('EPSG:4248', '+proj=longlat +ellps=intl +towgs84=-288,175,-376,0,0,0,0 +no_defs');

function utmEpsgCode(datum: 'WGS84' | 'PSAD56', zone: number, hemisphere: 'N' | 'S'): string {
  if (!Number.isInteger(zone) || zone < 1 || zone > 60) {
    throw new Error(`Zona UTM fuera de rango: ${zone} (válido: 1..60)`);
  }
  let code: string;
  if (datum === 'WGS84') {
    code = `EPSG:${hemisphere === 'N' ? 32600 + zone : 32700 + zone}`;
  } else {
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

function utmToWgs84(easting: number, northing: number, zone: number, datum: 'WGS84' | 'PSAD56' = 'WGS84', hemisphere: 'N' | 'S' = 'S'): LatLng {
  const epsg = utmEpsgCode(datum, zone, hemisphere);
  const [lng, lat] = proj4(epsg, 'EPSG:4326', [easting, northing]);
  return { lat, lng };
}

function psad56LatLngToWgs84(lat: number, lng: number): LatLng {
  const [wgsLng, wgsLat] = proj4('EPSG:4248', 'EPSG:4326', [lng, lat]);
  return { lat: wgsLat, lng: wgsLng };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function parseSystemHint(raw: string | undefined | null): { datum: 'WGS84' | 'PSAD56'; type: 'LATLNG' | 'UTM'; zone: number | null } | null {
  if (!raw) return null;
  const s = normalize(raw).replace(/[\s\-_]/g, '');
  const recognizedType = s.includes('utm') || s.includes('latlng') || s.includes('latlon');
  const recognizedDatum = s.includes('wgs84') || s.includes('psad');
  if (!recognizedType && !recognizedDatum) return null;
  let datum: 'WGS84' | 'PSAD56' = 'WGS84';
  if (s.includes('psad')) datum = 'PSAD56';
  let type: 'LATLNG' | 'UTM' = 'LATLNG';
  if (s.includes('utm')) type = 'UTM';
  if (s.includes('latlng') || s.includes('latlon')) type = 'LATLNG';
  let zone: number | null = null;
  if (type === 'UTM') {
    const m = s.match(/utm(\d{1,2})/);
    if (m) zone = parseInt(m[1], 10);
    else {
      const m2 = s.replace(/(wgs84|psad56)/g, '').match(/(\d{1,2})/);
      if (m2) zone = parseInt(m2[1], 10);
    }
  }
  return { datum, type, zone };
}

// Normaliza a anillo ABIERTO: si el archivo trae el primer punto repetido al
// final (cierre explícito), lo elimina. Los polígonos se cierran solos al
// renderizar (Leaflet/react-native-maps), así que un cuadrilátero de 4 vértices
// se almacena con 4 puntos — no 5. (Antes se AGREGABA el primer punto → vértice extra.)
const closeRing = (points: LatLng[]): LatLng[] => {
  if (points.length < 2) return points;
  const f = points[0], l = points[points.length - 1];
  if (Math.abs(f.lat - l.lat) < 1e-9 && Math.abs(f.lng - l.lng) < 1e-9) {
    return points.slice(0, -1);
  }
  return points;
};

// ── Parser principal ─────────────────────────────────────────────────────────

export async function parseSectorFile(file: File): Promise<SectorImportResult> {
  const isCsv = /\.csv$/i.test(file.name);
  let wb: XLSX.WorkBook;
  if (isCsv) {
    const text = await file.text();
    wb = XLSX.read(text, { type: 'string' });
  } else {
    const buf = await file.arrayBuffer();
    wb = XLSX.read(buf, { type: 'array', cellDates: false });
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('El archivo no contiene hojas válidas.');

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

  // Casos 2 y 3
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

  for (const entry of Array.from(byName.values())) {
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
        const x = Number(r[iX]);
        const y = Number(r[iY]);
        if (!isFinite(x) || !isFinite(y)) {
          warnings.push(`Fila inválida en "${entry.name}" (x/y no numéricos) — omitida.`);
          continue;
        }
        const rowSys = iSystem !== -1 ? (r[iSystem] != null ? String(r[iSystem]) : null) : null;
        const hint = parseSystemHint(rowSys ?? entry.sysHint ?? 'WGS84_UTM18S');
        if (!hint) {
          warnings.push(`Sistema desconocido "${rowSys ?? entry.sysHint}" en "${entry.name}" — fila omitida.`);
          continue;
        }
        const datum = hint.datum;
        const type = hint.type;
        const zone = hint.zone ?? 18;
        if (type === 'UTM') {
          pts.push(utmToWgs84(x, y, zone, datum));
        } else {
          if (datum === 'PSAD56') pts.push(psad56LatLngToWgs84(y, x));
          else pts.push({ lat: y, lng: x });
        }
        if (!sourceSystem) sourceSystem = rowSys ?? entry.sysHint ?? `${datum}_${type}${zone ?? ''}`.replace(/_$/, '');
      }
    }

    if (pts.length < 3) {
      warnings.push(`Sector "${entry.name}" tiene menos de 3 puntos válidos — se omitió.`);
      continue;
    }
    sectors.push({ name: entry.name, points: closeRing(pts), sourceSystem: sourceSystem ?? null });
  }

  if (sectors.length === 0) throw new Error('No se pudo construir ningún polígono válido del archivo.');

  return { format, sectors, warnings };
}
