/**
 * excelParser.ts — Web version of ExcelImporter.ts + ExcelLocationsImporter.ts
 *
 * Parses from a browser File object using `xlsx` + ArrayBuffer.
 * Same column structure as the APK services.
 */

import * as XLSX from 'xlsx';
import type { SummaryConfig, SummaryColumn, SummaryAggregation } from '@lib/summaryTable';

/**
 * Lee una hoja "RESUMEN" del workbook → config de Tabla Resumen por ID_Protocolo.
 * Formato (1ª fila = encabezados, reconocidos por nombre, flexible):
 *   ID_Protocolo | Tipo | Clave | Titulo | Grupo | Decimales | Operacion
 *  - Tipo = "columna": agrega una columna. Clave = `partida:letra` (ej. 13:A),
 *    Titulo = nombre visible, Grupo = encabezado paraguas, Decimales = nº.
 *  - Tipo = "kpi": agrega un KPI. Titulo = etiqueta, Clave = columna objetivo,
 *    Operacion = avg/promedio · sum/suma · min · max · count.
 *  Si una plantilla no aparece en la hoja, queda con columnas AUTOMÁTICAS.
 */
const KPI_OPS: Record<string, SummaryAggregation['op']> = {
  avg: 'avg', promedio: 'avg', sum: 'sum', suma: 'sum', min: 'min', minimo: 'min',
  'mínimo': 'min', max: 'max', maximo: 'max', 'máximo': 'max', count: 'count', conteo: 'count',
};
export function parseSummarySheet(wb: XLSX.WorkBook): Record<string, SummaryConfig> {
  const sheetName = wb.SheetNames.find(n => n.trim().toUpperCase() === 'RESUMEN');
  if (!sheetName) return {};
  const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetName], { header: 1, defval: '' });
  if (rows.length < 2) return {};
  const headers = rows[0].map(h => String(h).trim().toLowerCase());
  const find = (...names: string[]) => headers.findIndex(h => names.includes(h));
  const ci = {
    id: find('id_protocolo', 'id protocolo', 'protocolo'), tipo: find('tipo'), clave: find('clave', 'celda', 'columna'),
    titulo: find('titulo', 'título', 'nombre'), grupo: find('grupo', 'paraguas'), dec: find('decimales', 'dec'), op: find('operacion', 'operación', 'medida'),
  };
  if (ci.id < 0 || ci.clave < 0) return {};
  const acc: Record<string, { columns: SummaryColumn[]; aggregations: SummaryAggregation[] }> = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = String(r[ci.id] ?? '').trim();
    const clave = String(r[ci.clave] ?? '').trim();
    if (!id || !clave) continue;
    const tipo = (ci.tipo >= 0 ? String(r[ci.tipo] ?? '') : 'columna').trim().toLowerCase();
    if (!acc[id]) acc[id] = { columns: [], aggregations: [] };
    if (tipo.startsWith('kpi') || tipo.startsWith('medida')) {
      const opRaw = (ci.op >= 0 ? String(r[ci.op] ?? '') : 'avg').trim().toLowerCase();
      acc[id].aggregations.push({ label: String(r[ci.titulo] ?? 'KPI').trim() || 'KPI', column: clave, op: KPI_OPS[opRaw] ?? 'avg' });
    } else {
      const dec = ci.dec >= 0 ? parseInt(String(r[ci.dec] ?? ''), 10) : NaN;
      acc[id].columns.push({
        key: clave, label: (String(r[ci.titulo] ?? '').trim() || clave),
        group: ci.grupo >= 0 ? (String(r[ci.grupo] ?? '').trim() || undefined) : undefined,
        from: `key:${clave}`, kind: 'number', dec: Number.isFinite(dec) ? dec : undefined,
      });
    }
  }
  const out: Record<string, SummaryConfig> = {};
  for (const [id, c] of Object.entries(acc)) {
    if (c.columns.length || c.aggregations.length) out[id] = { columns: c.columns, aggregations: c.aggregations.length ? c.aggregations : undefined };
  }
  return out;
}

// ── Activities ────────────────────────────────────────────────────────────────

export const ACTIVITIES_REQUIRED_COLUMNS = [
  'ID_Protocolo',
  'Protocolo',
  'PartidaItem',
  'Actividad realizada',
  'Método de validación',
] as const;

export interface ExcelActivity {
  partidaItem: string;
  itemDescription: string;
  validationMethod: string;
  section: string | null;
}

export interface ExcelProtocolGroup {
  idProtocolo: string;
  protocolName: string;
  activities: ExcelActivity[];
  /** Config de la Tabla Resumen leída de la hoja "RESUMEN" (opcional). */
  summaryConfig?: SummaryConfig;
}

export interface ActivitiesImportResult {
  protocols: ExcelProtocolGroup[];
  totalRows: number;
}

export class ExcelParseError extends Error {
  constructor(message: string, public readonly missingColumns?: string[]) {
    super(message);
    this.name = 'ExcelParseError';
  }
}

export async function parseActivitiesExcel(file: File): Promise<ActivitiesImportResult> {
  const buf = await file.arrayBuffer();
  const wb  = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new ExcelParseError('El archivo Excel no contiene hojas de cálculo.');
  const ws   = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
  if (rows.length < 2) throw new ExcelParseError('El archivo Excel no tiene filas de datos.');

  const headers = rows[0].map((h: string) => String(h).trim());
  const missing  = ACTIVITIES_REQUIRED_COLUMNS.filter(c => !headers.includes(c));
  if (missing.length > 0) throw new ExcelParseError(`Faltan columnas requeridas: ${missing.join(', ')}`, missing);

  const idx: Record<string, number> = {};
  headers.forEach((h, i) => { idx[h] = i; });

  const protocolMap = new Map<string, { name: string; activities: ExcelActivity[] }>();

  for (let i = 1; i < rows.length; i++) {
    const row            = rows[i] as string[];
    const idProtocolo    = String(row[idx['ID_Protocolo']] ?? '').trim();
    const protocolName   = String(row[idx['Protocolo']] ?? '').trim();
    const partidaItem    = String(row[idx['PartidaItem']] ?? '').trim();
    const itemDesc       = String(row[idx['Actividad realizada']] ?? '').trim();
    const valMethod      = String(row[idx['Método de validación']] ?? '').trim();
    const seccionRaw     = idx['Sección'] !== undefined ? String(row[idx['Sección']] ?? '').trim() : '';
    const section        = (seccionRaw && seccionRaw.toUpperCase() !== 'NA') ? seccionRaw : null;

    if (!idProtocolo && !itemDesc) continue;
    if (!idProtocolo) continue;

    const existing = protocolMap.get(idProtocolo);
    if (!existing) {
      protocolMap.set(idProtocolo, {
        name: protocolName || idProtocolo,
        activities: [{ partidaItem, itemDescription: itemDesc, validationMethod: valMethod, section }],
      });
    } else {
      if (protocolName && existing.name === idProtocolo) existing.name = protocolName;
      existing.activities.push({ partidaItem, itemDescription: itemDesc, validationMethod: valMethod, section });
    }
  }

  // Config de Tabla Resumen embebida en la hoja "RESUMEN" (opcional).
  const summaryConfigs = parseSummarySheet(wb);
  const protocols: ExcelProtocolGroup[] = Array.from(protocolMap.entries()).map(([id, v]) => ({
    idProtocolo: id,
    protocolName: v.name,
    activities: v.activities,
    summaryConfig: summaryConfigs[id],
  }));

  if (protocols.length === 0) throw new ExcelParseError('No se encontraron protocolos válidos en el archivo.');
  return { protocols, totalRows: rows.length - 1 };
}

// ── Locations ─────────────────────────────────────────────────────────────────

export const LOCATIONS_REQUIRED_COLUMNS = [
  'Ubicación',
  'PLANO DE REFERENCIA',
  'ID_Protocolos',
] as const;

export interface ExcelLocation {
  name: string;
  locationOnly: string;
  specialty: string;
  referencePlan: string;
  templateIds: string;
}

export interface LocationsImportResult {
  locations: ExcelLocation[];
  totalRows: number;
}

export async function parseLocationsExcel(file: File): Promise<LocationsImportResult> {
  const buf = await file.arrayBuffer();
  const wb  = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new ExcelParseError('El archivo Excel no contiene hojas de cálculo.');
  const ws   = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
  if (rows.length < 2) throw new ExcelParseError('El archivo Excel está vacío o solo tiene cabecera.');

  const headers = rows[0].map((h: string) => String(h).trim());
  const missing  = LOCATIONS_REQUIRED_COLUMNS.filter(c => !headers.includes(c));
  if (missing.length > 0) throw new ExcelParseError(`Faltan columnas requeridas: ${missing.join(', ')}`, missing);

  const ubIdx      = headers.indexOf('Ubicación');
  const ubSolaIdx  = headers.indexOf('Ubicación_Sola');
  const espSolaIdx = headers.indexOf('Especialidad_Sola');
  const planIdx    = headers.indexOf('PLANO DE REFERENCIA');
  const idsIdx     = headers.indexOf('ID_Protocolos');

  const locations: ExcelLocation[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row  = rows[i] as string[];
    const name = String(row[ubIdx] ?? '').trim();
    if (!name) continue;
    locations.push({
      name,
      locationOnly: ubSolaIdx >= 0  ? String(row[ubSolaIdx]  ?? '').trim() : '',
      specialty:    espSolaIdx >= 0  ? String(row[espSolaIdx] ?? '').trim() : '',
      referencePlan: String(row[planIdx] ?? '').trim(),
      templateIds:   String(row[idsIdx]  ?? '').trim(),
    });
  }
  if (locations.length === 0) throw new ExcelParseError('El archivo no contiene ubicaciones válidas.');
  return { locations, totalRows: rows.length - 1 };
}

// ── Equipos calibrados (v24) ─────────────────────────────────────────────────

// v28 — "Próxima calibración" pasa a ser opcional: maquinaria pesada no se
// calibra. Solo se valida que esté presente para equipos categoría laboratorio.
export const EQUIPMENT_REQUIRED_COLUMNS = [
  'Código',
  'Nombre',
  'Tipo',
] as const;

export interface ExcelEquipment {
  code: string;
  name: string;
  type: string;          // se valida y mapea a EquipmentType en el caller
  category: 'laboratorio' | 'maquinaria_pesada';
  brand: string | null;
  model: string | null;
  serial: string | null;
  capacity: string | null;
  resolution: string | null;
  lastCalibrationAt: number | null;  // ms epoch o null
  nextCalibrationAt: number | null;  // ms epoch — null si maquinaria pesada
  notes: string | null;
}

export interface EquipmentImportResult {
  equipment: ExcelEquipment[];
  totalRows: number;
}

/** Parsea una celda de fecha de Excel. Acepta:
 *  - Número serial de Excel (días desde 1900-01-01)
 *  - String ISO 8601 / dd/mm/yyyy / yyyy-mm-dd
 *  Devuelve ms epoch o null si no se pudo. */
function parseExcelDate(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && isFinite(raw)) {
    // Excel epoch: días desde 1899-12-30 (Lotus 1-2-3 bug compat).
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    return isFinite(ms) ? ms : null;
  }
  const s = String(raw).trim();
  if (!s) return null;
  // dd/mm/yyyy o dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const d = new Date(Date.UTC(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10)));
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

export async function parseEquipmentExcel(file: File): Promise<EquipmentImportResult> {
  const buf = await file.arrayBuffer();
  const wb  = XLSX.read(buf, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new ExcelParseError('El archivo Excel no contiene hojas de cálculo.');
  const ws   = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '' });
  if (rows.length < 2) throw new ExcelParseError('El archivo Excel está vacío o solo tiene cabecera.');

  const headers = rows[0].map((h) => String(h).trim());
  const missing = EQUIPMENT_REQUIRED_COLUMNS.filter(c => !headers.includes(c));
  if (missing.length > 0) throw new ExcelParseError(`Faltan columnas requeridas: ${missing.join(', ')}`, missing);

  const idx: Record<string, number> = {};
  headers.forEach((h, i) => { idx[h] = i; });

  const get = (row: (string | number)[], col: string): string => {
    const i = idx[col];
    if (i == null || i < 0) return '';
    return String(row[i] ?? '').trim();
  };

  const MACHINERY_TYPES = new Set([
    'excavadora', 'compactador', 'motoniveladora', 'retroexcavadora',
    'cargador_frontal', 'volquete', 'cisterna', 'rodillo',
  ]);

  const equipment: ExcelEquipment[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const code = get(row, 'Código');
    if (!code) continue;

    // v28 — Normalizar tipo + clasificar categoría automáticamente
    const tipoRaw = get(row, 'Tipo');
    const tipoNorm = tipoRaw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '_'); // "cargador frontal" → "cargador_frontal"

    // Categoría: columna opcional, o auto-inferida del tipo
    let category: 'laboratorio' | 'maquinaria_pesada';
    const catRaw = get(row, 'Categoría').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
    if (catRaw === 'maquinaria_pesada' || catRaw === 'maquinaria') {
      category = 'maquinaria_pesada';
    } else if (catRaw === 'laboratorio') {
      category = 'laboratorio';
    } else {
      // Inferir por tipo si no se especifica
      category = MACHINERY_TYPES.has(tipoNorm) ? 'maquinaria_pesada' : 'laboratorio';
    }

    // Próxima calibración: REQUERIDA para laboratorio; opcional para maquinaria.
    let nextMs: number | null = null;
    if (idx['Próxima calibración'] != null) {
      const nextRaw = row[idx['Próxima calibración']];
      nextMs = parseExcelDate(nextRaw);
      if (nextMs == null && category === 'laboratorio') {
        throw new ExcelParseError(`Fila ${i + 1}: "Próxima calibración" inválida (${nextRaw}). Es obligatoria para equipos de laboratorio.`);
      }
    } else if (category === 'laboratorio') {
      throw new ExcelParseError(`Falta columna "Próxima calibración" requerida para equipos de laboratorio.`);
    }

    const lastMs = idx['Última calibración'] != null
      ? parseExcelDate(row[idx['Última calibración']])
      : null;

    equipment.push({
      code,
      name: get(row, 'Nombre'),
      type: tipoNorm,
      category,
      brand: get(row, 'Marca') || null,
      model: get(row, 'Modelo') || null,
      serial: get(row, 'Serie') || null,
      capacity: get(row, 'Capacidad') || null,
      resolution: get(row, 'Resolución') || null,
      lastCalibrationAt: lastMs,
      nextCalibrationAt: nextMs,
      notes: get(row, 'Notas') || null,
    });
  }
  if (equipment.length === 0) throw new ExcelParseError('El archivo no contiene equipos válidos.');
  return { equipment, totalRows: rows.length - 1 };
}

// ── v27 — Trazabilidad Operacional (multi-tab) ────────────────────────────────

export interface TraceabilityActivity { name: string; kind: 'productive' | 'maintenance' | 'transport' | 'other' }
export interface TraceabilityEquipActivity { equipmentCode: string; activityName: string; templateName: string | null }
export interface TraceabilityShift { name: string; startHour: number; endHour: number }
export interface TraceabilityTemplateItem { templateName: string; partidaItem: string | null; itemDescription: string; validationMethod: string | null; section: string | null }

/** v41 — Tabla auxiliar de laboratorio (hoja 2 del catálogo Lab.). */
export interface TraceabilityAuxTable {
  groupKey: string;     // de "tabla-taras" → "taras"
  name: string;
  columns: string[];    // ["Codigo","Malla","Abertura"] (1ª = LLAVE)
  rows: string[][];     // orientado a filas: [["1","N1","45"], ...]
}

export interface TraceabilityImportResult {
  equipos:        ExcelEquipment[];                  // hoja "Equipos" (reusa parseEquipmentExcel logic)
  actividades:    TraceabilityActivity[];            // hoja "Actividades"
  equipoActividad: TraceabilityEquipActivity[];     // hoja "Equipo-Actividad"
  turnos:         TraceabilityShift[];               // hoja "Turnos"
  plantillas:     TraceabilityTemplateItem[];        // hoja "Plantillas Formulario"
  auxTables:      TraceabilityAuxTable[];            // v41 — hoja "Tablas auxiliares"
  warnings:       string[];
}

/** v41 — Parsea la hoja "Tablas auxiliares": filas `tabla-<nombre> | <columna> | v1 | v2 | …`
 *  (un valor por celda). Agrupa por nombre de tabla; la 1ª columna es la LLAVE. */
export function parseAuxTablesSheet(wb: XLSX.WorkBook): { tables: TraceabilityAuxTable[]; warnings: string[] } {
  const rows = readSheet(wb, ['Tablas auxiliares', 'Tablas Auxiliares', 'Tablas', 'Auxiliares', 'Aux']);
  if (!rows) return { tables: [], warnings: [] };
  const warnings: string[] = [];
  const TABLA_RE = /^tabla-(.+)$/i;
  const groups = new Map<string, { name: string; fields: { col: string; values: string[] }[] }>();
  let current: string | null = null;
  for (const r of rows) {
    const a = String(r[0] ?? '').trim();
    const b = String(r[1] ?? '').trim();
    const m = a.match(TABLA_RE);
    if (m) current = m[1].trim();
    else if (a !== '') { current = null; continue; } // fila ajena (no tabla, no continuación)
    if (!current || !b) continue;
    const values = r.slice(2).map(v => String(v ?? '').trim());
    while (values.length && values[values.length - 1] === '') values.pop();
    const key = current.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name: current, fields: [] });
    groups.get(key)!.fields.push({ col: b, values });
  }
  const tables: TraceabilityAuxTable[] = [];
  for (const g of Array.from(groups.values())) {
    const columns = g.fields.map(f => f.col);
    if (columns.length === 0) continue;
    const nRows = g.fields.reduce((mx, f) => Math.max(mx, f.values.length), 0);
    const rowsOut: string[][] = [];
    for (let i = 0; i < nRows; i++) {
      const row = g.fields.map(f => f.values[i] ?? '');
      if ((row[0] ?? '') === '') continue; // sin LLAVE (columnas dispares) → fila basura, se omite
      rowsOut.push(row);
    }
    tables.push({ groupKey: g.name.toLowerCase(), name: g.name, columns, rows: rowsOut });
  }
  return { tables, warnings };
}

const KIND_MAP: Record<string, TraceabilityActivity['kind']> = {
  productiva: 'productive', productivas: 'productive', productive: 'productive',
  mantenimiento: 'maintenance', maintenance: 'maintenance',
  transporte: 'transport', transport: 'transport',
  otro: 'other', otros: 'other', other: 'other',
};

function readSheet(wb: XLSX.WorkBook, candidates: string[]): (string | number)[][] | null {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  for (const sn of wb.SheetNames) {
    const k = norm(sn);
    if (candidates.some(c => norm(c) === k)) {
      return XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[sn], { header: 1, defval: '' });
    }
  }
  return null;
}

/** Parser unificado para archivos de catálogo:
 *  - CSV o xlsx con una sola hoja Y headers de equipos → solo equipos.
 *  - xlsx multi-hoja → procesa todas las hojas reconocidas (Equipos,
 *    Actividades, Equipo-Actividad, Turnos, Plantillas Formulario).
 *  Cada hoja es opcional. El caller decide qué upsertear. */
export async function parseTraceabilityExcel(file: File): Promise<TraceabilityImportResult> {
  const isCsv = /\.csv$/i.test(file.name);
  let wb: XLSX.WorkBook;
  if (isCsv) {
    const text = await file.text();
    wb = XLSX.read(text, { type: 'string' });
  } else {
    const buf = await file.arrayBuffer();
    wb = XLSX.read(buf, { type: 'array', cellDates: false });
  }
  const warnings: string[] = [];

  // ── Hoja Equipos ────────────────────────────────────────────────────────
  // Fallback para CSV/xlsx de 1 hoja sin nombre canónico: si solo hay UNA
  // hoja y sus headers parecen de equipos, la tratamos como hoja "Equipos".
  const equipos: ExcelEquipment[] = [];
  let equiposRows = readSheet(wb, ['Equipos', 'Equipment']);
  if (!equiposRows && wb.SheetNames.length === 1) {
    const onlySheet = XLSX.utils.sheet_to_json<(string | number)[]>(
      wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }
    );
    const headers = (onlySheet[0] ?? []).map(h => String(h ?? '').trim());
    if (EQUIPMENT_REQUIRED_COLUMNS.every(c => headers.includes(c))) {
      equiposRows = onlySheet;
      warnings.push(`Formato simple detectado — solo se importarán equipos desde "${wb.SheetNames[0]}".`);
    }
  }
  if (equiposRows && equiposRows.length >= 2) {
    const headers = equiposRows[0].map(h => String(h).trim());
    const missing = EQUIPMENT_REQUIRED_COLUMNS.filter(c => !headers.includes(c));
    if (missing.length > 0) {
      warnings.push(`Hoja "Equipos" omitida: faltan columnas ${missing.join(', ')}.`);
    } else {
      const idx: Record<string, number> = {};
      headers.forEach((h, i) => { idx[h] = i; });
      const get = (r: (string|number)[], c: string) => { const i = idx[c]; return i == null ? '' : String(r[i] ?? '').trim(); };
      for (let i = 1; i < equiposRows.length; i++) {
        const row = equiposRows[i];
        const code = get(row, 'Código');
        if (!code) continue;
        const tipoNorm = get(row, 'Tipo').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
        // v28 — categoría auto-inferida del tipo (laboratorio por default)
        const MACHINERY = new Set(['excavadora', 'compactador', 'motoniveladora', 'retroexcavadora', 'cargador_frontal', 'volquete', 'cisterna', 'rodillo']);
        const catRaw = get(row, 'Categoría').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
        const category: 'laboratorio' | 'maquinaria_pesada' =
          catRaw === 'maquinaria_pesada' || catRaw === 'maquinaria' ? 'maquinaria_pesada'
          : catRaw === 'laboratorio' ? 'laboratorio'
          : (MACHINERY.has(tipoNorm) ? 'maquinaria_pesada' : 'laboratorio');

        let nextMs: number | null = null;
        if (idx['Próxima calibración'] != null) {
          nextMs = parseExcelDate(row[idx['Próxima calibración']]);
          if (nextMs == null && category === 'laboratorio') {
            warnings.push(`Equipos fila ${i + 1}: "Próxima calibración" inválida — omitida.`);
            continue;
          }
        } else if (category === 'laboratorio') {
          warnings.push(`Equipos: falta columna "Próxima calibración" para laboratorio — fila ${i + 1} omitida.`);
          continue;
        }
        const lastMs = idx['Última calibración'] != null ? parseExcelDate(row[idx['Última calibración']]) : null;
        equipos.push({
          code, name: get(row, 'Nombre'), type: tipoNorm, category,
          brand: get(row, 'Marca') || null, model: get(row, 'Modelo') || null,
          serial: get(row, 'Serie') || null, capacity: get(row, 'Capacidad') || null,
          resolution: get(row, 'Resolución') || null,
          lastCalibrationAt: lastMs, nextCalibrationAt: nextMs,
          notes: get(row, 'Notas') || null,
        });
      }
    }
  }

  // ── Hoja Actividades ────────────────────────────────────────────────────
  const actividades: TraceabilityActivity[] = [];
  const actsRows = readSheet(wb, ['Actividades', 'Activities']);
  if (actsRows && actsRows.length >= 2) {
    const headers = actsRows[0].map(h => String(h).trim().toLowerCase());
    const iName = headers.findIndex(h => ['nombre', 'name', 'actividad'].includes(h));
    const iKind = headers.findIndex(h => ['tipo', 'kind', 'categoria'].includes(h));
    if (iName === -1) warnings.push('Hoja "Actividades": falta columna "Nombre".');
    else {
      const seen = new Set<string>();
      for (let i = 1; i < actsRows.length; i++) {
        const row = actsRows[i];
        const name = String(row[iName] ?? '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) { warnings.push(`Actividad "${name}" duplicada — omitida.`); continue; }
        seen.add(key);
        const kindRaw = iKind !== -1 ? String(row[iKind] ?? '').trim().toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '') : 'productive';
        const kind = KIND_MAP[kindRaw] ?? 'other';
        actividades.push({ name, kind });
      }
    }
  }

  // ── Hoja Equipo-Actividad ───────────────────────────────────────────────
  const equipoActividad: TraceabilityEquipActivity[] = [];
  const eaRows = readSheet(wb, ['Equipo-Actividad', 'EquipoActividad', 'Equipment-Activity']);
  if (eaRows && eaRows.length >= 2) {
    const headers = eaRows[0].map(h => String(h).trim().toLowerCase());
    const iCode = headers.findIndex(h => h.includes('codigo') || h.includes('código') || h === 'code');
    const iAct  = headers.findIndex(h => h === 'actividad' || h === 'activity');
    const iTmpl = headers.findIndex(h => h.includes('plantilla') || h.includes('template') || h.includes('formulario'));
    if (iCode === -1 || iAct === -1) {
      warnings.push('Hoja "Equipo-Actividad" omitida: requiere columnas "Código Equipo" y "Actividad".');
    } else {
      for (let i = 1; i < eaRows.length; i++) {
        const row = eaRows[i];
        const code = String(row[iCode] ?? '').trim();
        const act = String(row[iAct] ?? '').trim();
        if (!code || !act) continue;
        const tmpl = iTmpl !== -1 ? (String(row[iTmpl] ?? '').trim() || null) : null;
        equipoActividad.push({ equipmentCode: code, activityName: act, templateName: tmpl });
      }
    }
  }

  // ── Hoja Turnos ─────────────────────────────────────────────────────────
  const turnos: TraceabilityShift[] = [];
  const shiftRows = readSheet(wb, ['Turnos', 'Shifts', 'WorkShifts']);
  if (shiftRows && shiftRows.length >= 2) {
    const headers = shiftRows[0].map(h => String(h).trim().toLowerCase());
    const iName = headers.findIndex(h => h === 'nombre' || h === 'name');
    const iStart = headers.findIndex(h => h.includes('inicio') || h.includes('start'));
    const iEnd = headers.findIndex(h => h.includes('fin') || h.includes('end'));
    if (iName === -1 || iStart === -1 || iEnd === -1) {
      warnings.push('Hoja "Turnos" omitida: requiere "Nombre", "Hora Inicio", "Hora Fin".');
    } else {
      for (let i = 1; i < shiftRows.length; i++) {
        const row = shiftRows[i];
        const name = String(row[iName] ?? '').trim();
        if (!name) continue;
        const startH = parseHour(row[iStart]);
        const endH = parseHour(row[iEnd]);
        if (startH == null || endH == null) {
          warnings.push(`Turno "${name}": hora inválida — omitido.`);
          continue;
        }
        turnos.push({ name, startHour: startH, endHour: endH });
        if (startH === endH) {
          warnings.push(`Turno "${name}": hora de inicio y fin son iguales (${startH}h) — se interpretará como turno de 24 horas.`);
        }
      }
    }
  }

  // ── Hoja Plantillas Formulario ──────────────────────────────────────────
  const plantillas: TraceabilityTemplateItem[] = [];
  const tmplRows = readSheet(wb, ['Plantillas Formulario', 'Plantillas', 'Form Templates', 'FormTemplates']);
  if (tmplRows && tmplRows.length >= 2) {
    const headers = tmplRows[0].map(h => String(h).trim());
    const iTmpl = headers.findIndex(h => /plantilla|template/i.test(h));
    const iPart = headers.findIndex(h => /partida/i.test(h) && !/item/i.test(h));
    // Excluye "PartidaItem" — header de item debe ser exactamente "Item" o "Actividad realizada".
    const iItem = headers.findIndex(h => /^item$|actividad realizada/i.test(h.trim()));
    const iVal  = headers.findIndex(h => /m[eé]todo|validaci[oó]n/i.test(h));
    const iSec  = headers.findIndex(h => /secci[oó]n|section/i.test(h));
    if (iTmpl === -1 || iItem === -1) {
      warnings.push('Hoja "Plantillas Formulario" omitida: requiere "Plantilla" y "Item".');
    } else {
      for (let i = 1; i < tmplRows.length; i++) {
        const row = tmplRows[i];
        const templateName = String(row[iTmpl] ?? '').trim();
        const itemDescription = String(row[iItem] ?? '').trim();
        if (!templateName || !itemDescription) continue;
        plantillas.push({
          templateName,
          partidaItem: iPart !== -1 ? (String(row[iPart] ?? '').trim() || null) : null,
          itemDescription,
          validationMethod: iVal !== -1 ? (String(row[iVal] ?? '').trim() || null) : null,
          section: iSec !== -1 ? (String(row[iSec] ?? '').trim() || null) : null,
        });
      }
    }
  }

  if (equipos.length === 0 && actividades.length === 0 && turnos.length === 0 && plantillas.length === 0) {
    throw new ExcelParseError(
      'No se encontraron datos válidos. Verifica que el archivo tenga columnas "Código, Nombre, Tipo" para equipos, o las hojas "Equipos / Actividades / Turnos / Plantillas Formulario" si es multi-hoja.'
    );
  }

  // v41 — hoja "Tablas auxiliares" (grupos de laboratorio: taras, moldes, …).
  const aux = parseAuxTablesSheet(wb);
  warnings.push(...aux.warnings);

  return { equipos, actividades, equipoActividad, turnos, plantillas, auxTables: aux.tables, warnings };
}

/** Acepta "08", "08:00", "8", número 8, 8.5 o 0.333... (8h = 8/24). */
function parseHour(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    // Excel time fraction (0..1) — p.ej. 0.333 ≈ 8h. Floor para descartar minutos
    // consistente con la rama string (0.354 ≈ 8:30 → slot 8h, no 9h).
    if (raw >= 0 && raw <= 1) return Math.floor(raw * 24) % 24;
    // Hora directa (incluye decimales como 8.5 = 8:30 → slot 8h)
    if (raw > 1 && raw <= 24) return Math.min(23, Math.floor(raw));
    return null;
  }
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})(?::\d{1,2})?/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  return h;
}

