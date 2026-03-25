-- ============================================================
-- Schema v7 — Document Versions + Fix SQL error 42703
-- Executar após schema_v6_documents.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0. CORREÇÃO DO ERRO 42703
--    column "table_name" does not exist
--    ORDER BY table_name::text, constraint_name
--
-- CAUSA: A query fazia JOIN sem alias qualificado, tornando
--        a coluna table_name ambígua (existe em ambas as tabelas).
--
-- CONSULTA CORRIGIDA:
--   SELECT
--     tc.table_name,
--     tc.constraint_name,
--     tc.constraint_type,
--     kcu.column_name
--   FROM information_schema.table_constraints tc
--   LEFT JOIN information_schema.key_column_usage kcu
--     ON tc.constraint_name = kcu.constraint_name
--    AND tc.table_schema = kcu.table_schema
--   WHERE tc.table_schema = 'public'
--   ORDER BY tc.table_name, tc.constraint_name;
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- 1. Tabela de versões de documentos
--    Cada geração cria uma nova versão. Nunca sobrescreve.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_versions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id       UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_by       UUID        REFERENCES users(id),
  created_by_name  TEXT,

  -- Identificação
  document_type    TEXT        NOT NULL,
  -- Valores: checklist_4laudas | encaminhamento_redes | convite_reuniao |
  --          termo_compromisso_aee | declaracao_comparecimento |
  --          termo_desligamento | declaracao_matricula |
  --          obs_regente | escuta_familia | analise_aee |
  --          decisao_institucional | acompanhamento_evolucao

  version_number   INTEGER     NOT NULL DEFAULT 1,
  title            TEXT        NOT NULL,
  audit_code       TEXT        UNIQUE,
  content_hash     TEXT,

  -- Storage (URL quando upload para Supabase Storage)
  file_url         TEXT,
  file_path        TEXT,

  -- Conteúdo (snapshot dos dados no momento da geração)
  structured_data  JSONB       NOT NULL DEFAULT '{}',

  status           TEXT        NOT NULL DEFAULT 'generated',
  -- generated | downloaded | printed | archived

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_doc_versions_tenant   ON document_versions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doc_versions_student  ON document_versions(student_id);
CREATE INDEX IF NOT EXISTS idx_doc_versions_type     ON document_versions(document_type);
CREATE INDEX IF NOT EXISTS idx_doc_versions_audit    ON document_versions(audit_code);

-- RLS
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_doc_versions"    ON document_versions;
DROP POLICY IF EXISTS "tenant_insert_doc_versions"  ON document_versions;
DROP POLICY IF EXISTS "tenant_update_doc_versions"  ON document_versions;
DROP POLICY IF EXISTS "admin_all_doc_versions"      ON document_versions;

CREATE POLICY "tenant_read_doc_versions" ON document_versions
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "tenant_insert_doc_versions" ON document_versions
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "tenant_update_doc_versions" ON document_versions
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "admin_all_doc_versions" ON document_versions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ────────────────────────────────────────────────────────────
-- 2. Remover coluna signature_data das tabelas de documentos
--    (assinaturas existem apenas no PDF final, não no banco)
-- ────────────────────────────────────────────────────────────
-- parent_documents: manter coluna mas não mais salvar via app
-- (a coluna pode ser mantida para compatibilidade, apenas não
--  é mais preenchida pelo frontend)

-- Opcional: remover se quiser enforcement total
-- ALTER TABLE parent_documents DROP COLUMN IF EXISTS signature_data;
-- ALTER TABLE parent_documents DROP COLUMN IF EXISTS signed_at;
-- ALTER TABLE parent_documents DROP COLUMN IF EXISTS signed_by_name;
-- ALTER TABLE parent_documents DROP COLUMN IF EXISTS signed_by_role;
-- ALTER TABLE observation_forms DROP COLUMN IF EXISTS signature_data;
-- ALTER TABLE observation_forms DROP COLUMN IF EXISTS signed_at;
-- ALTER TABLE observation_forms DROP COLUMN IF EXISTS signed_by_name;

-- ────────────────────────────────────────────────────────────
-- 3. View: histórico completo de versões por aluno
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_document_versions_summary AS
SELECT
  dv.tenant_id,
  dv.student_id,
  s.name        AS student_name,
  dv.document_type,
  dv.title,
  dv.version_number,
  dv.status,
  dv.audit_code,
  dv.file_url,
  dv.created_by_name,
  dv.created_at
FROM document_versions dv
LEFT JOIN students s ON s.id = dv.student_id
ORDER BY dv.student_id, dv.document_type, dv.version_number DESC;

-- ────────────────────────────────────────────────────────────
-- 4. Verificação pós-migração (referência — não executar)
-- ────────────────────────────────────────────────────────────
/*
-- Verificar tabela document_versions
SELECT COUNT(*) FROM public.document_versions;

-- Consulta correta de constraints (sem erro 42703):
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema   = kcu.table_schema
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;
*/
