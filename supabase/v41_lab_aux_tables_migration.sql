-- v41 — Tablas auxiliares de laboratorio a NIVEL PROYECTO (Fase 2).
--
-- Un registro por GRUPO (taras, moldes, fiolas, densidad-agua) con sus columnas
-- y filas (JSONB) + una fecha de calibración compartida. Se sube una vez (hoja 2
-- del Excel del catálogo de equipos de laboratorio) y cualquier ficha la llama por
-- `group_key` con BUSCAR(@grupo, valor, "columna"). La 1ª columna es la LLAVE.
--
-- Ids en TEXT (los ids de WatermelonDB NO son UUID válidos — ver v38b). RLS
-- permisiva como el resto del esquema. Córrelo en el SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS lab_aux_tables (
  id                  text PRIMARY KEY,
  project_id          text NOT NULL,
  group_key           text NOT NULL,          -- identificador, ej. 'taras'
  name                text,
  columns_json        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ["Codigo","Malla","Abertura"]
  rows_json           jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [["1","N1","45"], ...]
  last_calibration_at bigint,
  next_calibration_at bigint,
  created_at          bigint,
  updated_at          bigint,
  CONSTRAINT lab_aux_tables_group_uniq UNIQUE (project_id, group_key)
);

CREATE INDEX IF NOT EXISTS idx_lab_aux_tables_project ON lab_aux_tables (project_id);

ALTER TABLE lab_aux_tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access" ON lab_aux_tables;
CREATE POLICY "Allow anon full access" ON lab_aux_tables FOR ALL USING (true) WITH CHECK (true);
