import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, stat } from 'fs/promises';
import path from 'path';
import { getServerUser, canDeleteProject } from '@lib/serverAuth';
import { buildProjectZip } from '@lib/projectBackup';
import { deleteProjectS3 } from '@lib/s3Project';
import { sanitizeSegment } from '@lib/s3-upload';

// Borrado de PROYECTO "de raíz" con las 4 llaves:
//  (B) solo CREATOR (server-side)  ·  (C) nombre exacto (server-side)
//  (A) EXPORT local primero: arma + VERIFICA el .zip en disco; si falla, NO borra nada.
//  (D) el resumen de impacto lo confirma el cliente antes de llamar.
// Motor: RPC atómica delete_project_cascade (transaccional) + borrado S3 por prefijo.
export const runtime = 'nodejs';
export const maxDuration = 300;

function exportsDir(): string {
  return process.env.LOCAL_EXPORTS_DIR || path.join(process.env.LOCAL_PHOTO_CACHE || 'D:\\Flow-QAQC', 'exports');
}

export async function POST(req: NextRequest) {
  const { projectId, confirmName } = await req.json();
  if (!projectId) return NextResponse.json({ error: 'Falta projectId' }, { status: 400 });

  const user = await getServerUser();
  if (!canDeleteProject(user)) {
    return NextResponse.json({ error: 'Sin permiso: solo el Creador puede eliminar proyectos.' }, { status: 403 });
  }

  const { createClient } = await import('@lib/supabase/server');
  const supabase = await createClient();

  // El proyecto (RLS: el creator lo ve). Llave C: el nombre escrito debe coincidir.
  const { data: project, error: pErr } = await supabase.from('projects').select('id, name').eq('id', projectId).maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado o sin acceso.' }, { status: 404 });
  if ((confirmName ?? '').trim() !== (project.name ?? '').trim()) {
    return NextResponse.json({ error: 'El nombre escrito no coincide con el del proyecto.' }, { status: 400 });
  }

  try {
    // (A) EXPORT primero: armar y VERIFICAR el .zip. Sin respaldo válido → no se borra nada.
    const exportedAt = new Date().toISOString();
    const stamp = exportedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const fileName = `proyecto_${sanitizeSegment(project.name || 'sin_nombre')}_${stamp}.zip`;
    const dir = exportsDir();
    await mkdir(dir, { recursive: true });
    const zipPath = path.join(dir, fileName);

    const { buffer, manifest, failedFiles } = await buildProjectZip(supabase, { id: project.id, name: project.name }, exportedAt);
    if (!buffer?.length) throw new Error('El respaldo quedó vacío; se aborta el borrado.');
    if (failedFiles > 0) throw new Error(`No se pudieron descargar ${failedFiles} archivo(s) de S3 para el respaldo; se ABORTA el borrado para no perder datos. Reintentá.`);
    await writeFile(zipPath, buffer);
    const st = await stat(zipPath);
    if (st.size === 0 || st.size !== buffer.length) throw new Error('La verificación del respaldo falló; se aborta el borrado.');

    // Motor: borrado ATÓMICO de la base (transaccional). Si falla → la base queda intacta.
    const { error: rErr } = await supabase.rpc('delete_project_cascade', { p_project_id: projectId });
    if (rErr) throw new Error(`Borrado de la base: ${rErr.message}`);

    // S3 sin huérfanos (best-effort, DESPUÉS de la base).
    const s3Deleted = await deleteProjectS3(project.name, project.id);

    return NextResponse.json({
      ok: true, zipPath, fileName, zipBytes: buffer.length,
      counts: manifest.counts, s3FileCount: manifest.s3FileCount, s3Deleted,
      filesFromCache: manifest.filesFromCache ?? 0, filesFromS3: manifest.filesFromS3 ?? 0,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
