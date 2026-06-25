-- v63 — Renumerar (modo B "Restablecer numeración"): reasigna los protocol_code de un proyecto
-- en UNA transacción atómica. El cliente calcula los códigos finales (por máscara/ámbito, ordenando
-- por fecha de ensayo); este RPC los aplica.
--
-- POR QUÉ 2 FASES: el índice único parcial `protocols_code_uniq_per_project` NO es deferrable, así
-- que pasar 3→2 mientras 2 existe colisionaría. Fase 1: TODOS a un código temporal único (`__rnm__<id>`,
-- imposible que choque con un código real). Fase 2: a su código final. Todo en una transacción → o
-- entra todo o nada (seguro ante cortes). Las referencias entre ensayos son por ID → no se rompen.
--
-- Idempotente / seguro: acotado por project_id + can_access_project (org-scoped). CREATE OR REPLACE.

create or replace function renumber_protocols(
  p_project_id text,
  p_codes      jsonb,                          -- [{ "id": "...", "code": "..." }]
  p_counters   jsonb default '[]'::jsonb       -- [{ "group_key": "...", "last_seq": n }]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec jsonb;
  v_n   int := 0;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if p_project_id is null or length(trim(p_project_id)) = 0 then
    raise exception 'renumber_protocols: project vacío';
  end if;
  if not can_access_project(p_project_id) then
    raise exception 'renumber_protocols: sin acceso al proyecto';
  end if;

  -- Fase 1 — códigos temporales únicos (evitan la colisión del índice único no-deferrable).
  for v_rec in select * from jsonb_array_elements(coalesce(p_codes, '[]'::jsonb)) loop
    update protocols
       set protocol_code = '__rnm__' || (v_rec->>'id')
     where id = v_rec->>'id' and project_id = p_project_id;
  end loop;

  -- Fase 2 — códigos finales.
  for v_rec in select * from jsonb_array_elements(coalesce(p_codes, '[]'::jsonb)) loop
    update protocols
       set protocol_code = v_rec->>'code', updated_at = v_now
     where id = v_rec->>'id' and project_id = p_project_id;
    v_n := v_n + 1;
  end loop;

  -- Contadores — la próxima creación sigue desde el nuevo máximo de cada grupo (sin huecos).
  for v_rec in select * from jsonb_array_elements(coalesce(p_counters, '[]'::jsonb)) loop
    insert into protocol_code_counters (project_id, group_key, last_seq, updated_at)
    values (p_project_id, v_rec->>'group_key', (v_rec->>'last_seq')::int, v_now)
    on conflict (project_id, group_key) do update
      set last_seq = excluded.last_seq, updated_at = excluded.updated_at;
  end loop;

  return jsonb_build_object('renumbered', v_n);
end;
$$;

revoke all on function renumber_protocols(text, jsonb, jsonb) from public, anon;
grant execute on function renumber_protocols(text, jsonb, jsonb) to authenticated;
