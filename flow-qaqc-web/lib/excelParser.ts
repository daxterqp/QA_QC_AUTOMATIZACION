/**
 * excelParser.ts — Web version of ExcelImporter.ts + ExcelLocationsImporter.ts
 *
 * Parses from a browser File object using `xlsx` + ArrayBuffer.
 * Same column structure as the APK services.
 */

import * as XLSX from 'xlsx';

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

  const protocols: ExcelProtocolGroup[] = Array.from(protocolMap.entries()).map(([id, v]) => ({
    idProtocolo: id,
    protocolName: v.name,
    activities: v.activities,
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
