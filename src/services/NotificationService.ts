/**
 * NotificationService
 *
 * Registro de push tokens y envío de notificaciones via Supabase Edge Function.
 *
 * Triggers:
 *   - Nueva viñeta de anotación → todos los usuarios del proyecto
 *   - Respuesta en hilo        → todos los usuarios del proyecto
 *   - Protocolo enviado        → usuarios con rol RESIDENT / CREATOR
 *   - Protocolo aprobado       → todos los usuarios del proyecto
 */

import { Platform } from 'react-native';
import { supabase } from '@config/supabase';

// Carga segura — módulo nativo puede no estar disponible en builds anteriores
let Notifications: typeof import('expo-notifications') | null = null;
let Device: typeof import('expo-device') | null = null;
try { Notifications = require('expo-notifications'); } catch { /* no disponible */ }
try { Device = require('expo-device'); } catch { /* no disponible */ }

// URL de la Supabase Edge Function
const EDGE_FN_URL =
  'https://uimlobhczjctoytejkgh.supabase.co/functions/v1/send-notification';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbWxvYmhjempjdG95dGVqa2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODYzODQsImV4cCI6MjA4OTM2MjM4NH0.LawnHHTjCQMYgYw7fXX_tvz-wBTps-M1W4bsz_2eXZI';

// ─── Canal de notificaciones Android ────────────────────────────────────────

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Registro del token ──────────────────────────────────────────────────────

/**
 * Pide permiso y registra el Expo Push Token del dispositivo en Supabase.
 * Llamar al hacer login.
 */
export async function registerPushToken(userId: string): Promise<void> {
  if (!Notifications || !Device) return;
  try {
    if (!Device.isDevice) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Notificaciones S-CUA',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1a73e8',
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'scua-qaqc',
    });
    const token = tokenData.data;

    await supabase.from('push_tokens').upsert(
      { user_id: userId, token, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' }
    );
  } catch { /* sin Firebase o sin internet */ }
}

/**
 * Elimina el token del usuario al hacer logout.
 */
export async function unregisterPushToken(userId: string): Promise<void> {
  if (!Notifications || !Device) return;
  try {
    if (!Device.isDevice) return;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: 'scua-qaqc' });
    await supabase.from('push_tokens').delete().eq('user_id', userId).eq('token', tokenData.data);
  } catch { /* sin token registrado */ }
}

// ─── Envío de notificaciones ─────────────────────────────────────────────────

interface NotifPayload {
  title: string;
  body: string;
  data: Record<string, unknown>;
  recipientFilter: 'all' | 'jefe' | string[];
}

async function sendNotification(payload: NotifPayload): Promise<void> {
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

/**
 * Nueva viñeta de observación creada.
 */
export function notifyNewAnnotation(
  projectId: string,
  projectName: string,
  locationRef: string,
  comment: string | null
): void {
  sendNotification({
    title: `Nueva observación · ${locationRef}`,
    body: comment ? comment.substring(0, 120) : 'Se agregó una nueva viñeta.',
    data: { screen: 'AnnotationComments', projectId, projectName },
    recipientFilter: 'all',
  }).catch(() => {});
}

/**
 * Nueva respuesta en hilo de comentarios.
 */
export function notifyNewReply(
  projectId: string,
  projectName: string,
  locationRef: string,
  content: string | null
): void {
  sendNotification({
    title: `Respuesta · ${locationRef}`,
    body: content ? content.substring(0, 120) : 'Se agregó una respuesta.',
    data: { screen: 'AnnotationComments', projectId, projectName },
    recipientFilter: 'all',
  }).catch(() => {});
}

/**
 * Protocolo enviado para revisión (notifica a jefeS y creadores).
 */
export function notifyProtocolSubmitted(
  projectId: string,
  projectName: string,
  locationRef: string,
  protocolNumber: string
): void {
  sendNotification({
    title: `Protocolo enviado · ${protocolNumber}`,
    body: `${locationRef} — listo para revisión.`,
    data: { screen: 'Dossier', projectId, projectName },
    recipientFilter: 'jefe',
  }).catch(() => {});
}

/**
 * Protocolo aprobado (notifica a todos).
 */
export function notifyProtocolApproved(
  projectId: string,
  projectName: string,
  locationRef: string,
  protocolNumber: string
): void {
  sendNotification({
    title: `Protocolo aprobado · ${protocolNumber}`,
    body: `${locationRef} fue aprobado y firmado.`,
    data: { screen: 'Dossier', projectId, projectName },
    recipientFilter: 'all',
  }).catch(() => {});
}
