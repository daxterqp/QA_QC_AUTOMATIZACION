/**
 * EquipmentExcelImporter (móvil) — persistencia local del catálogo de equipos.
 *
 * v29 — El parsing del archivo lo hace TraceabilityExcelImporter (parser
 * unificado que acepta CSV, xlsx 1-hoja y xlsx multi-hoja). Este archivo
 * mantiene únicamente `importEquipmentLocally` con dedup integrado, que es
 * invocado desde TraceabilityExcelImporter al procesar la hoja Equipos.
 */
import { database, equipmentCollection, equipmentActivitiesCollection, workSessionsCollection, protocolEquipmentCollection } from '@db/index';
import { Q } from '@nozbe/watermelondb';
import type { EquipmentType, EquipmentCategory } from '@models/Equipment';

export class EquipmentImportError extends Error {}

export interface ParsedEquipment {
  code: string;
  name: string;
  type: EquipmentType;
  category: EquipmentCategory;
  brand: string | null;
  model: string | null;
  serial: string | null;
  capacity: string | null;
  resolution: string | null;
  lastCalibrationAt: number | null;
  nextCalibrationAt: number | null;
  notes: string | null;
}

export interface ImportSummary { added: number; modified: number; skipped: number; deduped?: number }

/** Upsert local + encola sync con Supabase.
 *  Dedup: si hay varios equipos con el mismo código en el mismo proyecto
 *  (típico cuando se importó local + se pulleó desde Supabase con ids
 *  distintos), conserva uno (prioridad: synced > created) y destruye los demás. */
export async function importEquipmentLocally(projectId: string, parsed: ParsedEquipment[], forceCategory?: EquipmentCategory): Promise<ImportSummary> {
  const existing = await equipmentCollection.query().fetch();
  const byCodeAll = new Map<string, any[]>();
  for (const e of existing as any[]) {
    if (e.projectId !== projectId) continue;
    const key = e.code.trim().toLowerCase();
    if (!byCodeAll.has(key)) byCodeAll.set(key, []);
    byCodeAll.get(key)!.push(e);
  }
  const byCode = new Map<string, any>();
  const toDestroy: any[] = [];
  for (const [key, dupes] of Array.from(byCodeAll.entries())) {
    if (dupes.length === 1) { byCode.set(key, dupes[0]); continue; }
    dupes.sort((a, b) => {
      const aSynced = a._raw?._status === 'synced' ? 0 : 1;
      const bSynced = b._raw?._status === 'synced' ? 0 : 1;
      if (aSynced !== bSynced) return aSynced - bSynced;
      const aU = a._raw?.updated_at ?? 0;
      const bU = b._raw?.updated_at ?? 0;
      return bU - aU;
    });
    byCode.set(key, dupes[0]);
    for (let i = 1; i < dupes.length; i++) toDestroy.push(dupes[i]);
  }

  // v29 — Antes de destruir duplicados, reasignar las FKs que apuntan a ellos
  // (equipment_activities, work_sessions, protocol_equipment) al equipo ganador.
  // Sin esto, los vínculos quedan huérfanos y desaparecen del UI silenciosamente.
  const reassignOps: any[] = [];
  if (toDestroy.length > 0) {
    const loserToWinner: Record<string, string> = {};
    for (const [key, dupes] of Array.from(byCodeAll.entries())) {
      if (dupes.length <= 1) continue;
      const winner = byCode.get(key);
      if (!winner) continue;
      for (const d of dupes) if (d.id !== winner.id) loserToWinner[d.id] = winner.id;
    }
    const loserIds = Object.keys(loserToWinner);
    if (loserIds.length > 0) {
      const [eqActLinks, workSess, protoEq] = await Promise.all([
        equipmentActivitiesCollection.query(Q.where('equipment_id', Q.oneOf(loserIds))).fetch(),
        workSessionsCollection.query(Q.where('equipment_id', Q.oneOf(loserIds))).fetch(),
        protocolEquipmentCollection.query(Q.where('equipment_id', Q.oneOf(loserIds))).fetch(),
      ]);
      for (const r of eqActLinks as any[]) {
        reassignOps.push(r.prepareUpdate((x: any) => { x.equipmentId = loserToWinner[r.equipmentId]; }));
      }
      for (const r of workSess as any[]) {
        reassignOps.push(r.prepareUpdate((x: any) => { x.equipmentId = loserToWinner[r.equipmentId]; }));
      }
      for (const r of protoEq as any[]) {
        reassignOps.push(r.prepareUpdate((x: any) => { x.equipmentId = loserToWinner[r.equipmentId]; }));
      }
    }
  }

  let added = 0, modified = 0;
  await database.write(async () => {
    const ops: any[] = [...reassignOps];
    for (const d of toDestroy) ops.push(d.prepareDestroyPermanently());
    for (const eq of parsed) {
      const prev = byCode.get(eq.code.trim().toLowerCase());
      // Para maquinaria sin calibración, usar sentinel 2099 (NOT NULL en Supabase).
      const calibMs = eq.nextCalibrationAt ?? Date.UTC(2099, 11, 31);
      // v40 — la sección que importa (Lab. / Maquinaria) decide la categoría.
      const category = forceCategory ?? eq.category;
      if (!prev) {
        const id = `eq_${Date.now()}_${Math.floor(Math.random() * 1e9).toString(36)}`;
        const rec = equipmentCollection.prepareCreate((r: any) => {
          r._raw.id = id;
          r.projectId = projectId;
          r.code = eq.code;
          r.name = eq.name;
          r.type = eq.type;
          r.category = category;
          r.brand = eq.brand;
          r.model = eq.model;
          r.serial = eq.serial;
          r.capacity = eq.capacity;
          r.resolution = eq.resolution;
          r.lastCalibrationAt = eq.lastCalibrationAt;
          r.nextCalibrationAt = calibMs;
          r.status = 'active';
          r.notes = eq.notes;
        });
        ops.push(rec);
        added++;
      } else {
        ops.push(prev.prepareUpdate((r: any) => {
          r.name = eq.name;
          r.type = eq.type;
          r.category = category;
          r.brand = eq.brand;
          r.model = eq.model;
          r.serial = eq.serial;
          r.capacity = eq.capacity;
          r.resolution = eq.resolution;
          r.lastCalibrationAt = eq.lastCalibrationAt;
          r.nextCalibrationAt = calibMs;
          r.notes = eq.notes;
        }));
        modified++;
      }
    }
    await database.batch(ops);
  });
  return { added, modified, skipped: 0, deduped: toDestroy.length };
}
