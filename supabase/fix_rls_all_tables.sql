-- ============================================================================
-- Fix: Crear tablas faltantes, agregar columnas faltantes y configurar RLS
-- ============================================================================
-- Ejecutar en Supabase SQL Editor
-- Asegura que el esquema de Supabase coincida con WatermelonDB (schema v17)
-- ============================================================================

-- ── 1. Crear tablas si no existen ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  apellido TEXT,
  role TEXT NOT NULL,
  password TEXT,
  pin TEXT,
  signature_uri TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  password TEXT,
  created_by_id TEXT,
  logo_s3_key TEXT,
  stamp_comment TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS user_project_access (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  location_only TEXT,
  specialty TEXT,
  reference_plan TEXT NOT NULL DEFAULT '',
  template_ids TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS protocol_templates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  id_protocolo TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS protocol_template_items (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  partida_item TEXT,
  item_description TEXT NOT NULL,
  validation_method TEXT,
  section TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS protocols (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  location_id TEXT,
  template_id TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  protocol_number TEXT NOT NULL,
  location_reference TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  corrections_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  signed_by_id TEXT,
  signed_at BIGINT,
  upload_status TEXT NOT NULL DEFAULT 'PENDING',
  filled_by_id TEXT,
  filled_at BIGINT,
  submitted_at BIGINT,
  rejection_reason TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS protocol_items (
  id TEXT PRIMARY KEY,
  protocol_id TEXT NOT NULL,
  partida_item TEXT,
  item_description TEXT NOT NULL,
  validation_method TEXT,
  section TEXT,
  is_compliant BOOLEAN NOT NULL DEFAULT FALSE,
  is_na BOOLEAN NOT NULL DEFAULT FALSE,
  has_answer BOOLEAN NOT NULL DEFAULT FALSE,
  comments TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS evidences (
  id TEXT PRIMARY KEY,
  protocol_item_id TEXT NOT NULL,
  s3_url_placeholder TEXT,
  local_uri TEXT NOT NULL DEFAULT '',
  upload_status TEXT NOT NULL DEFAULT 'PENDING',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS non_conformities (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  protocol_id TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  raised_by_id TEXT NOT NULL,
  resolution_notes TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  location_id TEXT,
  name TEXT NOT NULL,
  file_uri TEXT NOT NULL DEFAULT '',
  s3_key TEXT,
  s3_etag TEXT,
  local_etag TEXT,
  uploaded_by_id TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS plan_annotations (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  protocol_id TEXT,
  rect_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  rect_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  rect_width DOUBLE PRECISION NOT NULL DEFAULT 0,
  rect_height DOUBLE PRECISION NOT NULL DEFAULT 0,
  comment TEXT,
  sequence_number INTEGER NOT NULL DEFAULT 0,
  is_ok BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'OPEN',
  page INTEGER,
  created_by_id TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS annotation_comments (
  id TEXT PRIMARY KEY,
  annotation_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  content TEXT,
  read_by_creator BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS annotation_comment_photos (
  id TEXT PRIMARY KEY,
  annotation_comment_id TEXT NOT NULL,
  local_uri TEXT NOT NULL DEFAULT '',
  storage_path TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS dashboard_notes (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  content TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS phone_contacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  role TEXT,
  sort_order INTEGER,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- ── 2. Agregar columnas faltantes (si la tabla ya existia sin ellas) ────────

DO $$
BEGIN
  -- projects
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='logo_s3_key') THEN
    ALTER TABLE projects ADD COLUMN logo_s3_key TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='stamp_comment') THEN
    ALTER TABLE projects ADD COLUMN stamp_comment TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='created_by_id') THEN
    ALTER TABLE projects ADD COLUMN created_by_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='password') THEN
    ALTER TABLE projects ADD COLUMN password TEXT;
  END IF;

  -- users
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='apellido') THEN
    ALTER TABLE users ADD COLUMN apellido TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password') THEN
    ALTER TABLE users ADD COLUMN password TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='pin') THEN
    ALTER TABLE users ADD COLUMN pin TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='signature_uri') THEN
    ALTER TABLE users ADD COLUMN signature_uri TEXT;
  END IF;

  -- locations
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='locations' AND column_name='location_only') THEN
    ALTER TABLE locations ADD COLUMN location_only TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='locations' AND column_name='specialty') THEN
    ALTER TABLE locations ADD COLUMN specialty TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='locations' AND column_name='template_ids') THEN
    ALTER TABLE locations ADD COLUMN template_ids TEXT;
  END IF;

  -- protocol_template_items
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='protocol_template_items' AND column_name='section') THEN
    ALTER TABLE protocol_template_items ADD COLUMN section TEXT;
  END IF;

  -- protocols
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='protocols' AND column_name='template_id') THEN
    ALTER TABLE protocols ADD COLUMN template_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='protocols' AND column_name='rejection_reason') THEN
    ALTER TABLE protocols ADD COLUMN rejection_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='protocols' AND column_name='corrections_allowed') THEN
    ALTER TABLE protocols ADD COLUMN corrections_allowed BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  -- protocol_items
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='protocol_items' AND column_name='section') THEN
    ALTER TABLE protocol_items ADD COLUMN section TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='protocol_items' AND column_name='has_answer') THEN
    ALTER TABLE protocol_items ADD COLUMN has_answer BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='protocol_items' AND column_name='is_na') THEN
    ALTER TABLE protocol_items ADD COLUMN is_na BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='protocol_items' AND column_name='partida_item') THEN
    ALTER TABLE protocol_items ADD COLUMN partida_item TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='protocol_items' AND column_name='validation_method') THEN
    ALTER TABLE protocol_items ADD COLUMN validation_method TEXT;
  END IF;

  -- plans
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='s3_key') THEN
    ALTER TABLE plans ADD COLUMN s3_key TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='s3_etag') THEN
    ALTER TABLE plans ADD COLUMN s3_etag TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='local_etag') THEN
    ALTER TABLE plans ADD COLUMN local_etag TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='location_id') THEN
    ALTER TABLE plans ADD COLUMN location_id TEXT;
  END IF;

  -- plan_annotations
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plan_annotations' AND column_name='page') THEN
    ALTER TABLE plan_annotations ADD COLUMN page INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plan_annotations' AND column_name='status') THEN
    ALTER TABLE plan_annotations ADD COLUMN status TEXT NOT NULL DEFAULT 'OPEN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plan_annotations' AND column_name='created_by_id') THEN
    ALTER TABLE plan_annotations ADD COLUMN created_by_id TEXT NOT NULL DEFAULT '';
  END IF;

  -- annotation_comment_photos
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='annotation_comment_photos' AND column_name='storage_path') THEN
    ALTER TABLE annotation_comment_photos ADD COLUMN storage_path TEXT;
  END IF;

  -- phone_contacts
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='phone_contacts' AND column_name='sort_order') THEN
    ALTER TABLE phone_contacts ADD COLUMN sort_order INTEGER;
  END IF;

  RAISE NOTICE 'All columns verified/added successfully';
END
$$;

-- ── 3. Configurar RLS con acceso total para anon key ───────────────────────

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'users',
    'projects',
    'user_project_access',
    'locations',
    'protocol_templates',
    'protocol_template_items',
    'protocols',
    'protocol_items',
    'evidences',
    'non_conformities',
    'plans',
    'plan_annotations',
    'annotation_comments',
    'annotation_comment_photos',
    'dashboard_notes',
    'phone_contacts'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow anon full access" ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY "Allow anon full access" ON %I FOR ALL USING (true) WITH CHECK (true)',
      tbl
    );
    RAISE NOTICE 'RLS configured for table: %', tbl;
  END LOOP;
END
$$;

-- ── 4. Verificar resultado ─────────────────────────────────────────────────

SELECT tablename, COUNT(*) as policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
