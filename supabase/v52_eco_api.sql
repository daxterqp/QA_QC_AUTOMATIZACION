-- v52 — Ecosistema Flow: funciones de SOLO LECTURA para exponer hechos de Calidad
-- a otras apps (Flow_PM) de forma segura (consumidas por la Edge Function `eco`,
-- que autentica máquina-a-máquina con API key y lee con service_role).
--
-- NO se otorga EXECUTE a anon/authenticated: solo el service_role (Edge Function)
-- las invoca. Son STABLE + SECURITY DEFINER y devuelven JSON acotado (status,
-- booleanos, conteos) — nunca PII cruda ni datos masivos.
--
-- Cuando llegue el multi-tenant (org_id), agregar `p_org_id` y `and org_id = p_org_id`
-- + validar pertenencia del recurso a la org (ver docs/FLOW_PM_BLUEPRINT.md §1.2/§3).

-- ── Estado de un protocolo ──────────────────────────────────────────────────
create or replace function public.eco_protocol_status(p_protocol_id text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', id,
    'project_id', project_id,
    'status', status,
    'sector_id', sector_id,
    'sample_id', sample_id,
    'protocol_code', protocol_code,
    'updated_at', updated_at
  )
  from protocols
  where id = p_protocol_id
$$;

-- ── ¿Calidad liberada? scope: 'sector' | 'sample' ──────────────────────────
-- rule: 'all_approved' (default, decisión del usuario) | 'any_approved'.
-- La API SIEMPRE expone esto; Flow_PM decide si lo EXIGE con su propio flag.
create or replace function public.eco_quality_released(
  p_scope text,
  p_id text,
  p_rule text default 'all_approved'
)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with rel as (
    select status from protocols
    where (p_scope = 'sector' and sector_id = p_id)
       or (p_scope = 'sample' and sample_id = p_id)
  ),
  agg as (
    select
      count(*)                                                                as total,
      count(*) filter (where status = 'APPROVED')                             as approved,
      count(*) filter (where status in ('DRAFT', 'IN_PROGRESS', 'SUBMITTED')) as pending,
      count(*) filter (where status = 'REJECTED')                             as rejected
    from rel
  )
  select jsonb_build_object(
    'scope', p_scope,
    'id', p_id,
    'rule', p_rule,
    'total', total,
    'approved', approved,
    'pending', pending,
    'rejected', rejected,
    'released', case
        when total = 0 then false
        when p_rule = 'any_approved' then approved > 0
        else approved = total   -- 'all_approved' (default): TODOS los protocolos APROBADOS
      end
  )
  from agg
$$;

-- ── Resumen de ensayos por proyecto ────────────────────────────────────────
create or replace function public.eco_ensayo_summary(p_project_id text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'project_id', p_project_id,
    'total', count(*),
    'approved', count(*) filter (where status = 'APPROVED'),
    'submitted', count(*) filter (where status = 'SUBMITTED'),
    'rejected', count(*) filter (where status = 'REJECTED'),
    'in_progress', count(*) filter (where status in ('DRAFT', 'IN_PROGRESS'))
  )
  from protocols
  where project_id = p_project_id
$$;

-- Solo el service_role (Edge Function) puede ejecutarlas.
revoke all on function public.eco_protocol_status(text) from public, anon, authenticated;
revoke all on function public.eco_quality_released(text, text, text) from public, anon, authenticated;
revoke all on function public.eco_ensayo_summary(text) from public, anon, authenticated;
