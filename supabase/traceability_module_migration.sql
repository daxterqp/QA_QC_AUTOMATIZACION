-- Migration: Módulo de Trazabilidad Operacional de Equipos y Actividades (v27).
-- Aplicar UNA vez en Supabase.
--
-- Cambios:
--   1. Tablas catálogo: activities, equipment_activities, work_shifts,
--      session_form_templates, session_form_template_items
--   2. Tablas de captura: work_sessions, work_session_intervals,
--      work_session_form_items, work_session_gps_points
--   3. Backfill de nuevos flags en projects.feature_flags

-- ─── Catálogos ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activities (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'productive', -- productive|maintenance|transport|other
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL,
  CONSTRAINT activities_unique_name UNIQUE (project_id, name)
);
CREATE INDEX IF NOT EXISTS activities_project_idx ON activities (project_id);
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activities_all ON activities;
CREATE POLICY activities_all ON activities FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS equipment_activities (
  id                TEXT PRIMARY KEY,
  equipment_id      TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  activity_id       TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  form_template_id  TEXT, -- FK a session_form_templates definida más abajo
  created_at        BIGINT NOT NULL,
  updated_at        BIGINT NOT NULL,
  CONSTRAINT equipment_activities_unique UNIQUE (equipment_id, activity_id)
);
CREATE INDEX IF NOT EXISTS equipment_activities_equip_idx ON equipment_activities (equipment_id);
CREATE INDEX IF NOT EXISTS equipment_activities_act_idx ON equipment_activities (activity_id);
ALTER TABLE equipment_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipment_activities_all ON equipment_activities;
CREATE POLICY equipment_activities_all ON equipment_activities FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS work_shifts (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  start_hour  INT NOT NULL CHECK (start_hour >= 0 AND start_hour <= 23),
  end_hour    INT NOT NULL CHECK (end_hour >= 0 AND end_hour <= 23),
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL,
  CONSTRAINT work_shifts_unique_name UNIQUE (project_id, name)
);
CREATE INDEX IF NOT EXISTS work_shifts_project_idx ON work_shifts (project_id);
ALTER TABLE work_shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS work_shifts_all ON work_shifts;
CREATE POLICY work_shifts_all ON work_shifts FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS session_form_templates (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL,
  CONSTRAINT session_form_templates_unique UNIQUE (project_id, name)
);
CREATE INDEX IF NOT EXISTS session_form_templates_project_idx ON session_form_templates (project_id);
ALTER TABLE session_form_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_form_templates_all ON session_form_templates;
CREATE POLICY session_form_templates_all ON session_form_templates FOR ALL USING (true) WITH CHECK (true);

-- FK desde equipment_activities.form_template_id → session_form_templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'equipment_activities' AND constraint_name = 'equipment_activities_template_fkey'
  ) THEN
    ALTER TABLE equipment_activities
      ADD CONSTRAINT equipment_activities_template_fkey
      FOREIGN KEY (form_template_id) REFERENCES session_form_templates(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS session_form_template_items (
  id                 TEXT PRIMARY KEY,
  template_id        TEXT NOT NULL REFERENCES session_form_templates(id) ON DELETE CASCADE,
  partida_item       TEXT,
  item_description   TEXT NOT NULL,
  validation_method  TEXT,
  section            TEXT,
  created_at         BIGINT NOT NULL,
  updated_at         BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS session_form_template_items_tmpl_idx ON session_form_template_items (template_id);
ALTER TABLE session_form_template_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_form_template_items_all ON session_form_template_items;
CREATE POLICY session_form_template_items_all ON session_form_template_items FOR ALL USING (true) WITH CHECK (true);

-- ─── Captura ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS work_sessions (
  id                       TEXT PRIMARY KEY,
  project_id               TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id                  TEXT NOT NULL REFERENCES users(id),
  equipment_id             TEXT NOT NULL REFERENCES equipment(id),
  activity_id              TEXT NOT NULL REFERENCES activities(id),
  sector_id                TEXT REFERENCES project_sectors(id) ON DELETE SET NULL,
  shift_id                 TEXT REFERENCES work_shifts(id) ON DELETE SET NULL,
  started_at               BIGINT NOT NULL,
  ended_at                 BIGINT,
  status                   TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE|PAUSED|CLOSED
  started_on_device_id     TEXT,
  auto_closed              BOOLEAN NOT NULL DEFAULT FALSE,
  notes                    TEXT,
  created_at               BIGINT NOT NULL,
  updated_at               BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS work_sessions_project_idx     ON work_sessions (project_id);
CREATE INDEX IF NOT EXISTS work_sessions_equipment_idx   ON work_sessions (equipment_id);
CREATE INDEX IF NOT EXISTS work_sessions_sector_idx      ON work_sessions (sector_id);
CREATE INDEX IF NOT EXISTS work_sessions_user_idx        ON work_sessions (user_id);
CREATE INDEX IF NOT EXISTS work_sessions_status_idx      ON work_sessions (status);
ALTER TABLE work_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS work_sessions_all ON work_sessions;
CREATE POLICY work_sessions_all ON work_sessions FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS work_session_intervals (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL, -- active|paused
  started_at  BIGINT NOT NULL,
  ended_at    BIGINT,
  created_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS work_session_intervals_session_idx ON work_session_intervals (session_id);
ALTER TABLE work_session_intervals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS work_session_intervals_all ON work_session_intervals;
CREATE POLICY work_session_intervals_all ON work_session_intervals FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS work_session_form_items (
  id                 TEXT PRIMARY KEY,
  session_id         TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  template_item_id   TEXT REFERENCES session_form_template_items(id) ON DELETE SET NULL,
  partida_item       TEXT,
  item_description   TEXT NOT NULL,
  validation_method  TEXT,
  value_text         TEXT,
  value_number       DOUBLE PRECISION,
  comments           TEXT,
  created_at         BIGINT NOT NULL,
  updated_at         BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS work_session_form_items_session_idx ON work_session_form_items (session_id);
ALTER TABLE work_session_form_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS work_session_form_items_all ON work_session_form_items;
CREATE POLICY work_session_form_items_all ON work_session_form_items FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS work_session_gps_points (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  captured_at  BIGINT NOT NULL,
  latitude     DOUBLE PRECISION NOT NULL,
  longitude    DOUBLE PRECISION NOT NULL,
  accuracy_m   REAL,
  created_at   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS work_session_gps_points_session_idx ON work_session_gps_points (session_id);
ALTER TABLE work_session_gps_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS work_session_gps_points_all ON work_session_gps_points;
CREATE POLICY work_session_gps_points_all ON work_session_gps_points FOR ALL USING (true) WITH CHECK (true);

-- ─── Backfill flags v27 en proyectos existentes ─────────────────────────────
UPDATE projects
SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
  || jsonb_build_object(
    'traceability_module',               false,
    'traceability_gps_polling',          'off',
    'traceability_gps_interval_seconds', 3,
    'anonymize_traceability',            false
  )
WHERE feature_flags IS NULL
   OR NOT (feature_flags ? 'traceability_module');

-- ─── Lock atómico de sesión por equipo (Fix B4) ─────────────────────────────
-- Garantiza que un mismo equipo no pueda tener dos sesiones simultáneas en
-- estado ACTIVE o PAUSED. Es un partial unique index de Postgres: el índice
-- solo se aplica a filas cuyo status ∈ (ACTIVE, PAUSED), permitiendo que
-- existan múltiples sesiones CLOSED históricas sobre el mismo equipo.
--
-- Atomicidad: si dos celulares intentan abrir/reanudar una sesión sobre el
-- mismo equipo a la vez, Postgres rechazará el segundo INSERT/UPDATE con el
-- error 23505 (unique_violation). El cliente captura ese código y lo maneja
-- (lógica gestionada por otro agente).
CREATE UNIQUE INDEX IF NOT EXISTS work_sessions_one_open_per_equipment
  ON work_sessions (equipment_id)
  WHERE status IN ('ACTIVE', 'PAUSED');

-- Fix P4: indice compuesto para queries de timeline (ordenadas por captured_at)
-- y para closeStaleSessions que busca el ultimo punto GPS por sesion.
CREATE INDEX IF NOT EXISTS work_session_gps_points_session_capt_idx
  ON work_session_gps_points (session_id, captured_at DESC);

-- Verificación:
--   \d work_sessions
--   \d work_session_intervals
--   SELECT id, feature_flags->>'traceability_module' FROM projects LIMIT 5;
