/**
 * topoFormula.ts (web) — Espejo EXACTO de src/utils/topoFormula.ts. Evalúa las
 * columnas 'formula' del módulo topográfico con el motor existente (evalFormula +
 * BUSCAR). Convención: columnas habilitadas → celdas 1A, 1B, 1C… en orden de config.
 */
import { evalFormula, type AuxTables } from '@lib/formulaEval';
import type { TopoColumn } from '@/types';

export interface TopoRowValues {
  coord1?: number | null;
  coord2?: number | null;
  cota?: number | null;
  custom?: Record<string, number | null>;
}

function colCell(index: number): string {
  return `1${String.fromCharCode(65 + Math.min(index, 25))}`;
}

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
    else scope[cell] = null;
  });

  const out: Record<string, number | null> = {};
  for (const c of enabled) {
    if (c.source !== 'formula' || !c.formula || !c.formula.trim()) continue;
    let v: number | null = null;
    try { v = evalFormula(c.formula, scope, undefined, undefined, undefined, { auxTables }); } catch { v = null; }
    out[c.id] = v;
    scope[cellByCol[c.id]] = v;
  }
  return out;
}

export interface TopoFormulaEntry { name: string; formula: string }
export interface ApplyFormulasResult {
  columns: TopoColumn[];
  applied: number;
  created: number;
  warnings: string[];
}

function normName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
function genColId(seed: number): string { return `cf${seed.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`; }

/** Aplica las fórmulas del Excel a las columnas de config (match por NOMBRE).
 *  Espejo EXACTO de src/utils/topoFormula.applyTopoFormulas. */
export function applyTopoFormulas(columns: TopoColumn[], entries: TopoFormulaEntry[]): ApplyFormulasResult {
  const cols = columns.map((c) => ({ ...c }));
  const byName = new Map<string, number>();
  cols.forEach((c, i) => byName.set(normName(c.name), i));
  let applied = 0, created = 0;
  const warnings: string[] = [];
  entries.forEach((e, idx) => {
    const key = normName(e.name);
    const at = byName.get(key);
    if (at != null) {
      const c = cols[at];
      if (c.builtin === 'coord1' || c.builtin === 'coord2' || c.builtin === 'cota') {
        warnings.push(`"${e.name}" es una columna base (coordenada/cota): no admite fórmula — omitida.`);
        return;
      }
      cols[at] = { ...c, source: 'formula', formula: e.formula };
      applied++;
    } else {
      const id = genColId(idx);
      cols.push({ id, name: e.name, source: 'formula', formula: e.formula, enabled: true, show_in_ficha: true });
      byName.set(key, cols.length - 1);
      created++;
    }
  });
  return { columns: cols, applied, created, warnings };
}
