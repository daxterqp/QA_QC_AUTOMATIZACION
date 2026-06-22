-- Añade columna opcional `general_comment` a la tabla protocols.
-- La consume sólo el flujo de protocolos numéricos (manuales / fórmulas / gráficos),
-- como recuadro de observaciones generales al final del formulario.
-- Idempotente.

ALTER TABLE protocols ADD COLUMN IF NOT EXISTS general_comment TEXT;
