-- ============================================================
-- Schema v6 — Documentos para Responsáveis + Auditoria Extendida
-- Executar após schema_v5_billing.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0. Garantia da função de updated_at
--    O banco real usa update_updated_at() (definida em schema.sql).
--    Este bloco a (re)cria de forma segura caso não exista.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 1. Tabela de documentos para responsáveis / pais
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parent_documents (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id                UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_by                UUID        REFERENCES users(id),
  created_by_name           TEXT,

  -- Identificação
  document_type             TEXT        NOT NULL,
  -- Valores: checklist_4laudas | encaminhamento_redes | convite_reuniao |
  --          termo_compromisso_aee | declaracao_comparecimento |
  --          termo_desligamento | declaracao_matricula
  title                     TEXT        NOT NULL,
  template_key              TEXT,

  -- Conteúdo estruturado
  structured_data           JSONB       NOT NULL DEFAULT '{}',
  -- Armazena: campos preenchidos + respostas do checklist

  -- Ciclo de vida
  status                    TEXT        NOT NULL DEFAULT 'draft',
  -- draft | generated | printed | downloaded | signed_digitally | uploaded_signed_copy | archived

  -- Assinatura digital (canvas base64)
  signature_data            TEXT,       -- base64 PNG
  signed_at                 TIMESTAMPTZ,
  signed_by_name            TEXT,
  signed_by_role            TEXT,       -- responsavel | profissional | gestor

  -- Cópia física assinada (upload)
  uploaded_signed_file_url  TEXT,
  uploaded_signed_file_path TEXT,
  uploaded_at               TIMESTAMPTZ,

  -- Auditoria
  audit_code                TEXT        UNIQUE,
  content_hash              TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_parent_docs_tenant    ON parent_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_parent_docs_student   ON parent_documents(student_id);
CREATE INDEX IF NOT EXISTS idx_parent_docs_type      ON parent_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_parent_docs_status    ON parent_documents(status);
CREATE INDEX IF NOT EXISTS idx_parent_docs_audit     ON parent_documents(audit_code);

-- Trigger de updated_at
--   Usa update_updated_at(), que é a função real do banco (schema.sql).
--   O bloco DO garante idempotência: não recria se já existir.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_parent_docs_updated_at'
      AND tgrelid = 'parent_documents'::regclass
  ) THEN
    CREATE TRIGGER set_parent_docs_updated_at
      BEFORE UPDATE ON parent_documents
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

-- RLS
ALTER TABLE parent_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_parent_docs"   ON parent_documents;
DROP POLICY IF EXISTS "tenant_insert_parent_docs" ON parent_documents;
DROP POLICY IF EXISTS "tenant_update_parent_docs" ON parent_documents;
DROP POLICY IF EXISTS "tenant_delete_parent_docs" ON parent_documents;
DROP POLICY IF EXISTS "admin_all_parent_docs"     ON parent_documents;

CREATE POLICY "tenant_read_parent_docs" ON parent_documents
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "tenant_insert_parent_docs" ON parent_documents
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "tenant_update_parent_docs" ON parent_documents
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "tenant_delete_parent_docs" ON parent_documents
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- Política de admin: usa role = 'super_admin' (coluna real em public.users).
-- O banco NÃO possui coluna is_admin.
CREATE POLICY "admin_all_parent_docs" ON parent_documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ────────────────────────────────────────────────────────────
-- 2. Log de auditoria detalhado de ações em documentos
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_audit_log (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Referência genérica ao documento (funciona para parent_documents e documents)
  document_id       UUID        NOT NULL,
  document_table    TEXT        NOT NULL DEFAULT 'parent_documents',

  student_id        UUID        REFERENCES students(id) ON DELETE SET NULL,

  -- Ação realizada
  action            TEXT        NOT NULL,
  -- generated | viewed | printed | downloaded | signed_digitally |
  -- uploaded_signed_copy | archived | viewed_signature

  -- Executor
  performed_by      UUID        REFERENCES users(id),
  performed_by_name TEXT,

  -- Contexto adicional
  details           JSONB       DEFAULT '{}',
  -- Ex: { "ip": "...", "user_agent": "...", "audit_code": "..." }

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_audit_tenant   ON document_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doc_audit_doc      ON document_audit_log(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_audit_student  ON document_audit_log(student_id);
CREATE INDEX IF NOT EXISTS idx_doc_audit_action   ON document_audit_log(action);

ALTER TABLE document_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_doc_audit"   ON document_audit_log;
DROP POLICY IF EXISTS "tenant_insert_doc_audit" ON document_audit_log;
DROP POLICY IF EXISTS "admin_all_doc_audit"     ON document_audit_log;

CREATE POLICY "tenant_read_doc_audit" ON document_audit_log
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "tenant_insert_doc_audit" ON document_audit_log
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- Política de admin: usa role = 'super_admin' (coluna real em public.users).
CREATE POLICY "admin_all_doc_audit" ON document_audit_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ────────────────────────────────────────────────────────────
-- 3. Extensão de observation_forms com assinatura e upload
--    (migração incremental — idempotente)
-- ────────────────────────────────────────────────────────────
ALTER TABLE observation_forms ADD COLUMN IF NOT EXISTS signature_data           TEXT;
ALTER TABLE observation_forms ADD COLUMN IF NOT EXISTS signed_at                TIMESTAMPTZ;
ALTER TABLE observation_forms ADD COLUMN IF NOT EXISTS signed_by_name           TEXT;
ALTER TABLE observation_forms ADD COLUMN IF NOT EXISTS uploaded_signed_file_url TEXT;
ALTER TABLE observation_forms ADD COLUMN IF NOT EXISTS uploaded_at              TIMESTAMPTZ;

-- ────────────────────────────────────────────────────────────
-- 4. Código INEP
--    Nenhuma coluna nova necessária — o código INEP é armazenado
--    em JSONB de configurações existentes fora de public.users.
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- 5. Função auxiliar — registrar auditoria de documento
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_document_action(
  p_tenant_id      UUID,
  p_document_id    UUID,
  p_document_table TEXT,
  p_student_id     UUID,
  p_action         TEXT,
  p_user_id        UUID  DEFAULT NULL,
  p_user_name      TEXT  DEFAULT NULL,
  p_details        JSONB DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO document_audit_log (
    tenant_id, document_id, document_table, student_id,
    action, performed_by, performed_by_name, details
  )
  VALUES (
    p_tenant_id, p_document_id, p_document_table, p_student_id,
    p_action, p_user_id, p_user_name, p_details
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 6. View: documentos com status agregado por aluno (CEO / coordenação)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_parent_docs_summary AS
SELECT
  pd.tenant_id,
  pd.student_id,
  s.name        AS student_name,   -- coluna real: students.name
  pd.document_type,
  pd.title,
  pd.status,
  pd.audit_code,
  pd.signed_at,
  pd.signed_by_name,
  pd.uploaded_at,
  pd.created_by_name,
  pd.created_at,
  pd.updated_at
FROM parent_documents pd
LEFT JOIN students s ON s.id = pd.student_id
ORDER BY pd.updated_at DESC;
