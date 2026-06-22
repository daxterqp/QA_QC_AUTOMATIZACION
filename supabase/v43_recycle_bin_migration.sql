-- v43 — Papelera de Reciclaje (recycle_bin).
--
-- Nueva lógica de eliminación de ensayos: en vez de borrado lógico (flags), se
-- hace HARD DELETE del ensayo y TODAS sus relaciones en la base principal, pero
-- ANTES se guarda una COPIA estática y autocontenida en `recycle_bin`.
--
-- Reglas:
--   • `recycle_bin` es SOLO un historial de respaldo, de solo lectura.
--   • No interactúa con el resto del sistema (no FKs, no se procesan cálculos).
--   • El `protocol_code` puede repetirse: el correlativo del ensayo eliminado
--     queda LIBERADO para que el siguiente ensayo lo reutilice (el ensayo
--     eliminado "nunca existió" para métricas/índices de la base principal).
--   • `snapshot_json` contiene el volcado completo (protocolo + items + evidencias
--     + approvals + NC + equipos + anotaciones + comentarios + fila de resumen).
--
-- IDs en TEXT (los ids de WatermelonDB no son UUID válidos). RLS permisiva como
-- el resto del esquema. Córrelo en el SQL Editor de Supabase (idempotente).

CREATE TABLE IF NOT EXISTS recycle_bin (
  id                text PRIMARY KEY,
  project_id        text NOT NULL,
  protocol_id       text,                 -- id original (referencia informativa, sin FK)
  protocol_code     text,                 -- correlativo original (puede repetirse)
  protocol_number   text,
  template_id       text,
  template_name     text,                 -- tipo de ensayo
  location_name     text,
  sector_name       text,
  status            text,
  ensayo_date       text,
  snapshot_json     jsonb NOT NULL,       -- volcado completo y autocontenido
  deleted_at        bigint NOT NULL,      -- orden por fecha (desc)
  deleted_by_id     text,
  deleted_by_name   text,
  created_at        bigint,
  updated_at        bigint
);

CREATE INDEX IF NOT EXISTS recycle_bin_project_idx  ON recycle_bin (project_id);
CREATE INDEX IF NOT EXISTS recycle_bin_deleted_idx  ON recycle_bin (deleted_at DESC);

ALTER TABLE recycle_bin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon full access" ON recycle_bin;
CREATE POLICY "Allow anon full access" ON recycle_bin
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
