-- ============================================================
-- 20260616_audit_missing_pro_subscribers_in_ceo_dashboard.sql
-- v2 — schema real de kiwify_purchases corrigido
--
-- DIAGNÓSTICO: Assinantes PRO anuais ausentes no Dashboard CEO
--
-- Alvo:
--   miriam123.om@gmail.com    — Miriam Oliveira Feitosa   — PRO ANUAL — 08/05/2026
--   geizaceleste29@gmail.com  — Geiza Celeste              — PRO ANUAL — 08/05/2026
--   francans12@gmail.com      — Francisca Nogueira Silva   — PRO ANUAL — 07/05/2026
--   elielzamelo26@gmail.com   — Maria Elielza Pereira Melo — PRO ANUAL — 07/05/2026
--
-- Schema real de kiwify_purchases (confirmado em 2026-06-17):
--   id, email, product_key, plan_code, credits_amount,
--   provider_order_id, status, payload, paid_at, activated_at,
--   tenant_id, created_at, activation_status (GENERATED STORED)
--   NÃO existe: product_name, kiwify_product_id
--
-- Para product_name / billing_cycle: LEFT JOIN kiwify_products
-- via product_key.
--
-- Classificações:
--   PURCHASE_WITHOUT_USER      — compra aprovada, nenhum user com esse email
--   PURCHASE_WITHOUT_TENANT    — user existe mas sem tenant_id
--   TENANT_INACTIVE            — tenant.is_active = false
--   TENANT_INTERNAL            — tenant.is_internal = true
--   TENANT_WITHOUT_SUBSCRIPTION — tenant ativo, sem subscription
--   SUBSCRIPTION_NOT_ACTIVE    — subscription status != ACTIVE
--   SUBSCRIPTION_WRONG_PLAN    — subscription ativa, plan_code != PRO
--   VIEW_FILTERED_OUT          — tenant OK mas excluído da view
--   OK_PRO_NULL_CYCLE          — aparece como PRO, billing_cycle=NULL
--   OK_PRO_WRONG_CYCLE         — aparece como PRO, ciclo errado
--   OK_PRO_ANNUAL              — correto ✓
--
-- APENAS SELECT — nenhuma alteração de dados.
-- ============================================================


-- ============================================================
-- SEÇÃO PRE: Auditoria de colunas — schema real em produção
-- Confirma colunas de kiwify_purchases e kiwify_products.
-- ============================================================

SELECT
  column_name,
  data_type,
  is_nullable,
  is_generated
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'kiwify_purchases'
ORDER BY ordinal_position;

SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'kiwify_products'
ORDER BY ordinal_position;


-- ============================================================
-- SEÇÃO 0: Catálogo PRO ANUAL em kiwify_products
-- ============================================================
SELECT
  kprod.kiwify_product_id,
  kprod.product_key,
  kprod.product_name,
  kprod.plan_code,
  kprod.billing_cycle,
  kprod.price_brl,
  kprod.checkout_url,
  kprod.is_active
FROM public.kiwify_products kprod
WHERE kprod.plan_code = 'PRO'
ORDER BY kprod.billing_cycle;


-- ============================================================
-- SEÇÃO A: Compras na kiwify_purchases pelos 4 emails
-- product_name e billing_cycle via JOIN com kiwify_products
-- ============================================================
SELECT
  kp.id                                                        AS purchase_id,
  kp.email                                                     AS purchase_email,
  upper(trim(kp.status))                                       AS purchase_status,
  kp.product_key,
  kp.plan_code,
  kprod.product_name,
  kprod.billing_cycle                                          AS product_billing_cycle,
  kp.tenant_id                                                 AS purchase_tenant_id,
  kp.activation_status,
  kp.paid_at,
  kp.activated_at,
  kp.created_at
FROM public.kiwify_purchases kp
LEFT JOIN public.kiwify_products kprod ON kprod.product_key = kp.product_key
WHERE lower(trim(kp.email)) IN (
  'miriam123.om@gmail.com',
  'geizaceleste29@gmail.com',
  'francans12@gmail.com',
  'elielzamelo26@gmail.com'
)
ORDER BY kp.email, kp.created_at DESC;


-- ============================================================
-- SEÇÃO A2: Payload bruto — caso product_key seja NULL ou não
--           bata com catálogo (fallback: dados dentro do JSON)
-- ============================================================
SELECT
  kp.id,
  kp.email,
  kp.product_key,
  kp.plan_code,
  kp.activation_status,
  -- Tentativa de extrair nome do produto do payload JSON
  kp.payload -> 'Product' ->> 'product_id'   AS payload_product_id,
  kp.payload -> 'Product' ->> 'name'          AS payload_product_name,
  kp.payload ->> 'product_id'                 AS payload_root_product_id,
  kp.payload ->> 'product_name'               AS payload_root_product_name,
  kp.payload -> 'order'    ->> 'product_name' AS payload_order_product_name,
  left(kp.payload::text, 300)                 AS payload_preview
FROM public.kiwify_purchases kp
WHERE lower(trim(kp.email)) IN (
  'miriam123.om@gmail.com',
  'geizaceleste29@gmail.com',
  'francans12@gmail.com',
  'elielzamelo26@gmail.com'
)
ORDER BY kp.email, kp.created_at DESC;


-- ============================================================
-- SEÇÃO B: Cruzamento compra → user por email
-- ============================================================
SELECT
  lower(trim(kp.email))          AS purchase_email,
  upper(trim(kp.status))         AS purchase_status,
  kp.plan_code                   AS kiwify_plan_code,
  kp.product_key,
  kp.activation_status,
  u.id                           AS user_id,
  u.email                        AS user_email,
  u.tenant_id                    AS user_tenant_id,
  COALESCE(u.is_active, true)    AS user_is_active,
  u.created_at                   AS user_created_at,
  CASE
    WHEN u.id IS NULL THEN 'SEM_USER'
    WHEN u.tenant_id IS NULL THEN 'USER_SEM_TENANT'
    ELSE 'OK'
  END                            AS status_user
FROM public.kiwify_purchases kp
LEFT JOIN public.users u
  ON lower(trim(u.email)) = lower(trim(kp.email))
WHERE lower(trim(kp.email)) IN (
  'miriam123.om@gmail.com',
  'geizaceleste29@gmail.com',
  'francans12@gmail.com',
  'elielzamelo26@gmail.com'
)
ORDER BY kp.email;


-- ============================================================
-- SEÇÃO C: Cruzamento compra → tenant
-- ============================================================
SELECT
  lower(trim(kp.email))          AS email,
  kp.plan_code                   AS kiwify_plan,
  kp.product_key,
  kp.activation_status,
  t.id                           AS tenant_id,
  t.name                         AS tenant_name,
  t.is_active                    AS tenant_is_active,
  COALESCE(t.is_internal, false) AS tenant_is_internal,
  t.plan_id                      AS tenant_plan_id,
  t.created_at                   AS tenant_created_at,
  CASE
    WHEN t.id IS NULL THEN 'SEM_TENANT'
    WHEN NOT COALESCE(t.is_active, true) THEN 'TENANT_INATIVO'
    WHEN COALESCE(t.is_internal, false)  THEN 'TENANT_INTERNO'
    ELSE 'OK'
  END                            AS status_tenant
FROM public.kiwify_purchases kp
LEFT JOIN public.users u
  ON lower(trim(u.email)) = lower(trim(kp.email))
LEFT JOIN public.tenants t ON t.id = u.tenant_id
WHERE lower(trim(kp.email)) IN (
  'miriam123.om@gmail.com',
  'geizaceleste29@gmail.com',
  'francans12@gmail.com',
  'elielzamelo26@gmail.com'
)
ORDER BY kp.email;


-- ============================================================
-- SEÇÃO D: Cruzamento tenant → subscription (mais recente)
-- ============================================================
SELECT
  lower(trim(kp.email))          AS email,
  t.id                           AS tenant_id,
  t.name                         AS tenant_name,
  s.id                           AS subscription_id,
  upper(trim(s.status))          AS subscription_status,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  s.plan_id                      AS subscription_plan_id,
  s.created_at                   AS subscription_created_at,
  s.updated_at                   AS subscription_updated_at,
  CASE
    WHEN s.id IS NULL THEN 'SEM_SUBSCRIPTION'
    WHEN upper(trim(s.status)) = 'ACTIVE' THEN 'ACTIVE'
    ELSE 'STATUS_NAO_ATIVO: ' || upper(trim(s.status))
  END                            AS status_subscription
FROM public.kiwify_purchases kp
LEFT JOIN public.users u
  ON lower(trim(u.email)) = lower(trim(kp.email))
LEFT JOIN public.tenants t ON t.id = u.tenant_id
LEFT JOIN LATERAL (
  SELECT *
  FROM public.subscriptions sub
  WHERE sub.tenant_id = t.id
    AND upper(trim(sub.status)) <> 'INTERNAL_TEST'
  ORDER BY sub.created_at DESC, sub.id DESC
  LIMIT 1
) s ON t.id IS NOT NULL
WHERE lower(trim(kp.email)) IN (
  'miriam123.om@gmail.com',
  'geizaceleste29@gmail.com',
  'francans12@gmail.com',
  'elielzamelo26@gmail.com'
)
ORDER BY kp.email;


-- ============================================================
-- SEÇÃO E: Cruzamento subscription → plans (plano ativo no banco)
-- ============================================================
SELECT
  lower(trim(kp.email))          AS email,
  t.id                           AS tenant_id,
  s.id                           AS subscription_id,
  upper(trim(s.status))          AS subscription_status,
  s.billing_cycle,
  p.id                           AS plan_id,
  p.name                         AS plan_name,
  CASE
    WHEN upper(coalesce(p.name, 'FREE')) = 'PREMIUM' THEN 'MASTER'
    ELSE upper(coalesce(p.name, 'FREE'))
  END                            AS plan_code_normalizado,
  p.ai_credits_per_month,
  p.max_students,
  p.price_brl                    AS plan_price_brl,
  CASE
    WHEN p.id IS NULL THEN 'SEM_PLANO'
    WHEN upper(coalesce(p.name,'FREE')) NOT IN ('PRO','MASTER','PREMIUM')
      THEN 'PLANO_NAO_PRO: ' || p.name
    ELSE 'OK_PLANO_PRO'
  END                            AS status_plano
FROM public.kiwify_purchases kp
LEFT JOIN public.users u
  ON lower(trim(u.email)) = lower(trim(kp.email))
LEFT JOIN public.tenants t ON t.id = u.tenant_id
LEFT JOIN LATERAL (
  SELECT *
  FROM public.subscriptions sub
  WHERE sub.tenant_id = t.id
    AND upper(trim(sub.status)) <> 'INTERNAL_TEST'
  ORDER BY sub.created_at DESC, sub.id DESC
  LIMIT 1
) s ON t.id IS NOT NULL
LEFT JOIN public.plans p ON p.id = COALESCE(s.plan_id, t.plan_id)
WHERE lower(trim(kp.email)) IN (
  'miriam123.om@gmail.com',
  'geizaceleste29@gmail.com',
  'francans12@gmail.com',
  'elielzamelo26@gmail.com'
)
ORDER BY kp.email;


-- ============================================================
-- SEÇÃO F: Verificação em v_ceo_subscriber_health (view base)
-- ============================================================
SELECT
  h.tenant_id,
  h.user_email,
  h.tenant_name,
  h.plan_code,
  h.billing_cycle,
  h.subscription_status,
  h.subscription_id,
  h.tenant_is_active,
  h.purchase_plan_code,
  h.purchase_billing_cycle,
  h.purchase_product_key,
  h.purchase_activation_status,
  h.subscription_missing,
  h.paid_but_free,
  h.plan_mismatch,
  h.financial_inconsistency,
  h.wallet_mismatch
FROM public.v_ceo_subscriber_health h
WHERE lower(trim(h.user_email)) IN (
  'miriam123.om@gmail.com',
  'geizaceleste29@gmail.com',
  'francans12@gmail.com',
  'elielzamelo26@gmail.com'
);


-- ============================================================
-- SEÇÃO G: Verificação em v_ceo_subscribers (dashboard)
-- ============================================================
SELECT
  v.tenant_id,
  v.user_email,
  v.tenant_name,
  v.plan_code,
  v.billing_cycle,
  v.subscription_status,
  v.subscription_id,
  v.purchase_plan_code,
  v.purchase_product_key,
  v.purchase_activation_status,
  v.paid_but_free,
  v.plan_mismatch,
  v.subscription_missing,
  v.financial_inconsistency,
  v.has_any_finding,
  v.divergence
FROM public.v_ceo_subscribers v
WHERE lower(trim(v.user_email)) IN (
  'miriam123.om@gmail.com',
  'geizaceleste29@gmail.com',
  'francans12@gmail.com',
  'elielzamelo26@gmail.com'
);


-- ============================================================
-- SEÇÃO H: Compras aprovadas — status de ativação (órfãs ou não)
-- product_name via kiwify_products; billing_cycle do catálogo
-- ============================================================
SELECT
  kp.id,
  kp.email,
  upper(trim(kp.status))                                       AS status,
  kp.plan_code,
  kp.product_key,
  kprod.product_name,
  kprod.billing_cycle                                          AS product_billing_cycle,
  kp.activation_status,
  kp.tenant_id                                                 AS purchase_tenant_id,
  kp.paid_at,
  kp.activated_at,
  -- Seria encontrado na lista de compras órfãs do CEO?
  (kp.tenant_id IS NULL AND kp.activated_at IS NULL)           AS seria_orfao
FROM public.kiwify_purchases kp
LEFT JOIN public.kiwify_products kprod ON kprod.product_key = kp.product_key
WHERE lower(trim(kp.email)) IN (
  'miriam123.om@gmail.com',
  'geizaceleste29@gmail.com',
  'francans12@gmail.com',
  'elielzamelo26@gmail.com'
)
  AND upper(trim(kp.status)) = 'APPROVED'
ORDER BY kp.email;


-- ============================================================
-- SEÇÃO I: Diagnóstico consolidado — classificação final
--
-- Inferência de billing_cycle (em ordem de prioridade):
--   1. kprod.billing_cycle — catálogo (mais confiável)
--   2. kp.product_key ILIKE '%ANNUAL%' — fallback
--   3. kp.plan_code — fallback mínimo
-- ============================================================
SELECT
  lower(trim(kp.email))                                        AS email,
  upper(trim(kp.status))                                       AS kiwify_status,
  kp.plan_code                                                 AS kiwify_plan_code,
  kp.product_key                                               AS kiwify_product_key,
  COALESCE(kprod.product_name, kp.product_key, '(sem nome)')  AS product_label,
  COALESCE(
    kprod.billing_cycle,
    CASE
      WHEN kp.product_key ILIKE '%ANNUAL%' OR kp.product_key ILIKE '%ANUAL%' THEN 'annual'
      WHEN kp.product_key ILIKE '%MONTHLY%' OR kp.product_key ILIKE '%MENSAL%' THEN 'monthly'
    END
  )                                                            AS inferred_billing_cycle,
  kp.activation_status,
  u.id                                                         AS user_id,
  u.tenant_id                                                  AS user_tenant_id,
  t.id                                                         AS tenant_id,
  t.is_active                                                  AS tenant_is_active,
  COALESCE(t.is_internal, false)                               AS tenant_is_internal,
  s.id                                                         AS subscription_id,
  upper(trim(s.status))                                        AS subscription_status,
  s.billing_cycle                                              AS subscription_billing_cycle,
  upper(coalesce(p.name, 'FREE'))                              AS plan_code_no_banco,
  -- Aparece em v_ceo_subscriber_health?
  (vh.tenant_id IS NOT NULL)                                   AS aparece_na_view_health,
  vh.plan_code                                                 AS plan_code_na_view,
  vh.billing_cycle                                             AS billing_cycle_na_view,
  vh.subscription_status                                       AS status_na_view,
  -- Aparece em v_ceo_subscribers (dashboard)?
  (vs.tenant_id IS NOT NULL)                                   AS aparece_no_dashboard,
  -- ── Classificação ─────────────────────────────────────────
  CASE
    WHEN u.id IS NULL
      THEN 'PURCHASE_WITHOUT_USER'
    WHEN u.tenant_id IS NULL
      THEN 'PURCHASE_WITHOUT_TENANT'
    WHEN NOT COALESCE(t.is_active, true)
      THEN 'TENANT_INACTIVE'
    WHEN COALESCE(t.is_internal, false)
      THEN 'TENANT_INTERNAL'
    WHEN s.id IS NULL
      THEN 'TENANT_WITHOUT_SUBSCRIPTION'
    WHEN upper(trim(s.status)) <> 'ACTIVE'
      THEN 'SUBSCRIPTION_NOT_ACTIVE: ' || upper(trim(s.status))
    WHEN upper(coalesce(p.name, 'FREE')) NOT IN ('PRO','MASTER','PREMIUM')
      THEN 'SUBSCRIPTION_WRONG_PLAN: ' || upper(coalesce(p.name,'FREE'))
    WHEN vs.tenant_id IS NULL
      THEN 'VIEW_FILTERED_OUT'
    WHEN vs.billing_cycle IS NULL
      THEN 'OK_PRO_NULL_CYCLE'
    WHEN vs.billing_cycle <> 'annual'
      THEN 'OK_PRO_WRONG_CYCLE: ' || vs.billing_cycle
    ELSE 'OK_PRO_ANNUAL'
  END                                                          AS classificacao,
  -- ── Ação necessária ───────────────────────────────────────
  CASE
    WHEN u.id IS NULL
      THEN 'Comprou sem criar conta. Ver "Sem conta" no CEO. Aguarda primeiro login.'
    WHEN u.tenant_id IS NULL
      THEN 'User existe mas sem tenant. Vinculação manual necessária.'
    WHEN NOT COALESCE(t.is_active, true)
      THEN 'Reativar tenant: UPDATE tenants SET is_active=true WHERE id=''' || t.id::text || ''''
    WHEN COALESCE(t.is_internal, false)
      THEN 'Remover flag interno: UPDATE tenants SET is_internal=false WHERE id=''' || t.id::text || ''''
    WHEN s.id IS NULL
      THEN 'Sem subscription. Criar via patch DO_NOT_RUN com plan PRO.'
    WHEN upper(trim(s.status)) <> 'ACTIVE'
      THEN 'Subscription status=' || upper(trim(s.status)) || '. Reativar via CEO ou patch.'
    WHEN upper(coalesce(p.name,'FREE')) NOT IN ('PRO','MASTER','PREMIUM')
      THEN 'Plano errado (' || upper(coalesce(p.name,'FREE')) || '). Trocar plan_id para PRO via patch DO_NOT_RUN.'
    WHEN vs.billing_cycle IS NULL
      THEN 'Aparece como PRO mas billing_cycle=NULL. Corrigir via proposed_fix DO_NOT_RUN.'
    WHEN vs.billing_cycle <> 'annual'
      THEN 'Aparece como PRO mas billing_cycle=' || vs.billing_cycle || '. Corrigir ciclo via patch.'
    ELSE 'OK — verificar filtros ou paginação no frontend.'
  END                                                          AS acao_necessaria
FROM public.kiwify_purchases kp
LEFT JOIN public.kiwify_products kprod
  ON kprod.product_key = kp.product_key
LEFT JOIN public.users u
  ON lower(trim(u.email)) = lower(trim(kp.email))
     AND COALESCE(u.is_active, true) = true
LEFT JOIN public.tenants t ON t.id = u.tenant_id
LEFT JOIN LATERAL (
  SELECT *
  FROM public.subscriptions sub
  WHERE sub.tenant_id = t.id
    AND upper(trim(sub.status)) <> 'INTERNAL_TEST'
  ORDER BY sub.created_at DESC, sub.id DESC
  LIMIT 1
) s ON t.id IS NOT NULL
LEFT JOIN public.plans p ON p.id = COALESCE(s.plan_id, t.plan_id)
LEFT JOIN public.v_ceo_subscriber_health vh
  ON lower(trim(vh.user_email)) = lower(trim(kp.email))
LEFT JOIN public.v_ceo_subscribers vs
  ON lower(trim(vs.user_email)) = lower(trim(kp.email))
WHERE lower(trim(kp.email)) IN (
  'miriam123.om@gmail.com',
  'geizaceleste29@gmail.com',
  'francans12@gmail.com',
  'elielzamelo26@gmail.com'
)
  AND upper(trim(kp.status)) = 'APPROVED'
ORDER BY kp.email;


-- ============================================================
-- SEÇÃO J: Distribuição geral de planos em v_ceo_subscribers
-- (confirma se PRO aparece na view ou não)
-- ============================================================
SELECT
  plan_code,
  billing_cycle,
  subscription_status,
  COUNT(*) AS total
FROM public.v_ceo_subscribers
GROUP BY plan_code, billing_cycle, subscription_status
ORDER BY plan_code, billing_cycle, subscription_status;


-- ============================================================
-- SEÇÃO K: Todas as compras PRO aprovadas — visão geral
-- product_name via kiwify_products
-- ============================================================
SELECT
  kp.email,
  upper(trim(kp.status))                                       AS purchase_status,
  kp.product_key,
  kprod.product_name,
  kprod.billing_cycle                                          AS product_billing_cycle,
  kp.plan_code,
  kp.activation_status,
  kp.tenant_id                                                 AS purchase_tenant_id,
  kp.paid_at,
  kp.activated_at,
  u.id                                                         AS user_id,
  u.tenant_id                                                  AS user_tenant_id,
  t.is_active                                                  AS tenant_is_active
FROM public.kiwify_purchases kp
LEFT JOIN public.kiwify_products kprod ON kprod.product_key = kp.product_key
LEFT JOIN public.users u
  ON lower(trim(u.email)) = lower(trim(kp.email))
LEFT JOIN public.tenants t ON t.id = u.tenant_id
WHERE upper(trim(kp.status)) = 'APPROVED'
  AND upper(coalesce(kp.plan_code, '')) = 'PRO'
ORDER BY kp.paid_at DESC;
