-- v65 — Renumerar MUESTRAS (modo B). Análogo a v63 pero para samples: las muestras usan un
-- correlativo GLOBAL por proyecto (sin group_key/contador). Reasigna sample_code + seq desde 1.
-- 2 fases (temporal → final) por el índice único samples_code_uniq_per_project (no deferrable).
-- security definer + can_access_project. CREATE OR REPLACE.

create or replace function renumber_samples(
  p_project_id text,
  p_codes      jsonb   -- [{ "id": "...", "code": "...", "seq": n }]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rec jsonb;
  v_n   int := 0;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if p_project_id is null or length(trim(p_project_id)) = 0 then
    raise exception 'renumber_samples: project vacío';
  end if;
  if not can_access_project(p_project_id) then
    raise exception 'renumber_samples: sin acceso al proyecto';
  end if;

  -- Fase 1 — códigos temporales únicos.
  for v_rec in select * from jsonb_array_elements(coalesce(p_codes, '[]'::jsonb)) loop
    update samples set sample_code = '__rnm__' || (v_rec->>'id')
     where id = v_rec->>'id' and project_id = p_project_id;
  end loop;

  -- Fase 2 — código + seq finales.
  for v_rec in select * from jsonb_array_elements(coalesce(p_codes, '[]'::jsonb)) loop
    update samples
       set sample_code = v_rec->>'code', seq = (v_rec->>'seq')::int, updated_at = v_now
     where id = v_rec->>'id' and project_id = p_project_id;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('renumbered', v_n);
end;
$$;

revoke all on function renumber_samples(text, jsonb) from public, anon;
grant execute on function renumber_samples(text, jsonb) to authenticated;
