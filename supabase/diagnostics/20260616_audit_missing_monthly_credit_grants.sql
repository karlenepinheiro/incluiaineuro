-- ============================================================
-- DIAGNÓSTICO: Assinantes ativas sem renovação mensal de créditos
-- Sprint urgente créditos mensais — 2026-06-16
--
-- SOMENTE LEITURA (SELECT). Nenhuma alteração de dados.
--
-- Objetivo:
--   Identificar assinaturas PRO/MASTER ATIVAS que deveriam ter
--   recebido créditos mensais mas não receberam.
--
-- Campos retornados:
--   A. Assinaturas ACTIVE de PRO/MASTER
--   B. Tenant, usuário, email, plano, billing_cycle
--   C. current_period_start, current_period_end, next_due_date
--   D. credits_wallet.balance
--   E. credits_wallet.last_reset_at
--   F. credits_wallet.last_credit_grant_at
--   G. Último monthly_grant no credits_ledger
--   H. Dias desde o último monthly_grant
--   I. Créditos esperados pelo plano
--   J. Status:
--        OK                  — grant recente encontrado
--        MISSING_MONTHLY_GRANT — deveria ter recebido mas não recebeu este mês
--        NEVER_GRANTED       — nunca teve monthly_grant
--        LAST_GRANT_OVERDUE  — último grant há mais de 35 dias (ciclo mensal ultrapassado)
--        BILLING_CYCLE_NULL  — anomalia: billing_cycle não definido (não conceder sem revisão)
--        SUBSCRIPTION_EXPIRED — current_period_end já passou
-- ============================================================

WITH

-- Assinaturas PRO/MASTER (inclui vencidas para diagnóstico completo)
active_subs AS (
  SELECT
    t.id                                AS tenant_id,
    t.name                              AS tenant_name,
    NOT COALESCE(t.is_active, true)     AS tenant_inactive,
    COALESCE(t.is_internal, false)      AS is_internal,
    upper(p.name)                       AS plan_code,
    s.id                                AS subscription_id,
    s.status                            AS sub_status,
    s.billing_cycle,
    s.current_period_start,
    s.current_period_end,
    s.next_due_date,
    s.provider
  FROM public.subscriptions s
  JOIN public.plans p
    ON p.id = s.plan_id
    AND upper(p.name) IN ('PRO', 'MASTER')
  JOIN public.tenants t ON t.id = s.tenant_id
  WHERE s.status = 'ACTIVE'
    AND NOT COALESCE(t.is_internal, false)
),

-- Usuário principal de cada tenant
primary_user AS (
  SELECT DISTINCT ON (u.tenant_id)
    u.tenant_id,
    u.email                             AS user_email,
    COALESCE(u.full_name, u.nome, split_part(u.email, '@', 1)) AS user_name
  FROM public.users u
  ORDER BY u.tenant_id, u.created_at ASC
),

-- Carteiras de créditos
wallets AS (
  SELECT
    cw.tenant_id,
    COALESCE(cw.balance, 0)             AS balance,
    cw.last_reset_at,
    cw.last_credit_grant_at,
    cw.next_credit_grant_at
  FROM public.credits_wallet cw
),

-- Último monthly_grant por tenant (via credits_ledger — cobre TODOS os caminhos)
last_grant AS (
  SELECT DISTINCT ON (cl.tenant_id)
    cl.tenant_id,
    cl.created_at                       AS last_grant_at,
    cl.amount                           AS last_grant_amount,
    cl.description                      AS last_grant_description,
    cl.source                           AS last_grant_source,
    cl.operation_id                     AS last_grant_operation_id
  FROM public.credits_ledger cl
  WHERE cl.type = 'monthly_grant'
  ORDER BY cl.tenant_id, cl.created_at DESC
),

-- Monthly grants do mês atual
current_month_grants AS (
  SELECT DISTINCT
    cl.tenant_id,
    COUNT(*)                            AS grants_this_month,
    MAX(cl.created_at)                  AS latest_this_month
  FROM public.credits_ledger cl
  WHERE cl.type = 'monthly_grant'
    AND date_trunc('month', cl.created_at) = date_trunc('month', now())
  GROUP BY cl.tenant_id
)

-- ────────────────────────────────────────────────────────────
-- Resultado principal
-- ────────────────────────────────────────────────────────────
SELECT
  s.tenant_id,
  s.tenant_name,
  pu.user_email,
  pu.user_name,
  s.plan_code,
  s.billing_cycle,
  s.sub_status,
  s.current_period_start,
  s.current_period_end,
  s.next_due_date,
  s.provider,

  -- D. Carteira
  COALESCE(w.balance, 0)                            AS credits_balance,

  -- E. last_reset_at
  w.last_reset_at,

  -- F. last_credit_grant_at
  w.last_credit_grant_at,

  -- G. Último monthly_grant (ledger)
  lg.last_grant_at,
  lg.last_grant_amount,
  lg.last_grant_description,
  lg.last_grant_source,
  lg.last_grant_operation_id,

  -- H. Dias desde o último grant
  EXTRACT(DAY FROM (now() - COALESCE(lg.last_grant_at, '1970-01-01'::timestamptz)))::int
                                                     AS days_since_last_grant,

  -- I. Créditos esperados pelo plano
  CASE s.plan_code
    WHEN 'MASTER'  THEN 700
    WHEN 'PRO'     THEN 500
    ELSE 0
  END                                               AS credits_expected,

  -- Mês atual e grants no mês
  to_char(now(), 'YYYY-MM')                         AS current_month,
  COALESCE(cmg.grants_this_month, 0)                AS grants_this_month,
  cmg.latest_this_month                             AS last_grant_this_month,

  -- J. Status
  CASE
    WHEN s.billing_cycle IS NULL
    THEN 'BILLING_CYCLE_NULL'

    WHEN s.current_period_end IS NOT NULL AND s.current_period_end < now()
    THEN 'SUBSCRIPTION_EXPIRED'

    WHEN s.tenant_inactive
    THEN 'TENANT_INACTIVE'

    WHEN cmg.grants_this_month > 0
    THEN 'OK'

    WHEN lg.last_grant_at IS NULL
    THEN 'NEVER_GRANTED'

    WHEN EXTRACT(DAY FROM (now() - lg.last_grant_at)) > 35
    THEN 'LAST_GRANT_OVERDUE'

    ELSE 'MISSING_MONTHLY_GRANT'
  END                                               AS grant_status,

  -- Operation ID que seria usado para o grant idempotente
  'monthly_grant:' || s.tenant_id::text || ':' || to_char(now(), 'YYYY-MM')
                                                    AS proposed_operation_id

FROM active_subs s
LEFT JOIN primary_user pu ON pu.tenant_id = s.tenant_id
LEFT JOIN wallets w ON w.tenant_id = s.tenant_id
LEFT JOIN last_grant lg ON lg.tenant_id = s.tenant_id
LEFT JOIN current_month_grants cmg ON cmg.tenant_id = s.tenant_id
ORDER BY
  CASE
    WHEN s.billing_cycle IS NULL    THEN 1
    WHEN s.current_period_end < now() THEN 2
    WHEN cmg.grants_this_month > 0  THEN 5  -- OK vai por último
    WHEN lg.last_grant_at IS NULL   THEN 3
    ELSE 4
  END,
  s.tenant_name;


-- ────────────────────────────────────────────────────────────
-- Resumo executivo por status de grant
-- ────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.subscriptions s
   JOIN public.plans p ON p.id = s.plan_id AND upper(p.name) IN ('PRO','MASTER')
   JOIN public.tenants t ON t.id = s.tenant_id AND NOT COALESCE(t.is_internal, false)
   WHERE s.status = 'ACTIVE')
    AS total_ativas_pro_master,

  (SELECT COUNT(*) FROM public.subscriptions s
   JOIN public.plans p ON p.id = s.plan_id AND upper(p.name) IN ('PRO','MASTER')
   JOIN public.tenants t ON t.id = s.tenant_id AND NOT COALESCE(t.is_internal, false)
   WHERE s.status = 'ACTIVE'
     AND s.billing_cycle IS NULL)
    AS billing_cycle_null,

  (SELECT COUNT(*) FROM public.subscriptions s
   JOIN public.plans p ON p.id = s.plan_id AND upper(p.name) IN ('PRO','MASTER')
   JOIN public.tenants t ON t.id = s.tenant_id AND NOT COALESCE(t.is_internal, false)
   WHERE s.status = 'ACTIVE'
     AND s.current_period_end IS NOT NULL AND s.current_period_end < now())
    AS subscriptions_expired,

  (SELECT COUNT(DISTINCT cl.tenant_id) FROM public.credits_ledger cl
   WHERE cl.type = 'monthly_grant'
     AND date_trunc('month', cl.created_at) = date_trunc('month', now()))
    AS tenants_com_grant_este_mes,

  (SELECT COUNT(*) FROM public.subscriptions s
   JOIN public.plans p ON p.id = s.plan_id AND upper(p.name) IN ('PRO','MASTER')
   JOIN public.tenants t ON t.id = s.tenant_id AND NOT COALESCE(t.is_internal, false)
   WHERE s.status = 'ACTIVE'
     AND s.billing_cycle IS NOT NULL
     AND (s.current_period_end IS NULL OR s.current_period_end >= now())
     AND NOT EXISTS (
       SELECT 1 FROM public.credits_ledger cl
       WHERE cl.tenant_id = s.tenant_id
         AND cl.type = 'monthly_grant'
         AND date_trunc('month', cl.created_at) = date_trunc('month', now())
     ))
    AS faltando_grant_este_mes,

  (SELECT COUNT(*) FROM public.subscriptions s
   JOIN public.plans p ON p.id = s.plan_id AND upper(p.name) IN ('PRO','MASTER')
   JOIN public.tenants t ON t.id = s.tenant_id AND NOT COALESCE(t.is_internal, false)
   WHERE s.status = 'ACTIVE'
     AND NOT EXISTS (
       SELECT 1 FROM public.credits_ledger cl
       WHERE cl.tenant_id = s.tenant_id AND cl.type = 'monthly_grant'
     ))
    AS nunca_recebeu_grant,

  to_char(now(), 'YYYY-MM-DD HH24:MI:SS TZ') AS momento_diagnostico;