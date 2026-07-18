/**
 * DevSeedService — v91: HERRAMIENTA DE DESARROLLO (botón "+Dev" de Ensayos;
 * quitar antes de producción). Genera N ensayos de un tipo COMPLETAMENTE
 * llenos con el autollenado congruente (`:ej[]` de la ficha), CONGELADOS y
 * ENVIADOS a aprobación — replicando el MISMO pipeline del submit real de
 * ProtocolFillScreen: freeze de fórmulas/lookup + SUBMITTED + fila de Tablas
 * Resumen + push/cola. Sirve para poblar datos de prueba de un ensayo en
 * segundos (dossier, dashboard, FLOW, resumen).
 *
 * LÍMITE v1 (deliberado): fichas con LLAMADOS entre ensayos (xref — Cono de
 * Arena, CBR) NO están soportadas: exigen resolver el ensayo fuente aprobado
 * y sus consideraciones (grupo/fecha/sector). Se aborta con mensaje claro.
 */
import { Q } from '@nozbe/watermelondb';
import {
  database, labAuxTablesCollection, protocolItemsCollection, protocolsCollection,
} from '@db/index';
import { createInstances } from './ProtocolInstanceService';
import { enqueue as enqueueSync } from './SyncQueueService';
import { SyncWorker } from './SyncWorker';
import { pushProjectToSupabase, pushProtocolStatus } from './SupabaseSyncService';
import { upsertSummaryRow } from './SummaryRowService';
import { buildFrozenComments } from '@utils/freezeSnapshot';
import { devGenCellValue, devNorm } from '@utils/devAutofill';
import { parseNumericRow } from '@utils/numericProtocol';
import type { AuxTables } from '@utils/formulaEval';

export interface DevSeedArgs {
  projectId: string;
  template: { id: string; name: string; idProtocolo?: string | null };
  count: number;
  sectorId?: string | null;
  sectorName?: string | null;
  ensayoDate?: string | null;
  ensayoTime?: string | null;
  /** Quién figura como llenador/enviador (el usuario actual). */
  filledById?: string | null;
}

export interface DevSeedResult {
  codes: (string | null)[];
  warnings: string[];
}

export async function seedFilledEnsayos(a: DevSeedArgs): Promise<DevSeedResult> {
  // 1. Crear los borradores con el motor OFICIAL (numeración correlativa real,
  //    reserva atómica en nube, push + cola — igual que el botón normal).
  const { ids, codes, warnings } = await createInstances({
    projectId: a.projectId,
    template: { id: a.template.id, name: a.template.name, idProtocolo: a.template.idProtocolo ?? null },
    count: a.count,
    sectorId: a.sectorId ?? null,
    sectorName: a.sectorName ?? null,
    ensayoDate: a.ensayoDate ?? null,
    ensayoTime: a.ensayoTime ?? null,
  });

  // 2. Tablas auxiliares del proyecto (BUSCAR / listas por tabla) — misma
  //    carga que hace ProtocolFillScreen al montar.
  const auxTables: AuxTables = {};
  try {
    const tbls = await labAuxTablesCollection.query(Q.where('project_id', a.projectId)).fetch();
    for (const t of tbls as any[]) {
      try {
        auxTables[String(t.groupKey).toLowerCase()] = {
          columns: JSON.parse(t.columnsJson ?? '[]'),
          rows: JSON.parse(t.rowsJson ?? '[]'),
        };
      } catch { /* tabla corrupta → se omite */ }
    }
  } catch { /* sin tablas auxiliares */ }

  for (const pid of ids) {
    if (!pid) continue;
    const fetched = await protocolItemsCollection.query(Q.where('protocol_id', pid)).fetch();
    // Orden natural por partida (misma regla que la pantalla de llenado).
    const sorted = [...fetched].sort((x: any, y: any) => {
      const px = parseFloat(x.partidaItem ?? '') || 0;
      const py = parseFloat(y.partidaItem ?? '') || 0;
      return px - py;
    });
    const specs = sorted.map((it: any) => parseNumericRow(it.validationMethod ?? null));

    // Guard v1: fichas con xref no soportadas (ver header).
    const hasXref = specs.some(sp => sp?.kind === 'row' && sp.cells.some((c: any) => c.kind === 'xref'));
    if (hasXref) {
      throw new Error(
        'Esta ficha tiene llamados entre ensayos (xref): "+Dev" aún no la soporta. ' +
        'Usa un tipo SIN llamados (p. ej. Proctor Modificado).',
      );
    }

    // 3. Autollenado HEADLESS de todas las celdas de entrada (mismo generador
    //    que el botón "Autollenar" de la ficha: prioridad :ej[] → congruente).
    const gen = new Map<string, string>();
    sorted.forEach((it: any, idx: number) => {
      const spec = specs[idx];
      if (spec?.kind !== 'row') return;
      const desc = devNorm(String(it.itemDescription ?? ''));
      const vals = spec.cells.map((c, i) => devGenCellValue(c, i, desc, {}, auxTables) ?? '');
      gen.set(it.id, vals.join(' // '));
    });

    // 4. CONGELAR fórmulas/lookup/BUSCAR (mismo motor del submit real) y
    //    marcar SUBMITTED — snapshot atómico del protocolo completo.
    const frozen = buildFrozenComments(
      sorted.map((it: any) => ({
        id: it.id,
        partidaItem: it.partidaItem ?? null,
        validationMethod: it.validationMethod ?? null,
        comments: gen.get(it.id) ?? it.comments ?? null,
      })),
      auxTables,
      {},
    );
    let updated: any = null;
    await database.write(async () => {
      for (const it of sorted as any[]) {
        const fz = frozen.get(it.id) ?? gen.get(it.id);
        if (fz != null && fz !== it.comments) {
          await it.update((i: any) => { i.comments = fz; });
        }
      }
      const proto: any = await protocolsCollection.find(pid);
      updated = await proto.update((pp: any) => {
        pp.status = 'SUBMITTED';
        pp.filledById = a.filledById ?? null;
        pp.filledAt = Date.now();
        pp.submittedAt = Date.now();
      });
    });

    // 5. Push + cola (retry garantizado) + fila de Tablas Resumen — igual que
    //    el submit real.
    if (updated) {
      pushProtocolStatus(updated).catch(() => {});
      enqueueSync({ opType: 'PUSH_PROTOCOL_STATUS', entityId: pid, projectId: a.projectId }).catch(() => {});
      // v92 — Los ITEMS también van por la COLA (retry garantizado): sin esto
      // dependían solo del push masivo best-effort del final; si fallaba, los
      // valores quedaban solo locales hasta el próximo sync de pantalla.
      for (const it of sorted as any[]) {
        enqueueSync({ opType: 'PUSH_PROTOCOL_ITEM', entityId: it.id, projectId: a.projectId }).catch(() => {});
      }
    }
    upsertSummaryRow(pid, { xrefValues: {} }).catch(() => {});
  }

  SyncWorker.forceTick().catch(() => {});
  pushProjectToSupabase(a.projectId).catch(() => {});
  return { codes, warnings };
}
