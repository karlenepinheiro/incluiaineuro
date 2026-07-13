-- ============================================================
-- DIAGNÓSTICO: Auditoria de planos, ciclos de cobrança e assinaturas
-- Sprint P1.3 — 2026-06-15
--
-- SOMENTE LEITURA (SELECT). Nenhuma alteração de dados.
--
-- Cobre:
--   1. Assinaturas com billing_cycle NULL (ciclo desconhecido)
--   2. Assinaturas anuais com current_period_end ≤ 35 dias (bug herdado: 30 dias fixos)
--   3. Assinaturas mensais com current_period_end > 45 dias (suspeita de inconsistência)
--   4. Tenants cujo plan_id diverge da assinatura ativa
--   5. Assinaturas ACTIVE com current_period_end no passado (expiradas mas não canceladas)
--   6. Contas FREE com assinatura paga ativa (anomalia de dados)
--   7. Usuários sem tenant associado
--   8. Tenants sem plan_id
--   9. Produtos Kiwify sem billing_cycle (catálogo incompleto)
--  10. Resumo executivo — contagens por categoria de risco
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Assinaturas com billing_cycle NULL
--    Risco: webhook subscription_renewed não sabe qual ciclo usar
-- ────────────────────────────────────────────────────────────
SELECT
  s.id                                          AS subscription_id,
  s.tenant_id,
  upper(p.name)                                 AS plan_name,
  s.status,
  s.billing_cycle,
  s.current_period_end,
  s.provider,
  s.created_at
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id = s.plan_id
WHERE s.billing_cycle IS NULL
ORDER BY s.created_at DESC
LIMIT 100;


-- ────────────────────────────────────────────────────────────
-- 2. Assinaturas ANUAIS com current_period_end ≤ 35 dias restantes
--    Risco: foram ativadas com bug de 30 dias fixos no lugar de 12 meses
-- ────────────────────────────────────────────────────────────
SELECT
  s.id                                          AS subscription_id,
  s.tenant_id,
  upper(p.name)                                 AS plan_name,
  s.status,
  s.billing_cycle,
  s.current_period_end,
  EXTRACT(DAY FROM (s.current_period_end - now()))::int AS days_remaining,
  s.provider,
  s.created_at
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id = s.plan_id
WHERE s.billing_cycle = 'annual'
  AND s.current_period_end IS NOT NULL
  AND (s.current_period_end - now()) < interval '35 days'
ORDER BY days_remaining ASC;


-- ────────────────────────────────────────────────────────────
-- 3. Assinaturas MENSAIS com current_period_end > 45 dias
--    Risco: ativadas como mensais mas com período anual (inversão de ciclo)
-- ────────────────────────────────────────────────────────────
SELECT
  s.id                                          AS subscription_id,
  s.tenant_id,
  upper(p.name)                                 AS plan_name,
  s.status,
  s.billing_cycle,
  s.current_period_end,
  EXTRACT(DAY FROM (s.current_period_end - now()))::int AS days_remaining,
  s.provider,
  s.created_at
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id = s.plan_id
WHERE s.billing_cycle = 'monthly'
  AND s.current_period_end IS NOT NULL
  AND (s.current_period_end - now()) > interval '45 days'
ORDER BY days_remaining DESC
LIMIT 50;


-- ────────────────────────────────────────────────────────────
-- 4. Tenants cujo plan_id diverge da assinatura ativa
--    Risco: tenant.plan_id foi atualizado diretamente sem passar pela subscription
-- ────────────────────────────────────────────────────────────
SELECT
  t.id                                          AS tenant_id,
  t.name                                        AS tenant_name,
  upper(pt.name)                                AS tenant_plan,
  upper(ps.name)                                AS subscription_plan,
  s.status                                      AS sub_status,
  s.billing_cycle
FROM public.tenants t
LEFT JOIN public.plans pt ON pt.id = t.plan_id
LEFT JOIN public.subscriptions s ON s.tenant_id = t.id AND s.status = 'ACTIVE'
LEFT JOIN public.plans ps ON ps.id = s.plan_id
WHERE t.plan_id IS DISTINCT FROM s.plan_id
  AND s.id IS NOT NULL
ORDER BY t.created_at DESC
LIMIT 50;


-- ────────────────────────────────────────────────────────────
-- 5. Assinaturas ACTIVE com current_period_end no passado
--    Risco: usuário continua acessando plano pago após expiração
-- ────────────────────────────────────────────────────────────
SELECT
  s.id                                          AS subscription_id,
  s.tenant_id,
  upper(p.name)                                 AS plan_name,
  s.status,
  s.billing_cycle,
  s.current_period_end,
  EXTRACT(DAY FROM (now() - s.current_period_end))::int AS days_overdue,
  s.provider
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id = s.plan_id
WHERE s.status = 'ACTIVE'
  AND s.current_period_end IS NOT NULL
  AND s.current_period_end < now()
ORDER BY days_overdue DESC
LIMIT 50;


-- ────────────────────────────────────────────────────────────
-- 6. Contas FREE com assinatura paga ativa (anomalia de dados)
--    Risco: tenant está no plano FREE mas tem subscription PRO/MASTER ACTIVE
-- ────────────────────────────────────────────────────────────
SELECT
  t.id                                          AS tenant_id,
  t.name                                        AS tenant_name,
  upper(pt.name)                                AS tenant_plan_code,
  upper(ps.name)                                AS sub_plan_code,
  s.status                                      AS sub_status,
  s.billing_cycle,
  s.current_period_end
FROM public.tenants t
JOIN public.plans pt ON pt.id = t.plan_id
JOIN public.subscriptions s ON s.tenant_id = t.id AND s.status = 'ACTIVE'
JOIN public.plans ps ON ps.id = s.plan_id
WHERE upper(pt.name) = 'FREE'
  AND upper(ps.name) IN ('PRO', 'MASTER')
ORDER BY t.created_at DESC
LIMIT 50;


-- ────────────────────────────────────────────────────────────
-- 7. Usuários sem tenant associado (user.tenant_id IS NULL)
--    Risco: usuário não pode ativar compras nem usar o sistema
-- ────────────────────────────────────────────────────────────
SELECT
  u.id                                          AS user_id,
  u.email,
  u.created_at,
  u.tenant_id
FROM public.users u
WHERE u.tenant_id IS NULL
ORDER BY u.created_at DESC
LIMIT 50;


-- ────────────────────────────────────────────────────────────
-- 8. Tenants sem plan_id
--    Risco: checkPermission não consegue determinar nível de acesso
-- ────────────────────────────────────────────────────────────
SELECT
  t.id                                          AS tenant_id,
  t.name                                        AS tenant_name,
  t.is_active,
  t.created_at
FROM public.tenants t
WHERE t.plan_id IS NULL
ORDER BY t.created_at DESC
LIMIT 50;


-- ────────────────────────────────────────────────────────────
-- 9. Produtos kiwify_products sem billing_cycle
--    Risco: catálogo incompleto → webhook subscription_renewed lê 'monthly' por fallback
-- ────────────────────────────────────────────────────────────
SELECT
  kp.kiwify_product_id,
  kp.product_name,
  kp.product_type,
  kp.plan_code,
  kp.billing_cycle,
  kp.price_brl,
  kp.is_active
FROM public.kiwify_products kp
WHERE kp.billing_cycle IS NULL
  AND kp.is_active = true
ORDER BY kp.plan_code, kp.product_type;


-- ────────────────────────────────────────────────────────────
-- 10. Resumo executivo — contagens por categoria de risco
-- ────────────────────────────────────────────────────────────
SELECT
  -- Assinaturas
  (SELECT COUNT(*) FROM public.subscriptions WHERE billing_cycle IS NULL)
    AS subs_sem_billing_cycle,
  (SELECT COUNT(*) FROM public.subscriptions
   WHERE billing_cycle = 'annual'
     AND current_period_end IS NOT NULL
     AND (current_period_end - now()) < interval '35 days')
    AS anuais_com_period_errado,
  (SELECT COUNT(*) FROM public.subscriptions
   WHERE billing_cycle = 'monthly'
     AND current_period_end IS NOT NULL
     AND (current_period_end - now()) > interval '45 days')
    AS mensais_com_period_longo,
  (SELECT COUNT(*) FROM public.subscriptions
   WHERE status = 'ACTIVE'
     AND current_period_end IS NOT NULL
     AND current_period_end < now())
    AS ativas_expiradas,

  -- Tenants e usuários
  (SELECT COUNT(*) FROM public.tenants
   WHERE plan_id IS DISTINCT FROM (
     SELECT plan_id FROM public.subscriptions
     WHERE tenant_id = tenants.id AND status = 'ACTIVE'
     LIMIT 1
   ) AND EXISTS (
     SELECT 1 FROM public.subscriptions
     WHERE tenant_id = tenants.id AND status = 'ACTIVE'
   ))
    AS tenants_com_plan_divergente,
  (SELECT COUNT(*) FROM public.users WHERE tenant_id IS NULL)
    AS users_sem_tenant,
  (SELECT COUNT(*) FROM public.tenants WHERE plan_id IS NULL)
    AS tenants_sem_plan,

  -- Catálogo
  (SELECT COUNT(*) FROM public.kiwify_products WHERE billing_cycle IS NULL AND is_active = true)
    AS produtos_sem_billing_cycle,

  -- Totais gerais
  (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'ACTIVE')
    AS total_subs_ativas,
  (SELECT COUNT(*) FROM public.subscriptions WHERE billing_cycle = 'annual' AND status = 'ACTIVE')
    AS total_anuais_ativas,
  (SELECT COUNT(*) FROM public.subscriptions WHERE billing_cycle = 'monthly' AND status = 'ACTIVE')
    AS total_mensais_ativas;
