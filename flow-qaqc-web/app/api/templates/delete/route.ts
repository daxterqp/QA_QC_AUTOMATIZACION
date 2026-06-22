import { NextRequest, NextResponse } from 'next/server';
import { deleteProtocolsWithRecycle, collectProtocolS3Keys } from '@lib/recycleDelete';
import { deleteS3Objects } from '@lib/s3Delete';
import { getServerUser, canDeleteEnsayos } from '@lib/serverAuth';

// v43/v44 — Eliminar plantillas (tipo de ensayo): sus ensayos se copian a la
// Papelera y luego se hace hard delete completo (sin huérfanos) + limpieza S3.
// Permiso server-side: solo Jefe (RESIDENT) o Creador.
export async function POST(req: NextRequest) {
  const { projectId, templateIds } = await req.json();
  if (!projectId || !templateIds?.length) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const user = await getServerUser();
  if (!canDeleteEnsayos(user)) {
    return NextResponse.json({ error: 'Sin permiso: solo el Jefe o el Creador pueden eliminar.' }, { status: 403 });
  }

  const { createClient } = await import('@lib/supabase/server');
  const supabase = await createClient();

  try {
    for (const templateId of templateIds as string[]) {
      const { data: protocols } = await supabase
        .from('protocols').select('id').eq('template_id', templateId).eq('project_id', projectId);
      const protocolIds = (protocols ?? []).map((p: { id: string }) => p.id);

      const s3Keys = await collectProtocolS3Keys(supabase, protocolIds);
      await deleteProtocolsWithRecycle(supabase, protocolIds, {
        deletedById: user!.id,
        deletedByName: user!.name,
      });
      await deleteS3Objects(s3Keys);

      await supabase.from('protocol_template_items').delete().eq('template_id', templateId);
      await supabase.from('protocol_templates').delete().eq('id', templateId);
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ deleted: templateIds.length });
}
