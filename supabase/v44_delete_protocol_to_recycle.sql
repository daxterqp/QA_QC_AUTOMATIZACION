-- v44 — Borrado transaccional ATÓMICO de un ensayo → Papelera.
--
-- POR QUÉ: el borrado "copiar + hard delete de ~10 tablas" hecho como llamadas
-- sueltas NO es atómico: si el proceso muere a mitad, queda un ensayo medio
-- borrado. Esta función lo hace TODO dentro de UNA transacción (una función
-- plpgsql corre en su propia transacción): o entra todo (copia + borrados) o no
-- entra nada (rollback). Así es IMPOSIBLE dejar tablas a medias o "rotas".
--
-- SEGURIDAD: cada DELETE va acotado por el id de ESTE ensayo (o ids derivados:
-- sus items / anotaciones / comentarios). No hay ningún DELETE sin WHERE ni con
-- comodín → jamás puede borrar otra fila que no sea de este ensayo. Si el id
-- viene vacío, lanza excepción (no borra nada). Si el ensayo ya no existe, sale
-- sin hacer nada (idempotente: seguro ante reintentos).
--
-- La copia a `recycle_bin` se hace ANTES de borrar, dentro de la MISMA
-- transacción → el respaldo siempre queda consistente con lo borrado.
--
-- Córrelo en el SQL Editor de Supabase (idempotente: CREATE OR REPLACE).

create or replace function delete_protocol_to_recycle(
  p_protocol_id     text,
  p_deleted_by_id   text default null,
  p_deleted_by_name text default null
) returns void
language plpgsql
security definer
set search_path = public
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
  -- Guardia: id vacío → aborta sin tocar nada.
  if p_protocol_id is null or length(trim(p_protocol_id)) = 0 then
    raise exception 'delete_protocol_to_recycle: protocol_id vacío';
  end if;

  -- Si el ensayo ya no existe, no hay nada que hacer (idempotente).
  select * into v_protocol from protocols where id = p_protocol_id;
  if not found then
    return;
  end if;

  -- Ids derivados (acotan los borrados de hijos).
  select coalesce(array_agg(id), '{}') into v_item_ids
    from protocol_items where protocol_id = p_protocol_id;
  select coalesce(array_agg(id), '{}') into v_ann_ids
    from plan_annotations where protocol_id = p_protocol_id;
  select coalesce(array_agg(id), '{}') into v_comment_ids
    from annotation_comments where annotation_id = any(v_ann_ids);

  select name into v_template_name
    from protocol_templates where id = v_protocol.template_id;

  -- Snapshot completo y autocontenido.
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

  -- Copia a la papelera (idempotente por id).
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
    set snapshot_json = excluded.snapshot_json,
        deleted_at    = excluded.deleted_at,
        updated_at    = excluded.updated_at;

  -- Hard delete en orden FK-seguro (todo dentro de esta misma transacción).
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
end;
$$;

grant execute on function delete_protocol_to_recycle(text, text, text) to anon, authenticated;
