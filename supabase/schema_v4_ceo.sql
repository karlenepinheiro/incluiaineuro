-- ============================================================================
-- SCHEMA V4 — CEO Dashboard + Billing + Subscriptions + Credits + Landing
-- Execute DEPOIS de: schema.sql → schema_additions.sql → schema_v3.sql
-- Todos os comandos são idempotentes (seguros para re-executar)
-- ============================================================================

-- ============================================================================
-- 1. ESTENDER TABELA plans (colunas adicionais para o CEO)
-- ============================================================================

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS price_monthly NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS price_yearly  NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS credits_monthly INTEGER DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_entities  INTEGER DEFAULT 5;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS features_json JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS is_active     BOOLEAN DEFAULT true;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Trigger updated_at em plans
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_plans_updated_at'
  ) THEN
    CREATE TRIGGER update_plans_updated_at
      BEFORE UPDATE ON public.plans
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

-- Seed planos padrão
INSERT INTO public.plans (code, name, price_monthly, price_yearly, credits_monthly, max_entities, features_json, is_active)
SELECT 'FREE', 'Starter (Grátis)', 0, 0, 0, 5,
  '["5 alunos","Documentos básicos (PEI, PAEE, PDI)","Suporte por e-mail"]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE code = 'FREE');

INSERT INTO public.plans (code, name, price_monthly, price_yearly, credits_monthly, max_entities, features_json, is_active)
SELECT 'PRO', 'Profissional', 99.00, 78.00, 50, 30,
  '["30 alunos","50 créditos IA/mês","Código de auditoria","Perfil cognitivo","Suporte prioritário"]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE code = 'PRO');

INSERT INTO public.plans (code, name, price_monthly, price_yearly, credits_monthly, max_entities, features_json, is_active)
SELECT 'MASTER', 'Master (Clínicas/Escolas)', 147.00, 118.00, 70, 999,
  '["999 alunos","70 créditos IA/mês","Export Word","Controle de atendimentos","VIP WhatsApp"]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE code = 'MASTER');

INSERT INTO public.plans (code, name, price_monthly, price_yearly, credits_monthly, max_entities, features_json, is_active)
SELECT 'INSTITUTIONAL', 'Institucional', 297.00, 247.00, 9999, 9999,
  '["Alunos ilimitados","Créditos ilimitados","API dedicada","Suporte dedicado"]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE code = 'INSTITUTIONAL');

-- ============================================================================
-- 2. ESTENDER TABELA subscriptions (campos de gateway de pagamento)
-- ============================================================================

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_id                   UUID REFERENCES auth.users(id);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_code                 TEXT DEFAULT 'FREE';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_provider          TEXT DEFAULT 'kiwify';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider_customer_id      TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider_subscription_id  TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider_payment_link     TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS current_period_start      TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS current_period_end        TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS next_due_date             TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end      BOOLEAN DEFAULT false;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_payment_status       TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS is_test_account           BOOLEAN DEFAULT false;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS courtesy_reason           TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS updated_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Aceitar novos status no check constraint (cria novo, remove antigo se existir)
DO $$
BEGIN
  -- Remove constraint antiga se existir
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'subscriptions' AND constraint_name = 'subscriptions_status_check'
  ) THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_status_check;
  END IF;

  -- Adiciona constraint com os novos status
  ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('ACTIVE','TRIALING','PENDING','OVERDUE','CANCELED','TRIAL','COURTESY','INTERNAL_TEST'));
EXCEPTION WHEN others THEN
  NULL; -- Ignora se já existir
END $$;

-- Trigger updated_at em subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_subscriptions_updated_at'
  ) THEN
    CREATE TRIGGER update_subscriptions_updated_at
      BEFORE UPDATE ON public.subscriptions
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

-- ============================================================================
-- 3. CRIAR credit_ledger (razão/histórico de créditos)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type           TEXT NOT NULL,
  amount         INTEGER NOT NULL,
  description    TEXT,
  reference_type TEXT,
  reference_id   UUID,
  created_by     UUID REFERENCES auth.users(id),
  created_by_name TEXT,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT credit_ledger_type_check CHECK (
    type IN ('renewal','purchase','bonus','consumption','refund','adjustment')
  )
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_tenant    ON public.credit_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_created   ON public.credit_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_type      ON public.credit_ledger(type);

-- ============================================================================
-- 4. CRIAR billing_events (log de webhooks do gateway)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.billing_events (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider                 TEXT NOT NULL,
  event_type               TEXT NOT NULL,
  provider_event_id        TEXT,
  provider_payment_id      TEXT,
  provider_subscription_id TEXT,
  payload_json             JSONB DEFAULT '{}'::jsonb,
  processed                BOOLEAN DEFAULT false,
  processed_at             TIMESTAMP WITH TIME ZONE,
  error_message            TEXT,
  created_at               TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_provider   ON public.billing_events(provider, event_type);
CREATE INDEX IF NOT EXISTS idx_billing_events_processed  ON public.billing_events(processed);
CREATE INDEX IF NOT EXISTS idx_billing_events_created    ON public.billing_events(created_at DESC);

-- ============================================================================
-- 5. CRIAR admin_grants (operações manuais do CEO)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_grants (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  grant_type      TEXT NOT NULL,
  value           TEXT NOT NULL,
  reason          TEXT NOT NULL,
  granted_by      UUID REFERENCES auth.users(id),
  granted_by_name TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT admin_grants_type_check CHECK (
    grant_type IN ('credits','plan_override','courtesy','test_account','suspension','reactivation')
  )
);

CREATE INDEX IF NOT EXISTS idx_admin_grants_tenant   ON public.admin_grants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_admin_grants_created  ON public.admin_grants(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_grants_type     ON public.admin_grants(grant_type);

-- ============================================================================
-- 6. CRIAR landing_content (editor de conteúdo da landing page)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.landing_content (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  section_key      TEXT NOT NULL UNIQUE,
  title            TEXT,
  subtitle         TEXT,
  content_json     JSONB DEFAULT '{}'::jsonb,
  updated_by       UUID REFERENCES auth.users(id),
  updated_by_name  TEXT,
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed conteúdo padrão da landing
INSERT INTO public.landing_content (section_key, title, subtitle, content_json) VALUES
  ('hero',
   'Plataforma Estruturada para Documentação Educacional com Inteligência Artificial',
   'Padronização, segurança jurídica e eficiência para escolas e clínicas.',
   '{"cta_primary":"Começar Grátis","cta_secondary":"Ver Planos","badge":"Novo","badge_text":"IA Generativa integrada"}'::jsonb),
  ('features',
   'Recursos Poderosos para Educação Inclusiva',
   'Tudo que você precisa em um só lugar.',
   '{"items":["Documentação com IA","Protocolos PEI/PAEE/PDI","Auditoria com SHA256","Perfil cognitivo","Controle de atendimentos"]}'::jsonb),
  ('pricing',
   'Planos e Preços',
   'Escolha o plano ideal para sua realidade.',
   '{"show_annual":true,"annual_discount_pct":20}'::jsonb),
  ('faq',
   'Perguntas Frequentes',
   'Tire suas dúvidas sobre a plataforma.',
   '{"items":[{"q":"O que é o IncluiAI?","a":"Plataforma SaaS para documentação educacional inclusiva com IA generativa."},{"q":"Posso começar grátis?","a":"Sim! O plano Starter é gratuito com até 5 alunos."},{"q":"Como funciona os créditos de IA?","a":"Cada geração de documento consome créditos. Os créditos renovam mensalmente conforme seu plano."}]}'::jsonb),
  ('cta_bottom',
   'Comece Hoje Mesmo',
   'Junte-se a centenas de profissionais da educação inclusiva.',
   '{"button_label":"Criar conta grátis","phone":"(11) 99999-9999","whatsapp":true}'::jsonb),
  ('social_proof',
   'Confiado por Profissionais',
   'Veja o que dizem sobre a plataforma.',
   '{"count_schools":120,"count_students":3400,"count_docs":18000}'::jsonb)
ON CONFLICT (section_key) DO NOTHING;

-- ============================================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================================

-- credit_ledger
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'credit_ledger' AND policyname = 'tenant_read_credit_ledger'
  ) THEN
    CREATE POLICY "tenant_read_credit_ledger" ON public.credit_ledger
      FOR SELECT USING (tenant_id = public.my_tenant_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'credit_ledger' AND policyname = 'admin_all_credit_ledger'
  ) THEN
    CREATE POLICY "admin_all_credit_ledger" ON public.credit_ledger
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.admin_users au
          WHERE au.email = (SELECT email FROM auth.users WHERE id = auth.uid())
          AND au.active = true
        )
      );
  END IF;
END $$;

-- billing_events (admin only)
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'billing_events' AND policyname = 'admin_billing_events'
  ) THEN
    CREATE POLICY "admin_billing_events" ON public.billing_events
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.admin_users au
          WHERE au.email = (SELECT email FROM auth.users WHERE id = auth.uid())
          AND au.active = true
        )
      );
  END IF;
END $$;

-- admin_grants (tenant lê, admin escreve)
ALTER TABLE public.admin_grants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'admin_grants' AND policyname = 'tenant_read_admin_grants'
  ) THEN
    CREATE POLICY "tenant_read_admin_grants" ON public.admin_grants
      FOR SELECT USING (tenant_id = public.my_tenant_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'admin_grants' AND policyname = 'admin_write_admin_grants'
  ) THEN
    CREATE POLICY "admin_write_admin_grants" ON public.admin_grants
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.admin_users au
          WHERE au.email = (SELECT email FROM auth.users WHERE id = auth.uid())
          AND au.active = true
        )
      );
  END IF;
END $$;

-- landing_content (público lê, admin escreve)
ALTER TABLE public.landing_content ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'landing_content' AND policyname = 'public_read_landing_content'
  ) THEN
    CREATE POLICY "public_read_landing_content" ON public.landing_content
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'landing_content' AND policyname = 'admin_write_landing_content'
  ) THEN
    CREATE POLICY "admin_write_landing_content" ON public.landing_content
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.admin_users au
          WHERE au.email = (SELECT email FROM auth.users WHERE id = auth.uid())
          AND au.active = true
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 8. FUNÇÕES AUXILIARES
-- ============================================================================

-- Saldo de créditos de um tenant (soma do ledger)
CREATE OR REPLACE FUNCTION public.get_credit_balance(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(amount), 0)::INTEGER
  FROM public.credit_ledger
  WHERE tenant_id = p_tenant_id;
$$;

-- Função: processar pagamento aprovado (chamada após webhook)
CREATE OR REPLACE FUNCTION public.process_payment_approved(
  p_tenant_id UUID,
  p_plan_code TEXT,
  p_credits   INTEGER,
  p_period_end TIMESTAMP WITH TIME ZONE,
  p_provider_subscription_id TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Atualizar tenant
  UPDATE public.tenants SET
    status_assinatura = 'ACTIVE',
    plano_ativo = p_plan_code,
    creditos_ia_restantes = p_credits,
    ai_credit_limit = p_credits,
    data_renovacao_plano = p_period_end
  WHERE id = p_tenant_id;

  -- Atualizar subscription
  UPDATE public.subscriptions SET
    status = 'ACTIVE',
    plan_code = p_plan_code,
    current_period_end = p_period_end,
    next_due_date = p_period_end,
    last_payment_status = 'paid',
    provider_subscription_id = COALESCE(p_provider_subscription_id, provider_subscription_id),
    updated_at = NOW()
  WHERE tenant_id = p_tenant_id;

  -- Atualizar carteira de créditos
  UPDATE public.credits_wallet SET
    balance = p_credits,
    credits_total = p_credits,
    credits_available = p_credits,
    reset_at = p_period_end,
    updated_at = NOW()
  WHERE tenant_id = p_tenant_id;

  -- Registrar no ledger
  INSERT INTO public.credit_ledger (tenant_id, type, amount, description, reference_type)
  VALUES (p_tenant_id, 'renewal', p_credits, 'Renovação mensal — plano ' || p_plan_code, 'subscription');
END;
$$;

-- Função: marcar assinatura como inadimplente
CREATE OR REPLACE FUNCTION public.process_payment_overdue(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.tenants SET status_assinatura = 'OVERDUE' WHERE id = p_tenant_id;
  UPDATE public.subscriptions SET status = 'OVERDUE', last_payment_status = 'overdue', updated_at = NOW()
  WHERE tenant_id = p_tenant_id;
END;
$$;

-- ============================================================================
-- 9. VIEW: CEO — visão consolidada de assinantes
-- ============================================================================

CREATE OR REPLACE VIEW public.v_ceo_subscribers AS
SELECT
  t.id                          AS tenant_id,
  t.name                        AS tenant_name,
  u.nome                        AS user_name,
  u.email                       AS user_email,
  t.status_assinatura           AS subscription_status,
  t.plano_ativo                 AS plan_code,
  t.creditos_ia_restantes       AS credits_remaining,
  t.ai_credit_limit             AS credits_limit,
  t.student_limit_base          AS student_limit,
  (SELECT COUNT(*) FROM public.students s WHERE s.tenant_id = t.id AND s.active IS NOT false) AS students_active,
  s.next_due_date,
  s.is_test_account,
  s.billing_provider,
  s.provider_payment_link,
  t.created_at
FROM public.tenants t
LEFT JOIN public.users u ON u.tenant_id = t.id AND u.active = true
LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
ORDER BY t.created_at DESC;

-- ============================================================================
-- 10. VIEW: CEO — KPIs financeiros
-- ============================================================================

CREATE OR REPLACE VIEW public.v_ceo_financial_kpis AS
SELECT
  COUNT(DISTINCT t.id) FILTER (WHERE t.status_assinatura = 'ACTIVE')                    AS active_subscribers,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status_assinatura = 'OVERDUE')                   AS overdue_subscribers,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status_assinatura IN ('TRIAL','INTERNAL_TEST'))  AS trial_subscribers,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status_assinatura = 'CANCELED')                  AS canceled_subscribers,
  COUNT(DISTINCT t.id)                                                                    AS total_tenants,
  -- MRR estimado (soma dos preços mensais por plano)
  COALESCE(SUM(
    CASE t.plano_ativo
      WHEN 'PRO'         THEN 99.00
      WHEN 'MASTER'      THEN 147.00
      WHEN 'INSTITUTIONAL' THEN 297.00
      ELSE 0
    END
  ) FILTER (WHERE t.status_assinatura = 'ACTIVE'), 0)                                    AS mrr_estimated
FROM public.tenants t;
