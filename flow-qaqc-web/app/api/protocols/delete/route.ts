import { NextRequest, NextResponse } from 'next/server';
import { deleteProtocolsWithRecycle, collectProtocolS3Keys } from '@lib/recycleDelete';
import { deleteS3Objects } from '@lib/s3Delete';
import { getServerUser, canDeleteEnsayos } from '@lib/serverAuth';

// v43/v44 — Eliminar ensayos: copia a la Papelera + hard delete ATÓMICO de TODAS
// sus relaciones (incluye Tablas Resumen, anotaciones, equipos, NC) + limpieza S3.
// PERMISO: solo Jefe (RESIDENT) o Creador, verificado EN EL SERVIDOR (no se
// confía en el cliente ni en la identidad del body).
export async function POST(req: NextRequest) {
  const { protocolIds } = await req.json();
  if (!protocolIds?.length) {
    return NextResponse.json({ error: 'Missing protocolIds' }, { status: 400 });
  }

  const user = await getServerUser();
  if (!canDeleteEnsayos(user)) {
    return NextResponse.json({ error: 'Sin permiso: solo el Jefe o el Creador pueden eliminar ensayos.' }, { status: 403 });
  }

  const { createClient } = await import('@lib/supabase/server');
  const supabase = await createClient();

  try {
    const s3Keys = await collectProtocolS3Keys(supabase, protocolIds);
    await deleteProtocolsWithRecycle(supabase, protocolIds, {
      deletedById: user!.id,
      deletedByName: user!.name,
    });
    await deleteS3Objects(s3Keys); // best-effort; no rompe el borrado de la BD
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ deleted: protocolIds.length });
}
