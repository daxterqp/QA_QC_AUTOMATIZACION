-- v29 (WMDB) — agrega columna sort_order a project_sectors para conservar el
-- orden del Excel al mostrar sectores en analytics/cronología/PDF de
-- Trazabilidad. NULL para sectores legacy (caen al final del ordenamiento).
--
-- Ejecutar UNA vez en Supabase Studio (SQL Editor). Idempotente.

ALTER TABLE project_sectors
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Sin backfill: queremos NULL para legacy (orden alfabético implícito en
-- analytics como fallback). El importer asigna 1..N al re-subir el Excel.
