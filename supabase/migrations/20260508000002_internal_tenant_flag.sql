-- ============================================================
-- 20260508000002_internal_tenant_flag.sql
--
-- Exclui contas administrativas/CEO de todas as métricas do
-- painel CEO (assinantes, MRR, conversão, créditos em risco).
--
-- CONTAS EXCLUÍDAS (is_internal = true):
--   - qualquer email @incluiai.com
--   - karlenespinheiro@gmail.com  (conta fundadora/admin)
--   - tenants com subscription status INTERNAL_TEST
--   - tenants marcados manualmente via is_internal = true
--
-- O QUE ESTE SCRIPT FAZ (idempotente):
--   A. Adiciona coluna is_internal em tenants
--   B. Cria função helper is_internal_email()
--   C. Marca contas internas já existentes no banco
--   D. Trigger: auto-marca novos usuários @incluiai.com
--   E. Reconstrói v_ceo_subscribers   (exclui is_internal)
--   F. Reconstrói v_ceo_financial_kpis (exclui is_internal)
--   G. Recria ceo_search_tenants (dependência da view)
-- ============================================================


-- ============================================================
-- A. Coluna is_internal em tenants
-- ============================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tenants_is_internal
  ON public.tenants (is_internal)
  WHERE is_internal = true;

COMMENT ON COLUMN public.tenants.is_internal IS
  'true = conta interna/admin/teste; excluída de todas as métricas CEO.';


-- ============================================================
-- B. Função helper: detecta emails internos
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_internal_email(p_email text)
RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT
SET search_path = public
AS $$
  SELECT (
    lower(trim(p_email)) LIKE '%@incluiai.com'
    OR lower(trim(p_email)) = 'karlenespinheiro@gmail.com'
  );
$$;

COMMENT ON FUNCTION public.is_internal_email(text) IS
  'Retorna true para emails de contas internas/admin que devem ser excluídas das métricas.';


-- ============================================================
-- C. Marcar contas internas existentes
-- ============================================================

-- Por email de usuário vinculado ao tenant
UPDATE public.tenants t
SET    is_internal = true
WHERE  NOT t.is_internal
  AND  EXISTS (
    SELECT 1 FROM public.users u
    WHERE  u.tenant_id = t.id
      AND  public.is_internal_email(u.email)
  );

-- Por subscription INTERNAL_TEST (contas de teste do CEO)
UPDATE public.tenants t
SET    is_internal = true
WHERE  NOT t.is_internal
  AND  EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE  s.tenant_id = t.id
      AND  s.status = 'INTERNAL_TEST'
  );


-- ============================================================
-- D. Trigger: auto-marca novos usuários @incluiai.com
-- ============================================================

CREATE OR REPLACE FUNCTION public.trg_mark_internal_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NOT NULL AND public.is_internal_email(NEW.email) THEN
    UPDATE public.tenants
    SET    is_internal = true
    WHERE  id = NEW.tenant_id
      AND  NOT is_internal;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_mark_internal ON public.users;
CREATE TRIGGER trg_users_mark_internal
  AFTER INSERT OR UPDATE OF email ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_mark_internal_tenant();


-- ============================================================
-- E. Reconstruir v_ceo_subscribers (exclui is_internal)
-- CASCADE remove ceo_search_tenants — recriado em G.
-- ============================================================

DROP VIEW IF EXISTS public.v_ceo_subscribers CASCADE;

CREATE OR REPLACE VIEW public.v_ceo_subscribers AS
WITH latest_sub AS (
  -- Apenas assinaturas de tenants reais (não internos, não INTERNAL_TEST)
  SELECT DISTINCT ON (s.tenant_id)
    s.tenant_id, s.plan_id, s.status, s.current_period_end, s.provider,
    s.provider_sub_id, s.billing_cycle, s.created_at AS sub_created_at
  FROM public.subscriptions s
  JOIN public.tenants t ON t.id = s.tenant_id
  WHERE NOT COALESCE(t.is_internal, false)
    AND s.status != 'INTERNAL_TEST'
  ORDER BY s.tenant_id, s.created_at DESC
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
first_paid AS (
  SELECT DISTINCT ON (kp.tenant_id)
    kp.tenant_id, kp.activated_at
  FROM public.kiwify_purchases kp
  JOIN public.tenants t ON t.id = kp.tenant_id
  WHERE kp.status       = 'APPROVED'
    AND kp.activated_at IS NOT NULL
    AND kp.plan_code    IS NOT NULL
    AND NOT COALESCE(t.is_internal, false)
  ORDER BY kp.tenant_id, kp.activated_at ASC
),
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
  (COALESCE(cw.balance, 0) < 30)                      AS flag_low_credits,
  (ls.current_period_end IS NOT NULL
   AND ls.current_period_end BETWEEN now() AND now() + INTERVAL '7 days')
                                                      AS flag_expiring_7d,
  t.created_at                                        AS tenant_created_at
FROM public.tenants t
LEFT JOIN primary_user      pu  ON pu.tenant_id = t.id
LEFT JOIN latest_sub        ls  ON ls.tenant_id = t.id
LEFT JOIN public.plans      p   ON p.id = COALESCE(ls.plan_id, t.plan_id)
LEFT JOIN public.credits_wallet cw ON cw.tenant_id = t.id
LEFT JOIN student_counts    sc  ON sc.tenant_id = t.id
LEFT JOIN first_paid        fp  ON fp.tenant_id = t.id
LEFT JOIN credits_used      cu  ON cu.tenant_id = t.id
WHERE t.is_active = true
  AND NOT COALESCE(t.is_internal, false);

GRANT SELECT ON public.v_ceo_subscribers TO authenticated, service_role;


-- ============================================================
-- F. Reconstruir v_ceo_financial_kpis (exclui is_internal)
-- ============================================================

DROP VIEW IF EXISTS public.v_ceo_financial_kpis CASCADE;

CREATE OR REPLACE VIEW public.v_ceo_financial_kpis AS
WITH latest_subs AS (
  -- Exclui tenants internos e qualquer subscription INTERNAL_TEST
  SELECT DISTINCT ON (s.tenant_id)
    s.tenant_id, s.plan_id, s.status, s.billing_cycle, s.current_period_end
  FROM public.subscriptions s
  JOIN public.tenants t ON t.id = s.tenant_id
  WHERE NOT COALESCE(t.is_internal, false)
    AND s.status != 'INTERNAL_TEST'
  ORDER BY s.tenant_id, s.created_at DESC
),
paid_active AS (
  SELECT
    ls.tenant_id,
    upper(p.name)     AS plan_code,
    ls.billing_cycle,
    p.price_brl       AS price
  FROM latest_subs ls
  JOIN public.plans p ON p.id = ls.plan_id
  WHERE ls.status IN ('ACTIVE', 'COURTESY')
    AND p.price_brl > 0
),
-- Receita extra de créditos avulsos no mês — sem contas internas
extra_revenue AS (
  SELECT COALESCE(SUM(kp.price_brl), 0) AS total
  FROM public.kiwify_purchases kp
  LEFT JOIN public.tenants t ON t.id = kp.tenant_id
  WHERE kp.status       = 'APPROVED'
    AND kp.plan_code    IS NULL
    AND kp.activated_at >= date_trunc('month', now())
    AND NOT COALESCE(t.is_internal, false)
)
SELECT
  -- Total de tenants reais ativos
  (SELECT COUNT(*) FROM public.tenants
   WHERE is_active = true
     AND NOT COALESCE(is_internal, false))::int       AS total_tenants,

  -- Contagens por status
  (SELECT COUNT(*) FROM latest_subs
   WHERE status IN ('ACTIVE','COURTESY'))::int         AS active_subscribers,
  (SELECT COUNT(*) FROM latest_subs
   WHERE status = 'OVERDUE')::int                      AS overdue_subscribers,
  (SELECT COUNT(*) FROM latest_subs
   WHERE status = 'TRIAL')::int                        AS trial_subscribers,
  (SELECT COUNT(*) FROM latest_subs
   WHERE status = 'CANCELED')::int                     AS canceled_subscribers,

  -- Breakdown por plano + ciclo
  (SELECT COUNT(*) FROM paid_active WHERE plan_code = 'FREE')::int
                                                       AS free_count,
  (SELECT COUNT(*) FROM paid_active
   WHERE plan_code = 'PRO'    AND billing_cycle = 'monthly')::int
                                                       AS pro_monthly_count,
  (SELECT COUNT(*) FROM paid_active
   WHERE plan_code = 'PRO'    AND billing_cycle = 'annual')::int
                                                       AS pro_annual_count,
  (SELECT COUNT(*) FROM paid_active
   WHERE plan_code IN ('MASTER','PREMIUM') AND billing_cycle = 'monthly')::int
                                                       AS premium_monthly_count,
  (SELECT COUNT(*) FROM paid_active
   WHERE plan_code IN ('MASTER','PREMIUM') AND billing_cycle = 'annual')::int
                                                       AS premium_annual_count,

  -- MRR por segmento
  COALESCE((SELECT SUM(price) FROM paid_active
            WHERE plan_code = 'PRO' AND billing_cycle = 'monthly'), 0)
                                                       AS mrr_pro_monthly,
  COALESCE((SELECT SUM(price) FROM paid_active
            WHERE plan_code = 'PRO' AND billing_cycle = 'annual'), 0)
                                                       AS mrr_pro_annual,
  COALESCE((SELECT SUM(price) FROM paid_active
            WHERE plan_code IN ('MASTER','PREMIUM') AND billing_cycle = 'monthly'), 0)
                                                       AS mrr_premium_monthly,
  COALESCE((SELECT SUM(price) FROM paid_active
            WHERE plan_code IN ('MASTER','PREMIUM') AND billing_cycle = 'annual'), 0)
                                                       AS mrr_premium_annual,
  COALESCE((SELECT SUM(price) FROM paid_active), 0)   AS mrr_estimated,

  -- Receita extra (créditos avulsos) no mês
  (SELECT total FROM extra_revenue)                    AS extra_revenue_mtd,

  -- Contagens de risco (sem contas internas)
  (SELECT COUNT(*) FROM public.credits_wallet cw
   JOIN public.tenants t ON t.id = cw.tenant_id
   WHERE cw.balance < 30
     AND t.is_active = true
     AND NOT COALESCE(t.is_internal, false))::int      AS low_credit_count,

  (SELECT COUNT(*) FROM latest_subs
   WHERE current_period_end IS NOT NULL
     AND current_period_end BETWEEN now() AND now() + INTERVAL '7 days')::int
                                                       AS expiring_7d_count;

GRANT SELECT ON public.v_ceo_financial_kpis TO authenticated, service_role;


-- ============================================================
-- G. Recriar ceo_search_tenants (dependência da view E)
-- ============================================================

CREATE OR REPLACE FUNCTION public.ceo_search_tenants(
  search_term text,
  lim         int DEFAULT 10
)
RETURNS TABLE (
  tenant_id           uuid,
  tenant_name         text,
  user_email          text,
  user_name           text,
  plan_code           text,
  subscription_status text,
  credits_remaining   numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.tenant_id, v.tenant_name, v.user_email, v.user_name,
    v.plan_code, v.subscription_status, v.credits_remaining
  FROM v_ceo_subscribers v
  WHERE v.tenant_name ILIKE '%' || search_term || '%'
     OR v.user_email  ILIKE '%' || search_term || '%'
     OR v.user_name   ILIKE '%' || search_term || '%'
  ORDER BY v.tenant_name
  LIMIT lim;
$$;

GRANT EXECUTE ON FUNCTION public.ceo_search_tenants(text, int)
  TO authenticated, service_role;


-- ============================================================
-- VERIFICAÇÃO PÓS-MIGRAÇÃO
-- ============================================================
-- Contas marcadas como internas:
--   SELECT id, name, is_internal FROM tenants WHERE is_internal = true;
--
-- KPIs sem internos:
--   SELECT * FROM v_ceo_financial_kpis;
--
-- Assinantes sem internos (deve excluir @incluiai.com):
--   SELECT user_email, plan_code FROM v_ceo_subscribers LIMIT 20;
--
-- Marcar conta manualmente como interna:
--   UPDATE tenants SET is_internal = true WHERE id = '<tenant_uuid>';
-- ============================================================
