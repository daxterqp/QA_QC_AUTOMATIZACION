-- Migration: añade columnas para soporte de importación de protocolos históricos.
-- Aplicar UNA vez en Supabase (dashboard SQL editor o psql).
--
-- Las 4 columnas son NULL/false para instancias creadas in-app → backwards compat total.
-- El UNIQUE INDEX PARTIAL solo aplica cuando external_id no es NULL (los in-app son NULL).

ALTER TABLE protocols ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS imported_at BIGINT;
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS imported_by_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS is_historical BOOLEAN NOT NULL DEFAULT false;

-- Índice único parcial: external_id es único POR PROYECTO, pero solo cuando no es NULL.
-- Permite re-import idempotente (dedup) sin afectar las instancias creadas en-app.
CREATE UNIQUE INDEX IF NOT EXISTS protocols_external_id_uniq_per_project
  ON protocols (project_id, external_id)
  WHERE external_id IS NOT NULL;

-- Verificación post-migración:
--   \d protocols                                      -- debe mostrar las 4 columnas
--   SELECT COUNT(*) FROM protocols WHERE is_historical = true;  -- inicial: 0
--   SELECT COUNT(*) FROM protocols WHERE external_id IS NULL;   -- inicial: total de protocols
