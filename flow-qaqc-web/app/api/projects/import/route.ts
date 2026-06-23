import { NextRequest, NextResponse } from 'next/server';
import { getServerUser, canDeleteProject } from '@lib/serverAuth';
import { restoreFromZip } from '@lib/projectBackup';

// Importar/restaurar un proyecto desde su .zip de respaldo (upsert idempotente +
// re-subir archivos a S3). SOLO CREATOR. El upsert por id es re-ejecutable.
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!canDeleteProject(user)) {
    return NextResponse.json({ error: 'Sin permiso: solo el Creador puede importar proyectos.' }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Falta el archivo .zip' }, { status: 400 });
  }
  const buffer = Buffer.from(await (file as File).arrayBuffer());

  const { createClient } = await import('@lib/supabase/server');
  const supabase = await createClient();
  try {
    const result = await restoreFromZip(supabase, buffer);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
