-- Migration: catálogo de equipos calibrados + asociación con protocolos.
-- Aplicar UNA vez en Supabase.
--
-- Modelo:
--   * equipment: catálogo por proyecto. Cada equipo tiene su última y próxima
--     calibración + certificado PDF opcional en S3. Estado activo/inactivo/retirado.
--   * protocol_equipment: tabla puente protocolo ↔ equipo. Un protocolo puede usar
--     N equipos. Al firmar un protocolo, si algún equipo está descalibrado, la UI
--     bloquea la firma.

CREATE TABLE IF NOT EXISTS equipment (
  id                            TEXT PRIMARY KEY,
  project_id                    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code                          TEXT NOT NULL,                  -- Código interno: "BAL-001"
  name                          TEXT NOT NULL,                  -- "Balanza Sartorius 5kg"
  type                          TEXT NOT NULL,                  -- 'balanza' | 'prensa' | 'horno' | 'tamiz' | 'termometro' | 'otros'
  brand                         TEXT,
  model                         TEXT,
  serial                        TEXT,
  capacity                      TEXT,                           -- "5 kg" / "1000 kN" (texto libre)
  resolution                    TEXT,                           -- "0.01 g"
  last_calibration_at           BIGINT,
  next_calibration_at           BIGINT NOT NULL,
  calibration_certificate_s3    TEXT,                           -- S3 key del PDF del certificado
  status                        TEXT NOT NULL DEFAULT 'active', -- active | inactive | retired
  notes                         TEXT,
  created_at                    BIGINT NOT NULL,
  updated_at                    BIGINT NOT NULL,
  CONSTRAINT equipment_unique_code UNIQUE (project_id, code)
);

CREATE INDEX IF NOT EXISTS equipment_project_idx        ON equipment (project_id);
CREATE INDEX IF NOT EXISTS equipment_next_calib_idx     ON equipment (next_calibration_at);

CREATE TABLE IF NOT EXISTS protocol_equipment (
  id              TEXT PRIMARY KEY,
  protocol_id     TEXT NOT NULL REFERENCES protocols(id)  ON DELETE CASCADE,
  equipment_id   TEXT NOT NULL REFERENCES equipment(id),
  used_at         BIGINT NOT NULL,
  created_at      BIGINT NOT NULL,
  CONSTRAINT protocol_equipment_unique UNIQUE (protocol_id, equipment_id)
);

CREATE INDEX IF NOT EXISTS protocol_equipment_protocol_idx ON protocol_equipment (protocol_id);
CREATE INDEX IF NOT EXISTS protocol_equipment_equip_idx    ON protocol_equipment (equipment_id);

ALTER TABLE equipment           ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_equipment  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS equipment_all          ON equipment;
DROP POLICY IF EXISTS protocol_equipment_all ON protocol_equipment;

CREATE POLICY equipment_all          ON equipment          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY protocol_equipment_all ON protocol_equipment FOR ALL USING (true) WITH CHECK (true);

-- Verificación:
--   \d equipment
--   \d protocol_equipment
--   SELECT code, name, to_timestamp(next_calibration_at/1000) FROM equipment LIMIT 10;
