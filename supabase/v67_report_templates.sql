-- v67 — Módulo de Reportes por Correo: modelos de reporte programados + destinatarios + bitácora.
--
-- Tablas project-scoped, espejo de la receta de equipment/contacts + multi-tenant v56/v57:
-- org_id NOT NULL (default org-demo) + FK + trigger set_org_id + RLS permisiva por proyecto
-- (can_access_project) + org_guard restrictiva. El generador (GitHub Action) usa service_role.

-- ─────────────────────────────────────────────────────────────────────────────
-- report_templates — un "modelo" de correo programado por proyecto.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.report_templates (
  id             text primary key,
  project_id     text not null references public.projects(id) on delete cascade,
  org_id         uuid not null default '11111111-1111-4111-8111-111111111111'
                   references public.organizations(id) on delete cascade,
  name           text not null,
  periodicity    text not null default 'weekly',     -- 'daily' | 'weekly' | 'monthly'
  send_hour      int  not null default 8,            -- hora 0-23 (UTC)
  send_dow       int,                                -- 0-6 (domingo=0) para 'weekly'
  send_dom       int,                                -- 1-28 para 'monthly'
  scope_json     jsonb,                              -- filtros: { sector_id?, tipo?, date_from?, date_to? }
  custom_message text,
  status         text not null default 'active',     -- 'active' | 'inactive'
  next_send_at   bigint,                             -- ms; próxima ocurrencia (lo calcula el generador)
  last_run_at    bigint,
  created_at     bigint not null,
  updated_at     bigint not null,
  constraint report_templates_name_uniq unique (project_id, name)
);
create index if not exists report_templates_project_idx on public.report_templates(project_id);
create index if not exists report_templates_due_idx     on public.report_templates(status, next_send_at);
create index if not exists report_templates_org_idx      on public.report_templates(org_id);

alter table public.report_templates enable row level security;
drop policy if exists report_templates_access on public.report_templates;
create policy report_templates_access on public.report_templates for all
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));
drop policy if exists org_guard on public.report_templates;
create policy org_guard on public.report_templates as restrictive for all
  using (org_id = public.auth_org()) with check (org_id = public.auth_org());
drop trigger if exists trg_set_org_id on public.report_templates;
create trigger trg_set_org_id before insert or update on public.report_templates
  for each row execute function public.set_org_id();

-- ─────────────────────────────────────────────────────────────────────────────
-- report_template_recipients — destinatarios (email desnormalizado) de un modelo.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.report_template_recipients (
  id          text primary key,
  template_id text not null references public.report_templates(id) on delete cascade,
  org_id      uuid not null default '11111111-1111-4111-8111-111111111111'
                references public.organizations(id) on delete cascade,
  email       text not null,
  name        text,
  created_at  bigint not null,
  constraint report_recipients_uniq unique (template_id, email)
);
create index if not exists report_recipients_template_idx on public.report_template_recipients(template_id);
create index if not exists report_recipients_org_idx       on public.report_template_recipients(org_id);

alter table public.report_template_recipients enable row level security;
drop policy if exists report_recipients_access on public.report_template_recipients;
create policy report_recipients_access on public.report_template_recipients for all
  using (exists (select 1 from public.report_templates rt where rt.id = template_id and public.can_access_project(rt.project_id)))
  with check (exists (select 1 from public.report_templates rt where rt.id = template_id and public.can_access_project(rt.project_id)));
drop policy if exists org_guard on public.report_template_recipients;
create policy org_guard on public.report_template_recipients as restrictive for all
  using (org_id = public.auth_org()) with check (org_id = public.auth_org());
drop trigger if exists trg_set_org_id on public.report_template_recipients;
create trigger trg_set_org_id before insert or update on public.report_template_recipients
  for each row execute function public.set_org_id();

-- ─────────────────────────────────────────────────────────────────────────────
-- report_runs — bitácora de envíos (para mostrar "último envío" y diagnósticos).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.report_runs (
  id          text primary key,
  template_id text not null references public.report_templates(id) on delete cascade,
  org_id      uuid not null default '11111111-1111-4111-8111-111111111111'
                references public.organizations(id) on delete cascade,
  ran_at      bigint not null,
  status      text not null,            -- 'ok' | 'error'
  error       text,
  recipients  int,
  created_at  bigint not null
);
create index if not exists report_runs_template_idx on public.report_runs(template_id, ran_at desc);
create index if not exists report_runs_org_idx       on public.report_runs(org_id);

alter table public.report_runs enable row level security;
drop policy if exists report_runs_access on public.report_runs;
create policy report_runs_access on public.report_runs for all
  using (exists (select 1 from public.report_templates rt where rt.id = template_id and public.can_access_project(rt.project_id)))
  with check (exists (select 1 from public.report_templates rt where rt.id = template_id and public.can_access_project(rt.project_id)));
drop policy if exists org_guard on public.report_runs;
create policy org_guard on public.report_runs as restrictive for all
  using (org_id = public.auth_org()) with check (org_id = public.auth_org());
drop trigger if exists trg_set_org_id on public.report_runs;
create trigger trg_set_org_id before insert or update on public.report_runs
  for each row execute function public.set_org_id();
