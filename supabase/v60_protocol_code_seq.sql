-- ============================================================================
-- v60 — Codificación correlativa AUTORITATIVA por nube (híbrido online/offline)
-- ============================================================================
-- Problema: hoy cada dispositivo calcula el correlativo localmente (nextSeq) y el
-- índice único `protocols_code_uniq_per_project` + re-secuencia en push evitan que
-- se pisen datos. Pero dos equipos pueden generar el mismo número y "saltar" al
-- sincronizar. Solución (opción híbrida elegida por el usuario):
--   - ONLINE: el cliente pide a la nube el correlativo definitivo (atómico) → cero colisión.
--   - OFFLINE: cae al cálculo local de siempre (el índice único sigue de backstop).
--
-- Diseño: la nube NO recalcula la máscara/regex (eso queda en el cliente, espejo web/móvil).
-- Solo arbitra un CONTADOR por grupo. El cliente arma el `group_key` (ej. "PR|2026") y el
-- candidato local; el RPC devuelve el INICIO de un bloque reservado de `p_count`, usando
-- greatest(...) para respetar lo que ya exista (incluido lo creado offline y empujado).
-- ============================================================================

create table if not exists public.protocol_code_counters (
  project_id text not null,
  group_key  text not null,
  last_seq   integer not null default 0,
  updated_at bigint,
  primary key (project_id, group_key)
);
-- Tabla interna: solo la toca el RPC (security definer). Sin políticas = sin acceso directo.
alter table public.protocol_code_counters enable row level security;

-- Reserva atómica de un bloque de correlativos. Devuelve el PRIMER seq del bloque.
--   p_client_seq = candidato local (max del ámbito + 1).  p_count = tamaño del lote.
create or replace function public.next_protocol_seq(
  p_project_id text, p_group_key text, p_client_seq integer, p_count integer default 1
) returns integer language plpgsql security definer set search_path = public as $$
declare v_cnt integer := greatest(coalesce(p_count, 1), 1);
        v_base integer;   -- último seq reservado
begin
  -- Frontera multi-tenant: solo quien accede al proyecto puede pedir correlativos.
  if not public.can_access_project(p_project_id) then
    raise exception 'forbidden: sin acceso al proyecto';
  end if;
  insert into public.protocol_code_counters(project_id, group_key, last_seq, updated_at)
  values (p_project_id, p_group_key, greatest(p_client_seq, 1) - 1 + v_cnt,
          (extract(epoch from now())*1000)::bigint)
  on conflict (project_id, group_key) do update
    set last_seq = greatest(public.protocol_code_counters.last_seq, greatest(p_client_seq, 1) - 1) + v_cnt,
        updated_at = (extract(epoch from now())*1000)::bigint
  returning last_seq into v_base;
  return v_base - v_cnt + 1;   -- inicio del bloque [start .. start+v_cnt-1]
end $$;

revoke all on function public.next_protocol_seq(text, text, integer, integer) from public, anon;
grant execute on function public.next_protocol_seq(text, text, integer, integer) to authenticated;
