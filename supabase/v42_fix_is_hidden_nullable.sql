-- v42 — FIX: protocol_templates.is_hidden NO debe ser NOT NULL.
--
-- BUG: v39 creó is_hidden como `NOT NULL DEFAULT false`. Las plantillas creadas
-- ANTES de v39 tienen is_hidden = null en el móvil; al sincronizar, el upsert
-- fallaba con "null value in column is_hidden violates not-null constraint" y,
-- como la plantilla no subía, TODO lo que la referencia (protocols → protocol_items)
-- caía en cascada por foreign key. Resultado: las fichas no subían a la nube.
--
-- El código del móvil ya coacciona is_hidden→false en el push (fix principal),
-- pero relajamos la columna como defensa: null = no oculto (visible), igual que false.
--
-- Córrelo en el SQL Editor de Supabase (idempotente).

ALTER TABLE protocol_templates ALTER COLUMN is_hidden DROP NOT NULL;
UPDATE protocol_templates SET is_hidden = false WHERE is_hidden IS NULL;
