-- v39 — Ocultar tipo de ensayo (no eliminar).
--
-- Un tipo de ensayo (protocol_template) marcado is_hidden = true:
--   • NO aparece en los selectores/desplegables para crear ensayos NUEVOS.
--   • No se pueden crear nuevos ensayos de ese tipo.
--   • Los ensayos YA hechos de ese tipo siguen apareciendo normal en registros,
--     dossier, histórico, tablas resumen, etc. (no se elimina nada).
-- Es reversible (ocultar / mostrar). Solo el CREADOR del proyecto lo cambia.
--
-- Córrelo en el SQL Editor de Supabase (idempotente).

-- NOTA: is_hidden es NULLABLE a propósito (null = visible, igual que false). Si se
-- pusiera NOT NULL, las plantillas pre-v39 (con is_hidden null en el móvil) romperían
-- el sync en cascada por FK. Ver v42_fix_is_hidden_nullable.sql.
ALTER TABLE protocol_templates ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;
