/**
 * s3-upload.ts — S3 upload desde browser
 *
 * Usa @aws-sdk/client-s3 (v3, web-compatible).
 * Las credenciales vienen de variables de entorno NEXT_PUBLIC_*.
 *
 * IMPORTANTE: Para que funcione desde el browser debes agregar
 * una política CORS en el bucket S3 (el usuario lo hace en AWS Console).
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const REGION = process.env.NEXT_PUBLIC_AWS_REGION!;
const BUCKET = process.env.NEXT_PUBLIC_AWS_BUCKET!;
const ACCESS_KEY = process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!;
const SECRET_KEY = process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!;

function getS3Client(): S3Client {
  return new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
    },
  });
}

/**
 * Sube un Blob o File a S3.
 * @returns URL pública del objeto (si el bucket es público) o key
 */
export async function uploadBlobToS3(
  blob: Blob,
  s3Key: string,
  contentType = 'image/jpeg'
): Promise<string> {
  const client = getS3Client();
  const arrayBuffer = await blob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: uint8,
      ContentType: contentType,
    })
  );

  return s3Key;
}

/** Sanitiza un texto para uso seguro en nombre de archivo S3 */
export function sanitizeSegment(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

export function seq(n: number): string {
  return String(n).padStart(3, '0');
}

export function s3ProjectPrefix(projectName: string): string {
  return `projects/${sanitizeSegment(projectName)}`;
}
