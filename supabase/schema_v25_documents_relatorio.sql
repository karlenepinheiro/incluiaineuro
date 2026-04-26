-- =============================================================================
-- schema_v25_documents_relatorio.sql
--
-- Expande o CHECK constraint de doc_type na tabela documents para aceitar
-- os tipos de relatório gerados pelo módulo de Relatório do Aluno.
--
-- Problema: a tabela documents tinha CHECK (doc_type IN ('ESTUDO_CASO','PAEE','PEI','PDI'))
-- Os saves de RELATORIO_SIMPLES, RELATORIO_COMPLETO e RELATORIO_TECNICO
-- falhavam silenciosamente com violação de constraint.
--
-- Instrução: rodar no SQL Editor do Supabase após o schema base.
-- =============================================================================

-- 1. Remove o constraint antigo (nome gerado pelo PostgreSQL)
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_doc_type_check;

-- 2. Adiciona constraint expandido com todos os tipos suportados
ALTER TABLE public.documents
  ADD CONSTRAINT documents_doc_type_check
  CHECK (doc_type IN (
    'ESTUDO_CASO',
    'PAEE',
    'PEI',
    'PDI',
    'RELATORIO_SIMPLES',
    'RELATORIO_COMPLETO',
    'RELATORIO_TECNICO'
  ));

-- 3. Índice para buscas por tipo de relatório
CREATE INDEX IF NOT EXISTS idx_documents_relatorio
  ON public.documents (tenant_id, student_id, doc_type)
  WHERE doc_type IN ('RELATORIO_SIMPLES','RELATORIO_COMPLETO','RELATORIO_TECNICO')
    AND deleted_at IS NULL;
