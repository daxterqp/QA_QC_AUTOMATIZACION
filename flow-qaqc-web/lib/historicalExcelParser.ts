/**
 * Parser de Excel para protocolos históricos.
 *
 * Formato del workbook esperado:
 *   - Hoja "Metadata" (1 fila por instancia):
 *     external_id | template_id_protocolo | location_name | filled_at | submitted_at | signed_at |
 *     filled_by_name | filled_by_apellido | signed_by_name | signed_by_apellido | general_comment
 *   - Hoja "Respuestas" (1+ fila por instancia, formato LONG):
 *     external_id | partida_item | col | value
 *
 *   `col` es la letra de columna (A, B, C, ...). Si la celda del template es
 *   single-col (solo A implícita), basta con "A" o vacío.
 *   `filled_at` / `submitted_at` / `signed_at` aceptan formato ISO (YYYY-MM-DD)
 *   o un número Excel (días desde 1900) — XLSX lo convierte a Date automáticamente
 *   si la celda está formateada como fecha.
 */

import * as XLSX from 'xlsx';
import type { HistoricalImportInstance, ImportError } from './historicalImport';

export interface HistoricalParseResult {
  instances: HistoricalImportInstance[];
  errors: ImportError[];
}

export class HistoricalParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HistoricalParseError';
  }
}

const METADATA_SHEET = 'Metadata';
const RESPONSES_SHEET = 'Respuestas';

/** Convierte una celda a epoch ms. Acepta:
 *   - Date object (cuando XLSX detectó fecha)
 *   - Número (epoch ms o seconds — se asume ms si > 10^12)
 *   - String ISO 8601 (YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss)
 *   - String con formato d/m/YYYY o m/d/YYYY (parseo flexible). */
function toEpochMs(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'number') {
    // Excel serial date conversion (XLSX usually handles this via cellDates:true)
    // Here we treat number as epoch ms if > 10^12, else as seconds
    if (raw > 1e12) return raw;
    if (raw > 1e9) return raw * 1000; // seconds → ms
    return null; // demasiado pequeño para ser fecha epoch
  }
  if (typeof raw === 'string') {
    const t = Date.parse(raw);
    if (!isNaN(t)) return t;
    // Intento parseo d/m/YYYY o m/d/YYYY
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      // Asume formato latino d/m/YYYY (lo más común en es-PE)
      const [_, d, mo, y] = m;
      const dt = new Date(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10));
      return dt.getTime();
    }
  }
  return null;
}

/** Convierte un valor de celda a string limpio (trim). */
function toStr(raw: unknown): string {
  if (raw == null) return '';
  return String(raw).trim();
}

/** Parsea un workbook de históricos. */
export async function parseHistoricalExcel(file: File): Promise<HistoricalParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });

  if (!wb.SheetNames.includes(METADATA_SHEET)) {
    throw new HistoricalParseError(`Falta la hoja "${METADATA_SHEET}"`);
  }
  if (!wb.SheetNames.includes(RESPONSES_SHEET)) {
    throw new HistoricalParseError(`Falta la hoja "${RESPONSES_SHEET}"`);
  }

  const metaSheet = wb.Sheets[METADATA_SHEET];
  const respSheet = wb.Sheets[RESPONSES_SHEET];

  const metaRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(metaSheet, { defval: '' });
  const respRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(respSheet, { defval: '' });

  const errors: ImportError[] = [];

  // Agrupar Respuestas por external_id
  const cellsByExternalId = new Map<string, { partida_item: string; col: string; value: string }[]>();
  for (let i = 0; i < respRows.length; i++) {
    const row = respRows[i];
    const externalId = toStr(row.external_id);
    if (!externalId) {
      errors.push({ line: i + 2, reason: 'Fila Respuestas sin external_id' });
      continue;
    }
    const partida = toStr(row.partida_item);
    if (!partida) {
      errors.push({ line: i + 2, instance_external_id: externalId, reason: 'Fila Respuestas sin partida_item' });
      continue;
    }
    const col = toStr(row.col) || 'A';
    const value = toStr(row.value);
    const arr = cellsByExternalId.get(externalId) ?? [];
    arr.push({ partida_item: partida, col, value });
    cellsByExternalId.set(externalId, arr);
  }

  // Parsear Metadata + ensamblar instancias
  const instances: HistoricalImportInstance[] = [];
  for (let i = 0; i < metaRows.length; i++) {
    const row = metaRows[i];
    const externalId = toStr(row.external_id);
    if (!externalId) {
      errors.push({ line: i + 2, reason: 'Fila Metadata sin external_id (omitida)' });
      continue;
    }

    const filledAt = toEpochMs(row.filled_at);
    if (filledAt == null) {
      errors.push({ line: i + 2, instance_external_id: externalId, reason: `filled_at inválido o vacío: "${toStr(row.filled_at)}"` });
      continue;
    }

    const submittedAt = toEpochMs(row.submitted_at) ?? filledAt;
    const signedAt = toEpochMs(row.signed_at) ?? filledAt;

    const inst: HistoricalImportInstance = {
      external_id: externalId,
      template_id_protocolo: toStr(row.template_id_protocolo),
      location_name: toStr(row.location_name),
      filled_at: filledAt,
      submitted_at: submittedAt,
      signed_at: signedAt,
      filled_by_name: toStr(row.filled_by_name),
      filled_by_apellido: toStr(row.filled_by_apellido) || undefined,
      signed_by_name: toStr(row.signed_by_name),
      signed_by_apellido: toStr(row.signed_by_apellido) || undefined,
      general_comment: toStr(row.general_comment) || undefined,
      cells: cellsByExternalId.get(externalId) ?? [],
    };
    instances.push(inst);
  }

  return { instances, errors };
}

// ────────── Generador de plantilla Excel descargable por template ────────────

import type { TemplateContext } from './historicalImport';

/** Genera un Excel descargable como blob con 2 hojas:
 *   - Metadata: 1 fila vacía como ejemplo + headers.
 *   - Respuestas: filas pre-llenadas con (partida, col) por cada celda manual/list
 *                 del template — solo headers + 1 fila vacía como ejemplo.
 *
 *  El usuario edita el Excel localmente y lo sube. */
export function generateHistoricalTemplateExcel(template: TemplateContext): Blob {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Metadata
  const metaHeaders = [
    'external_id', 'template_id_protocolo', 'location_name',
    'filled_at', 'submitted_at', 'signed_at',
    'filled_by_name', 'filled_by_apellido', 'signed_by_name', 'signed_by_apellido',
    'general_comment',
  ];
  const metaExample: Record<string, string | number> = {
    external_id: 'HIS-001',
    template_id_protocolo: template.id_protocolo,
    location_name: '',
    filled_at: '',
    submitted_at: '',
    signed_at: '',
    filled_by_name: '',
    filled_by_apellido: '',
    signed_by_name: '',
    signed_by_apellido: '',
    general_comment: '',
  };
  const metaWs = XLSX.utils.json_to_sheet([metaExample], { header: metaHeaders });
  XLSX.utils.book_append_sheet(wb, metaWs, METADATA_SHEET);

  // Sheet 2: Respuestas — 1 fila por celda manual/list esperada
  const respHeaders = ['external_id', 'partida_item', 'col', 'value'];
  const respRows: Record<string, string>[] = [];
  template.expectedCells.forEach((colMap, partida) => {
    colMap.forEach((spec, col) => {
      respRows.push({
        external_id: 'HIS-001',
        partida_item: partida,
        col,
        value: '',  // el usuario completa aquí
      });
    });
  });
  if (respRows.length === 0) {
    respRows.push({ external_id: 'HIS-001', partida_item: '', col: 'A', value: '' });
  }
  const respWs = XLSX.utils.json_to_sheet(respRows, { header: respHeaders });
  XLSX.utils.book_append_sheet(wb, respWs, RESPONSES_SHEET);

  // Convertir a Blob
  const arrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
