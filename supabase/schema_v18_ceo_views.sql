-- =============================================================================
-- schema_v18_ceo_views.sql
-- Views e tabelas auxiliares para o Painel CEO
--
-- EXECUTAR EM: Supabase => SQL Editor => New Query => Run
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABELA admin_users (controle de acesso ao painel CEO - RBAC)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL DEFAULT 'viewer'
               CHECK (role IN ('super_admin','financeiro','operacional','comercial','suporte','auditoria','viewer')),
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_users_super_admin_all" ON public.admin_users
  FOR ALL TO authenticated
  USING (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- 2. VIEW v_ceo_subscribers
-- Agrega tenants + usuário principal + assinatura mais recente + créditos + alunos
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_ceo_subscribers AS
WITH latest_sub AS (
  SELECT DISTINCT ON (tenant_id)
    tenant_id, plan_id, status, current_period_end, provider, provider_sub_id
  FROM public.subscriptions
  ORDER BY tenant_id, created_at DESC
),
primary_user AS (
  SELECT DISTINCT ON (tenant_id)
    tenant_id, nome, email
  FROM public.users
  ORDER BY tenant_id, created_at ASC
),
student_counts AS (
  SELECT tenant_id, COUNT(*)::int AS total
  FROM public.students
  GROUP BY tenant_id
)
SELECT
  t.id                                    AS tenant_id,
  t.name                                  AS tenant_name,
  pu.nome                                 AS user_name,
  pu.email                                AS user_email,
  COALESCE(p.name, 'FREE')               AS plan_code,
  COALESCE(ls.status, 'ACTIVE')          AS subscription_status,
  ls.current_period_end                   AS next_due_date,
  COALESCE(ls.provider, 'manual')        AS billing_provider,
  COALESCE(cw.balance, 0)               AS credits_remaining,
  COALESCE(p.ai_credits_per_month, 60)  AS credits_limit,
  COALESCE(sc.total, 0)                  AS students_active,
  COALESCE(p.max_students, 5)           AS student_limit
FROM public.tenants t
LEFT JOIN primary_user     pu  ON pu.tenant_id = t.id
LEFT JOIN latest_sub       ls  ON ls.tenant_id = t.id
LEFT JOIN public.plans     p   ON p.id = COALESCE(ls.plan_id, t.plan_id)
LEFT JOIN public.credits_wallet cw ON cw.tenant_id = t.id
LEFT JOIN student_counts   sc  ON sc.tenant_id = t.id
WHERE t.is_active = true;

-- RLS: somente super_admin e admins do painel podem ler a view
-- (Views herdam RLS das tabelas base — garantir que super_admin bypassa via is_super_admin())

-- -----------------------------------------------------------------------------
-- 3. VIEW v_ceo_financial_kpis
-- KPIs financeiros consolidados para o OverviewTab
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_ceo_financial_kpis AS
WITH latest_subs AS (
  SELECT DISTINCT ON (tenant_id)
    tenant_id, plan_id, status
  FROM public.subscriptions
  ORDER BY tenant_id, created_at DESC
),
active_subs AS (
  SELECT ls.tenant_id, p.price_brl
  FROM latest_subs ls
  JOIN public.plans p ON p.id = ls.plan_id
  WHERE ls.status = 'ACTIVE' AND p.price_brl > 0
)
SELECT
  (SELECT COUNT(*) FROM latest_subs WHERE status = 'ACTIVE')::int        AS active_subscribers,
  (SELECT COUNT(*) FROM latest_subs WHERE status = 'OVERDUE')::int       AS overdue_subscribers,
  (SELECT COUNT(*) FROM latest_subs WHERE status IN ('TRIAL','INTERNAL_TEST'))::int AS trial_subscribers,
  (SELECT COUNT(*) FROM latest_subs WHERE status = 'CANCELED')::int      AS canceled_subscribers,
  (SELECT COUNT(*) FROM public.tenants WHERE is_active = true)::int      AS total_tenants,
  COALESCE((SELECT SUM(price_brl) FROM active_subs), 0)                  AS mrr_estimated;

-- -----------------------------------------------------------------------------
-- 4. TABELA kiwify_products (links de checkout Kiwify por produto)
-- Caso ainda não exista.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kiwify_products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiwify_product_id   TEXT NOT NULL UNIQUE,
  product_name        TEXT NOT NULL,
  product_type        TEXT NOT NULL CHECK (product_type IN ('subscription','credits')),
  plan_code           TEXT,
  credits_amount      INT NOT NULL DEFAULT 0,
  price_brl           NUMERIC(10,2) NOT NULL DEFAULT 0,
  checkout_url        TEXT NOT NULL DEFAULT '#',
  checkout_url_annual TEXT,          -- URL checkout ciclo anual (assinaturas)
  badge_text          TEXT,          -- ex: "Mais Popular"
  is_active           BOOLEAN NOT NULL DEFAULT true,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed inicial se tabela estiver vazia
INSERT INTO public.kiwify_products
  (kiwify_product_id, product_name, product_type, plan_code, credits_amount, price_brl, checkout_url)
VALUES
  ('pro_mensal',   'Plano PRO Mensal',    'subscription', 'PRO',    0, 99.00,  '#'),
  ('master_mensal','Plano MASTER Mensal', 'subscription', 'MASTER', 0, 147.00, '#'),
  ('credits_10',   '+10 Créditos IA',     'credits',      NULL,    10, 9.90,   '#'),
  ('credits_200',  '+200 Créditos IA',    'credits',      NULL,   200, 49.90,  '#'),
  ('credits_900',  '+900 Créditos IA',    'credits',      NULL,   900, 99.90,  '#')
ON CONFLICT (kiwify_product_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Função auxiliar: busca tenants por nome ou e-mail (para painel CEO)
-- Usada pelo CreditsTab e TestAccountsTab para busca humana (sem UUID)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ceo_search_tenants(search_term TEXT, lim INT DEFAULT 10)
RETURNS TABLE (
  tenant_id UUID, tenant_name TEXT, user_email TEXT, user_name TEXT,
  plan_code TEXT, subscription_status TEXT, credits_remaining NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    v.tenant_id, v.tenant_name, v.user_email, v.user_name,
    v.plan_code, v.subscription_status, v.credits_remaining
  FROM v_ceo_subscribers v
  WHERE
    v.tenant_name ILIKE '%' || search_term || '%'
    OR v.user_email ILIKE '%' || search_term || '%'
    OR v.user_name  ILIKE '%' || search_term || '%'
  ORDER BY v.tenant_name
  LIMIT lim;
$$;

-- =============================================================================
-- VERIFICAÇÃO PÓS-MIGRAÇÃO
-- =============================================================================
-- SELECT * FROM public.v_ceo_financial_kpis;
-- SELECT * FROM public.v_ceo_subscribers LIMIT 5;
-- SELECT * FROM public.admin_users;
-- SELECT * FROM public.kiwify_products;
