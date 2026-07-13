-- ============================================================
-- proposed_fix_legacy_annual_subscriptions_DO_NOT_RUN.sql
--
-- SPRINT P1.3-B/C — Patch proposto para assinaturas legadas
--
-- ██████████████████████████████████████████████████████████████
-- ⛔  NÃO EXECUTAR SEM REVISÃO MANUAL E APROVAÇÃO EXPLÍCITA  ⛔
-- ██████████████████████████████████████████████████████████████
--
-- Este arquivo contém UPDATEs comentados para corrigir dados
-- de assinaturas criadas antes da Sprint P1 (2026-06-15).
--
-- ANTES DE EXECUTAR qualquer bloco:
--   1. Rodar o SELECT de diagnóstico correspondente
--   2. Revisar os registros afetados
--   3. Confirmar que o UPDATE é seguro para cada tenant
--   4. Executar dentro de BEGIN/ROLLBACK para verificar o plano
--   5. Só então trocar ROLLBACK por COMMIT
--
-- SEPARAÇÃO DE CASOS:
--   - CASO SEGURO: evidência clara de que o ciclo estava errado
--     (ex.: product_key contém 'ANNUAL' mas period_end = 30 dias)
--   - CASO AMBÍGUO: não há evidência suficiente; listar para decisão manual
-- ============================================================


-- ============================================================
-- BLOCO 1 — ANUAIS COM PERÍODO ERRADO (CASO SEGURO)
--
-- Critério de segurança:
--   - billing_cycle = 'annual' (o ciclo já está gravado corretamente)
--   - current_period_end - current_period_start < 300 dias
--     (indica bug: foi gravado 30 dias em vez de 12 meses)
--   - status = 'ACTIVE'
--   - Existe compra Kiwify aprovada com product_key LIKE '%ANNUAL%'
--     vinculada ao mesmo tenant (confirmação externa do ciclo)
--
-- Correção: estender current_period_end para
--   current_period_start + 12 meses
--   (isto replica o comportamento correto da Sprint P1)
-- ============================================================

-- DIAGNÓSTICO (executar primeiro):
/*
SELECT
  s.id              AS subscription_id,
  s.tenant_id,
  upper(p.name)     AS plan_name,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  EXTRACT(DAY FROM (s.current_period_end - s.current_period_start))::int AS period_length_days,
  s.current_period_start + interval '12 months' AS proposed_new_period_end,
  kp.product_key    AS confirmed_by_purchase
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id = s.plan_id
JOIN public.kiwify_purchases kp
  ON kp.tenant_id = s.tenant_id
  AND kp.status   = 'APPROVED'
  AND upper(kp.product_key) LIKE '%ANNUAL%'
WHERE s.billing_cycle = 'annual'
  AND s.status = 'ACTIVE'
  AND s.current_period_start IS NOT NULL
  AND s.current_period_end IS NOT NULL
  AND (s.current_period_end - s.current_period_start) < interval '300 days'
ORDER BY s.current_period_end ASC;
*/

-- UPDATE PROPOSTO — CASO SEGURO (NÃO EXECUTAR SEM APROVAÇÃO):
/*
BEGIN;

UPDATE public.subscriptions s
SET
  current_period_end = s.current_period_start + interval '12 months',
  updated_at         = now()
FROM public.kiwify_purchases kp
WHERE kp.tenant_id    = s.tenant_id
  AND kp.status       = 'APPROVED'
  AND upper(kp.product_key) LIKE '%ANNUAL%'
  AND s.billing_cycle = 'annual'
  AND s.status        = 'ACTIVE'
  AND s.current_period_start IS NOT NULL
  AND s.current_period_end   IS NOT NULL
  AND (s.current_period_end - s.current_period_start) < interval '300 days'
RETURNING
  s.id,
  s.tenant_id,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end  -- novo valor após UPDATE
;

-- VERIFICAR os rows afetados antes de commitar!
ROLLBACK; -- trocar por COMMIT após revisão

*/


-- ============================================================
-- BLOCO 2 — PREENCHIMENTO DE billing_cycle NULO EM PLANOS PAGOS
--           COM EVIDÊNCIA DE PRODUTO ANUAL (CASO SEGURO)
--
-- Critério de segurança:
--   - billing_cycle IS NULL
--   - plan_code IN ('PRO', 'MASTER')
--   - status = 'ACTIVE'
--   - Existe compra Kiwify com product_key LIKE '%ANNUAL%'
--     E period_length > 300 dias → inferir 'annual'
--   OU
--   - Existe compra Kiwify com product_key LIKE '%MONTHLY%'
--     E period_length <= 45 dias → inferir 'monthly'
--
-- Registro sem compra confirmada → CASO AMBÍGUO (bloco 3)
-- ============================================================

-- DIAGNÓSTICO — billing_cycle NULL com evidência anual:
/*
SELECT
  s.id              AS subscription_id,
  s.tenant_id,
  upper(p.name)     AS plan_name,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  EXTRACT(DAY FROM (s.current_period_end - s.current_period_start))::int AS period_length_days,
  kp.product_key    AS purchase_product_key,
  'annual'          AS proposed_billing_cycle
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id = s.plan_id
JOIN public.kiwify_purchases kp
  ON kp.tenant_id = s.tenant_id
  AND kp.status   = 'APPROVED'
  AND upper(kp.product_key) LIKE '%ANNUAL%'
WHERE s.billing_cycle IS NULL
  AND upper(p.name) IN ('PRO', 'MASTER', 'PREMIUM')
  AND s.status = 'ACTIVE'
ORDER BY s.created_at DESC;
*/

-- UPDATE PROPOSTO — billing_cycle NULL → 'annual' (NÃO EXECUTAR SEM APROVAÇÃO):
/*
BEGIN;

UPDATE public.subscriptions s
SET
  billing_cycle = 'annual',
  updated_at    = now()
FROM public.kiwify_purchases kp
LEFT JOIN public.plans p ON p.id = s.plan_id
WHERE kp.tenant_id     = s.tenant_id
  AND kp.status        = 'APPROVED'
  AND upper(kp.product_key) LIKE '%ANNUAL%'
  AND s.billing_cycle  IS NULL
  AND upper(p.name)    IN ('PRO', 'MASTER', 'PREMIUM')
  AND s.status         = 'ACTIVE'
RETURNING
  s.id,
  s.tenant_id,
  s.billing_cycle  -- deve mostrar 'annual' após UPDATE
;

ROLLBACK; -- trocar por COMMIT após revisão

*/

-- UPDATE PROPOSTO — billing_cycle NULL → 'monthly' com evidência mensal:
/*
BEGIN;

UPDATE public.subscriptions s
SET
  billing_cycle = 'monthly',
  updated_at    = now()
FROM public.kiwify_purchases kp
LEFT JOIN public.plans p ON p.id = s.plan_id
WHERE kp.tenant_id    = s.tenant_id
  AND kp.status       = 'APPROVED'
  AND upper(kp.product_key) LIKE '%MONTHLY%'
  AND s.billing_cycle IS NULL
  AND upper(p.name)   IN ('PRO', 'MASTER', 'PREMIUM')
  AND s.status        = 'ACTIVE'
RETURNING
  s.id,
  s.tenant_id,
  s.billing_cycle  -- deve mostrar 'monthly' após UPDATE
;

ROLLBACK; -- trocar por COMMIT após revisão

*/


-- ============================================================
-- BLOCO 3 — CASOS AMBÍGUOS (NÃO CORRIGIR AUTOMATICAMENTE)
--
-- Listar para decisão manual:
--   - billing_cycle NULL sem compra confirmada (provider = 'manual' ou legacy)
--   - billing_cycle NULL com period_length indeterminado
--   - billing_cycle 'annual' mas SEM compra anual confirmada
-- ============================================================

-- DIAGNÓSTICO — billing_cycle NULL sem compra confirmada:
/*
SELECT
  s.id              AS subscription_id,
  s.tenant_id,
  t.name            AS tenant_name,
  upper(p.name)     AS plan_name,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  EXTRACT(DAY FROM (s.current_period_end - s.current_period_start))::int AS period_length_days,
  s.provider,
  s.created_at,
  'AMBIGUO — sem compra Kiwify confirmada; decisão manual necessária' AS nota
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id = s.plan_id
LEFT JOIN public.tenants t ON t.id = s.tenant_id
WHERE s.billing_cycle IS NULL
  AND upper(p.name) IN ('PRO', 'MASTER', 'PREMIUM')
  AND s.status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM public.kiwify_purchases kp
    WHERE kp.tenant_id = s.tenant_id
      AND kp.status    = 'APPROVED'
      AND kp.product_key IS NOT NULL
  )
ORDER BY s.created_at DESC;
*/

-- DIAGNÓSTICO — billing_cycle 'annual' mas SEM compra anual confirmada:
/*
SELECT
  s.id              AS subscription_id,
  s.tenant_id,
  t.name            AS tenant_name,
  upper(p.name)     AS plan_name,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  EXTRACT(DAY FROM (s.current_period_end - s.current_period_start))::int AS period_length_days,
  s.provider,
  s.created_at,
  'AMBIGUO — billing_cycle=annual sem compra anual na Kiwify; verificar manualmente' AS nota
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id = s.plan_id
LEFT JOIN public.tenants t ON t.id = s.tenant_id
WHERE s.billing_cycle = 'annual'
  AND s.status        = 'ACTIVE'
  AND (s.current_period_end - s.current_period_start) < interval '300 days'
  AND NOT EXISTS (
    SELECT 1 FROM public.kiwify_purchases kp
    WHERE kp.tenant_id = s.tenant_id
      AND kp.status    = 'APPROVED'
      AND upper(kp.product_key) LIKE '%ANNUAL%'
  )
ORDER BY s.created_at DESC;
*/

-- ============================================================
-- FIM DO ARQUIVO
-- Nenhuma instrução SQL executável fora de comentários.
-- ============================================================