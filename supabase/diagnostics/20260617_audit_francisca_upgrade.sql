-- ============================================================
-- 20260617_audit_francisca_upgrade.sql
--
-- DIAGNÓSTICO: Francisca Nogueira Silva — histórico comercial
--
-- Email da compra Kiwify:  francans12@gmail.com
-- Email no Dashboard:      franciscans12@gmail.com  (divergência de email)
-- Compra original:         PLANO PRO ANUAL — 07/05/2026
-- Plano atual no sistema:  MASTER (Premium)
-- Situação comercial:      cliente pagou a diferença e fez upgrade para Premium
--
-- OBJETIVO:
--   1. Confirmar a compra PRO original
--   2. Confirmar o plano atual MASTER
--   3. Verificar se existe registro do upgrade
--   4. Se não existir registro, sugerir criação de histórico comercial
--
-- NÃO gerar patch de rebaixamento.
-- APENAS SELECT.
-- ============================================================


-- ============================================================
-- SEÇÃO A: Compras na Kiwify — ambos os emails
-- ============================================================
SELECT
  kp.id,
  kp.email                                                  AS email_compra,
  upper(trim(kp.status))                                    AS status,
  kp.product_key,
  kprod.product_name,
  kprod.billing_cycle                                       AS ciclo_produto,
  kp.plan_code,
  kp.activation_status,
  kp.tenant_id,
  kp.paid_at,
  kp.activated_at,
  kp.created_at
FROM public.kiwify_purchases kp
LEFT JOIN public.kiwify_products kprod ON kprod.product_key = kp.product_key
WHERE lower(trim(kp.email)) IN (
  'francans12@gmail.com',
  'franciscans12@gmail.com'
)
ORDER BY kp.created_at DESC;


-- ============================================================
-- SEÇÃO B: Users — ambos os emails
-- ============================================================
-- users.name NÃO EXISTE — usar COALESCE(u.nome, u.full_name)
SELECT
  u.id,
  u.email,
  COALESCE(u.nome, u.full_name)  AS nome_usuario,
  u.nome                         AS campo_nome,
  u.full_name                    AS campo_full_name,
  u.tenant_id,
  COALESCE(u.is_active, true) AS is_active,
  u.created_at,
  CASE
    WHEN lower(trim(u.email)) = 'francans12@gmail.com'
      THEN 'EMAIL_KIWIFY'
    WHEN lower(trim(u.email)) = 'franciscans12@gmail.com'
      THEN 'EMAIL_DASHBOARD'
    ELSE 'OUTRO'
  END                         AS origem_email
FROM public.users u
WHERE lower(trim(u.email)) IN (
  'francans12@gmail.com',
  'franciscans12@gmail.com'
)
ORDER BY u.created_at;


-- ============================================================
-- SEÇÃO C: Subscription e plano atual
-- ============================================================
SELECT
  u.email                                                   AS email_usuario,
  COALESCE(u.nome, u.full_name)                             AS nome_usuario,
  t.id                                                      AS tenant_id,
  t.name                                                    AS tenant_name,
  s.id                                                      AS subscription_id,
  upper(trim(s.status))                                     AS subscription_status,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  p.id                                                      AS plan_id,
  p.name                                                    AS plan_name,
  CASE
    WHEN upper(coalesce(p.name,'FREE')) = 'PREMIUM' THEN 'MASTER'
    ELSE upper(coalesce(p.name,'FREE'))
  END                                                       AS plan_code_normalizado,
  s.created_at                                              AS subscription_created_at,
  s.updated_at                                              AS subscription_updated_at
FROM public.users u
JOIN public.tenants t ON t.id = u.tenant_id
JOIN public.subscriptions s ON s.tenant_id = t.id
JOIN public.plans p ON p.id = s.plan_id
WHERE lower(trim(u.email)) IN (
  'francans12@gmail.com',
  'franciscans12@gmail.com'
)
ORDER BY s.created_at DESC;


-- ============================================================
-- SEÇÃO D: Busca por registros de upgrade no admin_audit_logs
-- ============================================================
SELECT
  al.id,
  al.action,
  al.resource_type,
  al.resource_id,
  al.tenant_id,
  al.performed_by_email,
  al.before_data,
  al.after_data,
  al.reason,
  al.created_at
FROM public.admin_audit_logs al
WHERE
  al.tenant_id IN (
    SELECT u.tenant_id FROM public.users u
    WHERE lower(trim(u.email)) IN (
      'francans12@gmail.com',
      'franciscans12@gmail.com'
    )
    AND u.tenant_id IS NOT NULL
  )
  OR al.reason ILIKE '%francans%'
  OR al.reason ILIKE '%franciscans%'
  OR al.reason ILIKE '%francisca%'
ORDER BY al.created_at DESC
LIMIT 50;


-- ============================================================
-- SEÇÃO E: Busca em subscription_commercial_events
--          (tabela proposta — pode não existir ainda)
-- ============================================================
DO $$
BEGIN
  PERFORM 1 FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'subscription_commercial_events';

  IF FOUND THEN
    RAISE NOTICE 'Tabela subscription_commercial_events EXISTE — executar seção E.';
  ELSE
    RAISE NOTICE 'Tabela subscription_commercial_events NÃO EXISTE — pular seção E.';
  END IF;
END $$;

-- Descomentar quando a tabela existir:
-- SELECT *
-- FROM public.subscription_commercial_events sce
-- WHERE sce.tenant_id IN (
--   SELECT u.tenant_id FROM public.users u
--   WHERE lower(trim(u.email)) IN ('francans12@gmail.com','franciscans12@gmail.com')
-- )
-- ORDER BY sce.created_at DESC;


-- ============================================================
-- SEÇÃO F: Diagnóstico consolidado
-- ============================================================
SELECT
  lower(trim(kp.email))                                     AS email_kiwify,
  'franciscans12@gmail.com'                                 AS email_dashboard,
  upper(trim(kp.status))                                    AS purchase_status,
  kp.product_key                                            AS produto_comprado,
  kprod.product_name                                        AS nome_produto,
  kprod.billing_cycle                                       AS ciclo_produto,
  kp.plan_code                                              AS plan_comprado,
  upper(coalesce(p_atual.name,'FREE'))                      AS plan_atual_no_banco,
  s.billing_cycle                                           AS ciclo_atual,
  kp.paid_at                                                AS data_compra,
  s.updated_at                                              AS ultima_atualizacao_sub,
  -- Existe registro de upgrade?
  (
    SELECT COUNT(*)
    FROM public.admin_audit_logs al
    WHERE al.tenant_id = t.id
      AND al.action IN ('UPGRADE_PLAN', 'CHANGE_PLAN', 'FIX_PLAN', 'MANUAL_UPGRADE')
  )                                                         AS registros_upgrade_admin_log,
  -- Diagnóstico comercial
  CASE
    WHEN upper(coalesce(kprod.plan_code,'')) = 'PRO'
      AND upper(coalesce(p_atual.name,'FREE')) IN ('MASTER','PREMIUM')
      THEN 'UPGRADE_PRO_PARA_MASTER'
    WHEN upper(coalesce(kprod.plan_code,'')) = upper(coalesce(p_atual.name,'FREE'))
      THEN 'PLANO_IGUAL'
    WHEN upper(coalesce(kprod.plan_code,'')) IN ('MASTER','PREMIUM')
      AND upper(coalesce(p_atual.name,'FREE')) = 'PRO'
      THEN 'DOWNGRADE_MASTER_PARA_PRO'
    ELSE 'INDETERMINADO'
  END                                                       AS tipo_comercial,
  -- O upgrade tem histórico?
  CASE
    WHEN upper(coalesce(kprod.plan_code,'')) = 'PRO'
      AND upper(coalesce(p_atual.name,'FREE')) IN ('MASTER','PREMIUM')
      AND (
        SELECT COUNT(*) FROM public.admin_audit_logs al
        WHERE al.tenant_id = t.id
          AND al.action IN ('UPGRADE_PLAN','CHANGE_PLAN','FIX_PLAN','MANUAL_UPGRADE')
      ) = 0
      THEN 'UPGRADE_SEM_REGISTRO — criar evento comercial via INSERT em subscription_commercial_events'
    WHEN upper(coalesce(kprod.plan_code,'')) = 'PRO'
      AND upper(coalesce(p_atual.name,'FREE')) IN ('MASTER','PREMIUM')
      THEN 'UPGRADE_COM_REGISTRO_NO_AUDIT_LOG'
    ELSE 'SEM_DIVERGENCIA'
  END                                                       AS status_historico
FROM public.kiwify_purchases kp
LEFT JOIN public.kiwify_products kprod ON kprod.product_key = kp.product_key
LEFT JOIN public.users u
  ON lower(trim(u.email)) IN ('francans12@gmail.com','franciscans12@gmail.com')
LEFT JOIN public.tenants t ON t.id = u.tenant_id
LEFT JOIN LATERAL (
  SELECT * FROM public.subscriptions sub
  WHERE sub.tenant_id = t.id
  ORDER BY sub.created_at DESC LIMIT 1
) s ON t.id IS NOT NULL
LEFT JOIN public.plans p_atual ON p_atual.id = COALESCE(s.plan_id, t.plan_id)
WHERE lower(trim(kp.email)) IN (
  'francans12@gmail.com',
  'franciscans12@gmail.com'
)
  AND upper(trim(kp.status)) = 'APPROVED'
ORDER BY kp.paid_at DESC
LIMIT 5;


-- ============================================================
-- SEÇÃO G: Template INSERT para registrar o upgrade manual
--          (somente descomentar e executar após revisão)
--
-- Este INSERT registra o evento comercial histórico sem alterar plano.
-- Substituir os <valores> pelos dados reais retornados nas seções acima.
-- ============================================================

-- INSERT INTO public.subscription_commercial_events (
--   tenant_id,
--   subscription_id,
--   event_type,
--   from_plan_code,
--   to_plan_code,
--   from_billing_cycle,
--   to_billing_cycle,
--   amount_paid_brl,
--   source,
--   notes,
--   performed_by_email
-- ) VALUES (
--   '<tenant_id_uuid>',        -- da seção C
--   '<subscription_id_uuid>',  -- da seção C
--   'UPGRADE_PLAN',
--   'PRO',
--   'MASTER',
--   'annual',                  -- ciclo da compra original
--   'annual',                  -- ciclo atual
--   NULL,                      -- valor da diferença paga (se conhecido)
--   'manual_ceo',              -- origem: CEO confirmou manualmente
--   'Upgrade PRO → MASTER. Cliente pagou a diferença. Compra PRO Anual: francans12@gmail.com em 07/05/2026. Confirmado pela CEO em 2026-06-17.',
--   'profkarlenepinheiro@gmail.com'
-- );
