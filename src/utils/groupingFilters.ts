/**
 * groupingFilters (v45.3) — Parser y evaluador PURO del DSL de filtros de los
 * agrupamientos (presets) de protocolos. Sin I/O → testeable en engineTests.
 *
 * DSL (columna "Filtros" de la hoja AGRUPACIONES): cláusulas unidas por `&`.
 *   `material=GP & condicion=INALTERADA & celda:19A>=2.0`
 * Cada cláusula = `<campo> <op> <valor>`.
 *   campo: atributo (`material`, `condicion`, `sector`, `fecha`, `codigo`) o
 *          `celda:<fila><col>` (valor numérico congelado de la celda del ensayo fuente).
 *   op:    `=` `!=` `<` `<=` `>` `>=` `~` (`~` = contiene, texto).
 */
import type { GroupingFilterClause, GroupingCmp } from './featureFlags';

/** Parsea el DSL de filtros → cláusulas. Cláusulas inválidas se descartan. */
export function parseGroupingFilters(dsl: string | null | undefined): GroupingFilterClause[] {
  if (!dsl || !dsl.trim()) return [];
  const out: GroupingFilterClause[] = [];
  for (const part of dsl.split('&').map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^([A-Za-z_][\w:]*)\s*(<=|>=|!=|~|=|<|>)\s*(.+)$/);
    if (!m) continue;
    out.push({ field: m[1].trim().toLowerCase(), op: m[2] as GroupingCmp, value: m[3].trim() });
  }
  return out;
}

/** Parsea la columna "Excluir": códigos separados por coma o espacio. */
export function parseExcludeCodes(s: string | null | undefined): string[] {
  if (!s || !s.trim()) return [];
  return s.split(/[,;\s]+/).map(c => c.trim()).filter(Boolean);
}

/** ¿El valor `actual` (atributo o celda) cumple la cláusula? `actual` null → no cumple. */
export function clauseMatches(clause: GroupingFilterClause, actual: string | number | null | undefined): boolean {
  if (actual == null || actual === '') return false;
  const expected = clause.value;
  if (clause.op === '~') {
    return String(actual).toLowerCase().includes(expected.toLowerCase());
  }
  // Fechas ISO 'YYYY-MM-DD': comparación LEXICOGRÁFICA (ordena cronológicamente) para
  // que `fecha>=2026-01-01` y similares funcionen (Number() de una fecha da NaN).
  const aStr = String(actual);
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  if (ISO.test(aStr) && ISO.test(expected)) {
    switch (clause.op) {
      case '=':  return aStr === expected;
      case '!=': return aStr !== expected;
      case '<':  return aStr < expected;
      case '<=': return aStr <= expected;
      case '>':  return aStr > expected;
      case '>=': return aStr >= expected;
      default:   return false;
    }
  }
  const an = typeof actual === 'number' ? actual : Number(String(actual).replace(',', '.'));
  const en = Number(expected.replace(',', '.'));
  const bothNum = isFinite(an) && isFinite(en);
  // Para `=`/`!=`, comparar como número SOLO en celdas (valores numéricos). En campos
  // identificadores (codigo/material/sector/condicion) usar texto, para no equiparar
  // '007' con '7' ni un material llamado '2' con el número 2.
  const numEq = bothNum && clause.field.startsWith('celda:');
  switch (clause.op) {
    case '=':  return numEq ? Math.abs(an - en) < 1e-9 : String(actual).toLowerCase() === expected.toLowerCase();
    case '!=': return numEq ? Math.abs(an - en) >= 1e-9 : String(actual).toLowerCase() !== expected.toLowerCase();
    case '<':  return bothNum && an < en;
    case '<=': return bothNum && an <= en;
    case '>':  return bothNum && an > en;
    case '>=': return bothNum && an >= en;
    default:   return false;
  }
}

/** Indica si una cláusula apunta a un VALOR DE CELDA del ensayo fuente (`celda:19A`). */
export function clauseCellKey(clause: GroupingFilterClause): string | null {
  if (!clause.field.startsWith('celda:')) return null;
  const m = clause.field.slice(6).match(/^(\d+)([a-z])?$/i);
  if (!m) return null;
  return `${parseInt(m[1], 10)}${(m[2] ?? 'a').toUpperCase()}`;
}
