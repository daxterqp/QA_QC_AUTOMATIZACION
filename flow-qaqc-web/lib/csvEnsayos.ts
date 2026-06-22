/**
 * csvEnsayos — núcleo PURO de la importación CSV de ensayos (formato ANCHO).
 *
 * 1 fila = 1 ensayo. Columnas fijas: external_id, ubicacion, fecha
 * (+ opcionales llenado_por, firmado_por) y una columna por celda de ENTRADA
 * del template con encabezado "clave + descripción": `4A Peso molde + suelo (g)`.
 * La clave (partida+letra) al inicio identifica la celda; el resto se ignora.
 *
 * Sin I/O, sin Supabase, sin xlsx, sin React — testeable con tsx directo.
 * El resultado se inyecta al pipeline histórico EXISTENTE
 * (validateImport → resolveUsers → executeImport de useHistoricalImport):
 * los ensayos quedan APPROVED + is_historical + is_locked, con snapshot de
 * fórmulas, igual que el importador Excel de 2 hojas.
 */

import { colLetter } from './numericProtocol';
import type {
  HistoricalImportInstance, ImportError, ImportWarning, TemplateContext,
} from './historicalImport';

/** BOM UTF-8 (U+FEFF) — SIEMPRE anteponerlo al descargar (Excel + acentos/ñ). */
export const CSV_BOM = String.fromCharCode(0xFEFF);

// ───────────────────────────── CSV básico ────────────────────────────────────

/** Autodetección del delimitador: Excel regional ES exporta con `;`.
 *  Cuenta `;` vs `,` FUERA de comillas en la línea de encabezado. */
export function detectDelimiter(firstLine: string): ',' | ';' {
  let commas = 0, semis = 0, inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === ',') commas++;
      else if (ch === ';') semis++;
    }
  }
  return semis > commas ? ';' : ',';
}

/** Parser CSV RFC4180-ish: comillas con `""` escapadas, saltos de línea DENTRO
 *  de comillas, CRLF/LF, BOM inicial. Filas completamente vacías se omiten. */
export function parseCsv(text: string): { rows: string[][]; delimiter: ',' | ';' } {
  let s = text;
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  const firstNl = s.indexOf('\n');
  const delimiter = detectDelimiter(firstNl === -1 ? s : s.slice(0, firstNl));

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delimiter) { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') {
      row.push(field); field = '';
      if (row.some(f => f.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  row.push(field);
  if (row.some(f => f.trim() !== '')) rows.push(row);
  return { rows, delimiter };
}

/** Serializa filas a CSV con quoting (campos con delimitador, comillas o \n). */
export function toCsv(rows: string[][], delimiter: ',' | ';' = ','): string {
  const esc = (f: string) => {
    const needs = f.includes(delimiter) || f.includes('"') || f.includes('\n') || f.includes('\r');
    return needs ? `"${f.replace(/"/g, '""')}"` : f;
  };
  return rows.map(r => r.map(esc).join(delimiter)).join('\r\n');
}

// ─────────────────────── Columnas del formato ancho ──────────────────────────

export interface CsvCellColumn {
  /** Clave técnica: `<partida><letra>` (ej "4A"). */
  key: string;
  partida: string;
  col: string;
  /** Encabezado completo: clave + descripción del item. */
  header: string;
}

/** Columnas de celdas de ENTRADA del template, en el orden de la ficha. */
export function buildImportColumns(template: TemplateContext): CsvCellColumn[] {
  const out: CsvCellColumn[] = [];
  for (const { item, spec } of template.parsedRows) {
    if (!spec || spec.kind !== 'row') continue;
    const partida = (item.partida_item ?? '').trim();
    const colMap = template.expectedCells.get(partida);
    if (!colMap) continue;
    for (let i = 0; i < spec.cells.length; i++) {
      const L = colLetter(i);
      if (!colMap.has(L)) continue;
      out.push({
        key: `${partida}${L}`,
        partida,
        col: L,
        header: `${partida}${L} ${item.item_description}`.trim(),
      });
    }
  }
  return out;
}

const FIXED_HEADERS: { key: FixedKey; aliases: string[] }[] = [
  { key: 'external_id', aliases: ['external_id', 'externalid', 'id_externo', 'codigo', 'código'] },
  { key: 'ubicacion', aliases: ['ubicacion', 'ubicación', 'location'] },
  { key: 'fecha', aliases: ['fecha', 'fecha_ensayo', 'filled_at'] },
  { key: 'llenado_por', aliases: ['llenado_por', 'llenado por', 'filled_by'] },
  { key: 'firmado_por', aliases: ['firmado_por', 'firmado por', 'signed_by'] },
];
type FixedKey = 'external_id' | 'ubicacion' | 'fecha' | 'llenado_por' | 'firmado_por';

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Identifica la celda por el PRIMER token del encabezado, matcheando contra
 *  las partidas REALES del template — soporta partidas con punto ("1.1A",
 *  "7.2"). Prioridad: partida exacta (→ col A) > prefijo+letra > token
 *  numérico legacy (para reportar la clave en el warning de "no existe"). */
function matchCellToken(rawHeader: string, template: TemplateContext): { partida: string; col: string } | null {
  const token = rawHeader.trim().split(/\s+/)[0] ?? '';
  if (!token) return null;
  if (template.expectedCells.has(token)) return { partida: token, col: 'A' };
  const m = /^(.+?)([A-Za-z])$/.exec(token);
  if (m && template.expectedCells.has(m[1])) return { partida: m[1], col: m[2].toUpperCase() };
  const n = /^(\d+(?:\.\d+)*)([A-Za-z])?$/.exec(token);
  if (n) return { partida: n[1], col: (n[2] ?? 'A').toUpperCase() };
  return null;
}

export interface WideHeaderInfo {
  fixedIdx: Partial<Record<FixedKey, number>>;
  cellCols: (CsvCellColumn & { index: number })[];
  unknownHeaders: string[];
  errors: string[];
}

/** Mapea la fila de encabezados del CSV ancho contra el template. */
export function parseWideHeader(headers: string[], template: TemplateContext): WideHeaderInfo {
  const fixedIdx: Partial<Record<FixedKey, number>> = {};
  const cellCols: (CsvCellColumn & { index: number })[] = [];
  const unknownHeaders: string[] = [];
  const errors: string[] = [];
  const seenKeys = new Set<string>();

  for (let idx = 0; idx < headers.length; idx++) {
    const raw = (headers[idx] ?? '').trim();
    if (!raw) continue;
    const norm = normalizeHeader(raw);

    const fixed = FIXED_HEADERS.find(f => f.aliases.includes(norm));
    if (fixed) {
      if (fixedIdx[fixed.key] != null) errors.push(`Columna fija "${fixed.key}" duplicada en el encabezado`);
      else fixedIdx[fixed.key] = idx;
      continue;
    }

    const m = matchCellToken(raw, template);
    if (m) {
      const { partida, col } = m;
      const key = `${partida}${col}`;
      const colMap = template.expectedCells.get(partida);
      if (!colMap || !colMap.has(col)) {
        unknownHeaders.push(`"${raw}" — la celda ${key} no es una celda de entrada del template (ignorada)`);
        continue;
      }
      if (seenKeys.has(key)) {
        errors.push(`Clave de celda "${key}" duplicada en el encabezado`);
        continue;
      }
      seenKeys.add(key);
      cellCols.push({ key, partida, col, header: raw, index: idx });
      continue;
    }

    unknownHeaders.push(`"${raw}" — columna no reconocida (ignorada)`);
  }

  for (const req of ['external_id', 'ubicacion', 'fecha'] as FixedKey[]) {
    if (fixedIdx[req] == null) errors.push(`Falta la columna obligatoria "${req}"`);
  }
  if (cellCols.length === 0) errors.push('El encabezado no contiene ninguna columna de celda del template (ej: "4A …")');

  return { fixedIdx, cellCols, unknownHeaders, errors };
}

// ───────────────────────── Fila → instancia ──────────────────────────────────

/** Fecha flexible: dd/mm/aaaa (con hora opcional) o ISO. → epoch ms | null. */
export function parseFechaFlexible(s: string): number | null {
  const t = (s ?? '').trim();
  if (!t) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(t);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 12), Number(m[5] ?? 0));
    // Rechaza overflow (32/13): el Date "corrige" y cambiaría día/mes en silencio.
    if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;
    return d.getTime();
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) {
    // ISO solo-fecha: a MEDIODÍA LOCAL — Date.parse la haría medianoche UTC y
    // en husos negativos (Perú) la fecha exportada retrocedería un día.
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0);
    if (d.getDate() !== Number(iso[3]) || d.getMonth() !== Number(iso[2]) - 1) return null;
    return d.getTime();
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) {
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** "Juan Pérez Soto" → { name: "Juan", apellido: "Pérez Soto" }. */
export function splitFullName(s: string): { name: string; apellido?: string } {
  const parts = (s ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { name: '' };
  if (parts.length === 1) return { name: parts[0] };
  return { name: parts[0], apellido: parts.slice(1).join(' ') };
}

/** Normaliza el valor según el kind de la celda (bool: Sí/No/true → "1"/"0"). */
function normalizeCellValue(value: string, template: TemplateContext, partida: string, col: string): string {
  const spec = template.expectedCells.get(partida)?.get(col);
  if (spec?.kind === 'bool') {
    const v = value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (['1', 'si', 'sí', 'true', 'x'].includes(v)) return '1';
    if (['0', 'no', 'false'].includes(v)) return '0';
  }
  return value.trim();
}

export interface CsvDefaults {
  /** Usuario actual: fallback de llenado_por/firmado_por. */
  name: string;
  apellido?: string;
}

/** Convierte una fila wide en HistoricalImportInstance (o error de fila). */
export function wideRowToInstance(
  row: string[],
  lineNum: number,
  headerInfo: WideHeaderInfo,
  templateIdProtocolo: string,
  template: TemplateContext,
  defaults: CsvDefaults,
): { instance?: HistoricalImportInstance; error?: ImportError; warnings: ImportWarning[] } {
  const warnings: ImportWarning[] = [];
  const at = (i?: number) => (i == null ? '' : (row[i] ?? '').trim());

  const externalId = at(headerInfo.fixedIdx.external_id);
  if (!externalId) return { error: { line: lineNum, reason: 'external_id vacío' }, warnings };

  const fechaRaw = at(headerInfo.fixedIdx.fecha);
  const filledAt = parseFechaFlexible(fechaRaw);
  if (filledAt == null) {
    return { error: { line: lineNum, instance_external_id: externalId, reason: `fecha "${fechaRaw}" inválida (use dd/mm/aaaa o ISO)` }, warnings };
  }

  const ubicacion = at(headerInfo.fixedIdx.ubicacion);
  if (!ubicacion) return { error: { line: lineNum, instance_external_id: externalId, reason: 'ubicacion vacía' }, warnings };

  // Usuarios: opcionales → fallback al usuario actual (warning informativo).
  let filled = splitFullName(at(headerInfo.fixedIdx.llenado_por));
  if (!filled.name) {
    filled = { name: defaults.name, apellido: defaults.apellido };
    warnings.push({ instance_external_id: externalId, reason: 'sin llenado_por — se asigna al usuario actual' });
  }
  let signed = splitFullName(at(headerInfo.fixedIdx.firmado_por));
  if (!signed.name) signed = filled;

  const cells: HistoricalImportInstance['cells'] = [];
  for (const cc of headerInfo.cellCols) {
    const v = (row[cc.index] ?? '').trim();
    if (v === '') continue;   // vacías se omiten — el validador avisa "queda vacía"
    cells.push({ partida_item: cc.partida, col: cc.col, value: normalizeCellValue(v, template, cc.partida, cc.col) });
  }

  return {
    instance: {
      external_id: externalId,
      template_id_protocolo: templateIdProtocolo,
      location_name: ubicacion,
      filled_at: filledAt,
      filled_by_name: filled.name,
      filled_by_apellido: filled.apellido,
      signed_by_name: signed.name,
      signed_by_apellido: signed.apellido,
      cells,
    },
    warnings,
  };
}

// ─────────────────────── Punto de entrada del import ─────────────────────────

export interface ParseEnsayosResult {
  instances: HistoricalImportInstance[];
  errors: ImportError[];
  warnings: ImportWarning[];
}

export function parseEnsayosCsv(
  text: string,
  template: TemplateContext,
  defaults: CsvDefaults,
): ParseEnsayosResult {
  const errors: ImportError[] = [];
  const warnings: ImportWarning[] = [];
  const instances: HistoricalImportInstance[] = [];

  const { rows } = parseCsv(text);
  if (rows.length === 0) return { instances, errors: [{ reason: 'El archivo está vacío' }], warnings };

  const headerInfo = parseWideHeader(rows[0], template);
  for (const e of headerInfo.errors) errors.push({ line: 1, reason: e });
  for (const u of headerInfo.unknownHeaders) warnings.push({ instance_external_id: '(encabezado)', reason: u });
  if (headerInfo.errors.length > 0) return { instances, errors, warnings };

  if (rows.length === 1) errors.push({ reason: 'El archivo no tiene filas de datos' });

  for (let r = 1; r < rows.length; r++) {
    const { instance, error, warnings: w } = wideRowToInstance(
      rows[r], r + 1, headerInfo, template.id_protocolo, template, defaults,
    );
    warnings.push(...w);
    if (error) { errors.push(error); continue; }
    if (instance) instances.push(instance);
  }

  return { instances, errors, warnings };
}

// ───────────────────────── Plantilla descargable ─────────────────────────────

/** CSV de plantilla: encabezados fijos + celdas de entrada del template y una
 *  fila de ejemplo. El caller antepone CSV_BOM al descargar. */
export function generateCsvTemplate(template: TemplateContext): string {
  const cellCols = buildImportColumns(template);
  const header = ['external_id', 'ubicacion', 'fecha', 'llenado_por', 'firmado_por', ...cellCols.map(c => c.header)];
  const example = ['ENS-0001', '(nombre exacto de la ubicación)', '03/03/2026', 'Juan Pérez', '', ...cellCols.map(() => '')];
  return toCsv([header, example], ',');
}
