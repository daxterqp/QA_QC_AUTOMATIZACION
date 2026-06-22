-- ════════════════════════════════════════════════════════════════════════════
-- v31 — Modos de llenado de protocolos + codificación correlativa (Partes D+E)
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
--
--   protocol_code : código correlativo del ensayo (p.ej. PR-260032), generado
--                   al crear la instancia con la máscara del proyecto
--                   (feature_flags.coding_mask_default, ámbito tipo+año+proyecto).
--                   Único por proyecto (índice parcial — espejo del patrón
--                   external_id v21). Sin backfill: solo ensayos nuevos.
--   ensayo_date   : fecha del ENSAYO (YYYY-MM-DD, distinta de la fecha de carga)
--                   — agrupador del modo "por fecha".
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE protocols ADD COLUMN IF NOT EXISTS protocol_code TEXT;
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS ensayo_date TEXT;

-- Guardián final contra correlativos duplicados generados offline: el push que
-- colisione recibe 23505 y la app re-secuencia y reintenta.
CREATE UNIQUE INDEX IF NOT EXISTS protocols_code_uniq_per_project
  ON protocols (project_id, protocol_code)
  WHERE protocol_code IS NOT NULL;

-- Índices de consulta de los modos de llenado.
CREATE INDEX IF NOT EXISTS protocols_ensayo_date_idx
  ON protocols (project_id, ensayo_date)
  WHERE ensayo_date IS NOT NULL;
