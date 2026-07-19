// Conformidad de un protocolo = cumple TODAS las restricciones (clásico: todos
// los ítems respondidos Sí o N/A, ningún "No"; numérico: cada celda dentro de
// rango / con valor válido). Si NO es conforme, la aprobación exige observación.
//
// Esta función se EXTRAJO de ProtocolAuditScreen (la IIFE `isConforming`) para
// reusarla tal cual en el Dossier — así el botón "Aprobar con observación" y el
// motivo obligatorio se comportan idénticos en ambas pantallas (el usuario pidió
// paridad exacta). Mantener AMBOS usos en sync si se toca esta lógica.
import {
  isNumericProtocol, parseNumericRow, inRange,
  splitRowComments, scopeKeyFor, extractMatrices, isValidDateText, isValidTimeText,
} from '@utils/numericProtocol';
import { resolveScopeCells, extractRefs, type ScopeCell, type AuxTables } from '@utils/formulaEval';

/** Estructura mínima de ítem que necesita el cálculo (acepta modelos WMDB). */
export interface ConformanceItem {
  validationMethod?: string | null;
  partidaItem?: string | null;
  comments?: string | null;
  isCompliant?: boolean;
  isNa?: boolean;
  hasAnswer?: boolean;
}

/**
 * Devuelve `true` si el protocolo es CONFORME (puede aprobarse sin observación).
 * `false` → la aprobación debe exigir un motivo (aprobar con observación).
 * Réplica fiel de la lógica de ProtocolAuditScreen (v33+).
 */
export function isProtocolConforming(items: ConformanceItem[], auxTables: AuxTables = {}): boolean {
  if (items.length === 0) return false;

  const numericMode = isNumericProtocol(items.map(it => ({ validation_method: it.validationMethod ?? null })));

  if (!numericMode) {
    // Clásico: TODOS los ítems respondidos y cada uno Sí o N/A (ningún "No").
    return items.every((i) => i.hasAnswer && (i.isCompliant || i.isNa === true));
  }

  // Modo numérico: construir scope live con matrices y validar cada celda.
  // v98e — orden determinista por partida (extractMatrices es posicional).
  const parsedRows = [...items]
    .sort((a, b) => String(a.partidaItem ?? '').localeCompare(String(b.partidaItem ?? ''), undefined, { numeric: true, sensitivity: 'base' }))
    .map(it => ({
      item: it,
      spec: parseNumericRow(it.validationMethod ?? null),
    }));
  const { mainRows, matrices } = extractMatrices(parsedRows);
  const scopeCells: ScopeCell[] = [];
  for (const { item, spec } of mainRows) {
    if (spec?.kind !== 'row') continue;
    const partida = item.partidaItem ?? '';
    const cellVals = splitRowComments(item.comments ?? null, spec.cells.length);
    for (let i = 0; i < spec.cells.length; i++) {
      const cell = spec.cells[i];
      const key = scopeKeyFor(partida, i);
      if (cell.kind === 'manual' || cell.kind === 'percent' || cell.kind === 'bool' || cell.kind === 'free') scopeCells.push({ key, kind: 'manual', raw: cellVals[i] ?? '' });
      else if (cell.kind === 'list' || cell.kind === 'date' || cell.kind === 'time' || cell.kind === 'equipment' || cell.kind === 'text') scopeCells.push({ key, kind: 'list', raw: cellVals[i] ?? '' });
      else if (cell.kind === 'lookup') scopeCells.push({ key, kind: 'lookup', refKey: cell.refKey, matrixId: cell.matrixId, searchCol: cell.searchCol, returnCol: cell.returnCol });
      else if (cell.kind === 'formula' && cell.expr?.includes('@')) scopeCells.push({ key, kind: 'manual', raw: cellVals[i] ?? '' });
      else if (cell.kind === 'formula') scopeCells.push({ key, kind: 'formula', expr: cell.expr });
      else if (cell.kind === 'val') scopeCells.push({ key, kind: 'manual', raw: cell.literal });
      // v98b — Las celdas XREF entran al scope con su valor CONGELADO (comments):
      // las `get` hornearon el número heredado al enviar (p.ej. DMS del Proctor) y
      // las fórmulas que las referencian (#3A) lo necesitan. Sin esta rama, TODA
      // ficha con referencias salía "no conforme" (fórmulas → null) y el Dossier
      // exigía "Aprobar con observación" sin haber ningún error real.
      else if (cell.kind === 'xref') scopeCells.push({ key, kind: 'manual', raw: cellVals[i] ?? '' });
    }
  }

  let scope: Record<string, number | null> = {};
  let errors: Record<string, string> = {};
  let textValues: Record<string, string> = {};
  try { const r = resolveScopeCells(scopeCells, matrices, undefined, auxTables); scope = r.scope; errors = r.errors; textValues = r.textValues; }
  catch { /* scope vacío */ }

  for (const { item, spec } of mainRows) {
    if (!spec) {
      if ((item.validationMethod ?? '').trim() !== '') return false;
      continue;
    }
    if (spec.kind !== 'row') continue;
    const partida = item.partidaItem ?? '';
    for (let i = 0; i < spec.cells.length; i++) {
      const cell = spec.cells[i];
      const key = scopeKeyFor(partida, i);
      if (cell.hidden) continue;
      if (errors[key]) return false;
      const v = scope[key];
      if (cell.kind === 'manual' || cell.kind === 'percent') {
        if (v == null) return false;
        if (!inRange(v, cell.range)) return false;
      } else if (cell.kind === 'list' || cell.kind === 'bool' || cell.kind === 'equipment') {
        if (!textValues[key]) return false;
      } else if (cell.kind === 'date' || cell.kind === 'time') {
        const txt = textValues[key];
        if (!txt) return false;
        if (!(cell.kind === 'date' ? isValidDateText(txt) : isValidTimeText(txt))) return false;
      } else if (cell.kind === 'lookup') {
        if (!textValues[key] && v == null) return false;
      } else if (cell.kind === 'formula') {
        if (v == null) return false;
        try {
          const deps = extractRefs(cell.expr);
          // v98f — una dependencia también está "llena" si es TEXTO (celdas list,
          // p.ej. BUSCAR(tabla, #2A, col) con #2A = "Base Granular"): esas viven
          // en textValues, no en el scope numérico. Exigir solo scope numérico
          // marcaba "no conforme" FALSO a toda ficha con BUSCAR sobre una lista
          // (GRA/DCC/CBR) aunque la fórmula resolviera perfectamente.
          if (!deps.every(d => scope[d] != null || (textValues[d] != null && textValues[d] !== ''))) return false;
        } catch { return false; }
        if (cell.range && !inRange(v, cell.range)) return false;
      }
    }
  }
  return true;
}
