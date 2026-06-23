/**
 * s3Project.ts — Operaciones S3 a nivel PROYECTO (server-side).
 *
 * Para el export/borrado/restore de un proyecto completo necesitamos:
 *  - listar TODOS los objetos del proyecto (varios prefijos),
 *  - descargar sus bytes (para el .zip de respaldo),
 *  - re-subirlos (al restaurar),
 *  - borrarlos por prefijo (al eliminar de raíz, sin huérfanos).
 *
 * Las keys del proyecto viven bajo `projects/<segName>/...`. OJO: el segmento se
 * genera con DOS saneos distintos (web `sanitizeSegment` y móvil `sanitizeProjectName`),
 * así que listamos/borramos AMBOS. Los logos van en `logos/project_<projectId>/`
 * (por id, estable). Las firmas `signatures/<userId>/` son GLOBALES/compartidas y
 * NUNCA se tocan; tampoco `backups/`.
 */
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { sanitizeSegment } from '@lib/s3-upload';

const s3 = new S3Client({
  region: process.env.NEXT_PUBLIC_AWS_REGION!,
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!,
  },
});
const BUCKET = process.env.NEXT_PUBLIC_AWS_BUCKET!;

/** Saneo de nombre de proyecto IDÉNTICO al de la app móvil (src/config/aws.ts). */
function sanitizeProjectNameMobile(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 80);
}

/** Nunca borrar/exportar estos prefijos (globales/compartidos). */
function isProtectedKey(key: string): boolean {
  return key.startsWith('backups/') || key.startsWith('signatures/');
}

/** Prefijos S3 que pertenecen a un proyecto (ambos saneos + logo por id). */
export function projectS3Prefixes(projectName: string, projectId: string): string[] {
  const segs = new Set<string>();
  const w = sanitizeSegment(projectName); if (w) segs.add(w);
  const m = sanitizeProjectNameMobile(projectName); if (m) segs.add(m);
  const out: string[] = [];
  segs.forEach(s => out.push(`projects/${s}/`));
  if (projectId) out.push(`logos/project_${projectId}/`);
  return out;
}

/** Lista todas las keys bajo un prefijo (paginado). */
export async function listKeysUnderPrefix(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const resp = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }));
    for (const o of resp.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

/** Cantidad de objetos + bytes totales de un proyecto (para el resumen de impacto). */
export async function listProjectS3Stats(projectName: string, projectId: string): Promise<{ count: number; bytes: number }> {
  const seen = new Set<string>();
  let bytes = 0;
  for (const prefix of projectS3Prefixes(projectName, projectId)) {
    let token: string | undefined;
    do {
      const resp = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }));
      for (const o of resp.Contents ?? []) {
        if (!o.Key || isProtectedKey(o.Key) || seen.has(o.Key)) continue;
        seen.add(o.Key); bytes += o.Size ?? 0;
      }
      token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (token);
  }
  return { count: seen.size, bytes };
}

/** Todas las keys de un proyecto (dedupe entre prefijos; excluye protegidas). */
export async function listProjectS3Keys(projectName: string, projectId: string): Promise<string[]> {
  const all = new Set<string>();
  for (const p of projectS3Prefixes(projectName, projectId)) {
    const keys = await listKeysUnderPrefix(p);
    for (const k of keys) if (!isProtectedKey(k)) all.add(k);
  }
  return Array.from(all);
}

/** Descarga los bytes de un objeto. */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  // aws-sdk v3: el Body es un SdkStream con helper transformToByteArray().
  return (resp.Body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
}

/** Sube bytes a una key. */
export async function putObjectBytes(key: string, bytes: Uint8Array, contentType?: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: bytes, ContentType: contentType }));
}

/** Borra una lista de keys en lotes de 1000 (DeleteObjects). Best-effort. */
export async function deleteKeys(keys: string[]): Promise<number> {
  const target = keys.filter(k => k && !isProtectedKey(k));
  let deleted = 0;
  for (let i = 0; i < target.length; i += 1000) {
    const chunk = target.slice(i, i + 1000);
    if (!chunk.length) continue;
    try {
      await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: chunk.map(Key => ({ Key })), Quiet: true } }));
      deleted += chunk.length;
    } catch (e) {
      console.warn('[s3Project] no se pudo borrar lote', e);
    }
  }
  return deleted;
}

/** Borra TODOS los objetos de un proyecto (por prefijo). Best-effort. */
export async function deleteProjectS3(projectName: string, projectId: string): Promise<number> {
  const keys = await listProjectS3Keys(projectName, projectId);
  return deleteKeys(keys);
}

/** content-type por extensión (para re-subir al restaurar). */
export function contentTypeForKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'pdf': return 'application/pdf';
    case 'json': return 'application/json';
    default: return 'application/octet-stream';
  }
}
