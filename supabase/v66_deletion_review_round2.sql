-- v66 — Correcciones de la Ronda 2 de revisión adversarial del rediseño de eliminación.
--
-- 1) delete_protocol_to_recycle devuelve {deleted} → el cliente solo libera el correlativo si el
--    borrado REALMENTE ocurrió (evita doble-release del contador en reintentos del SyncWorker).
-- 2) renumber_protocols actualiza también protocol_summary_rows (código + values_json + updated_at)
--    → las Tablas Resumen no quedan con el código viejo (su sync es por cursor updated_at).
-- 3) restore_protocol_from_recycle: FOR UPDATE (anti doble-restore), SIEMPRE updated_at=now (gana el
--    last-write-wins en el pull), reconcilia el summary row, y filtra plan_annotations cuyo plan ya
--    no existe (antes el restore abortaba con error crudo y el ensayo quedaba irrestaurable).
-- 4) restore_sample_from_recycle: FOR UPDATE + updated_at=now.

-- ── 1) delete_protocol_to_recycle → returns jsonb {deleted} ───────────────────
drop function if exists delete_protocol_to_recycle(text, text, text);
create function delete_protocol_to_recycle(
  p_protocol_id     text,
  p_deleted_by_id   text default null,
  p_deleted_by_name text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_protocol      protocols%rowtype;
  v_item_ids      text[];
  v_ann_ids       text[];
  v_comment_ids   text[];
  v_template_name text;
  v_snapshot      jsonb;
  v_now           bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if p_protocol_id is null or length(trim(p_protocol_id)) = 0 then
    raise exception 'delete_protocol_to_recycle: protocol_id vacío';
  end if;
  select * into v_protocol from protocols where id = p_protocol_id;
  if not found then
    return jsonb_build_object('deleted', false);   -- idempotente: ya estaba borrado
  end if;

  select coalesce(array_agg(id), '{}') into v_item_ids    from protocol_items where protocol_id = p_protocol_id;
  select coalesce(array_agg(id), '{}') into v_ann_ids     from plan_annotations where protocol_id = p_protocol_id;
  select coalesce(array_agg(id), '{}') into v_comment_ids from annotation_comments where annotation_id = any(v_ann_ids);
  select name into v_template_name from protocol_templates where id = v_protocol.template_id;

  v_snapshot := jsonb_build_object(
    'protocol', to_jsonb(v_protocol),
    'items',                     coalesce((select jsonb_agg(to_jsonb(t)) from protocol_items t            where t.protocol_id = p_protocol_id), '[]'::jsonb),
    'evidences',                 coalesce((select jsonb_agg(to_jsonb(t)) from evidences t                 where t.protocol_item_id = any(v_item_ids)), '[]'::jsonb),
    'approvals',                 coalesce((select jsonb_agg(to_jsonb(t)) from protocol_approvals t        where t.protocol_id = p_protocol_id), '[]'::jsonb),
    'non_conformities',          coalesce((select jsonb_agg(to_jsonb(t)) from non_conformities t          where t.protocol_id = p_protocol_id), '[]'::jsonb),
    'protocol_equipment',        coalesce((select jsonb_agg(to_jsonb(t)) from protocol_equipment t        where t.protocol_id = p_protocol_id), '[]'::jsonb),
    'plan_annotations',          coalesce((select jsonb_agg(to_jsonb(t)) from plan_annotations t          where t.protocol_id = p_protocol_id), '[]'::jsonb),
    'annotation_comments',       coalesce((select jsonb_agg(to_jsonb(t)) from annotation_comments t       where t.annotation_id = any(v_ann_ids)), '[]'::jsonb),
    'annotation_comment_photos', coalesce((select jsonb_agg(to_jsonb(t)) from annotation_comment_photos t where t.annotation_comment_id = any(v_comment_ids)), '[]'::jsonb),
    'summary_row',               coalesce((select to_jsonb(t) from protocol_summary_rows t                where t.protocol_id = p_protocol_id limit 1), 'null'::jsonb)
  );

  insert into recycle_bin (
    id, project_id, protocol_id, protocol_code, protocol_number, template_id, template_name,
    location_name, sector_name, status, ensayo_date, snapshot_json, deleted_at, deleted_by_id,
    deleted_by_name, created_at, updated_at
  ) values (
    'recycle-' || p_protocol_id || '-' || coalesce(v_protocol.updated_at::text, v_now::text),
    v_protocol.project_id, p_protocol_id, v_protocol.protocol_code, v_protocol.protocol_number,
    v_protocol.template_id, v_template_name,
    (select location_name from protocol_summary_rows where protocol_id = p_protocol_id limit 1),
    (select sector_name   from protocol_summary_rows where protocol_id = p_protocol_id limit 1),
    v_protocol.status, v_protocol.ensayo_date, v_snapshot, v_now, p_deleted_by_id,
    p_deleted_by_name, v_now, v_now
  )
  on conflict (id) do update
    set snapshot_json = excluded.snapshot_json, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at;

  delete from annotation_comment_photos where annotation_comment_id = any(v_comment_ids);
  delete from annotation_comments        where annotation_id = any(v_ann_ids);
  delete from plan_annotations           where protocol_id = p_protocol_id;
  delete from evidences                  where protocol_item_id = any(v_item_ids);
  delete from protocol_equipment         where protocol_id = p_protocol_id;
  delete from non_conformities           where protocol_id = p_protocol_id;
  delete from protocol_approvals         where protocol_id = p_protocol_id;
  delete from protocol_items             where protocol_id = p_protocol_id;
  delete from protocol_summary_rows      where protocol_id = p_protocol_id;
  delete from protocols                  where id = p_protocol_id;

  return jsonb_build_object('deleted', true);
end;
$$;
revoke all on function delete_protocol_to_recycle(text, text, text) from public, anon;
grant execute on function delete_protocol_to_recycle(text, text, text) to authenticated;

-- ── 2) renumber_protocols → también actualiza protocol_summary_rows ───────────
create or replace function renumber_protocols(
  p_project_id text, p_codes jsonb, p_counters jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rec jsonb; v_n int := 0; v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if p_project_id is null or length(trim(p_project_id)) = 0 then raise exception 'renumber_protocols: project vacío'; end if;
  if not can_access_project(p_project_id) then raise exception 'renumber_protocols: sin acceso al proyecto'; end if;

  for v_rec in select * from jsonb_array_elements(coalesce(p_codes, '[]'::jsonb)) loop
    update protocols set protocol_code = '__rnm__' || (v_rec->>'id') where id = v_rec->>'id' and project_id = p_project_id;
  end loop;

  for v_rec in select * from jsonb_array_elements(coalesce(p_codes, '[]'::jsonb)) loop
    update protocols set protocol_code = v_rec->>'code', updated_at = v_now
      where id = v_rec->>'id' and project_id = p_project_id;
    -- Tablas Resumen (cache denormalizado del código): mantener en sync + bump updated_at (cursor).
    update protocol_summary_rows
       set protocol_code = v_rec->>'code',
           values_json = jsonb_set(coalesce(values_json, '{}'::jsonb), '{protocol_code}', to_jsonb(v_rec->>'code')),
           updated_at = v_now
     where protocol_id = v_rec->>'id';
    v_n := v_n + 1;
  end loop;

  for v_rec in select * from jsonb_array_elements(coalesce(p_counters, '[]'::jsonb)) loop
    insert into protocol_code_counters (project_id, group_key, last_seq, updated_at)
    values (p_project_id, v_rec->>'group_key', (v_rec->>'last_seq')::int, v_now)
    on conflict (project_id, group_key) do update set last_seq = excluded.last_seq, updated_at = excluded.updated_at;
  end loop;

  return jsonb_build_object('renumbered', v_n);
end;
$$;
revoke all on function renumber_protocols(text, jsonb, jsonb) from public, anon;
grant execute on function renumber_protocols(text, jsonb, jsonb) to authenticated;

-- ── 3) restore_protocol_from_recycle → FOR UPDATE + updated_at=now + reconciliar
--       summary row + filtrar plan_annotations cuyo plan ya no existe ──────────
create or replace function restore_protocol_from_recycle(
  p_recycle_id text, p_new_code text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_entry recycle_bin%rowtype; v_snap jsonb; v_protocol_id text;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if p_recycle_id is null or length(trim(p_recycle_id)) = 0 then raise exception 'restore_protocol_from_recycle: recycle_id vacío'; end if;
  select * into v_entry from recycle_bin where id = p_recycle_id for update;   -- lock anti doble-restore
  if not found then return jsonb_build_object('restored', false, 'reason', 'not_found'); end if;
  if not can_access_project(v_entry.project_id) then raise exception 'restore_protocol_from_recycle: sin acceso al proyecto'; end if;

  v_snap := v_entry.snapshot_json;
  v_protocol_id := v_snap->'protocol'->>'id';
  if v_protocol_id is null then raise exception 'restore_protocol_from_recycle: snapshot sin protocol.id'; end if;
  if exists (select 1 from protocols where id = v_protocol_id) then
    delete from recycle_bin where id = p_recycle_id;
    return jsonb_build_object('restored', true, 'protocol_id', v_protocol_id, 'already_present', true);
  end if;

  insert into protocols                  select * from jsonb_populate_record(null::protocols, v_snap->'protocol');
  insert into protocol_items             select * from jsonb_populate_recordset(null::protocol_items,             coalesce(v_snap->'items','[]'::jsonb));
  insert into protocol_approvals         select * from jsonb_populate_recordset(null::protocol_approvals,         coalesce(v_snap->'approvals','[]'::jsonb));
  insert into non_conformities           select * from jsonb_populate_recordset(null::non_conformities,           coalesce(v_snap->'non_conformities','[]'::jsonb));
  insert into protocol_equipment         select * from jsonb_populate_recordset(null::protocol_equipment,         coalesce(v_snap->'protocol_equipment','[]'::jsonb));
  insert into evidences                  select * from jsonb_populate_recordset(null::evidences,                  coalesce(v_snap->'evidences','[]'::jsonb));
  -- plan_annotations: SOLO las cuyo plan padre aún existe (el plan pudo borrarse → evita FK error
  -- que abortaba todo el restore). Las medidas del ensayo se restauran; se descarta la marca huérfana.
  insert into plan_annotations
    select * from jsonb_populate_recordset(null::plan_annotations, coalesce(v_snap->'plan_annotations','[]'::jsonb)) pa
    where pa.plan_id is null or exists (select 1 from plans where id = pa.plan_id);
  insert into annotation_comments
    select * from jsonb_populate_recordset(null::annotation_comments, coalesce(v_snap->'annotation_comments','[]'::jsonb)) ac
    where exists (select 1 from plan_annotations where id = ac.annotation_id);
  insert into annotation_comment_photos
    select * from jsonb_populate_recordset(null::annotation_comment_photos, coalesce(v_snap->'annotation_comment_photos','[]'::jsonb)) acp
    where exists (select 1 from annotation_comments where id = acp.annotation_comment_id);
  if v_snap->'summary_row' is not null and v_snap->'summary_row' <> 'null'::jsonb then
    insert into protocol_summary_rows    select * from jsonb_populate_record(null::protocol_summary_rows, v_snap->'summary_row');
  end if;

  -- SIEMPRE updated_at=now (restaurar es una escritura → gana el last-write-wins del pull) + código nuevo si se pidió.
  update protocols
     set updated_at = v_now,
         protocol_code = coalesce(nullif(trim(p_new_code), ''), protocol_code)
   where id = v_protocol_id;
  -- Reconciliar el summary row con el código final + bump updated_at (cursor de Tablas Resumen).
  update protocol_summary_rows
     set protocol_code = (select protocol_code from protocols where id = v_protocol_id),
         values_json = jsonb_set(coalesce(values_json, '{}'::jsonb), '{protocol_code}', to_jsonb((select protocol_code from protocols where id = v_protocol_id))),
         updated_at = v_now
   where protocol_id = v_protocol_id;

  delete from recycle_bin where id = p_recycle_id;
  return jsonb_build_object('restored', true, 'protocol_id', v_protocol_id,
    'protocol_code', (select protocol_code from protocols where id = v_protocol_id));
end;
$$;
revoke all on function restore_protocol_from_recycle(text, text) from public, anon;
grant execute on function restore_protocol_from_recycle(text, text) to authenticated;

-- ── 4) restore_sample_from_recycle → FOR UPDATE + updated_at=now ──────────────
create or replace function restore_sample_from_recycle(
  p_recycle_id text, p_new_code text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_entry recycle_bin%rowtype; v_snap jsonb; v_sample_id text;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if p_recycle_id is null or length(trim(p_recycle_id)) = 0 then raise exception 'restore_sample_from_recycle: recycle_id vacío'; end if;
  select * into v_entry from recycle_bin where id = p_recycle_id for update;
  if not found then return jsonb_build_object('restored', false, 'reason', 'not_found'); end if;
  if not can_access_project(v_entry.project_id) then raise exception 'restore_sample_from_recycle: sin acceso al proyecto'; end if;
  v_snap := v_entry.snapshot_json;
  v_sample_id := v_snap->'sample'->>'id';
  if v_sample_id is null then raise exception 'restore_sample_from_recycle: snapshot sin sample.id'; end if;
  if exists (select 1 from samples where id = v_sample_id) then
    delete from recycle_bin where id = p_recycle_id;
    return jsonb_build_object('restored', true, 'sample_id', v_sample_id, 'already_present', true);
  end if;

  insert into samples select * from jsonb_populate_record(null::samples, v_snap->'sample');
  update samples
     set updated_at = v_now,
         sample_code = coalesce(nullif(trim(p_new_code), ''), sample_code)
   where id = v_sample_id;
  delete from recycle_bin where id = p_recycle_id;
  return jsonb_build_object('restored', true, 'sample_id', v_sample_id,
    'sample_code', (select sample_code from samples where id = v_sample_id));
end;
$$;
revoke all on function restore_sample_from_recycle(text, text) from public, anon;
grant execute on function restore_sample_from_recycle(text, text) to authenticated;
