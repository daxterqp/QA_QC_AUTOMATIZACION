/**
 * pushNotification.ts — Enviar notificaciones push desde la web/desktop
 * via la misma Supabase Edge Function que usa el móvil.
 */

const EDGE_FN_URL =
  'https://uimlobhczjctoytejkgh.supabase.co/functions/v1/send-notification';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbWxvYmhjempjdG95dGVqa2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODYzODQsImV4cCI6MjA4OTM2MjM4NH0.LawnHHTjCQMYgYw7fXX_tvz-wBTps-M1W4bsz_2eXZI';

interface PushPayload {
  title: string;
  body: string;
  data: Record<string, unknown>;
  recipientFilter: 'all' | 'jefe' | string[];
  collapseKey?: string;
}

async function sendPush(payload: PushPayload): Promise<void> {
  try {
    await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });
  } catch { /* sin internet — no bloquear */ }
}

export function pushProtocolApproved(
  projectId: string,
  locationOnly: string | null,
  specialty: string | null,
  protocolName: string,
  protocolId: string,
): void {
  const loc = [locationOnly, specialty].filter(Boolean).join(' · ');
  sendPush({
    title: protocolName,
    body: loc ? `${loc} · Aprobado y firmado` : 'Aprobado y firmado',
    data: { screen: 'Dossier', projectId, projectName: '' },
    recipientFilter: 'all',
    collapseKey: `proto_${protocolId}`,
  }).catch(() => {});
}

export function pushProtocolRejected(
  projectId: string,
  locationOnly: string | null,
  specialty: string | null,
  protocolName: string,
  protocolId: string,
): void {
  const loc = [locationOnly, specialty].filter(Boolean).join(' · ');
  sendPush({
    title: protocolName,
    body: loc ? `${loc} · Rechazado` : 'Rechazado',
    data: { screen: 'Dossier', projectId, projectName: '' },
    recipientFilter: 'all',
    collapseKey: `proto_${protocolId}`,
  }).catch(() => {});
}

export function pushAnnotationClosed(
  projectId: string,
  locationOnly: string | null,
  specialty: string | null,
): void {
  const loc = [locationOnly, specialty].filter(Boolean).join(' · ');
  sendPush({
    title: `Obs levantada · ${loc || 'Observación'}`,
    body: 'La observación fue marcada como completada.',
    data: { screen: 'AnnotationComments', projectId, projectName: '' },
    recipientFilter: 'all',
  }).catch(() => {});
}
