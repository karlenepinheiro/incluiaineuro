-- ============================================================================
-- AUDITORIA DE DADOS — MODELO DE NEGÓCIO INCLUIAI
-- Arquivo : 20260612_audit_business_plans_data.sql
-- Data    : 2026-06-15
-- Autor   : auditoria automática — sem alteração de dados
-- Regras  : SOMENTE SELECT — nenhum UPDATE/INSERT/DELETE/ALTER/DROP
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. TODOS OS PLANOS CADASTRADOS (tabela plans)
--    Diagnóstico: nomes, créditos, preços, limite de alunos
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  id,
  name,
  -- créditos mensais: coluna pode ser ai_credits_per_month ou credits_monthly
  COALESCE(
    NULLIF(
      (SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'plans'
          AND column_name = 'ai_credits_per_month' LIMIT 1),
      ''
    ),
    'credits_monthly'
  ) AS creditos_col_detectada,
  is_active,
  created_at
FROM plans
ORDER BY created_at;

-- Versão alternativa — seleciona apenas colunas seguramente existentes:
SELECT *
FROM plans
ORDER BY created_at;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. ASSINATURAS AGRUPADAS POR STATUS E CICLO
--    Diagnóstico: quantos ACTIVE/OVERDUE/CANCELED, quantos monthly/annual
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  s.status,
  s.billing_cycle,
  p.name AS plan_name,
  COUNT(*)                                              AS total,
  COUNT(*) FILTER (WHERE s.current_period_end < now())  AS vencidas,
  COUNT(*) FILTER (WHERE s.current_period_end >= now()) AS vigentes,
  MIN(s.current_period_end)                             AS menor_expiry,
  MAX(s.current_period_end)                             AS maior_expiry
FROM subscriptions s
LEFT JOIN plans p ON p.id = s.plan_id
GROUP BY s.status, s.billing_cycle, p.name
ORDER BY s.status, s.billing_cycle, p.name;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ASSINATURAS SEM billing_cycle (potencial inconsistência)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  s.id,
  s.tenant_id,
  s.status,
  s.billing_cycle,
  p.name AS plan_name,
  s.current_period_end,
  s.provider,
  s.created_at
FROM subscriptions s
LEFT JOIN plans p ON p.id = s.plan_id
WHERE s.billing_cycle IS NULL
ORDER BY s.created_at DESC
LIMIT 50;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. ASSINATURAS ATIVAS COM current_period_end VENCIDO (risco de acesso indevido)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  s.id,
  s.tenant_id,
  s.status,
  s.billing_cycle,
  p.name AS plan_name,
  s.current_period_end,
  (now() - s.current_period_end) AS dias_vencido,
  s.provider,
  s.last_payment_status,
  s.created_at
FROM subscriptions s
LEFT JOIN plans p ON p.id = s.plan_id
WHERE s.status IN ('ACTIVE', 'PENDING', 'TRIAL', 'COURTESY', 'INTERNAL_TEST')
  AND s.current_period_end IS NOT NULL
  AND s.current_period_end < now()
ORDER BY s.current_period_end ASC
LIMIT 50;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. CONTAGEM DE TENANTS POR PLANO ATIVO
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  p.name AS plan_name,
  s.status,
  COUNT(DISTINCT t.id) AS total_tenants
FROM tenants t
LEFT JOIN subscriptions s ON s.tenant_id = t.id
LEFT JOIN plans p ON p.id = s.plan_id
GROUP BY p.name, s.status
ORDER BY p.name, s.status;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. WALLETS COM last_reset_at NULL (créditos mensais nunca foram registrados)
-- ────────────────────────────────────────────────────────────────────────────
SELECT COUNT(*) AS wallets_sem_last_reset_at
FROM credits_wallet
WHERE last_reset_at IS NULL;

SELECT
  cw.tenant_id,
  cw.balance,
  cw.last_reset_at,
  cw.updated_at,
  s.status AS subscription_status,
  p.name   AS plan_name,
  s.billing_cycle,
  s.current_period_end
FROM credits_wallet cw
LEFT JOIN subscriptions s ON s.tenant_id = cw.tenant_id
LEFT JOIN plans p ON p.id = s.plan_id
WHERE cw.last_reset_at IS NULL
ORDER BY cw.updated_at DESC
LIMIT 10;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. WALLETS COM last_credit_grant_at NULL (se coluna existir)
--    (migration 20260519 adicionou esta coluna)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  COUNT(*) FILTER (WHERE last_credit_grant_at IS NULL) AS wallets_sem_grant_at,
  COUNT(*) FILTER (WHERE next_credit_grant_at IS NULL) AS wallets_sem_next_grant_at,
  COUNT(*)                                              AS total_wallets
FROM credits_wallet;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. DISTRIBUIÇÃO DE SALDO NAS WALLETS
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  CASE
    WHEN balance = 0         THEN '0 créditos'
    WHEN balance BETWEEN 1 AND 30    THEN '1-30 (FREE risco)'
    WHEN balance BETWEEN 31 AND 60   THEN '31-60 (FREE normal)'
    WHEN balance BETWEEN 61 AND 100  THEN '61-100'
    WHEN balance BETWEEN 101 AND 499 THEN '101-499'
    WHEN balance BETWEEN 500 AND 700 THEN '500-700 (PRO/MASTER)'
    WHEN balance > 700       THEN '>700 (inflado ou avulso)'
    ELSE 'negativo (erro)'
  END AS faixa,
  COUNT(*) AS wallets,
  MIN(balance) AS min_saldo,
  MAX(balance) AS max_saldo,
  AVG(balance)::NUMERIC(10,2) AS media_saldo
FROM credits_wallet
GROUP BY faixa
ORDER BY MIN(balance);

-- ────────────────────────────────────────────────────────────────────────────
-- 9. LEDGER AGRUPADO POR TYPE (fonte de verdade de operações)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  type,
  COUNT(*)                              AS total_operacoes,
  SUM(amount) FILTER (WHERE amount > 0) AS total_concedido,
  SUM(amount) FILTER (WHERE amount < 0) AS total_debitado,
  SUM(amount)                           AS saldo_liquido,
  MIN(created_at)                       AS primeira_op,
  MAX(created_at)                       AS ultima_op
FROM credits_ledger
GROUP BY type
ORDER BY type;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. EXEMPLOS: 10 ASSINATURAS MAIS RECENTES (com plano e ciclo)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  s.id,
  s.tenant_id,
  p.name   AS plan_name,
  s.status,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  s.next_due_date,
  s.provider,
  s.last_payment_status,
  s.created_at
FROM subscriptions s
LEFT JOIN plans p ON p.id = s.plan_id
ORDER BY s.created_at DESC
LIMIT 10;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. EXEMPLOS: 10 WALLETS COM last_reset_at NULL
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  cw.id,
  cw.tenant_id,
  cw.balance,
  cw.last_reset_at,
  cw.updated_at
FROM credits_wallet cw
WHERE cw.last_reset_at IS NULL
ORDER BY cw.updated_at DESC
LIMIT 10;

-- ────────────────────────────────────────────────────────────────────────────
-- 12. EXEMPLOS: CONTAS PRO (10 mais recentes)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  s.tenant_id,
  p.name    AS plan_name,
  s.status,
  s.billing_cycle,
  s.current_period_end,
  cw.balance,
  cw.last_reset_at,
  s.provider,
  s.created_at
FROM subscriptions s
JOIN plans p ON p.id = s.plan_id AND upper(p.name) = 'PRO'
LEFT JOIN credits_wallet cw ON cw.tenant_id = s.tenant_id
ORDER BY s.created_at DESC
LIMIT 10;

-- ────────────────────────────────────────────────────────────────────────────
-- 13. EXEMPLOS: CONTAS MASTER/PREMIUM (10 mais recentes)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  s.tenant_id,
  p.name    AS plan_name,
  s.status,
  s.billing_cycle,
  s.current_period_end,
  cw.balance,
  cw.last_reset_at,
  s.provider,
  s.created_at
FROM subscriptions s
JOIN plans p ON p.id = s.plan_id AND upper(p.name) IN ('MASTER', 'PREMIUM')
LEFT JOIN credits_wallet cw ON cw.tenant_id = s.tenant_id
ORDER BY s.created_at DESC
LIMIT 10;

-- ────────────────────────────────────────────────────────────────────────────
-- 14. ASSINATURAS ANUAIS — verifica se current_period_end é ~365 dias ou ~30 dias
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  s.id,
  s.tenant_id,
  p.name   AS plan_name,
  s.status,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  -- diferença em dias entre start e end
  CASE
    WHEN s.current_period_start IS NOT NULL
    THEN EXTRACT(DAY FROM (s.current_period_end - s.current_period_start))::INTEGER
  END AS dias_periodo,
  s.provider,
  s.created_at
FROM subscriptions s
LEFT JOIN plans p ON p.id = s.plan_id
WHERE s.billing_cycle = 'annual'
ORDER BY s.created_at DESC
LIMIT 20;

-- ────────────────────────────────────────────────────────────────────────────
-- 15. PRODUTOS KIWIFY CADASTRADOS (fonte de checkout links)
-- ────────────────────────────────────────────────────────────────────────────
SELECT *
FROM kiwify_products
ORDER BY created_at;

-- ────────────────────────────────────────────────────────────────────────────
-- 16. COMPRAS KIWIFY: STATUS E ATIVAÇÃO (últimas 20)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  id,
  email,
  product_key,
  plan_code,
  credits_amount,
  status,
  provider_order_id,
  tenant_id,
  activated_at,
  paid_at,
  created_at
FROM kiwify_purchases
ORDER BY created_at DESC
LIMIT 20;

-- ────────────────────────────────────────────────────────────────────────────
-- 17. COMPRAS APROVADAS SEM ATIVAÇÃO (risco de não-ativação)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  id,
  email,
  product_key,
  plan_code,
  status,
  tenant_id,
  paid_at,
  created_at,
  (now() - paid_at) AS tempo_sem_ativacao
FROM kiwify_purchases
WHERE status = 'APPROVED'
  AND activated_at IS NULL
ORDER BY paid_at ASC
LIMIT 20;

-- ────────────────────────────────────────────────────────────────────────────
-- 18. DIVERGÊNCIA WALLET x LEDGER (integridade dos créditos)
--     Detecta tenants onde wallet.balance ≠ SUM(ledger.amount)
-- ────────────────────────────────────────────────────────────────────────────
WITH ledger_sum AS (
  SELECT tenant_id, SUM(amount) AS ledger_balance
  FROM credits_ledger
  GROUP BY tenant_id
)
SELECT
  cw.tenant_id,
  cw.balance       AS wallet_balance,
  ls.ledger_balance,
  (cw.balance - COALESCE(ls.ledger_balance, 0)) AS divergencia
FROM credits_wallet cw
LEFT JOIN ledger_sum ls ON ls.tenant_id = cw.tenant_id
WHERE cw.balance <> COALESCE(ls.ledger_balance, 0)
ORDER BY ABS(cw.balance - COALESCE(ls.ledger_balance, 0)) DESC
LIMIT 30;

-- ────────────────────────────────────────────────────────────────────────────
-- 19. RESUMO EXECUTIVO — TODOS OS INDICADORES EM UM ÚNICO SELECT
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM plans WHERE is_active = true)                                           AS planos_ativos,
  (SELECT COUNT(*) FROM subscriptions WHERE status = 'ACTIVE')                                  AS assinaturas_ativas,
  (SELECT COUNT(*) FROM subscriptions WHERE status = 'OVERDUE')                                 AS assinaturas_inadimplentes,
  (SELECT COUNT(*) FROM subscriptions WHERE status = 'CANCELED')                                AS assinaturas_canceladas,
  (SELECT COUNT(*) FROM subscriptions WHERE billing_cycle IS NULL)                              AS subs_sem_billing_cycle,
  (SELECT COUNT(*) FROM subscriptions WHERE billing_cycle = 'annual')                           AS subs_anuais,
  (SELECT COUNT(*) FROM subscriptions WHERE billing_cycle = 'monthly')                          AS subs_mensais,
  (SELECT COUNT(*) FROM subscriptions
    WHERE status IN ('ACTIVE','PENDING','TRIAL','COURTESY','INTERNAL_TEST')
      AND current_period_end < now())                                                            AS subs_ativas_vencidas,
  (SELECT COUNT(*) FROM credits_wallet)                                                         AS total_wallets,
  (SELECT COUNT(*) FROM credits_wallet WHERE last_reset_at IS NULL)                             AS wallets_sem_last_reset_at,
  (SELECT COUNT(*) FROM credits_wallet WHERE balance = 0)                                       AS wallets_zeradas,
  (SELECT COUNT(*) FROM credits_wallet WHERE balance < 0)                                       AS wallets_negativas,
  (SELECT COUNT(*) FROM kiwify_purchases WHERE status = 'APPROVED' AND activated_at IS NULL)    AS compras_nao_ativadas,
  (SELECT COUNT(*) FROM kiwify_products WHERE is_active = true)                                 AS produtos_kiwify_ativos;

-- ────────────────────────────────────────────────────────────────────────────
-- 20. ÚLTIMAS 20 ENTRADAS DO LEDGER (operações mais recentes)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  id,
  tenant_id,
  type,
  amount,
  description,
  source,
  operation,
  created_at
FROM credits_ledger
ORDER BY created_at DESC
LIMIT 20;

-- ────────────────────────────────────────────────────────────────────────────
-- FIM DA AUDITORIA DE DADOS
-- Nenhum dado foi alterado. Somente SELECTs executados.
-- ============================================================================