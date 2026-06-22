-- v30 (WMDB) — checklist en Trazabilidad operacional.
--
-- 1) work_session_form_items gana 3 columnas para soportar Sí/No/N/A + flag
--    de respondido. Espejo de protocol_items en el módulo QA/QC.
-- 2) evidences gana session_form_item_id (nullable) para asociar fotos a
--    items del checklist sin abusar de protocol_item_id (que apunta a una
--    tabla distinta).
--
-- Ejecutar UNA vez en Supabase Studio (SQL Editor). Idempotente.

ALTER TABLE work_session_form_items
  ADD COLUMN IF NOT EXISTS is_compliant BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_na BOOLEAN,
  ADD COLUMN IF NOT EXISTS has_answer BOOLEAN;

ALTER TABLE evidences
  ADD COLUMN IF NOT EXISTS session_form_item_id TEXT;

CREATE INDEX IF NOT EXISTS evidences_session_form_item_id_idx
  ON evidences (session_form_item_id);
