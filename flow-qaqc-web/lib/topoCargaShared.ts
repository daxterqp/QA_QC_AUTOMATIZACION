/**
 * topoCargaShared.ts (web) — Aplicar / revertir una carga topográfica directamente
 * contra Supabase (la web no usa WatermelonDB). Escribe la capa `topo_*` en los
 * protocolos enlazados por CÓDIGO (binding diferido). Espejo conceptual de
 * src/services/TopoCargaService.ts.
 *
 * IMPORTANTE: cada escritura a protocols bumpea `updated_at` para que el pull del
 * móvil (fresh-override por updated_at) reconozca el cambio y lo baje.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { bindCargaToProtocols, normalizeCode, type TopoRow } from '@lib/topoBinding';

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

interface ProtoCodeRow { id: string; protocol_code?: string | null; external_id?: string | null }

/** Map<códigoNormalizado, protocolId> indexando protocol_code y external_id. */
export function buildProtocolCodeMapWeb(protocols: ProtoCodeRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of protocols) {
    for (const cand of [p.protocol_code, p.external_id]) {
      const k = normalizeCode(cand ?? null);
      if (k && !map.has(k)) map.set(k, p.id);
    }
  }
  return map;
}

export interface ApplyResult { touchedIds: string[]; pending: string[] }

/** Aplica las filas de una carga a los protocolos del proyecto (escribe topo_*). */
export async function applyCargaWeb(
  supabase: SupabaseClient,
  projectId: string,
  cargaId: string,
  rows: TopoRow[],
): Promise<ApplyResult> {
  const { data: protos } = await supabase
    .from('protocols').select('id, protocol_code, external_id').eq('project_id', projectId);
  const codeMap = buildProtocolCodeMapWeb((protos ?? []) as ProtoCodeRow[]);
  const { applied, pending } = bindCargaToProtocols(rows, codeMap);
  const now = Date.now();
  const touchedIds: string[] = [];
  for (const b of applied) {
    const custom = b.row.custom && Object.keys(b.row.custom).length > 0 ? b.row.custom : null;
    const { error } = await supabase.from('protocols').update({
      topo_source_carga_id: cargaId,
      topo_coord_east: toNum(b.row.c1),
      topo_coord_north: toNum(b.row.c2),
      topo_coord_elevation: toNum(b.row.cota),
      topo_values_json: custom,
      topo_updated_at: now,
      updated_at: now,
    }).eq('id', b.protocolId);
    if (!error) touchedIds.push(b.protocolId);
  }
  return { touchedIds, pending };
}

/** Revierte (null) las columnas topo_* de los protocolos cuyo dueño es `cargaId`.
 *  Devuelve los ids afectados. */
export async function revertCargaWeb(
  supabase: SupabaseClient,
  projectId: string,
  cargaId: string,
): Promise<string[]> {
  const { data: owned } = await supabase
    .from('protocols').select('id').eq('project_id', projectId).eq('topo_source_carga_id', cargaId);
  const ids = ((owned ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return [];
  const now = Date.now();
  await supabase.from('protocols').update({
    topo_source_carga_id: null,
    topo_coord_system: null,
    topo_coord_east: null,
    topo_coord_north: null,
    topo_coord_elevation: null,
    topo_latitude: null,
    topo_longitude: null,
    topo_sector_id: null,
    topo_values_json: null,
    topo_updated_at: now,
    updated_at: now,
  }).eq('project_id', projectId).eq('topo_source_carga_id', cargaId);
  return ids;
}
