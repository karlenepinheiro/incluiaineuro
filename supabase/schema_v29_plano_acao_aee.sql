-- =============================================================================
-- schema_v29_plano_acao_aee.sql
--
-- Objetivo: adicionar PLANO_ACAO_AEE ao CHECK constraint da tabela documents.
--
-- Contexto: o Plano de Ação AEE foi movido para dentro do dossiê do aluno.
-- Quando salvo via DocumentBuilder, o doc_type enviado é 'PLANO_ACAO_AEE'.
-- O constraint anterior não permitia esse valor, causando:
--   "new row for relation "documents" violates check constraint
--    "documents_doc_type_check""
--
-- Esta migration:
--   1. Remove o constraint existente (idempotente — IF EXISTS).
--   2. Recria com todos os tipos históricos + PLANO_ACAO_AEE.
--   3. Não altera nem remove nenhum documento existente.
--
-- Rodar no SQL Editor do Supabase (painel web) ou via supabase db push.
-- =============================================================================

-- ── 1. Verificação prévia (informativo — não bloqueia) ────────────────────────
-- Você pode rodar esta query antes para ver o estado atual:
--
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM   pg_constraint
--   WHERE  conrelid = 'public.documents'::regclass
--     AND  contype  = 'c';
--
-- E esta para ver os doc_type já salvos:
--
--   SELECT doc_type, COUNT(*) AS total
--   FROM   public.documents
--   GROUP  BY doc_type
--   ORDER  BY total DESC;

-- ── 2. Remove constraint antiga ───────────────────────────────────────────────
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_doc_type_check;

-- ── 3. Recria com todos os tipos permitidos ───────────────────────────────────
ALTER TABLE public.documents
  ADD CONSTRAINT documents_doc_type_check
  CHECK (doc_type IN (
    -- Tipos originais
    'ESTUDO_CASO',
    'PAEE',
    'PEI',
    'PDI',
    -- Tipos de relatório (adicionados em v25 / v27)
    'RELATORIO_SIMPLES',
    'RELATORIO_COMPLETO',
    'RELATORIO_TECNICO',
    -- Plano de Ação AEE (adicionado em v29)
    'PLANO_ACAO_AEE'
  ));

-- ── 4. Índice para buscas por aluno + tipo ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_documents_plano_acao_aee
  ON public.documents (tenant_id, student_id, doc_type)
  WHERE doc_type = 'PLANO_ACAO_AEE'
    AND deleted_at IS NULL;

-- ── 5. Queries de validação pós-migração ──────────────────────────────────────
-- Após rodar, execute para confirmar:

-- a) Verificar constraint atualizada:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM   pg_constraint
--   WHERE  conrelid = 'public.documents'::regclass
--     AND  contype  = 'c'
--     AND  conname  = 'documents_doc_type_check';

-- b) Testar inserção de teste (rollback ao final):
--   BEGIN;
--   INSERT INTO public.documents (tenant_id, student_id, doc_type, title, status, structured_data)
--   VALUES (
--     (SELECT id FROM public.tenants LIMIT 1),
--     (SELECT id FROM public.students LIMIT 1),
--     'PLANO_ACAO_AEE',
--     'Teste Plano de Ação AEE',
--     'DRAFT',
--     '{"sections":[]}'::jsonb
--   );
--   ROLLBACK;

-- c) Confirmar tipos existentes na tabela:
--   SELECT doc_type, COUNT(*) AS total
--   FROM   public.documents
--   WHERE  deleted_at IS NULL
--   GROUP  BY doc_type
--   ORDER  BY total DESC;
