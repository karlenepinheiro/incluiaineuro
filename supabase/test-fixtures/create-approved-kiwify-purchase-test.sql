-- ============================================================
-- create-approved-kiwify-purchase-test.sql
--
-- Fixture de teste: simula compra aprovada da Kiwify.
--
-- ⚠️  NÃO EXECUTAR EM PRODUÇÃO.
-- ⚠️  Usar somente em Supabase LOCAL ou HOMOLOGAÇÃO.
-- ⚠️  Ambiente atual identificado: PRODUÇÃO.
--     Execute APENAS após migrar para ambiente isolado.
--
-- Propósito: validar o fluxo positivo de cadastro via Kiwify Gate.
-- ============================================================


-- ============================================================
-- PASSO 0 — PRE_SCHEMA_CHECK
-- Confirmar schema real antes de qualquer inserção.
-- Execute este bloco primeiro e revise a saída.
-- ============================================================

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'kiwify_purchases',
    'kiwify_products',
    'users',
    'tenants',
    'subscriptions',
    'credits_wallet',
    'credits_ledger'
  )
ORDER BY table_name, ordinal_position;

-- Confirmar constraint UNIQUE de provider_order_id
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema   = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name   = 'kiwify_purchases'
  AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY');

-- Confirmar valores de status reais existentes na tabela
SELECT DISTINCT status FROM public.kiwify_purchases ORDER BY status;

-- Confirmar product_keys dos produtos ativos
SELECT
  kiwify_product_id,
  product_name,
  product_key,
  plan_code,
  billing_cycle,
  is_active
FROM public.kiwify_products
WHERE is_active = true
ORDER BY display_order;


-- ============================================================
-- PASSO 1 — LOCALIZAR COMPRA APROVADA EXISTENTE (somente leitura)
-- Use para encontrar uma compra disponível sem criar dados sintéticos.
-- Substitua o e-mail abaixo por e-mail autorizado pela CEO.
-- ============================================================

/*
-- Busca por e-mail específico (preencher e-mail autorizado):
SELECT
  lower(email)                                       AS email,
  status,
  product_key,
  plan_code,
  billing_cycle,
  paid_at,
  activated_at,
  tenant_id,
  left(provider_order_id, 8) || '...'               AS order_id_parcial,
  id
FROM public.kiwify_purchases
WHERE lower(trim(email)) = lower(trim('EMAIL_AUTORIZADO_AQUI'))
ORDER BY paid_at DESC NULLS LAST;
*/

-- Busca genérica: todas as compras aprovadas não ativadas (sem expor e-mails)
SELECT
  count(*) AS total_aprovadas_sem_ativar,
  product_key,
  plan_code,
  billing_cycle,
  min(paid_at) AS mais_antiga,
  max(paid_at) AS mais_recente
FROM public.kiwify_purchases
WHERE status       = 'APPROVED'
  AND activated_at IS NULL
  AND product_key != 'UNKNOWN'
GROUP BY product_key, plan_code, billing_cycle
ORDER BY max(paid_at) DESC;


-- ============================================================
-- PASSO 2 — INSERÇÃO SINTÉTICA DE TESTE
-- ⚠️  Executar SOMENTE EM LOCAL / HOMOLOGAÇÃO.
-- ⚠️  Não executar em produção.
--
-- Selecione um product_key real de kiwify_products.is_active = true.
-- Confirme o plan_code real antes de usar.
-- ============================================================

/*
DO $$
DECLARE
  v_test_order_id text := 'TEST-' || gen_random_uuid()::text;
  v_product_key   text := 'PRO_MONTHLY';   -- ajustar conforme PRE_SCHEMA_CHECK
  v_plan_code     text := 'PRO';           -- ajustar conforme PRE_SCHEMA_CHECK
BEGIN
  INSERT INTO public.kiwify_purchases (
    email,
    product_key,
    plan_code,
    credits_amount,
    provider_order_id,
    status,
    paid_at,
    activated_at,
    tenant_id
  ) VALUES (
    'teste.kiwify.fixture@incluiai.test',  -- e-mail claramente de teste
    v_product_key,
    v_plan_code,
    0,                                     -- 0 para assinatura; >0 para créditos avulsos
    v_test_order_id,
    'APPROVED',
    '2026-07-02 10:00:00+00',             -- data fixa e explícita
    NULL,                                  -- não ativada (condição obrigatória)
    NULL                                   -- sem tenant (não criar usuário ainda)
  );

  RAISE NOTICE 'Fixture inserida: % | order_id: %', 'teste.kiwify.fixture@incluiai.test', v_test_order_id;
END;
$$;
*/


-- ============================================================
-- PASSO 3 — VERIFICAR FIXTURE CRIADA (somente leitura)
-- Executar após o PASSO 2 para confirmar a inserção.
-- ============================================================

/*
SELECT
  lower(email)                       AS email,
  status,
  product_key,
  plan_code,
  paid_at,
  activated_at,
  tenant_id,
  left(provider_order_id, 12)        AS order_id_inicio
FROM public.kiwify_purchases
WHERE lower(email) = 'teste.kiwify.fixture@incluiai.test'
ORDER BY created_at DESC;
*/


-- ============================================================
-- PASSO 4 — LIMPEZA DA FIXTURE (executar após o teste)
-- Remove apenas a compra sintética. Não afeta dados reais.
-- ============================================================

/*
DELETE FROM public.kiwify_purchases
WHERE lower(email) = 'teste.kiwify.fixture@incluiai.test'
  AND provider_order_id LIKE 'TEST-%';

-- Confirmar remoção:
SELECT count(*) AS remanescentes
FROM public.kiwify_purchases
WHERE lower(email) = 'teste.kiwify.fixture@incluiai.test';
*/
