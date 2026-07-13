-- ============================================================
-- DIAGNÓSTICO: Auditoria de produtos Kiwify (kiwify_products)
-- Sprint P1.3-B — 2026-06-16
--
-- SOMENTE LEITURA (SELECT). Nenhuma alteração de dados.
--
-- Objetivo:
--   1. Listar todos os produtos cadastrados com colunas críticas
--   2. Verificar se os 4 produtos esperados existem
--   3. Verificar price_brl vs preços comerciais corretos
--   4. Verificar billing_cycle e product_key
--   5. Identificar UUIDs reais vs placeholders
--   6. Identificar produtos sem checkout_url válida
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Listagem completa dos produtos cadastrados
-- ────────────────────────────────────────────────────────────
SELECT
  kp.kiwify_product_id,
  kp.product_name,
  kp.product_type,
  kp.plan_code,
  kp.billing_cycle,
  kp.price_brl,
  kp.checkout_url,
  kp.is_active,
  kp.created_at,
  -- colunas opcionais (podem não existir em todos os ambientes)
  kp.product_key,
  kp.is_featured,
  kp.display_order
FROM public.kiwify_products kp
ORDER BY kp.plan_code NULLS LAST, kp.billing_cycle;


-- ────────────────────────────────────────────────────────────
-- 2. Verificação dos 4 produtos esperados
--    (PRO_MONTHLY, PRO_ANNUAL, MASTER_MONTHLY, MASTER_ANNUAL)
-- ────────────────────────────────────────────────────────────
WITH expected AS (
  SELECT * FROM (VALUES
    ('PRO',    'monthly', 'PRO_MONTHLY',    79.00,   'https://pay.kiwify.com.br/U0RRsel'),
    ('PRO',    'annual',  'PRO_ANNUAL',     708.00,  'https://pay.kiwify.com.br/Mqcsie2'),
    ('MASTER', 'monthly', 'MASTER_MONTHLY', 147.00,  'https://pay.kiwify.com.br/yVg81A2'),
    ('MASTER', 'annual',  'MASTER_ANNUAL',  1188.00, 'https://pay.kiwify.com.br/Ux6O9pR')
  ) AS t(plan_code, billing_cycle, product_key, expected_price_brl, expected_checkout_url)
)
SELECT
  e.product_key                          AS expected_product_key,
  e.plan_code                            AS expected_plan_code,
  e.billing_cycle                        AS expected_billing_cycle,
  e.expected_price_brl,
  kp.kiwify_product_id                   AS found_uuid,
  kp.price_brl                           AS found_price_brl,
  kp.checkout_url                        AS found_checkout_url,
  kp.is_active                           AS found_is_active,
  CASE
    WHEN kp.kiwify_product_id IS NULL
    THEN 'AUSENTE'
    WHEN kp.kiwify_product_id LIKE 'env_%' OR kp.kiwify_product_id LIKE 'ceo_%'
    THEN 'PLACEHOLDER'
    WHEN kp.kiwify_product_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN 'UUID_REAL'
    ELSE 'FORMATO_DESCONHECIDO'
  END                                    AS uuid_status,
  CASE
    WHEN kp.price_brl IS NULL OR kp.price_brl = 0
    THEN 'PRECO_ZERADO'
    WHEN kp.price_brl <> e.expected_price_brl
    THEN 'PRECO_DIVERGENTE (esperado R$' || e.expected_price_brl::text || ')'
    ELSE 'OK'
  END                                    AS price_status,
  CASE
    WHEN kp.checkout_url IS NULL OR kp.checkout_url = '' OR kp.checkout_url = '#'
    THEN 'URL_VAZIA'
    WHEN kp.checkout_url <> e.expected_checkout_url
    THEN 'URL_DIVERGENTE'
    ELSE 'OK'
  END                                    AS checkout_status
FROM expected e
LEFT JOIN public.kiwify_products kp
  ON upper(kp.product_key) = e.product_key
  AND kp.is_active = true
ORDER BY e.plan_code, e.billing_cycle;


-- ────────────────────────────────────────────────────────────
-- 3. Produtos com price_brl zerado ou ausente
-- ────────────────────────────────────────────────────────────
SELECT
  kp.kiwify_product_id,
  kp.product_key,
  kp.plan_code,
  kp.billing_cycle,
  kp.price_brl,
  'price_brl zerado ou ausente' AS problema
FROM public.kiwify_products kp
WHERE (kp.price_brl IS NULL OR kp.price_brl = 0)
  AND kp.plan_code IS NOT NULL
  AND kp.is_active = true;


-- ────────────────────────────────────────────────────────────
-- 4. Produtos com checkout_url vazio ou inválido
-- ────────────────────────────────────────────────────────────
SELECT
  kp.kiwify_product_id,
  kp.product_key,
  kp.plan_code,
  kp.billing_cycle,
  kp.checkout_url,
  'checkout_url vazio ou placeholder' AS problema
FROM public.kiwify_products kp
WHERE (
  kp.checkout_url IS NULL
  OR kp.checkout_url = ''
  OR kp.checkout_url = '#'
  OR NOT kp.checkout_url LIKE 'http%'
)
AND kp.is_active = true;


-- ────────────────────────────────────────────────────────────
-- 5. Produtos com billing_cycle ausente (relevante para webhook)
-- ────────────────────────────────────────────────────────────
SELECT
  kp.kiwify_product_id,
  kp.product_key,
  kp.plan_code,
  kp.product_type,
  kp.billing_cycle,
  'billing_cycle ausente — webhook pode inferir errado' AS problema
FROM public.kiwify_products kp
WHERE kp.billing_cycle IS NULL
  AND kp.product_type IN ('subscription', 'subscription_monthly', 'subscription_annual')
  AND kp.is_active = true;


-- ────────────────────────────────────────────────────────────
-- 6. Resumo executivo — status do catálogo Kiwify
-- ────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.kiwify_products WHERE is_active = true)
    AS total_produtos_ativos,
  (SELECT COUNT(*) FROM public.kiwify_products
   WHERE is_active = true AND plan_code IS NOT NULL)
    AS produtos_de_plano,
  (SELECT COUNT(*) FROM public.kiwify_products
   WHERE is_active = true AND plan_code IS NULL)
    AS produtos_de_creditos,

  -- Cobertura dos 4 produtos esperados
  (SELECT COUNT(*) FROM public.kiwify_products
   WHERE is_active = true AND upper(product_key) = 'PRO_MONTHLY')
    AS tem_pro_monthly,
  (SELECT COUNT(*) FROM public.kiwify_products
   WHERE is_active = true AND upper(product_key) = 'PRO_ANNUAL')
    AS tem_pro_annual,
  (SELECT COUNT(*) FROM public.kiwify_products
   WHERE is_active = true AND upper(product_key) = 'MASTER_MONTHLY')
    AS tem_master_monthly,
  (SELECT COUNT(*) FROM public.kiwify_products
   WHERE is_active = true AND upper(product_key) = 'MASTER_ANNUAL')
    AS tem_master_annual,

  -- Problemas de dados
  (SELECT COUNT(*) FROM public.kiwify_products
   WHERE is_active = true AND (price_brl IS NULL OR price_brl = 0) AND plan_code IS NOT NULL)
    AS produtos_com_preco_zerado,
  (SELECT COUNT(*) FROM public.kiwify_products
   WHERE is_active = true
     AND (checkout_url IS NULL OR checkout_url = '' OR checkout_url = '#'))
    AS produtos_sem_checkout_url,
  (SELECT COUNT(*) FROM public.kiwify_products
   WHERE is_active = true AND billing_cycle IS NULL
     AND product_type IN ('subscription', 'subscription_monthly', 'subscription_annual'))
    AS produtos_sem_billing_cycle,

  -- UUIDs reais já aplicados
  (SELECT COUNT(*) FROM public.kiwify_products
   WHERE is_active = true
     AND kiwify_product_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    AS produtos_com_uuid_real;


-- ────────────────────────────────────────────────────────────
-- REFERÊNCIA: UUIDs conhecidos e pendentes
-- ────────────────────────────────────────────────────────────
--
-- UUID REAL confirmado:
--   MASTER_ANNUAL  → fa763da0-2d2c-11f1-a3f6-2761766c7eda
--   PRO_ANNUAL     → da18e220-2d30-11f1-b691-1b4aa493422c
--
-- TODO — obter no painel Kiwify (Products > copiar ID):
--   PRO_MONTHLY    → [pendente]
--   MASTER_MONTHLY → [pendente]
-- ────────────────────────────────────────────────────────────