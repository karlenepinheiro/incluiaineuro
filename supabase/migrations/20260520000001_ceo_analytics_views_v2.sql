-- ============================================================
-- 20260520000001_ceo_analytics_views_v2.sql
-- Sprint CEO-2 - Analytics financeiro e integridade no banco
--
-- Objetivo:
--   - remover contas internas de todos os KPIs e buscas CEO
--   - excluir INTERNAL_TEST das métricas financeiras
--   - normalizar owner (full_name/nome/email) sem NULL silencioso
--   - mover divergências/integridade do React para SQL
--   - entregar views prontas para paginação/filtros/ordenação SQL
--
-- Fora de escopo:
--   - créditos atômicos
--   - ai-gateway
-- ============================================================

ALTER TABLE public.kiwify_purchases
  ADD COLUMN IF NOT EXISTS price_brl NUMERIC(10,2);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT
  CHECK (billing_cycle IN ('monthly', 'annual'));

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_created_desc
  ON public.subscriptions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_ceo_real
  ON public.subscriptions (tenant_id, status, created_at DESC)
  WHERE status <> 'INTERNAL_TEST';

CREATE INDEX IF NOT EXISTS idx_users_tenant_created_active
  ON public.users (tenant_id, created_at ASC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_users_email_lower
  ON public.users (lower(trim(email)));

CREATE INDEX IF NOT EXISTS idx_kiwify_purchases_tenant_paid_desc
  ON public.kiwify_purchases (tenant_id, status, paid_at DESC, created_at DESC)
  WHERE status = 'APPROVED';

CREATE INDEX IF NOT EXISTS idx_kiwify_purchases_email_paid_desc
  ON public.kiwify_purchases (lower(trim(email)), status, paid_at DESC, created_at DESC)
  WHERE status = 'APPROVED';

CREATE INDEX IF NOT EXISTS idx_credits_wallet_balance_low_real
  ON public.credits_wallet (tenant_id, balance)
  WHERE balance < 30;

DROP VIEW IF EXISTS public.v_ceo_wallet_divergences;
DROP VIEW IF EXISTS public.v_ceo_integrity_findings;
DROP VIEW IF EXISTS public.v_ceo_financial_kpis CASCADE;
DROP VIEW IF EXISTS public.v_ceo_subscribers CASCADE;
DROP VIEW IF EXISTS public.v_ceo_subscriber_health;

CREATE OR REPLACE VIEW public.v_ceo_subscriber_health AS
WITH base_tenants AS (
  SELECT
    t.id,
    t.name,
    t.plan_id,
    t.is_active,
    COALESCE(t.is_internal, false) AS is_internal,
    t.created_at
  FROM public.tenants t
  WHERE NOT COALESCE(t.is_internal, false)
),
latest_sub AS (
  SELECT DISTINCT ON (s.tenant_id)
    s.id AS subscription_id,
    s.tenant_id,
    s.plan_id,
    upper(trim(s.status)) AS raw_status,
    s.current_period_start,
    s.current_period_end,
    s.next_due_date,
    COALESCE(NULLIF(lower(trim(s.billing_cycle)), ''), 'monthly') AS billing_cycle,
    COALESCE(NULLIF(trim(s.provider), ''), 'manual') AS provider,
    s.provider_sub_id,
    s.created_at,
    s.updated_at
  FROM public.subscriptions s
  JOIN base_tenants bt ON bt.id = s.tenant_id
  WHERE upper(trim(s.status)) <> 'INTERNAL_TEST'
  ORDER BY s.tenant_id, s.created_at DESC, s.updated_at DESC, s.id DESC
),
primary_user AS (
  SELECT DISTINCT ON (u.tenant_id)
    u.tenant_id,
    COALESCE(
      NULLIF(btrim(u.full_name), ''),
      NULLIF(btrim(u.nome), ''),
      NULLIF(split_part(lower(trim(u.email)), '@', 1), ''),
      '[sem nome]'
    ) AS user_name,
    NULLIF(lower(trim(u.email)), '') AS user_email,
    u.phone AS user_phone,
    u.cpf AS user_cpf,
    u.created_at
  FROM public.users u
  JOIN base_tenants bt ON bt.id = u.tenant_id
  ORDER BY
    u.tenant_id,
    CASE WHEN COALESCE(u.is_active, true) THEN 0 ELSE 1 END,
    u.created_at ASC,
    u.id ASC
),
student_counts AS (
  SELECT s.tenant_id, COUNT(*)::int AS total
  FROM public.students s
  JOIN base_tenants bt ON bt.id = s.tenant_id
  WHERE s.deleted_at IS NULL
  GROUP BY s.tenant_id
),
credits_used AS (
  SELECT cl.tenant_id, ABS(SUM(cl.amount))::int AS used_cycle
  FROM public.credits_ledger cl
  JOIN base_tenants bt ON bt.id = cl.tenant_id
  WHERE cl.type IN ('usage_ai', 'consumption')
    AND cl.amount < 0
    AND cl.created_at >= (now() - INTERVAL '30 days')
  GROUP BY cl.tenant_id
),
raw_health AS (
  SELECT
    bt.id AS tenant_id,
    bt.name AS tenant_name,
    bt.is_active AS tenant_is_active,
    bt.created_at AS tenant_created_at,
    pu.user_name,
    pu.user_email,
    pu.user_phone,
    pu.user_cpf,
    ls.subscription_id,
    ls.plan_id AS subscription_plan_id,
    ls.provider AS billing_provider,
    ls.provider_sub_id,
    ls.current_period_start,
    ls.current_period_end,
    ls.next_due_date,
    ls.created_at AS subscription_created_at,
    ls.updated_at AS subscription_updated_at,
    CASE
      WHEN ls.subscription_id IS NULL THEN 'NO_SUBSCRIPTION'
      WHEN ls.raw_status IN ('PAST_DUE') THEN 'OVERDUE'
      WHEN ls.raw_status IN ('CANCELLED') THEN 'CANCELED'
      WHEN ls.raw_status IN ('TRIALING') THEN 'TRIAL'
      ELSE ls.raw_status
    END AS subscription_status,
    CASE
      WHEN COALESCE(ls.billing_cycle, '') IN ('annual', 'monthly') THEN ls.billing_cycle
      ELSE 'monthly'
    END AS billing_cycle,
    cp.id AS current_plan_id,
    CASE
      WHEN upper(coalesce(cp.name, 'FREE')) = 'PREMIUM' THEN 'MASTER'
      ELSE upper(coalesce(cp.name, 'FREE'))
    END AS plan_code,
    COALESCE(cp.ai_credits_per_month, 60)::int AS credits_limit,
    COALESCE(cp.max_students, 5)::int AS student_limit,
    COALESCE(cp.price_brl, 0)::numeric(10,2) AS plan_price_brl,
    cw.tenant_id IS NOT NULL AS has_wallet,
    COALESCE(cw.balance, 0)::int AS credits_remaining,
    COALESCE(cu.used_cycle, 0)::int AS credits_used_cycle,
    COALESCE(sc.total, 0)::int AS students_active
  FROM base_tenants bt
  LEFT JOIN primary_user pu ON pu.tenant_id = bt.id
  LEFT JOIN latest_sub ls ON ls.tenant_id = bt.id
  LEFT JOIN public.plans cp ON cp.id = COALESCE(ls.plan_id, bt.plan_id)
  LEFT JOIN public.credits_wallet cw ON cw.tenant_id = bt.id
  LEFT JOIN student_counts sc ON sc.tenant_id = bt.id
  LEFT JOIN credits_used cu ON cu.tenant_id = bt.id
),
enriched_health AS (
  SELECT
    rh.*,
    lpp.purchase_id,
    lpp.purchase_status,
    lpp.purchase_email,
    lpp.purchase_plan_code,
    lpp.purchase_billing_cycle,
    lpp.product_key,
    lpp.provider_order_id,
    lpp.price_brl AS purchase_price_brl,
    lpp.paid_at AS purchase_paid_at,
    lpp.activated_at AS purchase_activated_at,
    lpp.activation_status AS purchase_activation_status
  FROM raw_health rh
  LEFT JOIN LATERAL (
    SELECT
      kp.id AS purchase_id,
      upper(trim(kp.status)) AS purchase_status,
      NULLIF(lower(trim(kp.email)), '') AS purchase_email,
      CASE
        WHEN upper(coalesce(kp.plan_code, '')) = 'PREMIUM' THEN 'MASTER'
        ELSE upper(coalesce(kp.plan_code, ''))
      END AS purchase_plan_code,
      CASE
        WHEN upper(coalesce(kp.product_key, '')) LIKE '%ANNUAL%' THEN 'annual'
        ELSE 'monthly'
      END AS purchase_billing_cycle,
      kp.product_key,
      kp.provider_order_id,
      COALESCE(kp.price_brl, 0)::numeric(10,2) AS price_brl,
      kp.paid_at,
      kp.activated_at,
      kp.activation_status
    FROM public.kiwify_purchases kp
    WHERE upper(trim(kp.status)) = 'APPROVED'
      AND kp.plan_code IS NOT NULL
      AND (
        kp.tenant_id = rh.tenant_id
        OR (
          rh.user_email IS NOT NULL
          AND lower(trim(kp.email)) = rh.user_email
        )
      )
    ORDER BY
      CASE WHEN kp.tenant_id = rh.tenant_id THEN 0 ELSE 1 END,
      COALESCE(kp.paid_at, kp.created_at) DESC,
      kp.created_at DESC,
      kp.id DESC
    LIMIT 1
  ) lpp ON true
)
SELECT
  eh.tenant_id,
  eh.tenant_name,
  eh.tenant_is_active,
  eh.tenant_created_at,
  eh.user_name,
  eh.user_email,
  eh.user_phone,
  eh.user_cpf,
  eh.plan_code,
  eh.billing_cycle,
  eh.subscription_status,
  COALESCE(eh.next_due_date::timestamptz, eh.current_period_end) AS next_due_date,
  eh.billing_provider,
  eh.provider_sub_id,
  eh.subscription_id,
  eh.subscription_plan_id,
  eh.current_period_start,
  eh.current_period_end,
  eh.subscription_created_at,
  eh.subscription_updated_at,
  eh.purchase_id,
  eh.purchase_status,
  eh.purchase_email,
  eh.purchase_plan_code,
  eh.purchase_billing_cycle,
  eh.product_key AS purchase_product_key,
  eh.provider_order_id AS purchase_order_id,
  eh.purchase_price_brl,
  eh.purchase_paid_at,
  eh.purchase_activated_at,
  eh.purchase_activation_status,
  eh.purchase_activated_at AS activated_at,
  eh.credits_remaining,
  eh.credits_limit,
  eh.credits_used_cycle,
  eh.students_active,
  eh.student_limit,
  eh.plan_price_brl,
  (eh.credits_remaining < 30) AS flag_low_credits,
  (
    COALESCE(eh.next_due_date::timestamptz, eh.current_period_end) IS NOT NULL
    AND COALESCE(eh.next_due_date::timestamptz, eh.current_period_end)
      BETWEEN now() AND now() + INTERVAL '7 days'
  ) AS flag_expiring_7d,
  (eh.user_email IS NULL) AS owner_missing,
  (eh.subscription_id IS NULL) AS subscription_missing,
  (
    eh.plan_code <> 'FREE'
    AND (
      NOT eh.has_wallet
      OR eh.credits_limit <= 60
      OR (
        COALESCE(eh.purchase_activated_at, eh.purchase_paid_at) IS NOT NULL
        AND eh.credits_remaining = 0
        AND eh.credits_used_cycle = 0
      )
    )
  ) AS wallet_mismatch,
  (
    eh.purchase_plan_code IS NOT NULL
    AND eh.purchase_activated_at IS NULL
    AND (
      eh.subscription_id IS NULL
      OR eh.subscription_status IN ('NO_SUBSCRIPTION', 'CANCELED')
    )
  ) AS subscription_mismatch,
  (
    eh.purchase_plan_code IS NOT NULL
    AND eh.purchase_activated_at IS NOT NULL
    AND eh.purchase_plan_code <> eh.plan_code
  ) AS plan_mismatch,
  (NOT eh.tenant_is_active) AS inactive_subscriber,
  (
    eh.plan_code <> 'FREE'
    AND eh.subscription_status IN ('ACTIVE', 'COURTESY', 'OVERDUE')
    AND (
      eh.plan_price_brl <= 0
      OR COALESCE(eh.next_due_date::timestamptz, eh.current_period_end) IS NULL
      OR eh.billing_cycle NOT IN ('monthly', 'annual')
    )
  ) AS financial_inconsistency,
  (
    eh.purchase_plan_code IS NOT NULL
    AND eh.purchase_activated_at IS NULL
    AND eh.plan_code = 'FREE'
  ) AS paid_but_free
FROM enriched_health eh;

CREATE OR REPLACE VIEW public.v_ceo_wallet_divergences AS
SELECT
  h.tenant_id,
  h.tenant_name,
  h.user_name,
  h.user_email,
  h.plan_code,
  h.subscription_status,
  h.billing_cycle,
  h.credits_remaining,
  h.credits_limit,
  h.credits_used_cycle,
  h.purchase_plan_code,
  h.purchase_paid_at,
  h.purchase_activated_at,
  h.purchase_order_id,
  CASE
    WHEN NOT h.tenant_is_active THEN 'tenant_inactive'
    WHEN h.plan_code = 'FREE' AND h.purchase_plan_code IS NOT NULL THEN 'paid_purchase_still_free'
    WHEN h.credits_limit <= 60 THEN 'paid_plan_with_free_credit_cap'
    WHEN h.credits_remaining = 0 AND h.credits_used_cycle = 0 THEN 'wallet_zero_without_usage'
    ELSE 'wallet_missing'
  END AS divergence_reason,
  CASE
    WHEN h.paid_but_free THEN 'critical'
    WHEN h.wallet_mismatch THEN 'warn'
    ELSE 'info'
  END AS severity
FROM public.v_ceo_subscriber_health h
WHERE h.wallet_mismatch OR h.paid_but_free;

CREATE OR REPLACE VIEW public.v_ceo_integrity_findings AS
WITH subscriber_findings AS (
  SELECT
    h.tenant_id,
    h.tenant_name,
    h.user_name,
    h.user_email,
    h.plan_code,
    h.billing_cycle,
    h.subscription_status,
    h.credits_remaining,
    h.credits_limit,
    h.next_due_date,
    h.purchase_id,
    h.purchase_order_id,
    f.finding_code,
    f.finding_group,
    f.severity,
    f.finding_title,
    f.finding_detail,
    f.sort_order
  FROM public.v_ceo_subscriber_health h
  CROSS JOIN LATERAL (
    SELECT *
    FROM (
      VALUES
        (
          'NO_OWNER',
          'owner',
          'critical',
          'Tenant sem owner',
          'Nenhum email responsável encontrado na tabela users.',
          10,
          h.owner_missing
        ),
        (
          'NO_SUBSCRIPTION',
          'subscription',
          'critical',
          'Tenant sem subscription',
          'Não existe linha de assinatura válida para o tenant.',
          20,
          h.subscription_missing
        ),
        (
          'PAID_BUT_FREE',
          'plan',
          'critical',
          'Compra paga mas plano FREE',
          'Existe compra aprovada de assinatura não ativada e o tenant continua em FREE.',
          30,
          h.paid_but_free
        ),
        (
          'PLAN_MISMATCH',
          'plan',
          'critical',
          'Plano divergente do produto',
          'O plano atual do sistema difere do plano entregue pela compra aprovada.',
          40,
          h.plan_mismatch
        ),
        (
          'WALLET_MISMATCH',
          'wallet',
          'warn',
          'Wallet divergente do plano',
          'Plano pago com carteira ausente, teto FREE ou saldo zerado sem uso recente.',
          50,
          h.wallet_mismatch
        ),
        (
          'SUBSCRIPTION_MISMATCH',
          'subscription',
          'warn',
          'Subscription divergente da compra',
          'Existe compra aprovada sem ativação refletida na assinatura atual.',
          60,
          h.subscription_mismatch
        ),
        (
          'INACTIVE_SUBSCRIBER',
          'tenant',
          'warn',
          'Tenant inativo',
          'Tenant real excluído da carteira ativa por is_active = false.',
          70,
          h.inactive_subscriber
        ),
        (
          'FINANCIAL_INCONSISTENCY',
          'financial',
          'warn',
          'Inconsistência financeira',
          'Assinatura paga sem preço válido, sem renovação ou com ciclo inválido.',
          80,
          h.financial_inconsistency
        )
    ) AS f(
      finding_code,
      finding_group,
      severity,
      finding_title,
      finding_detail,
      sort_order,
      enabled
    )
    WHERE f.enabled
  ) f
),
purchase_context AS (
  SELECT
    kp.id AS purchase_id,
    kp.tenant_id AS purchase_tenant_id,
    NULLIF(lower(trim(kp.email)), '') AS purchase_email,
    CASE
      WHEN upper(coalesce(kp.plan_code, '')) = 'PREMIUM' THEN 'MASTER'
      ELSE upper(coalesce(kp.plan_code, ''))
    END AS purchase_plan_code,
    kp.product_key,
    kp.provider_order_id,
    kp.activation_status,
    kp.paid_at,
    kp.activated_at,
    COALESCE(kp.price_brl, 0)::numeric(10,2) AS price_brl,
    resolved.tenant_id AS resolved_tenant_id,
    resolved.tenant_name AS resolved_tenant_name,
    resolved.user_name AS resolved_user_name,
    resolved.user_email AS resolved_user_email,
    resolved.tenant_is_internal
  FROM public.kiwify_purchases kp
  LEFT JOIN LATERAL (
    SELECT
      t.id AS tenant_id,
      t.name AS tenant_name,
      COALESCE(
        NULLIF(btrim(u.full_name), ''),
        NULLIF(btrim(u.nome), ''),
        NULLIF(split_part(lower(trim(u.email)), '@', 1), ''),
        '[sem nome]'
      ) AS user_name,
      NULLIF(lower(trim(u.email)), '') AS user_email,
      COALESCE(t.is_internal, false) AS tenant_is_internal
    FROM public.users u
    JOIN public.tenants t ON t.id = u.tenant_id
    WHERE lower(trim(u.email)) = lower(trim(kp.email))
    ORDER BY
      CASE WHEN COALESCE(t.is_internal, false) THEN 1 ELSE 0 END,
      CASE WHEN COALESCE(u.is_active, true) THEN 0 ELSE 1 END,
      u.created_at ASC
    LIMIT 1
  ) resolved ON true
  WHERE upper(trim(kp.status)) = 'APPROVED'
    AND kp.plan_code IS NOT NULL
    AND NOT COALESCE(
      CASE
        WHEN kp.tenant_id IS NOT NULL THEN (
          SELECT t2.is_internal FROM public.tenants t2 WHERE t2.id = kp.tenant_id
        )
        ELSE resolved.tenant_is_internal
      END,
      false
    )
),
purchase_findings AS (
  SELECT
    pc.resolved_tenant_id AS tenant_id,
    COALESCE(pc.resolved_tenant_name, '[sem tenant]') AS tenant_name,
    pc.resolved_user_name AS user_name,
    COALESCE(pc.resolved_user_email, pc.purchase_email) AS user_email,
    pc.purchase_plan_code AS plan_code,
    CASE
      WHEN upper(coalesce(pc.product_key, '')) LIKE '%ANNUAL%' THEN 'annual'
      ELSE 'monthly'
    END AS billing_cycle,
    CASE
      WHEN pc.activation_status = 'PENDING_ACTIVATION' THEN 'PENDING_ACTIVATION'
      WHEN pc.activation_status = 'PENDING_ACCOUNT' THEN 'PENDING_ACCOUNT'
      ELSE 'APPROVED'
    END AS subscription_status,
    NULL::integer AS credits_remaining,
    NULL::integer AS credits_limit,
    NULL::timestamptz AS next_due_date,
    pc.purchase_id,
    pc.provider_order_id AS purchase_order_id,
    f.finding_code,
    f.finding_group,
    f.severity,
    f.finding_title,
    f.finding_detail,
    f.sort_order
  FROM purchase_context pc
  CROSS JOIN LATERAL (
    SELECT *
    FROM (
      VALUES
        (
          'ORPHAN_PURCHASE',
          'financial',
          'critical',
          'Compra sem conta',
          'Compra aprovada sem tenant vinculado e ainda sem ativação.',
          90,
          pc.activation_status = 'PENDING_ACCOUNT'
        ),
        (
          'PENDING_ACTIVATION',
          'financial',
          'warn',
          'Compra aguardando ativação',
          'Compra aprovada já vinculada a tenant, mas ainda sem activated_at.',
          100,
          pc.activation_status = 'PENDING_ACTIVATION'
        ),
        (
          'UNKNOWN_PRODUCT',
          'financial',
          'warn',
          'Produto Kiwify desconhecido',
          'Compra aprovada com product_key não mapeado para catálogo conhecido.',
          110,
          upper(coalesce(pc.product_key, '')) = 'UNKNOWN'
        )
    ) AS f(
      finding_code,
      finding_group,
      severity,
      finding_title,
      finding_detail,
      sort_order,
      enabled
    )
    WHERE f.enabled
  ) f
)
SELECT *
FROM subscriber_findings
UNION ALL
SELECT *
FROM purchase_findings;

CREATE OR REPLACE VIEW public.v_ceo_subscribers AS
WITH findings_rollup AS (
  SELECT
    f.tenant_id,
    COUNT(*)::int AS finding_count,
    COUNT(*) FILTER (WHERE f.severity = 'critical')::int AS critical_finding_count,
    COUNT(*) FILTER (WHERE f.severity = 'warn')::int AS warn_finding_count,
    BOOL_OR(f.finding_group = 'owner') AS has_owner_issue,
    BOOL_OR(f.finding_group = 'wallet') AS has_wallet_issue,
    BOOL_OR(f.finding_group = 'subscription') AS has_subscription_issue,
    BOOL_OR(f.finding_group = 'plan') AS has_plan_issue,
    BOOL_OR(f.finding_group = 'financial') AS has_financial_issue,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'kind',
          lower(f.finding_code),
          'code',
          f.finding_code,
          'group',
          f.finding_group,
          'label',
          f.finding_title,
          'severity',
          f.severity,
          'color',
          CASE
            WHEN f.severity = 'critical' THEN 'bg-red-100 text-red-700 border border-red-200'
            WHEN f.severity = 'warn' THEN 'bg-yellow-100 text-yellow-700 border border-yellow-200'
            ELSE 'bg-blue-100 text-blue-700 border border-blue-200'
          END
        )
        ORDER BY f.sort_order
      ) FILTER (WHERE f.finding_group <> 'financial'),
      '[]'::jsonb
    ) AS integrity_flags,
    (
      SELECT jsonb_build_object(
        'kind',
        lower(f2.finding_code),
        'code',
        f2.finding_code,
        'label',
        f2.finding_title,
        'severity',
        f2.severity
      )
      FROM public.v_ceo_integrity_findings f2
      WHERE f2.tenant_id = f.tenant_id
        AND f2.finding_group IN ('plan', 'subscription', 'wallet')
      ORDER BY f2.sort_order
      LIMIT 1
    ) AS primary_divergence
  FROM public.v_ceo_integrity_findings f
  WHERE f.tenant_id IS NOT NULL
  GROUP BY f.tenant_id
)
SELECT
  h.tenant_id,
  h.tenant_name,
  h.user_name,
  h.user_email,
  h.user_phone,
  h.user_cpf,
  h.plan_code,
  h.billing_cycle,
  h.subscription_status,
  h.next_due_date,
  h.billing_provider,
  h.provider_sub_id,
  h.activated_at,
  h.credits_remaining,
  h.credits_limit,
  h.credits_used_cycle,
  h.students_active,
  h.student_limit,
  h.flag_low_credits,
  h.flag_expiring_7d,
  h.tenant_created_at,
  h.purchase_id,
  h.purchase_status,
  h.purchase_email,
  h.purchase_plan_code,
  h.purchase_billing_cycle,
  h.purchase_product_key,
  h.purchase_order_id,
  h.purchase_price_brl,
  h.purchase_paid_at,
  h.purchase_activated_at,
  h.purchase_activation_status,
  h.owner_missing,
  h.subscription_missing,
  h.wallet_mismatch,
  h.subscription_mismatch,
  h.plan_mismatch,
  h.inactive_subscriber,
  h.financial_inconsistency,
  h.paid_but_free,
  COALESCE(fr.finding_count, 0) AS finding_count,
  COALESCE(fr.critical_finding_count, 0) AS critical_finding_count,
  COALESCE(fr.warn_finding_count, 0) AS warn_finding_count,
  COALESCE(fr.has_owner_issue, false) AS has_owner_issue,
  COALESCE(fr.has_wallet_issue, false) AS has_wallet_issue,
  COALESCE(fr.has_subscription_issue, false) AS has_subscription_issue,
  COALESCE(fr.has_plan_issue, false) AS has_plan_issue,
  COALESCE(fr.has_financial_issue, false) AS has_financial_issue,
  COALESCE(fr.integrity_flags, '[]'::jsonb) AS integrity_flags,
  fr.primary_divergence AS divergence,
  (COALESCE(fr.finding_count, 0) > 0) AS has_any_finding,
  CASE
    WHEN COALESCE(fr.critical_finding_count, 0) > 0 THEN 'critical'
    WHEN COALESCE(fr.warn_finding_count, 0) > 0 OR h.flag_low_credits OR h.flag_expiring_7d THEN 'warn'
    ELSE 'ok'
  END AS health_severity,
  CASE
    WHEN COALESCE(fr.critical_finding_count, 0) > 0 THEN 30
    WHEN COALESCE(fr.warn_finding_count, 0) > 0 THEN 20
    WHEN h.flag_low_credits OR h.flag_expiring_7d THEN 10
    ELSE 0
  END AS health_priority
FROM public.v_ceo_subscriber_health h
LEFT JOIN findings_rollup fr ON fr.tenant_id = h.tenant_id
WHERE h.tenant_is_active = true;

CREATE OR REPLACE VIEW public.v_ceo_financial_kpis AS
WITH active_health AS (
  SELECT *
  FROM public.v_ceo_subscriber_health
  WHERE tenant_is_active = true
),
subscriber_findings AS (
  SELECT *
  FROM public.v_ceo_integrity_findings
  WHERE tenant_id IS NOT NULL
),
purchase_findings AS (
  SELECT *
  FROM public.v_ceo_integrity_findings
  WHERE finding_code IN ('ORPHAN_PURCHASE', 'PENDING_ACTIVATION', 'UNKNOWN_PRODUCT')
),
paid_active AS (
  SELECT
    h.tenant_id,
    h.plan_code,
    h.billing_cycle,
    h.plan_price_brl AS price
  FROM active_health h
  WHERE h.subscription_status IN ('ACTIVE', 'COURTESY')
    AND h.plan_price_brl > 0
),
extra_revenue AS (
  SELECT COALESCE(SUM(kp.price_brl), 0) AS total
  FROM public.kiwify_purchases kp
  LEFT JOIN public.tenants t ON t.id = kp.tenant_id
  LEFT JOIN public.users u
    ON lower(trim(u.email)) = lower(trim(kp.email))
  LEFT JOIN public.tenants ut ON ut.id = u.tenant_id
  WHERE upper(trim(kp.status)) = 'APPROVED'
    AND kp.plan_code IS NULL
    AND COALESCE(kp.paid_at, kp.created_at) >= date_trunc('month', now())
    AND NOT COALESCE(t.is_internal, false)
    AND NOT COALESCE(ut.is_internal, false)
)
SELECT
  (SELECT COUNT(*) FROM active_health)::int AS total_tenants,
  (SELECT COUNT(*) FROM active_health WHERE subscription_status IN ('ACTIVE', 'COURTESY'))::int AS active_subscribers,
  (SELECT COUNT(*) FROM active_health WHERE subscription_status = 'OVERDUE')::int AS overdue_subscribers,
  (SELECT COUNT(*) FROM active_health WHERE subscription_status = 'TRIAL')::int AS trial_subscribers,
  (SELECT COUNT(*) FROM active_health WHERE subscription_status = 'CANCELED')::int AS canceled_subscribers,
  (SELECT COUNT(*) FROM active_health WHERE plan_code = 'FREE')::int AS free_count,
  (SELECT COUNT(*) FROM paid_active WHERE plan_code = 'PRO' AND billing_cycle = 'monthly')::int AS pro_monthly_count,
  (SELECT COUNT(*) FROM paid_active WHERE plan_code = 'PRO' AND billing_cycle = 'annual')::int AS pro_annual_count,
  (SELECT COUNT(*) FROM paid_active WHERE plan_code IN ('MASTER', 'PREMIUM') AND billing_cycle = 'monthly')::int AS premium_monthly_count,
  (SELECT COUNT(*) FROM paid_active WHERE plan_code IN ('MASTER', 'PREMIUM') AND billing_cycle = 'annual')::int AS premium_annual_count,
  COALESCE((SELECT SUM(price) FROM paid_active WHERE plan_code = 'PRO' AND billing_cycle = 'monthly'), 0) AS mrr_pro_monthly,
  COALESCE((SELECT SUM(price) FROM paid_active WHERE plan_code = 'PRO' AND billing_cycle = 'annual'), 0) AS mrr_pro_annual,
  COALESCE((SELECT SUM(price) FROM paid_active WHERE plan_code IN ('MASTER', 'PREMIUM') AND billing_cycle = 'monthly'), 0) AS mrr_premium_monthly,
  COALESCE((SELECT SUM(price) FROM paid_active WHERE plan_code IN ('MASTER', 'PREMIUM') AND billing_cycle = 'annual'), 0) AS mrr_premium_annual,
  COALESCE((SELECT SUM(price) FROM paid_active), 0) AS mrr_estimated,
  (SELECT total FROM extra_revenue) AS extra_revenue_mtd,
  (SELECT COUNT(*) FROM active_health WHERE credits_remaining < 30)::int AS low_credit_count,
  (SELECT COUNT(*) FROM active_health WHERE flag_expiring_7d)::int AS expiring_7d_count,
  (SELECT COUNT(*) FROM subscriber_findings)::int AS integrity_finding_count,
  (SELECT COUNT(DISTINCT tenant_id) FROM subscriber_findings)::int AS tenants_with_findings_count,
  (SELECT COUNT(DISTINCT tenant_id) FROM subscriber_findings WHERE severity = 'critical')::int AS tenants_with_critical_findings,
  (SELECT COUNT(DISTINCT tenant_id) FROM subscriber_findings WHERE finding_code = 'WALLET_MISMATCH')::int AS wallet_divergence_count,
  (SELECT COUNT(DISTINCT tenant_id) FROM subscriber_findings WHERE finding_code = 'PLAN_MISMATCH')::int AS plan_mismatch_count,
  (SELECT COUNT(DISTINCT tenant_id) FROM subscriber_findings WHERE finding_code IN ('NO_SUBSCRIPTION', 'SUBSCRIPTION_MISMATCH'))::int AS subscription_mismatch_count,
  (SELECT COUNT(DISTINCT tenant_id) FROM subscriber_findings WHERE finding_code = 'NO_OWNER')::int AS no_owner_count,
  (SELECT COUNT(*) FROM public.v_ceo_subscriber_health WHERE inactive_subscriber)::int AS inactive_tenants_count,
  (SELECT COUNT(*) FROM purchase_findings WHERE finding_code = 'ORPHAN_PURCHASE')::int AS orphan_purchase_count,
  (SELECT COUNT(*) FROM purchase_findings WHERE finding_code = 'PENDING_ACTIVATION')::int AS pending_activation_count,
  (SELECT COUNT(*) FROM purchase_findings WHERE finding_code = 'UNKNOWN_PRODUCT')::int AS unknown_product_count,
  (SELECT COUNT(DISTINCT tenant_id) FROM subscriber_findings WHERE finding_code = 'FINANCIAL_INCONSISTENCY')::int AS financial_inconsistency_count;

CREATE OR REPLACE FUNCTION public.ceo_get_kpis()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.v_ceo_financial_kpis%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.v_ceo_financial_kpis;
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.ceo_search_tenants(
  search_term text,
  lim int DEFAULT 10
)
RETURNS TABLE (
  tenant_id uuid,
  tenant_name text,
  user_email text,
  user_name text,
  plan_code text,
  subscription_status text,
  credits_remaining numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.tenant_id,
    v.tenant_name,
    v.user_email,
    v.user_name,
    v.plan_code,
    v.subscription_status,
    v.credits_remaining
  FROM public.v_ceo_subscribers v
  WHERE
    COALESCE(search_term, '') = ''
    OR v.tenant_name ILIKE '%' || search_term || '%'
    OR COALESCE(v.user_email, '') ILIKE '%' || search_term || '%'
    OR COALESCE(v.user_name, '') ILIKE '%' || search_term || '%'
  ORDER BY
    v.health_priority DESC,
    v.tenant_name ASC
  LIMIT GREATEST(COALESCE(lim, 10), 1);
$$;

GRANT SELECT ON public.v_ceo_subscriber_health TO authenticated, service_role;
GRANT SELECT ON public.v_ceo_wallet_divergences TO authenticated, service_role;
GRANT SELECT ON public.v_ceo_integrity_findings TO authenticated, service_role;
GRANT SELECT ON public.v_ceo_subscribers TO authenticated, service_role;
GRANT SELECT ON public.v_ceo_financial_kpis TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ceo_get_kpis() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ceo_search_tenants(text, int) TO authenticated, service_role;
