import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// eco — API del ECOSISTEMA Flow (Flow_QA/QC expone; Flow_PM consume).
// Solo lectura de hechos de Calidad (estado de protocolo, ¿sector/muestra liberado?,
// resumen de ensayos). Auth MÁQUINA-A-MÁQUINA por API key (no por usuario): por eso
// se despliega con verify_jwt=false:  supabase functions deploy eco --no-verify-jwt
// Secreto:  supabase secrets set ECO_API_KEY=<random largo>
// Lee con service_role; las funciones SQL (v52) están revocadas a anon/authenticated.

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = Deno.env.get("ECO_API_KEY") ?? "";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Comparación en tiempo constante (evita timing attacks sobre la API key).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  // Auth M2M
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!API_KEY || !safeEqual(token, API_KEY)) return json({ error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop(); // .../eco/<action>
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  try {
    if (action === "protocol-status") {
      const id = url.searchParams.get("protocol_id");
      if (!id) return json({ error: "protocol_id requerido" }, 400);
      const { data, error } = await admin.rpc("eco_protocol_status", { p_protocol_id: id });
      if (error) throw error;
      return data ? json(data) : json({ error: "not_found" }, 404);
    }

    if (action === "quality-released") {
      const scope = url.searchParams.get("scope");
      const id = url.searchParams.get("id");
      const rule = url.searchParams.get("rule") ?? "all_approved";
      if (scope !== "sector" && scope !== "sample") return json({ error: "scope debe ser sector|sample" }, 400);
      if (!id) return json({ error: "id requerido" }, 400);
      const { data, error } = await admin.rpc("eco_quality_released", { p_scope: scope, p_id: id, p_rule: rule });
      if (error) throw error;
      return json(data);
    }

    if (action === "ensayo-summary") {
      const pid = url.searchParams.get("project_id");
      if (!pid) return json({ error: "project_id requerido" }, 400);
      const { data, error } = await admin.rpc("eco_ensayo_summary", { p_project_id: pid });
      if (error) throw error;
      return json(data);
    }

    return json({ error: "unknown_action", actions: ["protocol-status", "quality-released", "ensayo-summary"] }, 404);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
