-- ─────────────────────────────────────────────────────────────────────────────
-- Migración: añadir columna `file_type` a la tabla `plans` si no existe.
--
-- Por qué: el web (y los endpoints /api/plans/upload, /sync, /relink) escriben
-- e indexan por `file_type` ('pdf' | 'dwg') para distinguir entre planos PDF y
-- DWG. La definición original de `plans` no incluía esta columna, así que en
-- bases creadas antes del cambio los INSERT fallaban silenciosamente.
--
-- Idempotente: usa IF NOT EXISTS. Puedes correrlo varias veces sin riesgo.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- 1. Añadir la columna con default 'pdf' (la mayoría de planos existentes son PDF)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'file_type'
  ) THEN
    ALTER TABLE plans ADD COLUMN file_type TEXT NOT NULL DEFAULT 'pdf';
    RAISE NOTICE 'Columna plans.file_type añadida con default pdf.';
  ELSE
    RAISE NOTICE 'Columna plans.file_type ya existe — sin cambios.';
  END IF;

  -- 2. Re-clasificar planos cuyo s3_key indica que en realidad son DWG
  --    (carpeta `plansdwg/` vs `plans/` en S3, según la convención del backend).
  UPDATE plans
     SET file_type = 'dwg'
   WHERE file_type = 'pdf'
     AND s3_key LIKE '%/plansdwg/%';
END$$;

-- 3. Verificación: cuántos planos hay por tipo
SELECT file_type, COUNT(*) FROM plans GROUP BY file_type;
