/**
 * SupabaseSyncService
 *
 * Push: sube todos los registros locales del proyecto a Supabase (upsert por id).
 * Pull: descarga todos los registros remotos del proyecto y los inserta/actualiza
 *       en WatermelonDB local (gana el registro con updated_at más reciente).
 *
 * Uso:
 *   const result = await syncProject(projectId);
 */

import { Q } from '@nozbe/watermelondb';
import { supabase } from '@config/supabase';
import { downloadMissingPhotosForProject } from './S3PhotoDownloader';
import {
  database,
  usersCollection,
  projectsCollection,
  userProjectAccessCollection,
  locationsCollection,
  protocolTemplatesCollection,
  protocolTemplateItemsCollection,
  protocolsCollection,
  protocolItemsCollection,
  evidencesCollection,
  nonConformitiesCollection,
  plansCollection,
  planAnnotationsCollection,
  annotationCommentsCollection,
  annotationCommentPhotosCollection,
  dashboardNotesCollection,
} from '@db/index';

export interface SyncResult {
  pushed: number;
  pulled: number;
  errors: string[];
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Limpia los campos internos de WatermelonDB antes de enviar a Supabase */
function toRow(raw: any): any {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _status, _changed, ...rest } = raw;
  return rest;
}

/**
 * Upsert local: para cada registro remoto, crea o actualiza en WatermelonDB.
 * Gana el updated_at más reciente.
 */
async function upsertLocal(collection: any, remoteRows: any[]): Promise<number> {
  if (remoteRows.length === 0) return 0;

  const ids = remoteRows.map((r) => r.id);
  const existing = await collection.query(Q.where('id', Q.oneOf(ids))).fetch();
  const existingMap: Record<string, any> = {};
  for (const rec of existing) existingMap[rec.id] = rec;

  const prepares: any[] = [];

  for (const remote of remoteRows) {
    const local = existingMap[remote.id];
    if (!local) {
      // Crear nuevo
      prepares.push(
        collection.prepareCreate((rec: any) => {
          rec._raw.id = remote.id;
          Object.assign(rec._raw, remote);
        })
      );
    } else if (remote.updated_at > local._raw.updated_at) {
      // Actualizar si el remoto es más nuevo
      prepares.push(
        local.prepareUpdate((rec: any) => {
          Object.assign(rec._raw, remote);
        })
      );
    }
  }

  if (prepares.length > 0) await database.batch(...prepares);
  return prepares.length;
}

/** Upsert remoto: envía todos los raw rows a Supabase */
async function pushTable(table: string, rows: any[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`[push:${table}] ${error.message}`);
}

// ─── push ───────────────────────────────────────────────────────────────────

async function pushProject(projectId: string): Promise<number> {
  let pushed = 0;

  // 1. Proyecto — usar query para evitar excepción si aún no existe localmente
  const projRes = await projectsCollection.query(Q.where('id', projectId)).fetch();
  if (projRes.length === 0) return 0; // no existe localmente, nada que empujar
  const project = projRes[0];
  await pushTable('projects', [toRow(project._raw)]);
  pushed++;

  // 2. Tablas directamente ligadas al proyecto
  const [locations, templates, protocols, plans, notes, accessRows] = await Promise.all([
    locationsCollection.query(Q.where('project_id', projectId)).fetch(),
    protocolTemplatesCollection.query(Q.where('project_id', projectId)).fetch(),
    protocolsCollection.query(Q.where('project_id', projectId)).fetch(),
    plansCollection.query(Q.where('project_id', projectId)).fetch(),
    dashboardNotesCollection.query(Q.where('project_id', projectId)).fetch(),
    userProjectAccessCollection.query(Q.where('project_id', projectId)).fetch(),
  ]);

  await pushTable('locations', locations.map((r) => toRow(r._raw)));
  await pushTable('protocol_templates', templates.map((r) => toRow(r._raw)));
  await pushTable('protocols', protocols.map((r) => toRow(r._raw)));
  await pushTable('plans', plans.map((r) => toRow(r._raw)));
  await pushTable('dashboard_notes', notes.map((r) => toRow(r._raw)));
  await pushTable('user_project_access', accessRows.map((r) => toRow(r._raw)));
  pushed += locations.length + templates.length + protocols.length +
            plans.length + notes.length + accessRows.length;

  // 3. Hijos de templates
  if (templates.length > 0) {
    const templateIds = templates.map((t) => t.id);
    const templateItems = await protocolTemplateItemsCollection
      .query(Q.where('template_id', Q.oneOf(templateIds)))
      .fetch();
    await pushTable('protocol_template_items', templateItems.map((r) => toRow(r._raw)));
    pushed += templateItems.length;
  }

  // 4. Hijos de protocols
  if (protocols.length > 0) {
    const protocolIds = protocols.map((p) => p.id);

    const [protocolItems, nonConformities] = await Promise.all([
      protocolItemsCollection.query(Q.where('protocol_id', Q.oneOf(protocolIds))).fetch(),
      nonConformitiesCollection.query(Q.where('protocol_id', Q.oneOf(protocolIds))).fetch(),
    ]);

    await pushTable('protocol_items', protocolItems.map((r) => toRow(r._raw)));
    await pushTable('non_conformities', nonConformities.map((r) => toRow(r._raw)));
    pushed += protocolItems.length + nonConformities.length;

    // 5. Evidencias (hijos de protocol_items)
    if (protocolItems.length > 0) {
      const itemIds = protocolItems.map((i) => i.id);
      const evidences = await evidencesCollection
        .query(Q.where('protocol_item_id', Q.oneOf(itemIds)))
        .fetch();
      await pushTable('evidences', evidences.map((r) => toRow(r._raw)));
      pushed += evidences.length;
    }
  }

  // 6. Hijos de plans (anotaciones)
  if (plans.length > 0) {
    const planIds = plans.map((p) => p.id);
    const annotations = await planAnnotationsCollection
      .query(Q.where('plan_id', Q.oneOf(planIds)))
      .fetch();
    await pushTable('plan_annotations', annotations.map((r) => toRow(r._raw)));
    pushed += annotations.length;

    // 7. Comentarios de anotaciones
    if (annotations.length > 0) {
      const annotationIds = annotations.map((a) => a.id);
      const comments = await annotationCommentsCollection
        .query(Q.where('annotation_id', Q.oneOf(annotationIds)))
        .fetch();
      await pushTable('annotation_comments', comments.map((r) => toRow(r._raw)));
      pushed += comments.length;

      // 8. Fotos de comentarios
      if (comments.length > 0) {
        const commentIds = comments.map((c) => c.id);
        const commentPhotos = await annotationCommentPhotosCollection
          .query(Q.where('annotation_comment_id', Q.oneOf(commentIds)))
          .fetch();
        await pushTable('annotation_comment_photos', commentPhotos.map((r) => toRow(r._raw)));
        pushed += commentPhotos.length;
      }
    }
  }

  return pushed;
}

// ─── pull ───────────────────────────────────────────────────────────────────

async function pullProject(projectId: string): Promise<number> {
  let pulled = 0;

  // Helper para fetch paginado de Supabase (máx 1000 filas por llamada)
  const fetchAll = async (table: string, column: string, value: string) => {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(column, value);
    if (error) throw new Error(`[pull:${table}] ${error.message}`);
    return data ?? [];
  };

  // 1. Proyecto
  const { data: projectData, error: projError } = await supabase
    .from('projects').select('*').eq('id', projectId);
  if (projError) throw new Error(`[pull:projects] ${projError.message}`);
  pulled += await upsertLocal(projectsCollection, projectData ?? []);

  // 2. Tablas directas por project_id
  const [
    remoteLocations,
    remoteTemplates,
    remoteProtocols,
    remotePlans,
    remoteNotes,
    remoteAccess,
  ] = await Promise.all([
    fetchAll('locations', 'project_id', projectId),
    fetchAll('protocol_templates', 'project_id', projectId),
    fetchAll('protocols', 'project_id', projectId),
    fetchAll('plans', 'project_id', projectId),
    fetchAll('dashboard_notes', 'project_id', projectId),
    fetchAll('user_project_access', 'project_id', projectId),
  ]);

  pulled += await upsertLocal(locationsCollection, remoteLocations);
  pulled += await upsertLocal(protocolTemplatesCollection, remoteTemplates);
  pulled += await upsertLocal(protocolsCollection, remoteProtocols);
  pulled += await upsertLocal(plansCollection, remotePlans);
  pulled += await upsertLocal(dashboardNotesCollection, remoteNotes);
  pulled += await upsertLocal(userProjectAccessCollection, remoteAccess);

  // 3. Template items
  if (remoteTemplates.length > 0) {
    const tIds = remoteTemplates.map((t: any) => t.id);
    const { data: tItems } = await supabase
      .from('protocol_template_items').select('*').in('template_id', tIds);
    pulled += await upsertLocal(protocolTemplateItemsCollection, tItems ?? []);
  }

  // 4. Protocol items + non conformities
  if (remoteProtocols.length > 0) {
    const pIds = remoteProtocols.map((p: any) => p.id);

    const [{ data: pItems }, { data: nonConfs }] = await Promise.all([
      supabase.from('protocol_items').select('*').in('protocol_id', pIds),
      supabase.from('non_conformities').select('*').in('protocol_id', pIds),
    ]);

    pulled += await upsertLocal(protocolItemsCollection, pItems ?? []);
    pulled += await upsertLocal(nonConformitiesCollection, nonConfs ?? []);

    // 5. Evidencias
    if ((pItems ?? []).length > 0) {
      const iIds = (pItems ?? []).map((i: any) => i.id);
      const { data: evs } = await supabase
        .from('evidences').select('*').in('protocol_item_id', iIds);
      pulled += await upsertLocal(evidencesCollection, evs ?? []);
    }
  }

  // 6. Anotaciones de planos
  if (remotePlans.length > 0) {
    const planIds = remotePlans.map((p: any) => p.id);
    const { data: annotations } = await supabase
      .from('plan_annotations').select('*').in('plan_id', planIds);
    pulled += await upsertLocal(planAnnotationsCollection, annotations ?? []);

    // 7. Comentarios
    if ((annotations ?? []).length > 0) {
      const aIds = (annotations ?? []).map((a: any) => a.id);
      const { data: comments } = await supabase
        .from('annotation_comments').select('*').in('annotation_id', aIds);
      pulled += await upsertLocal(annotationCommentsCollection, comments ?? []);

      // 8. Fotos de comentarios
      if ((comments ?? []).length > 0) {
        const cIds = (comments ?? []).map((c: any) => c.id);
        const { data: cPhotos } = await supabase
          .from('annotation_comment_photos').select('*').in('annotation_comment_id', cIds);
        pulled += await upsertLocal(annotationCommentPhotosCollection, cPhotos ?? []);
      }
    }
  }

  return pulled;
}

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Sincroniza un proyecto completo con Supabase.
 * Primero push (local → cloud) luego pull (cloud → local).
 */
export async function syncProject(projectId: string): Promise<SyncResult> {
  const errors: string[] = [];
  let pushed = 0;
  let pulled = 0;

  try {
    pushed = await pushProject(projectId);
  } catch (e: any) {
    errors.push(`Push: ${e.message}`);
  }

  try {
    pulled = await pullProject(projectId);
  } catch (e: any) {
    errors.push(`Pull: ${e.message}`);
  }

  return { pushed, pulled, errors };
}

/**
 * Solo push (útil al guardar datos de campo sin esperar pull).
 */
export async function pushProjectToSupabase(projectId: string): Promise<SyncResult> {
  const errors: string[] = [];
  let pushed = 0;

  try {
    pushed = await pushProject(projectId);
  } catch (e: any) {
    errors.push(`Push: ${e.message}`);
  }

  return { pushed, pulled: 0, errors };
}

/**
 * Descarga un proyecto completo desde Supabase al dispositivo local.
 * Deduplicación: si ya hay un pull en curso para el mismo projectId,
 * reutiliza la misma Promise en vez de lanzar una segunda escritura concurrente.
 */
const _activePulls = new Map<string, Promise<SyncResult>>();

export function pullProjectFromCloud(projectId: string): Promise<SyncResult> {
  if (_activePulls.has(projectId)) {
    return _activePulls.get(projectId)!;
  }

  const promise = (async (): Promise<SyncResult> => {
    const errors: string[] = [];
    let pulled = 0;
    try {
      pulled = await pullProject(projectId);
      downloadMissingPhotosForProject(projectId).catch(() => {});
    } catch (e: any) {
      errors.push(`Pull: ${e.message}`);
    }
    return { pushed: 0, pulled, errors };
  })();

  _activePulls.set(projectId, promise);
  promise.finally(() => _activePulls.delete(projectId));
  return promise;
}

/**
 * Busca un proyecto en Supabase por nombre (case-insensitive).
 * Devuelve el raw row o null si no existe.
 */
export async function findProjectInSupabase(name: string): Promise<Record<string, any> | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .ilike('name', name.trim());

  if (error || !data || data.length === 0) return null;
  return data[0];
}

/**
 * Sincroniza usuarios globalmente (push local → cloud, pull cloud → local).
 * No requiere projectId porque los usuarios son globales.
 */
export async function syncAllUsers(): Promise<void> {
  // Push todos los usuarios locales a Supabase
  const localUsers = await usersCollection.query().fetch();
  if (localUsers.length > 0) {
    await supabase
      .from('users')
      .upsert(localUsers.map((u) => toRow((u as any)._raw)), { onConflict: 'id' });
  }

  // Pull todos los usuarios de Supabase que no existan localmente
  const { data: remoteUsers } = await supabase.from('users').select('*');
  if (remoteUsers && remoteUsers.length > 0) {
    await upsertLocal(usersCollection, remoteUsers);
  }
}

/**
 * Sube un usuario individual a Supabase (llamar después de crear/modificar un usuario).
 */
/**
 * En reinstalación: busca en Supabase todos los proyectos del usuario
 * (por user_project_access y por created_by_id) y los descarga localmente.
 */
export async function restoreUserProjectsFromCloud(userId: string): Promise<void> {
  try {
    const [accessRes, createdRes] = await Promise.all([
      supabase.from('user_project_access').select('project_id').eq('user_id', userId),
      supabase.from('projects').select('id').eq('created_by_id', userId),
    ]);

    const projectIds = new Set<string>();
    for (const a of accessRes.data ?? []) projectIds.add(a.project_id);
    for (const p of createdRes.data ?? []) projectIds.add(p.id);

    for (const projectId of projectIds) {
      pullProjectFromCloud(projectId).catch(() => {});
    }
  } catch { /* sin conectividad */ }
}

export async function pushUserToSupabase(userId: string): Promise<void> {
  try {
    const user = await usersCollection.find(userId);
    await supabase
      .from('users')
      .upsert([toRow((user as any)._raw)], { onConflict: 'id' });
  } catch { /* usuario no encontrado, ignorar */ }
}
