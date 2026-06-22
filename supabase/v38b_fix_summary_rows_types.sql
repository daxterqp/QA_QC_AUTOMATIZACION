-- v38b — FIX de v38: tipos de columna + RLS de protocol_summary_rows.
--
-- BUG: v38 declaró project_id/protocol_id/template_id como `uuid`, pero TODO el
-- esquema de este proyecto usa ids TEXT (los ids de WatermelonDB NO son UUID
-- válidos). Por eso el upsert fallaba en silencio con "invalid input syntax for
-- type uuid" → la tabla quedaba VACÍA. El celular igual mostraba los ensayos
-- (lee su copia LOCAL), pero la PC/web no (depende solo de la nube). Además la
-- tabla nunca recibió la policy RLS permisiva como el resto.
--
-- Córrelo en el SQL Editor de Supabase (es idempotente).

-- ── 1. Corregir tipos uuid → text (si la tabla se creó con v38) ─────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='protocol_summary_rows' AND column_name='project_id' AND data_type='uuid') THEN
    ALTER TABLE protocol_summary_rows ALTER COLUMN project_id  TYPE text USING project_id::text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='protocol_summary_rows' AND column_name='protocol_id' AND data_type='uuid') THEN
    ALTER TABLE protocol_summary_rows ALTER COLUMN protocol_id TYPE text USING protocol_id::text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='protocol_summary_rows' AND column_name='template_id' AND data_type='uuid') THEN
    ALTER TABLE protocol_summary_rows ALTER COLUMN template_id TYPE text USING template_id::text;
  END IF;
  -- El id sí puede seguir siendo uuid (lo genera la DB con gen_random_uuid()).
END
$$;

-- Por si la tabla aún no existía, créala ya con los tipos correctos.
CREATE TABLE IF NOT EXISTS protocol_summary_rows (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      text NOT NULL,
  template_id     text,
  protocol_id     text NOT NULL,
  protocol_code   text,
  protocol_number text,
  ensayo_date     text,
  sector_id       text,
  sector_name     text,
  location_id     text,
  location_name   text,
  status          text,
  values_json     jsonb,
  created_at      bigint,
  updated_at      bigint,
  CONSTRAINT protocol_summary_rows_protocol_uniq UNIQUE (protocol_id)
);

CREATE INDEX IF NOT EXISTS idx_summary_rows_project  ON protocol_summary_rows (project_id);
CREATE INDEX IF NOT EXISTS idx_summary_rows_template ON protocol_summary_rows (template_id);
CREATE INDEX IF NOT EXISTS idx_summary_rows_code     ON protocol_summary_rows (project_id, template_id, protocol_code);

-- ── 2. RLS permisiva (igual que el resto de tablas del proyecto) ────────────
ALTER TABLE protocol_summary_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access" ON protocol_summary_rows;
CREATE POLICY "Allow anon full access" ON protocol_summary_rows FOR ALL USING (true) WITH CHECK (true);
