-- Migration: feature flags por proyecto.
-- Aplicar UNA vez en Supabase.
--
-- Modelo: cada proyecto guarda un JSON con qué módulos están activos. Proyectos nuevos
-- arrancan con módulos avanzados OFF; los proyectos existentes (creados antes) reciben
-- el set completo para preservar comportamiento.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill: a todos los proyectos existentes les pongo TODOS los flags en true para
-- preservar el comportamiento previo (lo que ya funcionaba sigue funcionando).
-- Los proyectos NUEVOS recibirán los defaults definidos en el código (avanzados OFF).
UPDATE projects
SET feature_flags = '{
  "classic_protocols": true,
  "plans_pdf": true,
  "normas": true,
  "phone_contacts": true,
  "numeric_protocols": true,
  "advanced_charts": true,
  "historical_import": true,
  "equipment_catalog": false,
  "protocol_linking": false,
  "multi_level_approval": false,
  "parametric_templates": false,
  "qr_codes": false,
  "approval_levels": 1
}'::jsonb
WHERE feature_flags = '{}'::jsonb OR feature_flags IS NULL;

-- Verificación:
--   SELECT id, name, feature_flags FROM projects LIMIT 5;
--   SELECT count(*) FROM projects WHERE feature_flags->>'classic_protocols' = 'true';
