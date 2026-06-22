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
import { downloadFromS3, listS3Keys, deleteFromS3 } from './S3Service';
import { s3ProjectPrefix } from '@config/aws';
import { downloadMissingPhotosForProject } from './S3PhotoDownloader';
import { enqueue as enqueueSync } from '@services/SyncQueueService';
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
  labAuxTablesCollection,
  recycleBinCollection,
  samplesCollection,
  summaryRowsCollection,
  evidencesCollection,
  nonConformitiesCollection,
  plansCollection,
  planAnnotationsCollection,
  annotationCommentsCollection,
  annotationCommentPhotosCollection,
  dashboardNotesCollection,
  phoneContactsCollection,
  planMeasurementsCollection,
  protocolApprovalsCollection,
  equipmentCollection,
  protocolEquipmentCollection,
  projectSectorsCollection,
  activitiesCollection,
  equipmentActivitiesCollection,
  workShiftsCollection,
  sessionFormTemplatesCollection,
  sessionFormTemplateItemsCollection,
  workSessionsCollection,
  workSessionIntervalsCollection,
  workSessionFormItemsCollection,
  workSessionGpsPointsCollection,
  syncQueueCollection,
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

/** v42 — `xref_snapshot_json` es TEXT en WMDB pero JSONB en Supabase: parsear
 *  antes de subir (igual que summary_config_json / points_json) para no guardar
 *  un string escalar. */
function coerceProtocolRow(row: any): any {
  if (typeof row.xref_snapshot_json === 'string' && row.xref_snapshot_json.trim()) {
    try { row.xref_snapshot_json = JSON.parse(row.xref_snapshot_json); } catch { row.xref_snapshot_json = null; }
  } else {
    // Vacío/null → NO enviar la columna. Así los ensayos SIN llamados entre ensayos
    // sincronizan aunque v45 (la columna jsonb) aún no se haya corrido en Supabase;
    // solo los que realmente usan @código dependen de v45. (Misma lección que is_hidden.)
    delete row.xref_snapshot_json;
  }
  return row;
}

/** Columnas de `projects` administradas SOLO por la web/CREADOR (cloud-wins): el
 *  push masivo del móvil las omite para no pisar el valor fresco con uno viejo
 *  (y evitar corromper el JSONB). Su escritura desde el móvil va por la ruta
 *  dedicada (ProjectConfigScreen). Ver D8. */
const PROJECT_CLOUD_OWNED_COLS = [
  'feature_flags', 'map_tile_url',
  'orthophoto_s3_key', 'orthophoto_bounds_json', 'orthophoto_system', 'orthophoto_tiles_json',
  'sample_identifier', // v43 — id de proyecto para muestras (lo edita el CREADOR; propaga a todos)
];

/** Defensivo: filtra propiedades del remote row dejando solo las que existen
 *  en el schema local de WatermelonDB y coerciona tipos cuando el schema local
 *  declara `string` pero Supabase devuelve un object/array (caso típico: JSONB).
 *  - Columnas extra del remoto (web en schema más nuevo) se ignoran.
 *  - Columnas tipo string en local que reciben un object → se serializan a JSON
 *    (ej: `projects.feature_flags` es JSONB en Supabase, TEXT en WatermelonDB).
 *  El id y los timestamps base siempre se preservan. */
function filterToLocalSchema(collection: any, remote: any): any {
  try {
    const cols = collection.schema?.columnArray as Array<{ name: string; type: string }> | undefined;
    if (!cols || cols.length === 0) return remote; // fallback: no schema info
    const typeByName: Record<string, string> = {};
    for (const c of cols) typeByName[c.name] = c.type;
    typeByName.id = 'string';
    typeByName.created_at = 'number';
    typeByName.updated_at = 'number';
    const out: any = {};
    for (const k of Object.keys(remote)) {
      if (!(k in typeByName)) continue;
      let v = remote[k];
      // Coerción JSONB → string para columnas que el schema local declara string.
      if (typeByName[k] === 'string' && v != null && typeof v === 'object') {
        try { v = JSON.stringify(v); } catch { v = String(v); }
      }
      // D7 — Coerción defensiva boolean: si el schema local declara boolean
      // pero el remoto envía null/undefined (caso de protocolos pre-v26 antes
      // del backfill DEFAULT FALSE), WMDB rechaza el insert/update.
      // Defaulteamos a false explícitamente.
      if (typeByName[k] === 'boolean' && v == null) v = false;
      out[k] = v;
    }
    return out;
  } catch {
    return remote;
  }
}

/**
 * Prepara (sin ejecutar) las operaciones de merge: agrega/actualiza desde remoto.
 * NO elimina registros locales que no están en remoto — pueden ser registros
 * recién creados offline que aún no se sincronizaron con Supabase.
 */
/** v32b — Ejecuta prepares en un write; si el batch FALLA, limpia el
 *  _preparedState de cada prepare. Sin esto, un pull interrumpido deja
 *  instancias cacheadas "envenenadas" (el prepare huérfano bloquea updates y
 *  deletes futuros con "Cannot update/destroy a record with pending changes"). */
async function safeBatchWrite(prepares: any[]): Promise<void> {
  if (prepares.length === 0) return;
  try {
    await database.write(async () => { await database.batch(prepares); });
  } catch (e) {
    for (const pr of prepares) { try { (pr as any)._preparedState = null; } catch { /* noop */ } }
    throw e;
  }
}

function prepareOverride(collection: any, remoteRows: any[], localRows: any[]): any[] {
  const existingMap: Record<string, any> = {};
  for (const l of localRows) existingMap[l.id] = l;

  const prepares: any[] = [];

  for (const remoteRaw of remoteRows) {
    // Filtra a columnas conocidas del schema local — defensa contra columnas
    // nuevas en Supabase que el móvil aún no soporte en su schema (M2).
    const remote = filterToLocalSchema(collection, remoteRaw);
    const local = existingMap[remote.id];
    if (!local) {
      prepares.push(
        collection.prepareCreate((rec: any) => {
          rec._raw.id = remote.id;
          Object.assign(rec._raw, remote);
          rec._raw._status = 'synced';
          rec._raw._changed = '';
        })
      );
    } else {
      prepares.push(
        local.prepareUpdate((rec: any) => {
          Object.assign(rec._raw, remote);
          rec._raw._status = 'synced';
          rec._raw._changed = '';
        })
      );
    }
  }

  return prepares;
}

/**
 * v32 — Como prepareOverride, pero respeta filas locales MÁS FRESCAS que el
 * remoto (last-write-wins por fila, el MISMO criterio que usa filterByFreshness
 * en el push).
 *
 * Por qué: prepareOverride es cloud-wins incondicional. Eso pierde datos en dos
 * escenarios reales:
 *   1. `syncProject` hace push→pull, pero si el push FALLA (red, RLS) el pull
 *      corre igual y pisa los `comments` (¡los valores numéricos llenados!) con
 *      la versión vieja del remoto.
 *   2. `pullProjectFromCloud` (pull-only) se llama al abrir la lista de
 *      proyectos / ubicaciones — si hay ediciones offline sin pushear, las pisa.
 *
 * Con esta variante, una fila local con updated_at > remoto se CONSERVA (se
 * subirá en el próximo push). Si el remoto es más nuevo (edición desde web),
 * el remoto gana — igual que siempre.
 *
 * Se usa SOLO para las tablas con datos de campo del dominio de protocolos:
 * protocols, protocol_items, protocol_templates, protocol_template_items,
 * evidences, non_conformities. Las tablas administradas desde web (locations,
 * plans, settings, …) siguen cloud-wins.
 */
function prepareFreshOverride(collection: any, remoteRows: any[], localRows: any[]): any[] {
  const existingMap: Record<string, any> = {};
  for (const l of localRows) existingMap[l.id] = l;

  const toMs = (v: any): number => {
    if (typeof v === 'number') return v;
    if (v == null) return 0;
    const t = new Date(v).getTime();
    return isFinite(t) ? t : 0;
  };

  const prepares: any[] = [];
  for (const remoteRaw of remoteRows) {
    const remote = filterToLocalSchema(collection, remoteRaw);
    const local = existingMap[remote.id];
    if (!local) {
      prepares.push(
        collection.prepareCreate((rec: any) => {
          rec._raw.id = remote.id;
          Object.assign(rec._raw, remote);
          rec._raw._status = 'synced';
          rec._raw._changed = '';
        })
      );
      continue;
    }
    const localU = toMs(local._raw.updated_at);
    const remoteU = toMs(remote.updated_at);
    if (localU > remoteU) continue;   // local más fresco → lo sube el próximo push
    prepares.push(
      local.prepareUpdate((rec: any) => {
        Object.assign(rec._raw, remote);
        rec._raw._status = 'synced';
        rec._raw._changed = '';
      })
    );
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

  for (const remoteRaw of remoteRows) {
    const remote = filterToLocalSchema(collection, remoteRaw);
    const localPath = `${FileSystem.documentDirectory}plans/${remote.name}.pdf`;
    const row = { ...remote, file_uri: localPath };
    const local = existingMap[remote.id];
    if (!local) {
      prepares.push(collection.prepareCreate((rec: any) => {
        rec._raw.id = remote.id;
        Object.assign(rec._raw, row);
        rec._raw._status = 'synced';
        rec._raw._changed = '';
      }));
    } else {
      // Preserve local_etag — it tracks which version we downloaded,
      // not what's in Supabase. If we overwrite it, we'd re-download unnecessarily.
      const preservedLocalEtag = local._raw.local_etag;
      prepares.push(local.prepareUpdate((rec: any) => {
        Object.assign(rec._raw, row);
        if (preservedLocalEtag) rec._raw.local_etag = preservedLocalEtag;
        rec._raw._status = 'synced';
        rec._raw._changed = '';
      }));
    }
  }
  return prepares;
}

/**
 * Filtra rows locales por frescura: solo devuelve aquellos cuya updated_at local > updated_at remota.
 * Rows sin contraparte remota se consideran remote=0 (se incluyen salvo que `skipDeletedOnRemote` aplique).
 *
 * Opciones:
 * - `skipDeletedOnRemote`: omite rows ausentes del remoto cuyo _status !== 'created'
 *   (fueron eliminados desde desktop; no los re-subimos).
 * - `projectFilter`: consulta el remoto con .eq(col, val) para tablas con project_id.
 *   Sin el filter, consulta por lotes de 50 con .in('id', ids).
 */
async function filterByFreshness(
  table: string,
  localRows: any[],
  options?: {
    skipDeletedOnRemote?: boolean;
    projectFilter?: { col: string; val: string };
  }
): Promise<any[]> {
  if (localRows.length === 0) return [];
  const { skipDeletedOnRemote = false, projectFilter } = options ?? {};

  const remoteMap: Record<string, number> = {};
  const remoteSet = new Set<string>();

  try {
    if (projectFilter) {
      const { data } = await supabase
        .from(table)
        .select('id, updated_at')
        .eq(projectFilter.col, projectFilter.val);
      for (const r of (data ?? []) as { id: string; updated_at: number | string }[]) {
        remoteMap[r.id] = typeof r.updated_at === 'number' ? r.updated_at : new Date(r.updated_at).getTime();
        remoteSet.add(r.id);
      }
    } else {
      const ids = localRows.map((r) => r.id);
      for (let c = 0; c < ids.length; c += 50) {
        const batch = ids.slice(c, c + 50);
        const { data } = await supabase.from(table).select('id, updated_at').in('id', batch);
        for (const r of (data ?? []) as { id: string; updated_at: number | string }[]) {
          remoteMap[r.id] = typeof r.updated_at === 'number' ? r.updated_at : new Date(r.updated_at).getTime();
          remoteSet.add(r.id);
        }
      }
    }
  } catch (e) {
    console.warn(`[freshness:${table}] error consultando remoto, se sube todo:`, e);
    // Si falla la consulta remota, devolvemos todo (comportamiento conservador = subir).
    return localRows;
  }

  return localRows.filter((r: any) => {
    if (skipDeletedOnRemote && !remoteSet.has(r.id) && r._raw._status !== 'created') return false;
    const localU = typeof r._raw.updated_at === 'number'
      ? r._raw.updated_at
      : new Date(r._raw.updated_at).getTime();
    return localU > (remoteMap[r.id] ?? 0);
  });
}

// ─── v31 — Re-secuenciación de códigos correlativos (Parte E) ────────────────
// El índice único parcial `protocols_code_uniq_per_project` de Supabase es el
// guardián contra correlativos duplicados generados OFFLINE en 2 dispositivos.
// Al recibir 23505 de ESE índice (no confundir con el de external_id v21), se
// re-secuencia el código local y se reintenta UNA vez.

import { parseFeatureFlagsJson, mergeFeatureFlags, type GroupingPreset } from '@utils/featureFlags';
import { buildProtocolCode, nextSeq, parseEnsayoDate, pickMask, type SeqResetScope } from '@utils/protocolCode';

function isCodeUniqueViolation(error: { code?: string; message?: string; details?: string } | null | undefined): boolean {
  if (!error) return false;
  const txt = `${error.message ?? ''} ${error.details ?? ''}`;
  return error.code === '23505' && txt.includes('protocols_code_uniq');
}

// Mutex de módulo (promise-chain): el SyncWorker paraleliza ops del mismo tipo
// — sin serializar, N protocolos en colisión consultarían el max remoto a la
// vez y elegirían TODOS el mismo seq nuevo (volviendo a colisionar). Con el
// mutex, las re-secuenciaciones del drain corren de a una y convergen en un
// solo tick (cada una ve los códigos ya regenerados por las anteriores).
let codeReseqChain: Promise<unknown> = Promise.resolve();

/** Regenera el protocol_code del protocolo con el próximo seq LIBRE del ámbito
 *  (max remoto ∪ max local, incluidas filas offline pendientes). Devuelve true
 *  si se regeneró. */
async function resequenceProtocolCode(protocolId: string): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    const proto: any = await protocolsCollection.find(protocolId).catch(() => null);
    if (!proto?.protocolCode) return false;
    const project: any = await projectsCollection.find(proto.projectId).catch(() => null);
    const flags = parseFeatureFlagsJson(project?.featureFlags);
    const template: any = proto.templateId
      ? await protocolTemplatesCollection.find(proto.templateId).catch(() => null)
      : null;
    const tipo = (template?.idProtocolo ?? '').trim() || (template?.name ?? '').trim();
    // v46.1 — máscara por tipo (si existe) + ámbito de reinicio configurable.
    const mask = pickMask(flags.coding_mask_default, flags.coding_mask_by_type, tipo);
    const resetScope: SeqResetScope = flags.coding_seq_reset === 'year_sector' ? { sector: true }
      : flags.coding_seq_reset === 'year_month' ? { month: true } : {};
    if (!tipo || !mask) return false;
    const date = parseEnsayoDate(proto.ensayoDate) ?? new Date();
    let sectorName: string | null = null;
    if (proto.sectorId) {
      const sec: any = await projectSectorsCollection.find(proto.sectorId).catch(() => null);
      sectorName = sec?.name ?? null;
    }

    const { data: remoteData } = await supabase
      .from('protocols')
      .select('protocol_code')
      .eq('project_id', proto.projectId)
      .not('protocol_code', 'is', null);
    const remoteCodes = ((remoteData ?? []) as { protocol_code: string | null }[]).map(r => r.protocol_code);
    const locals = await protocolsCollection
      .query(Q.where('project_id', proto.projectId), Q.where('protocol_code', Q.notEq(null)))
      .fetch();
    const localCodes = locals
      .map((p: any) => p.protocolCode as string)
      .filter(c => c && c !== proto.protocolCode);   // el código propio en disputa no cuenta
    // v43.2 — También saltar los correlativos en la PAPELERA (eliminados): no reutilizarlos
    // evita colisiones futuras al subir (integridad de códigos).
    const recycled = await recycleBinCollection
      .query(Q.where('project_id', proto.projectId), Q.where('protocol_code', Q.notEq(null)))
      .fetch().catch(() => [] as any[]);
    const recycledCodes = recycled.map((r: any) => r.protocolCode as string).filter(Boolean);

    const seq = nextSeq([...remoteCodes, ...localCodes, ...recycledCodes], mask, tipo, date, sectorName, resetScope);
    const newCode = buildProtocolCode(mask, { tipo, date, seq, sector: sectorName });
    console.warn(`[reseq] código ${proto.protocolCode} en conflicto → ${newCode}`);
    await database.write(async () => {
      await proto.update((p: any) => { p.protocolCode = newCode; });
    });
    return true;
  };
  const next = codeReseqChain.then(run, run);
  codeReseqChain = next.catch(() => {});   // la cadena nunca queda rota
  return next;
}

/** Upsert remoto: envía los raw rows a Supabase en lotes de 200 (v32 — un push
 *  con cientos de protocol_items en un solo request puede exceder el límite de
 *  payload o el timeout; con lotes, un fallo parcial no tumba todo el push).
 *  Retorna mensaje de error (el primero) o null. */
async function pushTable(table: string, rows: any[]): Promise<string | null> {
  if (rows.length === 0) return null;
  const BATCH = 200;
  let firstError: string | null = null;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
    if (error) {
      // v31 — Colisión de código correlativo en lote: el batch entero fue
      // rechazado. Fallback fila-por-fila para aislar la(s) ofensora(s),
      // re-secuenciarlas y reintentarlas (el resto del lote no debe perderse).
      if (table === 'protocols' && isCodeUniqueViolation(error)) {
        for (const row of batch) {
          const { error: rowErr } = await supabase.from(table).upsert([row], { onConflict: 'id' });
          if (rowErr && isCodeUniqueViolation(rowErr)) {
            const ok = await resequenceProtocolCode(row.id).catch(() => false);
            if (ok) {
              const fresh: any = await protocolsCollection.find(row.id).catch(() => null);
              if (fresh) {
                const { error: e2 } = await supabase.from(table).upsert([toRow(fresh._raw)], { onConflict: 'id' });
                if (!e2) continue;
              }
            }
            if (!firstError) firstError = `[push:protocols] código duplicado en ${row.id}`;
          } else if (rowErr && !firstError) {
            firstError = `[push:${table}] fila ${row.id}: ${rowErr.message}`;
          }
        }
        continue;
      }
      // v42 — Blindaje pre-v45: si la columna xref_snapshot_json aún no existe en
      // Supabase, NO debe tumbar el push de protocolos (que cascadearía a items
      // por FK, como el viejo bug de is_hidden). Reintentamos el lote sin esa
      // columna (el ensayo sube; el snapshot de llamados se guardará tras v45).
      if (table === 'protocols' && /xref_snapshot_json/.test(error.message ?? '') && /column|does not exist|schema cache|PGRST204/i.test(error.message ?? '')) {
        const stripped = batch.map((r: any) => { const c = { ...r }; delete c.xref_snapshot_json; return c; });
        const { error: e2 } = await supabase.from(table).upsert(stripped, { onConflict: 'id' });
        if (!e2) { console.warn('[push:protocols] xref_snapshot_json omitido (falta v45)'); continue; }
      }
      const msg = `[push:${table}] lote ${i / BATCH + 1}: ${error.message}`;
      console.warn(msg);
      if (!firstError) firstError = msg;
      // Seguimos con los demás lotes: un row malo no debe bloquear el resto.
    }
  }
  return firstError;
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
  await safeBatchWrite(prepares);
}

export async function pushProtocolStatus(protocol: any): Promise<void> {
  try {
    await pushTable('protocols', [coerceProtocolRow(toRow(protocol._raw))]);
  } catch { /* sin red, ignorar */ }
}

// ─── v26 — GIS: helpers para project_sectors ─────────────────────────────────

/** Empuja un sector a Supabase. Mejor-esfuerzo (offline no rompe). Si el
 *  sector está soft-deleted localmente (D5), NO upsertear — sería resurrección.
 *  El path correcto del delete es enqueue de DELETE_PROJECT_SECTOR. */
export async function pushProjectSector(sector: any): Promise<void> {
  if (sector?._raw?._status === 'deleted') return;
  try { await pushTable('project_sectors', [toRow(sector._raw)]); } catch { /* sin red */ }
}

/** Borra un sector remoto. Asume que el caller ya hizo el delete local. */
export async function deleteProjectSectorRemote(sectorId: string): Promise<void> {
  try { await supabase.from('project_sectors').delete().eq('id', sectorId); } catch { /* sin red */ }
}

// ─── v43 — Muestras (módulo "ensayos por muestra") ───────────────────────────

/** Empuja una muestra a Supabase. Mejor-esfuerzo (offline no rompe). El
 *  `layer_info_json` es TEXT local → se parsea a objeto si Supabase lo espera JSONB
 *  (se deja como string; Supabase TEXT o JSONB lo acepta, parsear no es necesario). */
export async function pushSample(sample: any): Promise<void> {
  if (sample?._raw?._status === 'deleted') return;
  try { await pushTable('samples', [toRow(sample._raw)]); } catch { /* sin red */ }
}

/** Empuja una muestra por id (con throw → retry del SyncWorker). */
export async function pushSampleStrict(sampleId: string): Promise<void> {
  const s = await samplesCollection.find(sampleId).catch(() => null);
  if (!s) return;
  if (isLocalDeleted(s)) return;
  const err = await pushTable('samples', [toRow((s as any)._raw)]);
  if (err) throw new Error(`[pushSampleStrict] ${err}`);
}

/** Bajada de muestras de un proyecto + override local (fresh-override last-write-wins,
 *  para no perder muestras creadas localmente que aún no se pushearon). Propaga
 *  deletes remotos sobre filas locales ya `synced`. */
export async function pullSamples(projectId: string): Promise<void> {
  const { data, error } = await supabase.from('samples').select('*').eq('project_id', projectId);
  if (error || !data) return;
  const local = await samplesCollection.query(Q.where('project_id', projectId)).fetch();
  const remoteIds = new Set<string>(data.map((r: any) => r.id));
  const prepares: any[] = prepareFreshOverride(samplesCollection, data, local);
  for (const rec of local) {
    if ((rec as any)._raw?._status === 'synced' && !remoteIds.has(rec.id)) {
      prepares.push((rec as any).prepareDestroyPermanently());
    }
  }
  await safeBatchWrite(prepares);
}

// ─── v26 — Variantes Strict para el SyncWorker (con throw → retry) ──────────

/** Empuja un sector buscándolo por id local. Si no existe, no-op silencioso.
 *  D1 — `points_json` en WMDB es TEXT (string JSON) pero en Supabase es JSONB.
 *  Parseamos el string a array antes de enviar para que la web lo reciba
 *  directamente como `{lat,lng}[]` sin doble-encoding. */
export async function pushProjectSectorStrict(sectorId: string): Promise<void> {
  const sec = await projectSectorsCollection.find(sectorId).catch(() => null);
  if (!sec) return;
  if (isLocalDeleted(sec)) return;
  const row = toRow((sec as any)._raw);
  if (typeof row.points_json === 'string') {
    try { row.points_json = JSON.parse(row.points_json); }
    catch { row.points_json = null; }
  }
  const { error } = await supabase
    .from('project_sectors')
    .upsert([row], { onConflict: 'id' });
  if (error) throw new Error(`[pushProjectSectorStrict] ${error.message}`);
}

/** Borra un sector remoto. El caller debe haber soft-deleted o destroyed local
 *  antes. Si Supabase responde "row not found", se considera éxito silencioso. */
export async function deleteProjectSectorStrict(sectorId: string): Promise<void> {
  const { error } = await supabase.from('project_sectors').delete().eq('id', sectorId);
  if (error) throw new Error(`[deleteProjectSectorStrict] ${error.message}`);
}

/** ¿El error de Supabase es "la tabla/relación no existe"? (esquema parcial). */
function isMissingRelation(err: { message?: string } | null): boolean {
  return !!err && /relation|does not exist|could not find the table|schema cache/i.test(err.message ?? '');
}

/** v42 — Push de la fila de Tablas Resumen CON reintento (vía cola). Re-lee la
 *  fila local `summary_rows` del protocolo y la sube a Supabase (idempotente por
 *  protocol_id). Si la fila local ya no existe (ensayo borrado) → no-op. */
export async function pushSummaryRowStrict(protocolId: string): Promise<void> {
  const rows = await summaryRowsCollection.query(Q.where('protocol_id', protocolId)).fetch().catch(() => [] as any[]);
  const r: any = rows[0];
  if (!r) return;
  let values: any = {};
  try { values = JSON.parse(r.valuesJson ?? '{}'); } catch { values = {}; }
  const { error } = await supabase.from('protocol_summary_rows').upsert({
    project_id: r.projectId,
    template_id: r.templateId ?? null,
    protocol_id: protocolId,
    protocol_code: r.protocolCode ?? null,
    protocol_number: r.protocolNumber ?? null,
    ensayo_date: r.ensayoDate ?? null,
    sector_id: r.sectorId ?? null,
    sector_name: r.sectorName ?? null,
    location_id: r.locationId ?? null,
    location_name: r.locationName ?? null,
    status: r.status ?? null,
    values_json: values,
    updated_at: Date.now(),
  }, { onConflict: 'protocol_id' });
  if (error && !isMissingRelation(error)) throw new Error(`[pushSummaryRowStrict] ${error.message}`);
}

/** v43 — Papelera + Hard Delete.
 *
 *  Eliminación REMOTA DEFINITIVA de un ensayo que ANTES guarda una copia
 *  estática autocontenida en `recycle_bin` (papelera). Flujo:
 *    1. Lee el ensayo y TODAS sus relaciones de Supabase → snapshot_json.
 *    2. Inserta la copia en `recycle_bin` (historial de respaldo, solo lectura).
 *    3. Hard delete del protocolo y de TODAS sus relaciones (en orden FK-seguro),
 *       incluyendo lo que antes quedaba HUÉRFANO: anotaciones de plano + sus
 *       comentarios/fotos, equipos del protocolo, NC, y la fila de Tablas
 *       Resumen (protocol_summary_rows). Así el correlativo queda LIBERADO y el
 *       ensayo desaparece de todas las vistas/métricas.
 *
 *  Idempotente: los deletes por id/columna no fallan si la fila ya no existe;
 *  si la papelera ya tiene el id (reintento), el upsert no duplica. Las claves S3
 *  de las fotos quedan en el snapshot; los OBJETOS en S3 se borran aparte
 *  (best-effort) en el wrapper `deleteProtocolStrict`. El borrado LOCAL lo hace
 *  el caller. */
export async function deleteProtocolStrict(
  protocolId: string,
  meta?: { deletedById?: string | null; deletedByName?: string | null } | null,
): Promise<void> {
  // Guardia: nunca operar con un id vacío.
  if (!protocolId || !protocolId.trim()) return;

  // Recolectar claves S3 ANTES de borrar (después las filas ya no existen).
  const s3Keys = await collectProtocolS3Keys(protocolId).catch(() => [] as string[]);

  // Camino ROBUSTO (v44): función transaccional en Postgres → copia a papelera
  // + hard delete en UNA transacción atómica (o todo o nada; imposible dejar
  // tablas a medias). Si la función aún no está migrada, caemos al camino manual.
  const { error } = await supabase.rpc('delete_protocol_to_recycle', {
    p_protocol_id: protocolId,
    p_deleted_by_id: meta?.deletedById ?? null,
    p_deleted_by_name: meta?.deletedByName ?? null,
  });
  if (error) {
    const fnMissing = /could not find the function|does not exist|42883|schema cache/i.test(error.message ?? '');
    if (!fnMissing) throw new Error(`[deleteProtocolStrict:rpc] ${error.message}`);
    console.warn('[deleteProtocolStrict] RPC no migrada (v44) — usando camino manual no-transaccional.');
    await deleteProtocolManual(protocolId, meta);
  }
  // Limpieza S3 best-effort (la BD ya quedó consistente y respaldada).
  for (const k of s3Keys) await deleteFromS3(k);
}

/** Recolecta las claves S3 (fotos de evidencias + fotos de comentarios) de un
 *  ensayo, ANTES de borrar sus filas. Best-effort: ante error devuelve lo que
 *  haya juntado. */
async function collectProtocolS3Keys(protocolId: string): Promise<string[]> {
  const CHUNK = 100;
  const keys: string[] = [];
  try {
    const { data: items } = await supabase.from('protocol_items').select('id').eq('protocol_id', protocolId);
    const itemIds = ((items ?? []) as any[]).map(i => i.id);
    for (let i = 0; i < itemIds.length; i += CHUNK) {
      const { data: evs } = await supabase.from('evidences').select('s3_key, s3_url_placeholder').in('protocol_item_id', itemIds.slice(i, i + CHUNK));
      for (const e of (evs ?? []) as any[]) { const k = e.s3_key ?? e.s3_url_placeholder; if (k) keys.push(k); }
    }
    const { data: anns } = await supabase.from('plan_annotations').select('id').eq('protocol_id', protocolId);
    const annIds = ((anns ?? []) as any[]).map(a => a.id);
    for (let i = 0; i < annIds.length; i += CHUNK) {
      const { data: comments } = await supabase.from('annotation_comments').select('id').in('annotation_id', annIds.slice(i, i + CHUNK));
      const commentIds = ((comments ?? []) as any[]).map(c => c.id);
      for (let j = 0; j < commentIds.length; j += CHUNK) {
        const { data: photos } = await supabase.from('annotation_comment_photos').select('storage_path').in('annotation_comment_id', commentIds.slice(j, j + CHUNK));
        for (const p of (photos ?? []) as any[]) { if (p.storage_path) keys.push(p.storage_path); }
      }
    }
  } catch { /* best-effort */ }
  return keys;
}

/** Camino MANUAL (fallback si la RPC v44 no está migrada). NO es atómico: en
 *  caso de corte a mitad, queda un borrado parcial que converge en el reintento
 *  (todo es idempotente). Migra v44 para usar el camino transaccional. */
async function deleteProtocolManual(
  protocolId: string,
  meta?: { deletedById?: string | null; deletedByName?: string | null } | null,
): Promise<void> {
  const CHUNK = 100;

  // ── 1. Leer protocolo + relaciones para el snapshot ───────────────────────
  const { data: protocol, error: pqErr } = await supabase
    .from('protocols').select('*').eq('id', protocolId).maybeSingle();
  if (pqErr && !isMissingRelation(pqErr)) throw new Error(`[deleteProtocol:protocol-query] ${pqErr.message}`);
  // Si el protocolo ya no está en la nube (borrado por otro device), igual
  // intentamos limpiar relaciones huérfanas y salimos sin crear papelera vacía.
  const { data: items } = await supabase.from('protocol_items').select('*').eq('protocol_id', protocolId);
  const itemRows = (items ?? []) as { id: string }[];
  const itemIds = itemRows.map(r => r.id);

  let evidences: any[] = [];
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const { data } = await supabase.from('evidences').select('*').in('protocol_item_id', itemIds.slice(i, i + CHUNK));
    if (data) evidences = evidences.concat(data);
  }

  const { data: approvals } = await supabase.from('protocol_approvals').select('*').eq('protocol_id', protocolId);
  const { data: ncs } = await supabase.from('non_conformities').select('*').eq('protocol_id', protocolId);
  const { data: protoEquip } = await supabase.from('protocol_equipment').select('*').eq('protocol_id', protocolId);
  const { data: annotations } = await supabase.from('plan_annotations').select('*').eq('protocol_id', protocolId);
  const annotationIds = ((annotations ?? []) as { id: string }[]).map(a => a.id);

  let annComments: any[] = [];
  for (let i = 0; i < annotationIds.length; i += CHUNK) {
    const { data } = await supabase.from('annotation_comments').select('*').in('annotation_id', annotationIds.slice(i, i + CHUNK));
    if (data) annComments = annComments.concat(data);
  }
  const commentIds = annComments.map(c => c.id);
  let annPhotos: any[] = [];
  for (let i = 0; i < commentIds.length; i += CHUNK) {
    const { data } = await supabase.from('annotation_comment_photos').select('*').in('annotation_comment_id', commentIds.slice(i, i + CHUNK));
    if (data) annPhotos = annPhotos.concat(data);
  }

  const { data: summaryRow } = await supabase
    .from('protocol_summary_rows').select('*').eq('protocol_id', protocolId).maybeSingle();

  // Nombre del tipo de ensayo (plantilla) para la lista de la papelera.
  let templateName: string | null = null;
  if (protocol?.template_id) {
    const { data: tpl } = await supabase.from('protocol_templates').select('name').eq('id', protocol.template_id).maybeSingle();
    templateName = (tpl as any)?.name ?? null;
  }

  // ── 2. Guardar copia en la papelera (antes de borrar nada) ────────────────
  if (protocol) {
    const now = Date.now();
    const snapshot = {
      protocol, items: itemRows, evidences, approvals: approvals ?? [],
      non_conformities: ncs ?? [], protocol_equipment: protoEquip ?? [],
      plan_annotations: annotations ?? [], annotation_comments: annComments,
      annotation_comment_photos: annPhotos, summary_row: summaryRow ?? null,
    };
    const { error: rbErr } = await supabase.from('recycle_bin').upsert({
      id: `recycle-${protocolId}-${(protocol as any).updated_at ?? now}`,
      project_id: (protocol as any).project_id,
      protocol_id: protocolId,
      protocol_code: (protocol as any).protocol_code ?? null,
      protocol_number: (protocol as any).protocol_number ?? null,
      template_id: (protocol as any).template_id ?? null,
      template_name: templateName,
      location_name: (summaryRow as any)?.location_name ?? null,
      sector_name: (summaryRow as any)?.sector_name ?? null,
      status: (protocol as any).status ?? null,
      ensayo_date: (protocol as any).ensayo_date ?? null,
      snapshot_json: snapshot,
      deleted_at: now,
      deleted_by_id: meta?.deletedById ?? null,
      deleted_by_name: meta?.deletedByName ?? null,
      created_at: now,
      updated_at: now,
    }, { onConflict: 'id' });
    if (rbErr && !isMissingRelation(rbErr)) throw new Error(`[deleteProtocol:recycle_bin] ${rbErr.message}`);
  }

  // ── 3. Hard delete en orden FK-seguro (incluye huérfanos) ─────────────────
  const del = async (label: string, q: PromiseLike<{ error: any }>) => {
    const { error } = await q;
    if (error && !isMissingRelation(error)) throw new Error(`[deleteProtocol:${label}] ${error.message}`);
  };
  for (let i = 0; i < commentIds.length; i += CHUNK)
    await del('ann-photos', supabase.from('annotation_comment_photos').delete().in('annotation_comment_id', commentIds.slice(i, i + CHUNK)));
  for (let i = 0; i < annotationIds.length; i += CHUNK)
    await del('ann-comments', supabase.from('annotation_comments').delete().in('annotation_id', annotationIds.slice(i, i + CHUNK)));
  await del('annotations', supabase.from('plan_annotations').delete().eq('protocol_id', protocolId));
  for (let i = 0; i < itemIds.length; i += CHUNK)
    await del('evidences', supabase.from('evidences').delete().in('protocol_item_id', itemIds.slice(i, i + CHUNK)));
  await del('protocol_equipment', supabase.from('protocol_equipment').delete().eq('protocol_id', protocolId));
  await del('non_conformities', supabase.from('non_conformities').delete().eq('protocol_id', protocolId));
  await del('approvals', supabase.from('protocol_approvals').delete().eq('protocol_id', protocolId));
  await del('items', supabase.from('protocol_items').delete().eq('protocol_id', protocolId));
  await del('summary_row', supabase.from('protocol_summary_rows').delete().eq('protocol_id', protocolId));
  await del('protocol', supabase.from('protocols').delete().eq('id', protocolId));
}

/** v26 — Refresca SOLO el row local de `projects` desde Supabase, para
 *  garantizar que `feature_flags` (incluye coordinate_system / gps_capture_*)
 *  y `map_tile_url` estén frescos al abrir un ensayo en otro celular.
 *  Liviano: no toca relaciones. Si no hay red, no-op silencioso. */
export async function pullProjectSettings(projectId: string): Promise<void> {
  // v43 FIX — NO incluir `sample_identifier` (columna v46) en este select: si la
  // columna aún no existe, el select entero falla → no se propagarían los flags
  // (feature_flags) a este dispositivo. Va aparte y tolerante (abajo).
  const { data, error } = await supabase
    .from('projects')
    .select('feature_flags, map_tile_url, orthophoto_s3_key, orthophoto_bounds_json, orthophoto_system, orthophoto_tiles_json, updated_at')
    .eq('id', projectId)
    .maybeSingle();
  if (error || !data) return;
  try {
    const local = await projectsCollection.find(projectId);
    // CLOUD-WINS: estos settings (feature_flags, map_tile_url, ortofoto) los
    // edita SIEMPRE la web (CREATOR); el celular nunca los escribe. Por eso NO
    // aplicamos guard de "local más nuevo" — siempre reflejamos el remoto, o un
    // cambio recién hecho en la web no llegaría al celular.
    await database.write(async () => {
      await (local as any).update((r: any) => {
        r.featureFlags = typeof data.feature_flags === 'string'
          ? data.feature_flags
          : JSON.stringify(data.feature_flags ?? {});
        r.mapTileUrl = data.map_tile_url ?? null;
        // v34 — ortofoto (bounds llega como jsonb → serializar a string local).
        r.orthophotoS3Key = (data as any).orthophoto_s3_key ?? null;
        const b = (data as any).orthophoto_bounds_json;
        r.orthophotoBoundsJson = b == null ? null : (typeof b === 'string' ? b : JSON.stringify(b));
        r.orthophotoSystem = (data as any).orthophoto_system ?? null;
        const t = (data as any).orthophoto_tiles_json;
        r.orthophotoTilesJson = t == null ? null : (typeof t === 'string' ? t : JSON.stringify(t));
      });
    });
    // v43 — id de muestras (cloud-wins) en consulta SEPARADA y tolerante (columna v46).
    try {
      const { data: sid } = await supabase.from('projects').select('sample_identifier').eq('id', projectId).maybeSingle();
      if (sid && 'sample_identifier' in sid) {
        await database.write(async () => { await (local as any).update((r: any) => { r.sampleIdentifier = (sid as any).sample_identifier ?? null; }); });
      }
    } catch { /* columna v46 ausente */ }
  } catch { /* proyecto local no existe aún — primer pull completo lo creará */ }
}

/** v43.1 — Lee los feature_flags actuales, mezcla un parcial y los guarda (Supabase
 *  JSONB + local). Para que la pantalla de muestras edite config de formulario/materiales
 *  sin pisar el resto de flags. Cloud-wins (lo edita creador/jefe). */
export async function mergeAndSaveFeatureFlags(projectId: string, partial: Record<string, any>): Promise<void> {
  const local: any = await projectsCollection.find(projectId).catch(() => null);
  // Blindaje: sin proyecto local NO escribimos (evita pisar los flags reales de la
  // nube con DEFAULT). En este flujo el proyecto siempre existe localmente (la
  // pantalla se abre desde dentro del proyecto, ya sincronizado).
  if (!local) return;

  // Base = UNIÓN de flags locales + remotos (la NUBE gana en conflicto). Esto evita
  // que un guardado parcial (p.ej. config de impresión del dosier) pise flags como
  // `gps_capture_numeric` con un local desactualizado: re-leemos la nube y mergeamos
  // sobre TODOS los flags conocidos. Si no hay red, usamos solo el local.
  const localFlags = parseFeatureFlagsJson(local.featureFlags);
  let base: Record<string, any> = { ...localFlags };
  try {
    const { data, error } = await supabase.from('projects').select('feature_flags').eq('id', projectId).maybeSingle();
    if (!error && data && (data as any).feature_flags != null) {
      const ff = (data as any).feature_flags;
      const remoteFlags = typeof ff === 'string' ? parseFeatureFlagsJson(ff) : mergeFeatureFlags(ff);
      base = { ...localFlags, ...remoteFlags };   // unión; remoto (autoritativo) gana
    }
  } catch { /* offline → solo local */ }

  const merged = { ...base, ...partial };
  try { await supabase.from('projects').update({ feature_flags: merged, updated_at: Date.now() }).eq('id', projectId); } catch { /* offline */ }
  try { await database.write(async () => { await local.update((r: any) => { r.featureFlags = JSON.stringify(merged); }); }); } catch { /* */ }
}

/** v45.3 — Siembra agrupamientos (presets) desde el Excel en feature_flags.grouping_presets.
 *  UPSERT por NOMBRE dentro de cada tipo: actualiza los sembrados y CONSERVA los que el
 *  usuario añadió a mano (nunca borra; respeta feedback_destructive_ops + feature_flags_persistencia).
 *  Devuelve cuántos presets se sembraron y en cuántos tipos. */
export async function seedGroupingPresets(
  projectId: string,
  presetsByType: Record<string, GroupingPreset[]>,
): Promise<{ seeded: number; types: number }> {
  const types = Object.keys(presetsByType ?? {});
  if (!projectId || types.length === 0) return { seeded: 0, types: 0 };
  const local: any = await projectsCollection.find(projectId).catch(() => null);
  if (!local) return { seeded: 0, types: 0 };

  // Base = unión local + remoto (la nube gana) — igual que mergeAndSaveFeatureFlags.
  const localFlags = parseFeatureFlagsJson(local.featureFlags);
  let base: Record<string, any> = { ...localFlags };
  try {
    const { data, error } = await supabase.from('projects').select('feature_flags').eq('id', projectId).maybeSingle();
    if (!error && data && (data as any).feature_flags != null) {
      const ff = (data as any).feature_flags;
      const remoteFlags = typeof ff === 'string' ? parseFeatureFlagsJson(ff) : mergeFeatureFlags(ff);
      base = { ...localFlags, ...remoteFlags };
    }
  } catch { /* offline → solo local */ }

  const current: Record<string, GroupingPreset[]> = { ...(base.grouping_presets ?? {}) };
  let seeded = 0;
  for (const tipo of types) {
    const existing = (current[tipo] ?? []).slice();
    const idxByName = new Map(existing.map((p, i) => [p.name.trim().toLowerCase(), i]));
    for (const p of presetsByType[tipo]) {
      const k = p.name.trim().toLowerCase();
      if (idxByName.has(k)) existing[idxByName.get(k)!] = p;          // upsert por nombre
      else { existing.push(p); idxByName.set(k, existing.length - 1); }
      seeded++;
    }
    current[tipo] = existing;
  }

  const merged = { ...base, grouping_presets: current };
  try { await supabase.from('projects').update({ feature_flags: merged, updated_at: Date.now() }).eq('id', projectId); } catch { /* offline */ }
  try { await database.write(async () => { await local.update((r: any) => { r.featureFlags = JSON.stringify(merged); }); }); } catch { /* */ }
  return { seeded, types: types.length };
}

/** v35 — Diagnóstico de ortofoto: dice si la referencia está en el REMOTO, si se
 *  pudo escribir LOCAL (revela columnas faltantes/migración), y cualquier error.
 *  Lo usa el botón "sincronizar" del mapa para mostrar dónde se corta el pull. */
export async function diagnoseOrtho(projectId: string): Promise<{ remoteKey: boolean; remoteBounds: boolean; localKey: boolean; localExists: boolean; v36: boolean; err?: string }> {
  let remoteKey = false, remoteBounds = false, localKey = false, localExists = false, v36 = false;
  let err: string | undefined;
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('orthophoto_s3_key, orthophoto_bounds_json')
      .eq('id', projectId)
      .maybeSingle();
    if (error) err = `remoto: ${error.message}`;
    remoteKey = !!(data as any)?.orthophoto_s3_key;
    remoteBounds = !!(data as any)?.orthophoto_bounds_json;
  } catch (e) {
    err = `remoto: ${e instanceof Error ? e.message : String(e)}`;
  }
  // ¿Existen las columnas de versiones (v36)? Si la consulta a esa columna
  // falla, es que NO se corrió el SQL v36 → el guardado de la web fallaba entero.
  try {
    const { error } = await supabase.from('projects').select('orthophotos_json').eq('id', projectId).maybeSingle();
    v36 = !error;
  } catch { v36 = false; }
  try {
    await pullProjectSettings(projectId);
    const local: any = await projectsCollection.find(projectId);
    localExists = true;
    localKey = !!local.orthophotoS3Key;
  } catch (e) {
    err = `${err ? err + ' | ' : ''}local: ${e instanceof Error ? e.message : String(e)}`;
  }
  return { remoteKey, remoteBounds, localKey, localExists, v36, err };
}

/** Bajada incremental de sectores de un proyecto + override local. Usado al
 *  abrir ProjectSectorsScreen / ProjectMapScreen para garantizar frescura.
 *  B3 — También propaga deletes remotos: si un sector se borró en otro
 *  dispositivo, aquí se elimina localmente. Filtramos por `_status === 'synced'`
 *  para no perder creaciones locales que aún no fueron pusheadas. */
export async function pullProjectSectors(projectId: string): Promise<void> {
  const { data, error } = await supabase.from('project_sectors').select('*').eq('project_id', projectId);
  if (error || !data) return;
  const local = await projectSectorsCollection.query(Q.where('project_id', projectId)).fetch();
  const remoteIds = new Set<string>(data.map((r: any) => r.id));
  // C1 — usar fresh-override (last-write-wins por fila): si el usuario acaba de
  // re-importar un sector con geometría (local más nuevo) y aún no se pusheó, NO
  // debe pisarlo una versión remota más vieja. prepareOverride era cloud-wins
  // incondicional → perdía la geometría recién importada.
  const prepares: any[] = prepareFreshOverride(projectSectorsCollection, data, local);
  // Detectar deletes remotos: sectores locales `synced` ausentes en remoto
  for (const rec of local) {
    const status = (rec as any)._raw?._status;
    if (status === 'synced' && !remoteIds.has(rec.id)) {
      prepares.push((rec as any).prepareDestroyPermanently());
    }
  }
  await safeBatchWrite(prepares);
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

// ─── Variantes *Strict (v25 — modo offline) ────────────────────────────────
// Estas versiones SÍ propagan errores. El SyncWorker las usa para distinguir
// "éxito" (remueve de la cola) vs "fallo" (reencola con backoff).
//
// Buscan la fila por id en la collection local y la suben tal cual. Si la fila
// ya no existe localmente (porque fue purged o reemplazada), no es error: el
// worker la considera completada y la remueve de la cola.

/** Helper interno: chequea si la fila tiene _status='deleted' (soft-deleted en WMDB).
 *  H5: si está deleted, NO upsertear a Supabase — esto resucitaría el item que
 *  el usuario ya borró. El delete legítimo va por otro camino (deletePhoneContactRemote y similares). */
function isLocalDeleted(rec: any): boolean {
  return rec?._raw?._status === 'deleted';
}

export async function pushProtocolItemStrict(itemId: string): Promise<void> {
  const item = await protocolItemsCollection.find(itemId).catch(() => null);
  if (!item) return; // item ya no existe local — la op ya no tiene sentido
  if (isLocalDeleted(item)) return; // H5: no resucitar items borrados
  const { error } = await supabase
    .from('protocol_items')
    .upsert([toRow((item as any)._raw)], { onConflict: 'id' });
  if (!error) return;
  // v43.3 — FK "protocol_items_protocol_id_fkey": el item llegó a la nube ANTES que su
  // protocolo padre (el push del protocolo falló por red/conflicto y la cola reintenta
  // solo el item). Empujamos el padre y reintentamos UNA vez. Si el padre ya no existe
  // localmente (protocolo borrado), el item quedó huérfano → completamos la op para no
  // reintentar infinitamente (no se sube un item sin padre).
  if (/foreign key|protocol_items_protocol_id_fkey/i.test(error.message ?? '')) {
    const parentId = (item as any).protocolId ?? (item as any)._raw?.protocol_id;
    const parent = parentId ? await protocolsCollection.find(parentId).catch(() => null) : null;
    if (!parent || isLocalDeleted(parent)) return; // huérfano → no reintentar
    const { error: pe } = await supabase.from('protocols').upsert([toRow((parent as any)._raw)], { onConflict: 'id' });
    if (pe) throw new Error(`[pushProtocolItemStrict:parent] ${pe.message}`);
    const { error: e2 } = await supabase.from('protocol_items').upsert([toRow((item as any)._raw)], { onConflict: 'id' });
    if (e2) throw new Error(`[pushProtocolItemStrict:retry] ${e2.message}`);
    return;
  }
  throw new Error(`[pushProtocolItemStrict] ${error.message}`);
}

/** C5 — Push PARCIAL del protocolo: solo los campos que cambiaron localmente
 *  (`_raw._changed`, CSV que WatermelonDB mantiene). Sin esto, dos celulares
 *  editando el mismo protocolo offline produce un upsert atómico que pisa
 *  campos del otro (ej. celular B sube `latitude=null` borrando la captura GPS
 *  que el celular A había hecho antes). Con partial update, B solo manda lo que
 *  él tocó y las coords de A sobreviven en remoto.
 *
 *  Fallback a upsert full si:
 *   - El row es 'created' (nunca existió en Supabase, hay que insertarlo)
 *   - `_changed` está vacío y `_status === 'updated'` (raro pero posible si la
 *     fila fue tocada con `.markAsDirty()` sin update real — mejor mandar todo). */
export async function pushProtocolStatusStrict(protocolId: string): Promise<void> {
  const proto = await protocolsCollection.find(protocolId).catch(() => null);
  if (!proto) return;
  if (isLocalDeleted(proto)) return;
  const raw = (proto as any)._raw;
  const status = raw._status as 'created' | 'updated' | 'synced' | undefined;
  const changedCsv: string = (raw._changed ?? '') as string;
  const changedFields = changedCsv.split(',').map(s => s.trim()).filter(Boolean);

  if (status === 'created') {
    // INSERT completo — la fila no existe en remoto todavía
    const { error } = await supabase
      .from('protocols')
      .upsert([coerceProtocolRow(toRow(raw))], { onConflict: 'id' });
    if (error) {
      // v31 — Código correlativo duplicado (otro dispositivo ganó el seq):
      // re-secuenciar (serializado por mutex) y reintentar UNA vez. Si vuelve
      // a fallar → throw → backoff del outbox (converge al siguiente tick).
      if (isCodeUniqueViolation(error)) {
        const ok = await resequenceProtocolCode(protocolId).catch(() => false);
        if (ok) {
          const fresh: any = await protocolsCollection.find(protocolId).catch(() => null);
          if (fresh) {
            const { error: e2 } = await supabase
              .from('protocols')
              .upsert([coerceProtocolRow(toRow(fresh._raw))], { onConflict: 'id' });
            if (!e2) return;
            throw new Error(`[pushProtocolStatusStrict:create-reseq] ${e2.message}`);
          }
        }
      }
      throw new Error(`[pushProtocolStatusStrict:create] ${error.message}`);
    }
    return;
  }

  if (changedFields.length === 0) {
    // Nada que pushear (defensa: la op no debería haberse encolado)
    return;
  }

  // UPDATE parcial — SOLO los campos cambiados + updated_at para versionado.
  const partial: Record<string, any> = { updated_at: raw.updated_at ?? Date.now() };
  for (const f of changedFields) {
    // Saltar campos internos de WMDB y el id (no se actualiza)
    if (f === '_status' || f === '_changed' || f === 'id') continue;
    partial[f] = raw[f];
  }
  // v42 — si cambió xref_snapshot_json (TEXT local): en un UPDATE parcial, su
  // presencia en _changed = intención EXPLÍCITA (incl. limpiarlo) → enviamos el
  // valor parseado o NULL (NO lo omitimos como en el push completo). Un protocolo
  // que limpia este campo es porque ANTES tenía llamados → ya requirió v45 → la
  // columna existe, así que enviar null es seguro.
  if ('xref_snapshot_json' in partial) {
    const v = partial.xref_snapshot_json;
    partial.xref_snapshot_json = (typeof v === 'string' && v.trim())
      ? (() => { try { return JSON.parse(v); } catch { return null; } })()
      : null;
  }
  const { error } = await supabase
    .from('protocols')
    .update(partial)
    .eq('id', protocolId);
  if (error) {
    // v31 — También un UPDATE puede chocar el índice de código (p.ej. tras una
    // re-secuenciación local previa que eligió otro seq ya tomado).
    if (isCodeUniqueViolation(error) && 'protocol_code' in partial) {
      const ok = await resequenceProtocolCode(protocolId).catch(() => false);
      if (ok) {
        const fresh: any = await protocolsCollection.find(protocolId).catch(() => null);
        if (fresh) {
          const { error: e2 } = await supabase
            .from('protocols')
            .update({ ...partial, protocol_code: fresh.protocolCode, updated_at: Date.now() })
            .eq('id', protocolId);
          if (!e2) return;
          throw new Error(`[pushProtocolStatusStrict:update-reseq] ${e2.message}`);
        }
      }
    }
    throw new Error(`[pushProtocolStatusStrict:update] ${error.message}`);
  }
}

export async function pushApprovalStrict(approvalId: string): Promise<void> {
  const approval = await protocolApprovalsCollection.find(approvalId).catch(() => null);
  if (!approval) return;
  if (isLocalDeleted(approval)) return;
  const { error } = await supabase
    .from('protocol_approvals')
    .upsert([toRow((approval as any)._raw)], { onConflict: 'id' });
  if (error) throw new Error(`[pushApprovalStrict] ${error.message}`);
}

export async function pushEvidenceStrict(evidenceId: string): Promise<void> {
  const ev = await evidencesCollection.find(evidenceId).catch(() => null);
  if (!ev) return;
  if (isLocalDeleted(ev)) return;
  const { error } = await supabase
    .from('evidences')
    .upsert([toRow((ev as any)._raw)], { onConflict: 'id' });
  if (error) throw new Error(`[pushEvidenceStrict] ${error.message}`);
}

export async function pushNonConformityStrict(ncId: string): Promise<void> {
  const nc = await nonConformitiesCollection.find(ncId).catch(() => null);
  if (!nc) return;
  if (isLocalDeleted(nc)) return;
  const { error } = await supabase
    .from('non_conformities')
    .upsert([toRow((nc as any)._raw)], { onConflict: 'id' });
  if (error) throw new Error(`[pushNonConformityStrict] ${error.message}`);
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
  // D8 — El push masivo NO debe enviar las columnas que SOLO administra la
  // web/CREADOR (flags de módulos, capa de mapa, ortofoto). El celular guarda
  // una copia que sólo *pulleó* (cloud-wins); reenviarla pisaba con un valor
  // viejo el valor fresco de la web Y corrompía el JSONB (string en TEXT local →
  // string escalar en columna jsonb). Su escritura legítima desde el móvil va por
  // su ruta dedicada (ProjectConfigScreen → supabase.update directo), no por aquí.
  // Al omitir estas columnas, el upsert (merge-duplicates) conserva su valor en la nube.
  const projectRow = toRow(project._raw);
  for (const c of PROJECT_CLOUD_OWNED_COLS) delete projectRow[c];
  await collect('projects', [projectRow]);
  pushed++;

  // 2. Tablas directamente ligadas al proyecto (incluye `equipment` desde v24, `project_sectors` desde v26)
  const [locations, templates, protocols, plans, notes, accessRows, phoneContacts, equipment, sectors] = await Promise.all([
    locationsCollection.query(Q.where('project_id', projectId)).fetch(),
    protocolTemplatesCollection.query(Q.where('project_id', projectId)).fetch(),
    protocolsCollection.query(Q.where('project_id', projectId)).fetch(),
    plansCollection.query(Q.where('project_id', projectId)).fetch(),
    dashboardNotesCollection.query(Q.where('project_id', projectId)).fetch(),
    userProjectAccessCollection.query(Q.where('project_id', projectId)).fetch(),
    phoneContactsCollection.query(Q.where('project_id', projectId)).fetch(),
    equipmentCollection.query(Q.where('project_id', projectId)).fetch(),
    projectSectorsCollection.query(Q.where('project_id', projectId)).fetch(),
  ]);

  // Todas las tablas directas se filtran por frescura. Las que pueden eliminarse desde desktop
  // además saltan rows ausentes del remoto (a menos que sean created offline).
  const projectFilter = { col: 'project_id', val: projectId };
  const [
    locsToUpload, templatesToUpload, protocolsToUpload, plansToUpload,
    notesToUpload, accessToUpload, phoneContactsToUpload, equipmentToUpload, sectorsToUpload,
  ] = await Promise.all([
    filterByFreshness('locations',            locations,     { skipDeletedOnRemote: true,  projectFilter }),
    filterByFreshness('protocol_templates',   templates,     { projectFilter }),
    filterByFreshness('protocols',            protocols,     { skipDeletedOnRemote: true,  projectFilter }),
    filterByFreshness('plans',                plans,         { projectFilter }),
    filterByFreshness('dashboard_notes',      notes,         { projectFilter }),
    filterByFreshness('user_project_access',  accessRows,    { skipDeletedOnRemote: true,  projectFilter }),
    filterByFreshness('phone_contacts',       phoneContacts, { projectFilter }),
    filterByFreshness('equipment',            equipment,     { projectFilter }),
    filterByFreshness('project_sectors',      sectors,       { skipDeletedOnRemote: true, projectFilter }),
  ]);

  await collect('locations',            locsToUpload.map((r) => toRow(r._raw)));
  await collect('protocol_templates',   templatesToUpload.map((r) => {
    // D8 — summary_config_json es TEXT en WMDB pero JSONB en Supabase: parsear
    // antes de subir, igual que points_json, para no guardar un string escalar.
    const row = toRow(r._raw);
    if (typeof row.summary_config_json === 'string') {
      try { row.summary_config_json = JSON.parse(row.summary_config_json); } catch { row.summary_config_json = null; }
    }
    // D9 — `is_hidden` (v39) es NOT NULL en Supabase, pero las plantillas creadas
    // ANTES de v39 lo tienen null localmente → el upsert fallaba con "null value
    // in column is_hidden violates not-null" y, al no subir la plantilla, TODO lo
    // que la referencia (protocols → protocol_items) caía en cascada por FK.
    row.is_hidden = row.is_hidden == null ? false : !!row.is_hidden;
    return row;
  }));
  // C6 — `project_sectors` ANTES que `protocols`: protocols tiene FK
  // sector_id → project_sectors(id). Si pusheamos un protocolo con sector_id
  // antes de que el sector exista en remoto, Supabase rechaza con
  // "foreign key violation" y el SyncWorker lo marca FAILED_PERMANENT tras 10
  // retries. Es crítico en el escenario "CREATOR importa sectores y captura
  // GPS en el mismo proyecto, luego sincroniza todo junto".
  await collect('project_sectors',      sectorsToUpload.map((r) => {
    // D1 — Parsear points_json (TEXT en WMDB) a array para JSONB en Supabase.
    const row = toRow(r._raw);
    if (typeof row.points_json === 'string') {
      try { row.points_json = JSON.parse(row.points_json); } catch { row.points_json = null; }
    }
    return row;
  }));
  // v43 — Muestras ANTES que protocols: protocols.sample_id → samples(id).
  const samplesRows = await samplesCollection.query(Q.where('project_id', projectId)).fetch();
  const samplesToUpload = await filterByFreshness('samples', samplesRows, { skipDeletedOnRemote: true, projectFilter });
  await collect('samples', samplesToUpload.map((r) => toRow(r._raw)));
  pushed += samplesToUpload.length;
  await collect('protocols',            protocolsToUpload.map((r) => coerceProtocolRow(toRow(r._raw))));
  await collect('plans',                plansToUpload.map((r) => toRow(r._raw)));
  await collect('dashboard_notes',      notesToUpload.map((r) => toRow(r._raw)));
  await collect('user_project_access',  accessToUpload.map((r) => toRow(r._raw)));
  await collect('phone_contacts',       phoneContactsToUpload.map((r) => toRow(r._raw)));
  await collect('equipment',            equipmentToUpload.map((r) => toRow(r._raw)));
  pushed += locsToUpload.length + templatesToUpload.length + protocolsToUpload.length +
            plansToUpload.length + notesToUpload.length + accessToUpload.length +
            phoneContactsToUpload.length + equipmentToUpload.length + sectorsToUpload.length;

  // 3. Hijos de templates
  if (templates.length > 0) {
    const templateIds = templates.map((t) => t.id);
    const templateItems = await protocolTemplateItemsCollection
      .query(Q.where('template_id', Q.oneOf(templateIds)))
      .fetch();
    const templateItemsToUpload = await filterByFreshness('protocol_template_items', templateItems);
    await collect('protocol_template_items', templateItemsToUpload.map((r) => toRow(r._raw)));
    pushed += templateItemsToUpload.length;
  }

  // 4. Hijos de protocols (incluye protocol_approvals desde v23 + protocol_equipment desde v24)
  if (protocols.length > 0) {
    const protocolIds = protocols.map((p) => p.id);

    const [protocolItems, nonConformities, approvals, protoEquip] = await Promise.all([
      protocolItemsCollection.query(Q.where('protocol_id', Q.oneOf(protocolIds))).fetch(),
      nonConformitiesCollection.query(Q.where('protocol_id', Q.oneOf(protocolIds))).fetch(),
      protocolApprovalsCollection.query(Q.where('protocol_id', Q.oneOf(protocolIds))).fetch(),
      protocolEquipmentCollection.query(Q.where('protocol_id', Q.oneOf(protocolIds))).fetch(),
    ]);

    const [itemsToUpload, nonConfsToUpload, approvalsToUpload, protoEquipToUpload] = await Promise.all([
      filterByFreshness('protocol_items', protocolItems, { skipDeletedOnRemote: true }),
      filterByFreshness('non_conformities', nonConformities),
      filterByFreshness('protocol_approvals', approvals, { skipDeletedOnRemote: true }),
      filterByFreshness('protocol_equipment', protoEquip, { skipDeletedOnRemote: true }),
    ]);
    await collect('protocol_items',     itemsToUpload.map((r) => toRow(r._raw)));
    await collect('non_conformities',   nonConfsToUpload.map((r) => toRow(r._raw)));
    await collect('protocol_approvals', approvalsToUpload.map((r) => toRow(r._raw)));
    await collect('protocol_equipment', protoEquipToUpload.map((r) => toRow(r._raw)));
    pushed += itemsToUpload.length + nonConfsToUpload.length
            + approvalsToUpload.length + protoEquipToUpload.length;

    // 5. Evidencias (hijos de protocol_items)
    if (protocolItems.length > 0) {
      const itemIds = protocolItems.map((i) => i.id);
      const evidences = await evidencesCollection
        .query(Q.where('protocol_item_id', Q.oneOf(itemIds)))
        .fetch();
      const evidencesToUpload = await filterByFreshness('evidences', evidences);
      await collect('evidences', evidencesToUpload.map((r) => toRow(r._raw)));
      pushed += evidencesToUpload.length;
    }
  }

  // 6. Hijos de plans (anotaciones + mediciones)
  if (plans.length > 0) {
    const planIds = plans.map((p) => p.id);
    const annotations = await planAnnotationsCollection
      .query(Q.where('plan_id', Q.oneOf(planIds)))
      .fetch();
    const annotationsToUpload = await filterByFreshness('plan_annotations', annotations);
    await collect('plan_annotations', annotationsToUpload.map((r) => toRow(r._raw)));
    pushed += annotationsToUpload.length;

    // 7. Comentarios de anotaciones
    if (annotationsToUpload.length > 0) {
      const annotationIds = annotationsToUpload.map((a) => a.id);
      const comments = await annotationCommentsCollection
        .query(Q.where('annotation_id', Q.oneOf(annotationIds)))
        .fetch();
      const commentsToUpload = await filterByFreshness('annotation_comments', comments);
      await collect('annotation_comments', commentsToUpload.map((r) => toRow(r._raw)));
      pushed += commentsToUpload.length;

      // 8. Fotos de comentarios
      if (comments.length > 0) {
        const commentIds = comments.map((c) => c.id);
        const commentPhotos = await annotationCommentPhotosCollection
          .query(Q.where('annotation_comment_id', Q.oneOf(commentIds)))
          .fetch();
        const photosToUpload = await filterByFreshness('annotation_comment_photos', commentPhotos);
        await collect('annotation_comment_photos', photosToUpload.map((r) => toRow(r._raw)));
        pushed += photosToUpload.length;
      }
    }

    // 9. Mediciones del plano (sincroniza desde v19.1).
    //    skipDeletedOnRemote=true evita que mediciones borradas desde desktop se restauren
    //    en el siguiente push, salvo que sean offline-created.
    const measurements = await planMeasurementsCollection
      .query(Q.where('plan_id', Q.oneOf(planIds)))
      .fetch();
    const measurementsToUpload = await filterByFreshness(
      'plan_measurements', measurements, { skipDeletedOnRemote: true }
    );
    await collect('plan_measurements', measurementsToUpload.map((r) => toRow(r._raw)));
    pushed += measurementsToUpload.length;
  }

  // ── v27 — Trazabilidad operacional ───────────────────────────────────────
  // Orden estricto por FK:
  //   activities → equipment_activities → work_shifts → session_form_templates
  //   → session_form_template_items → work_sessions → work_session_intervals
  //   → work_session_form_items → work_session_gps_points
  // B1 — Las helpers Strict suben uno por uno por outbox, pero el bulk push del
  // proyecto también debe incluirlas para garantizar consistencia tras pulls
  // entre devices distintos.
  const [activities, workShifts, sessionTemplates, workSessions] = await Promise.all([
    activitiesCollection.query(Q.where('project_id', projectId)).fetch(),
    workShiftsCollection.query(Q.where('project_id', projectId)).fetch(),
    sessionFormTemplatesCollection.query(Q.where('project_id', projectId)).fetch(),
    workSessionsCollection.query(Q.where('project_id', projectId)).fetch(),
  ]);

  // equipment_activities: hijo de equipment (no tiene project_id)
  const equipIds = equipment.map((e: any) => e.id);
  const equipmentActivities = equipIds.length > 0
    ? await equipmentActivitiesCollection.query(Q.where('equipment_id', Q.oneOf(equipIds))).fetch()
    : [];

  // session_form_template_items: hijo de session_form_templates
  const tmplIds = sessionTemplates.map((t: any) => t.id);
  const sessionFormTemplateItems = tmplIds.length > 0
    ? await sessionFormTemplateItemsCollection.query(Q.where('template_id', Q.oneOf(tmplIds))).fetch()
    : [];

  // intervals/form_items: hijos de work_sessions.
  // Fix P1: gps_points se sincronizan via PUSH_WORK_SESSION_GPS_BATCH (D7) —
  // NO en push masivo (OOM con 3M filas).
  const sessionIds = workSessions.map((s: any) => s.id);
  const [workSessionIntervals, workSessionFormItems] = sessionIds.length > 0
    ? await Promise.all([
        workSessionIntervalsCollection.query(Q.where('session_id', Q.oneOf(sessionIds))).fetch(),
        workSessionFormItemsCollection.query(Q.where('session_id', Q.oneOf(sessionIds))).fetch(),
      ])
    : [[], []];

  const [
    activitiesToUpload, workShiftsToUpload, sessionTemplatesToUpload, workSessionsToUpload,
    equipmentActivitiesToUpload, sessionFormTemplateItemsToUpload,
    workSessionIntervalsToUpload, workSessionFormItemsToUpload,
  ] = await Promise.all([
    filterByFreshness('activities',                  activities,                 { skipDeletedOnRemote: true, projectFilter }),
    filterByFreshness('work_shifts',                 workShifts,                 { skipDeletedOnRemote: true, projectFilter }),
    filterByFreshness('session_form_templates',      sessionTemplates,           { skipDeletedOnRemote: true, projectFilter }),
    filterByFreshness('work_sessions',               workSessions,               { skipDeletedOnRemote: true, projectFilter }),
    filterByFreshness('equipment_activities',        equipmentActivities,        { skipDeletedOnRemote: true }),
    filterByFreshness('session_form_template_items', sessionFormTemplateItems,   { skipDeletedOnRemote: true }),
    filterByFreshness('work_session_intervals',      workSessionIntervals,       { skipDeletedOnRemote: true }),
    filterByFreshness('work_session_form_items',     workSessionFormItems,       { skipDeletedOnRemote: true }),
  ]);

  await collect('activities',                  activitiesToUpload.map((r) => toRow(r._raw)));
  await collect('equipment_activities',        equipmentActivitiesToUpload.map((r) => toRow(r._raw)));
  await collect('work_shifts',                 workShiftsToUpload.map((r) => toRow(r._raw)));
  await collect('session_form_templates',      sessionTemplatesToUpload.map((r) => toRow(r._raw)));
  await collect('session_form_template_items', sessionFormTemplateItemsToUpload.map((r) => toRow(r._raw)));
  await collect('work_sessions',               workSessionsToUpload.map((r) => toRow(r._raw)));
  await collect('work_session_intervals',      workSessionIntervalsToUpload.map((r) => toRow(r._raw)));
  await collect('work_session_form_items',     workSessionFormItemsToUpload.map((r) => toRow(r._raw)));
  // Fix P1: work_session_gps_points NO se pushea aquí — va via
  // PUSH_WORK_SESSION_GPS_BATCH (D7) encolado por el watcher.
  pushed += activitiesToUpload.length + equipmentActivitiesToUpload.length + workShiftsToUpload.length
          + sessionTemplatesToUpload.length + sessionFormTemplateItemsToUpload.length
          + workSessionsToUpload.length + workSessionIntervalsToUpload.length
          + workSessionFormItemsToUpload.length;

  return { pushed, errors };
}

// ─── pull ───────────────────────────────────────────────────────────────────

async function pullProject(projectId: string): Promise<number> {
  // ── 1. Descarga todo desde Supabase (red, fuera del write lock) ───────────

  // v44 — Guardarraíl: si una descarga FALLA (red/RLS) devolvemos [] pero
  // marcamos la tabla como "fallida". La limpieza de huérfanos NO debe correr
  // sobre una tabla fallida: un [] por error NO significa "no hay remotos", y
  // tratar todo lo local como huérfano borraría datos sanos del dispositivo.
  const fetchFailed = new Set<string>();
  const fetchAll = async (table: string, col: string, val: string) => {
    const { data, error } = await supabase.from(table).select('*').eq(col, val);
    if (error) { console.warn(`[pull:${table}] ${error.message}`); fetchFailed.add(table); return []; }
    return data ?? [];
  };
  const fetchIn = async (table: string, col: string, ids: string[]) => {
    if (ids.length === 0) return [];
    const { data, error } = await supabase.from(table).select('*').in(col, ids);
    if (error) { console.warn(`[pull:${table}] ${error.message}`); fetchFailed.add(table); return []; }
    return data ?? [];
  };

  const { data: remoteProject, error: projErr } = await supabase
    .from('projects').select('*').eq('id', projectId);
  if (projErr) throw new Error(`[pull:projects] ${projErr.message}`);

  const [remoteLocations, remoteTemplates, remoteProtocols, remotePlans, remoteNotes, remoteAccess, remotePhoneContacts, remoteEquipment, remoteSectors,
    remoteActivities, remoteWorkShifts, remoteSessionTemplates, remoteWorkSessions] =
    await Promise.all([
      fetchAll('locations',            'project_id', projectId),
      fetchAll('protocol_templates',   'project_id', projectId),
      fetchAll('protocols',            'project_id', projectId),
      fetchAll('plans',                'project_id', projectId),
      fetchAll('dashboard_notes',      'project_id', projectId),
      fetchAll('user_project_access',  'project_id', projectId),
      fetchAll('phone_contacts',       'project_id', projectId),
      fetchAll('equipment',            'project_id', projectId),
      fetchAll('project_sectors',      'project_id', projectId),
      // v27 — Trazabilidad operacional (tablas con project_id directo)
      fetchAll('activities',             'project_id', projectId),
      fetchAll('work_shifts',            'project_id', projectId),
      fetchAll('session_form_templates', 'project_id', projectId),
      fetchAll('work_sessions',          'project_id', projectId),
    ]);

  // v44 — Anti-zombie: si este dispositivo tiene un DELETE_PROTOCOL pendiente
  // (encolado pero aún no drenado por el worker), el ensayo SIGUE existiendo en
  // la nube. Sin esto, el pull lo re-crearía localmente (ya lo destruimos al
  // eliminar) → "ensayo zombi" que reaparece hasta que el worker borre en nube.
  // Lo excluimos del remoto: ni se re-crea ni se baja a sus hijos.
  let pendingDeleteIds = new Set<string>();
  try {
    const pendingDeletes = await syncQueueCollection
      .query(Q.where('op_type', 'DELETE_PROTOCOL'), Q.where('status', Q.oneOf(['PENDING', 'PROCESSING'])))
      .fetch();
    pendingDeleteIds = new Set((pendingDeletes as any[]).map(r => r.entityId));
  } catch { /* sin cola → nada que excluir */ }
  const remoteProtocolsLive = pendingDeleteIds.size > 0
    ? remoteProtocols.filter((p: any) => !pendingDeleteIds.has(p.id))
    : remoteProtocols;

  const tIds    = remoteTemplates.map((t: any) => t.id);
  const pIds    = remoteProtocolsLive.map((p: any) => p.id);
  const planIds = remotePlans.map((p: any) => p.id);

  const [remoteTemplateItems, remotePItems, remoteNonConfs, remoteAnnotations, remoteMeasurements, remoteApprovals, remoteProtoEquip] = await Promise.all([
    fetchIn('protocol_template_items', 'template_id', tIds),
    fetchIn('protocol_items',          'protocol_id', pIds),
    fetchIn('non_conformities',        'protocol_id', pIds),
    fetchIn('plan_annotations',        'plan_id',     planIds),
    fetchIn('plan_measurements',       'plan_id',     planIds),
    fetchIn('protocol_approvals',      'protocol_id', pIds),
    fetchIn('protocol_equipment',      'protocol_id', pIds),
  ]);

  const iIds = remotePItems.map((i: any) => i.id);
  const aIds = remoteAnnotations.map((a: any) => a.id);
  const [remoteEvidences, remoteComments] = await Promise.all([
    fetchIn('evidences',           'protocol_item_id', iIds),
    fetchIn('annotation_comments', 'annotation_id',    aIds),
  ]);
  const cIds = remoteComments.map((c: any) => c.id);
  const remoteCommentPhotos = await fetchIn('annotation_comment_photos', 'annotation_comment_id', cIds);

  // v27 — Hijos por equipment/template/session
  const equipIdsV27 = remoteEquipment.map((e: any) => e.id);
  const tmplIdsV27  = remoteSessionTemplates.map((t: any) => t.id);
  const sessIdsV27  = remoteWorkSessions.map((s: any) => s.id);
  const [remoteEquipmentActivities, remoteSessionFormTemplateItems,
    remoteWorkSessionIntervals, remoteWorkSessionFormItems, remoteWorkSessionGpsPoints] =
    await Promise.all([
      fetchIn('equipment_activities',        'equipment_id', equipIdsV27),
      fetchIn('session_form_template_items', 'template_id',  tmplIdsV27),
      fetchIn('work_session_intervals',      'session_id',   sessIdsV27),
      fetchIn('work_session_form_items',     'session_id',   sessIdsV27),
      fetchIn('work_session_gps_points',     'session_id',   sessIdsV27),
    ]);

  // ── 2. Lee locales + aplica cambios en una sola write transaction ─────────
  // database.write() serializa con otros writes y da acceso exclusivo al DB.

  return database.write(async () => {
    const [
      localProject, localLocs, localTemplates, localProtocols, localPlans, localNotes, localAccess, localPhoneContacts,
      localTemplateItems, localPItems, localNonConfs, localAnnotations,
      localEvidences, localComments, localCommentPhotos, localMeasurements,
      localEquipment, localApprovals, localProtoEquip, localSectors,
      localActivities, localEquipmentActivities, localWorkShifts, localSessionTemplates,
      localSessionTemplateItems, localWorkSessions, localWorkSessionIntervals,
      localWorkSessionFormItems, localWorkSessionGpsPoints,
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
      planIds.length > 0
        ? planMeasurementsCollection.query(Q.where('plan_id', Q.oneOf(planIds))).fetch()
        : Promise.resolve([]),
      equipmentCollection.query(Q.where('project_id', projectId)).fetch(),
      pIds.length > 0
        ? protocolApprovalsCollection.query(Q.where('protocol_id', Q.oneOf(pIds))).fetch()
        : Promise.resolve([]),
      pIds.length > 0
        ? protocolEquipmentCollection.query(Q.where('protocol_id', Q.oneOf(pIds))).fetch()
        : Promise.resolve([]),
      projectSectorsCollection.query(Q.where('project_id', projectId)).fetch(),
      // v27 — Trazabilidad operacional
      activitiesCollection.query(Q.where('project_id', projectId)).fetch(),
      equipIdsV27.length > 0
        ? equipmentActivitiesCollection.query(Q.where('equipment_id', Q.oneOf(equipIdsV27))).fetch()
        : Promise.resolve([]),
      workShiftsCollection.query(Q.where('project_id', projectId)).fetch(),
      sessionFormTemplatesCollection.query(Q.where('project_id', projectId)).fetch(),
      tmplIdsV27.length > 0
        ? sessionFormTemplateItemsCollection.query(Q.where('template_id', Q.oneOf(tmplIdsV27))).fetch()
        : Promise.resolve([]),
      workSessionsCollection.query(Q.where('project_id', projectId)).fetch(),
      // Fix A: cargar SIN filtrar por sessIdsV27 (IDs remotos). Si una session
      // remota se borró (CASCADE en Postgres), sus hijos locales quedarían
      // huérfanos eternos porque no entrarían al collectOrphans. Al cargar
      // todos los locales, el orphan cleanup detecta y limpia correctamente.
      workSessionIntervalsCollection.query().fetch(),
      workSessionFormItemsCollection.query().fetch(),
      workSessionGpsPointsCollection.query().fetch(),
    ]);

    // v41 — Tablas auxiliares de laboratorio (cloud-managed; el móvil solo LEE,
    // por eso van por pull cloud-wins y NO se incluyen en el push). filterToLocalSchema
    // serializa los JSONB columns_json/rows_json a string local automáticamente.
    const remoteAuxTables = await fetchAll('lab_aux_tables', 'project_id', projectId);
    const localAuxTables = await labAuxTablesCollection.query(Q.where('project_id', projectId)).fetch();

    // v43 — Papelera de Reciclaje (cloud-managed; el móvil solo LEE; pull-only,
    // nunca se sube). snapshot_json (JSONB remoto) se serializa a string local.
    const remoteRecycleBin = await fetchAll('recycle_bin', 'project_id', projectId);
    const localRecycleBin = await recycleBinCollection.query(Q.where('project_id', projectId)).fetch();

    // v43 — Muestras físicas (módulo "ensayos por muestra"). fresh-override:
    // no pisar muestras creadas en campo aún no pusheadas.
    const remoteSamples = await fetchAll('samples', 'project_id', projectId);
    const localSamples = await samplesCollection.query(Q.where('project_id', projectId)).fetch();

    const allPrepares = [
      ...prepareOverride(projectsCollection,              remoteProject ?? [],  localProject),
      ...prepareOverride(labAuxTablesCollection,          remoteAuxTables,      localAuxTables),
      ...prepareOverride(recycleBinCollection,            remoteRecycleBin,     localRecycleBin),
      ...prepareFreshOverride(samplesCollection,          remoteSamples,        localSamples),
      ...prepareOverride(locationsCollection,             remoteLocations,      localLocs),
      // v32 — Dominio de protocolos: fresh-override (no pisar ediciones locales
      // más nuevas; ver doc de prepareFreshOverride). Resto: cloud-wins clásico.
      ...prepareFreshOverride(protocolTemplatesCollection,     remoteTemplates,  localTemplates),
      ...prepareFreshOverride(protocolsCollection,             remoteProtocolsLive,  localProtocols),
      ...preparePlansOverride(plansCollection,             remotePlans,          localPlans),
      ...prepareOverride(dashboardNotesCollection,        remoteNotes,          localNotes),
      ...prepareOverride(userProjectAccessCollection,     remoteAccess,         localAccess),
      ...prepareOverride(phoneContactsCollection,         remotePhoneContacts,  localPhoneContacts),
      ...prepareFreshOverride(protocolTemplateItemsCollection, remoteTemplateItems, localTemplateItems),
      ...prepareFreshOverride(protocolItemsCollection,         remotePItems,     localPItems),
      ...prepareFreshOverride(nonConformitiesCollection,       remoteNonConfs,   localNonConfs),
      // D8 — Datos creados/editados EN CAMPO desde el celular (anotaciones de
      // plano, sus comentarios/fotos y mediciones): fresh-override igual que el
      // dominio de protocolos. Con cloud-wins, si el push previo fallaba (sin
      // señal en obra) el pull pisaba la anotación/medición recién hecha.
      ...prepareFreshOverride(planAnnotationsCollection,       remoteAnnotations,    localAnnotations),
      ...prepareFreshOverride(evidencesCollection,             remoteEvidences,  localEvidences),
      ...prepareFreshOverride(annotationCommentsCollection,    remoteComments,       localComments),
      ...prepareFreshOverride(annotationCommentPhotosCollection, remoteCommentPhotos, localCommentPhotos),
      ...prepareFreshOverride(planMeasurementsCollection,      remoteMeasurements,   localMeasurements),
      ...prepareOverride(equipmentCollection,             remoteEquipment,      localEquipment),
      ...prepareOverride(protocolApprovalsCollection,     remoteApprovals,      localApprovals),
      ...prepareOverride(protocolEquipmentCollection,     remoteProtoEquip,     localProtoEquip),
      ...prepareOverride(projectSectorsCollection,        remoteSectors,        localSectors),
      // v27 — Trazabilidad operacional
      ...prepareOverride(activitiesCollection,                  remoteActivities,                localActivities),
      ...prepareOverride(equipmentActivitiesCollection,         remoteEquipmentActivities,       localEquipmentActivities),
      ...prepareOverride(workShiftsCollection,                  remoteWorkShifts,                localWorkShifts),
      ...prepareOverride(sessionFormTemplatesCollection,        remoteSessionTemplates,          localSessionTemplates),
      ...prepareOverride(sessionFormTemplateItemsCollection,    remoteSessionFormTemplateItems,  localSessionTemplateItems),
      ...prepareOverride(workSessionsCollection,                remoteWorkSessions,              localWorkSessions),
      ...prepareOverride(workSessionIntervalsCollection,        remoteWorkSessionIntervals,      localWorkSessionIntervals),
      ...prepareOverride(workSessionFormItemsCollection,        remoteWorkSessionFormItems,      localWorkSessionFormItems),
      ...prepareOverride(workSessionGpsPointsCollection,        remoteWorkSessionGpsPoints,      localWorkSessionGpsPoints),
    ];

    if (allPrepares.length > 0) await database.batch(allPrepares);

    // ── 3. Limpiar huérfanos: registros locales eliminados desde desktop ─────
    // Nota: usamos la lista "live" (sin los que tienen DELETE pendiente) para que
    // un ensayo en proceso de borrado NO se considere "presente en remoto".
    const remoteProtocolIdSet = new Set(remoteProtocolsLive.map((p: any) => p.id));
    const remoteLocationIdSet = new Set(remoteLocations.map((l: any) => l.id));

    // Protocolos huérfanos (existen local pero no en Supabase, y no son offline-created)
    // v44 — Solo si la descarga de protocolos NO falló (si falló, [] es engañoso).
    const orphanProtocols = fetchFailed.has('protocols') ? [] : localProtocols.filter(
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
      // v23/v24 — También aprobaciones y vínculos de equipos del protocolo huérfano.
      const orphanApprovals = await protocolApprovalsCollection
        .query(Q.where('protocol_id', Q.oneOf(orphanPIds))).fetch();
      const orphanProtoEquip = await protocolEquipmentCollection
        .query(Q.where('protocol_id', Q.oneOf(orphanPIds))).fetch();
      // v43 — También la fila de Tablas Resumen y las anotaciones de plano (+sus
      // comentarios/fotos) del protocolo eliminado, para que en ESTE dispositivo
      // (que no fue el que borró) tampoco queden huérfanos en ningún módulo.
      const orphanSummaryRows = await summaryRowsCollection
        .query(Q.where('protocol_id', Q.oneOf(orphanPIds))).fetch().catch(() => [] as any[]);
      const orphanAnnotations = await planAnnotationsCollection
        .query(Q.where('protocol_id', Q.oneOf(orphanPIds))).fetch().catch(() => [] as any[]);
      const orphanAnnIds = (orphanAnnotations as any[]).map(a => a.id);
      const orphanAnnComments = orphanAnnIds.length > 0
        ? await annotationCommentsCollection.query(Q.where('annotation_id', Q.oneOf(orphanAnnIds))).fetch().catch(() => [] as any[])
        : [];
      const orphanAnnCommentIds = (orphanAnnComments as any[]).map(c => c.id);
      const orphanAnnPhotos = orphanAnnCommentIds.length > 0
        ? await annotationCommentPhotosCollection.query(Q.where('annotation_comment_id', Q.oneOf(orphanAnnCommentIds))).fetch().catch(() => [] as any[])
        : [];

      const orphanDeletes = [
        ...orphanEvidences.map((e: any) => e.prepareDestroyPermanently()),
        ...orphanNonConfs.map((n: any) => n.prepareDestroyPermanently()),
        ...orphanApprovals.map((a: any) => a.prepareDestroyPermanently()),
        ...orphanProtoEquip.map((pe: any) => pe.prepareDestroyPermanently()),
        ...(orphanAnnPhotos as any[]).map((p: any) => p.prepareDestroyPermanently()),
        ...(orphanAnnComments as any[]).map((c: any) => c.prepareDestroyPermanently()),
        ...(orphanAnnotations as any[]).map((a: any) => a.prepareDestroyPermanently()),
        ...orphanItems.map((i: any) => i.prepareDestroyPermanently()),
        ...(orphanSummaryRows as any[]).map((s: any) => s.prepareDestroyPermanently()),
        ...orphanProtocols.map((p: any) => p.prepareDestroyPermanently()),
      ];
      if (orphanDeletes.length > 0) {
        await database.batch(orphanDeletes);
        console.log(`[pull] Eliminados ${orphanDeletes.length} registros huérfanos (${orphanProtocols.length} protocolos)`);
      }
    }

    // v23/v24 — Aprobaciones / vínculos / equipos huérfanos cuyo protocolo SIGUE
    // existiendo (solo se borró la aprobación o el vínculo desde web).
    const remoteApprovalIdSet = new Set(remoteApprovals.map((a: any) => a.id));
    const remoteProtoEquipIdSet = new Set(remoteProtoEquip.map((pe: any) => pe.id));
    const orphanApprovalsAlive = fetchFailed.has('protocol_approvals') ? [] : localApprovals.filter(
      (a: any) => !remoteApprovalIdSet.has(a.id) && a._raw._status !== 'created',
    );
    const orphanProtoEquipAlive = fetchFailed.has('protocol_equipment') ? [] : localProtoEquip.filter(
      (pe: any) => !remoteProtoEquipIdSet.has(pe.id) && pe._raw._status !== 'created',
    );
    if (orphanApprovalsAlive.length > 0 || orphanProtoEquipAlive.length > 0) {
      await database.batch([
        ...orphanApprovalsAlive.map((a: any) => a.prepareDestroyPermanently()),
        ...orphanProtoEquipAlive.map((pe: any) => pe.prepareDestroyPermanently()),
      ]);
    }

    // v24 — Equipos del proyecto eliminados desde web.
    const remoteEquipIdSet = new Set(remoteEquipment.map((e: any) => e.id));
    const orphanEquipment = fetchFailed.has('equipment') ? [] : localEquipment.filter(
      (e: any) => !remoteEquipIdSet.has(e.id) && e._raw._status !== 'created',
    );
    if (orphanEquipment.length > 0) {
      await database.batch(orphanEquipment.map((e: any) => e.prepareDestroyPermanently()));
    }

    // v26 — Sectores del proyecto eliminados desde web.
    const remoteSectorIdSet = new Set(remoteSectors.map((s: any) => s.id));
    const orphanSectors = fetchFailed.has('project_sectors') ? [] : localSectors.filter(
      (s: any) => !remoteSectorIdSet.has(s.id) && s._raw._status !== 'created',
    );
    if (orphanSectors.length > 0) {
      await database.batch(orphanSectors.map((s: any) => s.prepareDestroyPermanently()));
    }

    // Ubicaciones huérfanas
    const orphanLocations = fetchFailed.has('locations') ? [] : localLocs.filter(
      (l: any) => !remoteLocationIdSet.has(l.id) && l._raw._status !== 'created'
    );
    if (orphanLocations.length > 0) {
      await database.batch(orphanLocations.map((l: any) => l.prepareDestroyPermanently()));
      console.log(`[pull] Eliminadas ${orphanLocations.length} ubicaciones huérfanas`);
    }

    // v27 — Orphan cleanup para las 9 tablas de trazabilidad. Mismo patrón que
    // project_sectors: si el row local está 'synced' (no es offline-created) y
    // el remoto ya no lo lista → fue borrado desde web, lo destruimos.
    const remoteActivityIds            = new Set(remoteActivities.map((r: any) => r.id));
    const remoteEquipmentActivityIds   = new Set(remoteEquipmentActivities.map((r: any) => r.id));
    const remoteWorkShiftIds           = new Set(remoteWorkShifts.map((r: any) => r.id));
    const remoteSessionTemplateIds     = new Set(remoteSessionTemplates.map((r: any) => r.id));
    const remoteSessionTemplateItemIds = new Set(remoteSessionFormTemplateItems.map((r: any) => r.id));
    const remoteWorkSessionIds         = new Set(remoteWorkSessions.map((r: any) => r.id));
    const remoteWorkSessionIntervalIds = new Set(remoteWorkSessionIntervals.map((r: any) => r.id));
    const remoteWorkSessionFormItemIds = new Set(remoteWorkSessionFormItems.map((r: any) => r.id));
    const remoteWorkSessionGpsPointIds = new Set(remoteWorkSessionGpsPoints.map((r: any) => r.id));

    const orphanV27: any[] = [];
    // v44 — Guardarraíl: no limpiar huérfanos de una tabla cuya descarga falló.
    const collectOrphans = (table: string, locals: any[], remoteSet: Set<string>) => {
      if (fetchFailed.has(table)) return;
      for (const rec of locals) {
        const status = (rec as any)._raw?._status;
        if (status === 'synced' && !remoteSet.has(rec.id)) {
          orphanV27.push((rec as any).prepareDestroyPermanently());
        }
      }
    };
    // Orden inverso de FK para evitar errores: hijos antes que padres.
    collectOrphans('work_session_gps_points',      localWorkSessionGpsPoints, remoteWorkSessionGpsPointIds);
    collectOrphans('work_session_form_items',      localWorkSessionFormItems, remoteWorkSessionFormItemIds);
    collectOrphans('work_session_intervals',       localWorkSessionIntervals, remoteWorkSessionIntervalIds);
    collectOrphans('work_sessions',                localWorkSessions,         remoteWorkSessionIds);
    collectOrphans('session_form_template_items',  localSessionTemplateItems, remoteSessionTemplateItemIds);
    collectOrphans('session_form_templates',       localSessionTemplates,     remoteSessionTemplateIds);
    collectOrphans('work_shifts',                  localWorkShifts,           remoteWorkShiftIds);
    collectOrphans('equipment_activities',         localEquipmentActivities,  remoteEquipmentActivityIds);
    collectOrphans('activities',                   localActivities,           remoteActivityIds);
    if (orphanV27.length > 0) {
      await database.batch(orphanV27);
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
            // Marcado como sincronizado: el push no los re-sube si el remoto los borra.
            u._raw._status = 'synced';
            u._raw._changed = '';
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

// ════════════════════════════════════════════════════════════════════════════
// v27 — Trazabilidad Operacional
// ════════════════════════════════════════════════════════════════════════════

/** Push strict para cada tabla de trazabilidad. Patrón idéntico a pushProjectSectorStrict. */
async function _pushStrict(
  table: string,
  collection: any,
  entityId: string,
  contextLabel: string,
): Promise<void> {
  const rec = await collection.find(entityId).catch(() => null);
  if (!rec) return;
  if (isLocalDeleted(rec)) return;
  const { error } = await supabase
    .from(table)
    .upsert([toRow((rec as any)._raw)], { onConflict: 'id' });
  if (error) throw new Error(`[${contextLabel}] ${error.message}`);
  // B7 — Tras upsert OK, marcar como synced mutando _raw directamente.
  // No usamos prepareUpdate porque WMDB lo reseteo a "updated" y reencolaría.
  try {
    await database.write(async () => {
      (rec as any)._raw._status = 'synced';
      (rec as any)._raw._changed = '';
    });
  } catch { /* ignorar — la marca es best-effort */ }
}

export async function pushActivityStrict(id: string)            { return _pushStrict('activities', activitiesCollection, id, 'pushActivityStrict'); }
export async function pushEquipmentActivityStrict(id: string)   { return _pushStrict('equipment_activities', equipmentActivitiesCollection, id, 'pushEquipmentActivityStrict'); }
export async function pushWorkShiftStrict(id: string)           { return _pushStrict('work_shifts', workShiftsCollection, id, 'pushWorkShiftStrict'); }
export async function pushSessionFormTemplateStrict(id: string) { return _pushStrict('session_form_templates', sessionFormTemplatesCollection, id, 'pushSessionFormTemplateStrict'); }
export async function pushSessionFormTemplateItemStrict(id: string) { return _pushStrict('session_form_template_items', sessionFormTemplateItemsCollection, id, 'pushSessionFormTemplateItemStrict'); }
export async function pushWorkSessionFormItemStrict(id: string) { return _pushStrict('work_session_form_items', workSessionFormItemsCollection, id, 'pushWorkSessionFormItemStrict'); }
export async function pushWorkSessionIntervalStrict(id: string) { return _pushStrict('work_session_intervals', workSessionIntervalsCollection, id, 'pushWorkSessionIntervalStrict'); }

/** Push de una sesión completa: la sesión + sus intervals + form items, en
 *  orden seguro para FKs. Usa partial update por _changed (patrón C5 GIS).
 *  Si la sesión es 'created', usa upsert full primero, luego incrementales. */
export async function pushWorkSessionFullStrict(sessionId: string): Promise<void> {
  const session = await workSessionsCollection.find(sessionId).catch(() => null);
  if (!session) return;
  if (isLocalDeleted(session)) return;

  const raw = (session as any)._raw;
  const status = raw._status as string | undefined;
  const changedCsv: string = (raw._changed ?? '') as string;
  const changedFields = changedCsv.split(',').map(s => s.trim()).filter(Boolean);

  // B4 — Helper: si el error remoto es 23505 (unique violation del partial
  // index sobre (equipment_id) WHERE status IN ACTIVE/PAUSED), significa que
  // OTRO device ya tiene una sesión activa para el mismo equipo. Cerramos
  // localmente la sesión como auto-closed y NO re-encolamos (la op se da por
  // resuelta — sin esto, el SyncWorker reintenta hasta MAX_ATTEMPTS).
  const handleConflict = async (): Promise<void> => {
    try {
      await database.write(async () => {
        await (session as any).update((r: any) => {
          r.status = 'CLOSED';
          r.autoClosed = true;
          r.notes = 'conflicto: equipo ya ocupado al sincronizar';
          // Fix F: setear endedAt = startedAt para que duration_ms sea 0.
          // Sin esto la sesión queda CLOSED con ended_at=null y las vistas
          // la siguen sumando como running indefinidamente.
          r.endedAt = r.startedAt;
        });
      });
    } catch { /* mejor esfuerzo */ }
  };

  if (status === 'created') {
    const { error } = await supabase
      .from('work_sessions')
      .upsert([toRow(raw)], { onConflict: 'id' });
    if (error) {
      if ((error as any).code === '23505') {
        await handleConflict();
        return;
      }
      throw new Error(`[pushWorkSessionFullStrict:create] ${error.message}`);
    }
    // B7 — Marcar synced mutando _raw directo (evita el reseteo a "updated").
    try {
      await database.write(async () => {
        raw._status = 'synced';
        raw._changed = '';
      });
    } catch { /* ignorar */ }
  } else if (changedFields.length > 0) {
    const partial: Record<string, any> = { updated_at: raw.updated_at ?? Date.now() };
    for (const f of changedFields) {
      if (f === '_status' || f === '_changed' || f === 'id') continue;
      partial[f] = raw[f];
    }
    const { error } = await supabase
      .from('work_sessions')
      .update(partial)
      .eq('id', sessionId);
    if (error) {
      if ((error as any).code === '23505') {
        await handleConflict();
        return;
      }
      throw new Error(`[pushWorkSessionFullStrict:update] ${error.message}`);
    }
    // B7 — Marcar synced mutando _raw directo.
    try {
      await database.write(async () => {
        raw._status = 'synced';
        raw._changed = '';
      });
    } catch { /* ignorar */ }
  } else {
    // Fix D4: fallback a upsert full si _changed se perdio por pull intermedio.
    // status !== 'created' y changedFields vacio: el local podria diferir del
    // remoto si un pull intermedio reseteo _changed. Hacemos upsert COMPLETO
    // defensivamente para resincronizar y marcamos synced.
    const { error } = await supabase
      .from('work_sessions')
      .upsert([toRow(raw)], { onConflict: 'id' });
    if (error) {
      if ((error as any).code === '23505') {
        await handleConflict();
        return;
      }
      throw new Error(`[pushWorkSessionFullStrict:fallback] ${error.message}`);
    }
    try {
      await database.write(async () => {
        raw._status = 'synced';
        raw._changed = '';
      });
    } catch { /* ignorar */ }
  }
}

/** Batch insert de TODOS los puntos GPS pendientes (status 'created') de una
 *  sesión. Particiona en chunks de 200 para drenado tras larga ausencia de red. */
export async function pushWorkSessionGpsBatchStrict(sessionId: string): Promise<void> {
  // Fix P7: filtrar _status='created' directamente en el query SQL (WMDB usa
  // la columna interna `_status` en el adapter SQLite, accesible vía Q.where).
  // Sin esto, una sesión con 30k puntos cargaba 30k objetos en memoria solo
  // para filtrar después en JS.
  let points: any[];
  try {
    points = await workSessionGpsPointsCollection
      .query(Q.where('session_id', sessionId), Q.where('_status', 'created'))
      .fetch();
  } catch {
    // Fix P7: fallback si WMDB no permite Q.where con columna interna —
    // se itera todo y filtra en JS (comportamiento previo). Limitación conocida.
    const all = await workSessionGpsPointsCollection
      .query(Q.where('session_id', sessionId))
      .fetch();
    points = all.filter((p: any) => p._raw._status === 'created');
  }
  // Fix D3: itera snapshot capturado, NO re-query.
  // `pending` queda fijo al inicio. Si el watcher GPS crea puntos nuevos con
  // _status='created' durante el push, esos NO entran al marcado synced del
  // loop final (porque iteramos sobre la const `pending`, no sobre una nueva
  // query). El próximo batch los procesará.
  const pending = points.filter((p: any) => p._raw._status === 'created');
  if (pending.length === 0) return;

  const CHUNK = 200;
  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK).map((p: any) => toRow(p._raw));
    const { error } = await supabase
      .from('work_session_gps_points')
      .upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(`[pushWorkSessionGpsBatchStrict:${i}] ${error.message}`);
  }
  // Marcar como synced para no re-enviar.
  // B5 — NO usar prepareUpdate aquí: prepareUpdate sobrescribe _status a
  // "updated" automáticamente, anulando nuestra marca de "synced". Mutamos
  // _raw directamente dentro del write para evitarlo.
  // Fix D3: itera snapshot capturado, NO re-query.
  await database.write(async () => {
    for (const p of pending) {
      (p as any)._raw._status = 'synced';
      (p as any)._raw._changed = '';
    }
  });
}

// ─── Delete helpers ──────────────────────────────────────────────────────────

async function _deleteStrict(table: string, id: string, label: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw new Error(`[${label}] ${error.message}`);
}

export async function deleteActivityStrict(id: string)          { return _deleteStrict('activities', id, 'deleteActivityStrict'); }
export async function deleteEquipmentActivityStrict(id: string) { return _deleteStrict('equipment_activities', id, 'deleteEquipmentActivityStrict'); }
export async function deleteWorkShiftStrict(id: string)         { return _deleteStrict('work_shifts', id, 'deleteWorkShiftStrict'); }
export async function deleteWorkSessionStrict(id: string)       { return _deleteStrict('work_sessions', id, 'deleteWorkSessionStrict'); }

// ─── Pull helpers ────────────────────────────────────────────────────────────

async function _pullByProject(table: string, collection: any, projectId: string): Promise<void> {
  const { data, error } = await supabase.from(table).select('*').eq('project_id', projectId);
  if (error || !data) return;
  const local = await collection.query(Q.where('project_id', projectId)).fetch();
  const remoteIds = new Set<string>(data.map((r: any) => r.id));
  const prepares: any[] = prepareOverride(collection, data, local);
  for (const rec of local) {
    if ((rec as any)._raw?._status === 'synced' && !remoteIds.has(rec.id)) {
      prepares.push((rec as any).prepareDestroyPermanently());
    }
  }
  await safeBatchWrite(prepares);
}

export async function pullActivities(projectId: string)            { return _pullByProject('activities', activitiesCollection, projectId); }
export async function pullWorkShifts(projectId: string)            { return _pullByProject('work_shifts', workShiftsCollection, projectId); }
export async function pullSessionFormTemplates(projectId: string)  { return _pullByProject('session_form_templates', sessionFormTemplatesCollection, projectId); }

/** Pull de work_sessions con protección local-first:
 *  NUNCA sobrescribe sesiones locales en estado ACTIVE o PAUSED — esas son
 *  trabajo en curso del operador y la verdad vive en el dispositivo. Solo se
 *  sincronizan/destruyen las CLOSED. Esto evita que el cronómetro se "reinicie"
 *  cuando entra una vista analítica que dispara pulls en background. */
export async function pullWorkSessions(projectId: string): Promise<void> {
  const { data, error } = await supabase
    .from('work_sessions').select('*').eq('project_id', projectId);
  if (error || !data) return;
  const local = await workSessionsCollection.query(Q.where('project_id', projectId)).fetch();
  const remoteIds = new Set<string>(data.map((r: any) => r.id));
  // IDs locales que están vivos (ACTIVE/PAUSED) → intocables.
  const liveLocalIds = new Set<string>(
    (local as any[])
      .filter(r => r._raw?.status === 'ACTIVE' || r._raw?.status === 'PAUSED')
      .map(r => r.id),
  );
  // Filtrar remoto: si una sesión local está viva, no la sobrescribir.
  const remoteSafe = (data as any[]).filter(r => !liveLocalIds.has(r.id));
  const prepares: any[] = prepareOverride(workSessionsCollection, remoteSafe, local);
  for (const rec of local) {
    if (liveLocalIds.has(rec.id)) continue; // intocable
    if ((rec as any)._raw?._status === 'synced' && !remoteIds.has(rec.id)) {
      prepares.push((rec as any).prepareDestroyPermanently());
    }
  }
  await safeBatchWrite(prepares);
  // Sync de intervals: nunca tocar los de sesiones vivas.
  await pullWorkSessionIntervalsSafe(projectId, liveLocalIds);
}

/** Pull de work_session_intervals respetando las sesiones vivas locales. */
async function pullWorkSessionIntervalsSafe(projectId: string, liveSessionIds: Set<string>): Promise<void> {
  // Buscar ids de sesiones del proyecto (después del pull anterior).
  const localSessions = await workSessionsCollection.query(Q.where('project_id', projectId)).fetch();
  const sessIds = (localSessions as any[]).map(s => s.id);
  if (sessIds.length === 0) return;
  // Solo pull intervals de sesiones que NO estén vivas localmente.
  const safeSessIds = sessIds.filter(id => !liveSessionIds.has(id));
  if (safeSessIds.length === 0) return;
  const { data } = await supabase
    .from('work_session_intervals').select('*').in('session_id', safeSessIds);
  if (!data) return;
  const localIntervals = await workSessionIntervalsCollection
    .query(Q.where('session_id', Q.oneOf(safeSessIds))).fetch();
  const prepares = prepareOverride(workSessionIntervalsCollection, data, localIntervals);
  await safeBatchWrite(prepares);
}
/** Pull de catálogo de equipos del proyecto. Necesario antes de
 *  pullEquipmentActivities cuando los equipos se cargaron desde otra plataforma
 *  (ej. xlsx subido en web) y aún no han bajado al móvil. */
export async function pullEquipment(projectId: string)             { return _pullByProject('equipment', equipmentCollection, projectId); }

/** Fix P2: Pull de work_sessions ACOTADO al user actual y a las últimas N días.
 *  Para uso en pantallas mobile (ej. TraceabilityHomeScreen) donde no tiene
 *  sentido descargar las 11k sesiones del proyecto entero.
 *  NO sustituye pullWorkSessions (web/full sync sigue necesitando todo). */
export async function pullMyWorkSessions(
  projectId: string,
  userId: string,
  sinceDays: number = 30,
): Promise<void> {
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const { data, error } = await supabase
    .from('work_sessions')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .gte('started_at', cutoff);
  if (error || !data) return;
  const local = await workSessionsCollection.query(
    Q.where('project_id', projectId),
    Q.where('user_id', userId),
    Q.where('started_at', Q.gte(cutoff)),
  ).fetch();
  const remoteIds = new Set<string>(data.map((r: any) => r.id));
  // Local-first: nunca sobrescribir ACTIVE/PAUSED — el cronómetro del operador
  // depende de los intervals locales y se "reiniciaba" si pulleábamos versión stale.
  const liveLocalIds = new Set<string>(
    (local as any[])
      .filter(r => r._raw?.status === 'ACTIVE' || r._raw?.status === 'PAUSED')
      .map(r => r.id),
  );
  const remoteSafe = (data as any[]).filter(r => !liveLocalIds.has(r.id));
  const prepares: any[] = prepareOverride(workSessionsCollection, remoteSafe, local);
  for (const rec of local) {
    if (liveLocalIds.has(rec.id)) continue;
    if ((rec as any)._raw?._status === 'synced' && !remoteIds.has(rec.id)) {
      prepares.push((rec as any).prepareDestroyPermanently());
    }
  }
  await safeBatchWrite(prepares);
}

/** Pull de equipment_activities por proyecto (no tiene project_id directo;
 *  filtramos por equipos del proyecto). */
export async function pullEquipmentActivities(projectId: string): Promise<void> {
  const localEquip = await equipmentCollection.query(Q.where('project_id', projectId)).fetch();
  const equipIds = localEquip.map((e: any) => e.id);
  if (equipIds.length === 0) return;
  const { data, error } = await supabase
    .from('equipment_activities').select('*').in('equipment_id', equipIds);
  if (error || !data) return;
  const local = await equipmentActivitiesCollection
    .query(Q.where('equipment_id', Q.oneOf(equipIds)))
    .fetch();
  const remoteIds = new Set<string>(data.map((r: any) => r.id));
  const prepares: any[] = prepareOverride(equipmentActivitiesCollection, data, local);
  for (const rec of local) {
    if ((rec as any)._raw?._status === 'synced' && !remoteIds.has(rec.id)) {
      prepares.push((rec as any).prepareDestroyPermanently());
    }
  }
  await safeBatchWrite(prepares);
}

/** Pull de session_form_template_items por proyecto (via templates). */
export async function pullSessionFormTemplateItems(projectId: string): Promise<void> {
  const tmpls = await sessionFormTemplatesCollection
    .query(Q.where('project_id', projectId)).fetch();
  const tmplIds = tmpls.map((t: any) => t.id);
  if (tmplIds.length === 0) return;
  const { data, error } = await supabase
    .from('session_form_template_items').select('*').in('template_id', tmplIds);
  if (error || !data) return;
  const local = await sessionFormTemplateItemsCollection
    .query(Q.where('template_id', Q.oneOf(tmplIds))).fetch();
  const remoteIds = new Set<string>(data.map((r: any) => r.id));
  const prepares: any[] = prepareOverride(sessionFormTemplateItemsCollection, data, local);
  for (const rec of local) {
    if ((rec as any)._raw?._status === 'synced' && !remoteIds.has(rec.id)) {
      prepares.push((rec as any).prepareDestroyPermanently());
    }
  }
  await safeBatchWrite(prepares);
}

/** Lock de equipo (decisión #10): retorna info de la sesión ocupante si
 *  existe una ACTIVE o PAUSED sobre el equipo en cualquier device. */
export async function isEquipmentLocked(
  equipmentId: string,
): Promise<{ locked: false } | { locked: true; sessionId: string; userId: string; startedAt: number }> {
  // Check primero local (offline-friendly)
  const localActive = await workSessionsCollection
    .query(
      Q.where('equipment_id', equipmentId),
      Q.or(Q.where('status', 'ACTIVE'), Q.where('status', 'PAUSED')),
    )
    .fetch();
  if (localActive.length > 0) {
    const s = localActive[0] as any;
    return { locked: true, sessionId: s.id, userId: s.userId, startedAt: s.startedAt };
  }
  // Si hay red, verificar remoto también
  try {
    const { data, error } = await supabase
      .from('work_sessions')
      .select('id, user_id, started_at, status')
      .eq('equipment_id', equipmentId)
      .in('status', ['ACTIVE', 'PAUSED'])
      .limit(1);
    if (error || !data || data.length === 0) return { locked: false };
    return { locked: true, sessionId: data[0].id, userId: data[0].user_id, startedAt: data[0].started_at };
  } catch {
    return { locked: false };
  }
}

/** Cierra sesiones del user actual que llevan >24h sin actividad. Llamar al
 *  login y opcionalmente cada hora. Marca `auto_closed=true`. */
export async function closeStaleSessions(userId: string, deviceId: string): Promise<number> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const stale = await workSessionsCollection.query(
    Q.where('user_id', userId),
    Q.or(Q.where('status', 'ACTIVE'), Q.where('status', 'PAUSED')),
    Q.where('updated_at', Q.lt(cutoff)),
  ).fetch();

  if (stale.length === 0) return 0;
  let closed = 0;
  for (const s of stale as any[]) {
    // Solo cerramos las que se iniciaron en este device (decisión #12).
    // Fix E: si startedOnDeviceId es null/undefined NO debemos cerrarla — no
    // sabemos si somos el originador. Solo continuar el cierre cuando es
    // DEFINITIVAMENTE este device.
    if (!s.startedOnDeviceId || s.startedOnDeviceId !== deviceId) continue;

    // Fix D5: serializar el cierre de cada sesión bajo el mismo lock que usa
    // WorkSessionService para sus mutaciones (batch GPS + stop + enqueue).
    // require() lazy para evitar ciclos de import.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const wss = require('./WorkSessionService');
    const withSessionLock = wss?.withSessionLock;

    const closeOne = async () => {
      const lastInterval = await workSessionIntervalsCollection
        .query(Q.where('session_id', s.id), Q.where('ended_at', Q.eq(null as any)))
        .fetch();
      const lastGps = await workSessionGpsPointsCollection
        .query(Q.where('session_id', s.id), Q.sortBy('captured_at', Q.desc), Q.take(1))
        .fetch();
      const lastGpsAt = Number(lastGps[0] ? (lastGps[0] as any).capturedAt : 0) || 0;
      const lastIntervalStart = Number(lastInterval[0] ? (lastInterval[0] as any).startedAt : 0) || 0;
      // A5 — Cálculo robusto de endTs: s.updatedAt puede ser Date | number | undefined.
      // Convertir explícitamente, y usar `cutoff` (now-24h) como fallback en lugar de 0
      // para que el endedAt nunca quede en epoch 1970.
      let updatedAtNum = 0;
      const ua = (s as any).updatedAt;
      if (typeof ua === 'number') updatedAtNum = ua;
      else if (ua instanceof Date) updatedAtNum = ua.getTime();
      else if (ua != null) {
        const n = Number(ua);
        if (Number.isFinite(n)) updatedAtNum = n;
      }
      const candidates = [lastGpsAt, lastIntervalStart, updatedAtNum].filter((v) => Number.isFinite(v) && v > 0);
      const endTs = candidates.length > 0 ? Math.max(...candidates) : cutoff;

      await database.write(async () => {
        const ops: any[] = [];
        if (lastInterval[0]) {
          ops.push((lastInterval[0] as any).prepareUpdate((r: any) => { r.endedAt = endTs; }));
        }
        ops.push(s.prepareUpdate((r: any) => {
          r.status = 'CLOSED';
          r.endedAt = endTs;
          r.autoClosed = true;
        }));
        await database.batch(ops);
      });

      // A1 — Detener trackers GPS de la sesión cerrada (foreground + background).
      // Fix D1: pasar projectId como 2do arg. Sin él, flushGpsBatch encola
      // PUSH_WORK_SESSION_GPS_BATCH con projectId undefined, corrompiendo la fila.
      try {
        if (wss && typeof wss.stopTrackerForSession === 'function') {
          await wss.stopTrackerForSession(s.id, s.projectId).catch(() => {});
        }
      } catch { /* módulo no disponible — ignorar */ }
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const blt = require('./BackgroundLocationTask');
        if (blt && typeof blt.stopBackgroundTracking === 'function') {
          await blt.stopBackgroundTracking().catch(() => {});
        }
      } catch { /* módulo no disponible — ignorar */ }

      // B3 — Encolar push de la sesión cerrada (y el interval cerrado si aplica)
      // para que el cambio de estado llegue a Supabase aunque el cierre stale
      // ocurra offline.
      try {
        await enqueueSync({
          opType: 'PUSH_WORK_SESSION',
          entityId: s.id,
          projectId: s.projectId,
        });
      } catch { /* sin DB write disponible — ignorar */ }
      if (lastInterval[0]) {
        try {
          await enqueueSync({
            opType: 'PUSH_WORK_SESSION_INTERVAL',
            entityId: (lastInterval[0] as any).id,
            projectId: s.projectId,
          });
        } catch { /* ignorar */ }
      }
    };

    // Fix D5: envolver con withSessionLock si está disponible. Si no (módulo
    // no carga o no exporta), degradamos a ejecutar sin lock para no bloquear
    // el cleanup de stales.
    if (typeof withSessionLock === 'function') {
      await withSessionLock(s.id, closeOne).catch(() => {});
    } else {
      await closeOne().catch(() => {});
    }

    closed++;
  }

  // Fix G: tras el loop, si NO cerramos ninguna de las nuestras pero quedaron
  // trackers GPS en memoria de sesiones que ya no son nuestras (caso hot-reload
  // + deviceId cambio), detener tracking en background defensivamente. Esto
  // evita que el watcher siga capturando puntos para una sesión que cambió de
  // dueño/device. TODO: refactor para consultar activeTrackers map y detener
  // solo los que correspondan a sessionIds no-nuestros.
  try {
    // Solo si no cerramos nada nuestro: si cerramos algo, stopBackgroundTracking
    // ya se invocó dentro del loop. Si stale.length>0 pero closed===0 → todas
    // las stale eran de otro device.
    if (stale.length > 0 && closed === 0) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const blt = require('./BackgroundLocationTask');
      if (blt && typeof blt.stopBackgroundTracking === 'function') {
        await blt.stopBackgroundTracking().catch(() => {});
      }
    }
  } catch { /* módulo no disponible — ignorar */ }

  return closed;
}
