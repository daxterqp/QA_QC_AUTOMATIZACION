/**
 * topoFormula.ts — Evaluación de columnas de tipo 'formula' del módulo topográfico,
 * reutilizando el motor de fórmulas existente (evalFormula + BUSCAR).
 *
 * Convención de referencias: las columnas HABILITADAS se mapean, en el orden de la
 * config, a las celdas `1A, 1B, 1C, …`. Así una fórmula puede referenciar otra columna
 * con `#1A` (coordenada 1), `#1B` (coordenada 2), etc., y usar `BUSCAR(tabla, valor,
 * "Columna")` sobre las tablas auxiliares (lab_aux_tables). Las fórmulas se evalúan en
 * orden, de modo que una columna fórmula puede referenciar a otra anterior.
 */
import { evalFormula, type AuxTables } from '@utils/formulaEval';
import type { TopoColumn } from '@utils/featureFlags';

export interface TopoRowValues {
  coord1?: number | null;
  coord2?: number | null;
  cota?: number | null;
  /** Valores de columnas custom MANUALES, por id de columna. */
  custom?: Record<string, number | null>;
}

function colCell(index: number): string {
  // Soporta hasta 26 columnas (A..Z); suficiente para el módulo.
  return `1${String.fromCharCode(65 + Math.min(index, 25))}`;
}

/** Devuelve los valores calculados de las columnas 'formula' habilitadas: { colId: número|null }. */
export function computeTopoFormulaValues(
  columns: TopoColumn[],
  rowValues: TopoRowValues,
  auxTables: AuxTables,
): Record<string, number | null> {
  const enabled = columns.filter((c) => c.enabled);
  const scope: Record<string, number | null> = {};
  const cellByCol: Record<string, string> = {};
  enabled.forEach((c, i) => {
    const cell = colCell(i);
    cellByCol[c.id] = cell;
    if (c.builtin === 'coord1') scope[cell] = rowValues.coord1 ?? null;
    else if (c.builtin === 'coord2') scope[cell] = rowValues.coord2 ?? null;
    else if (c.builtin === 'cota') scope[cell] = rowValues.cota ?? null;
    else if (c.source === 'manual') scope[cell] = rowValues.custom?.[c.id] ?? null;
    else scope[cell] = null; // formula/area se resuelven abajo
  });

  const out: Record<string, number | null> = {};
  for (const c of enabled) {
    if (c.source !== 'formula' || !c.formula || !c.formula.trim()) continue;
    let v: number | null = null;
    try { v = evalFormula(c.formula, scope, undefined, undefined, undefined, { auxTables }); } catch { v = null; }
    out[c.id] = v;
    scope[cellByCol[c.id]] = v; // disponible para fórmulas posteriores
  }
  return out;
}
