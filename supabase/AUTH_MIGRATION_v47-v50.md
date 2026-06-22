# Migración Auth + RLS (v47–v50) — aplicada en Supabase

Migración de auth custom (tabla `users` + password texto plano + anon key) a **Supabase Auth +
RLS real**. Aplicadas vía MCP (quedan en el historial de migraciones de Supabase). Login por **email**.

## v47 — `auth_bridge_and_helpers` (fundación, no rompe nada)
- `users.auth_id uuid` (FK a `auth.users`) + `users.email text` + índices únicos parciales.
- Funciones SECURITY DEFINER (search_path=public, stable):
  - `app_user_id()` → `users.id` del usuario actual (resuelve `auth.uid()` → fila por `auth_id`).
  - `app_user_role()`, `is_creator()`.
  - `can_access_project(text)` → creator OR dueño (`projects.created_by_id`) OR miembro (`user_project_access`).
  - Helpers de tablas hijas (resuelven el proyecto vía el padre): `can_access_protocol`, `can_access_protocol_item`,
    `can_access_template`, `can_access_plan`, `can_access_annotation`, `can_access_comment`,
    `can_access_equipment`, `can_access_session_template`, `can_access_session`.

## v48 — `rls_strict_policies` (RLS real)
- DROP de todas las políticas permisivas `USING(true)` del schema public.
- Políticas reales `TO authenticated` en las 35 tablas:
  - **project_id directo** → `can_access_project(project_id)` (projects usa `id`; dashboard_notes admite null).
  - **tablas hijas** → helper correspondiente (`can_access_protocol(protocol_id)`, etc.).
  - **users**: SELECT a cualquier authenticated; UPDATE solo fila propia o creator; INSERT/DELETE denegado (solo via Edge Function service_role).
  - **user_project_access**: SELECT propio o creator; INSERT/UPDATE/DELETE solo creator.
  - **push_tokens**: solo las del propio usuario.
- Revoca EXECUTE de `delete_protocol_to_recycle` a anon; grant a authenticated.

## v49 — `lock_helper_functions`
- `REVOKE EXECUTE ... FROM public, anon` + `GRANT ... TO authenticated` en las 13 funciones helper +
  `delete_protocol_to_recycle` (Postgres concede a PUBLIC por defecto; había que revocarlo).
- Resultado advisor: **0 `rls_policy_always_true`, 0 funciones anon-ejecutables.**

## v50 — `delete_rpc_access_guard`
- `delete_protocol_to_recycle` ahora valida `can_access_project(v_protocol.project_id)` antes de borrar
  (cierra BOLA: un authenticated no puede borrar ensayos de proyectos ajenos). Resto del cuerpo = v44.

## Estado del advisor (security) tras v50
- ✅ Sin políticas permisivas. ✅ Sin funciones anon-ejecutables.
- 🟡 14 `authenticated_security_definer_function_executable` → POR DISEÑO (RLS necesita los helpers
  ejecutables por authenticated; solo devuelven booleanos del propio acceso). Opcional: mover helpers a
  schema `private` (no expuesto por PostgREST) para silenciarlos — DIFERIDO (requiere reescribir las 35
  políticas; hacerlo con el usuario presente para probar).
- 🟡 `auth_leaked_password_protection` desactivado → toggle de 1 clic en Dashboard (Auth → Settings).

## Pendientes (necesitan al usuario)
- Reseed de los 4 usuarios restantes (Angel, Pablo, Pedro, Ruben) con emails reales vía Edge Function
  `admin-users` (no tienen cuenta Auth aún → no pueden entrar). `user_project_access` está vacía → otorgarles acceso.
- Revocar la API key de Firecrawl; resetear contraseña de la base; enable leaked-password protection.
