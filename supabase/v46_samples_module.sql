-- v46 — Módulo "ensayos por muestra" + soft-delete de usuarios + id de muestras.
--
--   • users.is_active        → soft-delete: false = cuenta inactiva (sin login). Las
--                              firmas/aprobaciones históricas se conservan intactas.
--   • projects.sample_identifier → id del proyecto para el código de muestras (ej. "123").
--   • protocols.sample_id    → ensayo vinculado a una muestra física (sin FK estricta,
--                              referencia informativa como recycle_bin.protocol_id).
--   • samples                → muestras físicas. Cada una agrupa varios protocolos.
--                              Código M{sample_identifier}{ddmmyy}-{seq:4} por proyecto.
--
-- IDs en TEXT (los ids de WatermelonDB no son UUID). RLS permisiva como el resto del
-- esquema. Córrelo en el SQL Editor de Supabase (idempotente).

ALTER TABLE users     ADD COLUMN IF NOT EXISTS is_active boolean;
ALTER TABLE projects  ADD COLUMN IF NOT EXISTS sample_identifier text;
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS sample_id text;

CREATE INDEX IF NOT EXISTS protocols_sample_idx ON protocols (sample_id);

CREATE TABLE IF NOT EXISTS samples (
  id                text PRIMARY KEY,
  project_id        text NOT NULL,
  sample_code       text NOT NULL,
  seq               integer,
  sample_date       text,
  location_id       text,
  sector_id         text,
  material_type     text,
  condition         text,                 -- ALTERADA | INALTERADA
  depth_from        double precision,
  depth_to          double precision,
  coord_system      text,                 -- datum
  latitude          double precision,
  longitude         double precision,
  coord_east        double precision,
  coord_north       double precision,
  coord_elevation   double precision,
  coord_captured_at bigint,
  coord_accuracy_m  double precision,
  layer_info_json   text,                 -- recojo automático de capas (string JSON local)
  notes             text,
  created_by_id     text,
  upload_status     text,
  created_at        bigint,
  updated_at        bigint
);

CREATE INDEX IF NOT EXISTS samples_project_idx ON samples (project_id);
CREATE INDEX IF NOT EXISTS samples_code_idx    ON samples (project_id, sample_code);

ALTER TABLE samples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon full access" ON samples;
CREATE POLICY "Allow anon full access" ON samples
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
