-- Migration: Módulo GIS (captura GPS + sectores con/sin geometría + mapa).
-- Aplicar UNA vez en Supabase.
--
-- Cambios:
--  1. Columnas nuevas en `protocols` para coords + sector asignado
--  2. Tabla nueva `project_sectors` (sectores con polígono opcional)
--  3. Columna `map_tile_url` en `projects` (URL custom de ortofoto)

-- ─── project_sectors ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_sectors (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  /** Array `[{lat,lng}, ...]` en WGS84. NULL = sector solo-nombre sin geometría.
   *  JSONB para que la web lea directamente como array; el móvil hace
   *  `filterToLocalSchema` JSONB→string al pullear (WMDB schema lo guarda como TEXT). */
  points_json     JSONB,
  display_color   TEXT,
  source_system   TEXT,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL,
  CONSTRAINT project_sectors_unique_name UNIQUE (project_id, name)
);

-- D1 — Si la tabla ya existía con `points_json TEXT` (instalaciones que aplicaron
-- la primera versión de la migración), convertir a JSONB de forma idempotente.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_sectors' AND column_name = 'points_json' AND data_type = 'text'
  ) THEN
    ALTER TABLE project_sectors
      ALTER COLUMN points_json TYPE JSONB USING points_json::jsonb;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS project_sectors_project_idx ON project_sectors (project_id);

-- C7 — Asegurar el UNIQUE (project_id, name) aunque la tabla haya existido
-- antes sin el constraint (re-ejecuciones de la migración no lo agregarían
-- porque CREATE TABLE IF NOT EXISTS salta la definición completa).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'project_sectors' AND constraint_name = 'project_sectors_unique_name'
  ) THEN
    ALTER TABLE project_sectors
      ADD CONSTRAINT project_sectors_unique_name UNIQUE (project_id, name);
  END IF;
END$$;

ALTER TABLE project_sectors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_sectors_all ON project_sectors;
CREATE POLICY project_sectors_all ON project_sectors FOR ALL USING (true) WITH CHECK (true);

-- ─── protocols: columnas GIS ─────────────────────────────────────────────────
ALTER TABLE protocols
  ADD COLUMN IF NOT EXISTS coord_captured_at         BIGINT,
  ADD COLUMN IF NOT EXISTS coord_captured_by_id      TEXT,
  ADD COLUMN IF NOT EXISTS coord_accuracy_m          REAL,
  ADD COLUMN IF NOT EXISTS coord_backup_lat          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS coord_backup_lng          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS coord_backup_captured_at  BIGINT,
  ADD COLUMN IF NOT EXISTS sector_id                 TEXT,
  ADD COLUMN IF NOT EXISTS sector_assigned_manually  BOOLEAN DEFAULT FALSE;

-- FK opcional al sector (sin restricción NOT NULL — protocolos sin sector son válidos).
-- Idempotente: verifica si el constraint existe antes de crearlo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'protocols' AND constraint_name = 'protocols_sector_id_fkey'
  ) THEN
    ALTER TABLE protocols
      ADD CONSTRAINT protocols_sector_id_fkey
      FOREIGN KEY (sector_id) REFERENCES project_sectors(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ─── projects: map_tile_url ──────────────────────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS map_tile_url TEXT;

-- ─── D2 — Backfill flags GIS v26 en proyectos pre-existentes ────────────────
-- Los flags nuevos (gps_capture_*, coordinate_system, map_enabled) no estaban
-- en el backfill de feature_flags_migration.sql (v22). Sin esto, proyectos
-- legacy devuelven NULL al hacer `feature_flags->>'map_enabled'` directo en SQL.
-- La app mitigaba con `mergeFeatureFlags` en runtime, pero queries SQL directas
-- (dashboards, reportes, RLS policies futuras) fallarían.
UPDATE projects
SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
  || jsonb_build_object(
    'gps_capture_subjective', false,
    'gps_capture_numeric',    false,
    'coordinate_system',      'WGS84_LATLNG',
    'map_enabled',            false
  )
WHERE feature_flags IS NULL
   OR NOT (feature_flags ? 'gps_capture_subjective')
   OR NOT (feature_flags ? 'gps_capture_numeric')
   OR NOT (feature_flags ? 'coordinate_system')
   OR NOT (feature_flags ? 'map_enabled');

-- Verificación:
--   \d project_sectors
--   \d protocols
--   SELECT column_name FROM information_schema.columns WHERE table_name='projects' AND column_name='map_tile_url';
