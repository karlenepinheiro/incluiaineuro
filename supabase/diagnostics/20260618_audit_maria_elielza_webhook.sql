-- ============================================================
-- 20260618_audit_maria_elielza_webhook.sql
--
-- DIAGNÓSTICO: Maria Elielza Pereira de Melo — etapa 2
--
-- Resultado do diagnóstico anterior (20260617_audit_maria_elielza.sql):
--   classificação: NOT_FOUND_IN_PURCHASES
--   ação sugerida: compra não encontrada em kiwify_purchases;
--                  verificar kiwify_webhook_logs.
--
-- Email Kiwify confirmado: elielzamelo26@gmail.com
-- Compra: PLANO PRO ANUAL — 07/05/2026 ~19:16 (horário Brasil = UTC-3 → ~22:16 UTC)
--
-- OBJETIVO deste arquivo:
--   1. Auditar kiwify_webhook_logs em busca do evento desta compra.
--   2. Auditar todas as compras PRO ANUAL de 07-08/05/2026 sem tenant_id.
--   3. Se o webhook chegou mas não foi processado: identificar o motivo.
--   4. Se o webhook NÃO chegou: preparar procedimento DO_NOT_RUN para
--      inserção manual em kiwify_purchases + ativação da conta.
--
-- COLUNAS CONFIRMADAS:
--   kiwify_purchases → id, email, product_key, plan_code, credits_amount,
--                      provider_order_id, status, payload (jsonb), paid_at,
--                      activated_at, tenant_id, created_at, activation_status (GENERATED)
--                      NÃO EXISTE: product_name, kiwify_product_id
--   kiwify_products  → kiwify_product_id, product_name, product_type,
--                      plan_code, billing_cycle, product_key, credits_amount,
--                      price_brl, checkout_url, is_active
--   users            → full_name (NOT NULL), nome (nullable) — NÃO EXISTE users.name
--
-- APENAS SELECT nas seções A–D (seguro).
-- Seção E = DO_NOT_RUN (não executar sem autorização da CEO).
-- ============================================================


-- ============================================================
-- PRE_SCHEMA_CHECK: kiwify_webhook_logs
-- (confirmar colunas antes de referenciar)
-- ============================================================
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'kiwify_webhook_logs'
ORDER BY ordinal_position;

-- Confirma se a tabela existe
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'kiwify_webhook_logs'
  ) AS tabela_existe;


-- ============================================================
-- SEÇÃO A: kiwify_webhook_logs — busca por email e por período
-- Atenção: colunas podem diferir do esperado.
-- Se a tabela tiver schema diferente, ajustar as colunas abaixo
-- com base no resultado do PRE_SCHEMA_CHECK acima.
-- ============================================================
SELECT
  wl.id,
  wl.kiwify_order_id,
  wl.event_type,
  wl.tenant_id,
  wl.plan_code,
  wl.processed_at,
  -- Email e nome no payload (Kiwify usa Customer ou customer)
  wl.raw_payload -> 'Customer' ->> 'email'    AS payload_email_C,
  wl.raw_payload -> 'customer' ->> 'email'    AS payload_email_c,
  wl.raw_payload -> 'Customer' ->> 'name'     AS payload_name_C,
  wl.raw_payload -> 'customer' ->> 'name'     AS payload_name_c,
  -- order_id alternativo dentro do payload
  wl.raw_payload ->> 'order_id'               AS payload_order_id,
  wl.raw_payload ->> 'status'                 AS payload_status
FROM public.kiwify_webhook_logs wl
WHERE
  -- Busca 1: email exato
  lower(wl.raw_payload -> 'Customer' ->> 'email') = 'elielzamelo26@gmail.com'
  OR lower(wl.raw_payload -> 'customer' ->> 'email') = 'elielzamelo26@gmail.com'
  -- Busca 2: variações de nome
  OR lower(wl.raw_payload -> 'Customer' ->> 'name') LIKE '%elielza%'
  OR lower(wl.raw_payload -> 'customer' ->> 'name') LIKE '%elielza%'
  -- Busca 3: janela de tempo em torno de 07/05/2026 19:16 (hora Brasil UTC-3)
  --          UTC equivalente: 07/05/2026 22:00 – 08/05/2026 02:00
  OR (
    wl.processed_at BETWEEN '2026-05-07 21:00:00+00' AND '2026-05-08 02:00:00+00'
  )
ORDER BY wl.processed_at DESC
LIMIT 30;


-- ============================================================
-- SEÇÃO B: Compras PRO ANUAL de 07–08/05/2026 sem tenant_id
-- (webhook chegou mas ativação não vinculou ao tenant)
-- ============================================================
SELECT
  kp.id,
  kp.email,
  kp.product_key,
  kprod.product_name,
  kprod.billing_cycle                         AS ciclo_produto,
  kp.plan_code,
  kp.activation_status,
  kp.tenant_id,
  kp.paid_at,
  kp.activated_at,
  kp.created_at,
  -- Existe user com este email?
  (SELECT u.id FROM public.users u
   WHERE lower(trim(u.email)) = lower(trim(kp.email)) LIMIT 1) AS user_id_se_existir
FROM public.kiwify_purchases kp
LEFT JOIN public.kiwify_products kprod ON kprod.product_key = kp.product_key
WHERE
  upper(trim(kp.status)) = 'APPROVED'
  AND upper(coalesce(kp.plan_code,'')) = 'PRO'
  AND COALESCE(kp.paid_at, kp.created_at) BETWEEN '2026-05-07' AND '2026-05-09'
  AND kp.tenant_id IS NULL
ORDER BY kp.paid_at;


-- ============================================================
-- SEÇÃO C: Compras PRO aprovadas de 07–08/05/2026 — visão geral
-- (independente de tenant_id; busca possível match por período)
-- ============================================================
SELECT
  kp.id,
  kp.email,
  upper(trim(kp.status))                      AS status,
  kp.product_key,
  kprod.product_name,
  kprod.billing_cycle                         AS ciclo_produto,
  kp.plan_code,
  kp.activation_status,
  kp.tenant_id,
  kp.paid_at,
  kp.payload -> 'Customer' ->> 'name'         AS payload_customer_name_C,
  kp.payload -> 'customer' ->> 'name'         AS payload_customer_name_c,
  kp.payload -> 'Customer' ->> 'email'        AS payload_customer_email_C,
  kp.payload -> 'customer' ->> 'email'        AS payload_customer_email_c
FROM public.kiwify_purchases kp
LEFT JOIN public.kiwify_products kprod ON kprod.product_key = kp.product_key
WHERE
  upper(trim(kp.status)) = 'APPROVED'
  AND upper(coalesce(kp.plan_code,'')) = 'PRO'
  AND COALESCE(kp.paid_at, kp.created_at) BETWEEN '2026-05-07' AND '2026-05-09'
ORDER BY kp.paid_at;


-- ============================================================
-- SEÇÃO D: Diagnóstico consolidado
-- O que existe vs. o que falta para ativar Maria Elielza
-- ============================================================
SELECT
  'elielzamelo26@gmail.com'                   AS email_kiwify_esperado,
  -- Existe compra?
  (SELECT COUNT(*) FROM public.kiwify_purchases
   WHERE lower(trim(email)) = 'elielzamelo26@gmail.com') AS compras_total,
  (SELECT COUNT(*) FROM public.kiwify_purchases
   WHERE lower(trim(email)) = 'elielzamelo26@gmail.com'
     AND upper(trim(status)) = 'APPROVED')    AS compras_aprovadas,
  -- Existe user?
  (SELECT COUNT(*) FROM public.users
   WHERE lower(trim(email)) = 'elielzamelo26@gmail.com') AS users_encontrados,
  -- Existe webhook log?
  (SELECT COUNT(*) FROM public.kiwify_webhook_logs
   WHERE lower(raw_payload -> 'Customer' ->> 'email') = 'elielzamelo26@gmail.com'
      OR lower(raw_payload -> 'customer' ->> 'email') = 'elielzamelo26@gmail.com'
  )                                            AS webhook_logs_encontrados,
  -- Diagnóstico
  CASE
    WHEN (SELECT COUNT(*) FROM public.kiwify_purchases
          WHERE lower(trim(email)) = 'elielzamelo26@gmail.com'
            AND upper(trim(status)) = 'APPROVED') > 0
      THEN 'COMPRA_EXISTE — verificar activation_status e tenant_id'
    WHEN (SELECT COUNT(*) FROM public.kiwify_webhook_logs
          WHERE lower(raw_payload -> 'Customer' ->> 'email') = 'elielzamelo26@gmail.com'
             OR lower(raw_payload -> 'customer' ->> 'email') = 'elielzamelo26@gmail.com') > 0
      THEN 'WEBHOOK_CHEGOU_SEM_COMPRA — verificar erro de processamento'
    ELSE 'WEBHOOK_NAO_CHEGOU — inserção manual necessária (ver Seção E)'
  END                                          AS situacao,
  -- Ação sugerida
  CASE
    WHEN (SELECT COUNT(*) FROM public.kiwify_purchases
          WHERE lower(trim(email)) = 'elielzamelo26@gmail.com'
            AND upper(trim(status)) = 'APPROVED') > 0
      THEN 'Compra existe. Verificar por que não foi ativada. Checar tenant_id e activation_status.'
    WHEN (SELECT COUNT(*) FROM public.kiwify_webhook_logs
          WHERE lower(raw_payload -> 'Customer' ->> 'email') = 'elielzamelo26@gmail.com'
             OR lower(raw_payload -> 'customer' ->> 'email') = 'elielzamelo26@gmail.com') > 0
      THEN 'Webhook chegou mas falhou no processamento. Verificar logs de erro da Edge Function kiwify-webhook.'
    ELSE 'Webhook NÃO chegou. Executar Seção E (DO_NOT_RUN) após autorização da CEO.'
  END                                          AS proxima_acao;


-- ============================================================
-- SEÇÃO E: DO_NOT_RUN — Inserção manual da compra Kiwify
--
-- Executar SOMENTE se Seção D confirmar: WEBHOOK_NAO_CHEGOU.
-- Substituir TODOS os <placeholders> com dados reais da Kiwify
-- antes de trocar ROLLBACK por COMMIT.
--
-- Pré-requisitos:
--   1. Confirmar o order_id real no painel Kiwify.
--   2. Confirmar o product_key correto (Seção C ajuda).
--   3. Confirmar paid_at exato (hora Brasil 07/05/2026 19:16 = UTC 22:16).
--   4. Autorização da CEO.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_email           text        := 'elielzamelo26@gmail.com';
  v_plan_code       text        := 'PRO';
  -- ↓ Preencher com dados reais do painel Kiwify antes de rodar
  v_provider_order  text        := '<order_id_da_kiwify>';
  v_product_key     text        := '<product_key_do_produto_PRO_ANUAL>';
  v_credits_amount  int         := 500;
  v_paid_at         timestamptz := '2026-05-07 22:16:00+00'; -- 19:16 BRT = 22:16 UTC
  v_purchase_id     uuid;
  v_user_id         uuid;
  v_tenant_id       uuid;
BEGIN
  -- Verifica se já existe compra aprovada para este email
  PERFORM 1 FROM public.kiwify_purchases
  WHERE lower(trim(email)) = v_email
    AND upper(trim(status)) = 'APPROVED';

  IF FOUND THEN
    RAISE EXCEPTION 'Compra aprovada para % já existe em kiwify_purchases. Não inserir duplicata.', v_email;
  END IF;

  -- Verifica se product_key foi preenchido
  IF v_product_key LIKE '<%' THEN
    RAISE EXCEPTION 'Placeholder <product_key> não foi substituído. Preencher com product_key real.';
  END IF;

  IF v_provider_order LIKE '<%' THEN
    RAISE EXCEPTION 'Placeholder <order_id_da_kiwify> não foi substituído. Preencher com order_id real.';
  END IF;

  -- Insere a compra manualmente
  INSERT INTO public.kiwify_purchases (
    email,
    product_key,
    plan_code,
    credits_amount,
    provider_order_id,
    status,
    payload,
    paid_at,
    created_at
  ) VALUES (
    v_email,
    v_product_key,
    v_plan_code,
    v_credits_amount,
    v_provider_order,
    'approved',
    jsonb_build_object(
      'manual_insert',    true,
      'reason',           'webhook_nao_chegou',
      'inserted_by',      'ceo:profkarlenepinheiro@gmail.com',
      'inserted_at',      now(),
      'Customer', jsonb_build_object(
        'email', v_email,
        'name',  'Maria Elielza Pereira de Melo'
      )
    ),
    v_paid_at,
    now()
  )
  RETURNING id INTO v_purchase_id;

  RAISE NOTICE 'kiwify_purchases inserido: id=% email=% plan=% paid_at=%',
    v_purchase_id, v_email, v_plan_code, v_paid_at;

  -- Verifica se existe user para ativar
  SELECT u.id, u.tenant_id INTO v_user_id, v_tenant_id
  FROM public.users u
  WHERE lower(trim(u.email)) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User não encontrado para %. '
      'A compra foi registrada mas a ativação ocorrerá no primeiro login.', v_email;
  ELSE
    RAISE NOTICE 'User encontrado: id=% tenant_id=%. '
      'Após COMMIT, usar painel CEO para ativar a compra manualmente.', v_user_id, v_tenant_id;
  END IF;
END $$;

-- Verificação dentro da transação
SELECT
  kp.id,
  kp.email,
  upper(trim(kp.status))   AS status,
  kp.product_key,
  kp.plan_code,
  kp.activation_status,
  kp.tenant_id,
  kp.paid_at,
  kp.created_at
FROM public.kiwify_purchases kp
WHERE lower(trim(kp.email)) = 'elielzamelo26@gmail.com'
ORDER BY kp.created_at DESC;

-- NÃO executar COMMIT sem revisão completa e autorização da CEO
ROLLBACK;
-- COMMIT;
