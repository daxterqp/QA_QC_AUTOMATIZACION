import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

// ─── Columnas requeridas en el Excel maestro ─────────────────────────────────

export const REQUIRED_COLUMNS = [
  'Protocolo',
  'PartidaItem',
  'Actividad realizada',
  'Método de validación',
] as const;

// ─── Columnas opcionales (reservadas para futuras versiones del Excel) ────────

export const OPTIONAL_COLUMNS = [
  'Responsable',
  'Especialidad',
  'Etapa',
  'Criterio de aceptacion',
  'Observaciones',
  'Estado',
  'Evidencia fotografica',
  'Ubicacion',
  'Fecha',
] as const;

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ExcelActivity {
  partidaItem: string;
  actividadRealizada: string;
  metodoValidacion: string;
  // Campos opcionales — se preservan si existen en el Excel
  responsable?: string;
  especialidad?: string;
  etapa?: string;
  criterioAceptacion?: string;
  observaciones?: string;
  estado?: string;
  ubicacion?: string;
  fecha?: string;
}

export interface ExcelProtocolGroup {
  /** Valor unico de la columna "Protocolo", ej: "C1-P1-PROY_LOM" */
  protocolName: string;
  activities: ExcelActivity[];
}

export interface ExcelImportResult {
  protocols: ExcelProtocolGroup[];
  totalRows: number;
  totalProtocols: number;
}

export class ExcelImportError extends Error {
  constructor(
    message: string,
    public readonly missingColumns?: string[]
  ) {
    super(message);
    this.name = 'ExcelImportError';
  }
}

// ─── Funcion principal ───────────────────────────────────────────────────────

/**
 * Abre el selector de archivos, parsea el Excel maestro y retorna
 * la estructura jerarquica Protocolo → Actividades.
 *
 * @throws ExcelImportError si faltan columnas requeridas o el formato es invalido
 * @returns null si el usuario cancela la seleccion
 */
export async function importExcelMaestro(): Promise<ExcelImportResult | null> {
  // 1. Seleccionar archivo
  const pickerResult = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel',                                           // .xls
    ],
    copyToCacheDirectory: true,
  });

  if (pickerResult.canceled || !pickerResult.assets?.[0]) {
    return null;
  }

  const { uri } = pickerResult.assets[0];

  // 2. Leer el archivo como base64 (necesario en React Native)
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64' as const,
  });

  // 3. Parsear con SheetJS
  const workbook = XLSX.read(base64, { type: 'base64' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new ExcelImportError('El archivo Excel no contiene hojas de calculo.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  // header: 1 → cada fila es un array; defval: '' → celdas vacias como string vacio
  const rows: string[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  });

  if (rows.length < 2) {
    throw new ExcelImportError('El archivo Excel no tiene filas de datos (solo cabecera o esta vacio).');
  }

  // 4. Validar columnas
  const headers = rows[0].map((h) => String(h).trim());
  validateHeaders(headers);

  // 5. Mapear indices de columnas
  const colIndex = buildColumnIndex(headers);

  // 6. Parsear filas y agrupar por protocolo
  const protocolMap = new Map<string, ExcelActivity[]>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const protocolName = String(row[colIndex['Protocolo']] ?? '').trim();
    const partidaItem = String(row[colIndex['PartidaItem']] ?? '').trim();
    const actividadRealizada = String(row[colIndex['Actividad realizada']] ?? '').trim();
    const metodoValidacion = String(row[colIndex['Método de validación']] ?? '').trim();

    // Saltar filas completamente vacias
    if (!protocolName && !actividadRealizada) continue;

    if (!protocolName) {
      console.warn(`[Excel] Fila ${i + 1} ignorada: columna "Protocolo" vacia.`);
      continue;
    }

    const activity: ExcelActivity = {
      partidaItem,
      actividadRealizada,
      metodoValidacion,
      ...extractOptionalFields(row, colIndex),
    };

    const existing = protocolMap.get(protocolName) ?? [];
    existing.push(activity);
    protocolMap.set(protocolName, existing);
  }

  // 7. Construir resultado final
  const protocols: ExcelProtocolGroup[] = Array.from(protocolMap.entries()).map(
    ([protocolName, activities]) => ({ protocolName, activities })
  );

  return {
    protocols,
    totalRows: rows.length - 1, // excluir cabecera
    totalProtocols: protocols.length,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validateHeaders(headers: string[]): void {
  const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missing.length > 0) {
    throw new ExcelImportError(
      `El Excel maestro no tiene las columnas requeridas: ${missing.join(', ')}`,
      missing
    );
  }
}

function buildColumnIndex(headers: string[]): Record<string, number> {
  const index: Record<string, number> = {};
  headers.forEach((header, i) => {
    index[header] = i;
  });
  return index;
}

function extractOptionalFields(
  row: string[],
  colIndex: Record<string, number>
): Partial<ExcelActivity> {
  const get = (col: string): string | undefined => {
    const idx = colIndex[col];
    if (idx === undefined) return undefined;
    const val = String(row[idx] ?? '').trim();
    return val || undefined;
  };

  return {
    responsable: get('Responsable'),
    especialidad: get('Especialidad'),
    etapa: get('Etapa'),
    criterioAceptacion: get('Criterio de aceptacion'),
    observaciones: get('Observaciones'),
    estado: get('Estado'),
    ubicacion: get('Ubicacion'),
    fecha: get('Fecha'),
  };
}
