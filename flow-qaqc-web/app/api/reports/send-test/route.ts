import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@lib/serverAuth';

// "Enviar prueba" del panel de Reportes: genera y envía UN reporte al email indicado.
// Reusa el mismo núcleo que el cron (lib/reports/generate). Node runtime (resvg + SES + service_role).
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { templateId, toEmail } = await req.json().catch(() => ({}));
  if (!templateId || !toEmail) return NextResponse.json({ error: 'Faltan templateId/toEmail' }, { status: 400 });

  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  // Verifica acceso: con el cliente RLS del usuario, el template solo es visible si tiene acceso
  // al proyecto. Si la RLS lo oculta → sin acceso. (El envío real usa service_role en el núcleo.)
  const { createClient } = await import('@lib/supabase/server');
  const supabase = await createClient();
  const { data: tpl } = await supabase.from('report_templates').select('id').eq('id', templateId).maybeSingle();
  if (!tpl) return NextResponse.json({ error: 'Modelo no encontrado o sin acceso.' }, { status: 404 });

  try {
    const { sendReport } = await import('@lib/reports/generate');
    const r = await sendReport({ templateId, toEmail });
    if (!r.ok) return NextResponse.json({ error: r.error ?? 'No se pudo enviar' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
