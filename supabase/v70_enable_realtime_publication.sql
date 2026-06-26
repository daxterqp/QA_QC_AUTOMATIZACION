-- v70 — #7C Tiempo real (Supabase Realtime). Habilita los cambios en vivo de las
-- tablas que importan para ver actualizaciones con la app abierta: estados de
-- ensayo (protocols), no conformidades, planos, observaciones de plano
-- (plan_annotations) y sus comentarios (annotation_comments).
--
-- REPLICA IDENTITY FULL: necesario para que los filtros (project_id=eq.X) y los
-- eventos DELETE lleguen completos por Realtime. Tablas de bajo volumen → costo
-- en WAL despreciable.
--
-- RLS sigue aplicando en Realtime: cada suscriptor solo recibe cambios de filas
-- accesibles (org_guard + can_access_project) → seguro multi-empresa.
--
-- Aplicada a producción el 2026-06-25 vía MCP apply_migration.

alter table public.protocols           replica identity full;
alter table public.non_conformities    replica identity full;
alter table public.plans               replica identity full;
alter table public.plan_annotations    replica identity full;
alter table public.annotation_comments replica identity full;

alter publication supabase_realtime add table public.protocols;
alter publication supabase_realtime add table public.non_conformities;
alter publication supabase_realtime add table public.plans;
alter publication supabase_realtime add table public.plan_annotations;
alter publication supabase_realtime add table public.annotation_comments;
