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

/**
 * Same as /api/s3-image but with NO browser caching.
 * Used for stamping photos where we always need the latest logo.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  const localPath = s3KeyToLocalPath(key);

  // Try local file first
  if (fs.existsSync(localPath)) {
    const buf = fs.readFileSync(localPath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    return new Response(ab, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  }

  // Fallback: download from S3
  try {
    const client = new S3Client({
      region: REGION,
      credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    });
    const resp = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const bytes = await resp.Body!.transformToByteArray();

    // Save locally for next time
    try {
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, bytes);
    } catch { /* ignore */ }

    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(ab, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
