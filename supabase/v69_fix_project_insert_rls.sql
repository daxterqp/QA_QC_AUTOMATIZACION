-- v69 — Fix: crear proyecto nuevo se bloqueaba bajo RLS org_id.
--
-- Causa: can_access_project() lee la fila desde public.projects. Durante el INSERT
-- del propio proyecto esa fila aún NO existe, así que el WITH CHECK de la política
-- acc_projects_ins (= can_access_project(id) AND NOT is_viewer()) daba FALSE y el
-- INSERT siempre se rechazaba. Regresión introducida por el backbone org_id
-- (v56-v59), donde can_access_project pasó a consultar la tabla.
--
-- Arreglo: la política de creación no debe exigir que la fila exista. Basta con que
-- el creador se asigne como owner (created_by_id = app_user_id()) y no sea VIEWER.
-- La política RESTRICTIVA org_guard ya fuerza org_id = auth_org(), de modo que no se
-- puede crear en otra organización. SELECT/UPDATE/DELETE no se tocan (ahí la fila ya
-- existe y can_access_project funciona correctamente).
--
-- Aplicada a producción el 2026-06-25 vía MCP apply_migration (verificada con INSERT
-- impersonado en transacción rollback).

drop policy if exists acc_projects_ins on public.projects;
create policy acc_projects_ins on public.projects
  for insert to authenticated
  with check (
    created_by_id = public.app_user_id()
    and not public.is_viewer()
  );
