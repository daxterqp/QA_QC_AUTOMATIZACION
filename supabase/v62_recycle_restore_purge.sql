-- v62 — Papelera: RESTAURAR + ELIMINAR DEFINITIVO (purge) + liberar correlativo.
--
-- Contexto: el borrado de un ensayo YA es "soft" (v44 mueve a recycle_bin + borra de
-- protocols). Esto agrega la vuelta:
--   • restore_protocol_from_recycle: reinserta el snapshot completo (inverso EXACTO de v44,
--     en orden FK-seguro) y borra la entrada de la papelera. Acepta un código NUEVO opcional
--     (el cliente calcula el "próximo libre" con la misma lógica de creación → nunca colisiona).
--   • purge_recycle_entry: elimina DEFINITIVAMENTE la entrada de la papelera (solo CREATOR).
--     El S3 lo libera el cliente DESPUÉS (lee el snapshot para las keys). Irreversible.
--   • release_protocol_seq: al borrar el ensayo TOPE de su grupo de correlativo, baja el
--     contador 1 para que el próximo creado REUSE el código (sin huecos). No-op si no era el tope.
--
-- Todo SECURITY DEFINER con guardia can_access_project (org-scoped desde v53). Idempotente.
-- Córrelo en el SQL Editor de Supabase (CREATE OR REPLACE).

-- ─────────────────────────────────────────────────────────────────────────────
-- RESTAURAR: reinserta el snapshot y borra la entrada de papelera.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function restore_protocol_from_recycle(
  p_recycle_id text,
  p_new_code   text default null   -- código a asignar (próximo libre, calculado por el cliente)
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry       recycle_bin%rowtype;
  v_snap        jsonb;
  v_protocol_id text;
  v_now         bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if p_recycle_id is null or length(trim(p_recycle_id)) = 0 then
    raise exception 'restore_protocol_from_recycle: recycle_id vacío';
  end if;

  select * into v_entry from recycle_bin where id = p_recycle_id;
  if not found then
    return jsonb_build_object('restored', false, 'reason', 'not_found');
  end if;

  -- Guardia de acceso (org-scoped): solo miembros del proyecto.
  if not can_access_project(v_entry.project_id) then
    raise exception 'restore_protocol_from_recycle: sin acceso al proyecto';
  end if;

  v_snap        := v_entry.snapshot_json;
  v_protocol_id := v_snap->'protocol'->>'id';
  if v_protocol_id is null then
    raise exception 'restore_protocol_from_recycle: snapshot sin protocol.id';
  end if;

  -- Idempotente: si ya existe (doble restore), solo limpia la papelera.
  if exists (select 1 from protocols where id = v_protocol_id) then
    delete from recycle_bin where id = p_recycle_id;
    return jsonb_build_object('restored', true, 'protocol_id', v_protocol_id, 'already_present', true);
  end if;

  -- Reinserción en orden FK-seguro (padres → hijos), inverso de los DELETE de v44.
  insert into protocols                  select * from jsonb_populate_record(null::protocols, v_snap->'protocol');
  insert into protocol_items             select * from jsonb_populate_recordset(null::protocol_items,             coalesce(v_snap->'items','[]'::jsonb));
  insert into protocol_approvals         select * from jsonb_populate_recordset(null::protocol_approvals,         coalesce(v_snap->'approvals','[]'::jsonb));
  insert into non_conformities           select * from jsonb_populate_recordset(null::non_conformities,           coalesce(v_snap->'non_conformities','[]'::jsonb));
  insert into protocol_equipment         select * from jsonb_populate_recordset(null::protocol_equipment,         coalesce(v_snap->'protocol_equipment','[]'::jsonb));
  insert into evidences                  select * from jsonb_populate_recordset(null::evidences,                  coalesce(v_snap->'evidences','[]'::jsonb));
  insert into plan_annotations           select * from jsonb_populate_recordset(null::plan_annotations,           coalesce(v_snap->'plan_annotations','[]'::jsonb));
  insert into annotation_comments        select * from jsonb_populate_recordset(null::annotation_comments,        coalesce(v_snap->'annotation_comments','[]'::jsonb));
  insert into annotation_comment_photos  select * from jsonb_populate_recordset(null::annotation_comment_photos,  coalesce(v_snap->'annotation_comment_photos','[]'::jsonb));
  if v_snap->'summary_row' is not null and v_snap->'summary_row' <> 'null'::jsonb then
    insert into protocol_summary_rows    select * from jsonb_populate_record(null::protocol_summary_rows, v_snap->'summary_row');
  end if;

  -- Código nuevo (próximo libre) si el cliente lo provee → evita colisión si el código
  -- original ya fue reusado. Si no, conserva el original del snapshot.
  if p_new_code is not null and length(trim(p_new_code)) > 0 then
    update protocols set protocol_code = p_new_code, updated_at = v_now where id = v_protocol_id;
  end if;

  delete from recycle_bin where id = p_recycle_id;

  return jsonb_build_object(
    'restored', true,
    'protocol_id', v_protocol_id,
    'protocol_code', (select protocol_code from protocols where id = v_protocol_id)
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ELIMINAR DEFINITIVO: borra la entrada de papelera (solo CREATOR). Irreversible.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function purge_recycle_entry(p_recycle_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry recycle_bin%rowtype;
begin
  if p_recycle_id is null or length(trim(p_recycle_id)) = 0 then
    raise exception 'purge_recycle_entry: recycle_id vacío';
  end if;
  select * into v_entry from recycle_bin where id = p_recycle_id;
  if not found then
    return jsonb_build_object('purged', false, 'reason', 'not_found');
  end if;
  if not can_access_project(v_entry.project_id) then
    raise exception 'purge_recycle_entry: sin acceso al proyecto';
  end if;
  -- Eliminar definitivo es solo del CREATOR (decisión del usuario).
  if not is_creator() then
    raise exception 'purge_recycle_entry: solo el CREATOR puede eliminar definitivamente';
  end if;
  delete from recycle_bin where id = p_recycle_id;
  return jsonb_build_object('purged', true, 'protocol_id', v_entry.protocol_id);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- LIBERAR CORRELATIVO: baja el contador 1 SOLO si el seq borrado era el tope del grupo
-- (así el próximo creado reusa el código y no quedan huecos al borrar el último creado).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function release_protocol_seq(
  p_project_id text,
  p_group_key  text,
  p_seq        integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_project_id is null or p_group_key is null or p_seq is null then
    return;
  end if;
  if not can_access_project(p_project_id) then
    raise exception 'release_protocol_seq: sin acceso al proyecto';
  end if;
  -- Solo libera si el contador está EXACTAMENTE en el seq borrado (era el tope).
  update protocol_code_counters
     set last_seq = p_seq - 1,
         updated_at = (extract(epoch from now()) * 1000)::bigint
   where project_id = p_project_id
     and group_key  = p_group_key
     and last_seq   = p_seq;
end;
$$;

-- Seguridad: nunca a anon. Guardia interna can_access_project (org-scoped).
revoke all on function restore_protocol_from_recycle(text, text) from public, anon;
revoke all on function purge_recycle_entry(text)                 from public, anon;
revoke all on function release_protocol_seq(text, text, integer) from public, anon;
grant execute on function restore_protocol_from_recycle(text, text) to authenticated;
grant execute on function purge_recycle_entry(text)                 to authenticated;
grant execute on function release_protocol_seq(text, text, integer) to authenticated;
