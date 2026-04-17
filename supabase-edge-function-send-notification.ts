// =============================================================================
// Supabase Edge Function: send-notification (FCM directo)
//
// Actualizar en: Supabase Dashboard → Edge Functions → send-notification
// Copiar todo este contenido y reemplazar el código existente.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// ── Firebase Service Account (embebido) ─────────────────────────────────────
const FCM_PROJECT_ID = 'flow-qc-3fc79'
const FCM_CLIENT_EMAIL = 'firebase-adminsdk-fbsvc@flow-qc-3fc79.iam.gserviceaccount.com'
const FCM_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDctBNSCFgscRP2
iADDy1SLt1bD1TxpMBzY9mDvGXzo+HYfe8um1WqM7kksZOZ8N3g/8jibMUEho50G
ZuvpkdwMPipmhu86WclHWdAzH6Emr4kLsMKWShzCXMEx7zlYqq16nNnVVhd4grbR
D6I3gdYRgX+ScRr1xwjM/OX4P0a9CFBtVfKa45IicxiZJ6gICgHeklsXtzKjQFhQ
HNzLTaUBD4Wi5uWf/WkzT/rsPdZJ1DTWl90VrhyULJgoUiUMqBiwahXiHjhPOrJ8
um8HaVpAZqen+3JbkmpKmoW5bHFZzgf7sqdlA4+SwJjo2k+Ck52WUHr7m1W9yI5c
yYEg6FWVAgMBAAECggEABB6A8nnWZMny1JntjbnzSNecpnNfORqynHgIuh2wf6FM
2cHpPKK6EN73qFJKcky6EVN3gVSrgbG4jLXfYaYdGcYP64b0MGjG7Bkoh3O9LGgq
oiMOlq3Tw0A7mNon/gLS0bmGCp3HOrK8hRgKGogb/d/8CLh/XNFLVZbDbLKITZ8x
EEgexkkAc0WlNVk+ZY2i82dnnyEjC+lypvYjUQOi5reMP+O++8PeXWea/3yppCck
qkeu9cipfTrScTDUu8HwIn21ybcZu7TWCQ6hf77RSAEbS3+F1qZXtSC+jVWTJ81n
sIdQyX8FAbB/yT2PboRt9leHA2G4rJSIaB7Kkg1jhwKBgQDvGSYfl1nNetyD7428
+bNhuqTndlNGDjsjhG4JqG3WjIm07qE+nakp3UmRkWFWXjMGAxYUxKvHKtb46e5B
BahEcKbPTOF8MLIMZ45t3FLS2dJ3vxD6vGxc0wcuzGdQTKG+5bgH0k3KWdH/qlqm
0G3FH1yunqhBIpcGrQ6uLdDxjwKBgQDsTgtBiky+s8blhUOac3Rp/qs0hYASdDKK
IuW0uNepZ/nOK76LqL9yqQQPVvSuWi5sg43NLAIr/n6/OltBfjDKkRIV+Q7yBIg2
5pq1biKOw2OIoMhr71bzzM18O7jy27t6dT20k59gIAZkskUOSpOxlYLhWKUShRrK
I8atzEasmwKBgEVgPreb6uq8Y4/EypOywGHzDjY7Fx6UsoQzwNn8jSJb1Pky5IaO
qK8FDnu2e0/cNWHhM18DUfSQcZ/4ALHNOm3hYgV0gVjPqFoBEkq+SynzGia0wfB/
C9JDSSpDFRcvpR8G+McMNpYoSc6tV3Bfufogh3wDfT6pErlVLZVMpfvxAoGBANIu
iKx/CswEs8Cqy/qw/rbYogdRRx0i5WEgsRgR4SD5LqRHHHC0Y7TkyIusWG5MIEa8
rH/1yOjAsJP+n/Sc/WDvsBqDMNvrVA0hCDKgB3TcLcf02s/GTp0DaTI7HMJG13aQ
mZXoSDYDxiwCtJGFm+C0j3lIk2rpoW5ya+FidOpJAoGAah6HAk/kJr/ucdFb9LzQ
JucQvDU3sZCZskjFxdXDhrqqEGmmY5dkhSxf+KSDTAq86Sv5qYHHIrMy5/FtLuXO
8wkDHc1bdFMekPyjdjiiZrQrCct90lOG3xDFQVDF259ZTNeCoB5hZo8RlGRxZGkG
EPHBIkpVm1/FPKemILPvEKU=
-----END PRIVATE KEY-----`

// ── JWT helper para OAuth2 con Google ───────────────────────────────────────

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function strToUint8(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: FCM_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const headerB64 = base64url(strToUint8(JSON.stringify(header)))
  const payloadB64 = base64url(strToUint8(JSON.stringify(payload)))
  const unsigned = `${headerB64}.${payloadB64}`

  // Import RSA private key and sign
  const pemBody = FCM_PRIVATE_KEY
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8', keyData, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, strToUint8(unsigned))
  const signatureB64 = base64url(new Uint8Array(signature))
  const jwt = `${unsigned}.${signatureB64}`

  // Exchange JWT for access token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const data = await res.json()
  return data.access_token
}

// ── Main handler ────────────────────────────────────────────────────────────

const FCM_URL = `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  try {
    const { title, body, data, recipientFilter, collapseKey } = await req.json()
    if (!title || !body) {
      return new Response(JSON.stringify({ error: 'Missing title or body' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Get tokens ──────────────────────────────────────────────────────────
    let tokens: string[] = []

    if (recipientFilter === 'all') {
      const { data: rows } = await supabase.from('push_tokens').select('token')
      tokens = (rows ?? []).map((r: any) => r.token)

    } else if (recipientFilter === 'jefe') {
      const { data: users } = await supabase
        .from('users').select('id').in('role', ['RESIDENT', 'CREATOR'])
      const userIds = (users ?? []).map((u: any) => u.id)
      if (userIds.length > 0) {
        const { data: rows } = await supabase
          .from('push_tokens').select('token').in('user_id', userIds)
        tokens = (rows ?? []).map((r: any) => r.token)
      }

    } else if (Array.isArray(recipientFilter) && recipientFilter.length > 0) {
      const { data: rows } = await supabase
        .from('push_tokens').select('token').in('user_id', recipientFilter)
      tokens = (rows ?? []).map((r: any) => r.token)
    }

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Get OAuth2 access token ─────────────────────────────────────────────
    const accessToken = await getAccessToken()

    // ── Send via FCM HTTP v1 API ────────────────────────────────────────────
    let sent = 0
    const invalidTokens: string[] = []

    for (const token of tokens) {
      try {
        const res = await fetch(FCM_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              data: data ? Object.fromEntries(
                Object.entries(data).map(([k, v]) => [k, String(v)])
              ) : {},
              android: {
                priority: 'high',
                collapse_key: collapseKey || undefined,
                notification: {
                  channel_id: 'default',
                  sound: 'default',
                  tag: collapseKey || undefined,
                },
              },
            },
          }),
        })

        if (res.ok) {
          sent++
        } else {
          const err = await res.json()
          const errorCode = err?.error?.details?.[0]?.errorCode ?? err?.error?.status ?? ''
          if (errorCode === 'UNREGISTERED' || errorCode === 'NOT_FOUND') {
            invalidTokens.push(token)
          }
          console.error(`[FCM] Failed for token ${token.substring(0, 20)}...: ${JSON.stringify(err)}`)
        }
      } catch (e) {
        console.error(`[FCM] Error sending to token: ${e}`)
      }
    }

    // ── Clean invalid tokens ────────────────────────────────────────────────
    if (invalidTokens.length > 0) {
      await supabase.from('push_tokens').delete().in('token', invalidTokens)
      console.log(`[FCM] Cleaned ${invalidTokens.length} invalid tokens`)
    }

    return new Response(JSON.stringify({ sent, total: tokens.length, cleaned: invalidTokens.length }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[send-notification] Error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
