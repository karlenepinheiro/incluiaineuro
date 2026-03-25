-- =============================================================================
-- schema_service_records.sql
-- Tabela de controle de atendimentos (ServiceControlView)
-- Execute após schema.sql + schema_additions.sql + schema_v3.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS service_records (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id    UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name  TEXT        NOT NULL,
  date          DATE        NOT NULL,
  type          TEXT        NOT NULL,          -- AEE | Psicologia | Fonoaudiologia | etc.
  professional  TEXT        NOT NULL,
  duration      INTEGER     NOT NULL DEFAULT 50, -- minutos
  observation   TEXT        NOT NULL DEFAULT '',
  attendance    TEXT        NOT NULL DEFAULT 'Presente', -- Presente | Falta | Reposição
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_records_tenant
  ON service_records (tenant_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_service_records_student
  ON service_records (student_id);

ALTER TABLE service_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_records_tenant_access"
  ON service_records FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );
