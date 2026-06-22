-- v33 — Motivo de aprobación (override del jefe de calidad).
-- Ejecutar en el SQL Editor de Supabase.
--
-- Cuando un Jefe aprueba un ensayo que NO cumple las restricciones (valores
-- fuera de rango), debe registrar el motivo. Se guarda aquí (texto libre).
-- Para ensayos conformes queda NULL.

ALTER TABLE protocols ADD COLUMN IF NOT EXISTS approval_reason text;
