-- v71 — can_access_project incluye proyectos DEMO para VIEWER sin acceso real.
-- Así las tablas HIJAS (protocols, protocol_items, locations, evidences, plans,
-- non_conformities, approvals, templates, annotations, samples, project_sectors…)
-- cuyas políticas de SELECT usan can_access_project(project_id) — directo o vía los
-- helpers anidados can_access_protocol/_item/_plan/_annotation/_comment, que TODOS
-- llaman a can_access_project — dejan LEER el contenido del proyecto demo.
-- Las ESCRITURAS siguen bloqueadas: las políticas acc_*_ins/upd/del exigen
-- not is_viewer()/app_user_can_write() de forma independiente (verificado).
-- (Aplicada vía MCP apply_migration; se versiona aquí para trazabilidad.)
CREATE OR REPLACE FUNCTION public.can_access_project(p_project_id text)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (
    select 1 from public.projects pr
    where pr.id = p_project_id
      and pr.org_id = public.auth_org()
      and ( public.is_org_admin()
            or pr.created_by_id = public.app_user_id()
            or exists (select 1 from public.user_project_access a
                       where a.user_id = public.app_user_id() and a.project_id = pr.id)
            -- Proyectos demo: legibles por un VIEWER que aún no tiene proyecto real.
            or ( coalesce(pr.is_demo, false)
                 and public.is_viewer()
                 and not public.has_real_project_access() ) )
  ) $$;
