-- ============================================================
-- proposed_fix_current_subscribers_cycles_from_kiwify_REAL_LIST_DO_NOT_RUN.sql
--
-- ATENÇÃO: NÃO RODAR DIRETAMENTE EM PRODUÇÃO.
-- Revisar SELECT de conferência (seção A) antes de executar a seção B.
-- Por padrão usa ROLLBACK — trocar para COMMIT somente após revisão e
-- autorização explícita da CEO.
--
-- Origem: lista real de assinantes confirmada pela CEO em 2026-06-17.
--
-- Regras aplicadas:
--   - product_name ILIKE '%ANUAL%'  → billing_cycle = 'annual'
--                                     current_period_end = current_period_start + 12 months
--   - product_name ILIKE '%MENSAL%' → billing_cycle = 'monthly'
--                                     current_period_end = current_period_start + 1 month
--   - Premium no banco = MASTER (não altera plan_code)
--   - Pro no banco = PRO (não altera plan_code)
--
-- NÃO altera: créditos, saldo, credits_wallet, credits_ledger, credit_batches
-- ============================================================


-- ============================================================
-- A. SELECT DE CONFERÊNCIA (sempre seguro — rode antes do UPDATE)
--    Mostra estado atual vs. sugestão antes de qualquer alteração.
-- ============================================================

SELECT
  u.email,
  t.name                                                          AS tenant,
  upper(trim(p.name))                                            AS plan_code_atual,
  s.id                                                           AS subscription_id,
  s.billing_cycle                                                AS billing_cycle_atual,
  s.current_period_start,
  s.current_period_end                                           AS period_end_atual,
  kp.product_name                                                AS produto_kiwify,
  CASE
    WHEN kp.product_name ILIKE '%ANUAL%' OR kp.product_name ILIKE '%ANNUAL%' THEN 'annual'
    WHEN kp.product_name ILIKE '%MENSAL%' OR kp.product_name ILIKE '%MONTHLY%' THEN 'monthly'
    ELSE 'INDETERMINADO'
  END                                                            AS novo_billing_cycle,
  CASE
    WHEN kp.product_name ILIKE '%ANUAL%' OR kp.product_name ILIKE '%ANNUAL%'
      THEN s.current_period_start + interval '12 months'
    WHEN kp.product_name ILIKE '%MENSAL%' OR kp.product_name ILIKE '%MONTHLY%'
      THEN s.current_period_start + interval '1 month'
    ELSE NULL
  END                                                            AS novo_period_end,
  CASE
    WHEN kp.product_name ILIKE '%ANUAL%' OR kp.product_name ILIKE '%ANNUAL%'
      THEN 'product_name contém ANUAL'
    WHEN kp.product_name ILIKE '%MENSAL%' OR kp.product_name ILIKE '%MONTHLY%'
      THEN 'product_name contém MENSAL'
    ELSE 'sem evidência no nome — verificar manualmente'
  END                                                            AS evidencia,
  CASE
    WHEN s.billing_cycle IS DISTINCT FROM (
      CASE
        WHEN kp.product_name ILIKE '%ANUAL%' OR kp.product_name ILIKE '%ANNUAL%' THEN 'annual'
        WHEN kp.product_name ILIKE '%MENSAL%' OR kp.product_name ILIKE '%MONTHLY%' THEN 'monthly'
      END
    ) THEN 'SERÁ ALTERADO'
    ELSE 'já correto'
  END                                                            AS status_correcao
FROM public.users u
JOIN public.tenants t ON t.id = u.tenant_id
JOIN public.subscriptions s ON s.tenant_id = t.id
JOIN public.plans p ON p.id = s.plan_id
LEFT JOIN LATERAL (
  SELECT kp2.product_name
  FROM public.kiwify_purchases kp2
  WHERE kp2.tenant_id = t.id
    AND upper(trim(kp2.status)) = 'APPROVED'
  ORDER BY COALESCE(kp2.paid_at, kp2.created_at) DESC
  LIMIT 1
) kp ON true
WHERE u.email IN (
  -- 1 mensal
  'lourdes-cs@hotmail.com',
  -- 14 Premium Anual
  'sarah6884@hotmail.com',
  'psiweniaandrade1@gmail.com',
  'vilanybezerra@gmail.com',
  'lusenirss@gmail.com',
  'mariaexpeditalimamoura@gmail.com',
  'sandramariosouza@gmail.com',
  'laisdasilvaesilva7@gmail.com',
  'nilmariafaria@gmail.com',
  'lucienerebeka@gmail.com',
  'genicleide.carvalho@gmail.com',
  'marialiliane1983@hotmail.com',
  'je.fialho@hotmail.com',
  'dianacoelhonunes@gmail.com',
  'vanusar0@gmail.com',
  -- 4 Pro Anual
  'miriam123.om@gmail.com',
  'geizaceleste29@gmail.com',
  'francans12@gmail.com',
  'elielzamelo26@gmail.com'
)
ORDER BY
  CASE
    WHEN kp.product_name ILIKE '%MENSAL%' OR kp.product_name ILIKE '%MONTHLY%' THEN 0
    ELSE 1
  END,
  u.email;


-- ============================================================
-- B. CORREÇÃO DE CICLOS (BEGIN/ROLLBACK por padrão)
--    Trocar ROLLBACK por COMMIT somente após revisar o SELECT acima
--    e obter autorização da CEO.
--    Registra auditoria em admin_audit_logs para cada alteração.
-- ============================================================

BEGIN;

-- ── B.1 Maria de Lourdes da Cruz Silva — MENSAL ──────────────────────────────
-- email: lourdes-cs@hotmail.com | produto: PLANO PREMIUM MENSAL | data: 27/05/2026

DO $$
DECLARE
  v_sub_id   uuid;
  v_tid      uuid;
  v_old_cycle text;
  v_old_end   timestamptz;
  v_new_end   timestamptz;
BEGIN
  SELECT s.id, s.tenant_id, s.billing_cycle, s.current_period_end
  INTO v_sub_id, v_tid, v_old_cycle, v_old_end
  FROM public.subscriptions s
  JOIN public.users u ON u.tenant_id = s.tenant_id
  WHERE u.email = 'lourdes-cs@hotmail.com'
  LIMIT 1;

  IF v_sub_id IS NULL THEN
    RAISE WARNING 'lourdes-cs@hotmail.com: subscription não encontrada — pulando';
    RETURN;
  END IF;

  v_new_end := (SELECT current_period_start + interval '1 month'
                FROM public.subscriptions WHERE id = v_sub_id);

  UPDATE public.subscriptions
  SET billing_cycle        = 'monthly',
      current_period_end   = v_new_end,
      updated_at           = now()
  WHERE id = v_sub_id;

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
    'migration:proposed_fix_current_subscribers_cycles',
    jsonb_build_object('billing_cycle', v_old_cycle, 'current_period_end', v_old_end),
    jsonb_build_object('billing_cycle', 'monthly',   'current_period_end', v_new_end),
    'Correção manual — lista real CEO 2026-06-17: PLANO PREMIUM MENSAL (lourdes-cs@hotmail.com)'
  );

  RAISE NOTICE 'lourdes-cs@hotmail.com: billing_cycle=monthly period_end=%', v_new_end;
END $$;


-- ── B.2 Assinantes anuais — PREMIUM ANUAL (14 assinantes) ───────────────────

DO $$
DECLARE
  v_email    text;
  v_sub_id   uuid;
  v_tid      uuid;
  v_old_cycle text;
  v_old_end   timestamptz;
  v_new_end   timestamptz;
  v_emails   text[] := ARRAY[
    'sarah6884@hotmail.com',
    'psiweniaandrade1@gmail.com',
    'vilanybezerra@gmail.com',
    'lusenirss@gmail.com',
    'mariaexpeditalimamoura@gmail.com',
    'sandramariosouza@gmail.com',
    'laisdasilvaesilva7@gmail.com',
    'nilmariafaria@gmail.com',
    'lucienerebeka@gmail.com',
    'genicleide.carvalho@gmail.com',
    'marialiliane1983@hotmail.com',
    'je.fialho@hotmail.com',
    'dianacoelhonunes@gmail.com',
    'vanusar0@gmail.com'
  ];
BEGIN
  FOREACH v_email IN ARRAY v_emails LOOP
    SELECT s.id, s.tenant_id, s.billing_cycle, s.current_period_end
    INTO v_sub_id, v_tid, v_old_cycle, v_old_end
    FROM public.subscriptions s
    JOIN public.users u ON u.tenant_id = s.tenant_id
    WHERE u.email = v_email
    LIMIT 1;

    IF v_sub_id IS NULL THEN
      RAISE WARNING '%: subscription não encontrada — pulando', v_email;
      CONTINUE;
    END IF;

    v_new_end := (SELECT current_period_start + interval '12 months'
                  FROM public.subscriptions WHERE id = v_sub_id);

    UPDATE public.subscriptions
    SET billing_cycle        = 'annual',
        current_period_end   = v_new_end,
        updated_at           = now()
    WHERE id = v_sub_id;

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
      'migration:proposed_fix_current_subscribers_cycles',
      jsonb_build_object('billing_cycle', v_old_cycle, 'current_period_end', v_old_end),
      jsonb_build_object('billing_cycle', 'annual',    'current_period_end', v_new_end),
      'Correção manual — lista real CEO 2026-06-17: PREMIUM ANUAL (' || v_email || ')'
    );

    RAISE NOTICE '%: billing_cycle=annual period_end=%', v_email, v_new_end;
  END LOOP;
END $$;


-- ── B.3 Assinantes anuais — PRO ANUAL (4 assinantes) ────────────────────────

DO $$
DECLARE
  v_email    text;
  v_sub_id   uuid;
  v_tid      uuid;
  v_old_cycle text;
  v_old_end   timestamptz;
  v_new_end   timestamptz;
  v_emails   text[] := ARRAY[
    'miriam123.om@gmail.com',
    'geizaceleste29@gmail.com',
    'francans12@gmail.com',
    'elielzamelo26@gmail.com'
  ];
BEGIN
  FOREACH v_email IN ARRAY v_emails LOOP
    SELECT s.id, s.tenant_id, s.billing_cycle, s.current_period_end
    INTO v_sub_id, v_tid, v_old_cycle, v_old_end
    FROM public.subscriptions s
    JOIN public.users u ON u.tenant_id = s.tenant_id
    WHERE u.email = v_email
    LIMIT 1;

    IF v_sub_id IS NULL THEN
      RAISE WARNING '%: subscription não encontrada — pulando', v_email;
      CONTINUE;
    END IF;

    v_new_end := (SELECT current_period_start + interval '12 months'
                  FROM public.subscriptions WHERE id = v_sub_id);

    UPDATE public.subscriptions
    SET billing_cycle        = 'annual',
        current_period_end   = v_new_end,
        updated_at           = now()
    WHERE id = v_sub_id;

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
      'migration:proposed_fix_current_subscribers_cycles',
      jsonb_build_object('billing_cycle', v_old_cycle, 'current_period_end', v_old_end),
      jsonb_build_object('billing_cycle', 'annual',    'current_period_end', v_new_end),
      'Correção manual — lista real CEO 2026-06-17: PLANO PRO ANUAL (' || v_email || ')'
    );

    RAISE NOTICE '%: billing_cycle=annual period_end=%', v_email, v_new_end;
  END LOOP;
END $$;


-- ── Verificação final dentro da transação ────────────────────────────────────
-- Execute após os UPDATEs acima para confirmar o resultado antes do COMMIT.

SELECT
  u.email,
  upper(trim(p.name))  AS plan_code,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  EXTRACT(DAY FROM (s.current_period_end - s.current_period_start))::int AS dias_periodo
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
JOIN public.users u ON u.tenant_id = s.tenant_id
WHERE u.email IN (
  'lourdes-cs@hotmail.com',
  'sarah6884@hotmail.com', 'psiweniaandrade1@gmail.com', 'vilanybezerra@gmail.com',
  'lusenirss@gmail.com', 'mariaexpeditalimamoura@gmail.com', 'sandramariosouza@gmail.com',
  'laisdasilvaesilva7@gmail.com', 'nilmariafaria@gmail.com', 'lucienerebeka@gmail.com',
  'genicleide.carvalho@gmail.com', 'marialiliane1983@hotmail.com', 'je.fialho@hotmail.com',
  'dianacoelhonunes@gmail.com', 'vanusar0@gmail.com',
  'miriam123.om@gmail.com', 'geizaceleste29@gmail.com', 'francans12@gmail.com',
  'elielzamelo26@gmail.com'
)
ORDER BY s.billing_cycle, u.email;


-- ── ROLLBACK padrão — trocar por COMMIT após revisão autorizada ──────────────
ROLLBACK;
-- COMMIT;


-- ============================================================
-- C. DRY-RUN DE CRÉDITOS (rodar APÓS confirmar os ciclos)
--    Somente leitura — não concede créditos.
--    Executar para cada subscription_id das assinantes da lista.
--    Descomentar e substituir <uuid> pelo ID real da assinatura.
-- ============================================================

-- SELECT * FROM public.grant_missing_monthly_credits_for_subscription(
--   '<subscription_id_uuid>'::uuid,
--   true   -- p_dry_run = true: somente simula, NÃO concede créditos
-- );
