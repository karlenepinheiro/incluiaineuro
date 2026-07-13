-- ============================================================
-- 20260617_audit_maria_elielza.sql  (v2 — schema real corrigido)
--
-- DIAGNÓSTICO: Maria Elielza Pereira de Melo — não localizada no Dashboard CEO
--
-- Email confirmado na Kiwify: elielzamelo26@gmail.com
-- Compra: PLANO PRO ANUAL — 07/05/2026 19:16
--
-- REGRA: Schema real auditado antes de qualquer coluna referenciada.
-- Colunas confirmadas:
--   users    → id, tenant_id, full_name (NOT NULL), email, role,
--              is_super_admin, is_active, created_at, updated_at,
--              nome (nullable), referral_code, referred_by
--              NÃO EXISTE: users.name
--   tenants  → id, name (NOT NULL), document, plan_id, is_active,
--              is_internal (boolean NOT NULL DEFAULT false), created_at, updated_at
--   plans    → id, name (NOT NULL), max_students, ai_credits_per_month,
--              price_brl, is_active, created_at
--   subscriptions → id, tenant_id, plan_id, status, current_period_start,
--                   current_period_end, provider, provider_sub_id,
--                   billing_cycle (nullable), created_at, updated_at
--   kiwify_purchases → id, email, product_key, plan_code, credits_amount,
--                      provider_order_id, status, payload, paid_at,
--                      activated_at, tenant_id, created_at,
--                      activation_status (GENERATED)
--                      NÃO EXISTE: product_name, kiwify_product_id
--   kiwify_products  → kiwify_product_id, product_name, product_type,
--                      plan_code, billing_cycle, product_key, credits_amount,
--                      price_brl, checkout_url, is_active
--   admin_audit_logs → id, action, resource_type, resource_id, tenant_id,
--                      performed_by, performed_by_email, before_data,
--                      after_data, reason, created_at
--
-- APENAS SELECT — nenhuma alteração.
-- ============================================================


-- ============================================================
-- SEÇÃO PRE_SCHEMA_CHECK: Confirma colunas reais no banco de produção
-- Execute esta seção primeiro. Se os nomes divergirem das notas acima,
-- ajuste as seções seguintes antes de continuar.
-- ============================================================
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'users',
    'tenants',
    'subscriptions',
    'plans',
    'kiwify_purchases',
    'kiwify_products',
    'admin_audit_logs'
  )
ORDER BY table_name, ordinal_position;


-- ============================================================
-- SEÇÃO A: Compras Kiwify — email exato
-- product_name via JOIN kiwify_products (não existe em kiwify_purchases)
-- ============================================================
SELECT
  kp.id,
  kp.email,
  upper(trim(kp.status))                                    AS status,
  kp.product_key,
  kprod.product_name,
  kprod.billing_cycle                                       AS ciclo_produto,
  kp.plan_code,
  kp.activation_status,
  kp.tenant_id                                              AS purchase_tenant_id,
  kp.paid_at,
  kp.activated_at,
  kp.created_at
FROM public.kiwify_purchases kp
LEFT JOIN public.kiwify_products kprod ON kprod.product_key = kp.product_key
WHERE lower(trim(kp.email)) = 'elielzamelo26@gmail.com'
ORDER BY kp.created_at DESC;


-- ============================================================
-- SEÇÃO B: Users — email exato e variações
-- Usa COALESCE(u.nome, u.full_name) — users.name NÃO EXISTE.
-- ============================================================
SELECT
  u.id,
  u.email,
  COALESCE(u.nome, u.full_name)   AS nome_usuario,
  u.nome                          AS campo_nome,
  u.full_name                     AS campo_full_name,
  u.tenant_id,
  u.is_active,
  u.created_at,
  CASE
    WHEN lower(trim(u.email)) = 'elielzamelo26@gmail.com'
      THEN 'EMAIL_EXATO_KIWIFY'
    ELSE 'EMAIL_VARIANTE'
  END                             AS match_type
FROM public.users u
WHERE
  lower(trim(u.email)) = 'elielzamelo26@gmail.com'
  OR lower(trim(COALESCE(u.nome, u.full_name, '')))  LIKE '%elielza%'
  OR lower(trim(u.email))                            LIKE '%elielza%'
  OR lower(trim(u.email))                            LIKE '%elielzamelo%'
ORDER BY u.created_at DESC;


-- ============================================================
-- SEÇÃO C: Payload das compras PRO em 07-08/05/2026
--          Busca nome do cliente dentro do JSON do webhook
-- ============================================================
SELECT
  kp.id,
  kp.email,
  upper(trim(kp.status))         AS status,
  kp.product_key,
  kp.plan_code,
  kp.activation_status,
  kp.tenant_id,
  kp.paid_at,
  -- Tenta extrair nome do cliente do payload JSON
  kp.payload -> 'Customer' ->> 'name'         AS payload_customer_name,
  kp.payload -> 'Customer' ->> 'email'        AS payload_customer_email,
  kp.payload -> 'customer'  ->> 'name'        AS payload_customer_name_lower,
  kp.payload -> 'customer'  ->> 'email'       AS payload_customer_email_lower,
  kp.payload ->> 'customer_name'              AS payload_root_customer_name,
  kp.payload ->> 'customer_email'             AS payload_root_customer_email
FROM public.kiwify_purchases kp
WHERE
  upper(trim(kp.status)) = 'APPROVED'
  AND upper(coalesce(kp.plan_code, '')) = 'PRO'
  AND COALESCE(kp.paid_at, kp.created_at) BETWEEN '2026-05-06' AND '2026-05-10'
ORDER BY kp.paid_at ASC;


-- ============================================================
-- SEÇÃO D: Tenants — busca por nome
-- tenants.name EXISTS (NOT NULL)
-- ============================================================
SELECT
  t.id,
  t.name,
  t.is_active,
  t.is_internal,
  t.plan_id,
  p.name                         AS plan_name,
  t.created_at
FROM public.tenants t
LEFT JOIN public.plans p ON p.id = t.plan_id
WHERE
  lower(trim(t.name)) LIKE '%elielza%'
  OR lower(trim(t.name)) LIKE '%elielzamelo%'
ORDER BY t.created_at DESC;


-- ============================================================
-- SEÇÃO E: Subscriptions — busca via tenants de users elielza
-- COALESCE(u.nome, u.full_name) na busca — users.name NÃO EXISTE
-- ============================================================
SELECT
  s.id                           AS subscription_id,
  s.tenant_id,
  upper(trim(s.status))          AS status,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  s.plan_id,
  p.name                         AS plan_name,
  s.created_at,
  s.updated_at
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
WHERE s.tenant_id IN (
  -- Tenants de users com nome ou email contendo 'elielza'
  SELECT u.tenant_id FROM public.users u
  WHERE u.tenant_id IS NOT NULL
    AND (
      lower(trim(u.email)) LIKE '%elielza%'
      OR lower(trim(COALESCE(u.nome, u.full_name, ''))) LIKE '%elielza%'
    )
  UNION
  -- Tenants com nome contendo 'elielza'
  SELECT t.id FROM public.tenants t
  WHERE lower(trim(t.name)) LIKE '%elielza%'
)
ORDER BY s.created_at DESC;


-- ============================================================
-- SEÇÃO F: Presença em views CEO
-- ============================================================
SELECT
  v.tenant_id,
  v.user_email,
  v.tenant_name,
  v.plan_code,
  v.billing_cycle,
  v.subscription_status,
  v.purchase_plan_code,
  v.purchase_product_key,
  v.purchase_activation_status,
  v.paid_but_free,
  v.plan_mismatch,
  v.subscription_missing,
  v.has_any_finding,
  v.divergence
FROM public.v_ceo_subscribers v
WHERE
  lower(trim(v.user_email)) LIKE '%elielza%'
  OR lower(trim(v.tenant_name)) LIKE '%elielza%';

SELECT
  h.tenant_id,
  h.user_email,
  h.tenant_name,
  h.plan_code,
  h.billing_cycle,
  h.subscription_status,
  h.paid_but_free,
  h.plan_mismatch,
  h.subscription_missing,
  h.financial_inconsistency
FROM public.v_ceo_subscriber_health h
WHERE
  lower(trim(h.user_email)) LIKE '%elielza%'
  OR lower(trim(h.tenant_name)) LIKE '%elielza%';


-- ============================================================
-- SEÇÃO G: Classificação consolidada
-- Nota: kp na subquery = kiwify_purchases (sem product_name)
-- ============================================================
SELECT
  lower(trim(kp.email))                                     AS email_kiwify,
  upper(trim(kp.status))                                    AS purchase_status,
  kp.product_key,
  kp.plan_code                                              AS kiwify_plan_code,
  kp.activation_status,
  kp.paid_at,
  u.id                                                      AS user_id,
  u.email                                                   AS user_email,
  COALESCE(u.nome, u.full_name)                             AS nome_usuario,
  u.tenant_id,
  t.id                                                      AS tenant_id_direto,
  t.is_active                                               AS tenant_is_active,
  t.is_internal                                             AS tenant_is_internal,
  s.id                                                      AS subscription_id,
  upper(trim(s.status))                                     AS subscription_status,
  s.billing_cycle                                           AS subscription_billing_cycle,
  upper(coalesce(p.name,'FREE'))                            AS plan_code_no_banco,
  (vh.tenant_id IS NOT NULL)                                AS aparece_health_view,
  (vs.tenant_id IS NOT NULL)                                AS aparece_dashboard,
  -- Classificação
  CASE
    WHEN kp.id IS NULL
      THEN 'NOT_FOUND_IN_PURCHASES'
    WHEN u.id IS NULL
      THEN 'PURCHASE_WITHOUT_USER'
    WHEN u.tenant_id IS NULL
      THEN 'PURCHASE_WITHOUT_TENANT'
    WHEN NOT t.is_active
      THEN 'TENANT_INACTIVE'
    WHEN t.is_internal
      THEN 'TENANT_INTERNAL'
    WHEN s.id IS NULL
      THEN 'TENANT_WITHOUT_SUBSCRIPTION'
    WHEN upper(trim(s.status)) <> 'ACTIVE'
      THEN 'SUBSCRIPTION_NOT_ACTIVE: ' || upper(trim(s.status))
    WHEN upper(coalesce(p.name,'FREE')) NOT IN ('PRO','MASTER','PREMIUM')
      THEN 'SUBSCRIPTION_WRONG_PLAN: ' || upper(coalesce(p.name,'FREE'))
    WHEN vs.tenant_id IS NULL
      THEN 'VIEW_FILTERED_OUT'
    WHEN lower(trim(u.email)) <> lower(trim(kp.email))
      THEN 'EMAIL_MISMATCH: user=' || u.email || ' kiwify=' || kp.email
    ELSE 'OK_BUT_FRONTEND_FILTERED'
  END                                                       AS classificacao,
  -- Ação necessária
  CASE
    WHEN kp.id IS NULL
      THEN 'Compra não encontrada em kiwify_purchases. Verificar kiwify_webhook_logs.'
    WHEN u.id IS NULL
      THEN 'Comprou sem criar conta. Aguarda primeiro login. Ver "Sem conta" no painel CEO.'
    WHEN u.tenant_id IS NULL
      THEN 'User existe mas sem tenant. Vinculação manual necessária.'
    WHEN NOT t.is_active
      THEN 'Tenant inativo. Reativar via painel CEO.'
    WHEN t.is_internal
      THEN 'Tenant marcado como interno — excluído das métricas CEO.'
    WHEN s.id IS NULL
      THEN 'Sem subscription. Criar via painel CEO ou patch DO_NOT_RUN.'
    WHEN upper(trim(s.status)) <> 'ACTIVE'
      THEN 'Subscription status=' || upper(trim(s.status)) || '. Reativar via painel CEO.'
    WHEN upper(coalesce(p.name,'FREE')) NOT IN ('PRO','MASTER','PREMIUM')
      THEN 'Plano no banco = ' || upper(coalesce(p.name,'FREE')) || '. Trocar para PRO via patch DO_NOT_RUN.'
    ELSE 'Verificar filtros de paginação/status no Dashboard CEO.'
  END                                                       AS acao_necessaria
FROM (
  -- Linha sentinela: garante que Maria Elielza aparece mesmo sem compra no banco
  SELECT
    id, email, product_key, plan_code, activation_status, paid_at, status
  FROM public.kiwify_purchases
  WHERE lower(trim(email)) = 'elielzamelo26@gmail.com'
    AND upper(trim(status)) = 'APPROVED'
  UNION ALL
  -- Linha vazia se não houver compra aprovada para esse email
  SELECT
    NULL::uuid, 'elielzamelo26@gmail.com'::text,
    NULL::text, NULL::text, NULL::text, NULL::timestamptz, 'APPROVED'::text
  WHERE NOT EXISTS (
    SELECT 1 FROM public.kiwify_purchases
    WHERE lower(trim(email)) = 'elielzamelo26@gmail.com'
      AND upper(trim(status)) = 'APPROVED'
  )
) kp
LEFT JOIN public.users u
  ON lower(trim(u.email)) = lower(trim(kp.email))
LEFT JOIN public.tenants t ON t.id = u.tenant_id
LEFT JOIN LATERAL (
  SELECT *
  FROM public.subscriptions sub
  WHERE sub.tenant_id = t.id
  ORDER BY sub.created_at DESC LIMIT 1
) s ON t.id IS NOT NULL
LEFT JOIN public.plans p ON p.id = COALESCE(s.plan_id, t.plan_id)
LEFT JOIN public.v_ceo_subscriber_health vh
  ON lower(trim(vh.user_email)) = lower(trim(kp.email))
LEFT JOIN public.v_ceo_subscribers vs
  ON lower(trim(vs.user_email)) = lower(trim(kp.email));


-- ============================================================
-- SEÇÃO H: Webhook logs — verificar se chegou evento Kiwify
-- (kiwify_webhook_logs.raw_payload contém o payload original)
-- ============================================================
SELECT
  wl.id,
  wl.kiwify_order_id,
  wl.event_type,
  wl.tenant_id,
  wl.plan_code,
  wl.processed_at,
  -- Extrai email do payload (Kiwify pode usar 'Customer' ou 'customer')
  wl.raw_payload -> 'Customer' ->> 'email'  AS payload_email_upper,
  wl.raw_payload -> 'customer' ->> 'email'  AS payload_email_lower,
  wl.raw_payload -> 'Customer' ->> 'name'   AS payload_name_upper,
  wl.raw_payload -> 'customer' ->> 'name'   AS payload_name_lower
FROM public.kiwify_webhook_logs wl
WHERE
  wl.raw_payload -> 'Customer' ->> 'email' ILIKE '%elielza%'
  OR wl.raw_payload -> 'customer' ->> 'email' ILIKE '%elielza%'
  OR (wl.processed_at BETWEEN '2026-05-07 18:00:00+00' AND '2026-05-07 21:00:00+00')
ORDER BY wl.processed_at DESC
LIMIT 20;
