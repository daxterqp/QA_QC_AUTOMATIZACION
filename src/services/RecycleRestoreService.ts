/**
 * RecycleRestoreService (v62) — Restaurar / Eliminar definitivo desde la Papelera.
 *
 * Operaciones ONLINE (tocan la nube): llaman los RPC v62 (security definer, guardia
 * can_access_project) y convergen con `pullProjectFromCloud`. El borrado del ensayo ya
 * es "soft" (vive en recycle_bin); esto agrega la vuelta (restaurar) y el definitivo (purge).
 */
import { Q } from '@nozbe/watermelondb';
import { supabase } from '@config/supabase';
import { protocolsCollection, protocolTemplatesCollection, projectsCollection, projectSectorsCollection } from '@db/index';
import { parseFeatureFlagsJson } from '@utils/featureFlags';
import { pickMask, nextSeq, buildProtocolCode, parseEnsayoDate, type SeqResetScope } from '@utils/protocolCode';
import { pullProjectFromCloud } from '@services/SupabaseSyncService';
import { deleteFromS3 } from '@services/S3Service';

export type RestoreResult = { ok: boolean; reason?: 'code_in_use' | 'offline' | string; code?: string };

/**
 * v62 — Calcula el "próximo código libre" para re-codificar un ensayo restaurado cuyo código
 * original ya fue reusado. Espejo de la codificación de creación (pickMask + nextSeq + RPC
 * next_protocol_seq + buildProtocolCode). Devuelve null si el proyecto no usa codificación o
 * falta el tipo (en cuyo caso se conserva el código original).
 */
async function computeNextFreeCode(snap: any): Promise<string | null> {
  try {
    const proto = snap?.protocol;
    if (!proto?.project_id) return null;
    const projRow: any = await projectsCollection.find(proto.project_id).catch(() => null);
    const flags = parseFeatureFlagsJson(projRow?.featureFlags);
    if (!flags.protocol_codes) return null;
    const tplRow: any = proto.template_id ? await protocolTemplatesCollection.find(proto.template_id).catch(() => null) : null;
    const tipo = tplRow?.idProtocolo ?? null;
    if (!tipo) return null;
    const date = parseEnsayoDate(proto.ensayo_date) ?? new Date();
    const resetScope: SeqResetScope = flags.coding_seq_reset === 'year_sector' ? { sector: true }
      : flags.coding_seq_reset === 'year_month' ? { month: true } : {};
    const sectorRow: any = proto.sector_id ? await projectSectorsCollection.find(proto.sector_id).catch(() => null) : null;
    const sectorName = sectorRow?.name ?? null;
    const mask = pickMask(flags.coding_mask_default, flags.coding_mask_by_type, tipo);
    const allProtos: any[] = await protocolsCollection.query(Q.where('project_id', proto.project_id)).fetch().catch(() => []);
    const baseSeq = nextSeq(allProtos.map(p => p.protocolCode), mask, tipo, date, sectorName, resetScope);
    const sectorPart = resetScope.sector ? `|${(sectorName ?? '').trim().toUpperCase().replace(/\s+/g, '')}` : '';
    const monthPart = resetScope.month ? `|M${date.getMonth() + 1}` : '';
    const groupKey = `${tipo}|${date.getFullYear()}${sectorPart}${monthPart}`;
    const { data: cloudStart } = await supabase.rpc('next_protocol_seq', { p_project_id: proto.project_id, p_group_key: groupKey, p_client_seq: baseSeq, p_count: 1 });
    const seq = (typeof cloudStart === 'number' && cloudStart > 0) ? cloudStart : baseSeq;
    return buildProtocolCode(mask, { tipo, date, seq, sector: sectorName });
  } catch { return null; }
}
export type PurgeResult = { ok: boolean; reason?: 'forbidden' | 'offline' | string };

/** Claves S3 (evidencias + fotos de comentarios) desde un snapshot de papelera. Mismos
 *  campos que `collectProtocolS3Keys` (evidences.s3_key / annotation_comment_photos.storage_path). */
function s3KeysFromSnapshot(snap: any): string[] {
  const keys: string[] = [];
  for (const e of (snap?.evidences ?? [])) { const k = e?.s3_key ?? e?.s3_url_placeholder; if (k) keys.push(k); }
  for (const p of (snap?.annotation_comment_photos ?? [])) { if (p?.storage_path) keys.push(p.storage_path); }
  return keys;
}

/**
 * Restaura un ensayo desde la papelera (RPC v62). Conserva su código original si sigue libre
 * (caso normal: al borrar el último se liberó el correlativo). Si el código ya fue reusado, el
 * índice único lo rechaza → devuelve `code_in_use` para que la UI lo informe. Tras el éxito,
 * converge con pull (reaparece el ensayo) y la entrada local de papelera desaparece sola.
 */
export async function restoreFromRecycle(recycleId: string, projectId: string, snapshotJson?: string | null): Promise<RestoreResult> {
  const { data, error } = await supabase.rpc('restore_protocol_from_recycle', { p_recycle_id: recycleId, p_new_code: null });
  if (error) {
    const msg = error.message ?? '';
    if (/23505|duplicate|uniq/i.test(msg)) {
      // El código original ya fue reusado → recodificar con el PRÓXIMO LIBRE y reintentar
      // (la elección del usuario: "restaurar = próximo código libre, nunca colisiona").
      let newCode: string | null = null;
      try { if (snapshotJson) newCode = await computeNextFreeCode(JSON.parse(snapshotJson)); } catch { /* sin recodificación */ }
      if (newCode) {
        const retry = await supabase.rpc('restore_protocol_from_recycle', { p_recycle_id: recycleId, p_new_code: newCode });
        if (!retry.error) { await pullProjectFromCloud(projectId).catch(() => {}); return { ok: true, code: newCode }; }
      }
      return { ok: false, reason: 'code_in_use' };
    }
    if (/network|fetch|offline/i.test(msg)) return { ok: false, reason: 'offline' };
    return { ok: false, reason: msg || 'error' };
  }
  await pullProjectFromCloud(projectId).catch(() => {});
  const r = (data ?? {}) as { protocol_code?: string };
  return { ok: true, code: r.protocol_code ?? undefined };
}

/**
 * v64 — Borra una MUESTRA → papelera (soft). BLOQUEA si tiene ensayos vinculados (la RPC aborta
 * con `sample_has_protocols:<n>`). Online (converge con pull).
 */
export async function deleteSampleToRecycle(
  sampleId: string, projectId: string,
  meta?: { deletedById?: string | null; deletedByName?: string | null },
): Promise<{ ok: boolean; reason?: 'has_protocols' | 'offline' | string; count?: number }> {
  const { error } = await supabase.rpc('delete_sample_to_recycle', {
    p_sample_id: sampleId, p_deleted_by_id: meta?.deletedById ?? null, p_deleted_by_name: meta?.deletedByName ?? null,
  });
  if (error) {
    const m = error.message ?? '';
    const hp = m.match(/sample_has_protocols:(\d+)/);
    if (hp) return { ok: false, reason: 'has_protocols', count: Number(hp[1]) };
    if (/network|fetch|offline/i.test(m)) return { ok: false, reason: 'offline' };
    return { ok: false, reason: m || 'error' };
  }
  await pullProjectFromCloud(projectId).catch(() => {});
  return { ok: true };
}

/** v64 — Restaura una MUESTRA desde la papelera (RPC v64). */
export async function restoreSampleFromRecycle(recycleId: string, projectId: string): Promise<RestoreResult> {
  const { data, error } = await supabase.rpc('restore_sample_from_recycle', { p_recycle_id: recycleId, p_new_code: null });
  if (error) {
    const m = error.message ?? '';
    if (/23505|duplicate|uniq/i.test(m)) return { ok: false, reason: 'code_in_use' };
    if (/network|fetch|offline/i.test(m)) return { ok: false, reason: 'offline' };
    return { ok: false, reason: m || 'error' };
  }
  await pullProjectFromCloud(projectId).catch(() => {});
  const r = (data ?? {}) as { sample_code?: string };
  return { ok: true, code: r.sample_code ?? undefined };
}

/**
 * Elimina DEFINITIVAMENTE una entrada de papelera (RPC v62, solo CREATOR) y libera las fotos
 * S3 del snapshot. Irreversible. Genérico (sirve para ensayos y muestras).
 */
export async function purgeRecycleEntry(recycleId: string, projectId: string, snapshotJson: string): Promise<PurgeResult> {
  const { error } = await supabase.rpc('purge_recycle_entry', { p_recycle_id: recycleId });
  if (error) {
    const msg = error.message ?? '';
    if (/CREATOR|acceso/i.test(msg)) return { ok: false, reason: 'forbidden' };
    if (/network|fetch|offline/i.test(msg)) return { ok: false, reason: 'offline' };
    return { ok: false, reason: msg || 'error' };
  }
  // S3 best-effort DESPUÉS de purgar la BD (ya es definitivo; las fotos no se recuperan).
  try { const snap = JSON.parse(snapshotJson); for (const k of s3KeysFromSnapshot(snap)) await deleteFromS3(k); } catch { /* best-effort */ }
  await pullProjectFromCloud(projectId).catch(() => {});
  return { ok: true };
}
