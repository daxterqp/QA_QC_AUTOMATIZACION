-- v60-v63 — Arreglo: "Error al sincronizar proyecto / new row violates row-level
-- security policy for table projects" al CREAR un proyecto desde el móvil.
--
-- ── Diagnóstico ──────────────────────────────────────────────────────────────
-- El push del móvil hace `supabase.from('projects').upsert(row, {onConflict:'id'})`,
-- que viaja con RETURNING (return=representation). PostgreSQL aplica la política de
-- SELECT a las filas devueltas por INSERT ... RETURNING. La política `acc_projects_sel`
-- usa `can_access_project(id)`, que es STABLE y hace un SUBSELECT sobre `projects`:
-- durante el MISMO INSERT no ve la fila recién insertada (usa el snapshot del inicio
-- de la sentencia), devuelve falso, y el RETURNING viola RLS — aunque el INSERT en sí
-- es perfectamente válido (created_by_id correcto, org_id puesto por trigger).
-- Confirmado en logs: POST /rest/v1/projects → 403, con sesión autenticada
-- (refresh_token 200 + push_tokens 200, cuyo WITH CHECK user_id = app_user_id() pasó,
-- probando que NO hay drift de id).
--
-- ── Fix principal (v62) ──────────────────────────────────────────────────────
-- Chequeo DIRECTO de columna en el USING de SELECT: se evalúa contra la propia fila
-- devuelta (sin subselect), por lo que SÍ está disponible durante el RETURNING. La
-- política restrictiva org_guard (org_id = auth_org()) sigue aplicando a SELECT, así
-- que no se amplía el aislamiento entre empresas.
ALTER POLICY acc_projects_sel ON public.projects
  USING (can_access_project(id) OR (created_by_id = app_user_id()));

-- ── Defensa en profundidad (v60/v61/v63) ─────────────────────────────────────
-- Trigger BEFORE INSERT que fuerza created_by_id = app_user_id() en proyectos NUEVOS,
-- por si el currentUser local del cliente quedara desincronizado del id canónico de la
-- nube. SOLO en alta real (no en el UPDATE del upsert: si se forzara ahí, EXCLUDED
-- cambiaría el dueño cuando un NO-creador re-sincroniza → secuestro de propiedad). El
-- guard `not exists` distingue alta de re-upsert. Service-role (app_user_id NULL)
-- conserva el valor provisto. Espejo de set_org_id.
CREATE OR REPLACE FUNCTION public.set_project_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if public.app_user_id() is not null
     and not exists (select 1 from public.projects p where p.id = NEW.id) then
    NEW.created_by_id := public.app_user_id();
  end if;
  return NEW;
end
$function$;

-- Función de trigger: no exponerla como RPC (los triggers corren con privilegios del
-- dueño de la tabla; revocar EXECUTE no afecta su ejecución como trigger).
REVOKE EXECUTE ON FUNCTION public.set_project_creator() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_project_creator ON public.projects;
CREATE TRIGGER trg_set_project_creator
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_project_creator();
