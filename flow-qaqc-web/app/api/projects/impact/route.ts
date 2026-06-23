import { NextRequest, NextResponse } from 'next/server';
import { getServerUser, canDeleteProject } from '@lib/serverAuth';
import { listProjectS3Stats } from '@lib/s3Project';

// Resumen de IMPACTO de borrar un proyecto (llave D): conteos por entidad + stats S3.
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getServerUser();
  if (!canDeleteProject(user)) {
    return NextResponse.json({ error: 'Sin permiso: solo el Creador.' }, { status: 403 });
  }
  const projectId = req.nextUrl.searchParams.get('projectId') || '';
  if (!projectId) return NextResponse.json({ error: 'Falta projectId' }, { status: 400 });

  const { createClient } = await import('@lib/supabase/server');
  const supabase = await createClient();

  const { data: project } = await supabase.from('projects').select('id, name').eq('id', projectId).maybeSingle();
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado o sin acceso.' }, { status: 404 });

  const tables = ['protocols', 'protocol_templates', 'plans', 'equipment', 'work_sessions', 'samples', 'locations', 'non_conformities'];
  const counts: Record<string, number> = {};
  for (const tbl of tables) {
    const { count } = await supabase.from(tbl).select('id', { count: 'exact', head: true }).eq('project_id', projectId);
    counts[tbl] = count ?? 0;
  }

  let s3 = { count: 0, bytes: 0 };
  try { s3 = await listProjectS3Stats(project.name, project.id); } catch { /* best-effort */ }

  return NextResponse.json({ projectId: project.id, projectName: project.name, counts, s3 });
}
