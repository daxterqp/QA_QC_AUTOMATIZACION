import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { getServerUser } from '@lib/serverAuth';
import { keyBelongsToAccessibleProject } from '../s3-shared/projectAccess';

const REGION     = process.env.NEXT_PUBLIC_AWS_REGION!;
const BUCKET     = process.env.NEXT_PUBLIC_AWS_BUCKET!;
const ACCESS_KEY = process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!;
const SECRET_KEY = process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!;
const LOCAL_BASE = process.env.LOCAL_PHOTO_CACHE ?? 'D:\\Flow-QAQC';

/** ¿La key tiene byte nulo o caracteres de control (U+0000–U+001F)?
 *  Esos caracteres romperían fs.existsSync con un 500; hay que rechazarlos. */
function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) < 0x20) return true;
  }
  return false;
}

/**
 * Mapea s3Key→ruta local. Devuelve null si la key es inválida (path traversal):
 * contiene `..`, tiene byte nulo o caracteres de control, o tras resolver
 * escapa del directorio base LOCAL_BASE.
 */
function s3KeyToLocalPath(s3Key: string): string | null {
  if (s3Key.includes('..')) return null;
  if (hasControlChars(s3Key)) return null;
  const relative = s3Key.startsWith('projects/') ? s3Key.slice('projects/'.length) : s3Key;
  const resolved = path.resolve(LOCAL_BASE, ...relative.split('/'));
  const base = path.resolve(LOCAL_BASE);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

/**
 * Same as /api/s3-image but with NO browser caching.
 * Used for stamping photos where we always need the latest logo.
 */
export async function GET(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const key = req.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  // Autorización horizontal (lectura): keys `projects/<seg>/...` deben pertenecer
  // a un proyecto accesible. Assets globales (no `projects/...`, p.ej. logos) se
  // permiten al usuario autenticado (allowGlobal=true) para no romper el render.
  const allowed = await keyBelongsToAccessibleProject(key, { allowGlobal: true });
  if (!allowed) return new Response('Forbidden', { status: 403 });

  const localPath = s3KeyToLocalPath(key);
  if (!localPath) return NextResponse.json({ error: 'invalid key' }, { status: 400 });

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
