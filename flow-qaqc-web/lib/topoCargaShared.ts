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
import { mergeFeatureFlags, topoColumns, type TopoColumn } from '@/types';
import {
  topoCoordsToLatLng, utmFrameFromSectors, findSectorByPointWithTolerance,
  type LatLng, type CoordinateSystem,
} from '@lib/coordinateTopo';
import { computeTopoFormulaValues } from '@lib/topoFormula';
import type { AuxTables } from '@lib/formulaEval';

/** Valida y parsea points_json (jsonb) → LatLng[] | null. Espejo del getter
 *  ProjectSector.points del móvil: descarta polígonos con vértices NaN/malformados
 *  (evita que pointInPolygon/llToLocalMeters produzcan resultados distintos por
 *  plataforma). */
function parseSectorPoints(json: unknown): LatLng[] | null {
  if (!Array.isArray(json)) return null;
  const ok = (json as any[]).every((p) =>
    p && typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  return ok && json.length > 0 ? (json as LatLng[]) : null;
}

interface ProcessingCtxWeb {
  processing: boolean;
  coordSystem: CoordinateSystem;
  sectors: { id: string; name: string; points: LatLng[] | null }[];
  frame: { zone: number; hemisphere: 'N' | 'S' } | null;
  sectorEnabled: boolean;
  sectorTolerance: number;
  columns: TopoColumn[];
  auxTables: AuxTables;
}

/** Contexto del motor web: flags (coord_system) + sectores + zona UTM + columnas
 *  config + tablas auxiliares (para fórmulas/BUSCAR). El procesamiento SIEMPRE está
 *  activo: si no hay columnas fórmula/área ni sectores, simplemente no calcula nada. */
async function loadProcessingCtxWeb(supabase: SupabaseClient, projectId: string): Promise<ProcessingCtxWeb> {
  const { data: proj } = await supabase.from('projects').select('feature_flags').eq('id', projectId).single();
  const flags = mergeFeatureFlags(((proj as { feature_flags?: unknown } | null)?.feature_flags ?? null) as any);
  const cols = topoColumns(flags);
  const { data: secs } = await supabase.from('project_sectors').select('id, name, points_json').eq('project_id', projectId);
  const sectors = ((secs ?? []) as { id: string; name: string; points_json: unknown }[]).map((s) => ({
    id: s.id, name: s.name, points: parseSectorPoints(s.points_json),
  }));
  const sectorCol = cols.find((c) => c.builtin === 'sector' && c.enabled);
  // Tablas auxiliares del proyecto (para BUSCAR en las fórmulas).
  const { data: auxRows } = await supabase
    .from('lab_aux_tables').select('group_key, columns_json, rows_json').eq('project_id', projectId);
  const auxTables: AuxTables = {};
  for (const t of ((auxRows ?? []) as { group_key: string; columns_json: unknown; rows_json: unknown }[])) {
    const columns = Array.isArray(t.columns_json) ? (t.columns_json as string[])
      : (() => { try { return JSON.parse(String(t.columns_json || '[]')); } catch { return []; } })();
    const rows = Array.isArray(t.rows_json) ? (t.rows_json as string[][])
      : (() => { try { return JSON.parse(String(t.rows_json || '[]')); } catch { return []; } })();
    auxTables[t.group_key] = { columns, rows };
  }
  return {
    processing: true,
    coordSystem: flags.coordinate_system,
    sectors,
    frame: utmFrameFromSectors(sectors),
    sectorEnabled: !!sectorCol,
    sectorTolerance: sectorCol?.tolerance_m ?? 0,
    columns: cols,
    auxTables,
  };
}

/** Mezcla los valores manuales (custom) con las columnas 'formula' calculadas
 *  (BUSCAR sobre tablas auxiliares). Devuelve el objeto `{colId: valor}` o null. */
function mergeTopoValuesWeb(row: TopoRow, columns: TopoColumn[], auxTables: AuxTables): Record<string, unknown> | null {
  const manual: Record<string, number | string | null> = { ...(row.custom ?? {}) };
  const customNum: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(manual)) customNum[k] = toNum(v);
  const formula = computeTopoFormulaValues(
    columns,
    { coord1: toNum(row.c1), coord2: toNum(row.c2), cota: toNum(row.cota), custom: customNum },
    auxTables,
  );
  const merged: Record<string, number | string | null> = { ...manual, ...formula };
  return Object.keys(merged).length > 0 ? merged : null;
}

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
  const ctx = await loadProcessingCtxWeb(supabase, projectId);
  const now = Date.now();
  const touchedIds: string[] = [];
  for (const b of applied) {
    let values: Record<string, unknown> | null =
      b.row.custom && Object.keys(b.row.custom).length > 0 ? b.row.custom : null;
    const east = toNum(b.row.c1), north = toNum(b.row.c2);
    // Motor: lat/lng + sector (polígono con tolerancia) cuando el procesamiento está ON.
    let lat: number | null = null, lng: number | null = null, sectorId: string | null = null;
    if (ctx.processing) {
      if (east != null && north != null) {
        const ll = topoCoordsToLatLng(east, north, ctx.coordSystem, ctx.frame);
        if (ll) {
          lat = ll.lat; lng = ll.lng;
          if (ctx.sectorEnabled && ctx.sectors.length > 0) {
            sectorId = findSectorByPointWithTolerance(ll, ctx.sectors, ctx.sectorTolerance)?.id ?? null;
          }
        }
      }
      // Columnas 'formula' (BUSCAR sobre tablas auxiliares) → se mezclan con las manuales.
      values = mergeTopoValuesWeb(b.row, ctx.columns, ctx.auxTables);
    }
    const { error } = await supabase.from('protocols').update({
      topo_source_carga_id: cargaId,
      topo_coord_east: east,
      topo_coord_north: north,
      topo_coord_elevation: toNum(b.row.cota),
      topo_values_json: values,
      topo_latitude: lat,
      topo_longitude: lng,
      topo_sector_id: sectorId,
      topo_coord_system: ctx.coordSystem,
      topo_updated_at: now,
      updated_at: now,
    }).eq('id', b.protocolId);
    if (!error) touchedIds.push(b.protocolId);
  }
  return { touchedIds, pending };
}

/** Re-aplica TODAS las cargas del proyecto (created_at asc): la más nueva gana en
 *  solapamientos de código, y un ensayo que una carga dejó de referenciar vuelve a su
 *  dueño previo. Se usa tras editar/borrar una carga (restaura al dueño anterior) y
 *  para enlazar ensayos nuevos a cargas con códigos pendientes. */
export async function rebindProjectCargasWeb(supabase: SupabaseClient, projectId: string): Promise<void> {
  const { data: cargas } = await supabase
    .from('topo_cargas').select('id, rows_json, created_at').eq('project_id', projectId)
    .order('created_at', { ascending: true });
  for (const c of ((cargas ?? []) as { id: string; rows_json: unknown }[])) {
    const rows = Array.isArray(c.rows_json) ? (c.rows_json as TopoRow[]) : [];
    await applyCargaWeb(supabase, projectId, c.id, rows);
  }
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
