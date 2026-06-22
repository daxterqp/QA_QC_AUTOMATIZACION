-- Migration: aprobaciones jerárquicas para protocolos (1–3 niveles).
-- Aplicar UNA vez en Supabase.
--
-- Modelo: cuando un protocolo se submite, se crean N filas (N = approval_levels del
-- proyecto) en protocol_approvals con status='PENDING'. Cada firmante actúa sobre la
-- fila de su nivel. Cuando todas están APPROVED, el protocolo entra a APPROVED.
-- Si CUALQUIER nivel rechaza → REJECTED inmediato.

CREATE TABLE IF NOT EXISTS protocol_approvals (
  id              TEXT PRIMARY KEY,
  protocol_id     TEXT NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  level           INT  NOT NULL CHECK (level BETWEEN 1 AND 3),
  signer_id       TEXT REFERENCES users(id),
  signed_at       BIGINT,
  status          TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | APPROVED | REJECTED
  rejection_reason TEXT,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL,
  CONSTRAINT protocol_approvals_unique_level UNIQUE (protocol_id, level)
);

CREATE INDEX IF NOT EXISTS protocol_approvals_protocol_idx ON protocol_approvals (protocol_id);
CREATE INDEX IF NOT EXISTS protocol_approvals_signer_idx   ON protocol_approvals (signer_id);

-- Backfill (opcional): para protocolos ya APPROVED creados antes de esta migración,
-- crear una fila level=1 con el signed_by_id del protocolo para preservar trazabilidad.
-- Si el signed_by_id apunta a un user que NO existe (ej. "demo-user" de pruebas),
-- insertamos signer_id=NULL en vez de fallar — preserva el registro de aprobación.
INSERT INTO protocol_approvals (id, protocol_id, level, signer_id, signed_at, status, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  p.id,
  1,
  CASE WHEN u.id IS NOT NULL THEN p.signed_by_id ELSE NULL END,
  p.signed_at,
  CASE WHEN p.status = 'APPROVED' THEN 'APPROVED' ELSE 'PENDING' END,
  p.created_at,
  p.updated_at
FROM protocols p
LEFT JOIN users u ON u.id = p.signed_by_id
WHERE p.signed_by_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM protocol_approvals pa WHERE pa.protocol_id = p.id AND pa.level = 1);

-- RLS (asumiendo policy similar a las otras tablas — habilitar y agregar reglas básicas)
ALTER TABLE protocol_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS protocol_approvals_all ON protocol_approvals;
CREATE POLICY protocol_approvals_all ON protocol_approvals FOR ALL USING (true) WITH CHECK (true);

-- Verificación:
--   \d protocol_approvals
--   SELECT count(*) FROM protocol_approvals WHERE status='APPROVED';
