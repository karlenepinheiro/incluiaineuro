-- =============================================================================
-- schema_v30_aee_action_plans.sql
--
-- Objetivo: criar a tabela `student_aee_action_plans` para o Plano de Ação AEE.
--
-- Contexto:
--   O Plano de Ação AEE agora usa uma aba especializada dentro do dossiê do aluno
--   (AEEActionPlanTab.tsx), com checklists interativos e geração de IA baseada no PAEE.
--   Esta tabela é análoga a `student_action_plans` (usada pelo plano do professor regente),
--   mas com content_json específico para o AEE.
--
-- Rodar no SQL Editor do Supabase ou via supabase db push.
-- =============================================================================

-- ── 1. Tabela principal ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.student_aee_action_plans (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  tenant_id         UUID        NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  generated_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  generated_by_name TEXT,
  plan_type         TEXT        NOT NULL CHECK (plan_type IN ('weekly','biweekly','monthly','bimonthly','semiannual')),
  title             TEXT,

  -- Conteúdo JSONB flexível (blocos do plano AEE)
  -- Estrutura esperada:
  --   session_objective TEXT
  --   next_step         TEXT
  --   welcome_routine   JSONB[]   (items do bloco Acolhida)
  --   priority_barrier  JSONB[]
  --   session_script    JSONB[]
  --   materials         JSONB[]
  --   application_guide JSONB[]
  --   response_record   JSONB[]
  --   games_resources   JSONB[]   (opcional)
  --   videos_resources  JSONB[]   (opcional)
  --   printed_activities JSONB[]  (opcional)
  --   digital_resources JSONB[]   (opcional)
  --   dynamics_resources JSONB[]  (opcional)
  --   adaptations_guide JSONB[]   (opcional)
  content_json      JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- Snapshot das fontes usadas pela IA
  source_snapshot   JSONB,

  -- Auditoria automática (gerados por triggers abaixo)
  register_code     TEXT        UNIQUE,
  version_number    INT         NOT NULL DEFAULT 1,

  -- Soft delete
  is_archived       BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Timestamps
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Índices ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_aee_plans_student
  ON public.student_aee_action_plans (student_id, is_archived, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_aee_plans_tenant
  ON public.student_aee_action_plans (tenant_id);

-- ── 3. Trigger: register_code ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_aee_plan_register_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  seq_num INT;
BEGIN
  SELECT COUNT(*) + 1
    INTO seq_num
    FROM public.student_aee_action_plans
   WHERE student_id = NEW.student_id;

  NEW.register_code := 'AEE-' ||
    UPPER(SUBSTRING(NEW.student_id::text, 1, 6)) || '-' ||
    TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
    LPAD(seq_num::text, 3, '0');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aee_plan_register_code ON public.student_aee_action_plans;
CREATE TRIGGER trg_aee_plan_register_code
  BEFORE INSERT ON public.student_aee_action_plans
  FOR EACH ROW EXECUTE FUNCTION public.generate_aee_plan_register_code();

-- ── 4. Trigger: version_number ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_aee_plan_version_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  next_ver INT;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_ver
    FROM public.student_aee_action_plans
   WHERE student_id = NEW.student_id;

  NEW.version_number := next_ver;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aee_plan_version ON public.student_aee_action_plans;
CREATE TRIGGER trg_aee_plan_version
  BEFORE INSERT ON public.student_aee_action_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_aee_plan_version_number();

-- ── 5. Trigger: updated_at ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_aee_plan_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aee_plan_updated_at ON public.student_aee_action_plans;
CREATE TRIGGER trg_aee_plan_updated_at
  BEFORE UPDATE ON public.student_aee_action_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_aee_plan_updated_at();

-- ── 6. RLS (Row Level Security) ───────────────────────────────────────────────

ALTER TABLE public.student_aee_action_plans ENABLE ROW LEVEL SECURITY;

-- Profissional lê apenas planos do próprio tenant
DROP POLICY IF EXISTS aee_plans_select ON public.student_aee_action_plans;
CREATE POLICY aee_plans_select ON public.student_aee_action_plans
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

-- Profissional insere apenas no próprio tenant
DROP POLICY IF EXISTS aee_plans_insert ON public.student_aee_action_plans;
CREATE POLICY aee_plans_insert ON public.student_aee_action_plans
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

-- Profissional atualiza (soft delete / is_archived) apenas no próprio tenant
DROP POLICY IF EXISTS aee_plans_update ON public.student_aee_action_plans;
CREATE POLICY aee_plans_update ON public.student_aee_action_plans
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

-- ── 7. Queries de validação pós-migração ──────────────────────────────────────
-- Após rodar, execute para confirmar:

-- a) Tabela criada:
--   SELECT table_name FROM information_schema.tables WHERE table_name = 'student_aee_action_plans';

-- b) Triggers criados:
--   SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'student_aee_action_plans';

-- c) RLS ativo:
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'student_aee_action_plans';

-- d) Teste de inserção (rollback ao final):
--   BEGIN;
--   INSERT INTO public.student_aee_action_plans (student_id, tenant_id, plan_type, content_json)
--   VALUES (
--     (SELECT id FROM public.students LIMIT 1),
--     (SELECT id FROM public.tenants  LIMIT 1),
--     'monthly',
--     '{"welcome_routine":[],"priority_barrier":[],"session_script":[]}'::jsonb
--   ) RETURNING id, register_code, version_number;
--   ROLLBACK;
