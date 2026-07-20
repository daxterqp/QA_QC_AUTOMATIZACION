/**
 * protocolConformance (web) — ESPEJO de src/utils/protocolConformance.ts (móvil).
 * Conformidad de un protocolo = cumple TODAS las restricciones. Si NO es
 * conforme, la aprobación exige observación (motivo obligatorio).
 * Mantener AMBAS copias en sync (v98b xref, v98e orden, v98f deps-texto,
 * v99 mainRows + fórmulas-@ congeladas).
 * Usada por el Dossier web (aprobación inline); el audit web mantiene su
 * réplica inline con la misma semántica.
 */
import {
  isNumericProtocol, parseNumericRow, inRange,
  splitRowComments, scopeKeyFor, extractMatrices, isValidDateText, isValidTimeText,
} from './numericProtocol';
import { resolveScopeCells, extractRefs, type ScopeCell, type AuxTables } from './formulaEval';
import { createClient } from './supabase/client';

const supabase = createClient();

export interface ConformanceItemWeb {
  validation_method?: string | null;
  partida_item?: string | null;
  comments?: string | null;
  is_compliant?: boolean;
  is_na?: boolean;
  has_answer?: boolean;
}

export function isProtocolConformingWeb(items: ConformanceItemWeb[], auxTables: AuxTables = {}): boolean {
  if (items.length === 0) return false;

  const numericMode = isNumericProtocol(items.map(it => ({ validation_method: it.validation_method ?? null })));

  if (!numericMode) {
    return items.every((i) => i.has_answer && (i.is_compliant || i.is_na === true));
  }

  // v98e — orden determinista por partida (extractMatrices es posicional).
  const parsedRows = [...items]
    .sort((a, b) => String(a.partida_item ?? '').localeCompare(String(b.partida_item ?? ''), undefined, { numeric: true, sensitivity: 'base' }))
    .map(it => ({ item: it, spec: parseNumericRow(it.validation_method ?? null) }));
  const { mainRows, matrices } = extractMatrices(parsedRows);
  const scopeCells: ScopeCell[] = [];
  for (const { item, spec } of mainRows) {
    if (spec?.kind !== 'row') continue;
    const partida = item.partida_item ?? '';
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
      if ((item.validation_method ?? '').trim() !== '') return false;
      continue;
    }
    if (spec.kind !== 'row') continue;
    const partida = item.partida_item ?? '';
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
      } else if (cell.kind === 'formula' && !cell.expr?.includes('@')) {
        if (v == null) return false;
        try {
          const deps = extractRefs(cell.expr);
          if (!deps.every(d => scope[d] != null || (textValues[d] != null && textValues[d] !== ''))) return false;
        } catch { return false; }
        if (cell.range && !inRange(v, cell.range)) return false;
      }
    }
  }
  return true;
}

/** Conformidad + equipos, resuelta desde la NUBE (para la tarjeta del Dossier):
 *  trae items + tablas auxiliares y evalúa. `equipmentBlocked` = hay equipos
 *  asociados vencidos/inactivos (el audit bloquea la firma en ese caso). */
export async function checkProtocolApprovalGates(protocolId: string, projectId: string): Promise<{ conforming: boolean; equipmentBlocked: boolean }> {
  const [{ data: items }, { data: tbls }, { data: eqLinks }] = await Promise.all([
    supabase.from('protocol_items').select('partida_item, validation_method, comments, is_compliant, is_na, has_answer').eq('protocol_id', protocolId),
    supabase.from('lab_aux_tables').select('group_key, columns_json, rows_json').eq('project_id', projectId),
    supabase.from('protocol_equipment').select('equipment:equipment_id(status, next_calibration_at)').eq('protocol_id', protocolId),
  ]);
  const aux: AuxTables = {};
  for (const t of (tbls ?? []) as { group_key: string; columns_json: unknown; rows_json: unknown }[]) {
    try {
      aux[String(t.group_key).toLowerCase()] = {
        columns: (typeof t.columns_json === 'string' ? JSON.parse(t.columns_json) : t.columns_json) as string[],
        rows: (typeof t.rows_json === 'string' ? JSON.parse(t.rows_json) : t.rows_json) as string[][],
      };
    } catch { /* tabla corrupta → se omite */ }
  }
  const now = Date.now();
  const equipmentBlocked = ((eqLinks ?? []) as { equipment: { status?: string | null; next_calibration_at?: number | null } | null }[])
    .some(l => l.equipment && (l.equipment.status !== 'active' || (l.equipment.next_calibration_at != null && l.equipment.next_calibration_at < now)));
  return { conforming: isProtocolConformingWeb((items ?? []) as ConformanceItemWeb[], aux), equipmentBlocked };
}
