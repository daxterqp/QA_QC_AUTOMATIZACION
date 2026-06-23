/**
 * projectBackup.ts — Export/Import de un PROYECTO completo (base + archivos S3).
 *
 * EXPORT: recolecta TODAS las filas del proyecto (tablas con project_id + hijas
 * vía sus padres) y arma un .zip { manifest.json, project.json, files/<key S3> }.
 * Es el respaldo restaurable (el "deshacer" del borrado de raíz).
 *
 * IMPORT: lee el .zip y hace UPSERT por id (idempotente) en orden FK-seguro, y
 * re-sube los archivos a sus keys S3 originales. Saneo de referencias a `users`
 * por si se restaura en una base donde algún usuario ya no existe.
 *
 * Corre SOLO server-side (rutas API). Con el client autenticado (anon+JWT) un
 * CREATOR puede leer/insertar todo por RLS (can_access_project corta para creator).
 */
import JSZip from 'jszip';
import { listProjectS3Objects, getObjectBytes, putObjectBytes, contentTypeForKey } from '@lib/s3Project';
import { readLocalIfFresh, writeLocalCache } from '@lib/localCache';

type Supa = any; // SupabaseClient (SSR) — dinámico, evitamos fricción de tipos.
type Rows = Record<string, any[]>;

const CHUNK = 150; // límite por .in()/.upsert() (URL/payload)

async function fetchByProject(supabase: Supa, table: string, projectId: string): Promise<any[]> {
  const { data, error } = await supabase.from(table).select('*').eq('project_id', projectId);
  if (error) throw new Error(`leer ${table}: ${error.message}`);
  return data ?? [];
}
async function fetchByIn(supabase: Supa, table: string, col: string, ids: string[]): Promise<any[]> {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (!uniq.length) return [];
  const out: any[] = [];
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const { data, error } = await supabase.from(table).select('*').in(col, uniq.slice(i, i + CHUNK));
    if (error) throw new Error(`leer ${table}: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}
const idsOf = (rows: any[]) => rows.map(r => r.id).filter(Boolean);
function dedupById(rows: any[]): any[] {
  const m = new Map<string, any>();
  for (const r of rows) if (r?.id) m.set(r.id, r);
  return Array.from(m.values());
}

/** Recolecta TODAS las filas que cuelgan del proyecto. */
export async function collectProjectRows(supabase: Supa, projectId: string): Promise<Rows> {
  const rows: Rows = {};
  const { data: proj } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
  rows.projects = proj ? [proj] : [];

  rows.protocol_templates = await fetchByProject(supabase, 'protocol_templates', projectId);
  rows.protocol_template_items = await fetchByIn(supabase, 'protocol_template_items', 'template_id', idsOf(rows.protocol_templates));
  rows.protocols = await fetchByProject(supabase, 'protocols', projectId);
  const protocolIds = idsOf(rows.protocols);
  rows.protocol_items = await fetchByIn(supabase, 'protocol_items', 'protocol_id', protocolIds);
  rows.evidences = await fetchByIn(supabase, 'evidences', 'protocol_item_id', idsOf(rows.protocol_items));
  rows.protocol_approvals = await fetchByIn(supabase, 'protocol_approvals', 'protocol_id', protocolIds);
  rows.protocol_equipment = await fetchByIn(supabase, 'protocol_equipment', 'protocol_id', protocolIds);
  rows.non_conformities = await fetchByProject(supabase, 'non_conformities', projectId);
  rows.protocol_summary_rows = await fetchByProject(supabase, 'protocol_summary_rows', projectId);
  rows.locations = await fetchByProject(supabase, 'locations', projectId);
  rows.plans = await fetchByProject(supabase, 'plans', projectId);
  const planIds = idsOf(rows.plans);
  rows.plan_annotations = dedupById([
    ...await fetchByIn(supabase, 'plan_annotations', 'plan_id', planIds),
    ...await fetchByIn(supabase, 'plan_annotations', 'protocol_id', protocolIds),
  ]);
  rows.plan_measurements = await fetchByIn(supabase, 'plan_measurements', 'plan_id', planIds);
  rows.annotation_comments = await fetchByIn(supabase, 'annotation_comments', 'annotation_id', idsOf(rows.plan_annotations));
  rows.annotation_comment_photos = await fetchByIn(supabase, 'annotation_comment_photos', 'annotation_comment_id', idsOf(rows.annotation_comments));
  rows.phone_contacts = await fetchByProject(supabase, 'phone_contacts', projectId);
  rows.equipment = await fetchByProject(supabase, 'equipment', projectId);
  rows.activities = await fetchByProject(supabase, 'activities', projectId);
  rows.equipment_activities = dedupById([
    ...await fetchByIn(supabase, 'equipment_activities', 'equipment_id', idsOf(rows.equipment)),
    ...await fetchByIn(supabase, 'equipment_activities', 'activity_id', idsOf(rows.activities)),
  ]);
  rows.project_sectors = await fetchByProject(supabase, 'project_sectors', projectId);
  rows.work_shifts = await fetchByProject(supabase, 'work_shifts', projectId);
  rows.session_form_templates = await fetchByProject(supabase, 'session_form_templates', projectId);
  rows.session_form_template_items = await fetchByIn(supabase, 'session_form_template_items', 'template_id', idsOf(rows.session_form_templates));
  rows.work_sessions = await fetchByProject(supabase, 'work_sessions', projectId);
  const sessionIds = idsOf(rows.work_sessions);
  rows.work_session_intervals = await fetchByIn(supabase, 'work_session_intervals', 'session_id', sessionIds);
  rows.work_session_form_items = await fetchByIn(supabase, 'work_session_form_items', 'session_id', sessionIds);
  rows.work_session_gps_points = await fetchByIn(supabase, 'work_session_gps_points', 'session_id', sessionIds);
  rows.samples = await fetchByProject(supabase, 'samples', projectId);
  rows.lab_aux_tables = await fetchByProject(supabase, 'lab_aux_tables', projectId);
  rows.dashboard_notes = await fetchByProject(supabase, 'dashboard_notes', projectId);
  rows.recycle_bin = await fetchByProject(supabase, 'recycle_bin', projectId);
  rows.user_project_access = await fetchByProject(supabase, 'user_project_access', projectId);
  return rows;
}

export function rowCounts(rows: Rows): Record<string, number> {
  const c: Record<string, number> = {};
  for (const k of Object.keys(rows)) c[k] = rows[k]?.length ?? 0;
  return c;
}

// Orden de INSERCIÓN (padres → hijos) que respeta los FK reales del esquema.
const INSERT_ORDER = [
  'projects',
  'locations', 'project_sectors', 'work_shifts', 'activities', 'equipment',
  'protocol_templates', 'protocol_template_items',
  'session_form_templates', 'session_form_template_items',
  'equipment_activities',
  'protocols', 'protocol_items', 'evidences', 'protocol_approvals', 'protocol_equipment',
  'non_conformities', 'protocol_summary_rows',
  'plans', 'plan_annotations', 'plan_measurements', 'annotation_comments', 'annotation_comment_photos',
  'work_sessions', 'work_session_intervals', 'work_session_form_items', 'work_session_gps_points',
  'phone_contacts', 'samples', 'lab_aux_tables', 'dashboard_notes', 'recycle_bin',
  'user_project_access',
];

export interface BackupManifest {
  projectId: string;
  projectName: string;
  exportedAt: string;
  appNote: string;
  schema: 'project-backup-v1';
  counts: Record<string, number>;
  s3FileCount: number;
  /** Cuántos archivos salieron del caché local vs hubo que bajar de S3. */
  filesFromCache?: number;
  filesFromS3?: number;
}
export interface BuiltZip { buffer: Buffer; manifest: BackupManifest; failedFiles: number; }

/** Arma el .zip de respaldo (base + archivos S3).
 *  CACHÉ-PRIMERO: por cada archivo, si está en el caché local (D:\Flow-QAQC) y su
 *  tamaño coincide con S3 → se lee del disco (sin egress); si no, se baja de S3 y
 *  se deja en el caché (write-through). Si un archivo no se obtiene por NINGUNA
 *  vía, se cuenta como fallo y el llamador DEBE abortar el borrado. */
export async function buildProjectZip(supabase: Supa, project: { id: string; name: string }, exportedAt: string): Promise<BuiltZip> {
  const rows = await collectProjectRows(supabase, project.id);
  const objects = await listProjectS3Objects(project.name, project.id);

  const zip = new JSZip();

  let failedFiles = 0, filesFromCache = 0, filesFromS3 = 0;
  for (const { key, size } of objects) {
    // 1) caché local si el tamaño coincide (integridad); 2) si no, S3 + write-through.
    let bytes = readLocalIfFresh(key, size);
    if (bytes) {
      filesFromCache++;
    } else {
      try {
        bytes = await getObjectBytes(key);
        filesFromS3++;
        await writeLocalCache(key, bytes); // abarata futuros exports
      } catch (e) {
        failedFiles++;
        console.warn('[projectBackup] no se pudo obtener', key, e);
        continue;
      }
    }
    zip.file(`files/${key}`, bytes);
  }

  const manifest: BackupManifest = {
    projectId: project.id,
    projectName: project.name,
    exportedAt,
    appNote: 'Flow-QA/QC — respaldo de proyecto (base + archivos S3). Restaurable con "Importar proyecto".',
    schema: 'project-backup-v1',
    counts: rowCounts(rows),
    s3FileCount: objects.length,
    filesFromCache,
    filesFromS3,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('project.json', JSON.stringify({ rows }));

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { buffer, manifest, failedFiles };
}

export interface ParsedBackup { manifest: BackupManifest; rows: Rows; zip: JSZip; }

export async function parseProjectZip(buffer: Buffer): Promise<ParsedBackup> {
  const zip = await JSZip.loadAsync(buffer);
  const manifestFile = zip.file('manifest.json');
  const projectFile = zip.file('project.json');
  if (!manifestFile || !projectFile) throw new Error('No es un respaldo de proyecto válido (falta manifest.json / project.json).');
  const manifest = JSON.parse(await manifestFile.async('string')) as BackupManifest;
  if (manifest.schema !== 'project-backup-v1') throw new Error('Versión de respaldo no soportada.');
  const parsed = JSON.parse(await projectFile.async('string')) as { rows: Rows };
  return { manifest, rows: parsed.rows ?? {}, zip };
}

/** Restaura un proyecto desde su .zip: upsert idempotente + re-subir archivos. */
export async function restoreFromZip(supabase: Supa, buffer: Buffer): Promise<{ projectId: string; projectName: string; inserted: Record<string, number>; adjusted: Record<string, number>; filesUploaded: number }> {
  const { manifest, rows, zip } = await parseProjectZip(buffer);
  if (!manifest.projectId) throw new Error('Respaldo sin projectId.');

  // Saneo de referencias a `users` (si se restaura donde algún usuario no existe).
  const adjusted: Record<string, number> = {};
  const { data: userData } = await supabase.from('users').select('id');
  const validUsers = new Set<string>((userData ?? []).map((u: any) => u.id));
  const nullIfMissing = (arr: any[] | undefined, col: string) => {
    let n = 0;
    for (const r of arr ?? []) if (r[col] && !validUsers.has(r[col])) { r[col] = null; n++; }
    if (n) adjusted[`${col}=null`] = n;
  };
  nullIfMissing(rows.protocols, 'imported_by_id');
  nullIfMissing(rows.protocol_approvals, 'signer_id');
  if (rows.user_project_access) {
    const before = rows.user_project_access.length;
    rows.user_project_access = rows.user_project_access.filter(r => !r.user_id || validUsers.has(r.user_id));
    if (before !== rows.user_project_access.length) adjusted['user_project_access_skipped'] = before - rows.user_project_access.length;
  }
  if (rows.work_sessions) {
    const drop = new Set<string>(rows.work_sessions.filter(r => r.user_id && !validUsers.has(r.user_id)).map(r => r.id));
    if (drop.size) {
      adjusted['work_sessions_skipped'] = drop.size;
      rows.work_sessions = rows.work_sessions.filter(r => !drop.has(r.id));
      for (const tlbl of ['work_session_intervals', 'work_session_form_items', 'work_session_gps_points']) {
        rows[tlbl] = (rows[tlbl] ?? []).filter(r => !drop.has(r.session_id));
      }
    }
  }

  // Upsert por id, en orden FK-seguro.
  const inserted: Record<string, number> = {};
  for (const table of INSERT_ORDER) {
    const data = rows[table];
    if (!data?.length) continue;
    for (let i = 0; i < data.length; i += CHUNK) {
      const { error } = await supabase.from(table).upsert(data.slice(i, i + CHUNK), { onConflict: 'id' });
      if (error) throw new Error(`restaurar ${table}: ${error.message}`);
    }
    inserted[table] = data.length;
  }

  // Re-subir archivos a S3 (a su key original).
  let filesUploaded = 0;
  const entries: { key: string; file: any }[] = [];
  zip.forEach((relPath, file) => {
    if (relPath.startsWith('files/') && !file.dir) entries.push({ key: relPath.slice('files/'.length), file });
  });
  for (const { key, file } of entries) {
    try {
      const bytes = await file.async('uint8array');
      await putObjectBytes(key, bytes, contentTypeForKey(key));
      filesUploaded++;
    } catch (e) {
      console.warn('[projectBackup] no se pudo re-subir', key, e);
    }
  }

  return { projectId: manifest.projectId, projectName: manifest.projectName, inserted, adjusted, filesUploaded };
}
