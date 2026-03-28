/**
 * S3PhotoService
 *
 * Sube fotos de campo a S3 con la convención de nombres:
 *
 *   Evidencias de protocolo:
 *     projects/{projectName}/photos/{protocolNumber}-{location}-F001.jpg
 *     projects/{projectName}/photos/{protocolNumber}-{location}-F002.jpg  ...
 *
 *   Fotos de comentarios de observación:
 *     projects/{projectName}/photos/obs-{annotationId}-F001.jpg
 *     projects/{projectName}/photos/obs-{annotationId}-F002.jpg ...
 *
 * El S3 key generado se almacena en s3UrlPlaceholder (evidencias)
 * o storagePath (annotation_comment_photos).
 */

import { Q } from '@nozbe/watermelondb';
import {
  protocolItemsCollection,
  protocolsCollection,
  projectsCollection,
  locationsCollection,
  evidencesCollection,
  annotationCommentsCollection,
  planAnnotationsCollection,
  plansCollection,
  annotationCommentPhotosCollection,
} from '@db/index';
import { uploadToS3 } from './S3Service';
import { s3ProjectPrefix } from '@config/aws';

/** Formatea número de secuencia a 3 dígitos: 1 → "001" */
function seq(n: number): string {
  return String(n).padStart(3, '0');
}

/** Sanitiza un texto para uso seguro en nombre de archivo S3 */
function sanitizeSegment(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // quitar tildes
    .replace(/[^a-zA-Z0-9._-]/g, '_') // reemplazar caracteres especiales
    .replace(/_+/g, '_')              // colapsar underscores consecutivos
    .replace(/^_|_$/g, '')            // quitar underscore al inicio/fin
    .slice(0, 60);
}

// ─── Evidencias de protocolo ─────────────────────────────────────────────────

/**
 * Sube la foto de una evidencia a S3 y actualiza el registro.
 * Naming: {protocolId}-F001.jpg, F002, F003 ...
 *
 * Llamar DESPUÉS de comprimir la imagen.
 */
export async function uploadEvidencePhoto(evidenceId: string, localUri: string): Promise<void> {
  // Cadena: evidence → protocolItem → protocol → location → project
  const evidence = await evidencesCollection.find(evidenceId);
  const protocolItem = await protocolItemsCollection.find(evidence.protocolItemId);
  const protocol = await protocolsCollection.find(protocolItem.protocolId!);
  const project = await projectsCollection.find(protocol.projectId);
  const prefix = s3ProjectPrefix(project.name);

  // Obtener nombre de ubicación
  let locationSegment = 'SIN_UBICACION';
  if (protocol.locationId) {
    try {
      const locs = await locationsCollection.query(Q.where('id', protocol.locationId)).fetch();
      if (locs.length > 0) locationSegment = sanitizeSegment(locs[0].name);
    } catch { /* usar fallback */ }
  } else if (protocol.locationReference) {
    locationSegment = sanitizeSegment(protocol.locationReference);
  }

  // Contar todas las evidencias de este protocolo para determinar posición
  const allItems = await protocolItemsCollection
    .query(Q.where('protocol_id', protocol.id))
    .fetch();
  const allItemIds = allItems.map((i) => i.id);
  const allEvidences = await evidencesCollection
    .query(Q.where('protocol_item_id', Q.oneOf(allItemIds)))
    .fetch();

  // Posición 1-based de esta evidencia en el protocolo
  const position = allEvidences.findIndex((e) => e.id === evidenceId) + 1;
  const protocolSegment = sanitizeSegment(protocol.protocolNumber || protocol.id);
  const s3Key = `${prefix}/photos/${protocolSegment}-${locationSegment}-F${seq(position)}.jpg`;

  // Subir a S3
  await uploadToS3(localUri, s3Key, 'image/jpeg');

  // Actualizar registro con S3 key y marcar como SYNCED
  await evidencesCollection.database.write(async () => {
    await evidence.update((ev) => {
      ev.s3UrlPlaceholder = s3Key;
      ev.uploadStatus = 'SYNCED';
    });
  });
}

// ─── Fotos extra de protocolo (evidencia adicional) ──────────────────────────

/**
 * Sube una foto extra de protocolo a S3.
 * Naming: {protocolNumber}-{location}-extra-F001.jpg, F002 ...
 * position es el índice 1-based en el array de fotos extra.
 */
export async function uploadExtraPhoto(
  protocolId: string,
  localUri: string,
  position: number,
): Promise<void> {
  const protocol = await protocolsCollection.find(protocolId);
  const project = await projectsCollection.find(protocol.projectId);
  const prefix = s3ProjectPrefix(project.name);

  let locationSegment = 'SIN_UBICACION';
  if (protocol.locationId) {
    try {
      const locs = await locationsCollection.query(Q.where('id', protocol.locationId)).fetch();
      if (locs.length > 0) locationSegment = sanitizeSegment(locs[0].name);
    } catch { /* usar fallback */ }
  } else if (protocol.locationReference) {
    locationSegment = sanitizeSegment(protocol.locationReference);
  }

  const protocolSegment = sanitizeSegment(protocol.protocolNumber || protocol.id);
  const s3Key = `${prefix}/photos/${protocolSegment}-${locationSegment}-extra-F${seq(position)}.jpg`;

  await uploadToS3(localUri, s3Key, 'image/jpeg');
}

// ─── Fotos de comentarios de observación ────────────────────────────────────

/**
 * Sube la foto de un comentario de anotación a S3 y actualiza el registro.
 * Naming: obs-{annotationId}-F001.jpg, F002 ...
 */
export async function uploadAnnotationCommentPhoto(
  photoId: string,
  localUri: string
): Promise<void> {
  // Cadena: photo → comment → annotation → plan → project
  const photo = await annotationCommentPhotosCollection.find(photoId);
  const comment = await annotationCommentsCollection.find(photo.annotationCommentId);
  const annotation = await planAnnotationsCollection.find(comment.annotationId);
  const plan = await plansCollection.find(annotation.planId);
  const project = await projectsCollection.find(plan.projectId);
  const prefix = s3ProjectPrefix(project.name);

  // Contar todas las fotos de los comentarios de esta anotación
  const allComments = await annotationCommentsCollection
    .query(Q.where('annotation_id', annotation.id))
    .fetch();
  const allCommentIds = allComments.map((c) => c.id);
  const allPhotos = await annotationCommentPhotosCollection
    .query(Q.where('annotation_comment_id', Q.oneOf(allCommentIds)))
    .fetch();

  const position = allPhotos.findIndex((p) => p.id === photoId) + 1;
  const s3Key = `${prefix}/photos/obs-${annotation.id}-F${seq(position)}.jpg`;

  // Subir a S3
  await uploadToS3(localUri, s3Key, 'image/jpeg');

  // Actualizar registro con S3 key
  await annotationCommentPhotosCollection.database.write(async () => {
    await photo.update((p) => {
      p.storagePath = s3Key;
    });
  });
}
