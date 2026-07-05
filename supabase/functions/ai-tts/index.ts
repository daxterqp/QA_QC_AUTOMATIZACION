import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Narración por voz del Asistente de IA (Fase 3) — ElevenLabs TTS.
//
// Recibe { projectId, text } y devuelve { audioBase64, mimeType } (MP3).
// Seguridad:
//  - JWT verificado con getUser() (desplegar con verify_jwt=true).
//  - Solo si el proyecto tiene module_ai_assistant activo (RLS: sin acceso al
//    proyecto la fila no aparece) — evita uso de la API de voz fuera del módulo.
//  - ELEVENLABS_API_KEY vive en secretos de Supabase, jamás en el bundle móvil.
//  - Texto acotado (los créditos de ElevenLabs se cobran por carácter).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
// Voz femenina natural multilingüe (español). Sobreescribible por secreto sin redeploy.
const VOICE_ID = Deno.env.get("ELEVENLABS_VOICE_ID") || "EXAVITQu4vr4xnSDxMaL";

const MAX_TTS_CHARS = 1200; // ~6 líneas de respuesta sintética

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** ArrayBuffer → base64 en bloques (btoa directo revienta con audios grandes). */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!ELEVENLABS_API_KEY) return json({ error: "ELEVENLABS_API_KEY no configurada (supabase secrets set)" }, 500);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: authUser }, error: uErr } = await supabase.auth.getUser();
    if (uErr || !authUser) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const projectId: unknown = body?.projectId;
    const text: unknown = body?.text;
    if (typeof projectId !== "string" || !projectId) return json({ error: "falta projectId" }, 400);
    if (typeof text !== "string" || !text.trim()) return json({ error: "falta text" }, 400);

    // Gate por proyecto (RLS filtra el acceso; el flag gatea el módulo).
    const { data: proj } = await supabase.from("projects")
      .select("id, feature_flags").eq("id", projectId).maybeSingle();
    if (!proj) return json({ error: "proyecto no encontrado o sin acceso" }, 403);
    // deno-lint-ignore no-explicit-any
    let flags: any = proj.feature_flags ?? {};
    if (typeof flags === "string") { try { flags = JSON.parse(flags); } catch { flags = {}; } }
    if (flags?.module_ai_assistant !== true) return json({ error: "el Asistente de IA no está habilitado en este proyecto" }, 403);

    // Limpieza para narración: sin emojis de alerta ni markdown crudo.
    const speak = text.trim()
      .replace(/[*_#`>]/g, "")
      .replace(/\s+/g, " ")
      .slice(0, MAX_TTS_CHARS);

    const resp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_64`,
      {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: speak,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      },
    );
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return json({ error: `ElevenLabs ${resp.status}: ${detail.slice(0, 300)}` }, 502);
    }
    const audio = await resp.arrayBuffer();
    return json({ audioBase64: toBase64(audio), mimeType: "audio/mpeg" });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
