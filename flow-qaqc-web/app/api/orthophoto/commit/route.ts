import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// Sube a S3 la versión LIVIANA ya procesada y confirmada (staging local → S3).
// Se llama solo después de que el usuario confirma el peso en la ventana. Recibe
// el `stageToken` devuelto por /process para subir EXACTAMENTE ese resultado.

export const runtime = 'nodejs';

const REGION     = process.env.NEXT_PUBLIC_AWS_REGION!;
const BUCKET     = process.env.NEXT_PUBLIC_AWS_BUCKET!;
const ACCESS_KEY = process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!;
const SECRET_KEY = process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!;
const STAGE_BASE = process.env.LOCAL_PLANS_CACHE ?? 'D:\\Flow-QAQC';
// M2 — el cache final debe escribirse donde el proxy /api/s3-image LO LEE
// (LOCAL_PHOTO_CACHE), no donde está el staging. Si difieren, antes el write era
// inútil y el proxy siempre re-descargaba de S3.
const PHOTO_BASE = process.env.LOCAL_PHOTO_CACHE ?? 'D:\\Flow-QAQC';

function sanitize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
}

/** Mismo mapeo s3Key→ruta local que usa el proxy s3-image. */
function s3KeyToPhotoPath(s3Key: string): string {
  const rel = s3Key.startsWith('projects/') ? s3Key.slice('projects/'.length) : s3Key;
  return path.join(PHOTO_BASE, ...rel.split('/'));
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const projectName: string = body?.projectName;
  const stageToken: string = body?.stageToken;
  const grid: number = Math.min(3, Math.max(1, Number(body?.grid) || 1));
  if (!projectName || !stageToken) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
  // Validar el token (evita leer rutas arbitrarias).
  if (!/^[a-f0-9-]{36}$/i.test(stageToken)) return NextResponse.json({ error: 'Token inválido' }, { status: 400 });

  const dir = path.join(STAGE_BASE, sanitize(projectName), 'orthophoto');
  // v36/teselado — key ÚNICO por versión; cada tesela bajo la carpeta de la versión.
  const versionId = randomUUID();
  const s3 = new S3Client({ region: REGION, credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } });

  const tiles: { s3Key: string; r: number; c: number }[] = [];
  let totalBytes = 0;
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      const stagePath = path.join(dir, `_staging-${stageToken}-${r}-${c}.webp`);
      if (!fs.existsSync(stagePath)) return NextResponse.json({ error: `Falta la tesela ${r}-${c} en staging. Procesa primero.` }, { status: 400 });
      const s3Key = `projects/${sanitize(projectName)}/orthophoto/${versionId}/${r}-${c}.webp`;
      const bytes = fs.readFileSync(stagePath);
      totalBytes += bytes.length;
      // Caché local para el proxy s3-image.
      try {
        const finalLocal = s3KeyToPhotoPath(s3Key);
        fs.mkdirSync(path.dirname(finalLocal), { recursive: true });
        fs.writeFileSync(finalLocal, bytes);
      } catch { /* ignore cache errors */ }
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, Body: bytes, ContentType: 'image/webp' }));
      tiles.push({ s3Key, r, c });
      try { fs.unlinkSync(stagePath); } catch { /* ignore */ }
    }
  }

  // s3Key principal = primera tesela (compat con consumidores de una sola key).
  return NextResponse.json({ versionId, s3Key: tiles[0]?.s3Key, tiles, grid, bytes: totalBytes });
}
