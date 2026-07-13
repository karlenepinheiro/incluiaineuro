-- ============================================================
-- proposed_fix_francisca_commercial_history_DO_NOT_RUN.sql
--
-- HISTÓRICO COMERCIAL: Francisca Nogueira Silva
--
-- Situação confirmada pela CEO em 2026-06-17:
--   email sistema:          franciscans12@gmail.com
--   email compra Kiwify:    francans12@gmail.com  (divergência de email)
--   tenant_id:              e1ed951a-e9d3-4dfd-9327-c01b639d3844
--   plano atual:            MASTER (confirmado — NÃO rebaixar)
--   billing_cycle atual:    NULL  (precisa correção posterior)
--   period_start atual:     NULL
--   period_end atual:       NULL
--   compra original:        PLANO PRO ANUAL — 07/05/2026 (francans12@)
--   upgrade realizado:      PRO → MASTER; cliente pagou a diferença
--   registro do upgrade:    não consta em admin_audit_logs
--
-- OBJETIVOS:
--   B.1 — Registrar evento comercial de upgrade em subscription_commercial_events
--   B.2 — Corrigir billing_cycle → 'annual' e period_start/end (comentado;
--          executar em rodada separada após confirmar B.1)
--
-- REGRAS:
--   - NÃO rebaixar Francisca para PRO
--   - NÃO alterar plan_id
--   - NÃO alterar créditos, credits_wallet, credits_ledger
--   - NÃO fazer COMMIT sem autorização da CEO
-- ============================================================


-- ============================================================
-- PRE_SCHEMA_CHECK
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
    'kiwify_purchases', 'kiwify_products',
    'admin_audit_logs', 'subscription_commercial_events'
  )
ORDER BY table_name, ordinal_position;

-- Verifica se subscription_commercial_events já existe
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'subscription_commercial_events'
  ) AS tabela_sce_existe;


-- ============================================================
-- A. SELECT DE CONFERÊNCIA — estado atual de Francisca
-- ============================================================
SELECT
  u.email                                                    AS user_email,
  COALESCE(u.nome, u.full_name)                              AS nome_usuario,
  kp.email                                                   AS email_compra_kiwify,
  t.id                                                       AS tenant_id,
  s.id                                                       AS subscription_id,
  upper(trim(p.name))                                        AS plan_code_atual,
  kprod.plan_code                                            AS plan_code_compra_original,
  s.billing_cycle                                            AS billing_cycle_atual,
  s.current_period_start                                     AS period_start_atual,
  s.current_period_end                                       AS period_end_atual,
  s.updated_at                                               AS subscription_updated_at,
  kp.paid_at                                                 AS kiwify_paid_at,
  kprod.product_name                                         AS produto_kiwify,
  kprod.billing_cycle                                        AS ciclo_produto_catalogo,
  kp.activation_status,
  -- Divergência de email
  CASE
    WHEN lower(trim(u.email)) <> lower(trim(kp.email))
      THEN 'DIVERGÊNCIA: sistema=' || u.email || ' / kiwify=' || kp.email
    ELSE 'email_ok'
  END                                                        AS alerta_email,
  -- Proposta B.1: evento comercial
  'UPGRADE_PLAN'                                             AS evento_a_registrar,
  'PRO'                                                      AS de_plano,
  'MASTER'                                                   AS para_plano,
  -- Proposta B.2: correção de ciclo (para rodar em etapa posterior)
  'annual'                                                   AS novo_billing_cycle_proposto,
  COALESCE(kp.paid_at, s.updated_at)                        AS novo_period_start_proposto,
  COALESCE(kp.paid_at, s.updated_at)
    + interval '12 months'                                   AS novo_period_end_proposto
FROM public.tenants t
JOIN public.subscriptions s ON s.tenant_id = t.id
JOIN public.plans p ON p.id = s.plan_id
LEFT JOIN public.users u ON u.tenant_id = t.id
-- Compra PRO (pode ser por francans12 ou franciscans12)
LEFT JOIN LATERAL (
  SELECT kp2.email, kp2.product_key, kp2.paid_at, kp2.plan_code, kp2.activation_status
  FROM public.kiwify_purchases kp2
  WHERE lower(trim(kp2.email)) IN ('francans12@gmail.com', 'franciscans12@gmail.com')
    AND upper(trim(kp2.status)) = 'APPROVED'
  ORDER BY COALESCE(kp2.paid_at, kp2.created_at) ASC  -- compra mais antiga = original PRO
  LIMIT 1
) kp ON true
LEFT JOIN public.kiwify_products kprod ON kprod.product_key = kp.product_key
WHERE t.id = 'e1ed951a-e9d3-4dfd-9327-c01b639d3844'
ORDER BY s.created_at DESC
LIMIT 1;


-- A2. Auditoria de registros existentes de upgrade
SELECT
  al.id,
  al.action,
  al.performed_by_email,
  al.before_data,
  al.after_data,
  al.reason,
  al.created_at
FROM public.admin_audit_logs al
WHERE al.tenant_id = 'e1ed951a-e9d3-4dfd-9327-c01b639d3844'
ORDER BY al.created_at DESC
LIMIT 20;


-- ============================================================
-- B. OPERAÇÕES (BEGIN/ROLLBACK por padrão)
-- ============================================================

BEGIN;

-- ── B.1: Registrar evento de upgrade em subscription_commercial_events ────────
-- Executar PRIMEIRO. Registra o histórico sem alterar nenhum dado de plano.

DO $$
DECLARE
  v_tenant_id       uuid := 'e1ed951a-e9d3-4dfd-9327-c01b639d3844';
  v_sub_id          uuid;
  v_user_email      text;
  v_kiwify_paid     timestamptz;
  v_kiwify_pkey     text;
  v_sce_exists      boolean;
BEGIN
  -- 0. Verifica se a tabela existe
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'subscription_commercial_events'
  ) INTO v_sce_exists;

  IF NOT v_sce_exists THEN
    RAISE EXCEPTION 'Tabela subscription_commercial_events não existe. '
      'Rodar migration 20260617000001_subscription_commercial_events.sql primeiro.';
  END IF;

  -- 1. Subscription
  SELECT s.id INTO v_sub_id
  FROM public.subscriptions s
  WHERE s.tenant_id = v_tenant_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_sub_id IS NULL THEN
    RAISE EXCEPTION 'Subscription não encontrada para tenant_id=%', v_tenant_id;
  END IF;

  -- 2. Email do usuário
  SELECT u.email INTO v_user_email
  FROM public.users u
  WHERE u.tenant_id = v_tenant_id
  LIMIT 1;

  -- 3. Compra PRO original (email pode ser francans12 ou franciscans12)
  SELECT kp.paid_at, kp.product_key INTO v_kiwify_paid, v_kiwify_pkey
  FROM public.kiwify_purchases kp
  WHERE lower(trim(kp.email)) IN ('francans12@gmail.com', 'franciscans12@gmail.com')
    AND upper(trim(kp.status)) = 'APPROVED'
  ORDER BY COALESCE(kp.paid_at, kp.created_at) ASC  -- mais antiga = original
  LIMIT 1;

  -- 4. Verifica se evento já existe (evitar duplicata)
  PERFORM 1
  FROM public.subscription_commercial_events
  WHERE tenant_id = v_tenant_id
    AND event_type = 'UPGRADE_PLAN'
    AND from_plan_code = 'PRO'
    AND to_plan_code = 'MASTER';

  IF FOUND THEN
    RAISE NOTICE 'Evento UPGRADE_PLAN PRO→MASTER já existe para tenant_id=%. Pulando inserção.', v_tenant_id;
    RETURN;
  END IF;

  -- 5. Insere evento comercial de upgrade
  INSERT INTO public.subscription_commercial_events (
    tenant_id,
    subscription_id,
    event_type,
    from_plan_code,
    to_plan_code,
    from_billing_cycle,
    to_billing_cycle,
    amount_paid_brl,
    source,
    kiwify_product_key,
    notes,
    performed_by_email,
    event_date
  ) VALUES (
    v_tenant_id,
    v_sub_id,
    'UPGRADE_PLAN',
    'PRO',
    'MASTER',
    'annual',   -- ciclo do plano PRO original
    'annual',   -- ciclo esperado do MASTER
    NULL,       -- valor da diferença paga (registrar se conhecido)
    'manual_ceo',
    v_kiwify_pkey,
    'Upgrade PRO → MASTER. Cliente pagou a diferença. '
    'Compra PRO original: francans12@gmail.com em '
    || COALESCE(v_kiwify_paid::text, '07/05/2026') || '. '
    'Email sistema: ' || COALESCE(v_user_email,'franciscans12@gmail.com') || '. '
    'Divergência de email confirmada (kiwify=francans12 / sistema=franciscans12). '
    'Confirmado pela CEO em 2026-06-17.',
    'profkarlenepinheiro@gmail.com',
    COALESCE(v_kiwify_paid, now())
  );

  RAISE NOTICE '✓ Evento UPGRADE_PLAN PRO→MASTER registrado para tenant_id=% sub_id=%',
    v_tenant_id, v_sub_id;
END $$;


-- ── B.2: Correção de billing_cycle (COMENTADO — rodar em etapa posterior) ────
--
-- Pré-condição: B.1 aprovado e COMMITado.
-- Descomente e rode em uma segunda janela após autorização da CEO.
--
-- DO $$
-- DECLARE
--   v_tenant_id   uuid        := 'e1ed951a-e9d3-4dfd-9327-c01b639d3844';
--   v_sub_id      uuid;
--   v_old_cycle   text;
--   v_old_start   timestamptz;
--   v_old_end     timestamptz;
--   v_new_start   timestamptz;
--   v_new_end     timestamptz;
--   v_kiwify_paid timestamptz;
-- BEGIN
--   SELECT s.id, s.billing_cycle, s.current_period_start, s.current_period_end
--   INTO v_sub_id, v_old_cycle, v_old_start, v_old_end
--   FROM public.subscriptions s
--   WHERE s.tenant_id = v_tenant_id
--   ORDER BY s.created_at DESC LIMIT 1;
--
--   SELECT kp.paid_at INTO v_kiwify_paid
--   FROM public.kiwify_purchases kp
--   WHERE lower(trim(kp.email)) IN ('francans12@gmail.com', 'franciscans12@gmail.com')
--     AND upper(trim(kp.status)) = 'APPROVED'
--   ORDER BY COALESCE(kp.paid_at, kp.created_at) ASC LIMIT 1;
--
--   v_new_start := COALESCE(v_kiwify_paid, v_old_start, now());
--   v_new_end   := v_new_start + interval '12 months';
--
--   UPDATE public.subscriptions
--   SET billing_cycle        = 'annual',
--       current_period_start = v_new_start,
--       current_period_end   = v_new_end,
--       updated_at           = now()
--   WHERE id = v_sub_id;
--
--   INSERT INTO public.admin_audit_logs (
--     action, resource_type, resource_id, tenant_id,
--     performed_by, performed_by_email, before_data, after_data, reason
--   ) VALUES (
--     'FIX_BILLING_CYCLE', 'subscription', v_sub_id::text, v_tenant_id, NULL,
--     'migration:proposed_fix_francisca_commercial_history',
--     jsonb_build_object('billing_cycle', v_old_cycle,
--       'current_period_start', v_old_start, 'current_period_end', v_old_end),
--     jsonb_build_object('billing_cycle', 'annual',
--       'current_period_start', v_new_start, 'current_period_end', v_new_end,
--       'kiwify_paid_at', v_kiwify_paid),
--     'Correção ciclo billing: NULL → annual. Francisca (franciscans12). '
--     'Upgrade PRO→MASTER previamente registrado em subscription_commercial_events. '
--     'period_start = paid_at compra PRO Kiwify (referência mais antiga disponível). '
--     'Autorizado pela CEO em 2026-06-17.'
--   );
--
--   RAISE NOTICE 'Francisca: billing_cycle=annual start=% end=%', v_new_start, v_new_end;
-- END $$;


-- ── Verificação final dentro da transação ────────────────────────────────────
SELECT
  u.email                       AS user_email,
  upper(trim(p.name))           AS plan_code,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  s.updated_at
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
LEFT JOIN public.users u ON u.tenant_id = s.tenant_id
WHERE s.tenant_id = 'e1ed951a-e9d3-4dfd-9327-c01b639d3844'
ORDER BY s.created_at DESC
LIMIT 1;

-- Verifica evento registrado
SELECT *
FROM public.subscription_commercial_events
WHERE tenant_id = 'e1ed951a-e9d3-4dfd-9327-c01b639d3844'
ORDER BY event_date DESC;


-- ── ROLLBACK padrão ──────────────────────────────────────────────────────────
-- Trocar por COMMIT após revisão e autorização da CEO.
-- Após COMMIT do B.1, agendar B.2 (ciclo) para rodada separada.
ROLLBACK;
-- COMMIT;
