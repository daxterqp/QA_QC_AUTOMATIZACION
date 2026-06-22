-- Migration: Equipos — clasificación por categoría (laboratorio | maquinaria_pesada).
-- Aplicar UNA vez en Supabase. Idempotente.
--
-- Motivo: el catálogo de equipos del proyecto incluye dos clases distintas:
--   - laboratorio: balanzas, prensas, hornos, tamices, termómetros — vinculados
--     a protocolos de QA/QC y validación de calibración.
--   - maquinaria_pesada: excavadoras, compactadores, motoniveladoras, etc. —
--     usados en el módulo de Trazabilidad operacional para registro de sesiones.
--
-- El campo `type` existente sigue siendo el subtipo (balanza, prensa, etc.)
-- y se amplía implícitamente para incluir maquinaria sin romper datos previos.

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'laboratorio';

-- Índice para los filtros de UI por categoría
CREATE INDEX IF NOT EXISTS equipment_category_idx ON equipment (project_id, category);

-- Backfill: los equipos pre-existentes ya quedaron en 'laboratorio' por el DEFAULT.
-- No se requiere UPDATE adicional.

-- Verificación:
--   \d equipment
--   SELECT category, COUNT(*) FROM equipment GROUP BY category;
