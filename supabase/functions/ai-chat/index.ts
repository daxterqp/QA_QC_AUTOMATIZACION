import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildTools } from "./tools.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { runClaudeChat } from "./claude.ts";
import { runGeminiChat } from "./gemini.ts";

// Asistente de IA del proyecto (chat) — multi-proveedor (Claude | Gemini).
//
// Seguridad:
//  - Desplegada con verify_jwt=true; además validamos el usuario con getUser().
//  - TODAS las queries de datos usan el cliente autenticado con el JWT del
//    usuario → RLS (can_access_project + org) filtra solo. Nunca service_role.
//  - PROVEEDOR y MODELO se resuelven AQUÍ desde projects.feature_flags
//    (ai_provider + ai_model_tier, editables solo por el Creador en la app) —
//    el cliente jamás los envía.
//  - Las API keys viven en secretos de Supabase, jamás en el bundle móvil.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

/** Mapeo proveedor+tier → modelo real. SOLO server-side (tamper-proof).
 *  Los de Gemini son sobreescribibles por secreto sin redeploy. */
const CLAUDE_BY_TIER: Record<string, string> = {
  economico: "claude-haiku-4-5",
  potente: "claude-sonnet-5",
  maximo: "claude-opus-4-8",
};
// Gemini (verificado jul 2026): 2.5-flash = estable con free tier y function
// calling sólido; 3.5-flash = flagship GA; 3.1-pro-preview = el más potente.
const GEMINI_BY_TIER: Record<string, string> = {
  economico: Deno.env.get("GEMINI_MODEL_ECONOMICO") || "gemini-2.5-flash",
  potente: Deno.env.get("GEMINI_MODEL_POTENTE") || "gemini-3.5-flash",
  maximo: Deno.env.get("GEMINI_MODEL_MAXIMO") || "gemini-3.1-pro-preview",
};

const MAX_HISTORY_TURNS = 8;     // últimos N mensajes de historial aceptados
const MAX_MESSAGE_CHARS = 2000;  // defensa: pregunta del usuario acotada

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

interface HistoryMsg { role: "user" | "assistant"; content: string }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    // ── Auth: cliente con el JWT del usuario (RLS aplica en todas las queries) ──
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: authUser }, error: uErr } = await supabase.auth.getUser();
    if (uErr || !authUser) return json({ error: "unauthorized" }, 401);

    // Perfil (nombre para el saludo). RLS de users permite leer la propia fila.
    const { data: profile } = await supabase.from("users")
      .select("name, apellido, role").eq("auth_id", authUser.id).maybeSingle();
    const userName = profile
      ? [profile.name, profile.apellido].filter(Boolean).join(" ").trim() || "usuario"
      : "usuario";

    // ── Input ──
    const body = await req.json().catch(() => null);
    const projectId: unknown = body?.projectId;
    const message: unknown = body?.message;
    const isFirstTurn = body?.isFirstTurn !== false; // default true
    if (typeof projectId !== "string" || !projectId) return json({ error: "falta projectId" }, 400);
    if (typeof message !== "string" || !message.trim()) return json({ error: "falta message" }, 400);

    // Historial acotado y saneado (solo user/assistant con texto).
    const rawHistory: unknown = body?.history;
    const history: HistoryMsg[] = Array.isArray(rawHistory)
      ? (rawHistory as HistoryMsg[])
        .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "")
        .slice(-MAX_HISTORY_TURNS)
        .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
      : [];
    // Las APIs de chat exigen que el PRIMER mensaje sea del usuario: el recorte
    // de arriba puede dejar un assistant huérfano al inicio.
    while (history.length > 0 && history[0].role === "assistant") history.shift();

    // Preferencias del usuario (guardadas en SU dispositivo) — saneadas.
    const rawPrefs: unknown = body?.preferencias;
    const preferencias: string[] = Array.isArray(rawPrefs)
      ? rawPrefs.filter((p): p is string => typeof p === "string" && p.trim() !== "")
        .slice(0, 10)
        .map(p => p.slice(0, 140))
      : [];

    // Ubicación GPS del usuario (opcional, viene del móvil) — saneada.
    const rawLoc: unknown = body?.ubicacion;
    // deno-lint-ignore no-explicit-any
    const locAny = rawLoc as any;
    const ubicacion = (locAny && typeof locAny.lat === "number" && typeof locAny.lng === "number"
      && Math.abs(locAny.lat) <= 90 && Math.abs(locAny.lng) <= 180)
      ? { lat: locAny.lat, lng: locAny.lng, precisionM: typeof locAny.precisionM === "number" ? Math.round(locAny.precisionM) : null }
      : null;

    // ── Acceso al proyecto + proveedor/tier (RLS: sin acceso, viene vacío) ──
    const { data: proj } = await supabase.from("projects")
      .select("id, name, feature_flags").eq("id", projectId).maybeSingle();
    if (!proj) return json({ error: "proyecto no encontrado o sin acceso" }, 403);

    // deno-lint-ignore no-explicit-any
    let flags: any = proj.feature_flags ?? {};
    if (typeof flags === "string") { try { flags = JSON.parse(flags); } catch { flags = {}; } }
    if (flags?.module_ai_assistant !== true) return json({ error: "el Asistente de IA no está habilitado en este proyecto" }, 403);

    // hasOwnProperty: un tier basura tipo "constructor" resolvería una función
    // heredada del prototype en vez de caer al default.
    const rawTier = typeof flags?.ai_model_tier === "string" ? flags.ai_model_tier : "economico";
    const tier = Object.prototype.hasOwnProperty.call(CLAUDE_BY_TIER, rawTier) ? rawTier : "economico";
    const provider: "claude" | "gemini" = flags?.ai_provider === "gemini" ? "gemini" : "claude";
    const model = provider === "gemini" ? GEMINI_BY_TIER[tier] : CLAUDE_BY_TIER[tier];
    const apiKey = provider === "gemini" ? GEMINI_API_KEY : ANTHROPIC_API_KEY;
    if (!apiKey) {
      const secretName = provider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
      return json({ error: `${secretName} no configurada (supabase secrets set). Cambie el proveedor de IA del proyecto o configure la clave.` }, 500);
    }

    // ── Radiografía del proyecto: qué HAY cargado y qué NO (v84) ──
    // Conteos head baratos en paralelo → el system prompt le dice a la IA de
    // antemano "no hay sectores / no hay muestras / etc." para que no los
    // busque a ciegas ni se confunda.
    const head = (table: string) =>
      supabase.from(table).select("id", { count: "exact", head: true }).eq("project_id", projectId);
    const [cSect, cSectGeo, cTipos, cEns, cMues, cNcs, cUbic] = await Promise.all([
      head("project_sectors"),
      head("project_sectors").not("points_json", "is", null),
      // Solo plantillas VISIBLES (mismo filtro que loadCatalog: is_hidden se
      // salta) — contar ocultas haría que la radiografía contradiga al catálogo.
      head("protocol_templates").or("is_hidden.is.null,is_hidden.eq.false"),
      head("protocols").in("status", ["SUBMITTED", "APPROVED", "REJECTED"]),
      head("samples"),
      head("non_conformities"),
      head("locations"),
    ]);
    const snapshot = {
      sectores: cSect.count ?? 0,
      sectoresConGeometria: cSectGeo.count ?? 0,
      tiposDeEnsayo: cTipos.count ?? 0,
      ensayos: cEns.count ?? 0,
      muestras: cMues.count ?? 0,
      noConformidades: cNcs.count ?? 0,
      ubicaciones: cUbic.count ?? 0,
    };

    // ── Tools con projectId cerrado en closure ──
    // rol+flags: gatean destinos/acciones (un botón del chat jamás debe llevar
    // a un módulo que el menú le oculta a ese usuario).
    const tools = buildTools(supabase, projectId, ubicacion, { userRole: profile?.role ?? null, flags });
    const system = buildSystemPrompt({
      userName, userRole: profile?.role ?? null, projectName: String(proj.name ?? "el proyecto"), isFirstTurn,
      preferencias, snapshot, tieneUbicacion: !!ubicacion,
    });

    const args = {
      apiKey, model, system, history,
      message: message.slice(0, MAX_MESSAGE_CHARS),
      tools,
    };
    const result = provider === "gemini" ? await runGeminiChat(args) : await runClaudeChat(args);

    return json({
      reply: result.reply || "No pude generar una respuesta. Intente reformular la pregunta.",
      ...(result.chartSvg ? { chartSvg: result.chartSvg } : {}),
      ...(result.action ? { action: result.action } : {}),
      ...(result.links ? { links: result.links } : {}),
      usage: { input_tokens: result.inputTokens, output_tokens: result.outputTokens, model, provider },
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
