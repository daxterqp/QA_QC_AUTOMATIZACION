-- ============================================================================
-- v53 — Multi-tenant `org_id` (COLUMNA VERTEBRAL)  ·  retrofit SEGURO
-- ============================================================================
-- Cierra el hueco raíz: hoy un CREATOR ve/borra cualquier proyecto (god-mode);
-- con 2+ empresas eso filtra/borra datos cruzados. Aquí metemos `org_id` en TODO.
--
-- Diseño para NO romper nada (data ficticia, 1 empresa):
--   1) Crea `organizations` + 1 org default (UUID FIJO, para sembrar igual en Flow_PM).
--   2) Agrega `org_id uuid` a todas las tablas + BACKFILL + DEFAULT + NOT NULL a la org default.
--   3) TRIGGER que FUERZA `org_id = auth_org()` en cada INSERT/UPDATE (anti-spoof) → el sync
--      y los clientes siguen funcionando SIN cambios (no hace falta que manden org_id).
--   4) `can_access_project` pasa a ser ORG-SCOPED (un CREATOR nunca cruza de empresa).
--
-- ORDEN (clave, revisado por panel adversarial): con check_function_bodies=on (default de
-- Postgres/Supabase) una función `language sql` se VALIDA contra las columnas al crearse. Por
-- eso `auth_org()`/`can_access_project()` (que leen `users.org_id`/`projects.org_id`) deben
-- definirse DESPUÉS de agregar la columna. Secuencia: pgcrypto → organizations → set_org_id
-- (plpgsql, no se valida al crear) → DO-block (columna+backfill+NOT NULL+FK+índices+trigger) →
-- helpers sql → RLS de organizations.
-- Aplicar en orden: v53 → v54 → v55.  Rollback: ver docs/MIGRACION_ORG_RUNBOOK.md.
-- ============================================================================

create extension if not exists pgcrypto;

-- 1) Organizaciones + org default (MISMO UUID a sembrar en Flow_PM para el eco).
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text unique, created_at bigint, updated_at bigint
);
insert into public.organizations(id, name, slug, created_at, updated_at)
values ('11111111-1111-4111-8111-111111111111', 'Empresa Demo', 'empresa-demo',
        (extract(epoch from now())*1000)::bigint, (extract(epoch from now())*1000)::bigint)
on conflict (id) do nothing;

-- 2) Trigger que FUERZA org_id (anti-spoof) → no rompe sync/clientes.
--    - Si hay sesión (auth_org() no nula): la org de la SESIÓN manda; ignora cualquier org_id
--      que venga en el payload (evita que se planten/muevan filas a otra empresa).
--    - Sin sesión (service_role/seed sin JWT): respeta lo que venga; si vino null, cae a la org
--      default. La frontera multi-tenant en escrituras service_role se enforcea en el código TS
--      (Edge admin-users valida org del CREATOR), no aquí: el trigger no distingue
--      service_role de "CREATOR de org A operando".
--    Es plpgsql → su cuerpo NO se valida contra columnas al crearse, así que puede ir ANTES del
--    DO-block aunque auth_org() todavía no exista (se resuelve en runtime, ya con todo creado).
create or replace function public.set_org_id() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    if public.auth_org() is not null then
      NEW.org_id := public.auth_org();                              -- sesión org manda
    elsif NEW.org_id is null then
      NEW.org_id := '11111111-1111-4111-8111-111111111111'::uuid;   -- service_role/seed sin sesión
    end if;
    return NEW;
  end $$;

-- 3) Agregar org_id + backfill + DEFAULT + NOT NULL + FK + índices + trigger a TODAS las tablas.
--    org_id NOT NULL DEFAULT org-demo → imposible una fila con org NULL por cualquier path
--    (un row NULL sería invisible por RLS = sync roto en silencio; lo prevenimos en la base).
do $$
declare t text; has_pid boolean;
  default_org constant text := '11111111-1111-4111-8111-111111111111';
begin
  foreach t in array array[
    'users','projects','user_project_access','push_tokens','activities',
    'annotation_comment_photos','annotation_comments','dashboard_notes','equipment',
    'equipment_activities','evidences','lab_aux_tables','locations','non_conformities',
    'phone_contacts','plan_annotations','plan_measurements','plans','project_sectors',
    'protocol_approvals','protocol_equipment','protocol_items','protocol_summary_rows',
    'protocol_template_items','protocol_templates','protocols','recycle_bin','samples',
    'session_form_template_items','session_form_templates','work_session_form_items',
    'work_session_gps_points','work_session_intervals','work_sessions','work_shifts'
  ] loop
    execute format('alter table public.%I add column if not exists org_id uuid', t);
    execute format('update public.%I set org_id = %L where org_id is null', t, default_org);
    execute format('alter table public.%I alter column org_id set default %L', t, default_org);
    execute format('alter table public.%I alter column org_id set not null', t);
    begin
      execute format('alter table public.%I add constraint %I foreign key (org_id) references public.organizations(id) on delete cascade', t, t||'_org_fk');
    exception when duplicate_object then null; end;
    execute format('create index if not exists %I on public.%I(org_id)', t||'_org_idx', t);
    select exists(select 1 from information_schema.columns
                  where table_schema='public' and table_name=t and column_name='project_id') into has_pid;
    if has_pid then
      execute format('create index if not exists %I on public.%I(org_id, project_id)', t||'_org_pid_idx', t);
    end if;
    -- BEFORE INSERT OR UPDATE → la rama UPDATE del upsert también sanea/fuerza org_id.
    execute format('drop trigger if exists trg_set_org_id on public.%I', t);
    execute format('create trigger trg_set_org_id before insert or update on public.%I for each row execute function public.set_org_id()', t);
  end loop;
end $$;

-- 4) Helpers org-scoped (SECURITY DEFINER; bypassan RLS para resolver el propio acceso).
--    Van DESPUÉS del DO-block: `language sql` valida `users.org_id`/`projects.org_id` al crearse.
create or replace function public.auth_org() returns uuid
  language sql stable security definer set search_path = public as $$
  -- COALESCE a la org default mientras es single-tenant: un usuario sin fila en `users`
  -- (o con org transitoriamente nula) cae a la org demo en vez de quedar MUDO y romper el sync.
  -- TRADE-OFF: al pasar a multi-tenant REAL (2+ empresas con clientes) QUITAR el coalesce,
  -- para que un auth.uid() sin fila propia no vea la org demo. Ver MIGRACION_ORG_RUNBOOK.md.
  select coalesce((select org_id from public.users where auth_id = auth.uid()),
                  '11111111-1111-4111-8111-111111111111'::uuid) $$;

create or replace function public.is_org_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(public.app_user_role() in ('CREATOR','ADMIN'), false) $$;

-- can_access_project AHORA exige misma org (cierra el god-mode cross-empresa).
create or replace function public.can_access_project(p_project_id text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects pr
    where pr.id = p_project_id
      and pr.org_id = public.auth_org()
      and ( public.is_org_admin()
            or pr.created_by_id = public.app_user_id()
            or exists (select 1 from public.user_project_access a
                       where a.user_id = public.app_user_id() and a.project_id = pr.id) )
  ) $$;

grant execute on function public.auth_org() to authenticated;
grant execute on function public.is_org_admin() to authenticated;

-- 5) RLS de organizations (ya existe auth_org()): cada usuario solo ve SU empresa.
alter table public.organizations enable row level security;
drop policy if exists org_self on public.organizations;
create policy org_self on public.organizations for select using (id = public.auth_org());
