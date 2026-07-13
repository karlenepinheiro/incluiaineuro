-- ============================================================
-- 20260618000001_fix_subscription_period_anchoring.sql
--
-- SPRINT: Corrigir origem da data de assinatura Kiwify — RPCs
--
-- PROBLEMA (BUGs #3 e #4 confirmados em análise estática):
--   activate_purchase_for_user (20260615000001):
--     v_period_end := CASE v_billing_cycle
--       WHEN 'annual' THEN now() + interval '12 months'
--       ELSE               now() + interval '1 month'
--     END;
--   → usa now() como âncora. Ignora paid_at da compra.
--   → current_period_start nunca é definido.
--
--   reconcile_pending_activations (20260615000001):
--     Mesmo padrão — current_period_end ancorado em now().
--     current_period_start nunca é definido.
--
-- REGRA OFICIAL:
--   current_period_start = COALESCE(v_purchase.paid_at, now())
--   current_period_end   = current_period_start + ciclo
--   annual  → current_period_start + interval '12 months'
--   monthly → current_period_start + interval '1 month'
--
--   A assinatura começa na data real do pagamento aprovado na
--   Kiwify, não na data de cadastro, ativação ou execução da RPC.
--
-- O QUE ESTA MIGRATION ALTERA:
--   A. Reescreve activate_purchase_for_user (v7):
--      - adiciona v_period_start calculado a partir de paid_at
--      - define current_period_start nas chamadas UPDATE e INSERT
--      - RAISE WARNING quando paid_at IS NULL (anomalia auditável)
--      - mantém intacta a lógica de créditos (wallet/ledger)
--
--   B. Reescreve reconcile_pending_activations (v2):
--      - mesma âncora em paid_at
--      - define current_period_start
--      - RAISE WARNING quando paid_at IS NULL
--      - mantém intacta a lógica de créditos
--
-- O QUE ESTA MIGRATION NÃO ALTERA:
--   - Dados de créditos (balance, ledger, wallet) — somente lógica de período
--   - Assinaturas existentes (não executa UPDATE em subscriptions)
--   - last_credit_grant_at / next_credit_grant_at (baseados em now() intencional)
--   - Nenhuma tabela fora de subscriptions e kiwify_purchases
--
-- SCHEMA REQUERIDO (confirmado por análise estática):
--   subscriptions.current_period_start timestamptz (nullable)
--   subscriptions.current_period_end   timestamptz (nullable)
--   subscriptions.billing_cycle        text (nullable)
--   kiwify_purchases.paid_at           timestamptz (nullable)
-- ============================================================


-- ============================================================
-- PRE_SCHEMA_CHECK — confirma colunas antes de rodar a migration
-- (executar manualmente antes de aplicar se quiser validar)
-- ============================================================
-- SELECT table_name, column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('subscriptions','kiwify_purchases','credits_wallet')
--   AND column_name IN (
--     'current_period_start','current_period_end','billing_cycle','paid_at',
--     'last_credit_grant_at','next_credit_grant_at','last_reset_at'
--   )
-- ORDER BY table_name, column_name;


-- ============================================================
-- A. Reescrever activate_purchase_for_user (v7)
-- Âncora: COALESCE(v_purchase.paid_at, now())
-- ============================================================

CREATE OR REPLACE FUNCTION public.activate_purchase_for_user(p_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase       kiwify_purchases%ROWTYPE;
  v_user_email     text;
  v_user_id        uuid;
  v_tenant_id      uuid;
  v_plan_id        uuid;
  v_plan_credits   int         := 0;
  v_sub_plan_name  text;
  v_rows_updated   int;
  v_plan_lookup    text;
  v_ledger_type    text;
  v_ledger_desc    text;
  v_billing_cycle  text        := 'monthly';
  v_period_start   timestamptz;
  v_period_end     timestamptz;
BEGIN
  v_user_email := lower(trim(auth.jwt() ->> 'email'));
  v_user_id    := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Busca e bloqueia para evitar ativação dupla
  SELECT * INTO v_purchase
  FROM   kiwify_purchases
  WHERE  id                 = p_purchase_id
    AND  lower(trim(email)) = v_user_email
    AND  status             = 'APPROVED'
    AND  activated_at       IS NULL
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_activated');
  END IF;

  IF v_purchase.product_key = 'UNKNOWN'
     OR (v_purchase.plan_code IS NULL AND v_purchase.credits_amount = 0) THEN
    RETURN jsonb_build_object(
      'ok',      false,
      'reason',  'unknown_product',
      'message', 'Produto não reconhecido. Entre em contato com o suporte informando o número do pedido.'
    );
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM users WHERE id = v_user_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tenant_not_found');
  END IF;

  -- billing_cycle: product_key com 'ANNUAL' indica anual
  IF upper(coalesce(v_purchase.product_key, '')) LIKE '%ANNUAL%' THEN
    v_billing_cycle := 'annual';
  END IF;

  -- ── Âncora do período: data real do pagamento Kiwify ─────────────────────────
  -- Regra comercial: assinatura começa quando o pagamento foi aprovado, não quando
  -- o usuário criou conta ou quando esta RPC é executada.
  -- Fallback para now() apenas quando paid_at é NULL (anomalia auditável).
  v_period_start := COALESCE(v_purchase.paid_at, now());

  IF v_purchase.paid_at IS NULL THEN
    RAISE WARNING
      'activate_purchase_for_user: paid_at NULL para purchase_id=%. '
      'ANOMALIA: period_start será now() (%). '
      'A data de início da assinatura pode estar incorreta. '
      'Corrija kiwify_purchases.paid_at manualmente após identificar a data real.',
      p_purchase_id, now();
  END IF;

  -- current_period_end: âncora em v_period_start (não em now())
  v_period_end := CASE v_billing_cycle
    WHEN 'annual' THEN v_period_start + interval '12 months'
    ELSE               v_period_start + interval '1 month'
  END;

  -- ── Assinatura (plan_code preenchido) ──────────────────────────────────────
  IF v_purchase.plan_code IS NOT NULL THEN

    v_plan_lookup := CASE upper(v_purchase.plan_code)
      WHEN 'PREMIUM' THEN 'MASTER'
      ELSE upper(v_purchase.plan_code)
    END;

    SELECT id INTO v_plan_id
    FROM   plans
    WHERE  upper(name) = v_plan_lookup
    LIMIT  1;

    IF v_plan_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok',      false,
        'reason',  'plan_not_found',
        'message', 'Plano "' || v_plan_lookup || '" não encontrado. Contate o suporte.'
      );
    END IF;

    UPDATE subscriptions
    SET    plan_id              = v_plan_id,
           status               = 'ACTIVE',
           current_period_start = v_period_start,
           current_period_end   = v_period_end,
           provider             = 'kiwify',
           billing_cycle        = v_billing_cycle,
           updated_at           = now()
    WHERE  tenant_id = v_tenant_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    IF v_rows_updated = 0 THEN
      INSERT INTO subscriptions (
        tenant_id, plan_id, status,
        current_period_start, current_period_end,
        provider, billing_cycle
      ) VALUES (
        v_tenant_id, v_plan_id, 'ACTIVE',
        v_period_start, v_period_end,
        'kiwify', v_billing_cycle
      );
    END IF;

    UPDATE profiles
    SET    plan = v_plan_lookup
    WHERE  id   = v_user_id;

    v_plan_credits := CASE v_plan_lookup
      WHEN 'MASTER' THEN 700
      WHEN 'PRO'    THEN 500
      ELSE 0
    END;

    v_ledger_type := 'monthly_grant';
    v_ledger_desc := 'Ativação plano ' || v_plan_lookup
                     || ' (' || v_billing_cycle || ') — pedido '
                     || coalesce(v_purchase.provider_order_id, v_purchase.id::text);

  -- ── Créditos avulsos ────────────────────────────────────────────────────────
  ELSIF v_purchase.plan_code IS NULL AND v_purchase.credits_amount > 0 THEN

    SELECT upper(p.name) INTO v_sub_plan_name
    FROM   subscriptions s
    JOIN   plans p ON p.id = s.plan_id
    WHERE  s.tenant_id = v_tenant_id
      AND  s.status    = 'ACTIVE'
    LIMIT  1;

    IF v_sub_plan_name IS NULL
       OR v_sub_plan_name NOT IN ('PRO', 'MASTER', 'PREMIUM') THEN
      RETURN jsonb_build_object(
        'ok',      false,
        'reason',  'credits_require_subscription',
        'message', 'Pacotes avulsos são exclusivos para assinantes PRO ou Master ativos.'
      );
    END IF;

    v_plan_credits := v_purchase.credits_amount;
    v_ledger_type  := 'purchase_extra';
    v_ledger_desc  := 'Pacote avulso ' || v_purchase.credits_amount::text
                      || ' créditos — pedido '
                      || coalesce(v_purchase.provider_order_id, v_purchase.id::text);

  END IF;

  -- Marca compra como ativada
  UPDATE kiwify_purchases
  SET    activated_at = now(),
         tenant_id    = v_tenant_id
  WHERE  id = p_purchase_id;

  -- Atualiza carteira de créditos
  IF v_plan_credits > 0 THEN

    IF v_ledger_type = 'monthly_grant' THEN
      -- PLANO: RESETA saldo e registra data de concessão
      -- Nota: last_credit_grant_at / next_credit_grant_at usam now()
      -- intencionalmente — representam quando créditos foram concedidos,
      -- não quando o pagamento ocorreu (que é v_period_start).
      INSERT INTO credits_wallet (
        tenant_id, balance,
        last_reset_at, last_credit_grant_at, next_credit_grant_at,
        updated_at
      ) VALUES (
        v_tenant_id, v_plan_credits,
        now(), now(), now() + interval '1 month',
        now()
      )
      ON CONFLICT (tenant_id) DO UPDATE
        SET balance               = EXCLUDED.balance,
            last_reset_at         = EXCLUDED.last_reset_at,
            last_credit_grant_at  = EXCLUDED.last_credit_grant_at,
            next_credit_grant_at  = EXCLUDED.next_credit_grant_at,
            updated_at            = EXCLUDED.updated_at;
    ELSE
      -- AVULSO: INCREMENTA sobre o saldo existente
      INSERT INTO credits_wallet (tenant_id, balance, updated_at)
      VALUES (v_tenant_id, v_plan_credits, now())
      ON CONFLICT (tenant_id) DO UPDATE
        SET balance    = credits_wallet.balance + EXCLUDED.balance,
            updated_at = now();
    END IF;

    INSERT INTO credits_ledger (tenant_id, amount, type, description, source)
    VALUES (v_tenant_id, v_plan_credits, v_ledger_type, v_ledger_desc, 'kiwify_activation');

  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'plan',            v_purchase.plan_code,
    'billing_cycle',   v_billing_cycle,
    'period_start',    v_period_start,
    'period_end',      v_period_end,
    'credits_granted', v_plan_credits
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok',      false,
    'reason',  'internal_error',
    'message', 'Erro interno: ' || SQLERRM || ' (SQLSTATE: ' || SQLSTATE || ')'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_purchase_for_user(uuid)
  TO anon, authenticated, service_role;


-- ============================================================
-- B. Reescrever reconcile_pending_activations (v2)
-- Âncora: COALESCE(v_purchase.paid_at, now())
-- ============================================================

CREATE OR REPLACE FUNCTION public.reconcile_pending_activations()
RETURNS TABLE(
  purchase_email    text,
  purchase_plan     text,
  found_tenant_id   uuid,
  result_action     text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase       kiwify_purchases%ROWTYPE;
  v_user_id        uuid;
  v_tenant_id      uuid;
  v_plan_id        uuid;
  v_plan_credits   int;
  v_plan_lookup    text;
  v_billing_cycle  text;
  v_period_start   timestamptz;
  v_period_end     timestamptz;
  v_rows           int;
BEGIN
  FOR v_purchase IN
    SELECT kp.*
    FROM   kiwify_purchases kp
    WHERE  kp.status       = 'APPROVED'
      AND  kp.activated_at IS NULL
      AND  kp.plan_code    IS NOT NULL
    ORDER  BY kp.paid_at ASC NULLS LAST
  LOOP
    SELECT u.id, u.tenant_id
    INTO   v_user_id, v_tenant_id
    FROM   users u
    WHERE  lower(trim(u.email)) = lower(trim(v_purchase.email))
    LIMIT  1;

    IF v_tenant_id IS NULL THEN
      purchase_email  := v_purchase.email;
      purchase_plan   := v_purchase.plan_code;
      found_tenant_id := NULL;
      result_action   := 'no_account_yet';
      RETURN NEXT;
      CONTINUE;
    END IF;

    v_plan_lookup := CASE upper(v_purchase.plan_code)
      WHEN 'PREMIUM' THEN 'MASTER'
      ELSE upper(v_purchase.plan_code)
    END;

    SELECT id INTO v_plan_id
    FROM   plans
    WHERE  upper(name) = v_plan_lookup
    LIMIT  1;

    IF v_plan_id IS NULL THEN
      purchase_email  := v_purchase.email;
      purchase_plan   := v_purchase.plan_code;
      found_tenant_id := v_tenant_id;
      result_action   := 'plan_not_found';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- billing_cycle: 'ANNUAL' no product_key indica anual
    v_billing_cycle := CASE
      WHEN upper(coalesce(v_purchase.product_key, '')) LIKE '%ANNUAL%' THEN 'annual'
      ELSE 'monthly'
    END;

    -- ── Âncora do período: data real do pagamento Kiwify ───────────────────────
    -- Regra comercial: assinatura começa quando o pagamento foi aprovado.
    -- Fallback para now() apenas quando paid_at é NULL (anomalia).
    v_period_start := COALESCE(v_purchase.paid_at, now());

    IF v_purchase.paid_at IS NULL THEN
      RAISE WARNING
        'reconcile_pending_activations: paid_at NULL para purchase_id=% email=%. '
        'ANOMALIA: period_start será now() (%). '
        'Corrija kiwify_purchases.paid_at após identificar a data real.',
        v_purchase.id, v_purchase.email, now();
    END IF;

    -- current_period_end ancorado em v_period_start (não em now())
    v_period_end := CASE v_billing_cycle
      WHEN 'annual' THEN v_period_start + interval '12 months'
      ELSE               v_period_start + interval '1 month'
    END;

    UPDATE subscriptions
    SET    plan_id              = v_plan_id,
           status               = 'ACTIVE',
           current_period_start = v_period_start,
           current_period_end   = v_period_end,
           provider             = 'kiwify',
           billing_cycle        = v_billing_cycle,
           updated_at           = now()
    WHERE  tenant_id = v_tenant_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
      INSERT INTO subscriptions (
        tenant_id, plan_id, status,
        current_period_start, current_period_end,
        provider, billing_cycle
      ) VALUES (
        v_tenant_id, v_plan_id, 'ACTIVE',
        v_period_start, v_period_end,
        'kiwify', v_billing_cycle
      );
    END IF;

    v_plan_credits := CASE v_plan_lookup
      WHEN 'MASTER' THEN 700
      WHEN 'PRO'    THEN 500
      ELSE 0
    END;

    IF v_plan_credits > 0 THEN
      -- Créditos: last_credit_grant_at / next_credit_grant_at usam now()
      -- intencionalmente (quando foram concedidos, não quando o pagamento ocorreu)
      INSERT INTO credits_wallet (
        tenant_id, balance,
        last_reset_at, last_credit_grant_at, next_credit_grant_at,
        updated_at
      ) VALUES (
        v_tenant_id, v_plan_credits,
        now(), now(), now() + interval '1 month',
        now()
      )
      ON CONFLICT (tenant_id) DO UPDATE
        SET balance               = EXCLUDED.balance,
            last_reset_at         = EXCLUDED.last_reset_at,
            last_credit_grant_at  = EXCLUDED.last_credit_grant_at,
            next_credit_grant_at  = EXCLUDED.next_credit_grant_at,
            updated_at            = EXCLUDED.updated_at;

      INSERT INTO credits_ledger (tenant_id, amount, type, description, source)
      VALUES (
        v_tenant_id, v_plan_credits, 'monthly_grant',
        'Reconciliação Kiwify — pedido '
        || coalesce(v_purchase.provider_order_id, v_purchase.id::text)
        || ' (period_start=' || v_period_start::text || ')',
        'reconciliation'
      );
    END IF;

    IF v_user_id IS NOT NULL THEN
      UPDATE profiles SET plan = v_plan_lookup WHERE id = v_user_id;
    END IF;

    UPDATE kiwify_purchases
    SET    activated_at = now(),
           tenant_id    = v_tenant_id
    WHERE  id = v_purchase.id;

    purchase_email  := v_purchase.email;
    purchase_plan   := v_purchase.plan_code;
    found_tenant_id := v_tenant_id;
    result_action   := 'activated';
    RETURN NEXT;

  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_pending_activations()
  TO service_role, authenticated;
