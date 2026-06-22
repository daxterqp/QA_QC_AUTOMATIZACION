/**
 * XrefRefresh (v42) — Frescura HÍBRIDA de los llamados entre ensayos.
 *
 * - `checkProtocolXrefStale`: compara el snapshot congelado del ensayo vs una
 *   resolución fresca → indica si la fuente cambió (para el badge "desactualizado").
 * - `refreshProtocolXrefs`: re-resuelve, RE-CONGELA los valores llamados en los
 *   comments, re-arma la Tabla Resumen y actualiza el snapshot. Es la acción
 *   "Actualizar". NO cambia el estado del ensayo (sigue inmutable salvo esto).
 */
import { Q } from '@nozbe/watermelondb';
import { database, protocolsCollection, protocolItemsCollection, labAuxTablesCollection } from '@db/index';
import { buildFrozenComments } from '@utils/freezeSnapshot';
import type { AuxTables } from '@utils/formulaEval';
import { resolveXrefs, compareXrefMeta, type XrefMeta, type XrefStaleness } from '@services/XrefResolver';
import { upsertSummaryRow } from '@services/SummaryRowService';
import { pushProtocolStatus } from '@services/SupabaseSyncService';
import { enqueue as enqueueSync } from '@services/SyncQueueService';

async function loadAuxTables(projectId: string): Promise<AuxTables> {
  const aux: AuxTables = {};
  try {
    const tbls = await labAuxTablesCollection.query(Q.where('project_id', projectId)).fetch();
    for (const t of tbls as any[]) {
      try { aux[String(t.groupKey).toLowerCase()] = { columns: JSON.parse(t.columnsJson ?? '[]'), rows: JSON.parse(t.rowsJson ?? '[]') }; } catch { /* tabla corrupta */ }
    }
  } catch { /* sin tablas */ }
  return aux;
}

function parseStored(json: string | null | undefined): Record<string, XrefMeta> | null {
  if (!json) return null;
  try { return JSON.parse(json) as Record<string, XrefMeta>; } catch { return null; }
}

/** ¿El ensayo tiene llamados desactualizados respecto a sus fuentes actuales? */
export async function checkProtocolXrefStale(protocolId: string): Promise<XrefStaleness> {
  try {
    const proto: any = await protocolsCollection.find(protocolId).catch(() => null);
    if (!proto) return { stale: false, reasons: [] };
    const stored = parseStored(proto.xrefSnapshotJson);
    if (!stored || Object.keys(stored).length === 0) return { stale: false, reasons: [] };
    const items: any[] = await protocolItemsCollection.query(Q.where('protocol_id', protocolId)).fetch();
    const { meta } = await resolveXrefs(proto.projectId, items.map(it => ({ validationMethod: it.validationMethod ?? null, comments: it.comments ?? null, partidaItem: it.partidaItem ?? null })));
    return compareXrefMeta(stored, meta);
  } catch { return { stale: false, reasons: [] }; }
}

/** Re-resuelve + re-congela los llamados + re-arma el Resumen + actualiza snapshot. */
export async function refreshProtocolXrefs(protocolId: string): Promise<void> {
  const proto: any = await protocolsCollection.find(protocolId).catch(() => null);
  if (!proto) return;
  const items: any[] = await protocolItemsCollection.query(Q.where('protocol_id', protocolId)).fetch();
  const auxTables = await loadAuxTables(proto.projectId);
  const { values, meta } = await resolveXrefs(proto.projectId, items.map(it => ({ validationMethod: it.validationMethod ?? null, comments: it.comments ?? null, partidaItem: it.partidaItem ?? null })));

  // Guarda anti-pérdida: si una fuente que ANTES tenía valor ahora no resuelve
  // (borrada / des-aprobada / ambigua), NO recongelamos para no borrar datos
  // buenos de un ensayo ya enviado. Avisa para que se revise la fuente.
  const stored = parseStored(proto.xrefSnapshotJson);
  if (stored) {
    for (const k of Object.keys(stored)) {
      if (stored[k]?.value != null && meta[k]?.value == null) {
        throw new Error('Una fuente referenciada ya no está disponible o aprobada. No se actualizó para no borrar datos; revisa el ensayo fuente.');
      }
    }
  }

  const frozen = buildFrozenComments(
    items.map(it => ({ id: it.id, partidaItem: it.partidaItem ?? null, validationMethod: it.validationMethod ?? null, comments: it.comments ?? null })),
    auxTables,
    values,
  );

  await database.write(async () => {
    for (const it of items) {
      const next = frozen.get(it.id);
      if (next != null && next !== (it.comments ?? '')) await it.update((x: any) => { x.comments = next; });
    }
    await proto.update((p: any) => { p.xrefSnapshotJson = Object.keys(meta).length ? JSON.stringify(meta) : null; });
  });

  await upsertSummaryRow(protocolId).catch(() => {});
  // Subir el cambio (status push reusa el mismo handler; idempotente).
  pushProtocolStatus(proto).catch(() => {});
  if (proto.projectId) {
    enqueueSync({ opType: 'PUSH_PROTOCOL_STATUS', entityId: protocolId, projectId: proto.projectId }).catch(() => {});
  }
}
