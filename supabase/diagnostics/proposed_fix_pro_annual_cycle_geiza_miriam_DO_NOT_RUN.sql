-- ============================================================
-- proposed_fix_pro_annual_cycle_geiza_miriam_DO_NOT_RUN.sql  (v2)
--
-- CORREÇÃO: Ciclo anual de Geizaceleste e Miriam
-- Ambas compraram PLANO PRO ANUAL na Kiwify mas a subscription
-- está com billing_cycle = 'monthly'.
--
-- DIVERGÊNCIA DE EMAIL — Geizaceleste:
--   email da compra Kiwify:   geizaceleste29@gmail.com
--   email do Dashboard/conta: geizaceleste64@gmail.com
--   tenant_id (Dashboard):    59e937e6-f66b-4941-a4ad-48bc636ec3f5
--   → O patch localiza subscription via tenant_id (fonte primária).
--   → Localiza a compra Kiwify via geizaceleste29@gmail.com.
--   → A divergência de e-mail é registrada explicitamente no audit log.
--
-- Miriam:
--   email da compra e da conta: miriam123.om@gmail.com
--   → Patch localiza por email (sem divergência).
--
-- REGRAS (IMUTÁVEIS):
--   - billing_cycle           → 'annual'
--   - current_period_start    → paid_at da compra Kiwify aprovada
--   - current_period_end      → current_period_start + interval '12 months'
--   - updated_at              → now()
--   - NÃO altera plan_id
--   - NÃO altera créditos, credits_wallet, credits_ledger
--   - NÃO concede créditos
--   - NÃO estorna
--   - NÃO faz COMMIT sem autorização da CEO
-- ============================================================


-- ============================================================
-- PRE_SCHEMA_CHECK: Confirma colunas reais antes de qualquer UPDATE
-- ============================================================
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'users', 'tenants', 'subscriptions', 'plans',
    'kiwify_purchases', 'kiwify_products', 'admin_audit_logs'
  )
ORDER BY table_name, ordinal_position;


-- ============================================================
-- A. SELECT DE CONFERÊNCIA — Geizaceleste
--    Localiza via tenant_id (não por email do usuário)
--    Kiwify via geizaceleste29@gmail.com
-- ============================================================
SELECT
  'GEIZACELESTE'                                             AS assinante,
  u.email                                                    AS user_email_dashboard,
  COALESCE(u.nome, u.full_name)                              AS nome_usuario,
  kp_buy.email                                               AS purchase_email_kiwify,
  t.id                                                       AS tenant_id,
  s.id                                                       AS subscription_id,
  upper(trim(p.name))                                        AS plan_code,
  s.billing_cycle                                            AS billing_cycle_atual,
  s.current_period_start                                     AS period_start_atual,
  s.current_period_end                                       AS period_end_atual,
  kp_buy.paid_at                                             AS kiwify_paid_at,
  kprod.product_name                                         AS produto_kiwify,
  kprod.billing_cycle                                        AS ciclo_produto_catalogo,
  kp_buy.activation_status                                   AS activation_status,
  -- Proposta
  'annual'                                                   AS novo_billing_cycle,
  COALESCE(kp_buy.paid_at, s.current_period_start)           AS novo_period_start,
  COALESCE(kp_buy.paid_at, s.current_period_start)
    + interval '12 months'                                   AS novo_period_end,
  CASE
    WHEN s.billing_cycle = 'annual'
      THEN 'NENHUMA ALTERAÇÃO — já é annual'
    WHEN kp_buy.paid_at IS NULL
      THEN 'ATENÇÃO: paid_at Kiwify NULL — period_start usará current_period_start'
    ELSE 'SERÁ ALTERADO: ' || COALESCE(s.billing_cycle,'NULL') || ' → annual'
  END                                                        AS status_correcao,
  CASE
    WHEN u.email <> kp_buy.email
      THEN 'DIVERGÊNCIA: user=' || u.email || ' / kiwify=' || kp_buy.email
    ELSE 'email_ok'
  END                                                        AS alerta_email
FROM public.tenants t
-- Subscription via tenant_id
LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
LEFT JOIN public.plans p ON p.id = s.plan_id
-- User via tenant_id (email pode ser geizaceleste64@)
LEFT JOIN public.users u ON u.tenant_id = t.id
-- Compra Kiwify por email divergente
LEFT JOIN LATERAL (
  SELECT kp2.email, kp2.product_key, kp2.paid_at, kp2.plan_code, kp2.activation_status
  FROM public.kiwify_purchases kp2
  WHERE lower(trim(kp2.email)) = 'geizaceleste29@gmail.com'
    AND upper(trim(kp2.status)) = 'APPROVED'
  ORDER BY COALESCE(kp2.paid_at, kp2.created_at) DESC
  LIMIT 1
) kp_buy ON true
LEFT JOIN public.kiwify_products kprod ON kprod.product_key = kp_buy.product_key
WHERE t.id = '59e937e6-f66b-4941-a4ad-48bc636ec3f5'
ORDER BY s.created_at DESC
LIMIT 1;


-- ============================================================
-- A2. SELECT DE CONFERÊNCIA — Miriam
--     Localiza via email da conta (sem divergência)
-- ============================================================
SELECT
  'MIRIAM'                                                   AS assinante,
  u.email                                                    AS user_email_dashboard,
  COALESCE(u.nome, u.full_name)                              AS nome_usuario,
  kp_buy.email                                               AS purchase_email_kiwify,
  t.id                                                       AS tenant_id,
  s.id                                                       AS subscription_id,
  upper(trim(p.name))                                        AS plan_code,
  s.billing_cycle                                            AS billing_cycle_atual,
  s.current_period_start                                     AS period_start_atual,
  s.current_period_end                                       AS period_end_atual,
  kp_buy.paid_at                                             AS kiwify_paid_at,
  kprod.product_name                                         AS produto_kiwify,
  kprod.billing_cycle                                        AS ciclo_produto_catalogo,
  kp_buy.activation_status                                   AS activation_status,
  -- Proposta
  'annual'                                                   AS novo_billing_cycle,
  COALESCE(kp_buy.paid_at, s.current_period_start)           AS novo_period_start,
  COALESCE(kp_buy.paid_at, s.current_period_start)
    + interval '12 months'                                   AS novo_period_end,
  CASE
    WHEN s.billing_cycle = 'annual'
      THEN 'NENHUMA ALTERAÇÃO — já é annual'
    WHEN kp_buy.paid_at IS NULL
      THEN 'ATENÇÃO: paid_at Kiwify NULL — period_start usará current_period_start'
    ELSE 'SERÁ ALTERADO: ' || COALESCE(s.billing_cycle,'NULL') || ' → annual'
  END                                                        AS status_correcao
FROM public.users u
JOIN public.tenants t ON t.id = u.tenant_id
JOIN public.subscriptions s ON s.tenant_id = t.id
JOIN public.plans p ON p.id = s.plan_id
LEFT JOIN LATERAL (
  SELECT kp2.email, kp2.product_key, kp2.paid_at, kp2.plan_code, kp2.activation_status
  FROM public.kiwify_purchases kp2
  WHERE lower(trim(kp2.email)) = 'miriam123.om@gmail.com'
    AND upper(trim(kp2.status)) = 'APPROVED'
  ORDER BY COALESCE(kp2.paid_at, kp2.created_at) DESC
  LIMIT 1
) kp_buy ON true
LEFT JOIN public.kiwify_products kprod ON kprod.product_key = kp_buy.product_key
WHERE lower(trim(u.email)) = 'miriam123.om@gmail.com'
ORDER BY s.created_at DESC
LIMIT 1;


-- ============================================================
-- B. CORREÇÃO (BEGIN/ROLLBACK por padrão)
-- Revisar o SELECT A e A2 antes de prosseguir.
-- ============================================================

BEGIN;

-- ── B.1 Geizaceleste ─────────────────────────────────────────────────────────
-- Localiza via tenant_id = 59e937e6-f66b-4941-a4ad-48bc636ec3f5
-- Compra Kiwify via geizaceleste29@gmail.com (email divergente)
-- Divergência registrada explicitamente no admin_audit_logs

DO $$
DECLARE
  v_tenant_id   uuid        := '59e937e6-f66b-4941-a4ad-48bc636ec3f5';
  v_sub_id      uuid;
  v_old_cycle   text;
  v_old_start   timestamptz;
  v_old_end     timestamptz;
  v_new_start   timestamptz;
  v_new_end     timestamptz;
  v_kiwify_paid timestamptz;
  v_user_email  text;
BEGIN
  -- 1. Email do usuário no sistema (para log)
  SELECT u.email INTO v_user_email
  FROM public.users u
  WHERE u.tenant_id = v_tenant_id
  LIMIT 1;

  -- 2. Subscription via tenant_id
  SELECT s.id, s.billing_cycle, s.current_period_start, s.current_period_end
  INTO v_sub_id, v_old_cycle, v_old_start, v_old_end
  FROM public.subscriptions s
  WHERE s.tenant_id = v_tenant_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_sub_id IS NULL THEN
    RAISE WARNING 'Geizaceleste: subscription não encontrada para tenant_id=% — pulando', v_tenant_id;
    RETURN;
  END IF;

  -- 3. paid_at via email da compra Kiwify (divergente)
  SELECT kp.paid_at INTO v_kiwify_paid
  FROM public.kiwify_purchases kp
  WHERE lower(trim(kp.email)) = 'geizaceleste29@gmail.com'
    AND upper(trim(kp.status)) = 'APPROVED'
  ORDER BY COALESCE(kp.paid_at, kp.created_at) DESC
  LIMIT 1;

  IF v_kiwify_paid IS NULL THEN
    RAISE WARNING 'Geizaceleste: compra Kiwify (geizaceleste29@) não encontrada — usando current_period_start como fallback';
  END IF;

  v_new_start := COALESCE(v_kiwify_paid, v_old_start);
  v_new_end   := v_new_start + interval '12 months';

  -- 4. Atualiza subscription
  UPDATE public.subscriptions
  SET billing_cycle        = 'annual',
      current_period_start = v_new_start,
      current_period_end   = v_new_end,
      updated_at           = now()
  WHERE id = v_sub_id;

  -- 5. Audit log — explicita divergência de email
  INSERT INTO public.admin_audit_logs (
    action, resource_type, resource_id, tenant_id,
    performed_by, performed_by_email,
    before_data, after_data, reason
  ) VALUES (
    'FIX_BILLING_CYCLE',
    'subscription',
    v_sub_id::text,
    v_tenant_id,
    NULL,
    'migration:proposed_fix_pro_annual_cycle_geiza_miriam_v2',
    jsonb_build_object(
      'billing_cycle',        v_old_cycle,
      'current_period_start', v_old_start,
      'current_period_end',   v_old_end
    ),
    jsonb_build_object(
      'billing_cycle',        'annual',
      'current_period_start', v_new_start,
      'current_period_end',   v_new_end,
      'kiwify_paid_at',       v_kiwify_paid,
      'email_divergencia',    'compra=geizaceleste29@gmail.com / sistema=' || COALESCE(v_user_email, '?')
    ),
    'Correção manual — ciclo anual confirmado pela CEO 2026-06-17. '
    'DIVERGÊNCIA DE EMAIL: compra Kiwify=geizaceleste29@gmail.com / conta sistema='
    || COALESCE(v_user_email,'desconhecido')
    || ' / tenant_id=' || v_tenant_id::text
    || '. PLANO PRO ANUAL Kiwify (08/05/2026). '
    || 'period_start='
    || CASE WHEN v_kiwify_paid IS NOT NULL
         THEN 'paid_at Kiwify (' || v_new_start::text || ')'
         ELSE 'fallback current_period_start (' || v_new_start::text || ')'
       END
  );

  RAISE NOTICE '✓ Geizaceleste: tenant_id=% sub_id=% user=% billing_cycle=annual start=% end=%',
    v_tenant_id, v_sub_id, COALESCE(v_user_email,'?'), v_new_start, v_new_end;
END $$;


-- ── B.2 Miriam Oliveira Feitosa (miriam123.om@gmail.com) ────────────────────

DO $$
DECLARE
  v_sub_id      uuid;
  v_tid         uuid;
  v_old_cycle   text;
  v_old_start   timestamptz;
  v_old_end     timestamptz;
  v_new_start   timestamptz;
  v_new_end     timestamptz;
  v_kiwify_paid timestamptz;
BEGIN
  -- 1. Subscription via email da conta (sem divergência)
  SELECT s.id, s.tenant_id, s.billing_cycle, s.current_period_start, s.current_period_end
  INTO v_sub_id, v_tid, v_old_cycle, v_old_start, v_old_end
  FROM public.subscriptions s
  JOIN public.users u ON u.tenant_id = s.tenant_id
  WHERE lower(trim(u.email)) = 'miriam123.om@gmail.com'
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_sub_id IS NULL THEN
    RAISE WARNING 'Miriam: subscription não encontrada — pulando';
    RETURN;
  END IF;

  -- 2. paid_at da compra Kiwify
  -- Nota: compra em 08/05/2026; ativação tardia em 03/06/2026.
  -- Usamos paid_at (data real da compra) como period_start.
  SELECT kp.paid_at INTO v_kiwify_paid
  FROM public.kiwify_purchases kp
  WHERE lower(trim(kp.email)) = 'miriam123.om@gmail.com'
    AND upper(trim(kp.status)) = 'APPROVED'
  ORDER BY COALESCE(kp.paid_at, kp.created_at) DESC
  LIMIT 1;

  IF v_kiwify_paid IS NULL THEN
    RAISE WARNING 'Miriam: paid_at Kiwify não encontrado — usando current_period_start como fallback';
  END IF;

  v_new_start := COALESCE(v_kiwify_paid, v_old_start);
  v_new_end   := v_new_start + interval '12 months';

  -- 3. Atualiza subscription
  UPDATE public.subscriptions
  SET billing_cycle        = 'annual',
      current_period_start = v_new_start,
      current_period_end   = v_new_end,
      updated_at           = now()
  WHERE id = v_sub_id;

  -- 4. Audit log
  INSERT INTO public.admin_audit_logs (
    action, resource_type, resource_id, tenant_id,
    performed_by, performed_by_email,
    before_data, after_data, reason
  ) VALUES (
    'FIX_BILLING_CYCLE',
    'subscription',
    v_sub_id::text,
    v_tid,
    NULL,
    'migration:proposed_fix_pro_annual_cycle_geiza_miriam_v2',
    jsonb_build_object(
      'billing_cycle',        v_old_cycle,
      'current_period_start', v_old_start,
      'current_period_end',   v_old_end
    ),
    jsonb_build_object(
      'billing_cycle',        'annual',
      'current_period_start', v_new_start,
      'current_period_end',   v_new_end,
      'kiwify_paid_at',       v_kiwify_paid
    ),
    'Correção manual — ciclo anual confirmado pela CEO 2026-06-17: '
    'PLANO PRO ANUAL Kiwify (miriam123.om@gmail.com). '
    'Compra 08/05/2026, ativação tardia 03/06/2026. '
    'period_start = data compra Kiwify (paid_at).'
  );

  RAISE NOTICE '✓ Miriam: sub_id=% billing_cycle=annual start=% end=%',
    v_sub_id, v_new_start, v_new_end;
END $$;


-- ── Verificação final dentro da transação (rode antes de decidir COMMIT) ─────

SELECT * FROM (
  SELECT
    'GEIZACELESTE'                                           AS assinante,
    u.email                                                  AS user_email,
    upper(trim(p.name))                                      AS plan_code,
    s.billing_cycle,
    s.current_period_start,
    s.current_period_end,
    EXTRACT(DAYS FROM (s.current_period_end - s.current_period_start))::int
                                                             AS dias_periodo,
    s.updated_at
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  LEFT JOIN public.users u ON u.tenant_id = s.tenant_id
  WHERE s.tenant_id = '59e937e6-f66b-4941-a4ad-48bc636ec3f5'
  ORDER BY s.created_at DESC
  LIMIT 1
) geizaceleste

UNION ALL

SELECT * FROM (
  SELECT
    'MIRIAM'                                                 AS assinante,
    u.email                                                  AS user_email,
    upper(trim(p.name))                                      AS plan_code,
    s.billing_cycle,
    s.current_period_start,
    s.current_period_end,
    EXTRACT(DAYS FROM (s.current_period_end - s.current_period_start))::int
                                                             AS dias_periodo,
    s.updated_at
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  JOIN public.users u ON u.tenant_id = s.tenant_id
  WHERE lower(trim(u.email)) = 'miriam123.om@gmail.com'
  ORDER BY s.created_at DESC
  LIMIT 1
) miriam;


-- ── ROLLBACK padrão ──────────────────────────────────────────────────────────
-- Trocar por COMMIT somente após:
--   1. A CEO revisar os SELECTs acima e confirmar os valores.
--   2. A CEO confirmar que não há créditos pendentes a ajustar.
ROLLBACK;
-- COMMIT;


-- ============================================================
-- C. NOTA PÓS-COMMIT: Verificação de créditos (NÃO rodar SQL)
--
-- Após COMMIT, verificar via painel CEO se Geizaceleste e Miriam
-- têm todos os grants mensais desde a data de compra (08/05/2026).
-- Usar dry-run do painel CEO por subscription_id.
-- Se houver grants faltantes, conceder SOMENTE via painel CEO.
-- NÃO usar SQL direto em credits_wallet ou credits_ledger.
-- ============================================================
