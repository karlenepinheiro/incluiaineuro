-- ============================================================
-- DIAGNÓSTICO: Assinaturas legadas — ciclos, períodos e anomalias
-- Sprint P1.3-B/C — 2026-06-16
--
-- SOMENTE LEITURA (SELECT). Nenhuma alteração de dados.
--
-- Cobre:
--   A. Assinaturas com billing_cycle NULL
--   B. Assinaturas annual com current_period_end < period_start + 300 dias
--      (indica bug: foram gravadas com 30 dias em vez de 12 meses)
--   C. Assinaturas monthly com current_period_end > period_start + 45 dias
--      (suspeita de ciclo invertido)
--   D. Assinaturas ACTIVE com current_period_end vencido
--   E. Tenants com plan_id diferente da assinatura ativa
--   F. Assinaturas PRO/MASTER com billing_cycle NULL (anomalia crítica de billing)
--   G. Assinaturas criadas antes de 2026-06-15 (data da Sprint P1 — correção do período)
--      que ainda têm status ACTIVE (potencialmente gravadas com bug)
--   H. Resumo executivo com contagens por categoria de risco
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- A. Assinaturas com billing_cycle NULL
--    Risco: webhook subscription_renewed não sabe qual ciclo usar;
--    v_ceo_subscriber_health anteriormente as exibia como 'monthly'.
-- ────────────────────────────────────────────────────────────
SELECT
  s.id                                                              AS subscription_id,
  s.tenant_id,
  upper(p.name)                                                     AS plan_name,
  s.status,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  s.provider,
  s.created_at,
  EXTRACT(DAY FROM (s.current_period_end - s.current_period_start))::int AS period_length_days
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id = s.plan_id
WHERE s.billing_cycle IS NULL
ORDER BY s.created_at DESC
LIMIT 100;


-- ────────────────────────────────────────────────────────────
-- B. Assinaturas ANNUAL com current_period_end < period_start + 300 dias
--    Bug herdado: activate_purchase_for_user usava now() + 30 dias
--    para qualquer ciclo. Anuais gravadas antes de 2026-06-15
--    têm period_end incorreto (30 dias em vez de 12 meses).
-- ────────────────────────────────────────────────────────────
SELECT
  s.id                                                              AS subscription_id,
  s.tenant_id,
  upper(p.name)                                                     AS plan_name,
  s.status,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  EXTRACT(DAY FROM (s.current_period_end - s.current_period_start))::int AS period_length_days,
  EXTRACT(DAY FROM (s.current_period_end - now()))::int            AS days_remaining,
  s.provider,
  s.created_at,
  CASE
    WHEN s.current_period_end < now() THEN 'VENCIDA'
    WHEN s.current_period_end < now() + interval '30 days' THEN 'VENCE_EM_30_DIAS'
    ELSE 'OK_POR_ENQUANTO'
  END                                                               AS urgencia
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id = s.plan_id
WHERE s.billing_cycle = 'annual'
  AND s.current_period_start IS NOT NULL
  AND s.current_period_end IS NOT NULL
  AND (s.current_period_end - s.current_period_start) < interval '300 days'
ORDER BY days_remaining ASC;


-- ────────────────────────────────────────────────────────────
-- C. Assinaturas MONTHLY com current_period_end > period_start + 45 dias
--    Suspeita: foram ativadas com billing_cycle='monthly' mas
--    receberam period_end anual (inversão de ciclo).
-- ────────────────────────────────────────────────────────────
SELECT
  s.id                                                              AS subscription_id,
  s.tenant_id,
  upper(p.name)                                                     AS plan_name,
  s.status,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  EXTRACT(DAY FROM (s.current_period_end - s.current_period_start))::int AS period_length_days,
  EXTRACT(DAY FROM (s.current_period_end - now()))::int            AS days_remaining,
  s.provider,
  s.created_at
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id = s.plan_id
WHERE s.billing_cycle = 'monthly'
  AND s.current_period_start IS NOT NULL
  AND s.current_period_end IS NOT NULL
  AND (s.current_period_end - s.current_period_start) > interval '45 days'
ORDER BY period_length_days DESC
LIMIT 50;


-- ────────────────────────────────────────────────────────────
-- D. Assinaturas ACTIVE com current_period_end vencido
--    Risco: tenant continua com acesso a plano pago após expiração.
--    Devem ser verificadas e, se necessário, canceladas ou renovadas.
-- ────────────────────────────────────────────────────────────
SELECT
  s.id                                                              AS subscription_id,
  s.tenant_id,
  upper(p.name)                                                     AS plan_name,
  s.status,
  s.billing_cycle,
  s.current_period_end,
  EXTRACT(DAY FROM (now() - s.current_period_end))::int            AS days_overdue,
  s.provider,
  s.created_at
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id = s.plan_id
WHERE s.status = 'ACTIVE'
  AND s.current_period_end IS NOT NULL
  AND s.current_period_end < now()
ORDER BY days_overdue DESC
LIMIT 50;


-- ────────────────────────────────────────────────────────────
-- E. Tenants com plan_id diferente da assinatura ativa
--    Risco: tenant.plan_id foi atualizado fora do fluxo correto
--    e diverge do plano na subscription.
-- ────────────────────────────────────────────────────────────
SELECT
  t.id                                                              AS tenant_id,
  t.name                                                            AS tenant_name,
  upper(pt.name)                                                    AS tenant_plan,
  upper(ps.name)                                                    AS subscription_plan,
  s.status                                                          AS sub_status,
  s.billing_cycle,
  s.current_period_end
FROM public.tenants t
LEFT JOIN public.plans pt ON pt.id = t.plan_id
LEFT JOIN public.subscriptions s
  ON s.tenant_id = t.id
  AND s.status   = 'ACTIVE'
LEFT JOIN public.plans ps ON ps.id = s.plan_id
WHERE t.plan_id IS DISTINCT FROM s.plan_id
  AND s.id IS NOT NULL
ORDER BY t.created_at DESC
LIMIT 50;


-- ────────────────────────────────────────────────────────────
-- F. Assinaturas PRO/MASTER com billing_cycle NULL
--    Essas são as mais críticas: plano pago sem ciclo definido.
--    O sistema não sabe se renovar mensalmente ou anualmente.
-- ────────────────────────────────────────────────────────────
SELECT
  s.id                                                              AS subscription_id,
  s.tenant_id,
  upper(p.name)                                                     AS plan_name,
  s.status,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  EXTRACT(DAY FROM (s.current_period_end - s.current_period_start))::int AS period_length_days,
  s.provider,
  s.created_at,
  -- Inferência do ciclo provável pelo período gravado
  CASE
    WHEN s.current_period_start IS NOT NULL
      AND s.current_period_end IS NOT NULL
      AND (s.current_period_end - s.current_period_start) > interval '300 days'
    THEN 'provavelmente_annual'
    WHEN s.current_period_start IS NOT NULL
      AND s.current_period_end IS NOT NULL
      AND (s.current_period_end - s.current_period_start) <= interval '45 days'
    THEN 'provavelmente_monthly'
    ELSE 'indeterminado'
  END                                                               AS ciclo_provavel
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id = s.plan_id
WHERE s.billing_cycle IS NULL
  AND upper(p.name) IN ('PRO', 'MASTER', 'PREMIUM')
ORDER BY s.created_at DESC
LIMIT 100;


-- ────────────────────────────────────────────────────────────
-- G. Assinaturas criadas antes de 2026-06-15 com status ACTIVE
--    (data da Sprint P1 que corrigiu o período anual)
--    São candidatas a terem sido gravadas com o bug de 30 dias.
-- ────────────────────────────────────────────────────────────
SELECT
  s.id                                                              AS subscription_id,
  s.tenant_id,
  upper(p.name)                                                     AS plan_name,
  s.status,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  EXTRACT(DAY FROM (s.current_period_end - s.current_period_start))::int AS period_length_days,
  EXTRACT(DAY FROM (s.current_period_end - now()))::int            AS days_remaining,
  s.provider,
  s.created_at,
  CASE
    WHEN s.billing_cycle = 'annual'
      AND (s.current_period_end - s.current_period_start) < interval '300 days'
    THEN 'ANUAL_COM_PERIODO_ERRADO'
    WHEN s.billing_cycle IS NULL
      AND upper(p.name) IN ('PRO', 'MASTER', 'PREMIUM')
    THEN 'PAGO_SEM_CICLO'
    WHEN s.billing_cycle = 'monthly'
      AND (s.current_period_end - s.current_period_start) > interval '45 days'
    THEN 'MENSAL_COM_PERIODO_LONGO'
    ELSE 'OK_APARENTE'
  END                                                               AS anomalia
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id = s.plan_id
WHERE s.status     = 'ACTIVE'
  AND s.created_at < '2026-06-15T00:00:00Z'
ORDER BY
  CASE
    WHEN s.billing_cycle = 'annual'
      AND (s.current_period_end - s.current_period_start) < interval '300 days'
    THEN 0
    WHEN s.billing_cycle IS NULL THEN 1
    ELSE 2
  END,
  s.current_period_end ASC NULLS LAST
LIMIT 100;


-- ────────────────────────────────────────────────────────────
-- H. Resumo executivo — contagens por categoria de risco
-- ────────────────────────────────────────────────────────────
SELECT
  -- A. billing_cycle NULL total
  (SELECT COUNT(*) FROM public.subscriptions
   WHERE billing_cycle IS NULL)
    AS A_subs_sem_billing_cycle,

  -- F. billing_cycle NULL em planos pagos
  (SELECT COUNT(*)
   FROM public.subscriptions s
   JOIN public.plans p ON p.id = s.plan_id
   WHERE s.billing_cycle IS NULL
     AND upper(p.name) IN ('PRO', 'MASTER', 'PREMIUM'))
    AS F_pagos_sem_billing_cycle,

  -- B. Anuais com período errado (< 300 dias)
  (SELECT COUNT(*) FROM public.subscriptions
   WHERE billing_cycle = 'annual'
     AND current_period_start IS NOT NULL
     AND current_period_end IS NOT NULL
     AND (current_period_end - current_period_start) < interval '300 days')
    AS B_anuais_com_periodo_errado,

  -- C. Mensais com período longo (> 45 dias)
  (SELECT COUNT(*) FROM public.subscriptions
   WHERE billing_cycle = 'monthly'
     AND current_period_start IS NOT NULL
     AND current_period_end IS NOT NULL
     AND (current_period_end - current_period_start) > interval '45 days')
    AS C_mensais_com_periodo_longo,

  -- D. Ativas vencidas
  (SELECT COUNT(*) FROM public.subscriptions
   WHERE status = 'ACTIVE'
     AND current_period_end IS NOT NULL
     AND current_period_end < now())
    AS D_ativas_vencidas,

  -- E. Tenants com plan divergente
  (SELECT COUNT(*)
   FROM public.tenants t
   WHERE t.plan_id IS DISTINCT FROM (
     SELECT plan_id FROM public.subscriptions
     WHERE tenant_id = t.id AND status = 'ACTIVE'
     LIMIT 1
   ) AND EXISTS (
     SELECT 1 FROM public.subscriptions
     WHERE tenant_id = t.id AND status = 'ACTIVE'
   ))
    AS E_tenants_com_plan_divergente,

  -- G. Criadas antes da Sprint P1 com status ACTIVE
  (SELECT COUNT(*) FROM public.subscriptions
   WHERE status     = 'ACTIVE'
     AND created_at < '2026-06-15T00:00:00Z')
    AS G_legadas_ainda_ativas,

  -- Totais de referência
  (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'ACTIVE')
    AS total_subs_ativas,
  (SELECT COUNT(*) FROM public.subscriptions WHERE billing_cycle = 'annual' AND status = 'ACTIVE')
    AS total_anuais_ativas,
  (SELECT COUNT(*) FROM public.subscriptions WHERE billing_cycle = 'monthly' AND status = 'ACTIVE')
    AS total_mensais_ativas;