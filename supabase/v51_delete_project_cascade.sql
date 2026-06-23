-- v51 — delete_project_cascade: borrado ATÓMICO "de raíz" de un proyecto.
--
-- Espejo de la filosofía de v44/v50 (delete_protocol_to_recycle): una sola
-- transacción (todo-o-nada), SECURITY DEFINER, guardia de id vacío, idempotente,
-- guardia BOLA (can_access_project), acotado por id. Borra TODAS las filas que
-- cuelgan del proyecto en orden FK-seguro (hijas → padres) y al final `projects`.
--
-- IMPORTANTE: NO se confía solo en `ON DELETE CASCADE` porque:
--   • lab_aux_tables, protocol_summary_rows, recycle_bin, samples tienen
--     project_id pero SIN FK a projects → quedarían HUÉRFANAS con un DELETE simple.
--   • dashboard_notes tiene FK NO ACTION → un DELETE de projects FALLARÍA.
-- Por eso se borran TODAS explícitamente.
--
-- El RESPALDO del proyecto NO vive en la base (a diferencia de la papelera de
-- ensayos): el cliente arma y VERIFICA un .zip local (base + archivos S3) ANTES
-- de llamar esta función. El .zip es el "deshacer" del borrado de proyecto.

create or replace function public.delete_project_cascade(p_project_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_ids   text[];
  v_protocol_ids   text[];
  v_plan_ids       text[];
  v_annotation_ids text[];
  v_comment_ids    text[];
  v_equipment_ids  text[];
  v_activity_ids   text[];
  v_session_ids    text[];
  v_sform_ids      text[];
  v_exists         boolean;
begin
  -- 1) Guardia de id vacío (no borrar nada con id nulo/blank).
  if p_project_id is null or length(trim(p_project_id)) = 0 then
    raise exception 'delete_project_cascade: project_id vacío';
  end if;

  -- 2) Guardia BOLA: el llamador debe poder acceder al proyecto
  --    (creator, dueño o miembro). SECURITY DEFINER evalúa con el auth.uid() del caller.
  if not can_access_project(p_project_id) then
    raise exception 'delete_project_cascade: sin acceso al proyecto %', p_project_id;
  end if;

  -- 3) Idempotente: si el proyecto ya no existe, no-op.
  select exists(select 1 from projects where id = p_project_id) into v_exists;
  if not v_exists then
    return jsonb_build_object('deleted', false, 'reason', 'not_found');
  end if;

  -- 4) Recolecta ids derivados (para acotar las tablas hijas sin project_id).
  v_template_ids   := array(select id from protocol_templates  where project_id = p_project_id);
  v_protocol_ids   := array(select id from protocols           where project_id = p_project_id);
  v_plan_ids       := array(select id from plans               where project_id = p_project_id);
  v_annotation_ids := array(select id from plan_annotations
                            where plan_id = any(v_plan_ids) or protocol_id = any(v_protocol_ids));
  v_comment_ids    := array(select id from annotation_comments where annotation_id = any(v_annotation_ids));
  v_equipment_ids  := array(select id from equipment           where project_id = p_project_id);
  v_activity_ids   := array(select id from activities          where project_id = p_project_id);
  v_session_ids    := array(select id from work_sessions       where project_id = p_project_id);
  v_sform_ids      := array(select id from session_form_templates where project_id = p_project_id);

  -- 5) Borrado en orden FK-seguro (respeta los FK NO ACTION reales del esquema).
  delete from annotation_comment_photos where annotation_comment_id = any(v_comment_ids);
  delete from annotation_comments        where annotation_id        = any(v_annotation_ids);
  delete from plan_annotations           where plan_id = any(v_plan_ids) or protocol_id = any(v_protocol_ids);
  delete from plan_measurements          where plan_id = any(v_plan_ids);
  delete from evidences                  where protocol_item_id in (select id from protocol_items where protocol_id = any(v_protocol_ids));
  delete from protocol_items             where protocol_id = any(v_protocol_ids);
  delete from protocol_approvals         where protocol_id = any(v_protocol_ids);
  delete from protocol_equipment         where protocol_id = any(v_protocol_ids) or equipment_id = any(v_equipment_ids);
  delete from non_conformities           where project_id = p_project_id;
  delete from protocol_summary_rows      where project_id = p_project_id;
  delete from protocols                  where project_id = p_project_id;        -- antes que protocol_templates y locations (NO ACTION)
  delete from protocol_template_items    where template_id = any(v_template_ids);
  delete from protocol_templates         where project_id = p_project_id;
  delete from plans                      where project_id = p_project_id;        -- antes que locations (NO ACTION)
  delete from work_session_form_items    where session_id = any(v_session_ids);
  delete from work_session_gps_points    where session_id = any(v_session_ids);
  delete from work_session_intervals     where session_id = any(v_session_ids);
  delete from work_sessions              where project_id = p_project_id;        -- antes que activities/equipment (NO ACTION)
  delete from equipment_activities       where equipment_id = any(v_equipment_ids) or activity_id = any(v_activity_ids);
  delete from equipment                  where project_id = p_project_id;
  delete from session_form_template_items where template_id = any(v_sform_ids);
  delete from session_form_templates     where project_id = p_project_id;
  delete from activities                 where project_id = p_project_id;
  delete from project_sectors            where project_id = p_project_id;
  delete from work_shifts                where project_id = p_project_id;
  delete from locations                  where project_id = p_project_id;
  delete from samples                    where project_id = p_project_id;
  delete from lab_aux_tables             where project_id = p_project_id;
  delete from phone_contacts             where project_id = p_project_id;
  delete from dashboard_notes            where project_id = p_project_id;
  delete from recycle_bin                where project_id = p_project_id;
  delete from user_project_access        where project_id = p_project_id;
  delete from projects                   where id = p_project_id;

  return jsonb_build_object('deleted', true);
end;
$$;

-- Solo authenticated (la ruta web ya valida rol CREATOR; la función valida acceso).
revoke all on function public.delete_project_cascade(text) from public;
revoke all on function public.delete_project_cascade(text) from anon;
grant execute on function public.delete_project_cascade(text) to authenticated;
