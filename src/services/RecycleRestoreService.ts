/**
 * RecycleRestoreService (v62) — Restaurar / Eliminar definitivo desde la Papelera.
 *
 * Operaciones ONLINE (tocan la nube): llaman los RPC v62 (security definer, guardia
 * can_access_project) y convergen con `pullProjectFromCloud`. El borrado del ensayo ya
 * es "soft" (vive en recycle_bin); esto agrega la vuelta (restaurar) y el definitivo (purge).
 */
import { supabase } from '@config/supabase';
import { pullProjectFromCloud } from '@services/SupabaseSyncService';
import { deleteFromS3 } from '@services/S3Service';

export type RestoreResult = { ok: boolean; reason?: 'code_in_use' | 'offline' | string; code?: string };
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
export async function restoreFromRecycle(recycleId: string, projectId: string): Promise<RestoreResult> {
  const { data, error } = await supabase.rpc('restore_protocol_from_recycle', { p_recycle_id: recycleId, p_new_code: null });
  if (error) {
    const msg = error.message ?? '';
    if (/23505|duplicate|uniq/i.test(msg)) return { ok: false, reason: 'code_in_use' };
    if (/network|fetch|offline/i.test(msg)) return { ok: false, reason: 'offline' };
    return { ok: false, reason: msg || 'error' };
  }
  await pullProjectFromCloud(projectId).catch(() => {});
  const r = (data ?? {}) as { protocol_code?: string };
  return { ok: true, code: r.protocol_code ?? undefined };
}

/**
 * Elimina DEFINITIVAMENTE una entrada de papelera (RPC v62, solo CREATOR) y libera las fotos
 * S3 del snapshot. Irreversible.
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
