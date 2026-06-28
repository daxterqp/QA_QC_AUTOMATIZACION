-- v70 — Proyectos DEMO: flag is_demo + visibilidad para VIEWER sin acceso real.
-- Un VIEWER que aún no tiene NINGÚN proyecto real (sin filas en user_project_access
-- a proyectos no-demo) puede LEER los proyectos is_demo. Apenas se le asigna/entra a
-- uno real, deja de cumplir la condición y los demo desaparecen solos. CREATOR ve
-- todo lo de su org (incluidos demos) por can_access_project. Solo lectura.
-- (Aplicada vía MCP apply_migration; se versiona aquí para trazabilidad.)

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- ¿El usuario actual tiene acceso a algún proyecto REAL (no-demo)?
CREATE OR REPLACE FUNCTION public.has_real_project_access() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_project_access a
    JOIN public.projects p ON p.id = a.project_id
    WHERE a.user_id = public.app_user_id()
      AND COALESCE(p.is_demo, false) = false
  )
$$;
REVOKE ALL ON FUNCTION public.has_real_project_access() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_real_project_access() TO authenticated;

-- Permitir a un VIEWER sin acceso real leer los proyectos demo (además de lo de siempre).
ALTER POLICY acc_projects_sel ON public.projects
  USING (
    can_access_project(id)
    OR (created_by_id = app_user_id())
    OR (COALESCE(is_demo, false) AND public.is_viewer() AND NOT public.has_real_project_access())
  );
