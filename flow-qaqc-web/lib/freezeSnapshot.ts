/**
 * freezeSnapshot (v41, web) — Espejo de src/utils/freezeSnapshot.ts.
 * Al ENVIAR un protocolo, congela los valores COMPUTADOS (fórmula/lookup/BUSCAR) en
 * el `comments` de cada ítem, para que el Audit/PDF muestren lo que vio el usuario y
 * NO se recalcule (histórico inmutable aunque cambie la plantilla).
 */
import { parseNumericRow, extractMatrices, splitRowComments, joinRowComments, scopeKeyFor } from '@lib/numericProtocol';
import { resolveScopeCells, type ScopeCell, type AuxTables, type XrefValues } from '@lib/formulaEval';

interface FreezeItem { id: string; partida_item: string | null; validation_method: string | null; comments: string | null }

/** Devuelve Map<itemId, comments-congelado> con los valores calculados ya escritos.
 *  `xrefValues` resuelve los llamados entre ensayos `@código.celda` (v42). */
export function buildFrozenComments(items: FreezeItem[], auxTables?: AuxTables, xrefValues?: XrefValues): Map<string, string> {
  const out = new Map<string, string>();
  const parsed = items.map(it => ({ item: it, spec: parseNumericRow(it.validation_method) }));
  const { mainRows, matrices } = extractMatrices(parsed);

  const userVals = new Map<string, string[]>();
  const scopeCells: ScopeCell[] = [];
  for (const { item, spec } of mainRows) {
    if (!spec || spec.kind !== 'row') continue;
    const partida = (item.partida_item ?? '').trim();
    const arr = splitRowComments(item.comments, spec.cells.length);
    userVals.set(item.id, arr);
    spec.cells.forEach((c, i) => {
      const key = scopeKeyFor(partida, i);
      if (c.kind === 'manual' || c.kind === 'percent' || c.kind === 'bool' || c.kind === 'free') scopeCells.push({ key, kind: 'manual', raw: arr[i] ?? '' });
      else if (c.kind === 'list' || c.kind === 'date' || c.kind === 'time' || c.kind === 'equipment' || c.kind === 'text') scopeCells.push({ key, kind: 'list', raw: arr[i] ?? '' });
      else if ((c as { kind: string }).kind === 'val') scopeCells.push({ key, kind: 'manual', raw: (c as { literal?: string }).literal ?? '' });
      else if (c.kind === 'lookup') scopeCells.push({ key, kind: 'lookup', refKey: (c as any).refKey, matrixId: (c as any).matrixId, searchCol: (c as any).searchCol, returnCol: (c as any).returnCol });
      else if (c.kind === 'formula') scopeCells.push({ key, kind: 'formula', expr: (c as any).expr });
      else if (c.kind === 'xref') scopeCells.push({ key, kind: 'xref', targetKey: (c as any).targetKey, sourceRef: (c as any).sourceRef, op: (c as any).op, raw: arr[i] ?? '' });   // v45 — para que las fórmulas que usan el valor traído se congelen bien
    });
  }

  let scope: Record<string, number | null> = {}, textValues: Record<string, string> = {};
  try { const r = resolveScopeCells(scopeCells, matrices, xrefValues, auxTables); scope = r.scope; textValues = r.textValues; } catch { /* sin recompute */ }

  for (const { item, spec } of mainRows) {
    if (!spec || spec.kind !== 'row') continue;
    const partida = (item.partida_item ?? '').trim();
    const arr = (userVals.get(item.id) ?? []).slice();
    spec.cells.forEach((c, i) => {
      // v45.2 — congelar calculadas: fórmula/lookup y celdas xref `get` (su slot está
      // vacío → guardamos el valor resuelto para que Audit/PDF lo muestren). Las celdas
      // xref `self`/`select` conservan su CÓDIGO en comments (no se sobreescriben).
      const isComputed = c.kind === 'formula' || c.kind === 'lookup'
        || (c.kind === 'xref' && (c as { mode?: string }).mode === 'get');
      if (!isComputed) return;
      const key = scopeKeyFor(partida, i);
      let v = '';
      if (textValues[key] != null && textValues[key] !== '') v = textValues[key];
      else if (scope[key] != null) v = String(scope[key]);
      arr[i] = v;
    });
    out.set(item.id, joinRowComments(arr));
  }
  return out;
}
