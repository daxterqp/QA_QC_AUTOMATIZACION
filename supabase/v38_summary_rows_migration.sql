-- v38 — Módulo "Tablas Resumen" (Fase 1: datos progresivos).
-- Una fila por ENSAYO (protocolo), construida/actualizada al guardar el ensayo
-- (no se recalcula en masa). La vista de Tablas Resumen solo lee y ordena.
--
-- values_json: { "<colKey>": <valor>, ... } — las celdas de la ficha convertidas
-- a columnas según la config embebida en la plantilla (hoja RESUMEN). Si la
-- plantilla no trae config, se llena con todas las celdas reportables.
--
-- Córrelo en el SQL Editor de Supabase.

-- OJO: project_id/protocol_id/template_id son TEXT (no uuid): los ids de
-- WatermelonDB NO son UUID válidos. Con uuid, el upsert falla en silencio y la
-- tabla queda vacía (ver v38b_fix_summary_rows_types.sql).
CREATE TABLE IF NOT EXISTS protocol_summary_rows (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      text NOT NULL,
  template_id     text,
  protocol_id     text NOT NULL,
  protocol_code   text,
  protocol_number text,
  ensayo_date     text,           -- YYYY-MM-DD
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

-- Config de la tabla resumen, embebida junto a la plantilla del ensayo.
-- { columns:[{key,label,group?,from}], groups?:[{title,span}], aggregations?:[...] }
-- Se llena al importar el Excel de la plantilla (hoja/bloque RESUMEN).
ALTER TABLE protocol_templates ADD COLUMN IF NOT EXISTS summary_config_json jsonb;

-- RLS permisiva, igual que el resto de tablas del proyecto.
ALTER TABLE protocol_summary_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access" ON protocol_summary_rows;
CREATE POLICY "Allow anon full access" ON protocol_summary_rows FOR ALL USING (true) WITH CHECK (true);
