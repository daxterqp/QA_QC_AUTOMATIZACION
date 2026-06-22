/**
 * s3Delete.ts — Borrado best-effort de objetos S3 (web, v44).
 *
 * Al eliminar un ensayo se hace hard delete de sus filas en la BD; sus fotos en
 * S3 también deben irse ("como si nunca hubiera existido" + evita fuga de
 * almacenamiento y de datos sensibles). Es best-effort: un fallo de S3 NO
 * rompe el borrado de la BD (ya consistente y respaldado en la papelera).
 */
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.NEXT_PUBLIC_AWS_REGION!,
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!,
  },
});
const BUCKET = process.env.NEXT_PUBLIC_AWS_BUCKET!;

/** Borra cada objeto S3 (ignora claves vacías o URLs http). No lanza nunca. */
export async function deleteS3Objects(keys: (string | null | undefined)[]): Promise<void> {
  const seen = new Set<string>();
  for (const key of keys) {
    if (!key || key.startsWith('http')) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch (e) {
      console.warn('[s3Delete] no se pudo borrar', key, e);
    }
  }
}
