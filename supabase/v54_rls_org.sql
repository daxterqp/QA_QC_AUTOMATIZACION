-- ============================================================================
-- v54 — RLS multi-tenant: política RESTRICTIVA de organización por tabla
-- ============================================================================
-- Estrategia clave (segura y de bajo riesgo): NO tocamos las políticas existentes
-- (las de acceso por proyecto/rol de v48/v49). Agregamos una política
-- **RESTRICTIVA** por tabla que se **AND-ea** con las permisivas existentes:
--     acceso efectivo = (políticas actuales) AND (org_id = auth_org())
-- Una política restrictiva SOLO puede ACOTAR, nunca abrir → imposible empeorar el
-- acceso. Resultado: nadie ve/escribe filas de otra empresa, ni un CREATOR.
-- Aplicar DESPUÉS de v53 (que crea org_id + auth_org()).
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'projects','user_project_access','push_tokens','activities',
    'annotation_comment_photos','annotation_comments','dashboard_notes','equipment',
    'equipment_activities','evidences','lab_aux_tables','locations','non_conformities',
    'phone_contacts','plan_annotations','plan_measurements','plans','project_sectors',
    'protocol_approvals','protocol_equipment','protocol_items','protocol_summary_rows',
    'protocol_template_items','protocol_templates','protocols','recycle_bin','samples',
    'session_form_template_items','session_form_templates','work_session_form_items',
    'work_session_gps_points','work_session_intervals','work_sessions','work_shifts',
    'users'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists org_guard on public.%I', t);
    execute format($p$create policy org_guard as restrictive on public.%I for all
      using (org_id = public.auth_org())
      with check (org_id = public.auth_org())$p$, t);
  end loop;
end $$;

-- IMPORTANTE sobre `users`: `auth_org()` es SECURITY DEFINER y bypassa RLS, así que
-- resuelve la org del usuario aunque `users` tenga la política restrictiva (sin
-- chicken-and-egg). La política solo limita a ver usuarios de la propia empresa.
-- INSERT/DELETE de users va por la Edge Function `admin-users` (service_role, ignora RLS),
-- que DEBE setear `org_id` explícitamente (ver cambios de código).
