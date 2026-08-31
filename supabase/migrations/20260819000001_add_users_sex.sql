-- ============================================================
-- USER PROFILE SEX — IncluiAI
-- ============================================================
-- Tabela: public.users
-- Coluna proposta: sex
-- Tipo: text
-- Nullable: sim
-- Default: 'unspecified'
-- Valores: 'female', 'male', 'unspecified'
--
-- Impacto:
-- - Permite persistir o sexo explicitamente informado pelo assinante.
-- - Usuários existentes recebem fallback/default 'unspecified'.
-- - Não cria tabela nova e não altera créditos, Gateway, IncluiLAB ou billing.
--
-- Rollback:
-- ALTER TABLE public.users DROP COLUMN IF EXISTS sex;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS sex text DEFAULT 'unspecified';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_sex_check'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_sex_check
      CHECK (sex IS NULL OR sex IN ('female', 'male', 'unspecified'));
  END IF;
END $$;
