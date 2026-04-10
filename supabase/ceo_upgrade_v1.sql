-- ============================================================
-- ceo_upgrade_v1.sql
-- Upgrade completo do banco para o Dashboard CEO do IncluiAI.
--
-- Execute INTEIRO no Supabase SQL Editor.
-- Idempotente — seguro para rodar múltiplas vezes.
-- ============================================================


-- ============================================================
-- BLOCO A — Coluna billing_cycle em subscriptions
-- (já existe se fix_billing_v6 foi rodado; ADD IF NOT EXISTS é seguro)
-- ============================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT
  CHECK (billing_cycle IN ('monthly', 'annual'));


-- ============================================================
-- BLOCO B — Tabela ceo_coupons
-- Gerenciamento real de cupons pelo CEO.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ceo_coupons (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT        NOT NULL UNIQUE,
  description     TEXT,
  campaign_name   TEXT,                          -- ex: "Grupo WhatsApp Abril"
  plan_code       TEXT        CHECK (plan_code IN ('PRO', 'MASTER', NULL)),
  billing_cycle   TEXT        CHECK (billing_cycle IN ('monthly', 'annual', NULL)),
  discount_type   TEXT        NOT NULL DEFAULT 'percentage'
                                CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value  NUMERIC(10,2) NOT NULL DEFAULT 0,
  checkout_url_override TEXT,                    -- URL Kiwify com cupom embutido
  valid_from      TIMESTAMPTZ DEFAULT now(),
  valid_until     TIMESTAMPTZ,                   -- NULL = sem expiração
  max_uses        INT,                           -- NULL = ilimitado
  uses_count      INT         NOT NULL DEFAULT 0,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_by      TEXT,                          -- nome do admin
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ceo_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ceo_coupons_admin_all" ON public.ceo_coupons
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE INDEX IF NOT EXISTS idx_ceo_coupons_code      ON public.ceo_coupons (code);
CREATE INDEX IF NOT EXISTS idx_ceo_coupons_is_active ON public.ceo_coupons (is_active);

-- Seed: migra cupons existentes que estão hardcoded no código
INSERT INTO public.ceo_coupons (code, description, plan_code, billing_cycle, discount_type, discount_value, is_active, created_by)
VALUES
  ('INCLUIAI59', 'Cupom PRO anual — preço R$59/mês', 'PRO',    'annual',  'fixed', 59,  true, 'sistema'),
  ('INCLUIAI99', 'Cupom PREMIUM anual — preço R$99/mês', 'MASTER', 'annual', 'fixed', 99, true, 'sistema')
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- BLOCO C — Tabela admin_audit_log
-- Auditoria persistente de todas ações do painel CEO.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_name   TEXT        NOT NULL,
  admin_email  TEXT,
  admin_role   TEXT,
  action_type  TEXT        NOT NULL,
  -- Exemplos: price_change, checkout_change, coupon_create, coupon_edit,
  -- credit_adjust, plan_change, test_account_create, test_account_delete,
  -- subscriber_suspend, subscriber_reactivate, config_change, other
  target_type  TEXT,                             -- tenant / coupon / product / plan / config
  target_id    TEXT,                             -- UUID ou identificador
  target_name  TEXT,
  before_value JSONB,
  after_value  JSONB,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only: nenhum UPDATE ou DELETE permitido
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_audit_log_insert" ON public.admin_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);                             -- qualquer admin autenticado pode inserir

CREATE POLICY "admin_audit_log_select" ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at   ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action_type  ON public.admin_audit_log (action_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_email  ON public.admin_audit_log (admin_email);


-- ============================================================
-- BLOCO D — Corrigir kiwify_products
-- Dados corretos com produtos atuais e preços reais.
-- ============================================================

-- Garante todas as colunas necessárias (inclui colunas ausentes no schema original)
ALTER TABLE public.kiwify_products
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS badge_text           TEXT,
  ADD COLUMN IF NOT EXISTS billing_cycle        TEXT CHECK (billing_cycle IN ('monthly','annual')),
  ADD COLUMN IF NOT EXISTS product_key          TEXT,     -- ex: PRO_MONTHLY, MASTER_ANNUAL
  ADD COLUMN IF NOT EXISTS display_order        INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_featured          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS commercial_note      TEXT,
  ADD COLUMN IF NOT EXISTS checkout_url_annual  TEXT;

-- kiwify_purchases também não tem price_brl no schema original
-- (será preenchido pelo webhook; até lá fica NULL → coalesce para 0)
ALTER TABLE public.kiwify_purchases
  ADD COLUMN IF NOT EXISTS price_brl NUMERIC(10,2);

-- Remove seed errado se ainda existir
DELETE FROM public.kiwify_products
WHERE kiwify_product_id IN ('pro_mensal','master_mensal','credits_10','credits_200','credits_900');

-- Upsert com dados corretos
INSERT INTO public.kiwify_products
  (kiwify_product_id, product_name, product_type, plan_code, billing_cycle,
   product_key, credits_amount, price_brl, checkout_url, is_active, is_featured, display_order)
VALUES
  ('pro_monthly',      'Plano PRO Mensal',       'subscription', 'PRO',    'monthly', 'PRO_MONTHLY',    0, 79.00,  'https://pay.kiwify.com.br/xxxxxxx',  true,  false, 1),
  ('pro_annual',       'Plano PRO Anual',         'subscription', 'PRO',    'annual',  'PRO_ANNUAL',     0, 59.00,  'https://pay.kiwify.com.br/xxxxxxx',  true,  true,  2),
  ('premium_monthly',  'Plano PREMIUM Mensal',    'subscription', 'MASTER', 'monthly', 'PREMIUM_MONTHLY',0, 147.00, 'https://pay.kiwify.com.br/xxxxxxx',  true,  false, 3),
  ('premium_annual',   'Plano PREMIUM Anual',     'subscription', 'MASTER', 'annual',  'PREMIUM_ANNUAL', 0, 99.00,  'https://pay.kiwify.com.br/xxxxxxx',  true,  true,  4),
  ('credits_100',      '+100 Créditos IA',        'credits',      NULL,     NULL,      'CREDITS_100',  100, 29.90,  'https://pay.kiwify.com.br/TZltLsS',  true,  false, 5),
  ('credits_300',      '+300 Créditos IA',        'credits',      NULL,     NULL,      'CREDITS_300',  300, 79.90,  'https://pay.kiwify.com.br/H1eyllS',  true,  true,  6),
  ('credits_900',      '+900 Créditos IA',        'credits',      NULL,     NULL,      'CREDITS_900',  900, 149.90, 'https://pay.kiwify.com.br/NqCj3Ks', true,  false, 7)
ON CONFLICT (kiwify_product_id) DO UPDATE
  SET product_name   = EXCLUDED.product_name,
      plan_code      = EXCLUDED.plan_code,
      billing_cycle  = EXCLUDED.billing_cycle,
      product_key    = EXCLUDED.product_key,
      credits_amount = EXCLUDED.credits_amount,
      price_brl      = EXCLUDED.price_brl,
      display_order  = EXCLUDED.display_order,
      is_featured    = EXCLUDED.is_featured,
      updated_at     = now();


-- ============================================================
-- BLOCO E — Reconstruir v_ceo_subscribers
-- Adiciona: billing_cycle, activated_at, credits_used_cycle,
-- pouco_credito flag, vencendo_7d flag.
-- ============================================================

DROP VIEW IF EXISTS public.v_ceo_subscribers CASCADE;

CREATE OR REPLACE VIEW public.v_ceo_subscribers AS
WITH latest_sub AS (
  SELECT DISTINCT ON (tenant_id)
    tenant_id, plan_id, status, current_period_end, provider,
    provider_sub_id, billing_cycle, created_at AS sub_created_at
  FROM public.subscriptions
  ORDER BY tenant_id, created_at DESC
),
primary_user AS (
  SELECT DISTINCT ON (tenant_id)
    tenant_id, full_name, email
  FROM public.users
  ORDER BY tenant_id, created_at ASC
),
student_counts AS (
  SELECT tenant_id, COUNT(*)::int AS total
  FROM public.students
  WHERE deleted_at IS NULL
  GROUP BY tenant_id
),
-- Primeira ativação paga (para data de ativação)
first_paid AS (
  SELECT DISTINCT ON (tenant_id)
    tenant_id, activated_at
  FROM public.kiwify_purchases
  WHERE status = 'APPROVED'
    AND activated_at IS NOT NULL
    AND plan_code IS NOT NULL
  ORDER BY tenant_id, activated_at ASC
),
-- Créditos consumidos no ciclo atual (últimos 30 dias)
credits_used AS (
  SELECT tenant_id, ABS(SUM(amount))::int AS used_cycle
  FROM public.credits_ledger
  WHERE type IN ('usage_ai', 'consumption')
    AND amount < 0
    AND created_at >= (now() - INTERVAL '30 days')
  GROUP BY tenant_id
)
SELECT
  t.id                                                AS tenant_id,
  t.name                                              AS tenant_name,
  pu.full_name                                        AS user_name,
  pu.email                                            AS user_email,
  COALESCE(p.name, 'FREE')                            AS plan_code,
  COALESCE(ls.billing_cycle, 'monthly')               AS billing_cycle,
  COALESCE(ls.status, 'ACTIVE')                       AS subscription_status,
  ls.current_period_end                               AS next_due_date,
  COALESCE(ls.provider, 'manual')                     AS billing_provider,
  fp.activated_at                                     AS activated_at,
  COALESCE(cw.balance, 0)                             AS credits_remaining,
  COALESCE(p.ai_credits_per_month, 60)                AS credits_limit,
  COALESCE(cu.used_cycle, 0)                          AS credits_used_cycle,
  COALESCE(sc.total, 0)                               AS students_active,
  COALESCE(p.max_students, 5)                         AS student_limit,
  -- Flags úteis para filtros
  (COALESCE(cw.balance, 0) < 30)                      AS flag_low_credits,
  (ls.current_period_end IS NOT NULL
   AND ls.current_period_end BETWEEN now() AND now() + INTERVAL '7 days')
                                                      AS flag_expiring_7d,
  t.created_at                                        AS tenant_created_at
FROM public.tenants t
LEFT JOIN primary_user    pu  ON pu.tenant_id = t.id
LEFT JOIN latest_sub      ls  ON ls.tenant_id = t.id
LEFT JOIN public.plans    p   ON p.id = COALESCE(ls.plan_id, t.plan_id)
LEFT JOIN public.credits_wallet cw ON cw.tenant_id = t.id
LEFT JOIN student_counts  sc  ON sc.tenant_id = t.id
LEFT JOIN first_paid      fp  ON fp.tenant_id = t.id
LEFT JOIN credits_used    cu  ON cu.tenant_id = t.id
WHERE t.is_active = true;

GRANT SELECT ON public.v_ceo_subscribers TO authenticated, service_role;


-- ============================================================
-- BLOCO F — Reconstruir v_ceo_financial_kpis
-- Adiciona breakdown por plano+ciclo e receita extra.
-- ============================================================

DROP VIEW IF EXISTS public.v_ceo_financial_kpis CASCADE;

CREATE OR REPLACE VIEW public.v_ceo_financial_kpis AS
WITH latest_subs AS (
  SELECT DISTINCT ON (tenant_id)
    tenant_id, plan_id, status, billing_cycle, current_period_end
  FROM public.subscriptions
  ORDER BY tenant_id, created_at DESC
),
paid_active AS (
  SELECT
    ls.tenant_id,
    upper(p.name)           AS plan_code,
    ls.billing_cycle,
    p.price_brl             AS price
  FROM latest_subs ls
  JOIN public.plans p ON p.id = ls.plan_id
  WHERE ls.status IN ('ACTIVE', 'COURTESY', 'INTERNAL_TEST')
    AND p.price_brl > 0
),
-- Receita extra de créditos avulsos no mês atual
extra_revenue AS (
  SELECT COALESCE(SUM(kp.price_brl), 0) AS total
  FROM public.kiwify_purchases kp
  WHERE kp.status    = 'APPROVED'
    AND kp.plan_code IS NULL                -- só compras avulsas
    AND kp.activated_at >= date_trunc('month', now())
)
SELECT
  -- Totais
  (SELECT COUNT(*) FROM public.tenants WHERE is_active = true)::int
                                                  AS total_tenants,
  (SELECT COUNT(*) FROM latest_subs WHERE status IN ('ACTIVE','COURTESY','INTERNAL_TEST'))::int
                                                  AS active_subscribers,
  (SELECT COUNT(*) FROM latest_subs WHERE status = 'OVERDUE')::int
                                                  AS overdue_subscribers,
  (SELECT COUNT(*) FROM latest_subs WHERE status IN ('TRIAL','INTERNAL_TEST'))::int
                                                  AS trial_subscribers,
  (SELECT COUNT(*) FROM latest_subs WHERE status = 'CANCELED')::int
                                                  AS canceled_subscribers,

  -- Breakdown por plano + ciclo
  (SELECT COUNT(*) FROM paid_active WHERE plan_code = 'FREE')::int
                                                  AS free_count,
  (SELECT COUNT(*) FROM paid_active WHERE plan_code = 'PRO'    AND billing_cycle = 'monthly')::int
                                                  AS pro_monthly_count,
  (SELECT COUNT(*) FROM paid_active WHERE plan_code = 'PRO'    AND billing_cycle = 'annual')::int
                                                  AS pro_annual_count,
  (SELECT COUNT(*) FROM paid_active WHERE plan_code IN ('MASTER','PREMIUM') AND billing_cycle = 'monthly')::int
                                                  AS premium_monthly_count,
  (SELECT COUNT(*) FROM paid_active WHERE plan_code IN ('MASTER','PREMIUM') AND billing_cycle = 'annual')::int
                                                  AS premium_annual_count,

  -- MRR por segmento (mensal = price, anual = price * 12 / 12 = price)
  COALESCE((SELECT SUM(price) FROM paid_active WHERE plan_code = 'PRO'    AND billing_cycle = 'monthly'), 0)
                                                  AS mrr_pro_monthly,
  COALESCE((SELECT SUM(price) FROM paid_active WHERE plan_code = 'PRO'    AND billing_cycle = 'annual'), 0)
                                                  AS mrr_pro_annual,
  COALESCE((SELECT SUM(price) FROM paid_active WHERE plan_code IN ('MASTER','PREMIUM') AND billing_cycle = 'monthly'), 0)
                                                  AS mrr_premium_monthly,
  COALESCE((SELECT SUM(price) FROM paid_active WHERE plan_code IN ('MASTER','PREMIUM') AND billing_cycle = 'annual'), 0)
                                                  AS mrr_premium_annual,
  COALESCE((SELECT SUM(price) FROM paid_active), 0)
                                                  AS mrr_estimated,

  -- Receita extra (créditos avulsos) no mês atual
  (SELECT total FROM extra_revenue)               AS extra_revenue_mtd,

  -- Contagens de risco
  (SELECT COUNT(*) FROM public.credits_wallet WHERE balance < 30)::int
                                                  AS low_credit_count,
  (SELECT COUNT(*) FROM latest_subs WHERE
     current_period_end IS NOT NULL
     AND current_period_end BETWEEN now() AND now() + INTERVAL '7 days'
  )::int                                          AS expiring_7d_count;

GRANT SELECT ON public.v_ceo_financial_kpis TO authenticated, service_role;


-- ============================================================
-- BLOCO G — RPC ceo_get_kpis
-- Uma única chamada retorna tudo que o OverviewTab precisa.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ceo_get_kpis()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT * INTO v_row FROM public.v_ceo_financial_kpis;
  RETURN to_jsonb(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ceo_get_kpis() TO authenticated, service_role;


-- ============================================================
-- BLOCO H — RPC ceo_log_action (persistência de auditoria admin)
-- ============================================================

CREATE OR REPLACE FUNCTION public.ceo_log_action(
  p_admin_name    TEXT,
  p_admin_email   TEXT,
  p_admin_role    TEXT,
  p_action_type   TEXT,
  p_target_type   TEXT DEFAULT NULL,
  p_target_id     TEXT DEFAULT NULL,
  p_target_name   TEXT DEFAULT NULL,
  p_before_value  JSONB DEFAULT NULL,
  p_after_value   JSONB DEFAULT NULL,
  p_description   TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_audit_log
    (admin_name, admin_email, admin_role, action_type,
     target_type, target_id, target_name,
     before_value, after_value, description)
  VALUES
    (p_admin_name, p_admin_email, p_admin_role, p_action_type,
     p_target_type, p_target_id, p_target_name,
     p_before_value, p_after_value, p_description);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ceo_log_action(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB,TEXT)
  TO authenticated, service_role;


-- ============================================================
-- BLOCO I — Índices de performance para queries CEO
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_created
  ON public.subscriptions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.subscriptions (status);

CREATE INDEX IF NOT EXISTS idx_kiwify_purchases_tenant_plan
  ON public.kiwify_purchases (tenant_id, plan_code, activated_at DESC)
  WHERE status = 'APPROVED';

CREATE INDEX IF NOT EXISTS idx_credits_ledger_tenant_type_date
  ON public.credits_ledger (tenant_id, type, created_at DESC)
  WHERE amount < 0;

CREATE INDEX IF NOT EXISTS idx_credits_wallet_balance
  ON public.credits_wallet (balance)
  WHERE balance < 30;


-- ============================================================
-- BLOCO J — Verificação final
-- ============================================================

-- 1. KPIs gerais
SELECT * FROM public.v_ceo_financial_kpis;

-- 2. Amostra de assinantes com novos campos
SELECT
  tenant_name, user_email, plan_code, billing_cycle,
  subscription_status, credits_remaining, flag_low_credits,
  flag_expiring_7d, activated_at
FROM public.v_ceo_subscribers
LIMIT 10;

-- 3. Produtos Kiwify atualizados
SELECT kiwify_product_id, product_name, billing_cycle, price_brl, is_active
FROM public.kiwify_products ORDER BY display_order;

-- 4. Cupons
SELECT code, plan_code, billing_cycle, discount_value, is_active, campaign_name
FROM public.ceo_coupons ORDER BY created_at;

-- 5. Teste RPC
SELECT public.ceo_get_kpis();
