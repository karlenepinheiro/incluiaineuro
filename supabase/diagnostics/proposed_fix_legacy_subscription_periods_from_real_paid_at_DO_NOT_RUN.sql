-- ============================================================
-- proposed_fix_legacy_subscription_periods_from_real_paid_at_DO_NOT_RUN.sql
--
-- PATCH LEGADO: Corrigir current_period_start e current_period_end
-- de assinaturas pagas cuja data de início foi calculada erroneamente
-- (data de ativação, data de cadastro, ou data de processamento de webhook)
-- em vez da data real do pagamento aprovado na Kiwify.
--
-- REGRA COMERCIAL:
--   current_period_start = kp.paid_at (data real do pagamento Kiwify)
--   current_period_end   = kp.paid_at + ciclo
--     annual  → + 12 months
--     monthly → + 1 month
--
-- ANTES DE EXECUTAR:
--   1. Rodar 20260618_audit_subscriptions_period_source_impact.sql
--      e revisar o diagnóstico de cada assinante.
--   2. Confirmar com a CEO quais assinantes devem ser corrigidos.
--   3. Para Geizaceleste e Miriam, usar o patch individual
--      proposed_fix_pro_annual_cycle_geiza_miriam_DO_NOT_RUN.sql
--      (que tem tratamento especial para email divergente e data hard-coded).
--   4. NÃO executar COMMIT sem autorização explícita da CEO.
--
-- ESCOPO:
--   - Corrige APENAS subscriptions com paid_at real disponível em kiwify_purchases
--   - Filtra: plan IN (PRO, MASTER), status ACTIVE/COURTESY/OVERDUE
--   - Exclui tenants internos
--   - NÃO altera créditos, credits_wallet, credits_ledger
--   - NÃO concede créditos
--   - NÃO altera credit_batches
--   - Registra auditoria em admin_audit_logs com before/after
--
-- SEGURANÇA:
--   - Roda em BEGIN/ROLLBACK por padrão
--   - SELECT de conferência antes do UPDATE
--   - RAISE NOTICE para cada linha alterada
--   - Trocar ROLLBACK por COMMIT apenas após aprovação da CEO
-- ============================================================


-- ============================================================
-- PRE_SCHEMA_CHECK
-- ============================================================
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('subscriptions', 'kiwify_purchases', 'admin_audit_logs')
  AND c.column_name IN (
    'current_period_start', 'current_period_end', 'billing_cycle',
    'paid_at', 'status', 'tenant_id', 'updated_at',
    'action', 'resource_type', 'resource_id', 'before_data', 'after_data', 'reason'
  )
ORDER BY c.table_name, c.ordinal_position;


-- ============================================================
-- A. SELECT DE CONFERÊNCIA — O que será alterado
--    Mostre este resultado para a CEO antes de qualquer UPDATE.
-- ============================================================
SELECT
  u.email                                           AS user_email,
  kp.email                                          AS purchase_email,
  t.id                                              AS tenant_id,
  s.id                                              AS subscription_id,
  upper(trim(p.name))                               AS plan_code,
  s.billing_cycle,
  kp.product_key,

  -- Estado atual
  s.current_period_start                            AS period_start_atual,
  s.current_period_end                              AS period_end_atual,

  -- Estado proposto
  kp.paid_at                                        AS novo_period_start,
  CASE s.billing_cycle
    WHEN 'annual'  THEN kp.paid_at + interval '12 months'
    WHEN 'monthly' THEN kp.paid_at + interval '1 month'
    ELSE NULL
  END                                               AS novo_period_end,

  -- Desvio
  EXTRACT(DAYS FROM (s.current_period_start - kp.paid_at))::int
                                                    AS desvio_start_dias,

  -- Diagnóstico
  CASE
    WHEN s.current_period_start IS NULL
      THEN 'START_NULL — definir pela primeira vez'
    WHEN ABS(EXTRACT(EPOCH FROM (s.current_period_start - kp.paid_at))) < 86400
      THEN 'OK — desvio < 1 dia (fuso horário), SKIP'
    WHEN kp.activated_at IS NOT NULL
      AND ABS(EXTRACT(EPOCH FROM (s.current_period_start - kp.activated_at))) < 86400
      THEN 'ANCHORED_ON_ACTIVATION — corrigir'
    WHEN u.created_at IS NOT NULL
      AND ABS(EXTRACT(EPOCH FROM (s.current_period_start - u.created_at))) < 86400
      THEN 'ANCHORED_ON_SIGNUP — corrigir'
    WHEN ABS(EXTRACT(EPOCH FROM (s.current_period_start - kp.paid_at))) > 172800
      THEN 'NEEDS_PERIOD_FIX — desvio > 2 dias — corrigir'
    ELSE 'VERIFICAR — desvio 1-2 dias'
  END                                               AS diagnostico

FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
JOIN public.tenants t ON t.id = s.tenant_id
LEFT JOIN public.users u ON u.tenant_id = s.tenant_id
INNER JOIN LATERAL (
  -- INNER JOIN: só processa subscriptions com paid_at disponível
  SELECT kp2.*
  FROM   public.kiwify_purchases kp2
  WHERE  upper(trim(kp2.status)) = 'APPROVED'
    AND  kp2.plan_code IS NOT NULL
    AND  kp2.paid_at IS NOT NULL              -- somente se paid_at real existe
    AND  (
      kp2.tenant_id = s.tenant_id
      OR lower(trim(kp2.email)) = lower(trim(u.email))
    )
    AND  ABS(EXTRACT(EPOCH FROM (
      COALESCE(s.current_period_start, '1970-01-01'::timestamptz) - kp2.paid_at
    ))) > 86400                               -- só se desvio > 1 dia
  ORDER BY
    CASE WHEN kp2.tenant_id = s.tenant_id THEN 0 ELSE 1 END,
    COALESCE(kp2.paid_at, kp2.created_at) DESC
  LIMIT 1
) kp ON true
WHERE NOT COALESCE(t.is_internal, false)
  AND upper(trim(s.status)) IN ('ACTIVE', 'COURTESY', 'OVERDUE')
  AND upper(trim(p.name)) IN ('PRO', 'MASTER', 'PREMIUM')
  AND s.billing_cycle IN ('annual', 'monthly')   -- só corrige quando ciclo é conhecido
ORDER BY
  CASE WHEN s.current_period_start IS NULL THEN 0 ELSE 1 END,
  ABS(EXTRACT(EPOCH FROM (s.current_period_start - kp.paid_at))) DESC;


-- ============================================================
-- B. CORREÇÃO (BEGIN/ROLLBACK por padrão)
--    Revisar o SELECT A antes de prosseguir.
--    Trocar ROLLBACK por COMMIT apenas após aprovação da CEO.
-- ============================================================

BEGIN;

DO $$
DECLARE
  r              RECORD;
  v_old_start    timestamptz;
  v_old_end      timestamptz;
  v_new_start    timestamptz;
  v_new_end      timestamptz;
  v_count        int := 0;
  v_skipped      int := 0;
BEGIN

  FOR r IN
    SELECT
      s.id                      AS sub_id,
      s.tenant_id,
      s.billing_cycle,
      s.current_period_start    AS old_start,
      s.current_period_end      AS old_end,
      upper(trim(p.name))       AS plan_code,
      kp.paid_at                AS kp_paid_at,
      kp.id                     AS kp_id,
      kp.email                  AS kp_email,
      u.email                   AS user_email
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    JOIN public.tenants t ON t.id = s.tenant_id
    LEFT JOIN public.users u ON u.tenant_id = s.tenant_id
    INNER JOIN LATERAL (
      SELECT kp2.*
      FROM   public.kiwify_purchases kp2
      WHERE  upper(trim(kp2.status)) = 'APPROVED'
        AND  kp2.plan_code IS NOT NULL
        AND  kp2.paid_at IS NOT NULL
        AND  (
          kp2.tenant_id = s.tenant_id
          OR lower(trim(kp2.email)) = lower(trim(u.email))
        )
        AND  ABS(EXTRACT(EPOCH FROM (
          COALESCE(s.current_period_start, '1970-01-01'::timestamptz) - kp2.paid_at
        ))) > 86400
      ORDER BY
        CASE WHEN kp2.tenant_id = s.tenant_id THEN 0 ELSE 1 END,
        COALESCE(kp2.paid_at, kp2.created_at) DESC
      LIMIT 1
    ) kp ON true
    WHERE NOT COALESCE(t.is_internal, false)
      AND upper(trim(s.status)) IN ('ACTIVE', 'COURTESY', 'OVERDUE')
      AND upper(trim(p.name)) IN ('PRO', 'MASTER', 'PREMIUM')
      AND s.billing_cycle IN ('annual', 'monthly')
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    v_old_start := r.old_start;
    v_old_end   := r.old_end;
    v_new_start := r.kp_paid_at;

    -- Calcula new_end baseado no ciclo real
    v_new_end := CASE r.billing_cycle
      WHEN 'annual'  THEN v_new_start + interval '12 months'
      WHEN 'monthly' THEN v_new_start + interval '1 month'
      ELSE NULL
    END;

    IF v_new_end IS NULL THEN
      RAISE WARNING 'SKIP: billing_cycle desconhecido para sub_id=% — não corrigido', r.sub_id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Atualiza subscription
    UPDATE public.subscriptions
    SET    current_period_start = v_new_start,
           current_period_end   = v_new_end,
           updated_at           = now()
    WHERE  id = r.sub_id;

    -- Audit log
    INSERT INTO public.admin_audit_logs (
      action, resource_type, resource_id, tenant_id,
      performed_by, performed_by_email,
      before_data, after_data, reason
    ) VALUES (
      'FIX_PERIOD_ANCHORING',
      'subscription',
      r.sub_id::text,
      r.tenant_id,
      NULL,
      'migration:proposed_fix_legacy_subscription_periods',
      jsonb_build_object(
        'current_period_start', v_old_start,
        'current_period_end',   v_old_end,
        'billing_cycle',        r.billing_cycle
      ),
      jsonb_build_object(
        'current_period_start', v_new_start,
        'current_period_end',   v_new_end,
        'billing_cycle',        r.billing_cycle,
        'kp_paid_at',           r.kp_paid_at,
        'kp_email',             r.kp_email
      ),
      'Correção automática de período: current_period_start ancorado em kp.paid_at real da Kiwify. '
      || 'Bug original: period calculado em now() no webhook/RPC. '
      || 'user_email=' || COALESCE(r.user_email, '?')
      || ' purchase_email=' || COALESCE(r.kp_email, '?')
      || ' plan=' || r.plan_code
      || ' cycle=' || r.billing_cycle
    );

    v_count := v_count + 1;

    RAISE NOTICE '✓ Corrigido: sub_id=% tenant=% email=% plan=% cycle=% old_start=% new_start=% new_end=%',
      r.sub_id, r.tenant_id, COALESCE(r.user_email, r.kp_email, '?'),
      r.plan_code, r.billing_cycle, v_old_start, v_new_start, v_new_end;

  END LOOP;

  RAISE NOTICE '══ RESUMO: % subscriptions corrigidas, % ignoradas (ciclo desconhecido)', v_count, v_skipped;

END $$;


-- ── Verificação final dentro da transação (antes de decidir COMMIT) ─────────
SELECT
  u.email                        AS user_email,
  s.tenant_id,
  upper(trim(p.name))            AS plan_code,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  EXTRACT(DAYS FROM (s.current_period_end - s.current_period_start))::int
                                 AS period_days,
  s.updated_at
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
LEFT JOIN public.users u ON u.tenant_id = s.tenant_id
WHERE s.updated_at >= now() - interval '1 minute'
  AND upper(trim(p.name)) IN ('PRO', 'MASTER', 'PREMIUM')
ORDER BY s.updated_at DESC;


-- ── ROLLBACK padrão ──────────────────────────────────────────────────────────
-- Trocar por COMMIT somente após:
--   1. A CEO revisar o SELECT de verificação final acima.
--   2. A CEO confirmar que todos os períodos estão corretos.
--   3. Verificar que nenhuma linha de crédito foi alterada.
ROLLBACK;
-- COMMIT;


-- ============================================================
-- C. NOTA PÓS-COMMIT
--
-- Após COMMIT deste patch, verificar no painel CEO:
--   1. A view v_ceo_subscriber_health mostra current_period_start correto.
--   2. Assinantes com billing_cycle NULL devem ser tratados separadamente.
--   3. Para Geizaceleste e Miriam: usar o patch individual
--      proposed_fix_pro_annual_cycle_geiza_miriam_DO_NOT_RUN.sql.
--      Esse patch NÃO cobre os casos com email divergente.
--
-- NÃO alterar créditos, credits_wallet, credits_ledger, credit_batches.
-- ============================================================
