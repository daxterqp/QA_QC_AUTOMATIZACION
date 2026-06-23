import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { getServerUser, canDeleteProject } from '@lib/serverAuth';

// Descarga (a donde el usuario quiera) un .zip de respaldo ya generado en disco.
// SOLO CREATOR. Anti path-traversal: solo el basename, debe terminar en .zip.
export const runtime = 'nodejs';

function exportsDir(): string {
  return process.env.LOCAL_EXPORTS_DIR || path.join(process.env.LOCAL_PHOTO_CACHE || 'D:\\Flow-QAQC', 'exports');
}

export async function GET(req: NextRequest) {
  const user = await getServerUser();
  if (!canDeleteProject(user)) return NextResponse.json({ error: 'Sin permiso.' }, { status: 403 });

  const name = req.nextUrl.searchParams.get('file') || '';
  const base = path.basename(name);
  if (base !== name || !base.toLowerCase().endsWith('.zip')) {
    return NextResponse.json({ error: 'Nombre inválido.' }, { status: 400 });
  }
  try {
    const bytes = await readFile(path.join(exportsDir(), base));
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${base}"` },
    });
  } catch {
    return NextResponse.json({ error: 'Archivo no encontrado.' }, { status: 404 });
  }
}
