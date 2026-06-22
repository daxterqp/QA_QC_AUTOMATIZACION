/**
 * summaryRow.ts (web) — Escritura PROGRESIVA de las "Tablas Resumen" (Fase 1b).
 * Espejo de src/services/SummaryRowService.ts. Al enviar un ensayo desde la web,
 * hace upsert de UNA fila en `protocol_summary_rows` (Supabase).
 */
import { createClient } from '@lib/supabase/client';
import { parseNumericRow, extractMatrices, splitRowComments, colLetter, scopeKeyFor } from '@lib/numericProtocol';
import { resolveScopeCells, type ScopeCell, type XrefValues } from '@lib/formulaEval';
import { fetchXrefValues } from '@hooks/useXrefs';

const supabase = createClient();

/** Versión del esquema de values_json. Subir cuando cambie la extracción → el
 *  backfill re-construye las filas viejas (responsables, estado, calculados…). */
export const SUMMARY_ROW_VERSION = 3;

type ItemLite = { partida_item: string | null; id: string; validation_method: string | null; comments: string | null };

/** Extrae TODOS los valores de la ficha: ingresados (manual/lista) Y calculados
 *  (fórmula/lookup), recomputando el scope. Antes solo guardaba los ingresados,
 *  por lo que las columnas calculadas no aparecían/ploteaban. */
function extractValues(items: ItemLite[], auxTables?: import('@lib/formulaEval').AuxTables, xrefValues?: XrefValues): Record<string, string> {
  const parsed = items.map(it => ({ item: it, spec: parseNumericRow(it.validation_method) }));
  const { mainRows, matrices } = extractMatrices(parsed);
  // Keyear por item.id (NO por partida): dos filas con el mismo partida_item no
  // deben pisarse las celdas entre sí (igual que buildFrozenComments).
  const commentsByItem = new Map<string, string[]>();
  const scopeCells: ScopeCell[] = [];

  for (const { item, spec } of mainRows) {
    if (!spec || spec.kind !== 'row') continue;
    const partida = (item.partida_item ?? '').trim();
    const arr = splitRowComments(item.comments, spec.cells.length);
    commentsByItem.set(item.id, arr);
    spec.cells.forEach((c, i) => {
      const key = scopeKeyFor(partida, i);
      if (c.kind === 'manual' || c.kind === 'percent' || c.kind === 'bool' || c.kind === 'free') scopeCells.push({ key, kind: 'manual', raw: arr[i] ?? '' });
      else if (c.kind === 'list' || c.kind === 'date' || c.kind === 'time' || c.kind === 'equipment' || c.kind === 'text') scopeCells.push({ key, kind: 'list', raw: arr[i] ?? '' });
      else if (c.kind === 'val') scopeCells.push({ key, kind: 'manual', raw: (c as { literal?: string }).literal ?? '' });
      else if (c.kind === 'lookup') scopeCells.push({ key, kind: 'lookup', refKey: (c as any).refKey, matrixId: (c as any).matrixId, searchCol: (c as any).searchCol, returnCol: (c as any).returnCol });
      else if (c.kind === 'formula') scopeCells.push({ key, kind: 'formula', expr: (c as any).expr });
    });
  }

  let scope: Record<string, number | null> = {}, textValues: Record<string, string> = {};
  try { const r = resolveScopeCells(scopeCells, matrices, xrefValues, auxTables); scope = r.scope; textValues = r.textValues; } catch { /* sin recompute */ }

  const values: Record<string, string> = {};
  for (const { item, spec } of mainRows) {
    if (!spec || spec.kind !== 'row') continue;
    const partidaRaw = (item.partida_item ?? '').trim();
    const partida = partidaRaw || item.id;
    const arr = commentsByItem.get(item.id) ?? [];
    spec.cells.forEach((c, i) => {
      if ((c as { hidden?: boolean }).hidden || (c as { noReport?: boolean }).noReport || c.kind === 'blank') return;
      const skey = scopeKeyFor(partidaRaw, i);
      let v = arr[i] ?? '';
      if (v === '' && (c.kind === 'formula' || c.kind === 'lookup')) {
        if (textValues[skey]) v = textValues[skey];
        else if (scope[skey] != null) v = String(scope[skey]);
      }
      if (v !== '') values[`${partida}:${colLetter(i)}`] = v;
    });
  }
  return values;
}

/** Crea/actualiza la fila resumen del protocolo en Supabase. Best-effort.
 *  `sharedXref`: resolución de xrefs reusada del congelado (consistencia); si no
 *  se pasa, se resuelve aquí. */
export async function upsertSummaryRowWeb(protocolId: string, sharedXref?: XrefValues): Promise<void> {
  try {
    const { data: protocol } = await supabase
      .from('protocols')
      .select('id, project_id, template_id, protocol_code, protocol_number, ensayo_date, sector_id, location_id, status, filled_by_id, signed_by_id, signed_at')
      .eq('id', protocolId).single();
    if (!protocol) return;
    const p = protocol as Record<string, any>;

    const [{ data: items }, { data: project }, sectorRes, locRes, filledRes, signedRes] = await Promise.all([
      supabase.from('protocol_items').select('id, partida_item, validation_method, comments').eq('protocol_id', protocolId),
      supabase.from('projects').select('name').eq('id', p.project_id).single(),
      p.sector_id ? supabase.from('project_sectors').select('name').eq('id', p.sector_id).single() : Promise.resolve({ data: null }),
      p.location_id ? supabase.from('locations').select('name').eq('id', p.location_id).single() : Promise.resolve({ data: null }),
      p.filled_by_id ? supabase.from('users').select('name, apellido').eq('id', p.filled_by_id).single() : Promise.resolve({ data: null }),
      p.signed_by_id ? supabase.from('users').select('name, apellido').eq('id', p.signed_by_id).single() : Promise.resolve({ data: null }),
    ]);

    const sectorName = (sectorRes.data as { name?: string } | null)?.name ?? null;
    const locationName = (locRes.data as { name?: string } | null)?.name ?? null;
    const projectName = (project as { name?: string } | null)?.name ?? null;
    const fullName = (u: { name?: string; apellido?: string | null } | null) => u ? [u.name, u.apellido].filter(Boolean).join(' ').trim() || null : null;
    const realizadoPor = fullName(filledRes.data as any);
    const aprobadoPor = fullName(signedRes.data as any);

    // v41 — Tablas auxiliares del proyecto para que BUSCAR() recompute en el resumen.
    const auxTables: import('@lib/formulaEval').AuxTables = {};
    try {
      const { data: tbls } = await supabase
        .from('lab_aux_tables').select('group_key, columns_json, rows_json').eq('project_id', p.project_id);
      for (const t of (tbls ?? []) as { group_key: string; columns_json: unknown; rows_json: unknown }[]) {
        auxTables[String(t.group_key).toLowerCase()] = {
          columns: Array.isArray(t.columns_json) ? (t.columns_json as string[]) : [],
          rows: Array.isArray(t.rows_json) ? (t.rows_json as string[][]) : [],
        };
      }
    } catch { /* sin tablas → BUSCAR vacío en resumen */ }
    // v42 — Resolver llamados entre ensayos `@código.celda` (degrada solo; nunca lanza).
    // Reutiliza la resolución del congelado si se proveyó (consistencia).
    let xrefValues: XrefValues = sharedXref ?? {};
    if (!sharedXref) {
      try { xrefValues = await fetchXrefValues(p.project_id, (items ?? []) as any[]); } catch { /* sin xrefs */ }
    }
    const values = extractValues((items ?? []) as any[], auxTables, xrefValues);
    const enriched = {
      ...values,
      project_name: projectName, sector_name: sectorName, location_name: locationName,
      protocol_code: p.protocol_code ?? null, ensayo_date: p.ensayo_date ?? null,
      realizado_por: realizadoPor, aprobado_por: aprobadoPor,
      estado: p.status ?? null,
      fecha_aprobacion: p.signed_at ? new Date(p.signed_at).toLocaleDateString('es-PE') : null,
      _sv: SUMMARY_ROW_VERSION,
    };

    const { error } = await supabase.from('protocol_summary_rows').upsert({
      project_id: p.project_id,
      template_id: p.template_id ?? null,
      protocol_id: protocolId,
      protocol_code: p.protocol_code ?? null,
      protocol_number: p.protocol_number ?? null,
      ensayo_date: p.ensayo_date ?? null,
      sector_id: p.sector_id ?? null,
      sector_name: sectorName,
      location_id: p.location_id ?? null,
      location_name: locationName,
      status: p.status ?? null,
      values_json: enriched,
      updated_at: Date.now(),
    }, { onConflict: 'protocol_id' });
    if (error) console.warn('[summary] upsert web falló (¿corriste v38?):', error.message);
  } catch (e) {
    console.warn('[summary] upsertSummaryRowWeb falló:', e);
  }
}
