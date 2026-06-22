-- v36 — Múltiples ortofotos por proyecto + selección de la ACTIVA.
-- Ejecutar en el SQL Editor de Supabase.
--
-- `orthophotos_json` = array de versiones, cada una:
--   { id, label, s3Key, bounds, system, sourceName, outBytes, width, height, createdAt }
-- `orthophoto_active_id` = id de la versión activa.
-- Las columnas existentes `orthophoto_s3_key / orthophoto_bounds_json /
-- orthophoto_system` se MANTIENEN: son la versión ACTIVA desnormalizada (lo que
-- leen el mapa web y el celular sin cambios). Subir otra ortofoto ya NO
-- sobrescribe: cada versión tiene su propio s3Key único.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS orthophotos_json     jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS orthophoto_active_id text;
