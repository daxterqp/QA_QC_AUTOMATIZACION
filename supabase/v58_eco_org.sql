-- ============================================================================
-- v58 — API `eco` ORG-SCOPED (reemplaza/supera a v52)
-- ============================================================================
-- Antes: una sola ECO_API_KEY global + funciones sin org → con la key se leía data
-- de CUALQUIER empresa. Ahora: una API key POR EMPRESA (hash en `eco_api_keys`), y
-- las funciones exigen `p_org_id` y filtran por él.
-- La Edge Function (supabase/functions/eco/index.ts) resuelve org desde el hash de
-- la key con `eco_org_from_key()` y pasa `p_org_id`.
-- NOTA: si NO aplicaste v52, aplicá directamente este v58 (lo supera).
-- ============================================================================

create table if not exists public.eco_api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  key_hash text not null unique,   -- sha256 hex de la API key (NUNCA la key en claro)
  label text, scopes text[], revoked boolean not null default false,
  created_at bigint
);
revoke all on table public.eco_api_keys from anon, authenticated;
alter table public.eco_api_keys enable row level security;  -- sin políticas → solo service_role

-- Resuelve la org desde el hash de la key (la usa el Edge con service_role).
create or replace function public.eco_org_from_key(p_key_hash text) returns uuid
  language sql stable security definer set search_path = public as $$
  select org_id from public.eco_api_keys where key_hash = p_key_hash and not revoked $$;

-- Funciones eco: AHORA exigen org_id y filtran por él (cero leak cross-empresa).
create or replace function public.eco_protocol_status(p_org_id uuid, p_protocol_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id',id,'project_id',project_id,'status',status,'sector_id',sector_id,
    'sample_id',sample_id,'protocol_code',protocol_code,'updated_at',updated_at)
  from protocols where id = p_protocol_id and org_id = p_org_id $$;

create or replace function public.eco_quality_released(p_org_id uuid, p_scope text, p_id text, p_rule text default 'all_approved')
returns jsonb language sql stable security definer set search_path = public as $$
  with rel as (
    select status from protocols
    where org_id = p_org_id and ((p_scope='sector' and sector_id=p_id) or (p_scope='sample' and sample_id=p_id))
  ), agg as (
    select count(*) total, count(*) filter (where status='APPROVED') approved,
      count(*) filter (where status in ('DRAFT','IN_PROGRESS','SUBMITTED')) pending,
      count(*) filter (where status='REJECTED') rejected from rel
  )
  select jsonb_build_object('scope',p_scope,'id',p_id,'rule',p_rule,'total',total,'approved',approved,
    'pending',pending,'rejected',rejected,
    'released', case when total=0 then false when p_rule='any_approved' then approved>0 else approved=total end)
  from agg $$;

create or replace function public.eco_ensayo_summary(p_org_id uuid, p_project_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('project_id',p_project_id,'total',count(*),
    'approved',count(*) filter (where status='APPROVED'),
    'submitted',count(*) filter (where status='SUBMITTED'),
    'rejected',count(*) filter (where status='REJECTED'),
    'in_progress',count(*) filter (where status in ('DRAFT','IN_PROGRESS')))
  from protocols where project_id = p_project_id and org_id = p_org_id $$;

-- Baja las versiones SIN org de v52 (firmas viejas), si existieran.
drop function if exists public.eco_protocol_status(text);
drop function if exists public.eco_quality_released(text, text, text);
drop function if exists public.eco_ensayo_summary(text);

-- Solo service_role (el Edge) las ejecuta.
revoke all on function public.eco_org_from_key(text) from public, anon, authenticated;
revoke all on function public.eco_protocol_status(uuid, text) from public, anon, authenticated;
revoke all on function public.eco_quality_released(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.eco_ensayo_summary(uuid, text) from public, anon, authenticated;

-- Semilla de key por empresa (ejemplo; correr aparte con el hash real):
--   insert into public.eco_api_keys(org_id, key_hash, label, created_at)
--   values ('11111111-1111-4111-8111-111111111111',
--           encode(digest('<LA_API_KEY_EN_CLARO>','sha256'),'hex'), 'flow-pm', (extract(epoch from now())*1000)::bigint);
