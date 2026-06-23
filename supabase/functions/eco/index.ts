import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// eco — API del ECOSISTEMA Flow (Flow_QA/QC expone; Flow_PM consume). SOLO LECTURA.
// Auth MÁQUINA-A-MÁQUINA: el caller manda `Authorization: Bearer <API_KEY>`. La key NO
// se guarda en claro: se hashea (sha256) y se busca en `eco_api_keys` → resuelve el `org_id`
// de la empresa dueña de esa key. Toda respuesta queda ACOTADA a ese org_id (cero leak
// cross-empresa). Deploy:  supabase functions deploy eco --no-verify-jwt
// (no requiere secreto ECO_API_KEY; usa SUPABASE_URL + SERVICE_ROLE_KEY que ya están).

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  // Auth M2M: la key → hash → org_id (por empresa, revocable en eco_api_keys).
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const keyHash = await sha256hex(token);
  const { data: orgId, error: keyErr } = await admin.rpc("eco_org_from_key", { p_key_hash: keyHash });
  if (keyErr || !orgId) return json({ error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop();

  try {
    if (action === "protocol-status") {
      const id = url.searchParams.get("protocol_id");
      if (!id) return json({ error: "protocol_id requerido" }, 400);
      const { data, error } = await admin.rpc("eco_protocol_status", { p_org_id: orgId, p_protocol_id: id });
      if (error) throw error;
      return data ? json(data) : json({ error: "not_found" }, 404);
    }
    if (action === "quality-released") {
      const scope = url.searchParams.get("scope");
      const id = url.searchParams.get("id");
      const rule = url.searchParams.get("rule") ?? "all_approved";
      if (scope !== "sector" && scope !== "sample") return json({ error: "scope debe ser sector|sample" }, 400);
      if (!id) return json({ error: "id requerido" }, 400);
      const { data, error } = await admin.rpc("eco_quality_released", { p_org_id: orgId, p_scope: scope, p_id: id, p_rule: rule });
      if (error) throw error;
      return json(data);
    }
    if (action === "ensayo-summary") {
      const pid = url.searchParams.get("project_id");
      if (!pid) return json({ error: "project_id requerido" }, 400);
      const { data, error } = await admin.rpc("eco_ensayo_summary", { p_org_id: orgId, p_project_id: pid });
      if (error) throw error;
      return json(data);
    }
    return json({ error: "unknown_action", actions: ["protocol-status", "quality-released", "ensayo-summary"] }, 404);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
