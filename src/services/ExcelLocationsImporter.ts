import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

// ─── Columnas requeridas ──────────────────────────────────────────────────────

export const LOCATIONS_REQUIRED_COLUMNS = [
  'Ubicación',
  'PLANO DE REFERENCIA',
] as const;

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ExcelLocation {
  name: string;           // "Cocina 1- Piso 1"
  referencePlan: string;  // "Plano_Cocina_P1"
}

export interface LocationsImportResult {
  locations: ExcelLocation[];
  totalRows: number;
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

// ─── Funcion principal ───────────────────────────────────────────────────────

/**
 * Abre el selector de archivos, parsea el Excel de Ubicaciones y retorna
 * la lista de ubicaciones con sus planos de referencia.
 *
 * Estructura esperada del Excel:
 * | Ubicación        | PLANO DE REFERENCIA |
 * |------------------|---------------------|
 * | Cocina 1- Piso 1 | Plano_Cocina_P1     |
 *
 * @throws LocationsImportError si faltan columnas o el formato es invalido
 * @returns null si el usuario cancela la seleccion
 */
export async function importExcelLocations(): Promise<LocationsImportResult | null> {
  // 1. Seleccionar archivo
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

  const { uri } = pickerResult.assets[0];

  // 2. Leer como base64
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64' as const,
  });

  // 3. Parsear con SheetJS
  const workbook = XLSX.read(base64, { type: 'base64' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new LocationsImportError('El archivo Excel no contiene hojas de calculo.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  });

  if (rows.length < 2) {
    throw new LocationsImportError('El archivo Excel esta vacio o solo tiene cabecera.');
  }

  // 4. Validar columnas
  const headers = rows[0].map((h) => String(h).trim());
  const missing = LOCATIONS_REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missing.length > 0) {
    throw new LocationsImportError(
      `Faltan columnas requeridas: ${missing.join(', ')}`,
      missing
    );
  }

  const ubIdx = headers.indexOf('Ubicación');
  const planIdx = headers.indexOf('PLANO DE REFERENCIA');

  // 5. Parsear filas
  const locations: ExcelLocation[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row[ubIdx] ?? '').trim();
    const referencePlan = String(row[planIdx] ?? '').trim();

    if (!name) continue; // Saltar filas vacias

    locations.push({ name, referencePlan });
  }

  if (locations.length === 0) {
    throw new LocationsImportError('El archivo no contiene ubicaciones validas.');
  }

  return { locations, totalRows: rows.length - 1 };
}
