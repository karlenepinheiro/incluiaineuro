-- ============================================================================
-- SCHEMA V5 — Billing Completo (Asaas-ready)
-- Execute DEPOIS de: schema.sql → schema_additions.sql → schema_v3.sql → schema_v4_ceo.sql
-- Todos os comandos são idempotentes (seguros para re-executar)
-- ============================================================================

-- ============================================================================
-- 1. TABELA: plans  (garante todas as colunas do spec)
-- ============================================================================

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS code            TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS price_monthly   NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS price_yearly    NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS credits_monthly INTEGER DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_students    INTEGER DEFAULT 5;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS features_json   JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS is_active       BOOLEAN DEFAULT true;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Alias max_entities → max_students: usa o mesmo valor se max_students ainda for 0
UPDATE public.plans SET max_students = max_entities
WHERE max_students IS NULL OR max_students = 0;

-- Seed planos padrão (idempotente por code)
INSERT INTO public.plans (code, name, price_monthly, price_yearly, credits_monthly, max_students, features_json, is_active)
VALUES
  ('FREE',        'Starter (Grátis)',        0,      0,    0,    5,    '["5 alunos","Documentos básicos (PEI, PAEE, PDI)","Suporte por e-mail"]'::jsonb,                                                           true),
  ('PRO',         'Profissional',           99.00,  78.00, 50,   30,   '["30 alunos","50 créditos IA/mês","Código de auditoria","Perfil cognitivo","Suporte prioritário"]'::jsonb,                               true),
  ('MASTER',      'Master (Clínicas/Escolas)', 147.00, 118.00, 70, 999, '["999 alunos","70 créditos IA/mês","Export Word","Controle de atendimentos","VIP WhatsApp"]'::jsonb,                                   true),
  ('INSTITUTIONAL','Institucional',         297.00, 247.00, 9999, 9999,'["Alunos ilimitados","Créditos ilimitados","API dedicada","Suporte dedicado"]'::jsonb,                                                   true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. TABELA: subscriptions  (garante todos os campos do spec)
-- ============================================================================

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_id                        UUID REFERENCES auth.users(id);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_code                      TEXT DEFAULT 'FREE';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_provider               TEXT DEFAULT 'asaas';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider_customer_id           TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider_subscription_id       TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider_payment_link          TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider_update_payment_link   TEXT;  -- NOVO: link para atualizar cartão
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS current_period_start           TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS current_period_end             TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS next_due_date                  TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end           BOOLEAN DEFAULT false;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_payment_status            TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS is_test_account                BOOLEAN DEFAULT false;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS courtesy_reason                TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS updated_at                     TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Atualizar check constraint para incluir todos os status esperados
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'subscriptions' AND constraint_name = 'subscriptions_status_check'
  ) THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_status_check;
  END IF;

  ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN (
      'ACTIVE','TRIALING','PENDING','OVERDUE','CANCELED',
      'TRIAL','COURTESY','INTERNAL_TEST',
      'active','trialing','pending','overdue','canceled',
      'trial','courtesy','internal_test'
    ));
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant       ON public.subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status       ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_sub ON public.subscriptions(provider_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer     ON public.subscriptions(provider_customer_id);

-- ============================================================================
-- 3. TABELA: credits_wallet  (garante estrutura correta com credits_avail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.credits_wallet (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  balance          INTEGER NOT NULL DEFAULT 0,        -- alias legado
  credits_avail    INTEGER NOT NULL DEFAULT 0,        -- saldo disponível (preferencial)
  credits_total    INTEGER NOT NULL DEFAULT 0,        -- total concedido no ciclo
  credits_used     INTEGER NOT NULL DEFAULT 0,        -- consumido no ciclo
  reset_at         TIMESTAMP WITH TIME ZONE,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT credits_wallet_tenant_unique UNIQUE (tenant_id)
);

-- Colunas que podem estar faltando se a tabela já existia
ALTER TABLE public.credits_wallet ADD COLUMN IF NOT EXISTS credits_avail  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.credits_wallet ADD COLUMN IF NOT EXISTS credits_total  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.credits_wallet ADD COLUMN IF NOT EXISTS credits_used   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.credits_wallet ADD COLUMN IF NOT EXISTS reset_at       TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.credits_wallet ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Sincroniza balance ↔ credits_avail (mantém compatibilidade)
UPDATE public.credits_wallet SET credits_avail = balance WHERE credits_avail = 0 AND balance > 0;

CREATE INDEX IF NOT EXISTS idx_credits_wallet_tenant ON public.credits_wallet(tenant_id);

-- Trigger updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_credits_wallet_updated_at') THEN
    CREATE TRIGGER update_credits_wallet_updated_at
      BEFORE UPDATE ON public.credits_wallet
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

-- RLS
ALTER TABLE public.credits_wallet ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'credits_wallet' AND policyname = 'tenant_own_wallet'
  ) THEN
    CREATE POLICY "tenant_own_wallet" ON public.credits_wallet
      FOR ALL USING (tenant_id = public.my_tenant_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'credits_wallet' AND policyname = 'admin_all_wallet'
  ) THEN
    CREATE POLICY "admin_all_wallet" ON public.credits_wallet
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
-- 4. TABELA: credit_ledger  (corrige tipos para o spec + mantém legado)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  amount          INTEGER NOT NULL,
  description     TEXT,
  reference_type  TEXT,
  reference_id    UUID,
  created_by      UUID REFERENCES auth.users(id),
  created_by_name TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Remove constraint antiga (pode ter tipos diferentes)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'credit_ledger' AND constraint_name = 'credit_ledger_type_check'
  ) THEN
    ALTER TABLE public.credit_ledger DROP CONSTRAINT credit_ledger_type_check;
  END IF;

  -- Adiciona nova constraint com todos os tipos do spec + aliases legados
  ALTER TABLE public.credit_ledger ADD CONSTRAINT credit_ledger_type_check
    CHECK (type IN (
      'monthly_grant', 'usage_ai', 'bonus_manual', 'purchase_extra',
      'refund', 'courtesy', 'adjustment',
      -- aliases legados (schema v4)
      'renewal', 'purchase', 'bonus', 'consumption'
    ));
EXCEPTION WHEN others THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_credit_ledger_tenant  ON public.credit_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_created ON public.credit_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_type    ON public.credit_ledger(type);

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

-- ============================================================================
-- 5. TABELA: billing_events  (log idempotente de webhooks do Asaas)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.billing_events (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider                 TEXT NOT NULL DEFAULT 'asaas',
  event_type               TEXT NOT NULL,
  provider_event_id        TEXT,
  provider_payment_id      TEXT,
  provider_subscription_id TEXT,
  payload_json             JSONB DEFAULT '{}'::jsonb,
  processed                BOOLEAN DEFAULT false,
  processed_at             TIMESTAMP WITH TIME ZONE,
  error_message            TEXT,
  created_at               TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT billing_events_idempotent UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_events_provider  ON public.billing_events(provider, event_type);
CREATE INDEX IF NOT EXISTS idx_billing_events_processed ON public.billing_events(processed);
CREATE INDEX IF NOT EXISTS idx_billing_events_created   ON public.billing_events(created_at DESC);

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

-- ============================================================================
-- 6. TABELA: admin_grants  (operações manuais do CEO)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_grants (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  grant_type      TEXT NOT NULL,
  value           TEXT NOT NULL,
  reason          TEXT NOT NULL,
  granted_by      UUID REFERENCES auth.users(id),
  granted_by_name TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Remove e recria constraint para cobrir todos os tipos
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'admin_grants' AND constraint_name = 'admin_grants_type_check'
  ) THEN
    ALTER TABLE public.admin_grants DROP CONSTRAINT admin_grants_type_check;
  END IF;

  ALTER TABLE public.admin_grants ADD CONSTRAINT admin_grants_type_check
    CHECK (grant_type IN (
      'credits', 'plan_override', 'courtesy', 'test_account',
      'suspension', 'reactivation', 'bonus_manual', 'refund', 'adjustment'
    ));
EXCEPTION WHEN others THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_grants_tenant  ON public.admin_grants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_admin_grants_created ON public.admin_grants(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_grants_type    ON public.admin_grants(grant_type);

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

-- ============================================================================
-- 7. TABELA: landing_content  (editor de conteúdo da landing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.landing_content (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  section_key     TEXT NOT NULL UNIQUE,
  title           TEXT,
  subtitle        TEXT,
  content_json    JSONB DEFAULT '{}'::jsonb,
  updated_by      UUID REFERENCES auth.users(id),
  updated_by_name TEXT,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed padrão (idempotente)
INSERT INTO public.landing_content (section_key, title, subtitle, content_json) VALUES
  ('hero',
   'Plataforma Estruturada para Documentação Educacional com IA',
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
   'Tire suas dúvidas.',
   '{"items":[{"q":"O que é o IncluiAI?","a":"Plataforma SaaS para documentação educacional inclusiva com IA."},{"q":"Posso começar grátis?","a":"Sim! O plano Starter é gratuito com até 5 alunos."},{"q":"Como funcionam os créditos?","a":"Cada geração de documento consome créditos. Renovam mensalmente conforme seu plano."}]}'::jsonb),
  ('cta_bottom',
   'Comece Hoje Mesmo',
   'Junte-se a centenas de profissionais da educação inclusiva.',
   '{"button_label":"Criar conta grátis","phone":"(11) 99999-9999","whatsapp":true}'::jsonb),
  ('social_proof',
   'Confiado por Profissionais',
   'Veja o que dizem sobre a plataforma.',
   '{"count_schools":120,"count_students":3400,"count_docs":18000}'::jsonb)
ON CONFLICT (section_key) DO NOTHING;

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
-- 8. FUNÇÕES: processar eventos Asaas
-- ============================================================================

-- Pagamento aprovado / renovação
CREATE OR REPLACE FUNCTION public.process_payment_approved(
  p_tenant_id                UUID,
  p_plan_code                TEXT,
  p_credits                  INTEGER,
  p_period_end               TIMESTAMP WITH TIME ZONE,
  p_provider_subscription_id TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.tenants SET
    status_assinatura       = 'ACTIVE',
    plano_ativo             = p_plan_code,
    creditos_ia_restantes   = p_credits,
    ai_credit_limit         = p_credits,
    data_renovacao_plano    = p_period_end
  WHERE id = p_tenant_id;

  UPDATE public.subscriptions SET
    status                      = 'ACTIVE',
    plan_code                   = p_plan_code,
    current_period_end          = p_period_end,
    next_due_date               = p_period_end,
    last_payment_status         = 'paid',
    provider_subscription_id    = COALESCE(p_provider_subscription_id, provider_subscription_id),
    updated_at                  = NOW()
  WHERE tenant_id = p_tenant_id;

  INSERT INTO public.credits_wallet (tenant_id, balance, credits_avail, credits_total, reset_at)
  VALUES (p_tenant_id, p_credits, p_credits, p_credits, p_period_end)
  ON CONFLICT (tenant_id) DO UPDATE SET
    balance         = p_credits,
    credits_avail   = p_credits,
    credits_total   = p_credits,
    credits_used    = 0,
    reset_at        = p_period_end,
    updated_at      = NOW();

  INSERT INTO public.credit_ledger (tenant_id, type, amount, description, reference_type)
  VALUES (p_tenant_id, 'monthly_grant', p_credits, 'Renovação mensal — plano ' || p_plan_code, 'subscription');
END;
$$;

-- Pagamento inadimplente
CREATE OR REPLACE FUNCTION public.process_payment_overdue(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.tenants    SET status_assinatura  = 'OVERDUE' WHERE id         = p_tenant_id;
  UPDATE public.subscriptions SET status          = 'OVERDUE',
                                  last_payment_status = 'overdue',
                                  updated_at      = NOW()       WHERE tenant_id = p_tenant_id;
END;
$$;

-- Cancelamento
CREATE OR REPLACE FUNCTION public.process_subscription_canceled(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.tenants    SET status_assinatura  = 'CANCELED' WHERE id         = p_tenant_id;
  UPDATE public.subscriptions SET status          = 'CANCELED',
                                  cancel_at_period_end = true,
                                  updated_at      = NOW()       WHERE tenant_id = p_tenant_id;
END;
$$;

-- Concessão de créditos extras (CEO)
CREATE OR REPLACE FUNCTION public.grant_credits(
  p_tenant_id  UUID,
  p_amount     INTEGER,
  p_reason     TEXT,
  p_granted_by UUID DEFAULT NULL,
  p_type       TEXT DEFAULT 'bonus_manual'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.credits_wallet (tenant_id, balance, credits_avail, credits_total)
  VALUES (p_tenant_id, p_amount, p_amount, p_amount)
  ON CONFLICT (tenant_id) DO UPDATE SET
    balance       = credits_wallet.balance       + p_amount,
    credits_avail = credits_wallet.credits_avail + p_amount,
    credits_total = credits_wallet.credits_total + p_amount,
    updated_at    = NOW();

  UPDATE public.tenants
  SET creditos_ia_restantes = creditos_ia_restantes + p_amount
  WHERE id = p_tenant_id;

  INSERT INTO public.credit_ledger (tenant_id, type, amount, description, created_by)
  VALUES (p_tenant_id, p_type, p_amount, p_reason, p_granted_by);
END;
$$;

-- Debitar crédito (uso de IA)
CREATE OR REPLACE FUNCTION public.debit_credits(
  p_tenant_id UUID,
  p_amount    INTEGER,
  p_action    TEXT
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.credits_wallet SET
    balance       = GREATEST(0, balance       - p_amount),
    credits_avail = GREATEST(0, credits_avail - p_amount),
    credits_used  = credits_used + p_amount,
    updated_at    = NOW()
  WHERE tenant_id = p_tenant_id;

  UPDATE public.tenants SET
    creditos_ia_restantes = GREATEST(0, creditos_ia_restantes - p_amount)
  WHERE id = p_tenant_id;

  INSERT INTO public.credit_ledger (tenant_id, type, amount, description, reference_type)
  VALUES (p_tenant_id, 'usage_ai', -p_amount, p_action, 'ai_generation');
END;
$$;

-- ============================================================================
-- 9. VIEWS CEO (atualizadas com novos campos)
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
  sub.next_due_date,
  sub.is_test_account,
  sub.billing_provider,
  sub.provider_payment_link,
  sub.provider_update_payment_link,
  sub.provider_customer_id,
  sub.provider_subscription_id,
  t.created_at
FROM public.tenants t
LEFT JOIN public.users u          ON u.tenant_id = t.id AND u.active = true
LEFT JOIN public.subscriptions sub ON sub.tenant_id = t.id
ORDER BY t.created_at DESC;

CREATE OR REPLACE VIEW public.v_ceo_financial_kpis AS
SELECT
  COUNT(DISTINCT t.id) FILTER (WHERE t.status_assinatura = 'ACTIVE')                      AS active_subscribers,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status_assinatura = 'OVERDUE')                     AS overdue_subscribers,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status_assinatura IN ('TRIAL','INTERNAL_TEST'))    AS trial_subscribers,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status_assinatura = 'CANCELED')                    AS canceled_subscribers,
  COUNT(DISTINCT t.id)                                                                      AS total_tenants,
  COALESCE(SUM(
    CASE t.plano_ativo
      WHEN 'PRO'          THEN 99.00
      WHEN 'MASTER'       THEN 147.00
      WHEN 'INSTITUTIONAL' THEN 297.00
      ELSE 0
    END
  ) FILTER (WHERE t.status_assinatura = 'ACTIVE'), 0)                                      AS mrr_estimated
FROM public.tenants t;
