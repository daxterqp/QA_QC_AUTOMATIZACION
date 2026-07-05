import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.110.0";
import { buildTools, CHART_TOOL_NAME, CHART_SVG_KEY } from "./tools.ts";
import { buildSystemPrompt } from "./prompt.ts";

// Asistente de IA del proyecto (chat) — Fase 1: consultas sobre ensayos.
//
// Seguridad:
//  - Desplegada con verify_jwt=true; además validamos el usuario con getUser().
//  - TODAS las queries de datos usan el cliente autenticado con el JWT del
//    usuario → RLS (can_access_project + org) filtra solo. Nunca service_role.
//  - El MODELO se resuelve AQUÍ desde projects.feature_flags.ai_model_tier
//    (editable solo por el Creador en la app) — el cliente jamás lo envía.
//  - ANTHROPIC_API_KEY vive en secretos de Supabase, jamás en el bundle móvil.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

/** Mapeo tier → modelo real. SOLO server-side (tamper-proof). */
const MODEL_BY_TIER: Record<string, string> = {
  economico: "claude-haiku-4-5",
  potente: "claude-sonnet-5",
  maximo: "claude-opus-4-8",
};

const MAX_TOOL_ITERATIONS = 5;   // tope del loop de tool-use
const MAX_HISTORY_TURNS = 8;     // últimos N mensajes de historial aceptados
const MAX_TOKENS = 700;          // respuestas sintéticas (3-6 líneas)
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
  if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY no configurada (supabase secrets set)" }, 500);

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
    // La Messages API exige que el PRIMER mensaje sea del usuario: el recorte
    // de arriba puede dejar un assistant huérfano al inicio (400 de Anthropic).
    while (history.length > 0 && history[0].role === "assistant") history.shift();

    // ── Acceso al proyecto + tier del modelo (RLS: si no tiene acceso, viene vacío) ──
    const { data: proj } = await supabase.from("projects")
      .select("id, name, feature_flags").eq("id", projectId).maybeSingle();
    if (!proj) return json({ error: "proyecto no encontrado o sin acceso" }, 403);

    // deno-lint-ignore no-explicit-any
    let flags: any = proj.feature_flags ?? {};
    if (typeof flags === "string") { try { flags = JSON.parse(flags); } catch { flags = {}; } }
    if (flags?.module_ai_assistant !== true) return json({ error: "el Asistente de IA no está habilitado en este proyecto" }, 403);
    const tier = typeof flags?.ai_model_tier === "string" ? flags.ai_model_tier : "economico";
    const model = MODEL_BY_TIER[tier] ?? MODEL_BY_TIER.economico;

    // ── Tools con projectId cerrado en closure ──
    const tools = buildTools(supabase, projectId);
    const anthropicTools = tools.map(t => ({
      name: t.name, description: t.description, input_schema: t.input_schema,
    }));
    const system = buildSystemPrompt({
      userName, userRole: profile?.role ?? null, projectName: String(proj.name ?? "el proyecto"), isFirstTurn,
    });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // deno-lint-ignore no-explicit-any
    const messages: any[] = [
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: message.slice(0, MAX_MESSAGE_CHARS) },
    ];

    // ── Loop de tool-use (sin temperature/thinking: compatible con los 3 tiers) ──
    let totalIn = 0, totalOut = 0;
    // El SVG del gráfico NO viaja al modelo (ahorra tokens): se intercepta aquí
    // y se adjunta a la respuesta final como chartSvg. Si hay varios, gana el último.
    let chartSvg: string | null = null;
    // deno-lint-ignore no-explicit-any
    let response: any = null;
    for (let iter = 0; iter <= MAX_TOOL_ITERATIONS; iter++) {
      response = await anthropic.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system,
        tools: anthropicTools,
        messages,
      });
      totalIn += response.usage?.input_tokens ?? 0;
      totalOut += response.usage?.output_tokens ?? 0;

      if (response.stop_reason !== "tool_use" || iter === MAX_TOOL_ITERATIONS) break;

      // Ejecutar TODAS las tool_use del turno y devolver los resultados juntos.
      // deno-lint-ignore no-explicit-any
      const toolResults: any[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const def = tools.find(t => t.name === block.name);
        let resultStr: string;
        let isError = false;
        if (!def) {
          resultStr = JSON.stringify({ error: `herramienta desconocida: ${block.name}` });
          isError = true;
        } else {
          try {
            let out = await def.execute(block.input ?? {});
            // Intercepción del gráfico: el SVG se guarda para la respuesta y al
            // modelo solo le llega el resumen numérico + confirmación.
            if (def.name === CHART_TOOL_NAME && out && typeof out === "object" && CHART_SVG_KEY in out) {
              // deno-lint-ignore no-explicit-any
              const { [CHART_SVG_KEY]: svg, ...rest } = out as any;
              if (typeof svg === "string" && svg) chartSvg = svg;
              out = { ...rest, nota: "El gráfico ya se muestra en el chat: NO lo describas visualmente, solo comenta las cifras del resumen." };
            }
            resultStr = JSON.stringify(out ?? null);
          } catch (e) {
            resultStr = JSON.stringify({ error: String((e as Error)?.message ?? e) });
            isError = true;
          }
        }
        // Defensa de contexto: un resultado gigante se trunca (el modelo puede re-pedir acotado).
        if (resultStr.length > 30000) resultStr = resultStr.slice(0, 30000) + '…(truncado, acota el rango)';
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: resultStr, is_error: isError });
      }
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
    }

    const reply = (response?.content ?? [])
      // deno-lint-ignore no-explicit-any
      .filter((b: any) => b.type === "text")
      // deno-lint-ignore no-explicit-any
      .map((b: any) => b.text)
      .join("\n")
      .trim();

    return json({
      reply: reply || "No pude generar una respuesta. Intente reformular la pregunta.",
      ...(chartSvg ? { chartSvg } : {}),
      usage: { input_tokens: totalIn, output_tokens: totalOut, model },
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
