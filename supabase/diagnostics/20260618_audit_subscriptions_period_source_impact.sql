-- ============================================================
-- 20260618_audit_subscriptions_period_source_impact.sql
--
-- DIAGNÓSTICO DE IMPACTO: Origem das datas de período de assinatura
--
-- OBJETIVO: Identificar todas as assinaturas pagas cujas datas
-- de período foram calculadas com base na data errada:
-- data de cadastro, data de ativação da conta, ou data em
-- que o webhook foi processado — em vez da data real do
-- pagamento aprovado na Kiwify.
--
-- SOMENTE SELECT — NENHUM DADO É ALTERADO.
-- ============================================================


-- ============================================================
-- PRE_SCHEMA_CHECK
-- ============================================================
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'subscriptions', 'kiwify_purchases', 'users',
    'tenants', 'plans', 'credits_wallet'
  )
  AND c.column_name IN (
    'current_period_start', 'current_period_end', 'billing_cycle',
    'paid_at', 'created_at', 'activated_at', 'activation_status',
    'product_key', 'plan_code', 'status', 'tenant_id'
  )
ORDER BY c.table_name, c.ordinal_position;


-- ============================================================
-- SEÇÃO 1 — Visão geral de assinantes pagos com diagnóstico
--            de origem das datas de período
--
-- Diagnósticos possíveis:
--   OK_ANCHORED_ON_PAID_AT      — period_start coincide com paid_at (±1 dia)
--   START_NULL                  — current_period_start é NULL
--   ANCHORED_ON_SIGNUP          — period_start coincide com user.created_at (±1 dia)
--   ANCHORED_ON_ACTIVATION      — period_start coincide com kp.activated_at (±1 dia)
--   ANCHORED_ON_WEBHOOK_PROC    — paid_at ≈ period_start mas ambos divergem >1 dia da compra real
--   NEEDS_MANUAL_DATE_CONFIRM   — sem paid_at real para comparar
--   ANNUAL_PERIOD_MISMATCH      — ciclo anual com duração real ≠ 365 ± 3 dias
--   NEEDS_PERIOD_FIX            — period diverge significativamente de paid_at
-- ============================================================
SELECT
  -- Identificação
  u.email                                           AS user_email,
  COALESCE(u.full_name, u.nome)                     AS user_name,
  kp.email                                          AS purchase_email,
  t.id                                              AS tenant_id,
  s.id                                              AS subscription_id,

  -- Plano e ciclo
  upper(trim(p.name))                               AS plan_code,
  s.billing_cycle,
  kp.product_key,

  -- Datas da compra Kiwify
  kp.paid_at                                        AS kp_paid_at,
  kp.created_at                                     AS kp_created_at,
  kp.activated_at                                   AS kp_activated_at,
  kp.activation_status,

  -- Datas de cadastro
  u.created_at                                      AS user_created_at,
  t.created_at                                      AS tenant_created_at,

  -- Datas da subscription
  s.current_period_start,
  s.current_period_end,
  s.created_at                                      AS subscription_created_at,
  s.updated_at                                      AS subscription_updated_at,

  -- Duração real do período (para detectar anual errado)
  CASE
    WHEN s.current_period_start IS NOT NULL AND s.current_period_end IS NOT NULL
    THEN EXTRACT(DAYS FROM (s.current_period_end - s.current_period_start))::int
    ELSE NULL
  END                                               AS period_duration_days,

  -- Desvio: diferença entre paid_at e current_period_start
  CASE
    WHEN kp.paid_at IS NOT NULL AND s.current_period_start IS NOT NULL
    THEN EXTRACT(DAYS FROM (s.current_period_start - kp.paid_at))::int
    ELSE NULL
  END                                               AS period_start_vs_paid_at_days,

  -- ── Diagnóstico ───────────────────────────────────────────────────────────────
  CASE

    -- 1. period_start é NULL — nunca foi definido
    WHEN s.current_period_start IS NULL
      THEN 'START_NULL'

    -- 2. Sem paid_at para comparar — não é possível confirmar
    WHEN kp.paid_at IS NULL
      THEN 'NEEDS_MANUAL_DATE_CONFIRM'

    -- 3. Period_start coincide com paid_at (±1 dia = margem de fuso horário)
    WHEN ABS(EXTRACT(EPOCH FROM (s.current_period_start - kp.paid_at))) < 86400
      THEN 'OK_ANCHORED_ON_PAID_AT'

    -- 4. Period_start coincide com data de ativação da conta (não com pagamento)
    WHEN kp.activated_at IS NOT NULL
      AND ABS(EXTRACT(EPOCH FROM (s.current_period_start - kp.activated_at))) < 86400
      THEN 'ANCHORED_ON_ACTIVATION'

    -- 5. Period_start coincide com cadastro do usuário
    WHEN u.created_at IS NOT NULL
      AND ABS(EXTRACT(EPOCH FROM (s.current_period_start - u.created_at))) < 86400
      THEN 'ANCHORED_ON_SIGNUP'

    -- 6. Ciclo anual com duração ≠ ~365 dias — período foi calculado errado
    WHEN s.billing_cycle = 'annual'
      AND s.current_period_start IS NOT NULL
      AND s.current_period_end IS NOT NULL
      AND ABS(EXTRACT(DAYS FROM (s.current_period_end - s.current_period_start)) - 365) > 5
      THEN 'ANNUAL_PERIOD_MISMATCH'

    -- 7. Desvio > 2 dias entre period_start e paid_at — correção necessária
    WHEN ABS(EXTRACT(EPOCH FROM (s.current_period_start - kp.paid_at))) > 172800
      THEN 'NEEDS_PERIOD_FIX'

    -- 8. Desvio de 1-2 dias — pode ser fuso horário, verificar
    ELSE 'OK_ANCHORED_ON_PAID_AT'

  END                                               AS diagnostico,

  -- Recomendação
  CASE

    WHEN s.current_period_start IS NULL
      THEN 'Definir current_period_start = COALESCE(kp.paid_at, s.created_at)'

    WHEN kp.paid_at IS NULL
      THEN 'Confirmar data real de pagamento na Kiwify e atualizar kp.paid_at manualmente'

    WHEN ABS(EXTRACT(EPOCH FROM (s.current_period_start - kp.paid_at))) < 86400
      THEN 'OK — nenhuma ação necessária'

    WHEN s.billing_cycle = 'annual'
      AND kp.paid_at IS NOT NULL
      AND ABS(EXTRACT(EPOCH FROM (s.current_period_start - kp.paid_at))) > 86400
      THEN 'CORRIGIR: current_period_start = kp.paid_at; current_period_end = kp.paid_at + 12 months'

    WHEN s.billing_cycle = 'monthly'
      AND kp.paid_at IS NOT NULL
      AND ABS(EXTRACT(EPOCH FROM (s.current_period_start - kp.paid_at))) > 86400
      THEN 'VERIFICAR: current_period_start = kp.paid_at; current_period_end = kp.paid_at + 1 month'

    ELSE 'VERIFICAR manualmente'

  END                                               AS recomendacao

FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
JOIN public.tenants t ON t.id = s.tenant_id
LEFT JOIN public.users u ON u.tenant_id = s.tenant_id
LEFT JOIN LATERAL (
  -- Compra mais relevante para este tenant: prefere tenant_id, depois email
  SELECT kp2.*
  FROM   public.kiwify_purchases kp2
  WHERE  upper(trim(kp2.status)) = 'APPROVED'
    AND  kp2.plan_code IS NOT NULL
    AND  (
      kp2.tenant_id = s.tenant_id
      OR lower(trim(kp2.email)) = lower(trim(u.email))
    )
  ORDER BY
    CASE WHEN kp2.tenant_id = s.tenant_id THEN 0 ELSE 1 END,
    COALESCE(kp2.paid_at, kp2.created_at) DESC
  LIMIT 1
) kp ON true
WHERE NOT COALESCE(t.is_internal, false)
  AND upper(trim(s.status)) IN ('ACTIVE', 'COURTESY', 'OVERDUE')
  AND upper(trim(p.name)) IN ('PRO', 'MASTER', 'PREMIUM')
ORDER BY
  -- Prioriza os mais críticos primeiro
  CASE WHEN s.current_period_start IS NULL THEN 0 ELSE 1 END,
  CASE WHEN kp.paid_at IS NULL THEN 1 ELSE 0 END,
  ABS(COALESCE(EXTRACT(EPOCH FROM (s.current_period_start - kp.paid_at)), 9999999)) DESC;


-- ============================================================
-- SEÇÃO 2 — Contagens por diagnóstico (resumo executivo)
-- ============================================================
WITH diagnostico AS (
  SELECT
    CASE
      WHEN s.current_period_start IS NULL
        THEN 'START_NULL'
      WHEN kp.paid_at IS NULL
        THEN 'NEEDS_MANUAL_DATE_CONFIRM'
      WHEN ABS(EXTRACT(EPOCH FROM (s.current_period_start - kp.paid_at))) < 86400
        THEN 'OK_ANCHORED_ON_PAID_AT'
      WHEN kp.activated_at IS NOT NULL
        AND ABS(EXTRACT(EPOCH FROM (s.current_period_start - kp.activated_at))) < 86400
        THEN 'ANCHORED_ON_ACTIVATION'
      WHEN u.created_at IS NOT NULL
        AND ABS(EXTRACT(EPOCH FROM (s.current_period_start - u.created_at))) < 86400
        THEN 'ANCHORED_ON_SIGNUP'
      WHEN s.billing_cycle = 'annual'
        AND s.current_period_start IS NOT NULL
        AND s.current_period_end IS NOT NULL
        AND ABS(EXTRACT(DAYS FROM (s.current_period_end - s.current_period_start)) - 365) > 5
        THEN 'ANNUAL_PERIOD_MISMATCH'
      WHEN kp.paid_at IS NOT NULL
        AND ABS(EXTRACT(EPOCH FROM (s.current_period_start - kp.paid_at))) > 172800
        THEN 'NEEDS_PERIOD_FIX'
      ELSE 'OK_ANCHORED_ON_PAID_AT'
    END AS diagnostico,
    s.billing_cycle
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  JOIN public.tenants t ON t.id = s.tenant_id
  LEFT JOIN public.users u ON u.tenant_id = s.tenant_id
  LEFT JOIN LATERAL (
    SELECT kp2.*
    FROM   public.kiwify_purchases kp2
    WHERE  upper(trim(kp2.status)) = 'APPROVED'
      AND  kp2.plan_code IS NOT NULL
      AND  (
        kp2.tenant_id = s.tenant_id
        OR lower(trim(kp2.email)) = lower(trim(u.email))
      )
    ORDER BY
      CASE WHEN kp2.tenant_id = s.tenant_id THEN 0 ELSE 1 END,
      COALESCE(kp2.paid_at, kp2.created_at) DESC
    LIMIT 1
  ) kp ON true
  WHERE NOT COALESCE(t.is_internal, false)
    AND upper(trim(s.status)) IN ('ACTIVE', 'COURTESY', 'OVERDUE')
    AND upper(trim(p.name)) IN ('PRO', 'MASTER', 'PREMIUM')
)
SELECT
  diagnostico,
  COUNT(*)                                          AS total,
  COUNT(*) FILTER (WHERE billing_cycle = 'annual')  AS qtd_anual,
  COUNT(*) FILTER (WHERE billing_cycle = 'monthly') AS qtd_mensal,
  COUNT(*) FILTER (WHERE billing_cycle IS NULL)     AS qtd_ciclo_null
FROM diagnostico
GROUP BY diagnostico
ORDER BY
  CASE diagnostico
    WHEN 'START_NULL'               THEN 1
    WHEN 'ANNUAL_PERIOD_MISMATCH'   THEN 2
    WHEN 'NEEDS_PERIOD_FIX'         THEN 3
    WHEN 'ANCHORED_ON_ACTIVATION'   THEN 4
    WHEN 'ANCHORED_ON_SIGNUP'       THEN 5
    WHEN 'NEEDS_MANUAL_DATE_CONFIRM' THEN 6
    WHEN 'OK_ANCHORED_ON_PAID_AT'   THEN 7
    ELSE 8
  END;


-- ============================================================
-- SEÇÃO 3 — Assinaturas anuais com duração incorreta
--            (período ≠ ~365 dias ou period_start ≠ paid_at)
-- ============================================================
SELECT
  '=== ANUAIS COM PERÍODO INCORRETO ===' AS secao,
  u.email                                AS user_email,
  t.id                                   AS tenant_id,
  upper(trim(p.name))                    AS plan_code,
  s.billing_cycle,
  kp.paid_at                             AS kp_paid_at,
  s.current_period_start,
  s.current_period_end,
  EXTRACT(DAYS FROM (s.current_period_end - s.current_period_start))::int
                                         AS period_days,
  EXTRACT(DAYS FROM (s.current_period_start - kp.paid_at))::int
                                         AS desvio_start_vs_paid_at_days,
  -- O que deveria ser:
  kp.paid_at                             AS period_start_correto,
  kp.paid_at + interval '12 months'      AS period_end_correto
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
JOIN public.tenants t ON t.id = s.tenant_id
LEFT JOIN public.users u ON u.tenant_id = s.tenant_id
LEFT JOIN LATERAL (
  SELECT kp2.*
  FROM   public.kiwify_purchases kp2
  WHERE  upper(trim(kp2.status)) = 'APPROVED'
    AND  kp2.plan_code IS NOT NULL
    AND  (
      kp2.tenant_id = s.tenant_id
      OR lower(trim(kp2.email)) = lower(trim(u.email))
    )
  ORDER BY
    CASE WHEN kp2.tenant_id = s.tenant_id THEN 0 ELSE 1 END,
    COALESCE(kp2.paid_at, kp2.created_at) DESC
  LIMIT 1
) kp ON true
WHERE NOT COALESCE(t.is_internal, false)
  AND s.billing_cycle = 'annual'
  AND upper(trim(s.status)) IN ('ACTIVE', 'COURTESY', 'OVERDUE')
  AND upper(trim(p.name)) IN ('PRO', 'MASTER', 'PREMIUM')
  AND (
    s.current_period_start IS NULL
    OR kp.paid_at IS NULL
    OR ABS(EXTRACT(EPOCH FROM (s.current_period_start - kp.paid_at))) > 86400
    OR (
      s.current_period_end IS NOT NULL
      AND ABS(EXTRACT(DAYS FROM (s.current_period_end - s.current_period_start)) - 365) > 5
    )
  )
ORDER BY ABS(COALESCE(EXTRACT(EPOCH FROM (s.current_period_start - kp.paid_at)), 9999999)) DESC;


-- ============================================================
-- SEÇÃO 4 — Assinaturas com current_period_start NULL
-- ============================================================
SELECT
  '=== PERIOD_START NULL ===' AS secao,
  u.email                     AS user_email,
  t.id                        AS tenant_id,
  upper(trim(p.name))         AS plan_code,
  s.billing_cycle,
  s.current_period_start,     -- NULL
  s.current_period_end,
  kp.paid_at                  AS kp_paid_at,
  kp.created_at               AS kp_created_at,
  u.created_at                AS user_created_at,
  s.created_at                AS subscription_created_at
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
JOIN public.tenants t ON t.id = s.tenant_id
LEFT JOIN public.users u ON u.tenant_id = s.tenant_id
LEFT JOIN LATERAL (
  SELECT kp2.*
  FROM   public.kiwify_purchases kp2
  WHERE  upper(trim(kp2.status)) = 'APPROVED'
    AND  kp2.plan_code IS NOT NULL
    AND  (
      kp2.tenant_id = s.tenant_id
      OR lower(trim(kp2.email)) = lower(trim(u.email))
    )
  ORDER BY
    CASE WHEN kp2.tenant_id = s.tenant_id THEN 0 ELSE 1 END,
    COALESCE(kp2.paid_at, kp2.created_at) DESC
  LIMIT 1
) kp ON true
WHERE NOT COALESCE(t.is_internal, false)
  AND s.current_period_start IS NULL
  AND upper(trim(s.status)) IN ('ACTIVE', 'COURTESY', 'OVERDUE')
  AND upper(trim(p.name)) IN ('PRO', 'MASTER', 'PREMIUM')
ORDER BY s.created_at DESC;
