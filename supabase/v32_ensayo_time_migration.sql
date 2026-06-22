-- ════════════════════════════════════════════════════════════════════════════
-- v32 — Hora de inicio del ensayo (HH:MM)
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Se recolecta al crear la instancia desde los modos de llenado (default: hora
-- del sistema al momento de guardar; el usuario puede modificarla).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE protocols ADD COLUMN IF NOT EXISTS ensayo_time TEXT;
