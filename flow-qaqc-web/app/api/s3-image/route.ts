import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

const REGION     = process.env.NEXT_PUBLIC_AWS_REGION!;
const BUCKET     = process.env.NEXT_PUBLIC_AWS_BUCKET!;
const ACCESS_KEY = process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!;
const SECRET_KEY = process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!;
const LOCAL_BASE = process.env.LOCAL_PHOTO_CACHE ?? 'D:\\Flow-QAQC';

function s3KeyToLocalPath(s3Key: string): string {
  const relative = s3Key.startsWith('projects/') ? s3Key.slice('projects/'.length) : s3Key;
  return path.join(LOCAL_BASE, ...relative.split('/'));
}

function getS3Client() {
  return new S3Client({
    region: REGION,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  });
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  const localPath = s3KeyToLocalPath(key);
  console.log('[s3-image] key:', key);
  console.log('[s3-image] localPath:', localPath);

  // If fresh=1, delete local cache so we always get latest from S3
  const fresh = req.nextUrl.searchParams.get('fresh') === '1';
  if (fresh && fs.existsSync(localPath)) {
    try { fs.unlinkSync(localPath); } catch { /* ignore */ }
  }

  // 1. Servir desde caché local si existe
  if (fs.existsSync(localPath)) {
    console.log('[s3-image] HIT local cache');
    const buf = fs.readFileSync(localPath);
    return new Response(toArrayBuffer(buf), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600', 'X-Cache': 'HIT' },
    });
  }

  console.log('[s3-image] MISS — descargando de S3...');

  // 2. Descargar de S3
  let imageBytes: Uint8Array;
  try {
    const client = getS3Client();
    const resp = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    imageBytes = await resp.Body!.transformToByteArray();
    console.log('[s3-image] S3 descargado, bytes:', imageBytes.byteLength);
  } catch (err) {
    console.error('[s3-image] ERROR S3:', err);
    return NextResponse.json({ error: 'S3 fetch failed', detail: String(err) }, { status: 502 });
  }

  // 3. Guardar en caché local
  try {
    const dir = path.dirname(localPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(localPath, imageBytes);
    console.log('[s3-image] Guardado en:', localPath);
  } catch (err) {
    console.warn('[s3-image] No se pudo guardar localmente:', err);
  }

  const ab = imageBytes.buffer.slice(imageBytes.byteOffset, imageBytes.byteOffset + imageBytes.byteLength) as ArrayBuffer;
  return new Response(ab, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600', 'X-Cache': 'MISS' },
  });
}
