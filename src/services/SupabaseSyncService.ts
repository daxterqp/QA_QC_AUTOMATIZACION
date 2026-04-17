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
      // Preserve local_etag — it tracks which version we downloaded,
      // not what's in Supabase. If we overwrite it, we'd re-download unnecessarily.
      const preservedLocalEtag = local._raw.local_etag;
      prepares.push(local.prepareUpdate((rec: any) => {
        Object.assign(rec._raw, row);
        if (preservedLocalEtag) rec._raw.local_etag = preservedLocalEtag;
      }));
    }
  }
  return prepares;
}

/** Upsert remoto: envía todos los raw rows a Supabase. Retorna mensaje de error o null. */
async function pushTable(table: string, rows: any[]): Promise<string | null> {
  if (rows.length === 0) return null;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
  if (error) {
    const msg = `[push:${table}] ${error.message}`;
    console.warn(msg);
    return msg;
  }
  return null;
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

async function pushProject(projectId: string): Promise<{ pushed: number; errors: string[] }> {
  let pushed = 0;
  const errors: string[] = [];

  const collect = async (table: string, rows: any[]) => {
    const err = await pushTable(table, rows);
    if (err) errors.push(err);
  };

  // 1. Proyecto — usar query para evitar excepción si aún no existe localmente
  const projRes = await projectsCollection.query(Q.where('id', projectId)).fetch();
  if (projRes.length === 0) return { pushed: 0, errors };
  const project = projRes[0];
  await collect('projects', [toRow(project._raw)]);
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

  // Locations: skip records deleted from desktop (don't re-push)
  const { data: remoteLocData } = await supabase.from('locations').select('id').eq('project_id', projectId);
  const remoteLocIds = new Set((remoteLocData ?? []).map((r: { id: string }) => r.id));
  const locsToUpload = locations.filter((l: any) =>
    remoteLocIds.has(l.id) || l._raw._status === 'created'
  );
  await collect('locations', locsToUpload.map((r) => toRow(r._raw)));
  await collect('protocol_templates', templates.map((r) => toRow(r._raw)));

  // For protocols: only push if local updated_at is newer than remote
  // This prevents overwriting approvals/rejections made from desktop/web
  // Also skip records deleted from desktop (not in remote and not created offline)
  const { data: remoteProtocols } = await supabase
    .from('protocols').select('id, updated_at').eq('project_id', projectId);
  const remoteProtocolIdSet = new Set((remoteProtocols ?? []).map((rp: { id: string }) => rp.id));
  const remoteUpdatedMap: Record<string, number> = {};
  for (const rp of (remoteProtocols ?? []) as { id: string; updated_at: number | string }[]) {
    remoteUpdatedMap[rp.id] = typeof rp.updated_at === 'number' ? rp.updated_at : new Date(rp.updated_at).getTime();
  }
  const protocolsToUpload = protocols.filter((p: any) => {
    // Skip if deleted from desktop and not created offline
    if (!remoteProtocolIdSet.has(p.id) && p._raw._status !== 'created') return false;
    const localUpdated = typeof p._raw.updated_at === 'number' ? p._raw.updated_at : new Date(p._raw.updated_at).getTime();
    const remoteUpdated = remoteUpdatedMap[p.id] ?? 0;
    return localUpdated > remoteUpdated;
  });
  await collect('protocols', protocolsToUpload.map((r) => toRow(r._raw)));

  await collect('plans', plans.map((r) => toRow(r._raw)));
  await collect('dashboard_notes', notes.map((r) => toRow(r._raw)));
  await collect('user_project_access', accessRows.map((r) => toRow(r._raw)));
  await collect('phone_contacts', phoneContacts.map((r) => toRow(r._raw)));
  pushed += locsToUpload.length + templates.length + protocolsToUpload.length +
            plans.length + notes.length + accessRows.length + phoneContacts.length;

  // 3. Hijos de templates
  if (templates.length > 0) {
    const templateIds = templates.map((t) => t.id);
    const templateItems = await protocolTemplateItemsCollection
      .query(Q.where('template_id', Q.oneOf(templateIds)))
      .fetch();
    await collect('protocol_template_items', templateItems.map((r) => toRow(r._raw)));
    pushed += templateItems.length;
  }

  // 4. Hijos de protocols
  if (protocols.length > 0) {
    const protocolIds = protocols.map((p) => p.id);

    const [protocolItems, nonConformities] = await Promise.all([
      protocolItemsCollection.query(Q.where('protocol_id', Q.oneOf(protocolIds))).fetch(),
      nonConformitiesCollection.query(Q.where('protocol_id', Q.oneOf(protocolIds))).fetch(),
    ]);

    // For protocol_items: only push if local updated_at is newer than remote
    const piIds = protocolItems.map((i) => i.id);
    const remotePIMap: Record<string, number> = {};
    for (let c = 0; c < piIds.length; c += 50) {
      const batch = piIds.slice(c, c + 50);
      const { data: remotePIs } = await supabase.from('protocol_items').select('id, updated_at').in('id', batch);
      for (const ri of (remotePIs ?? []) as { id: string; updated_at: number | string }[]) {
        remotePIMap[ri.id] = typeof ri.updated_at === 'number' ? ri.updated_at : new Date(ri.updated_at).getTime();
      }
    }
    const remotePIIdSet = new Set(Object.keys(remotePIMap));
    const itemsToUpload = protocolItems.filter((i: any) => {
      // Skip if deleted from desktop and not created offline
      if (!remotePIIdSet.has(i.id) && i._raw._status !== 'created') return false;
      const localU = typeof i._raw.updated_at === 'number' ? i._raw.updated_at : new Date(i._raw.updated_at).getTime();
      return localU > (remotePIMap[i.id] ?? 0);
    });
    await collect('protocol_items', itemsToUpload.map((r) => toRow(r._raw)));
    await collect('non_conformities', nonConformities.map((r) => toRow(r._raw)));
    pushed += itemsToUpload.length + nonConformities.length;

    // 5. Evidencias (hijos de protocol_items)
    if (protocolItems.length > 0) {
      const itemIds = protocolItems.map((i) => i.id);
      const evidences = await evidencesCollection
        .query(Q.where('protocol_item_id', Q.oneOf(itemIds)))
        .fetch();
      await collect('evidences', evidences.map((r) => toRow(r._raw)));
      pushed += evidences.length;
    }
  }

  // 6. Hijos de plans (anotaciones)
  if (plans.length > 0) {
    const planIds = plans.map((p) => p.id);
    const annotations = await planAnnotationsCollection
      .query(Q.where('plan_id', Q.oneOf(planIds)))
      .fetch();
    // For annotations: only push if local updated_at is newer than remote
    const anIds = annotations.map((a) => a.id);
    const remoteAnMap: Record<string, number> = {};
    for (let c = 0; c < anIds.length; c += 50) {
      const batch = anIds.slice(c, c + 50);
      const { data: remoteAns } = await supabase.from('plan_annotations').select('id, updated_at').in('id', batch);
      for (const ra of (remoteAns ?? []) as { id: string; updated_at: number | string }[]) {
        remoteAnMap[ra.id] = typeof ra.updated_at === 'number' ? ra.updated_at : new Date(ra.updated_at).getTime();
      }
    }
    const annotationsToUpload = annotations.filter((a: any) => {
      const localU = typeof a._raw.updated_at === 'number' ? a._raw.updated_at : new Date(a._raw.updated_at).getTime();
      return localU > (remoteAnMap[a.id] ?? 0);
    });
    await collect('plan_annotations', annotationsToUpload.map((r) => toRow(r._raw)));
    pushed += annotationsToUpload.length;

    // 7. Comentarios de anotaciones
    if (annotationsToUpload.length > 0) {
      const annotationIds = annotationsToUpload.map((a) => a.id);
      const comments = await annotationCommentsCollection
        .query(Q.where('annotation_id', Q.oneOf(annotationIds)))
        .fetch();
      await collect('annotation_comments', comments.map((r) => toRow(r._raw)));
      pushed += comments.length;

      // 8. Fotos de comentarios
      if (comments.length > 0) {
        const commentIds = comments.map((c) => c.id);
        const commentPhotos = await annotationCommentPhotosCollection
          .query(Q.where('annotation_comment_id', Q.oneOf(commentIds)))
          .fetch();
        await collect('annotation_comment_photos', commentPhotos.map((r) => toRow(r._raw)));
        pushed += commentPhotos.length;
      }
    }
  }

  return { pushed, errors };
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

    // ── 3. Limpiar huérfanos: registros locales eliminados desde desktop ─────
    const remoteProtocolIdSet = new Set(remoteProtocols.map((p: any) => p.id));
    const remoteLocationIdSet = new Set(remoteLocations.map((l: any) => l.id));

    // Protocolos huérfanos (existen local pero no en Supabase, y no son offline-created)
    const orphanProtocols = localProtocols.filter(
      (p: any) => !remoteProtocolIdSet.has(p.id) && p._raw._status !== 'created'
    );

    if (orphanProtocols.length > 0) {
      const orphanPIds = orphanProtocols.map((p: any) => p.id);
      const orphanItems = await protocolItemsCollection
        .query(Q.where('protocol_id', Q.oneOf(orphanPIds))).fetch();
      const orphanItemIds = orphanItems.map((i: any) => i.id);
      const orphanEvidences = orphanItemIds.length > 0
        ? await evidencesCollection.query(Q.where('protocol_item_id', Q.oneOf(orphanItemIds))).fetch()
        : [];
      const orphanNonConfs = await nonConformitiesCollection
        .query(Q.where('protocol_id', Q.oneOf(orphanPIds))).fetch();

      const orphanDeletes = [
        ...orphanEvidences.map((e: any) => e.prepareDestroyPermanently()),
        ...orphanNonConfs.map((n: any) => n.prepareDestroyPermanently()),
        ...orphanItems.map((i: any) => i.prepareDestroyPermanently()),
        ...orphanProtocols.map((p: any) => p.prepareDestroyPermanently()),
      ];
      if (orphanDeletes.length > 0) {
        await database.batch(orphanDeletes);
        console.log(`[pull] Eliminados ${orphanDeletes.length} registros huérfanos (${orphanProtocols.length} protocolos)`);
      }
    }

    // Ubicaciones huérfanas
    const orphanLocations = localLocs.filter(
      (l: any) => !remoteLocationIdSet.has(l.id) && l._raw._status !== 'created'
    );
    if (orphanLocations.length > 0) {
      await database.batch(orphanLocations.map((l: any) => l.prepareDestroyPermanently()));
      console.log(`[pull] Eliminadas ${orphanLocations.length} ubicaciones huérfanas`);
    }

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

  // Push local changes first, then pull remote (cloud wins on pull)
  // pushProject now compares updated_at for protocols to avoid overwriting
  // changes made from desktop/web
  try {
    const result = await pushProject(projectId);
    pushed = result.pushed;
    errors.push(...result.errors);
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
    const result = await pushProject(projectId);
    pushed = result.pushed;
    errors.push(...result.errors);
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

/**
 * Descarga planes que faltan o cuyo ETag cambió (nueva versión).
 *
 * Anti-bucle:
 *   s3_etag    = ETag que viene de Supabase (lo que está en S3)
 *   local_etag = ETag del archivo que ya descargamos
 *   Si s3_etag === local_etag → mismo archivo → skip (0 transferencias)
 *   Si s3_etag !== local_etag → versión nueva → re-descargar → local_etag = s3_etag
 */
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
    const s3Etag    = (plan as any).s3Etag as string | null;
    const localEtag = (plan as any).localEtag as string | null;

    try {
      const info = await FileSystem.getInfoAsync(localUri);

      if (info.exists) {
        // File exists — check if version changed via ETag
        if (!s3Etag || s3Etag === localEtag) continue; // Same version or no ETag → skip
        // s3_etag differs from local_etag → new version → re-download
      }

      // Download (missing file or updated version)
      const s3Key = (plan as any).s3Key ?? `${prefix}/plans/${fileName}`;
      await downloadFromS3(s3Key, localUri);

      // Mark this version as downloaded so next sync skips it
      if (s3Etag) {
        await database.write(async () => {
          await plan.update((rec: any) => {
            rec.localEtag = s3Etag;
          });
        });
      }
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
        await database.batch(prepares);
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
