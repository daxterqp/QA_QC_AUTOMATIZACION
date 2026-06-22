-- Migration v29: Reestructura de feature_flags por proyecto.
-- Aplicar UNA vez en Supabase. Idempotente. NO borra claves del JSONB
-- (compat backwards con apps anteriores que aún leen los flags deprecated).
--
-- Cambios:
--  1. Flags @deprecated forzados a TRUE en todos los proyectos (forman parte
--     del funcionamiento estándar — Planos PDF, Normas, QR, Contactos,
--     Gráficos avanzados, Vinculación entre protocolos).
--  2. Backfill de defaults para proyectos viejos sin las claves nuevas
--     (traceability_module, equipment_catalog, map_enabled).
--  3. Consistencia padre-hijo: si traceability_module=false, equipment_catalog
--     pasa a false (no se permite huérfano). Lo mismo aplica al runtime, pero
--     dejamos limpio el estado persistido.

-- 1. Forzar @deprecated → true en TODOS los proyectos existentes.
--    Bumpea updated_at para que los móviles hagan pull (sync compara timestamps).
UPDATE projects
   SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
       || jsonb_build_object(
         'plans_pdf',         true,
         'advanced_charts',   true,
         'normas',            true,
         'phone_contacts',    true,
         'qr_codes',          true,
         'protocol_linking',  true
       ),
       updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;

-- 2. Backfill de defaults para nuevas claves (NO sobrescribe lo existente)
UPDATE projects
   SET feature_flags = jsonb_build_object(
         'traceability_module',                false,
         'equipment_catalog',                  false,
         'traceability_gps_polling',           'off',
         'traceability_gps_interval_seconds',  3,
         'anonymize_traceability',             false,
         'map_enabled',                        false,
         'gps_capture_subjective',             false,
         'gps_capture_numeric',                false,
         'coordinate_system',                  'WGS84_LATLNG',
         'classic_protocols',                  true,
         'numeric_protocols',                  false,
         'parametric_templates',               false,
         'historical_import',                  false,
         'multi_level_approval',               false,
         'approval_levels',                    1
       ) || COALESCE(feature_flags, '{}'::jsonb),
       updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;

-- 3. Consistencia padre-hijo: equipment_catalog ⇒ traceability_module
UPDATE projects
   SET feature_flags = feature_flags || jsonb_build_object('equipment_catalog', false),
       updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
 WHERE COALESCE((feature_flags->>'traceability_module')::boolean, false) = false;

-- Verificación:
--   SELECT id, name,
--          feature_flags->>'traceability_module' AS traz,
--          feature_flags->>'equipment_catalog'   AS eqcat,
--          feature_flags->>'map_enabled'         AS map,
--          feature_flags->>'plans_pdf'           AS plans_pdf
--   FROM projects;
