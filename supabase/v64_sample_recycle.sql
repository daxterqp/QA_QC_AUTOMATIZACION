-- v64 — Papelera de MUESTRAS: soft-delete recuperable (reusa recycle_bin con entity_type='sample').
--
-- Decisión del usuario: BLOQUEAR el borrado de una muestra que tiene ensayos vinculados (sample_id)
-- → nunca quedan ensayos huérfanos. Las muestras son standalone (sin tablas hijas) → snapshot de 1 fila.
-- El purge reusa purge_recycle_entry (genérico). Todo SECURITY DEFINER + can_access_project (org-scoped).

-- Distinguir muestras de ensayos dentro de recycle_bin.
alter table recycle_bin add column if not exists entity_type text not null default 'protocol';

-- ── BORRAR muestra → papelera (bloquea si tiene ensayos) ─────────────────────
create or replace function delete_sample_to_recycle(
  p_sample_id       text,
  p_deleted_by_id   text default null,
  p_deleted_by_name text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sample samples%rowtype;
  v_count  int;
  v_now    bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if p_sample_id is null or length(trim(p_sample_id)) = 0 then
    raise exception 'delete_sample_to_recycle: id vacío';
  end if;
  select * into v_sample from samples where id = p_sample_id;
  if not found then
    return jsonb_build_object('deleted', false, 'reason', 'not_found');
  end if;
  if not can_access_project(v_sample.project_id) then
    raise exception 'delete_sample_to_recycle: sin acceso al proyecto';
  end if;
  -- GUARDA: bloquear si hay ensayos vinculados.
  select count(*) into v_count from protocols where sample_id = p_sample_id;
  if v_count > 0 then
    raise exception 'sample_has_protocols:%', v_count;
  end if;

  insert into recycle_bin (
    id, org_id, project_id, protocol_id, protocol_code, protocol_number, template_id, template_name,
    location_name, sector_name, status, ensayo_date, snapshot_json, deleted_at, deleted_by_id,
    deleted_by_name, created_at, updated_at, entity_type
  ) values (
    'recycle-sample-' || p_sample_id || '-' || coalesce(v_sample.updated_at::text, v_now::text),
    v_sample.org_id, v_sample.project_id, p_sample_id, v_sample.sample_code, null, null, 'Muestra',
    null, null, null, null,
    jsonb_build_object('sample', to_jsonb(v_sample)), v_now, p_deleted_by_id,
    p_deleted_by_name, v_now, v_now, 'sample'
  )
  on conflict (id) do update
    set snapshot_json = excluded.snapshot_json, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at;

  delete from samples where id = p_sample_id;
  return jsonb_build_object('deleted', true, 'sample_id', p_sample_id);
end;
$$;

-- ── RESTAURAR muestra desde la papelera ──────────────────────────────────────
create or replace function restore_sample_from_recycle(
  p_recycle_id text,
  p_new_code   text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_entry     recycle_bin%rowtype;
  v_snap      jsonb;
  v_sample_id text;
  v_now       bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if p_recycle_id is null or length(trim(p_recycle_id)) = 0 then
    raise exception 'restore_sample_from_recycle: recycle_id vacío';
  end if;
  select * into v_entry from recycle_bin where id = p_recycle_id;
  if not found then
    return jsonb_build_object('restored', false, 'reason', 'not_found');
  end if;
  if not can_access_project(v_entry.project_id) then
    raise exception 'restore_sample_from_recycle: sin acceso al proyecto';
  end if;
  v_snap := v_entry.snapshot_json;
  v_sample_id := v_snap->'sample'->>'id';
  if v_sample_id is null then
    raise exception 'restore_sample_from_recycle: snapshot sin sample.id';
  end if;
  if exists (select 1 from samples where id = v_sample_id) then
    delete from recycle_bin where id = p_recycle_id;
    return jsonb_build_object('restored', true, 'sample_id', v_sample_id, 'already_present', true);
  end if;

  insert into samples select * from jsonb_populate_record(null::samples, v_snap->'sample');
  if p_new_code is not null and length(trim(p_new_code)) > 0 then
    update samples set sample_code = p_new_code, updated_at = v_now where id = v_sample_id;
  end if;
  delete from recycle_bin where id = p_recycle_id;

  return jsonb_build_object('restored', true, 'sample_id', v_sample_id,
    'sample_code', (select sample_code from samples where id = v_sample_id));
end;
$$;

revoke all on function delete_sample_to_recycle(text, text, text) from public, anon;
revoke all on function restore_sample_from_recycle(text, text)     from public, anon;
grant execute on function delete_sample_to_recycle(text, text, text) to authenticated;
grant execute on function restore_sample_from_recycle(text, text)     to authenticated;
