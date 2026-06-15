-- ============================================================
-- DIAGNÓSTICO — SOMENTE SELECT — NÃO ALTERA DADOS
-- ============================================================
-- Conta:        novo_master_final@incluiai.com
-- Data:         2026-06-12 (reescrito após auditoria de schema)
-- Objetivo:     Identificar divergência de plano/créditos/limite de alunos
--               entre localhost e web para a conta Master/Premium anual
-- ============================================================
-- PROIBIDO: UPDATE, INSERT, DELETE, ALTER, DROP, TRUNCATE
-- Nomes de colunas validados contra supabase/migrations/20260407174103_remote_schema.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. USUÁRIO
--    Nota: plano não fica em users — fica em tenants.plan_id
-- ────────────────────────────────────────────────────────────
SELECT
  u.id,
  u.email,
  u.tenant_id,
  u.full_name,
  u.role,
  u.is_super_admin,
  u.is_active,
  u.created_at,
  u.updated_at
FROM public.users u
WHERE u.email = 'novo_master_final@incluiai.com';

-- ────────────────────────────────────────────────────────────
-- 2. TENANT DO USUÁRIO
--    tenant.plan_id é a fonte de verdade do plano contratado
-- ────────────────────────────────────────────────────────────
SELECT
  t.id,
  t.name,
  t.document,
  t.plan_id,
  t.is_active,
  t.created_at,
  t.updated_at
FROM public.tenants t
WHERE t.id = (
  SELECT tenant_id FROM public.users WHERE email = 'novo_master_final@incluiai.com'
);

-- ────────────────────────────────────────────────────────────
-- 3. ASSINATURAS — todas do tenant desse usuário
--    Ordenadas da mais recente para a mais antiga
-- ────────────────────────────────────────────────────────────
SELECT
  s.id,
  s.tenant_id,
  s.plan_id,
  s.status,
  s.current_period_start,
  s.current_period_end,
  s.next_due_date,
  s.provider,
  s.provider_sub_id,
  s.provider_customer_id,
  s.last_payment_status,
  s.created_at,
  s.updated_at
FROM public.subscriptions s
WHERE s.tenant_id = (
  SELECT tenant_id FROM public.users WHERE email = 'novo_master_final@incluiai.com'
)
ORDER BY s.created_at DESC;

-- ────────────────────────────────────────────────────────────
-- 4. PLANO ATUAL — detalhes do plano linkado à subscription ativa
-- ────────────────────────────────────────────────────────────
SELECT
  p.id,
  p.name,
  p.max_students,
  p.ai_credits_per_month,
  p.price_brl,
  p.is_active,
  p.created_at
FROM public.plans p
WHERE p.id IN (
  SELECT plan_id FROM public.subscriptions
  WHERE tenant_id = (
    SELECT tenant_id FROM public.users WHERE email = 'novo_master_final@incluiai.com'
  )
);

-- Todos os planos (para comparação)
SELECT
  p.id,
  p.name,
  p.max_students,
  p.ai_credits_per_month,
  p.price_brl,
  p.is_active
FROM public.plans p
ORDER BY p.ai_credits_per_month;

-- ────────────────────────────────────────────────────────────
-- 5. CARTEIRA DE CRÉDITOS
--    SELECT * para ver todas as colunas reais sem presumir nomes
-- ────────────────────────────────────────────────────────────
SELECT w.*
FROM public.credits_wallet w
WHERE w.tenant_id = (
  SELECT tenant_id FROM public.users WHERE email = 'novo_master_final@incluiai.com'
);

-- ────────────────────────────────────────────────────────────
-- 6. LEDGER DE CRÉDITOS
--    6a: registros brutos — SELECT * para ver colunas reais
-- ────────────────────────────────────────────────────────────
SELECT l.*
FROM public.credits_ledger l
WHERE l.tenant_id = (
  SELECT tenant_id FROM public.users WHERE email = 'novo_master_final@incluiai.com'
)
LIMIT 20;

-- 6b: agrupado por type (descomentar após confirmar que colunas type/amount existem)
/*
SELECT
  l.type,
  SUM(l.amount)     AS soma_amount,
  COUNT(*)          AS total_lancamentos,
  MIN(l.created_at) AS primeiro_lancamento,
  MAX(l.created_at) AS ultimo_lancamento
FROM public.credits_ledger l
WHERE l.tenant_id = (
  SELECT tenant_id FROM public.users WHERE email = 'novo_master_final@incluiai.com'
)
GROUP BY l.type
ORDER BY l.type;
*/

-- ────────────────────────────────────────────────────────────
-- 7. ALUNOS — totais por status
--    students_own policy filtra deleted_at IS NULL automaticamente;
--    aqui usamos service_role para ver o total real
-- ────────────────────────────────────────────────────────────
SELECT
  COUNT(*)                                            AS total_geral,
  COUNT(*) FILTER (WHERE deleted_at IS NULL
                   AND   is_active = true)            AS ativos,
  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)      AS soft_deletados,
  COUNT(*) FILTER (WHERE is_active = false
                   AND   deleted_at IS NULL)          AS inativos
FROM public.students s
WHERE s.tenant_id = (
  SELECT tenant_id FROM public.users WHERE email = 'novo_master_final@incluiai.com'
);

-- ────────────────────────────────────────────────────────────
-- 8. CONFERÊNCIA MULTI-TENANT
--    tenant_id deve ser o mesmo em users, subscriptions, credits_wallet e students
-- ────────────────────────────────────────────────────────────

-- 8a. tenant_id do usuário
SELECT 'user.tenant_id' AS origem, u.tenant_id
FROM public.users u
WHERE u.email = 'novo_master_final@incluiai.com';

-- 8b. tenant_id das assinaturas
SELECT 'subscription.tenant_id' AS origem, s.tenant_id
FROM public.subscriptions s
WHERE s.tenant_id = (
  SELECT tenant_id FROM public.users WHERE email = 'novo_master_final@incluiai.com'
);

-- 8c. tenant_id da carteira de créditos
SELECT 'credits_wallet.tenant_id' AS origem, w.tenant_id
FROM public.credits_wallet w
WHERE w.tenant_id = (
  SELECT tenant_id FROM public.users WHERE email = 'novo_master_final@incluiai.com'
);

-- 8d. tenant_id dos alunos (distinto + total)
SELECT 'students.tenant_id' AS origem, s.tenant_id, COUNT(*) AS total_alunos
FROM public.students s
WHERE s.tenant_id = (
  SELECT tenant_id FROM public.users WHERE email = 'novo_master_final@incluiai.com'
)
GROUP BY s.tenant_id;

-- ────────────────────────────────────────────────────────────
-- 9. CONFERÊNCIA: tenants.plan_id vs subscriptions (todas) vs plans.max_students
--    JOIN sem filtro de status para não suprimir linhas com valor inesperado
-- ────────────────────────────────────────────────────────────
SELECT
  t.id                          AS tenant_id,
  t.plan_id                     AS tenants_plan_id,
  s.id                          AS subscription_id,
  s.plan_id                     AS subscription_plan_id,
  s.status                      AS subscription_status,
  s.current_period_end,
  s.next_due_date,
  s.created_at                  AS subscription_created_at,
  p.name                        AS plan_name,
  p.max_students,
  p.ai_credits_per_month,
  CASE
    WHEN t.plan_id = s.plan_id THEN 'OK — tenant e subscription concordam'
    ELSE                            'DIVERGÊNCIA — tenants.plan_id != subscriptions.plan_id'
  END AS conferencia_plano
FROM public.tenants t
LEFT JOIN public.subscriptions s
  ON  s.tenant_id = t.id        -- sem filtro de status: mostra todas
LEFT JOIN public.plans p
  ON  p.id = s.plan_id
WHERE t.id = (
  SELECT tenant_id FROM public.users WHERE email = 'novo_master_final@incluiai.com'
)
ORDER BY s.created_at DESC;

-- ────────────────────────────────────────────────────────────
-- FIM DO DIAGNÓSTICO
-- ============================================================