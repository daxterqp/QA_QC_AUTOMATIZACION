/**
 * recycleDelete.ts — Papelera + Hard Delete (web, server-side).
 *
 * Espejo de deleteProtocolStrict (móvil). Antes de borrar un ensayo guarda una
 * copia estática y autocontenida en `recycle_bin` (papelera), luego hace HARD
 * DELETE del protocolo y de TODAS sus relaciones — incluyendo lo que antes
 * quedaba HUÉRFANO: fila de Tablas Resumen (protocol_summary_rows), anotaciones
 * de plano + comentarios + fotos, equipos del protocolo y no conformidades.
 *
 * Esta función NO toca S3 (solo BD). Los OBJETOS S3 se borran aparte en las
 * rutas, que llaman a `collectProtocolS3Keys` ANTES y a `deleteS3Objects`
 * DESPUÉS (best-effort). Idempotente. Usado por las rutas de borrado de ensayos,
 * ubicaciones y plantillas para garantizar cero huérfanos en ningún módulo.
 */

const CHUNK = 50;

function isMissingRelation(err: { message?: string } | null | undefined): boolean {
  return !!err && /relation|does not exist|could not find the table|schema cache/i.test(err.message ?? '');
}

async function selectIn(supabase: any, table: string, col: string, values: string[], cols = '*'): Promise<any[]> {
  if (values.length === 0) return [];
  const out: any[] = [];
  for (let i = 0; i < values.length; i += CHUNK) {
    const { data, error } = await supabase.from(table).select(cols).in(col, values.slice(i, i + CHUNK));
    if (error) { if (isMissingRelation(error)) return out; throw new Error(`[recycleDelete:select ${table}] ${error.message}`); }
    if (data) out.push(...data);
  }
  return out;
}

async function deleteIn(supabase: any, table: string, col: string, values: string[]): Promise<void> {
  for (let i = 0; i < values.length; i += CHUNK) {
    const { error } = await supabase.from(table).delete().in(col, values.slice(i, i + CHUNK));
    if (error && !isMissingRelation(error)) throw new Error(`[recycleDelete:delete ${table}] ${error.message}`);
  }
}

export interface RecycleMeta {
  deletedById?: string | null;
  deletedByName?: string | null;
}

/** Recolecta las claves S3 (fotos de evidencias + fotos de comentarios) de los
 *  ensayos, ANTES de borrar sus filas, para poder limpiarlas en S3 luego. */
export async function collectProtocolS3Keys(supabase: any, protocolIds: string[]): Promise<string[]> {
  const ids = (protocolIds ?? []).filter(id => id && id.trim());
  if (!ids.length) return [];
  const keys: string[] = [];

  const items = await selectIn(supabase, 'protocol_items', 'protocol_id', ids, 'id');
  const itemIds = items.map(i => i.id);
  const evidences = await selectIn(supabase, 'evidences', 'protocol_item_id', itemIds, 's3_key, s3_url_placeholder');
  for (const e of evidences) { const k = e.s3_key ?? e.s3_url_placeholder; if (k) keys.push(k); }

  const annotations = await selectIn(supabase, 'plan_annotations', 'protocol_id', ids, 'id');
  const annIds = annotations.map(a => a.id);
  const comments = await selectIn(supabase, 'annotation_comments', 'annotation_id', annIds, 'id');
  const commentIds = comments.map(c => c.id);
  const photos = await selectIn(supabase, 'annotation_comment_photos', 'annotation_comment_id', commentIds, 'storage_path');
  for (const p of photos) { if (p.storage_path) keys.push(p.storage_path); }

  return keys;
}

/** Copia a la papelera + hard delete de uno o varios ensayos (protocolos).
 *
 *  Camino ROBUSTO (v44): por cada ensayo llama a la función transaccional de
 *  Postgres `delete_protocol_to_recycle` (copia + borrado en UNA transacción
 *  atómica: o todo o nada). Si la función aún no está migrada, cae al camino
 *  manual no-transaccional (idempotente, converge en reintentos). */
export async function deleteProtocolsWithRecycle(
  supabase: any,
  protocolIds: string[],
  meta?: RecycleMeta,
): Promise<void> {
  if (!protocolIds?.length) return;
  const ids = protocolIds.filter(id => id && id.trim()); // guardia: sin ids vacíos
  if (!ids.length) return;

  for (const id of ids) {
    const { error } = await supabase.rpc('delete_protocol_to_recycle', {
      p_protocol_id: id,
      p_deleted_by_id: meta?.deletedById ?? null,
      p_deleted_by_name: meta?.deletedByName ?? null,
    });
    if (!error) continue;
    const fnMissing = /could not find the function|does not exist|42883|schema cache/i.test(error.message ?? '');
    if (!fnMissing) throw new Error(`[recycleDelete:rpc] ${error.message}`);
    // RPC no migrada → borrado manual del lote restante y salimos.
    console.warn('[recycleDelete] RPC no migrada (v44) — usando camino manual no-transaccional.');
    await deleteProtocolsManual(supabase, ids, meta);
    return;
  }
}

/** Camino MANUAL (fallback si la RPC v44 no está migrada). NO es atómico. */
async function deleteProtocolsManual(
  supabase: any,
  protocolIds: string[],
  meta?: RecycleMeta,
): Promise<void> {
  if (!protocolIds?.length) return;

  // ── Leer todo para el snapshot ────────────────────────────────────────────
  const protocols   = await selectIn(supabase, 'protocols', 'id', protocolIds);
  const items        = await selectIn(supabase, 'protocol_items', 'protocol_id', protocolIds);
  const itemIds      = items.map(i => i.id);
  const itemToProto  = new Map<string, string>(items.map(i => [i.id, i.protocol_id]));
  const evidences    = await selectIn(supabase, 'evidences', 'protocol_item_id', itemIds);
  const approvals    = await selectIn(supabase, 'protocol_approvals', 'protocol_id', protocolIds);
  const ncs          = await selectIn(supabase, 'non_conformities', 'protocol_id', protocolIds);
  const equip        = await selectIn(supabase, 'protocol_equipment', 'protocol_id', protocolIds);
  const annotations  = await selectIn(supabase, 'plan_annotations', 'protocol_id', protocolIds);
  const annIds       = annotations.map(a => a.id);
  const annToProto   = new Map<string, string>(annotations.map(a => [a.id, a.protocol_id]));
  const comments     = await selectIn(supabase, 'annotation_comments', 'annotation_id', annIds);
  const commentIds   = comments.map(c => c.id);
  const commentToProto = new Map<string, string>(comments.map(c => [c.id, annToProto.get(c.annotation_id) ?? '']));
  const photos       = await selectIn(supabase, 'annotation_comment_photos', 'annotation_comment_id', commentIds);
  const summaries    = await selectIn(supabase, 'protocol_summary_rows', 'protocol_id', protocolIds);

  const templateIds = Array.from(new Set(protocols.map(p => p.template_id).filter(Boolean)));
  const templates = await selectIn(supabase, 'protocol_templates', 'id', templateIds as string[], 'id, name');
  const tplName = new Map<string, string>(templates.map(t => [t.id, t.name]));
  const summaryByProto = new Map<string, any>(summaries.map(s => [s.protocol_id, s]));

  const group = (rows: any[], keyOf: (r: any) => string) => {
    const m = new Map<string, any[]>();
    for (const r of rows) { const k = keyOf(r); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
    return m;
  };
  const itemsBy   = group(items, r => r.protocol_id);
  const evBy      = group(evidences, r => itemToProto.get(r.protocol_item_id) ?? '');
  const apprBy    = group(approvals, r => r.protocol_id);
  const ncBy      = group(ncs, r => r.protocol_id);
  const equipBy   = group(equip, r => r.protocol_id);
  const annBy     = group(annotations, r => r.protocol_id);
  const commBy    = group(comments, r => annToProto.get(r.annotation_id) ?? '');
  const photoBy   = group(photos, r => commentToProto.get(r.annotation_comment_id) ?? '');

  // ── Guardar copias en la papelera (antes de borrar) ───────────────────────
  const now = Date.now();
  const recycleRows = protocols.map(p => {
    const sr = summaryByProto.get(p.id);
    const snapshot = {
      protocol: p,
      items: itemsBy.get(p.id) ?? [],
      evidences: evBy.get(p.id) ?? [],
      approvals: apprBy.get(p.id) ?? [],
      non_conformities: ncBy.get(p.id) ?? [],
      protocol_equipment: equipBy.get(p.id) ?? [],
      plan_annotations: annBy.get(p.id) ?? [],
      annotation_comments: commBy.get(p.id) ?? [],
      annotation_comment_photos: photoBy.get(p.id) ?? [],
      summary_row: sr ?? null,
    };
    return {
      id: `recycle-${p.id}-${p.updated_at ?? now}`,
      project_id: p.project_id,
      protocol_id: p.id,
      protocol_code: p.protocol_code ?? null,
      protocol_number: p.protocol_number ?? null,
      template_id: p.template_id ?? null,
      template_name: p.template_id ? (tplName.get(p.template_id) ?? null) : null,
      location_name: sr?.location_name ?? null,
      sector_name: sr?.sector_name ?? null,
      status: p.status ?? null,
      ensayo_date: p.ensayo_date ?? null,
      snapshot_json: snapshot,
      deleted_at: now,
      deleted_by_id: meta?.deletedById ?? null,
      deleted_by_name: meta?.deletedByName ?? null,
      created_at: now,
      updated_at: now,
    };
  });
  for (let i = 0; i < recycleRows.length; i += CHUNK) {
    const { error } = await supabase.from('recycle_bin').upsert(recycleRows.slice(i, i + CHUNK), { onConflict: 'id' });
    if (error && !isMissingRelation(error)) throw new Error(`[recycleDelete:recycle_bin] ${error.message}`);
  }

  // ── Hard delete en orden FK-seguro (incluye huérfanos) ────────────────────
  await deleteIn(supabase, 'annotation_comment_photos', 'annotation_comment_id', commentIds);
  await deleteIn(supabase, 'annotation_comments', 'annotation_id', annIds);
  await deleteIn(supabase, 'plan_annotations', 'protocol_id', protocolIds);
  await deleteIn(supabase, 'evidences', 'protocol_item_id', itemIds);
  await deleteIn(supabase, 'protocol_equipment', 'protocol_id', protocolIds);
  await deleteIn(supabase, 'non_conformities', 'protocol_id', protocolIds);
  await deleteIn(supabase, 'protocol_approvals', 'protocol_id', protocolIds);
  await deleteIn(supabase, 'protocol_items', 'protocol_id', protocolIds);
  await deleteIn(supabase, 'protocol_summary_rows', 'protocol_id', protocolIds);
  await deleteIn(supabase, 'protocols', 'id', protocolIds);
}
