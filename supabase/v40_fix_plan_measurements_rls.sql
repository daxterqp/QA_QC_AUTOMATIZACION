-- v40 — FIX RLS de plan_measurements.
--
-- BUG: plan_measurements_sync_migration.sql creó políticas basadas en
-- auth.uid()::text (JOIN con user_project_access). Pero TODA la app usa la
-- ANON key (sin sesión de Supabase Auth) → auth.uid() es NULL → las políticas
-- coinciden con 0 filas → las mediciones de planos NO se leen ni escriben en la
-- nube para clientes anon (sincronización silenciosamente vacía).
--
-- El resto del esquema usa el patrón permisivo "Allow anon full access"
-- (USING (true) WITH CHECK (true)) — el hardening de seguridad real está
-- diferido para el final. Alineamos plan_measurements con ese patrón.
--
-- Córrelo en el SQL Editor de Supabase (idempotente).

ALTER TABLE public.plan_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_measurements_select ON public.plan_measurements;
DROP POLICY IF EXISTS plan_measurements_mutate ON public.plan_measurements;
DROP POLICY IF EXISTS "Allow anon full access" ON public.plan_measurements;

CREATE POLICY "Allow anon full access" ON public.plan_measurements
  FOR ALL USING (true) WITH CHECK (true);
