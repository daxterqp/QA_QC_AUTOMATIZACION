-- v33 — Ortofoto georreferenciada por proyecto (ImageOverlay en el mapa GIS).
-- Ejecutar en el SQL Editor de Supabase.
--
-- La imagen se sube a S3 (orthophoto_s3_key) y se georreferencia con su
-- bounding box en WGS84 (orthophoto_bounds_json = [[southLat,westLng],[northLat,eastLng]]).
-- orthophoto_system guarda el sistema original elegido al importar (informativo).

ALTER TABLE projects ADD COLUMN IF NOT EXISTS orthophoto_s3_key      text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS orthophoto_bounds_json jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS orthophoto_system      text;
