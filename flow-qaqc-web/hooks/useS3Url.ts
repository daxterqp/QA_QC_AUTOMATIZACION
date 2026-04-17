/**
 * useS3Url — resuelve un s3_key a una URL servible por el browser.
 *
 * Usa /api/s3-image que:
 *   1. Busca primero en caché local (D:\Flow-QAQC\...)
 *   2. Si no está, descarga de S3, guarda localmente y sirve
 *
 * La URL resultante es simplemente /api/s3-image?key=... — estable mientras
 * el servidor corre, sin expiración.
 */
export function useS3Url(s3Key: string | null | undefined): string | null {
  if (!s3Key) return null;
  return `/api/s3-image?key=${encodeURIComponent(s3Key)}`;
}
