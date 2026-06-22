import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Alta/edición/baja de usuarios — SOLO ejecutable por un CREATOR autenticado.
// Crea la cuenta de Supabase Auth (service_role) + la fila en `users` + accesos a proyectos.
// Desplegada con verify_jwt=true (la plataforma valida el JWT antes de ejecutar).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const VALID_ROLES = ["CREATOR", "RESIDENT", "SUPERVISOR", "OPERATOR"];

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await caller.auth.getUser();
    if (uErr || !user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data: callerProfile } = await admin.from("users").select("role").eq("auth_id", user.id).maybeSingle();
    if (!callerProfile || callerProfile.role !== "CREATOR") return json({ error: "forbidden: solo CREATOR" }, 403);

    const body = await req.json();
    const action = body?.action;
    const now = Date.now();

    if (action === "create") {
      const { email, password, name, apellido, role, projectIds } = body;
      if (!email || !password || !name || !role) return json({ error: "faltan campos (email, password, name, role)" }, 400);
      if (!VALID_ROLES.includes(role)) return json({ error: `rol inválido: ${role}` }, 400);
      const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (cErr || !created?.user) return json({ error: cErr?.message ?? "no se pudo crear el usuario de Auth" }, 400);
      const uid = created.user.id;
      const { error: insErr } = await admin.from("users").insert({
        id: uid, auth_id: uid, email, name, apellido: apellido ?? null, role, is_active: true, created_at: now, updated_at: now,
      });
      if (insErr) { await admin.auth.admin.deleteUser(uid); return json({ error: insErr.message }, 400); }
      let accessWarning: string | null = null;
      if (Array.isArray(projectIds) && projectIds.length > 0) {
        const rows = projectIds.map((pid: string) => ({ id: crypto.randomUUID(), user_id: uid, project_id: pid, created_at: now, updated_at: now }));
        const { error: paErr } = await admin.from("user_project_access").insert(rows);
        if (paErr) accessWarning = paErr.message;
      }
      return json({ ok: true, id: uid, accessWarning });
    }

    if (action === "update") {
      const { userId, role, isActive, password, email, name, apellido } = body;
      if (!userId) return json({ error: "falta userId" }, 400);
      if (role !== undefined && !VALID_ROLES.includes(role)) return json({ error: `rol inválido: ${role}` }, 400);
      const { data: target } = await admin.from("users").select("auth_id").eq("id", userId).maybeSingle();
      if (!target) return json({ error: "usuario no encontrado" }, 404);
      const patch: Record<string, unknown> = { updated_at: now };
      if (role !== undefined) patch.role = role;
      if (isActive !== undefined) patch.is_active = isActive;
      if (email !== undefined) patch.email = email;
      if (name !== undefined) patch.name = name;
      if (apellido !== undefined) patch.apellido = apellido;
      await admin.from("users").update(patch).eq("id", userId);
      if (target.auth_id && (password || email)) {
        const authPatch: Record<string, unknown> = {};
        if (password) authPatch.password = password;
        if (email) authPatch.email = email;
        await admin.auth.admin.updateUserById(target.auth_id, authPatch);
      }
      return json({ ok: true });
    }

    if (action === "delete") {
      const { userId } = body;
      if (!userId) return json({ error: "falta userId" }, 400);
      const { data: target } = await admin.from("users").select("id").eq("id", userId).maybeSingle();
      if (!target) return json({ error: "usuario no encontrado" }, 404);
      await admin.from("users").update({ is_active: false, updated_at: now }).eq("id", userId);
      return json({ ok: true });
    }

    return json({ error: "acción inválida (create|update|delete)" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
