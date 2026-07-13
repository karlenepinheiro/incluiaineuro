-- ============================================================
-- proposed_grant_missing_monthly_credits_DO_NOT_RUN.sql
--
-- PATCH EMERGENCIAL — Créditos mensais faltantes
-- Sprint urgente créditos mensais — 2026-06-16
--
-- ██████████████████████████████████████████████████████████████
-- ⛔  NÃO EXECUTAR SEM REVISÃO MANUAL E APROVAÇÃO EXPLÍCITA  ⛔
-- ██████████████████████████████████████████████████████████████
--
-- PASSOS OBRIGATÓRIOS ANTES DE EXECUTAR:
--   1. Rodar o SELECT de diagnóstico (Bloco 0)
--   2. Revisar linha por linha quais tenants receberiam créditos
--   3. Confirmar que a migration 20260616000003 foi aplicada
--   4. Rodar DRY_RUN (Bloco 1) e revisar o resultado
--   5. Executar o Bloco 2 SOMENTE após aprovação
--   6. Verificar resultado com o Bloco 3 (confirmação pós-execução)
-- ============================================================


-- ============================================================
-- BLOCO 0 — DIAGNÓSTICO: O que seria concedido?
-- (Executar este SELECT primeiro — sem alterar nada)
-- ============================================================

/*
SELECT
  s.tenant_id,
  t.name          AS tenant_name,
  pu.email        AS user_email,
  upper(p.name)   AS plan_code,
  s.billing_cycle,
  s.current_period_end,
  COALESCE(cw.balance, 0) AS balance_atual,
  CASE upper(p.name) WHEN 'MASTER' THEN 700 WHEN 'PRO' THEN 500 ELSE 0 END
                  AS creditos_a_conceder,
  COALESCE(cw.balance, 0) + CASE upper(p.name) WHEN 'MASTER' THEN 700 WHEN 'PRO' THEN 500 ELSE 0 END
                  AS saldo_projetado_apos,
  'monthly_grant:' || s.tenant_id::text || ':' || to_char(now(), 'YYYY-MM')
                  AS operation_id_que_seria_usado,
  CASE
    WHEN s.billing_cycle IS NULL         THEN 'BLOQUEADO — billing_cycle NULL'
    WHEN s.current_period_end < now()    THEN 'BLOQUEADO — assinatura vencida'
    WHEN EXISTS (
      SELECT 1 FROM public.credits_ledger cl
      WHERE cl.tenant_id = s.tenant_id
        AND cl.type = 'monthly_grant'
        AND date_trunc('month', cl.created_at) = date_trunc('month', now())
    )                                    THEN 'BLOQUEADO — já recebeu este mês'
    ELSE 'ELEGÍVEL PARA GRANT'
  END             AS situacao
FROM public.subscriptions s
JOIN public.plans p
  ON p.id = s.plan_id AND upper(p.name) IN ('PRO', 'MASTER')
JOIN public.tenants t
  ON t.id = s.tenant_id AND NOT COALESCE(t.is_internal, false)
  AND COALESCE(t.is_active, true) = true
LEFT JOIN LATERAL (
  SELECT u.email FROM public.users u
  WHERE u.tenant_id = t.id ORDER BY u.created_at ASC LIMIT 1
) pu ON true
LEFT JOIN public.credits_wallet cw ON cw.tenant_id = t.id
WHERE s.status = 'ACTIVE'
ORDER BY
  CASE
    WHEN s.billing_cycle IS NULL      THEN 3
    WHEN s.current_period_end < now() THEN 4
    WHEN EXISTS (
      SELECT 1 FROM public.credits_ledger cl
      WHERE cl.tenant_id = s.tenant_id
        AND cl.type = 'monthly_grant'
        AND date_trunc('month', cl.created_at) = date_trunc('month', now())
    )                                 THEN 5
    ELSE 1
  END,
  t.name;
*/


-- ============================================================
-- BLOCO 1 — DRY_RUN: Simula sem alterar dados
-- (Executar OBRIGATORIAMENTE antes do Bloco 2)
--
-- Pré-requisito: migration 20260616000003 aplicada em produção
-- ============================================================

/*
SELECT
  tenant_id,
  tenant_name,
  user_email,
  plan_code,
  billing_cycle,
  credits_to_grant,
  balance_before,
  balance_after,
  operation_id,
  grant_status,
  detail
FROM public.grant_missing_monthly_credits_for_active_subscriptions(p_dry_run := true)
ORDER BY
  CASE grant_status
    WHEN 'DRY_RUN'              THEN 1  -- ← elegíveis: mostrar primeiro
    WHEN 'BILLING_CYCLE_NULL'   THEN 2
    WHEN 'SUBSCRIPTION_EXPIRED' THEN 3
    WHEN 'ALREADY_GRANTED'      THEN 4
    ELSE 5
  END,
  tenant_name;
*/


-- ============================================================
-- BLOCO 2 — EXECUÇÃO REAL: Concede créditos faltantes
--
-- ⛔ TROCAR ROLLBACK POR COMMIT SOMENTE APÓS REVISAR BLOCO 1
-- ⛔ SÓ EXECUTAR COM APROVAÇÃO EXPLÍCITA
-- ============================================================

/*
BEGIN;

SELECT
  tenant_id,
  tenant_name,
  user_email,
  plan_code,
  billing_cycle,
  credits_to_grant,
  balance_before,
  balance_after,
  operation_id,
  grant_status,
  detail
FROM public.grant_missing_monthly_credits_for_active_subscriptions(p_dry_run := false)
ORDER BY
  CASE grant_status
    WHEN 'GRANTED'              THEN 1
    WHEN 'ALREADY_GRANTED'      THEN 2
    WHEN 'BILLING_CYCLE_NULL'   THEN 3
    WHEN 'SUBSCRIPTION_EXPIRED' THEN 4
    WHEN 'ERROR'                THEN 5
    ELSE 6
  END,
  tenant_name;

-- VERIFICAR as linhas acima antes de prosseguir!
-- GRANTED = créditos concedidos com sucesso
-- ALREADY_GRANTED = já tinha para este mês (OK)
-- BILLING_CYCLE_NULL = NÃO recebeu (anomalia a corrigir separado)
-- SUBSCRIPTION_EXPIRED = NÃO recebeu (assinatura vencida)
-- ERROR = FALHA — investigar manualmente

ROLLBACK;  -- ← trocar por COMMIT após revisão
*/


-- ============================================================
-- BLOCO 3 — CONFIRMAÇÃO PÓS-EXECUÇÃO
-- (Executar logo após o COMMIT do Bloco 2 para validar)
-- ============================================================

/*
-- 3a. Quantas concessões foram feitas?
SELECT
  COUNT(*) FILTER (WHERE grant_status = 'GRANTED')        AS grants_executados,
  COUNT(*) FILTER (WHERE grant_status = 'ALREADY_GRANTED') AS ja_tinham,
  COUNT(*) FILTER (WHERE grant_status = 'BILLING_CYCLE_NULL') AS anomalias_ciclo_null,
  COUNT(*) FILTER (WHERE grant_status = 'SUBSCRIPTION_EXPIRED') AS vencidas_ignoradas,
  COUNT(*) FILTER (WHERE grant_status = 'ERROR')           AS erros,
  SUM(credits_to_grant) FILTER (WHERE grant_status = 'GRANTED') AS total_creditos_concedidos
FROM public.grant_missing_monthly_credits_for_active_subscriptions(p_dry_run := true);
-- Nota: com dry_run=true aqui, GRANTED virará DRY_RUN (já foram concedidos).
-- Depois do COMMIT real, todos os elegíveis virarão ALREADY_GRANTED.

-- 3b. Verificar ledger das concessões feitas agora
SELECT
  cl.tenant_id,
  t.name   AS tenant_name,
  cl.amount,
  cl.type,
  cl.description,
  cl.source,
  cl.operation_id,
  cl.created_at
FROM public.credits_ledger cl
JOIN public.tenants t ON t.id = cl.tenant_id
WHERE cl.type = 'monthly_grant'
  AND date_trunc('month', cl.created_at) = date_trunc('month', now())
  AND cl.source = 'grant_missing_monthly_credits'
ORDER BY cl.created_at DESC;

-- 3c. Verificar saldos atuais dos tenants que receberam
SELECT
  t.id     AS tenant_id,
  t.name   AS tenant_name,
  cw.balance,
  cw.last_credit_grant_at,
  cw.next_credit_grant_at,
  cw.last_reset_at,
  cw.updated_at
FROM public.credits_wallet cw
JOIN public.tenants t ON t.id = cw.tenant_id
WHERE EXISTS (
  SELECT 1 FROM public.credits_ledger cl
  WHERE cl.tenant_id = cw.tenant_id
    AND cl.type   = 'monthly_grant'
    AND cl.source = 'grant_missing_monthly_credits'
    AND date_trunc('month', cl.created_at) = date_trunc('month', now())
)
ORDER BY t.name;
*/


-- ============================================================
-- BLOCO 4 — MESES ANTERIORES (SE NECESSÁRIO)
-- Verificar se meses anteriores também estão faltando grant
-- ============================================================

/*
SELECT
  s.tenant_id,
  t.name          AS tenant_name,
  pu.email        AS user_email,
  upper(p.name)   AS plan_code,
  s.billing_cycle,
  s.current_period_start,
  -- Quantos meses desde a ativação sem grant?
  EXTRACT(MONTH FROM age(now(), COALESCE(s.current_period_start, s.created_at)))::int
                  AS meses_sem_grant_estimado,
  CASE upper(p.name) WHEN 'MASTER' THEN 700 WHEN 'PRO' THEN 500 ELSE 0 END
                  AS creditos_por_mes,
  -- Crédito retroativo total estimado
  EXTRACT(MONTH FROM age(now(), COALESCE(s.current_period_start, s.created_at)))::int
    * CASE upper(p.name) WHEN 'MASTER' THEN 700 WHEN 'PRO' THEN 500 ELSE 0 END
                  AS credito_retroativo_estimado,
  (SELECT MAX(cl.created_at)
   FROM public.credits_ledger cl
   WHERE cl.tenant_id = s.tenant_id AND cl.type = 'monthly_grant')
                  AS ultimo_monthly_grant_qualquer_mes
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id AND upper(p.name) IN ('PRO', 'MASTER')
JOIN public.tenants t ON t.id = s.tenant_id AND NOT COALESCE(t.is_internal, false)
LEFT JOIN LATERAL (
  SELECT u.email FROM public.users u
  WHERE u.tenant_id = t.id ORDER BY u.created_at ASC LIMIT 1
) pu ON true
WHERE s.status = 'ACTIVE'
  AND s.billing_cycle IS NOT NULL
  AND (s.current_period_end IS NULL OR s.current_period_end >= now())
  AND (
    SELECT COUNT(DISTINCT to_char(cl.created_at, 'YYYY-MM'))
    FROM public.credits_ledger cl
    WHERE cl.tenant_id = s.tenant_id AND cl.type = 'monthly_grant'
  ) < GREATEST(1, EXTRACT(MONTH FROM age(now(), COALESCE(s.current_period_start, s.created_at)))::int)
ORDER BY meses_sem_grant_estimado DESC;
*/


-- ============================================================
-- REFERÊNCIA — Estados de grant_status possíveis
-- ============================================================
--
-- GRANTED              → créditos concedidos com sucesso (apenas quando p_dry_run=false)
-- DRY_RUN              → seria concedido (apenas quando p_dry_run=true)
-- ALREADY_GRANTED      → já existia monthly_grant neste mês (idempotente)
-- BILLING_CYCLE_NULL   → anomalia: billing_cycle não definido, não concedido
-- SUBSCRIPTION_EXPIRED → current_period_end no passado, não concedido
-- TENANT_INACTIVE      → tenant.is_active = false, não concedido
-- ERROR                → falha técnica ao conceder (investigar)
--
-- ============================================================
-- FIM DO ARQUIVO
-- Nenhuma instrução SQL executável fora de comentários.
-- ============================================================