-- =============================================================================
-- schema_v19_ceo_ops.sql
-- Correções e adições para o Painel CEO
--
-- EXECUTAR EM: Supabase => SQL Editor => New Query => Run
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RLS: admin_users — allow each admin to read their own row
--    (a policy existente só permite super_admin via is_super_admin())
--    Adicionamos policy de self-select para que qualquer admin autenticado
--    possa carregar sua própria linha sem precisar ser super_admin.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_users' AND schemaname = 'public'
      AND policyname = 'admin_users_self_select'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "admin_users_self_select" ON public.admin_users
        FOR SELECT TO authenticated
        USING (
          email = (
            SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1
          )
        )
    $pol$;
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 2. Função RPC: ensure_user_profile()
--    Fallback para criar perfil de usuários OAuth (Google) cujo trigger
--    não disparou (ex: usuário criado antes da migration v17, ou falha silenciosa).
--    Chamada pelo frontend após login OAuth quando getUserProfile retorna null.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_auth_user     RECORD;
  v_tenant_id     UUID;
  v_free_plan_id  UUID;
  v_nome          TEXT;
  v_already       BOOLEAN;
BEGIN
  -- Pega os dados do usuário auth
  SELECT id, email, raw_user_meta_data
  INTO v_auth_user
  FROM auth.users
  WHERE id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'error', 'msg', 'auth user not found');
  END IF;

  -- Verifica se o perfil já existe
  SELECT EXISTS(SELECT 1 FROM public.users WHERE id = v_auth_user.id) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('status', 'exists');
  END IF;

  -- Extrai nome do metadata OAuth
  v_nome := COALESCE(
    NULLIF(TRIM(v_auth_user.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(v_auth_user.raw_user_meta_data->>'name'), ''),
    split_part(v_auth_user.email, '@', 1),
    'Usuario'
  );

  -- Resolve FREE plan
  SELECT id INTO v_free_plan_id FROM public.plans WHERE UPPER(name) = 'FREE' LIMIT 1;

  -- Cria tenant
  INSERT INTO public.tenants (name, plan_id, is_active)
  VALUES ('Escola de ' || v_nome, v_free_plan_id, true)
  RETURNING id INTO v_tenant_id;

  -- Cria perfil do usuário
  INSERT INTO public.users (id, tenant_id, nome, full_name, email, role, is_super_admin, is_active)
  VALUES (v_auth_user.id, v_tenant_id, v_nome, v_nome, v_auth_user.email, 'DOCENTE', false, true)
  ON CONFLICT (id) DO NOTHING;

  -- Carteira com 60 créditos iniciais
  INSERT INTO public.credits_wallet (tenant_id, balance)
  VALUES (v_tenant_id, 60)
  ON CONFLICT (tenant_id) DO UPDATE SET balance = GREATEST(public.credits_wallet.balance, 60);

  -- Assinatura FREE
  INSERT INTO public.subscriptions (tenant_id, plan_id, status, provider)
  VALUES (v_tenant_id, v_free_plan_id, 'ACTIVE', 'NONE')
  ON CONFLICT DO NOTHING;

  -- Ledger inicial
  INSERT INTO public.credits_ledger (tenant_id, amount, type, description)
  VALUES (v_tenant_id, 60, 'courtesy', 'Créditos iniciais plano FREE')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('status', 'created', 'tenant_id', v_tenant_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('status', 'error', 'msg', SQLERRM);
END;
$$;

-- Grant para usuários autenticados chamarem a função
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;


-- -----------------------------------------------------------------------------
-- 3. Seed landing_content com seções padrão (se a tabela estiver vazia)
-- -----------------------------------------------------------------------------
INSERT INTO public.landing_content (section_key, title, subtitle, content_json)
VALUES
  (
    'hero',
    'Plataforma Estruturada para Documentação Educacional com Inteligência Artificial',
    'Padronização, segurança jurídica e eficiência para escolas e clínicas.',
    '{"cta_primary": "Começar Grátis", "cta_secondary": "Ver Planos", "phone": "(11) 99999-9999", "hero_image": ""}'
  ),
  (
    'pricing',
    'Planos e Preços',
    'Escolha o melhor plano para o seu trabalho.',
    '{"pro_monthly": 99, "pro_annual": 78, "master_monthly": 147, "master_annual": 118, "extra_student": 14.90, "extra_credits_10": 9.90, "kiwify_pro_monthly_url": "#", "kiwify_pro_annual_url": "#", "kiwify_master_monthly_url": "#", "kiwify_master_annual_url": "#", "kiwify_credits10_url": "#", "kiwify_credits200_url": "#", "kiwify_credits900_url": "#"}'
  ),
  (
    'features',
    'Funcionalidades',
    'Tudo que você precisa para documentação de qualidade.',
    '{"items": []}'
  ),
  (
    'faq',
    'Perguntas Frequentes',
    'Tire suas dúvidas sobre a plataforma.',
    '{"items": [{"q": "O que é o IncluiAI?", "a": "Uma plataforma de IA para educadores e clínicos que trabalham com estudantes neurodivergentes."}, {"q": "Posso testar grátis?", "a": "Sim! O plano FREE inclui 60 créditos de IA por mês e suporte a até 5 alunos."}]}'
  ),
  (
    'social_proof',
    'Depoimentos',
    'O que nossos usuários dizem.',
    '{"items": []}'
  )
ON CONFLICT (section_key) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 4. billing_events: garante índices úteis para o painel CEO
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_billing_events_provider ON public.billing_events (provider);
CREATE INDEX IF NOT EXISTS idx_billing_events_processed ON public.billing_events (processed);
CREATE INDEX IF NOT EXISTS idx_billing_events_created_at ON public.billing_events (created_at DESC);


-- -----------------------------------------------------------------------------
-- 5. kiwify_products: garante índice para listagem ativa
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_kiwify_products_active ON public.kiwify_products (is_active);


-- -----------------------------------------------------------------------------
-- 6. audit_logs: adiciona coluna admin_email para rastreabilidade
--    (sem quebrar schema existente — ADD COLUMN IF NOT EXISTS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS admin_email TEXT;


-- =============================================================================
-- VERIFICAÇÃO PÓS-MIGRAÇÃO
-- =============================================================================
-- SELECT * FROM pg_policies WHERE tablename = 'admin_users';
-- SELECT public.ensure_user_profile();   -- deve retornar {"status":"exists"} ou {"status":"created"}
-- SELECT * FROM public.landing_content ORDER BY section_key;
-- SELECT * FROM public.billing_events ORDER BY created_at DESC LIMIT 10;