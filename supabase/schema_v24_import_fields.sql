-- schema_v24_import_fields.sql
-- Suporte a importação de alunos por CSV: tabela de lotes + colunas de rastreamento.
-- Rodar APÓS schema_v23_external_student_fields.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- TABELA: import_batches
-- Registra cada operação de importação em lote realizada por um usuário.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.import_batches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  filename         TEXT,
  import_source    TEXT NOT NULL DEFAULT 'csv'
                     CHECK (import_source IN ('csv', 'ai_converter', 'api')),
  total_rows       INTEGER NOT NULL DEFAULT 0,
  imported_rows    INTEGER NOT NULL DEFAULT 0,
  error_rows       INTEGER NOT NULL DEFAULT 0,
  complete_rows    INTEGER NOT NULL DEFAULT 0,
  incomplete_rows  INTEGER NOT NULL DEFAULT 0,
  pre_reg_rows     INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'completed'
                     CHECK (status IN ('processing', 'completed', 'failed'))
);

-- RLS: cada tenant enxerga apenas seus próprios lotes
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_import_batches" ON public.import_batches;
CREATE POLICY "tenant_isolation_import_batches" ON public.import_batches
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- COLUNAS NOVAS NA TABELA students
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS import_source           TEXT DEFAULT 'manual'
    CHECK (import_source IN ('manual', 'csv', 'ai_converter')),
  ADD COLUMN IF NOT EXISTS import_batch_id         UUID
    REFERENCES public.import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS registration_status     TEXT DEFAULT 'complete'
    CHECK (registration_status IN ('pre_registered', 'incomplete', 'complete')),
  ADD COLUMN IF NOT EXISTS missing_required_fields TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_pre_registered       BOOLEAN DEFAULT FALSE;

-- Índice: filtrar alunos com cadastro incompleto (uso frequente na UI)
CREATE INDEX IF NOT EXISTS idx_students_registration_status
  ON public.students(tenant_id, registration_status)
  WHERE registration_status IN ('pre_registered', 'incomplete');

-- Índice: rastrear alunos de um lote de importação
CREATE INDEX IF NOT EXISTS idx_students_import_batch
  ON public.students(import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- Comentários descritivos
COMMENT ON COLUMN public.students.import_source IS
  'Origem do cadastro: manual (via formulário), csv (importação), ai_converter (conversor IA - futuro)';
COMMENT ON COLUMN public.students.import_batch_id IS
  'Lote de importação de origem (NULL = cadastro manual)';
COMMENT ON COLUMN public.students.registration_status IS
  'Status: complete (todos os essenciais preenchidos), incomplete (faltam alguns), pre_registered (apenas nome)';
COMMENT ON COLUMN public.students.missing_required_fields IS
  'Campos essenciais ainda ausentes, ex: ["Responsável","Telefone","Série/Ano"]';
COMMENT ON COLUMN public.students.is_pre_registered IS
  'TRUE quando importado com dados mínimos e cadastro ainda não foi completado';
