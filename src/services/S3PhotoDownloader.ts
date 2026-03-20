/**
 * S3PhotoDownloader
 *
 * Descarga fotos de S3 que aún no existen localmente.
 *
 * Estrategia:
 *   - El path local es DETERMINÍSTICO: documentDirectory/photos/{filename_del_s3_key}
 *     Ej: "projects/obra/photos/proto-F001.jpg" → ".../photos/proto-F001.jpg"
 *   - Si el archivo ya está en ese path, solo actualiza local_uri sin descargar.
 *   - Si no está, descarga de S3 y actualiza local_uri.
 *   - El archivo en S3 NUNCA se elimina (mantiene secuencia de codificación).
 */

import * as FileSystem from 'expo-file-system';
import { Q } from '@nozbe/watermelondb';
import {
  database,
  evidencesCollection,
  protocolItemsCollection,
  protocolsCollection,
  annotationCommentPhotosCollection,
  annotationCommentsCollection,
  planAnnotationsCollection,
  plansCollection,
} from '@db/index';
import { downloadFromS3 } from './S3Service';

const PHOTOS_DIR = `${FileSystem.documentDirectory}photos/`;

async function ensurePhotosDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PHOTOS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
  }
}

/** Extrae el nombre de archivo de un s3Key: "a/b/c/foto.jpg" → "foto.jpg" */
function s3KeyToFilename(s3Key: string): string {
  return s3Key.split('/').pop() ?? s3Key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Para una foto (evidencia o annotation_comment_photo), asegura que el archivo
 * esté disponible localmente y que local_uri apunte al path correcto.
 *
 * @param record     Registro WatermelonDB (evidence o annotation_comment_photo)
 * @param s3Key      Valor de s3_url_placeholder / storage_path
 * @param localUri   Valor actual de local_uri en el registro
 */
async function ensurePhotoLocal(
  record: any,
  s3Key: string,
  localUri: string | null
): Promise<void> {
  const standardPath = `${PHOTOS_DIR}${s3KeyToFilename(s3Key)}`;

  // 1. Si local_uri ya apunta a un archivo que existe → ok, sin cambios
  if (localUri) {
    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists) return;
  }

  // 2. El path estándar ya tiene el archivo (descargado en sesión anterior)
  const standardInfo = await FileSystem.getInfoAsync(standardPath);
  if (!standardInfo.exists) {
    // 3. Descargar de S3
    await downloadFromS3(s3Key, standardPath);
  }

  // 4. Actualizar local_uri si es diferente
  if (localUri !== standardPath) {
    await database.write(async () => {
      await record.update((r: any) => {
        r.localUri = standardPath;
      });
    });
  }
}

// ─── Evidencias de protocolo ──────────────────────────────────────────────────

async function downloadMissingEvidences(projectId: string): Promise<void> {
  const protocols = await protocolsCollection
    .query(Q.where('project_id', projectId))
    .fetch();
  if (protocols.length === 0) return;

  const pIds = protocols.map((p) => p.id);
  const items = await protocolItemsCollection
    .query(Q.where('protocol_id', Q.oneOf(pIds)))
    .fetch();
  if (items.length === 0) return;

  const iIds = items.map((i) => i.id);
  const evidences = await evidencesCollection
    .query(Q.where('protocol_item_id', Q.oneOf(iIds)))
    .fetch();

  for (const ev of evidences) {
    const evAny = ev as any;
    const s3Key: string | null = evAny.s3UrlPlaceholder ?? null;
    if (!s3Key) continue; // aún no subida

    try {
      await ensurePhotoLocal(ev, s3Key, evAny.localUri ?? null);
    } catch {
      // sin conectividad o error puntual — continuar con la siguiente
    }
  }
}

// ─── Fotos de comentarios de anotación ───────────────────────────────────────

async function downloadMissingAnnotationPhotos(projectId: string): Promise<void> {
  const plans = await plansCollection
    .query(Q.where('project_id', projectId))
    .fetch();
  if (plans.length === 0) return;

  const planIds = plans.map((p) => p.id);
  const annotations = await planAnnotationsCollection
    .query(Q.where('plan_id', Q.oneOf(planIds)))
    .fetch();
  if (annotations.length === 0) return;

  const aIds = annotations.map((a) => a.id);
  const comments = await annotationCommentsCollection
    .query(Q.where('annotation_id', Q.oneOf(aIds)))
    .fetch();
  if (comments.length === 0) return;

  const cIds = comments.map((c) => c.id);
  const photos = await annotationCommentPhotosCollection
    .query(Q.where('annotation_comment_id', Q.oneOf(cIds)))
    .fetch();

  for (const photo of photos) {
    const photoAny = photo as any;
    const s3Key: string | null = photoAny.storagePath ?? null;
    if (!s3Key) continue; // aún no subida

    try {
      await ensurePhotoLocal(photo, s3Key, photoAny.localUri ?? null);
    } catch {
      // sin conectividad — continuar
    }
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Descarga en background todas las fotos del proyecto que no estén
 * disponibles localmente. Llama después de pullProjectFromCloud.
 */
export async function downloadMissingPhotosForProject(projectId: string): Promise<void> {
  try {
    await ensurePhotosDir();
    await Promise.all([
      downloadMissingEvidences(projectId),
      downloadMissingAnnotationPhotos(projectId),
    ]);
  } catch {
    // Error global — no bloquea nada
  }
}
