/**
 * TopoCargaService — Núcleo del módulo "Carga de datos topográficos" (móvil).
 *
 * Flujo: una CARGA guarda filas por CÓDIGO de ensayo (rows_json = fuente de verdad).
 * `applyCargaToProtocols` enlaza esas filas a los protocolos existentes (binding
 * diferido) y escribe la capa `topo_*` en cada ensayo enlazado (always-update).
 * Borrar/editar una carga REVIERTE las columnas topo_* que escribió.
 *
 * Fase 2 (este archivo): coords crudas (E/N/Cota) + columnas custom (manual). El
 * cálculo de sector/lat-lng y fórmulas (Fase 4 — procesamiento) se enchufa en
 * `computeTopoPayload` más adelante sin cambiar la firma.
 */
import { Q } from '@nozbe/watermelondb';
import { database, topoCargasCollection, protocolsCollection, projectsCollection, projectSectorsCollection } from '@db/index';
import { enqueue } from './SyncQueueService';
import { supabase } from '@config/supabase';
import { bindCargaToProtocols, normalizeCode, type TopoRow } from '@utils/topoBinding';
import { buildTopoCargaCode, topoSeqGroupKey, nextTopoSeqLocal, cargaDateKey } from '@utils/topoCargaCode';
import { parseFeatureFlagsJson, topoColumns } from '@utils/featureFlags';
import { topoCoordsToLatLng, utmFrameFromSectors, findSectorByPointWithTolerance, type LatLng } from '@utils/CoordinateSystem';

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Map<códigoNormalizado, protocolId> indexando protocol_code y external_id (NO
 *  protocol_number, que es el nombre de la plantilla y se repite). */
export function buildProtocolCodeMap(protocols: any[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of protocols) {
    for (const cand of [(p as any).protocolCode, (p as any).externalId]) {
      const k = normalizeCode(cand);
      if (k && !map.has(k)) map.set(k, p.id);
    }
  }
  return map;
}

/** Valores topo_* a escribir en el protocolo a partir de una fila de la carga.
 *  Fase 2: coords crudas + custom. (Fase 4 sumará lat/lng + sector + fórmulas.) */
function computeTopoPayload(row: TopoRow): Record<string, unknown> {
  const custom = row.custom && Object.keys(row.custom).length > 0 ? JSON.stringify(row.custom) : null;
  return {
    topoCoordEast: toNum(row.c1),
    topoCoordNorth: toNum(row.c2),
    topoCoordElevation: toNum(row.cota),
    topoValuesJson: custom,
  };
}

/** Limpia (null) las columnas topo_* de los protocolos cuyo dueño es `cargaId`.
 *  Devuelve los ids afectados. NO encola (lo hace el caller). */
async function revertCargaProtocolsWrite(cargaId: string): Promise<string[]> {
  const owned = await protocolsCollection.query(Q.where('topo_source_carga_id', cargaId)).fetch();
  if (owned.length === 0) return [];
  const now = Date.now();
  await database.write(async () => {
    for (const p of owned) {
      await (p as any).update((rec: any) => {
        rec.topoSourceCargaId = null;
        rec.topoCoordSystem = null;
        rec.topoCoordEast = null;
        rec.topoCoordNorth = null;
        rec.topoCoordElevation = null;
        rec.topoLatitude = null;
        rec.topoLongitude = null;
        rec.topoSectorId = null;
        rec.topoValuesJson = null;
        rec.topoUpdatedAt = now;
      });
    }
  });
  return owned.map((p) => p.id);
}

interface ProcessingCtx {
  processing: boolean;
  coordSystem: import('@utils/featureFlags').ProjectFeatureFlags['coordinate_system'];
  sectors: { id: string; name: string; points: LatLng[] | null }[];
  frame: { zone: number; hemisphere: 'N' | 'S' } | null;
  sectorEnabled: boolean;
  sectorTolerance: number;
}

/** Contexto del motor: flags (coord_system + procesamiento) + sectores del proyecto +
 *  zona UTM derivada, para calcular el sector con tolerancia. */
async function loadProcessingCtx(projectId: string): Promise<ProcessingCtx> {
  const proj = await projectsCollection.find(projectId).catch(() => null);
  const flags = parseFeatureFlagsJson((proj as any)?.featureFlags);
  if (!flags.topo_processing_enabled) {
    return { processing: false, coordSystem: flags.coordinate_system, sectors: [], frame: null, sectorEnabled: false, sectorTolerance: 0 };
  }
  const secRecs = await projectSectorsCollection.query(Q.where('project_id', projectId)).fetch().catch(() => [] as any[]);
  const sectors = (secRecs as any[]).map((s) => ({ id: s.id, name: s.name, points: s.points ?? null }));
  const cols = topoColumns(flags);
  const sectorCol = cols.find((c) => c.builtin === 'sector' && c.enabled);
  return {
    processing: true,
    coordSystem: flags.coordinate_system,
    sectors,
    frame: utmFrameFromSectors(sectors),
    sectorEnabled: !!sectorCol,
    sectorTolerance: sectorCol?.tolerance_m ?? 0,
  };
}

/** Enlaza las filas de la carga a los protocolos y escribe sus columnas topo_*.
 *  Si el procesamiento está activo, calcula lat/lng + sector (polígono con tolerancia).
 *  Devuelve { touchedIds, pending }. Encola PUSH_TOPO_CARGA + PUSH_PROTOCOL_STATUS. */
export async function applyCargaToProtocols(cargaId: string): Promise<{ touchedIds: string[]; pending: string[] }> {
  const carga = await topoCargasCollection.find(cargaId).catch(() => null);
  if (!carga) return { touchedIds: [], pending: [] };
  const projectId = (carga as any).projectId as string;
  let rows: TopoRow[] = [];
  try { rows = JSON.parse((carga as any).rowsJson || '[]'); } catch { rows = []; }

  const protocols = await protocolsCollection.query(Q.where('project_id', projectId)).fetch();
  const codeMap = buildProtocolCodeMap(protocols);
  const { applied, pending } = bindCargaToProtocols(rows, codeMap);
  const protoById = new Map<string, any>(protocols.map((p) => [p.id, p]));
  const ctx = await loadProcessingCtx(projectId);

  const now = Date.now();
  const touchedIds: string[] = [];
  await database.write(async () => {
    for (const b of applied) {
      const p = protoById.get(b.protocolId);
      if (!p) continue;
      const payload = computeTopoPayload(b.row);
      // Motor: lat/lng + sector (polígono con tolerancia) cuando el procesamiento está ON.
      let lat: number | null = null, lng: number | null = null, sectorId: string | null = null;
      if (ctx.processing) {
        const e = payload.topoCoordEast as number | null, nrt = payload.topoCoordNorth as number | null;
        if (e != null && nrt != null) {
          const ll = topoCoordsToLatLng(e, nrt, ctx.coordSystem, ctx.frame);
          if (ll) {
            lat = ll.lat; lng = ll.lng;
            if (ctx.sectorEnabled && ctx.sectors.length > 0) {
              const res = findSectorByPointWithTolerance(ll, ctx.sectors, ctx.sectorTolerance);
              sectorId = res?.id ?? null;
            }
          }
        }
      }
      await p.update((rec: any) => {
        rec.topoSourceCargaId = cargaId;
        rec.topoCoordEast = payload.topoCoordEast;
        rec.topoCoordNorth = payload.topoCoordNorth;
        rec.topoCoordElevation = payload.topoCoordElevation;
        rec.topoValuesJson = payload.topoValuesJson;
        rec.topoLatitude = lat;
        rec.topoLongitude = lng;
        rec.topoSectorId = sectorId;
        rec.topoCoordSystem = ctx.coordSystem;
        rec.topoUpdatedAt = now;
      });
      touchedIds.push(b.protocolId);
    }
    await (carga as any).update((rec: any) => { rec.appliedAt = now; });
  });

  await enqueue({ opType: 'PUSH_TOPO_CARGA', entityId: cargaId, projectId });
  for (const id of touchedIds) {
    await enqueue({ opType: 'PUSH_PROTOCOL_STATUS', entityId: id, projectId });
  }
  return { touchedIds, pending };
}

/** Crea una carga (código atómico T<ddmmaa>-<seq>) y la aplica. Devuelve el id. */
export async function createCarga(args: {
  projectId: string;
  rows: TopoRow[];
  inputMethod: 'manual' | 'csv';
  createdById?: string | null;
  columns?: unknown;
  date?: Date;
}): Promise<string> {
  const date = args.date ?? new Date();
  const existing = await topoCargasCollection.query(Q.where('project_id', args.projectId)).fetch();
  const baseSeq = nextTopoSeqLocal(existing.map((c: any) => c.cargaCode), date);
  let seq = baseSeq;
  try {
    const { data: cloudSeq, error } = await supabase.rpc('next_protocol_seq', {
      p_project_id: args.projectId, p_group_key: topoSeqGroupKey(date), p_client_seq: baseSeq, p_count: 1,
    });
    if (!error && typeof cloudSeq === 'number' && cloudSeq > 0) seq = cloudSeq;
  } catch { /* offline → seq local */ }
  const code = buildTopoCargaCode(date, seq);

  let id = '';
  await database.write(async () => {
    const rec = await topoCargasCollection.create((c: any) => {
      c.projectId = args.projectId;
      c.cargaCode = code;
      c.seq = seq;
      c.cargaDate = cargaDateKey(date);
      c.inputMethod = args.inputMethod;
      c.createdById = args.createdById ?? null;
      c.uploadStatus = 'PENDING';
      c.rowsJson = JSON.stringify(args.rows ?? []);
      c.columnsJson = args.columns ? JSON.stringify(args.columns) : null;
    });
    id = rec.id;
  });
  await applyCargaToProtocols(id);
  return id;
}

/** Reemplaza las filas de una carga ("chancar") y re-aplica. Revierte lo previo y
 *  re-bindea TODO el proyecto: la carga editada con sus nuevas filas + las demás (para
 *  que un ensayo que esta carga soltó vuelva a su DUEÑO previo, no quede en null). */
export async function updateCarga(cargaId: string, rows: TopoRow[], columns?: unknown): Promise<void> {
  const carga = await topoCargasCollection.find(cargaId).catch(() => null);
  if (!carga) return;
  const projectId = (carga as any).projectId as string;
  // 1. Revertir lo que esta carga tenía (los ensayos soltados se re-bindean abajo).
  await revertCargaProtocolsWrite(cargaId);
  // 2. Actualizar rows_json/columns_json.
  await database.write(async () => {
    await (carga as any).update((rec: any) => {
      rec.rowsJson = JSON.stringify(rows ?? []);
      if (columns !== undefined) rec.columnsJson = columns ? JSON.stringify(columns) : null;
    });
  });
  // 3. Re-aplicar TODAS las cargas (created_at asc): la editada con sus nuevas filas +
  //    las demás (restaura el dueño previo de ensayos que esta carga dejó de referenciar).
  await rebindProjectCargas(projectId);
}

/** Borra una carga revirtiendo sus columnas topo_* en los protocolos. */
export async function deleteCargaWithRevert(cargaId: string): Promise<void> {
  const carga = await topoCargasCollection.find(cargaId).catch(() => null);
  if (!carga) return;
  const projectId = (carga as any).projectId as string;
  const revertedIds = await revertCargaProtocolsWrite(cargaId);
  await database.write(async () => {
    await (carga as any).markAsDeleted();
  });
  // #5 — Encolar los push de protocolos (null) ANTES del delete de la carga para no
  // dejar una referencia colgante transitoria en la nube.
  for (const id of revertedIds) {
    await enqueue({ opType: 'PUSH_PROTOCOL_STATUS', entityId: id, projectId });
  }
  await enqueue({ opType: 'DELETE_TOPO_CARGA', entityId: cargaId, projectId });
  // #3 — Re-bind: si otra carga (más antigua) referenciaba alguno de estos ensayos,
  // re-aplicar las cargas restantes para que el dueño previo recupere su escritura.
  await rebindProjectCargas(projectId).catch(() => {});
}

/** Re-enlaza TODAS las cargas del proyecto (al aparecer ensayos nuevos). Aplica en
 *  orden de creación (la más nueva gana en caso de solapamiento de código). */
export async function rebindProjectCargas(projectId: string): Promise<void> {
  const cargas = await topoCargasCollection
    .query(Q.where('project_id', projectId), Q.sortBy('created_at', Q.asc))
    .fetch();
  for (const c of cargas) {
    await applyCargaToProtocols(c.id).catch(() => { /* best-effort */ });
  }
}

/** Cuenta de pendientes (códigos sin ensayo) de una carga, recomputado en vivo. */
export async function cargaPendingCodes(cargaId: string): Promise<string[]> {
  const carga = await topoCargasCollection.find(cargaId).catch(() => null);
  if (!carga) return [];
  const projectId = (carga as any).projectId as string;
  let rows: TopoRow[] = [];
  try { rows = JSON.parse((carga as any).rowsJson || '[]'); } catch { rows = []; }
  const protocols = await protocolsCollection.query(Q.where('project_id', projectId)).fetch();
  const { pending } = bindCargaToProtocols(rows, buildProtocolCodeMap(protocols));
  return pending;
}
