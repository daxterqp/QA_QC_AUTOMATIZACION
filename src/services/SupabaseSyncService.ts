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
import * as FileSystem from 'expo-file-system';
import { supabase } from '@config/supabase';
import { downloadFromS3, listS3Keys } from './S3Service';
import { s3ProjectPrefix } from '@config/aws';
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
  phoneContactsCollection,
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
 * Prepara (sin ejecutar) las operaciones de merge: agrega/actualiza desde remoto.
 * NO elimina registros locales que no están en remoto — pueden ser registros
 * recién creados offline que aún no se sincronizaron con Supabase.
 */
function prepareOverride(collection: any, remoteRows: any[], localRows: any[]): any[] {
  const existingMap: Record<string, any> = {};
  for (const l of localRows) existingMap[l.id] = l;

  const prepares: any[] = [];

  for (const remote of remoteRows) {
    const local = existingMap[remote.id];
    if (!local) {
      prepares.push(
        collection.prepareCreate((rec: any) => {
          rec._raw.id = remote.id;
          Object.assign(rec._raw, remote);
        })
      );
    } else {
      prepares.push(
        local.prepareUpdate((rec: any) => {
          Object.assign(rec._raw, remote);
        })
      );
    }
  }

  return prepares;
}

/**
 * Como prepareOverride, pero normaliza file_uri al path local canónico del dispositivo.
 * Evita guardar en WatermelonDB el path del dispositivo que subió el PDF.
 */
function preparePlansOverride(collection: any, remoteRows: any[], localRows: any[]): any[] {
  const existingMap: Record<string, any> = {};
  for (const l of localRows) existingMap[l.id] = l;
  const prepares: any[] = [];

  for (const remote of remoteRows) {
    const localPath = `${FileSystem.documentDirectory}plans/${remote.name}.pdf`;
    const row = { ...remote, file_uri: localPath };
    const local = existingMap[remote.id];
    if (!local) {
      prepares.push(collection.prepareCreate((rec: any) => {
        rec._raw.id = remote.id;
        Object.assign(rec._raw, row);
      }));
    } else {
      prepares.push(local.prepareUpdate((rec: any) => {
        Object.assign(rec._raw, row);
      }));
    }
  }
  return prepares;
}

/** Upsert remoto: envía todos los raw rows a Supabase. Loguea errores pero no lanza. */
async function pushTable(table: string, rows: any[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
  if (error) {
    console.warn(`[push:${table}] ${error.message}`);
  }
}

/**
 * Empuja inmediatamente el estado de un protocolo a Supabase.
 * Llamar después de aprobar/rechazar/enviar para que el sync remoto no revierta el cambio local.
 */
export async function pushPhoneContact(contact: any): Promise<void> {
  try { await pushTable('phone_contacts', [toRow(contact._raw)]); } catch { /* sin red */ }
}

export async function deletePhoneContactRemote(contactId: string): Promise<void> {
  try { await supabase.from('phone_contacts').delete().eq('id', contactId); } catch { /* sin red */ }
}

export async function pullPhoneContacts(projectId: string): Promise<void> {
  const { data, error } = await supabase.from('phone_contacts').select('*').eq('project_id', projectId);
  if (error || !data) return;
  const local = await phoneContactsCollection.query(Q.where('project_id', projectId)).fetch();
  const prepares = prepareOverride(phoneContactsCollection, data, local);
  if (prepares.length > 0) await database.write(async () => { await database.batch(prepares); });
}

export async function pushProtocolStatus(protocol: any): Promise<void> {
  try {
    await pushTable('protocols', [toRow(protocol._raw)]);
  } catch { /* sin red, ignorar */ }
}

/**
 * Empuja un ítem de protocolo a Supabase inmediatamente.
 * Llamar después de cada guardado local para que el sync remoto no revierta el avance.
 */
export async function pushProtocolItem(item: any): Promise<void> {
  try {
    await pushTable('protocol_items', [toRow(item._raw)]);
  } catch { /* sin red, ignorar */ }
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
  const [locations, templates, protocols, plans, notes, accessRows, phoneContacts] = await Promise.all([
    locationsCollection.query(Q.where('project_id', projectId)).fetch(),
    protocolTemplatesCollection.query(Q.where('project_id', projectId)).fetch(),
    protocolsCollection.query(Q.where('project_id', projectId)).fetch(),
    plansCollection.query(Q.where('project_id', projectId)).fetch(),
    dashboardNotesCollection.query(Q.where('project_id', projectId)).fetch(),
    userProjectAccessCollection.query(Q.where('project_id', projectId)).fetch(),
    phoneContactsCollection.query(Q.where('project_id', projectId)).fetch(),
  ]);

  await pushTable('locations', locations.map((r) => toRow(r._raw)));
  await pushTable('protocol_templates', templates.map((r) => toRow(r._raw)));
  await pushTable('protocols', protocols.map((r) => toRow(r._raw)));
  await pushTable('plans', plans.map((r) => toRow(r._raw)));
  await pushTable('dashboard_notes', notes.map((r) => toRow(r._raw)));
  await pushTable('user_project_access', accessRows.map((r) => toRow(r._raw)));
  await pushTable('phone_contacts', phoneContacts.map((r) => toRow(r._raw)));
  pushed += locations.length + templates.length + protocols.length +
            plans.length + notes.length + accessRows.length + phoneContacts.length;

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
  // ── 1. Descarga todo desde Supabase (red, fuera del write lock) ───────────

  const fetchAll = async (table: string, col: string, val: string) => {
    const { data, error } = await supabase.from(table).select('*').eq(col, val);
    if (error) { console.warn(`[pull:${table}] ${error.message}`); return []; }
    return data ?? [];
  };
  const fetchIn = async (table: string, col: string, ids: string[]) => {
    if (ids.length === 0) return [];
    const { data, error } = await supabase.from(table).select('*').in(col, ids);
    if (error) { console.warn(`[pull:${table}] ${error.message}`); return []; }
    return data ?? [];
  };

  const { data: remoteProject, error: projErr } = await supabase
    .from('projects').select('*').eq('id', projectId);
  if (projErr) throw new Error(`[pull:projects] ${projErr.message}`);

  const [remoteLocations, remoteTemplates, remoteProtocols, remotePlans, remoteNotes, remoteAccess, remotePhoneContacts] =
    await Promise.all([
      fetchAll('locations',            'project_id', projectId),
      fetchAll('protocol_templates',   'project_id', projectId),
      fetchAll('protocols',            'project_id', projectId),
      fetchAll('plans',                'project_id', projectId),
      fetchAll('dashboard_notes',      'project_id', projectId),
      fetchAll('user_project_access',  'project_id', projectId),
      fetchAll('phone_contacts',       'project_id', projectId),
    ]);

  const tIds    = remoteTemplates.map((t: any) => t.id);
  const pIds    = remoteProtocols.map((p: any) => p.id);
  const planIds = remotePlans.map((p: any) => p.id);

  const [remoteTemplateItems, remotePItems, remoteNonConfs, remoteAnnotations] = await Promise.all([
    fetchIn('protocol_template_items', 'template_id', tIds),
    fetchIn('protocol_items',          'protocol_id', pIds),
    fetchIn('non_conformities',        'protocol_id', pIds),
    fetchIn('plan_annotations',        'plan_id',     planIds),
  ]);

  const iIds = remotePItems.map((i: any) => i.id);
  const aIds = remoteAnnotations.map((a: any) => a.id);
  const [remoteEvidences, remoteComments] = await Promise.all([
    fetchIn('evidences',           'protocol_item_id', iIds),
    fetchIn('annotation_comments', 'annotation_id',    aIds),
  ]);
  const cIds = remoteComments.map((c: any) => c.id);
  const remoteCommentPhotos = await fetchIn('annotation_comment_photos', 'annotation_comment_id', cIds);

  // ── 2. Lee locales + aplica cambios en una sola write transaction ─────────
  // database.write() serializa con otros writes y da acceso exclusivo al DB.

  return database.write(async () => {
    const [
      localProject, localLocs, localTemplates, localProtocols, localPlans, localNotes, localAccess, localPhoneContacts,
      localTemplateItems, localPItems, localNonConfs, localAnnotations,
      localEvidences, localComments, localCommentPhotos,
    ] = await Promise.all([
      projectsCollection.query(Q.where('id', projectId)).fetch(),
      locationsCollection.query(Q.where('project_id', projectId)).fetch(),
      protocolTemplatesCollection.query(Q.where('project_id', projectId)).fetch(),
      protocolsCollection.query(Q.where('project_id', projectId)).fetch(),
      plansCollection.query(Q.where('project_id', projectId)).fetch(),
      dashboardNotesCollection.query(Q.where('project_id', projectId)).fetch(),
      userProjectAccessCollection.query(Q.where('project_id', projectId)).fetch(),
      phoneContactsCollection.query(Q.where('project_id', projectId)).fetch(),
      tIds.length > 0
        ? protocolTemplateItemsCollection.query(Q.where('template_id', Q.oneOf(tIds))).fetch()
        : Promise.resolve([]),
      pIds.length > 0
        ? protocolItemsCollection.query(Q.where('protocol_id', Q.oneOf(pIds))).fetch()
        : Promise.resolve([]),
      pIds.length > 0
        ? nonConformitiesCollection.query(Q.where('protocol_id', Q.oneOf(pIds))).fetch()
        : Promise.resolve([]),
      planIds.length > 0
        ? planAnnotationsCollection.query(Q.where('plan_id', Q.oneOf(planIds))).fetch()
        : Promise.resolve([]),
      iIds.length > 0
        ? evidencesCollection.query(Q.where('protocol_item_id', Q.oneOf(iIds))).fetch()
        : Promise.resolve([]),
      aIds.length > 0
        ? annotationCommentsCollection.query(Q.where('annotation_id', Q.oneOf(aIds))).fetch()
        : Promise.resolve([]),
      cIds.length > 0
        ? annotationCommentPhotosCollection.query(Q.where('annotation_comment_id', Q.oneOf(cIds))).fetch()
        : Promise.resolve([]),
    ]);

    const allPrepares = [
      ...prepareOverride(projectsCollection,              remoteProject ?? [],  localProject),
      ...prepareOverride(locationsCollection,             remoteLocations,      localLocs),
      ...prepareOverride(protocolTemplatesCollection,     remoteTemplates,      localTemplates),
      ...prepareOverride(protocolsCollection,             remoteProtocols,      localProtocols),
      ...preparePlansOverride(plansCollection,             remotePlans,          localPlans),
      ...prepareOverride(dashboardNotesCollection,        remoteNotes,          localNotes),
      ...prepareOverride(userProjectAccessCollection,     remoteAccess,         localAccess),
      ...prepareOverride(phoneContactsCollection,         remotePhoneContacts,  localPhoneContacts),
      ...prepareOverride(protocolTemplateItemsCollection, remoteTemplateItems,  localTemplateItems),
      ...prepareOverride(protocolItemsCollection,         remotePItems,         localPItems),
      ...prepareOverride(nonConformitiesCollection,       remoteNonConfs,       localNonConfs),
      ...prepareOverride(planAnnotationsCollection,       remoteAnnotations,    localAnnotations),
      ...prepareOverride(evidencesCollection,             remoteEvidences,      localEvidences),
      ...prepareOverride(annotationCommentsCollection,    remoteComments,       localComments),
      ...prepareOverride(annotationCommentPhotosCollection, remoteCommentPhotos, localCommentPhotos),
    ];

    if (allPrepares.length > 0) await database.batch(allPrepares);
    return allPrepares.length;
  });
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
 * Pushea solo los planes de un proyecto a Supabase.
 * Llamar inmediatamente después de crear/modificar registros de planes localmente
 * para que el siguiente pull (cloud-wins) no los destruya.
 */
export async function pushPlansToSupabase(projectId: string): Promise<void> {
  const plans = await plansCollection.query(Q.where('project_id', projectId)).fetch();
  if (plans.length > 0) {
    await pushTable('plans', plans.map((r) => toRow((r as any)._raw)));
  }
}

/** Descarga en segundo plano los DWGs del proyecto que no existen en el filesystem del dispositivo */
async function downloadMissingDwgsForProject(projectId: string): Promise<void> {
  const projects = await projectsCollection.query(Q.where('id', projectId)).fetch();
  if (projects.length === 0) return;
  const projectName = (projects[0] as any).name as string;

  const prefix = s3ProjectPrefix(projectName);
  const destDir = `${FileSystem.documentDirectory}plansdwg/`;
  try { await FileSystem.makeDirectoryAsync(destDir, { intermediates: true }); } catch { /* ya existe */ }

  try {
    const keys = await listS3Keys(`${prefix}/plansdwg/`);
    for (const key of keys) {
      const fileName = key.split('/').pop();
      if (!fileName) continue;
      const localUri = `${destDir}${fileName}`;
      const info = await FileSystem.getInfoAsync(localUri).catch(() => ({ exists: false }));
      if (info.exists) continue;
      try { await downloadFromS3(key, localUri); } catch { /* sin S3 o sin conectividad */ }
    }
  } catch { /* sin conectividad */ }
}

/** Descarga en segundo plano los PDFs de planes que no existen en el filesystem del dispositivo */
async function downloadMissingPlansForProject(projectId: string): Promise<void> {
  const projects = await projectsCollection.query(Q.where('id', projectId)).fetch();
  if (projects.length === 0) return;
  const projectName = (projects[0] as any).name as string;

  const plans = await plansCollection.query(Q.where('project_id', projectId)).fetch();
  if (plans.length === 0) return;

  const prefix = s3ProjectPrefix(projectName);
  const destDir = `${FileSystem.documentDirectory}plans/`;
  try { await FileSystem.makeDirectoryAsync(destDir, { intermediates: true }); } catch { /* ya existe */ }

  for (const plan of plans) {
    const fileName = (plan as any).name + '.pdf';
    const localUri = `${destDir}${fileName}`;
    try {
      const info = await FileSystem.getInfoAsync(localUri);
      if (info.exists) continue;
      await downloadFromS3(`${prefix}/plans/${fileName}`, localUri);
    } catch { /* sin S3 o sin conectividad, ignorar */ }
  }
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
      // Push primero para que los datos locales (ej: is_na, has_answer) no sean
      // sobreescritos por el pull con datos más viejos de Supabase
      await pushProject(projectId).catch(() => {});
      pulled = await pullProject(projectId);
      downloadMissingPhotosForProject(projectId).catch(() => {});
      downloadMissingPlansForProject(projectId).catch(() => {});
      downloadMissingDwgsForProject(projectId).catch(() => {});
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
    const existingLocal = await usersCollection.query().fetch();
    const existingIds = new Set(existingLocal.map((u: any) => u.id));
    const toCreate = remoteUsers.filter((r: any) => !existingIds.has(r.id));
    if (toCreate.length > 0) {
      await database.write(async () => {
        const prepares = toCreate.map((r: any) =>
          usersCollection.prepareCreate((u: any) => {
            u._raw.id = r.id;
            Object.assign(u._raw, r);
          })
        );
        await database.batch(...prepares);
      });
    }
  }
}

/**
 * Sube un usuario individual a Supabase (llamar después de crear/modificar un usuario).
 */
/**
 * En reinstalación: busca en Supabase todos los proyectos del usuario
 * (por user_project_access y por created_by_id) y los descarga localmente.
 */
export async function restoreUserProjectsFromCloud(userId: string, role?: string): Promise<void> {
  try {
    const projectIds = new Set<string>();

    if (role === 'CREATOR') {
      // CREATOR ve todos los proyectos
      const { data, error } = await supabase.from('projects').select('id');
      console.log('[restore] CREATOR query → data:', JSON.stringify(data), 'error:', JSON.stringify(error));
      for (const p of data ?? []) projectIds.add(p.id);
    } else {
      // Otros roles: proyectos por acceso o por creación
      const [accessRes, createdRes] = await Promise.all([
        supabase.from('user_project_access').select('project_id').eq('user_id', userId),
        supabase.from('projects').select('id').eq('created_by_id', userId),
      ]);
      for (const a of accessRes.data ?? []) projectIds.add(a.project_id);
      for (const p of createdRes.data ?? []) projectIds.add(p.id);
    }

    // Borrar localmente proyectos que ya no existen en Supabase
    const localProjects = await projectsCollection.query().fetch();
    const toDeleteLocally = localProjects.filter((p) => !projectIds.has(p.id));
    if (toDeleteLocally.length > 0) {
      console.log(`[restore] borrando ${toDeleteLocally.length} proyectos obsoletos localmente`);
      await database.write(async () => {
        for (const p of toDeleteLocally) {
          await p.destroyPermanently();
        }
      });
    }

    // Pulls secuenciales para evitar deadlock en WatermelonDB async mode
    for (const id of Array.from(projectIds)) {
      await pullProjectFromCloud(id).catch(() => {});
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
