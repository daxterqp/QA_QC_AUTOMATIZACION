import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Sha256 } from '@aws-crypto/sha256-js';
import * as FileSystem from 'expo-file-system';
import { AWS_CONFIG } from '@config/aws';

// Configuración explícita de sha256 requerida para React Native / Hermes
const s3 = new S3Client({
  region: AWS_CONFIG.region,
  credentials: {
    accessKeyId: AWS_CONFIG.accessKeyId,
    secretAccessKey: AWS_CONFIG.secretAccessKey,
  },
  sha256: Sha256,
});

/**
 * Sube un archivo local a S3 usando una URL prefirmada PUT.
 */
export async function uploadToS3(
  localUri: string,
  s3Key: string,
  contentType = 'application/octet-stream'
): Promise<void> {
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: AWS_CONFIG.bucketName, Key: s3Key }),
    { expiresIn: 300 }
  );

  const result = await FileSystem.uploadAsync(url, localUri, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': contentType },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`S3 upload failed: HTTP ${result.status} — ${result.body}`);
  }
}

/**
 * Descarga un archivo de S3 a una URI local usando URL prefirmada GET.
 */
export async function downloadFromS3(s3Key: string, localUri: string): Promise<void> {
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: AWS_CONFIG.bucketName, Key: s3Key }),
    { expiresIn: 300 }
  );

  const result = await FileSystem.downloadAsync(url, localUri);

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`S3 download failed: HTTP ${result.status}`);
  }
}

/**
 * Retorna true si el objeto existe en S3.
 */
export async function s3FileExists(s3Key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: AWS_CONFIG.bucketName, Key: s3Key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Lista las claves de objetos bajo un prefijo S3.
 */
export async function listS3Keys(prefix: string): Promise<string[]> {
  const response = await s3.send(
    new ListObjectsV2Command({ Bucket: AWS_CONFIG.bucketName, Prefix: prefix })
  );
  return (response.Contents ?? []).map((o) => o.Key!).filter(Boolean);
}
