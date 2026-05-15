-- ============================================================
-- PASSWORD RESET SYSTEM — Sprint Estabilização Kiwify/CEO
-- ============================================================
-- Adiciona suporte a:
--   1. Campo must_change_password (forçar troca no próximo login)
--   2. Campos phone/cpf para recuperação self-service
--   3. Tabela de rate-limiting de tentativas de reset
--   4. Política de UPDATE para o próprio usuário limpar a flag

-- 1. Estende a tabela users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_change_password  boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_changed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS phone                 text,
  ADD COLUMN IF NOT EXISTS cpf                   text;

-- 2. Tabela de rate-limiting (somente service_role — edge functions)
CREATE TABLE IF NOT EXISTS public.password_reset_attempts (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier   text        NOT NULL,
  ip_address   text,
  success      boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pra_identifier_created
  ON public.password_reset_attempts (identifier, created_at DESC);

ALTER TABLE public.password_reset_attempts ENABLE ROW LEVEL SECURITY;
-- Sem políticas → apenas service_role (edge functions) tem acesso

-- 3. Política UPDATE para o próprio usuário limpar must_change_password após troca
-- (usando DO para ser idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'users'
      AND policyname = 'users_self_update_password_flag'
  ) THEN
    CREATE POLICY users_self_update_password_flag ON public.users
      FOR UPDATE
      USING     (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END;
$$;

-- 4. Comentários de documentação
COMMENT ON COLUMN public.users.must_change_password IS
  'true = usuário deve trocar senha no próximo login (setado por admin via admin-reset-password edge function)';
COMMENT ON COLUMN public.users.password_changed_at IS
  'última vez que o usuário trocou a senha manualmente';
COMMENT ON COLUMN public.users.phone IS
  'telefone para verificação no fluxo self-service de recuperação de senha';
COMMENT ON COLUMN public.users.cpf IS
  'CPF para verificação no fluxo self-service de recuperação de senha';
COMMENT ON TABLE public.password_reset_attempts IS
  'rate-limiting de tentativas de reset de senha — gerenciado exclusivamente pelas edge functions via service_role';
