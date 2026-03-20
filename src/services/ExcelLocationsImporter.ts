import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

// ─── Columnas requeridas ──────────────────────────────────────────────────────

export const LOCATIONS_REQUIRED_COLUMNS = [
  'Ubicación',
  'PLANO DE REFERENCIA',
  'ID_Protocolos',
] as const;

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ExcelLocation {
  name: string;           // "P1-Sector1-Cimiento"
  locationOnly: string;   // "P1-Sector1" (columna Ubicación_Sola, opcional)
  specialty: string;      // "Cimiento"   (columna Especialidad_Sola, opcional)
  referencePlan: string;  // "CIM,DetalleCimientos"
  templateIds: string;    // "PROY-OP-01,PROY-OP-02" — IDs separados por coma
}

export interface LocationsImportResult {
  locations: ExcelLocation[];
  totalRows: number;
  fileUri: string;
}

export class LocationsImportError extends Error {
  constructor(
    message: string,
    public readonly missingColumns?: string[]
  ) {
    super(message);
    this.name = 'LocationsImportError';
  }
}

// ─── Funcion desde URI (sin file picker) ─────────────────────────────────────

export async function importExcelLocationsFromUri(uri: string): Promise<LocationsImportResult> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as const });
  const workbook = XLSX.read(base64, { type: 'base64' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new LocationsImportError('El archivo Excel no contiene hojas de calculo.');
  const worksheet = workbook.Sheets[firstSheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (rows.length < 2) throw new LocationsImportError('El archivo Excel esta vacio o solo tiene cabecera.');
  const headers = rows[0].map((h) => String(h).trim());
  const missing = LOCATIONS_REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missing.length > 0) throw new LocationsImportError(`Faltan columnas requeridas: ${missing.join(', ')}`, missing);

  const ubIdx       = headers.indexOf('Ubicación');
  const ubSolaIdx   = headers.indexOf('Ubicación_Sola');
  const espSolaIdx  = headers.indexOf('Especialidad_Sola');
  const planIdx     = headers.indexOf('PLANO DE REFERENCIA');
  const idsIdx      = headers.indexOf('ID_Protocolos');

  const locations: ExcelLocation[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row[ubIdx] ?? '').trim();
    if (!name) continue;
    const locationOnly = ubSolaIdx >= 0 ? String(row[ubSolaIdx] ?? '').trim() : '';
    const specialty    = espSolaIdx >= 0 ? String(row[espSolaIdx] ?? '').trim() : '';
    const referencePlan = String(row[planIdx] ?? '').trim();
    const templateIds   = String(row[idsIdx] ?? '').trim();
    locations.push({ name, locationOnly, specialty, referencePlan, templateIds });
  }
  if (locations.length === 0) throw new LocationsImportError('El archivo no contiene ubicaciones validas.');
  return { locations, totalRows: rows.length - 1, fileUri: uri };
}

// ─── Funcion principal con file picker ───────────────────────────────────────

export async function importExcelLocations(): Promise<LocationsImportResult | null> {
  const pickerResult = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
    copyToCacheDirectory: true,
  });

  if (pickerResult.canceled || !pickerResult.assets?.[0]) {
    return null;
  }

  return importExcelLocationsFromUri(pickerResult.assets[0].uri);
}
