-- ============================================================
-- DIAGNÓSTICO: Verificação dos valores dos planos no banco
-- Sprint P1 — 2026-06-15
--
-- Executar apenas com SELECT (somente leitura).
-- Confirma: FREE = 60 créditos / 5 alunos
--           PRO  = 500 créditos / 30 alunos
--           MASTER = 700 créditos / 9999 alunos
-- ============================================================

-- 1. Valores dos planos cadastrados
SELECT
  name,
  ai_credits_per_month,
  max_students,
  price_brl,
  is_active
FROM public.plans
ORDER BY ai_credits_per_month;


-- 2. Assinaturas com billing_cycle e current_period_end (amostra diagnóstica)
SELECT
  s.tenant_id,
  upper(p.name)            AS plan_name,
  s.status,
  s.billing_cycle,
  s.current_period_end,
  s.current_period_end < now() AS period_expired,
  CASE s.billing_cycle
    WHEN 'annual'  THEN s.current_period_end - interval '12 months'
    WHEN 'monthly' THEN s.current_period_end - interval '1 month'
    ELSE NULL
  END                      AS estimated_period_start
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
ORDER BY s.created_at DESC
LIMIT 50;


-- 3. Wallets sem last_reset_at (créditos mensais nunca registrados)
SELECT
  cw.tenant_id,
  cw.balance,
  cw.last_reset_at,
  cw.last_credit_grant_at,
  cw.next_credit_grant_at,
  s.status                 AS sub_status,
  s.billing_cycle,
  upper(p.name)            AS plan_name
FROM public.credits_wallet cw
LEFT JOIN public.subscriptions s ON s.tenant_id = cw.tenant_id
LEFT JOIN public.plans p ON p.id = s.plan_id
WHERE cw.last_reset_at IS NULL
ORDER BY cw.tenant_id
LIMIT 50;


-- 4. Assinaturas anuais com current_period_end errado (≤ 35 dias — deveria ser ~365)
SELECT
  s.tenant_id,
  upper(p.name)            AS plan_name,
  s.billing_cycle,
  s.current_period_end,
  EXTRACT(DAY FROM (s.current_period_end - now())) AS days_remaining
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
WHERE s.billing_cycle = 'annual'
  AND s.current_period_end IS NOT NULL
  AND (s.current_period_end - now()) < interval '35 days'
ORDER BY s.current_period_end;


-- 5. Resumo geral
SELECT
  (SELECT COUNT(*) FROM public.plans WHERE is_active)                              AS planos_ativos,
  (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'ACTIVE')             AS subs_ativas,
  (SELECT COUNT(*) FROM public.subscriptions WHERE billing_cycle = 'annual')      AS subs_anuais,
  (SELECT COUNT(*) FROM public.subscriptions WHERE billing_cycle = 'monthly')     AS subs_mensais,
  (SELECT COUNT(*) FROM public.credits_wallet WHERE last_reset_at IS NULL)        AS wallets_sem_last_reset_at,
  (SELECT COUNT(*) FROM public.subscriptions
   WHERE billing_cycle = 'annual'
     AND current_period_end IS NOT NULL
     AND (current_period_end - now()) < interval '35 days')                       AS anuais_com_period_errado;
