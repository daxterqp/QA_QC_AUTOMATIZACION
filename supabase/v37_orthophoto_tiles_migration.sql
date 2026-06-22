-- v37 — Teselado de ortofoto (1 / 4 / 9 porciones por ortofoto).
-- Ejecutar en el SQL Editor de Supabase.
--
-- `orthophoto_tiles_json` = teselas de la versión ACTIVA: array de
--   { s3Key, bounds: [[south,west],[north,east]] }  (1 elemento si es simple).
-- El mapa (web y celular) dibuja una capa por tesela → más nitidez sin chocar
-- con el límite de textura (~8192px) del visor.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS orthophoto_tiles_json jsonb;
