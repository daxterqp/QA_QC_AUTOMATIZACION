/**
 * Lógica pura del importador de protocolos históricos.
 *
 * Sin I/O ni Supabase ni React — solo funciones que reciben data parsed y
 * devuelven validación + ensamble del shape a insertar. Testeable en aislamiento.
 *
 * Flujo: parse → validate per-instance + per-cell → assemble cellVals/comments →
 * snapshot fórmulas/lookups via resolveScopeCells → produce filas listas a insertar.
 */

import {
  parseNumericRow, parseNumeric, inRange,
  splitRowComments, joinRowComments, colLetter, scopeKeyFor,
  extractHeaderRows, extractMatrices, isValidDateText, isValidTimeText,
  type NumericRowSpec, type NumericCellSpec, type MatrixData,
} from './numericProtocol';
import { resolveScopeCells, type ScopeCell } from './formulaEval';

/** v35 — Kinds de celda que el USUARIO llena (entran a expectedCells del
 *  import). Antes solo manual/list: los tipos v32 (fecha, hora, bool, %,
 *  equipo, comentario) se perdían silenciosamente al importar históricos. */
const INPUT_KINDS: NumericCellSpec['kind'][] =
  ['manual', 'list', 'percent', 'bool', 'date', 'time', 'equipment', 'comment'];

// ───────────────────────────────── Tipos ─────────────────────────────────────

export interface HistoricalImportInstance {
  external_id: string;
  template_id_protocolo: string;
  location_name: string;
  filled_at: number;
  submitted_at?: number;
  signed_at?: number;
  filled_by_name: string;
  signed_by_name: string;
  filled_by_apellido?: string;
  signed_by_apellido?: string;
  general_comment?: string;
  /** Una entrada por celda llenada por el usuario. Formula/lookup/graph/header/matrix
   *  NO se incluyen — vienen del template o se snapshotean. */
  cells: { partida_item: string; col: string; value: string }[];
}

export interface ImportError {
  line?: number;
  instance_external_id?: string;
  reason: string;
}

export interface ImportWarning {
  instance_external_id: string;
  partida_item?: string;
  col?: string;
  reason: string;
}

export interface UnknownUser {
  name: string;
  apellido?: string;
}

export interface ValidationResult {
  validInstances: HistoricalImportInstance[];
  errors: ImportError[];
  warnings: ImportWarning[];
  unknownUsers: UnknownUser[];
}

/** Estructura de un template tal como la necesita el validador.
 *  Encapsula los items + matrices + mapa expectedCells para validar instancias. */
export interface TemplateContext {
  id: string;
  id_protocolo: string;
  name: string;
  /** Items del template (todos: headers, matrices, datos) */
  items: {
    id: string;
    partida_item: string | null;
    item_description: string;
    validation_method: string | null;
    section: string | null;
  }[];
  /** Cache: parseNumericRow ya aplicado a cada item */
  parsedRows: { item: TemplateContext['items'][0]; spec: NumericRowSpec | null }[];
  /** Matrices auxiliares extraídas del template (catálogos para lookup/list) */
  matrices: Record<string, MatrixData>;
  /** Map<partida_item, Map<col, NumericCellSpec>> — celdas que el usuario DEBE llenar.
   *  Solo manual + list. Excluye formula/lookup/graph (se snapshotean) y headers/matrices. */
  expectedCells: Map<string, Map<string, NumericCellSpec>>;
  /** Si el protocolo es numérico (todos sus items matchean) o clásico. */
  isNumeric: boolean;
}

/** Construye TemplateContext a partir de los items raw del template. */
export function buildTemplateContext(
  template: { id: string; id_protocolo: string; name: string },
  items: TemplateContext['items'],
): TemplateContext {
  const parsedRows = items.map(it => ({ item: it, spec: parseNumericRow(it.validation_method) }));
  const isNumeric = items.length > 0 && parsedRows.every(r => r.spec !== null);

  // matrices solo se extraen si es numérico
  let matrices: Record<string, MatrixData> = {};
  if (isNumeric) {
    const { dataRows } = extractHeaderRows(parsedRows);
    const ex = extractMatrices(dataRows);
    matrices = ex.matrices;
  }

  // expectedCells: solo cells manual/list (lo que el usuario DEBE llenar)
  const expectedCells = new Map<string, Map<string, NumericCellSpec>>();
  for (const { item, spec } of parsedRows) {
    if (!spec) continue;
    const partida = (item.partida_item ?? '').trim();
    if (!partida) continue;
    // Excluir auto-asignados (headers y matrices)
    if (/^__hdr\d+__$/i.test(partida) || /^__matrix_/i.test(partida)) continue;
    if (spec.kind !== 'row') continue;
    const colMap = new Map<string, NumericCellSpec>();
    for (let i = 0; i < spec.cells.length; i++) {
      const c = spec.cells[i];
      // Todas las celdas de ENTRADA (v35: incluye tipos v32). Las ocultas no
      // son llenables (el validador de fichas ya rechaza :oculto en entradas).
      if (INPUT_KINDS.includes(c.kind) && !c.hidden) {
        colMap.set(colLetter(i), c);
      }
    }
    if (colMap.size > 0) expectedCells.set(partida, colMap);
  }

  return {
    id: template.id,
    id_protocolo: template.id_protocolo,
    name: template.name,
    items,
    parsedRows,
    matrices,
    expectedCells,
    isNumeric,
  };
}

// ────────────────────────────── Validación ───────────────────────────────────

/** Verifica que metadata mínima esté presente; retorna razón si falla. */
function validateMetadata(instance: HistoricalImportInstance): string | null {
  if (!instance.external_id || !instance.external_id.trim()) return 'external_id ausente';
  if (!instance.template_id_protocolo) return 'template_id_protocolo ausente';
  if (!instance.location_name) return 'location_name ausente';
  if (!Number.isFinite(instance.filled_at)) return 'filled_at inválido';
  if (!instance.filled_by_name?.trim()) return 'filled_by_name ausente';
  if (!instance.signed_by_name?.trim()) return 'signed_by_name ausente';
  return null;
}

/** Valida una instancia contra el template + dictionary de locations.
 *  Devuelve warnings que NO invalidan la instancia (out-of-range, list inválida)
 *  + boolean indicando si pasó la validación estructural. */
function validateInstance(
  instance: HistoricalImportInstance,
  templates: Map<string, TemplateContext>,
  locationNames: Set<string>,
): { isValid: boolean; reason?: string; warnings: ImportWarning[] } {
  const warnings: ImportWarning[] = [];

  const metaErr = validateMetadata(instance);
  if (metaErr) return { isValid: false, reason: metaErr, warnings };

  const template = templates.get(instance.template_id_protocolo);
  if (!template) {
    return { isValid: false, reason: `Template "${instance.template_id_protocolo}" no existe en este proyecto`, warnings };
  }

  if (!locationNames.has(instance.location_name.toLowerCase().trim())) {
    return { isValid: false, reason: `Ubicación "${instance.location_name}" no existe`, warnings };
  }

  // Verificar celdas: no permitir __hdr*__ ni __matrix_*__ (son template-only).
  for (const cell of instance.cells) {
    if (/^__hdr\d+__$/i.test(cell.partida_item) || /^__matrix_/i.test(cell.partida_item)) {
      return { isValid: false, reason: `partida_item "${cell.partida_item}" es interno del template, no se puede sobreescribir`, warnings };
    }
  }

  // Validación por celda contra spec
  for (const cell of instance.cells) {
    const expectedColMap = template.expectedCells.get(cell.partida_item);
    if (!expectedColMap) {
      warnings.push({ instance_external_id: instance.external_id, partida_item: cell.partida_item, col: cell.col,
        reason: `partida "${cell.partida_item}" no esperada en el template (puede ser header, matriz o solo fórmulas/lookups)` });
      continue;
    }
    const spec = expectedColMap.get(cell.col.toUpperCase());
    if (!spec) {
      warnings.push({ instance_external_id: instance.external_id, partida_item: cell.partida_item, col: cell.col,
        reason: `celda ${cell.partida_item}.${cell.col} no esperada en el template` });
      continue;
    }

    const value = (cell.value ?? '').trim();

    if (template.isNumeric) {
      if (spec.kind === 'manual' || spec.kind === 'percent') {
        const num = parseNumeric(value);
        if (num == null) {
          warnings.push({ instance_external_id: instance.external_id, partida_item: cell.partida_item, col: cell.col,
            reason: `valor "${value}" no es numérico (esperado para celda ${spec.kind === 'percent' ? 'porcentaje' : 'manual'})` });
          continue;
        }
        if (!inRange(num, spec.range)) {
          warnings.push({ instance_external_id: instance.external_id, partida_item: cell.partida_item, col: cell.col,
            reason: `valor ${num} fuera del rango [${spec.range.min}:${spec.range.max}]` });
        }
      } else if (spec.kind === 'list') {
        const opts = resolveListOptionsForValidation(spec.source, template.matrices);
        // v41 — list de tabla de proyecto: no se valida en el import histórico.
        if (spec.source.type !== 'project-table' && value && !opts.includes(value)) {
          warnings.push({ instance_external_id: instance.external_id, partida_item: cell.partida_item, col: cell.col,
            reason: `valor "${value}" no está en las opciones de la lista` });
        }
      } else if (spec.kind === 'bool') {
        if (value && value !== '1' && value !== '0') {
          warnings.push({ instance_external_id: instance.external_id, partida_item: cell.partida_item, col: cell.col,
            reason: `valor "${value}" no es Sí/No (se espera 1/0, Sí/No)` });
        }
      } else if (spec.kind === 'date') {
        if (value && !isValidDateText(value)) {
          warnings.push({ instance_external_id: instance.external_id, partida_item: cell.partida_item, col: cell.col,
            reason: `valor "${value}" no es una fecha dd/mm/aaaa válida` });
        }
      } else if (spec.kind === 'time') {
        if (value && !isValidTimeText(value)) {
          warnings.push({ instance_external_id: instance.external_id, partida_item: cell.partida_item, col: cell.col,
            reason: `valor "${value}" no es una hora HH:MM válida` });
        }
      }
      // equipment / comment: texto libre — sin validación adicional.
    } else {
      // Clásico: value ∈ {SI, NO, NA, ""}
      const v = value.toUpperCase();
      if (v && !['SI', 'NO', 'NA'].includes(v)) {
        warnings.push({ instance_external_id: instance.external_id, partida_item: cell.partida_item, col: cell.col,
          reason: `valor "${value}" no es SI/NO/NA` });
      }
    }
  }

  // Celdas ausentes: cada entry de expectedCells que no esté en instance.cells
  const filledKeys = new Set(instance.cells.map(c => `${c.partida_item}|${c.col.toUpperCase()}`));
  template.expectedCells.forEach((colMap, partida) => {
    colMap.forEach((_, col) => {
      if (!filledKeys.has(`${partida}|${col}`)) {
        warnings.push({ instance_external_id: instance.external_id, partida_item: partida, col,
          reason: `celda ${partida}.${col} sin valor (queda vacía)` });
      }
    });
  });

  return { isValid: true, warnings };
}

/** Resolve options para validar (mirror de NumericTable.resolveListOptions). */
function resolveListOptionsForValidation(source: Extract<NumericCellSpec, { kind: 'list' }>['source'], matrices: Record<string, MatrixData>): string[] {
  if (source.type === 'inline') return source.values;
  // v41 — Tablas de proyecto no se validan aquí (no hay auxTables en el import histórico).
  if (source.type === 'project-table') return [];
  const m = matrices[source.matrixId];
  if (!m) return [];
  const colIdx = source.col.charCodeAt(0) - 65;
  const colVals = (rows: typeof m.rows) => rows.map(r => r[colIdx] ?? '').filter(v => v !== '');
  if (source.type === 'matrix-col') return colVals(m.rows);
  // Rango 1-based sobre filas ORIGINALES: recortar primero, limpiar vacíos después.
  const from = Math.max(0, source.fromRow - 1);
  const to = Math.min(m.rows.length, source.toRow);
  return colVals(m.rows.slice(from, to));
}

/** Punto de entrada principal del validador.
 *  Recibe instancias parsed + catálogo de templates y locations del proyecto.
 *  Devuelve validInstances + errores estructurales + warnings de celda + users desconocidos. */
export function validateImport(
  instances: HistoricalImportInstance[],
  templates: Map<string, TemplateContext>,
  locationNames: Set<string>,
  existingUserKeys: Set<string>,    // "name|apellido" en lowercase
): ValidationResult {
  const validInstances: HistoricalImportInstance[] = [];
  const errors: ImportError[] = [];
  const warnings: ImportWarning[] = [];
  const unknownUsersMap = new Map<string, UnknownUser>();
  const seenExternalIds = new Set<string>();

  for (let idx = 0; idx < instances.length; idx++) {
    const inst = instances[idx];
    const line = idx + 1;

    // external_id dup intra-archivo
    if (seenExternalIds.has(inst.external_id)) {
      errors.push({ line, instance_external_id: inst.external_id, reason: `external_id "${inst.external_id}" duplicado en el archivo` });
      continue;
    }
    seenExternalIds.add(inst.external_id);

    const { isValid, reason, warnings: instWarnings } = validateInstance(inst, templates, locationNames);
    if (!isValid) {
      errors.push({ line, instance_external_id: inst.external_id, reason: reason! });
      continue;
    }
    warnings.push(...instWarnings);
    validInstances.push(inst);

    // Recolectar users desconocidos
    const filledKey = userKey(inst.filled_by_name, inst.filled_by_apellido);
    if (!existingUserKeys.has(filledKey) && !unknownUsersMap.has(filledKey)) {
      unknownUsersMap.set(filledKey, { name: inst.filled_by_name, apellido: inst.filled_by_apellido });
    }
    const signedKey = userKey(inst.signed_by_name, inst.signed_by_apellido);
    if (!existingUserKeys.has(signedKey) && !unknownUsersMap.has(signedKey)) {
      unknownUsersMap.set(signedKey, { name: inst.signed_by_name, apellido: inst.signed_by_apellido });
    }
  }

  return {
    validInstances,
    errors,
    warnings,
    unknownUsers: Array.from(unknownUsersMap.values()),
  };
}

export function userKey(name: string, apellido?: string): string {
  return `${(name ?? '').trim().toLowerCase()}|${(apellido ?? '').trim().toLowerCase()}`;
}

// ────────────────────────── Ensamble + snapshot ──────────────────────────────

/** Output del ensamble: una fila lista para insertar en protocol_items. */
export interface AssembledProtocolItem {
  /** id del template item original (para copiar campos descriptivos en el caller) */
  templateItemId: string;
  partida_item: string | null;
  item_description: string;
  validation_method: string | null;
  section: string | null;
  comments: string | null;
  is_compliant: boolean;
  is_na: boolean;
  has_answer: boolean;
}

export interface AssembleResult {
  items: AssembledProtocolItem[];
  /** True si todas las filas de datos están completamente respondidas y dentro de rango. */
  fullyValid: boolean;
}

/** Construye las filas `protocol_items` para una instancia histórica.
 *
 *  - Para clásicos: traduce SI/NO/NA → is_compliant/is_na/has_answer.
 *  - Para numéricos:
 *    - Ensambla `cellVals[]` por fila desde instance.cells (per-cell).
 *    - Snapshotea fórmulas/lookups vía resolveScopeCells usando matrices del template.
 *    - Escribe `comments = joinRowComments(cellVals + snapshots)` posicional.
 *  - Headers y matrices se copian del template con `comments=null`.
 */
export function assembleProtocolItems(
  instance: HistoricalImportInstance,
  template: TemplateContext,
): AssembleResult {
  // ── 1. Construir cellVals[] por partida con valores manual/list del usuario.
  // Solo importa para filas tipo 'row' del template.
  const cellValsByPartida = new Map<string, string[]>();
  for (const { item, spec } of template.parsedRows) {
    if (!spec || spec.kind !== 'row') continue;
    const partida = (item.partida_item ?? '').trim();
    const arr: string[] = new Array(spec.cells.length).fill('');
    cellValsByPartida.set(partida, arr);
  }
  for (const cell of instance.cells) {
    const arr = cellValsByPartida.get(cell.partida_item);
    if (!arr) continue; // celdas inexistentes ya marcadas como warnings en validación
    const colIdx = cell.col.toUpperCase().charCodeAt(0) - 65;
    if (colIdx < 0 || colIdx >= arr.length) continue;
    const expectedColMap = template.expectedCells.get(cell.partida_item);
    const spec = expectedColMap?.get(cell.col.toUpperCase());
    if (!spec) continue;   // expectedCells ya filtra a kinds de ENTRADA (v35)
    // `//` es el separador posicional de joinRowComments: un valor que lo
    // contenga rompería el alineamiento de la fila al deserializar — se
    // colapsa (mismo criterio que sanitizeCellText en NumericTable).
    const v = cell.value ?? '';
    arr[colIdx] = v.includes('//') ? v.replace(/\/{2,}/g, '/') : v;
  }

  // ── 2. Snapshot del scope: solo aplicable a numéricos.
  let scope: Record<string, number | null> = {};
  let textValues: Record<string, string> = {};
  let scopeErrors: Record<string, string> = {};
  if (template.isNumeric) {
    const scopeCells: ScopeCell[] = [];
    for (const { item, spec } of template.parsedRows) {
      if (!spec || spec.kind !== 'row') continue;
      const partida = (item.partida_item ?? '').trim();
      const cellVals = cellValsByPartida.get(partida) ?? [];
      for (let i = 0; i < spec.cells.length; i++) {
        const cell = spec.cells[i];
        const key = scopeKeyFor(partida, i);
        // Mismo mapeo de kinds → scope que NumericTable (percent/bool valen
        // como número; date/time/equipment son texto que no entra al cálculo).
        if (cell.kind === 'manual' || cell.kind === 'percent' || cell.kind === 'bool' || cell.kind === 'free') scopeCells.push({ key, kind: 'manual', raw: cellVals[i] ?? '' });
        else if (cell.kind === 'list' || cell.kind === 'date' || cell.kind === 'time' || cell.kind === 'equipment' || cell.kind === 'text') scopeCells.push({ key, kind: 'list', raw: cellVals[i] ?? '' });
        else if (cell.kind === 'val') scopeCells.push({ key, kind: 'manual', raw: cell.literal });
        else if (cell.kind === 'lookup') scopeCells.push({ key, kind: 'lookup', refKey: cell.refKey, matrixId: cell.matrixId, searchCol: cell.searchCol, returnCol: cell.returnCol });
        else if (cell.kind === 'formula') scopeCells.push({ key, kind: 'formula', expr: cell.expr });
      }
    }
    const res = resolveScopeCells(scopeCells, template.matrices);
    scope = res.scope;
    textValues = res.textValues;
    scopeErrors = res.errors;
  }

  // ── 3. Para cada template item, producir su protocol_item row con el comments correcto.
  const items: AssembledProtocolItem[] = [];
  let fullyValid = true;
  for (const { item, spec } of template.parsedRows) {
    const baseRow = {
      templateItemId: item.id,
      partida_item: item.partida_item,
      item_description: item.item_description,
      validation_method: item.validation_method,
      section: item.section,
    };

    // Headers, matrices y graphs → comments=null, sin respuesta del usuario
    if (!spec || spec.kind === 'header' || spec.kind === 'matrix-header' || spec.kind === 'matrix-data' || spec.kind === 'repeat-directive') {
      items.push({ ...baseRow, comments: null, is_compliant: false, is_na: false, has_answer: false });
      continue;
    }
    if (spec.kind === 'graph') {
      items.push({ ...baseRow, comments: null, is_compliant: false, is_na: false, has_answer: true });
      continue;
    }

    // spec.kind === 'row'
    const partida = (item.partida_item ?? '').trim();

    if (!template.isNumeric) {
      // Clásico: tomamos cell A
      const cellVals = cellValsByPartida.get(partida) ?? [''];
      const value = (cellVals[0] ?? '').trim().toUpperCase();
      let is_compliant = false, is_na = false, has_answer = false;
      if (value === 'SI') { is_compliant = true; has_answer = true; }
      else if (value === 'NO') { is_compliant = false; has_answer = true; }
      else if (value === 'NA') { is_na = true; has_answer = true; }
      else {
        fullyValid = false; // sin respuesta
      }
      items.push({ ...baseRow, comments: cellVals[0] ?? null, is_compliant, is_na, has_answer });
      continue;
    }

    // Numérico row: ensamble + snapshot
    const rawCellVals = cellValsByPartida.get(partida) ?? new Array(spec.cells.length).fill('');
    const finalCellVals = [...rawCellVals];

    // Sobreescribir slots de formula/lookup con el snapshot computado
    let allManualListFilled = true;
    let allCellsInRange = true;
    let anyManualOrList = false;
    for (let i = 0; i < spec.cells.length; i++) {
      const cell = spec.cells[i];
      const key = scopeKeyFor(partida, i);

      if (cell.kind === 'formula' || cell.kind === 'lookup') {
        // Snapshot: tomar el valor computado
        if (scopeErrors[key]) {
          finalCellVals[i] = ''; // error en snapshot — slot vacío
          allCellsInRange = false;
        } else if (textValues[key] != null && textValues[key] !== '') {
          finalCellVals[i] = textValues[key];
        } else if (scope[key] != null) {
          finalCellVals[i] = String(scope[key]);
        } else {
          finalCellVals[i] = '';
        }
        // Si la fórmula tiene rango, validar el snapshot
        if (cell.kind === 'formula' && cell.range && scope[key] != null) {
          if (!inRange(scope[key]!, cell.range)) allCellsInRange = false;
        }
      } else if (cell.kind === 'manual' || cell.kind === 'percent') {
        anyManualOrList = true;
        const v = parseNumeric(finalCellVals[i]);
        if (v == null) allManualListFilled = false;
        else if (!inRange(v, cell.range)) allCellsInRange = false;
      } else if (cell.kind === 'list') {
        anyManualOrList = true;
        if (!finalCellVals[i] || finalCellVals[i].trim() === '') allManualListFilled = false;
      } else if (cell.kind === 'bool' || cell.kind === 'date' || cell.kind === 'time'
              || cell.kind === 'equipment' || cell.kind === 'comment' || cell.kind === 'blank'
              || cell.kind === 'val' || cell.kind === 'free' || cell.kind === 'text') {
        // v35 — Tipos auxiliares: persisten el valor pero no bloquean
        // has_answer ni afectan ok/fail (igual criterio que la app).
        // v33 — free/text (ingreso libre) entran aquí: sin validación de rango.
      }
    }

    const comments = joinRowComments(finalCellVals);
    // Si la fila es 100% fórmula/lookup (sin manuales ni lists), está auto-respondida
    // — no requiere input del usuario. Solo se exige que el snapshot exista.
    const has_answer = anyManualOrList ? allManualListFilled : true;
    const is_compliant = has_answer && allCellsInRange;
    if (!has_answer || !is_compliant) fullyValid = false;

    items.push({ ...baseRow, comments, is_compliant, is_na: false, has_answer });
  }

  return { items, fullyValid };
}

