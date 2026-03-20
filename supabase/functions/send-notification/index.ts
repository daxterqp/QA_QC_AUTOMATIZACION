/**
 * Supabase Edge Function: send-notification
 *
 * Recibe { title, body, data, recipientFilter } y envía push notifications
 * a los tokens registrados en la tabla push_tokens via Expo Push API.
 *
 * recipientFilter:
 *   'all'  → todos los usuarios con token
 *   'jefe' → usuarios con role 'RESIDENT' o 'CREATOR'
 *   ['userId1', 'userId2'] → usuarios específicos
 *
 * Deploy:
 *   npx supabase functions deploy send-notification --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/exponent-push-notification/send';

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { title, body, data, recipientFilter } = await req.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Obtener tokens según el filtro
    let tokens: string[] = [];

    if (recipientFilter === 'all') {
      const { data: rows } = await supabase
        .from('push_tokens')
        .select('token');
      tokens = (rows ?? []).map((r: any) => r.token);

    } else if (recipientFilter === 'jefe') {
      // Usuarios con role RESIDENT o CREATOR
      const { data: users } = await supabase
        .from('users')
        .select('id')
        .in('role', ['RESIDENT', 'CREATOR']);

      const userIds = (users ?? []).map((u: any) => u.id);
      if (userIds.length > 0) {
        const { data: rows } = await supabase
          .from('push_tokens')
          .select('token')
          .in('user_id', userIds);
        tokens = (rows ?? []).map((r: any) => r.token);
      }

    } else if (Array.isArray(recipientFilter)) {
      // IDs específicos
      const { data: rows } = await supabase
        .from('push_tokens')
        .select('token')
        .in('user_id', recipientFilter);
      tokens = (rows ?? []).map((r: any) => r.token);
    }

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No tokens found' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 2. Deduplicar tokens
    const uniqueTokens = [...new Set(tokens)];

    // 3. Enviar a Expo Push API (máx 100 por batch)
    const messages = uniqueTokens.map((token) => ({
      to: token,
      title,
      body,
      data: data ?? {},
      sound: 'default',
      priority: 'high',
    }));

    // Enviar en batches de 100
    let sent = 0;
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(batch),
      });

      if (res.ok) sent += batch.length;
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
