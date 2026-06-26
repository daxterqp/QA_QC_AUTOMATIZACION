-- v44 — Módulo "Carga de datos topográficos".
-- (1) Tabla topo_cargas: metadata de cada carga + snapshot de filas por CÓDIGO de
--     ensayo (fuente de verdad; se conservan aunque el ensayo aún no exista →
--     binding diferido). Código T<ddmmaa>-<seq>.
-- (2) Columnas topo_* en protocols: la capa de coordenadas topográficas que SIEMPRE
--     se actualiza (no entra al snapshot congelado del llenado numérico).
-- RLS espejo de `samples` (can_access_project + NOT is_viewer) + org_guard restrictiva
-- + trigger set_org_id (multi-tenant). Aditivo y seguro.
-- Aplicada a producción el 2026-06-26 vía MCP apply_migration (advisor sin issues nuevos).

-- ── 1) topo_cargas ──────────────────────────────────────────────────────────
create table if not exists public.topo_cargas (
  id            text primary key,
  project_id    text not null references public.projects(id) on delete cascade,
  carga_code    text not null,
  seq           integer,
  carga_date    text,
  input_method  text,
  created_by_id text,
  upload_status text,
  applied_at    bigint,
  rows_json     jsonb not null default '[]'::jsonb,
  columns_json  jsonb,
  created_at    bigint not null,
  updated_at    bigint not null,
  org_id        uuid not null default '11111111-1111-4111-8111-111111111111'::uuid,
  constraint topo_cargas_code_unique unique (project_id, carga_code)
);
create index if not exists topo_cargas_project_idx on public.topo_cargas (project_id);

alter table public.topo_cargas enable row level security;

drop trigger if exists trg_set_org_id on public.topo_cargas;
create trigger trg_set_org_id before insert or update on public.topo_cargas
  for each row execute function public.set_org_id();

drop policy if exists acc_topo_cargas_sel on public.topo_cargas;
create policy acc_topo_cargas_sel on public.topo_cargas for select to authenticated
  using (can_access_project(project_id));
drop policy if exists acc_topo_cargas_ins on public.topo_cargas;
create policy acc_topo_cargas_ins on public.topo_cargas for insert to authenticated
  with check (can_access_project(project_id) and not is_viewer());
drop policy if exists acc_topo_cargas_upd on public.topo_cargas;
create policy acc_topo_cargas_upd on public.topo_cargas for update to authenticated
  using (can_access_project(project_id) and not is_viewer())
  with check (can_access_project(project_id) and not is_viewer());
drop policy if exists acc_topo_cargas_del on public.topo_cargas;
create policy acc_topo_cargas_del on public.topo_cargas for delete to authenticated
  using (can_access_project(project_id) and not is_viewer());

drop policy if exists org_guard on public.topo_cargas;
create policy org_guard on public.topo_cargas as restrictive for all to public
  using (org_id = auth_org()) with check (org_id = auth_org());

-- ── 2) columnas topo_* en protocols ─────────────────────────────────────────
alter table public.protocols
  add column if not exists topo_source_carga_id text,
  add column if not exists topo_coord_system     text,
  add column if not exists topo_coord_east        double precision,
  add column if not exists topo_coord_north       double precision,
  add column if not exists topo_coord_elevation   double precision,
  add column if not exists topo_latitude          double precision,
  add column if not exists topo_longitude         double precision,
  add column if not exists topo_sector_id         text,
  add column if not exists topo_values_json       jsonb,
  add column if not exists topo_updated_at        bigint;
create index if not exists protocols_topo_source_carga_idx on public.protocols (topo_source_carga_id);
