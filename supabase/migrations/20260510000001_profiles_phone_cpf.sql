-- ============================================================
-- Objetivo 2 — Phone/CPF em profiles + RLS kiwify_products
-- + RPC admin para atualizar contato de usuária
-- ============================================================

-- 1. Adiciona phone/cpf na tabela profiles (mesmos campos já em users)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS cpf   text;

COMMENT ON COLUMN public.profiles.phone IS 'Telefone/WhatsApp — espelhado de users.phone';
COMMENT ON COLUMN public.profiles.cpf   IS 'CPF — espelhado de users.cpf';

-- 2. Índice para busca de CPF normalizado (sem caracteres especiais)
-- Útil para self-reset e busca administrativa
CREATE INDEX IF NOT EXISTS idx_users_cpf
  ON public.users (cpf)
  WHERE cpf IS NOT NULL;

-- 3. RLS para kiwify_products — usuários autenticados (incluindo admins) podem ler
--    A tabela foi criada sem policies; anon/authenticated ficavam sem acesso.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'kiwify_products'
      AND policyname = 'kiwify_products_read_authenticated'
  ) THEN
    CREATE POLICY kiwify_products_read_authenticated
      ON public.kiwify_products
      FOR SELECT TO authenticated
      USING (true);
  END IF;
END;
$$;

-- Garante que RLS está habilitado (pode já estar)
ALTER TABLE IF EXISTS public.kiwify_products ENABLE ROW LEVEL SECURITY;

-- 4. RPC SECURITY DEFINER para CEO atualizar phone/cpf de qualquer usuária
--    Verifica se o chamador é admin antes de executar
CREATE OR REPLACE FUNCTION public.admin_update_user_contact(
  p_target_email text,
  p_phone        text DEFAULT NULL,
  p_cpf          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_email text;
  v_is_admin     boolean;
  v_rows_updated int;
BEGIN
  -- Obtém e-mail do chamador a partir do JWT
  SELECT au.email INTO v_caller_email
  FROM auth.users au
  WHERE au.id = auth.uid();

  -- Verifica se é admin ativo
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE email  = v_caller_email
      AND active = true
      AND role   IN ('super_admin', 'operacional')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permissão negada: apenas admins podem atualizar contato de usuárias.');
  END IF;

  -- Atualiza users
  UPDATE public.users
  SET
    phone      = COALESCE(p_phone, phone),
    cpf        = COALESCE(p_cpf, cpf),
    updated_at = now()
  WHERE email = p_target_email;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- Espelha em profiles se as colunas existirem (criadas nesta migration)
  UPDATE public.profiles
  SET
    phone      = COALESCE(p_phone, phone),
    cpf        = COALESCE(p_cpf, cpf),
    updated_at = now()
  WHERE email = p_target_email;

  -- Auditoria simples
  INSERT INTO public.audit_logs (user_name, action, entity_type, entity_id, details)
  SELECT
    v_caller_email,
    'USER_PROFILE_UPDATED_BY_ADMIN',
    'user_contact',
    p_target_email,
    jsonb_build_object(
      'phone_updated', p_phone IS NOT NULL,
      'cpf_updated',   p_cpf   IS NOT NULL,
      'updated_by',    v_caller_email
    );

  RETURN jsonb_build_object(
    'success',       true,
    'rows_updated',  v_rows_updated,
    'target_email',  p_target_email
  );
END;
$$;

COMMENT ON FUNCTION public.admin_update_user_contact IS
  'Atualiza phone/cpf de uma usuária pelo e-mail. Restrito a admin (super_admin/operacional). SECURITY DEFINER.';
