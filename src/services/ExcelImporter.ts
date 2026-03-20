import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

// ─── Columnas requeridas en el Excel maestro ─────────────────────────────────

export const REQUIRED_COLUMNS = [
  'ID_Protocolo',
  'Protocolo',
  'PartidaItem',
  'Actividad realizada',
  'Método de validación',
] as const;

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ExcelActivity {
  partidaItem: string;
  actividadRealizada: string;
  metodoValidacion: string;
  /** null = sin sección (columna vacía o "NA") */
  seccion: string | null;
}

export interface ExcelProtocolGroup {
  /** ID único del protocolo, ej: "1", "C1", "CIM-001" */
  idProtocolo: string;
  /** Nombre del protocolo, ej: "PROTOCOLO DE CIMENTACIÓN" */
  protocolName: string;
  activities: ExcelActivity[];
}

export interface ExcelImportResult {
  protocols: ExcelProtocolGroup[];
  totalRows: number;
  totalProtocols: number;
  fileUri: string;
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

/** Parsea un Excel maestro desde una URI local (sin file picker). */
export async function importExcelMaestroFromUri(uri: string): Promise<ExcelImportResult> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as const });
  const workbook = XLSX.read(base64, { type: 'base64' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new ExcelImportError('El archivo Excel no contiene hojas de calculo.');
  const worksheet = workbook.Sheets[firstSheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (rows.length < 2) throw new ExcelImportError('El archivo Excel no tiene filas de datos.');
  const headers = rows[0].map((h) => String(h).trim());
  validateHeaders(headers);
  const colIndex = buildColumnIndex(headers);
  const protocolMap = new Map<string, { name: string; activities: ExcelActivity[] }>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const idProtocolo = String(row[colIndex['ID_Protocolo']] ?? '').trim();
    const protocolName = String(row[colIndex['Protocolo']] ?? '').trim();
    const partidaItem = String(row[colIndex['PartidaItem']] ?? '').trim();
    const actividadRealizada = String(row[colIndex['Actividad realizada']] ?? '').trim();
    const metodoValidacion = String(row[colIndex['Método de validación']] ?? '').trim();
    const seccionRaw = colIndex['Sección'] !== undefined ? String(row[colIndex['Sección']] ?? '').trim() : '';
    const seccion = (seccionRaw && seccionRaw.toUpperCase() !== 'NA') ? seccionRaw : null;
    if (!idProtocolo && !actividadRealizada) continue;
    if (!idProtocolo) { console.warn(`[Excel] Fila ${i + 1} ignorada: columna "ID_Protocolo" vacia.`); continue; }
    const existing = protocolMap.get(idProtocolo);
    if (!existing) {
      protocolMap.set(idProtocolo, { name: protocolName || idProtocolo, activities: [{ partidaItem, actividadRealizada, metodoValidacion, seccion }] });
    } else {
      if (protocolName && existing.name === idProtocolo) existing.name = protocolName;
      existing.activities.push({ partidaItem, actividadRealizada, metodoValidacion, seccion });
    }
  }
  const protocols: ExcelProtocolGroup[] = Array.from(protocolMap.entries()).map(
    ([idProtocolo, { name, activities }]) => ({ idProtocolo, protocolName: name, activities })
  );
  return { protocols, totalRows: rows.length - 1, totalProtocols: protocols.length, fileUri: uri };
}

export async function importExcelMaestro(): Promise<ExcelImportResult | null> {
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
  return importExcelMaestroFromUri(uri);
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
  headers.forEach((header, i) => { index[header] = i; });
  return index;
}
