-- v45 — Llamados entre ensayos (@código.celda): snapshot congelado.
--
-- Cuando un ensayo A referencia datos de otro ensayo B con `@<correlativo>.<celda>`,
-- al ENVIAR A se congela el valor llamado dentro del `comments` de la celda fórmula
-- (igual que el resto de calculadas). Adicionalmente guardamos aquí la METADATA del
-- llamado para:
--   • Doble check: el correlativo (protocol_code) debe resolver a EXACTAMENTE un
--     ensayo aprobado; guardamos su id PERMANENTE (protocols.id, que nunca se reusa)
--     para detectar si luego el correlativo apunta a otro ensayo (reúso).
--   • Frescura híbrida: comparar `sourceUpdatedAt` guardado vs el actual de la fuente
--     → indicador "desactualizado" + acción "Actualizar" (recongelar).
--
-- Forma: { "<código>.<celda>": { sourceId, sourceUpdatedAt, value, status } }
--   status ∈ 'ok' | 'pendiente' | 'ambiguo'.
--
-- Córrelo en el SQL Editor de Supabase (idempotente).

ALTER TABLE protocols ADD COLUMN IF NOT EXISTS xref_snapshot_json jsonb;
