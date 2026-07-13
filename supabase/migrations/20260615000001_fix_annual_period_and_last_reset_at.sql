-- ============================================================
-- 20260615000001_fix_annual_period_and_last_reset_at.sql
--
-- SPRINT P1 — Correção crítica do modelo de negócio anual/mensal.
--
-- PROBLEMAS CORRIGIDOS:
--   1. activate_purchase_for_user usava `now() + interval '30 days'` para TODOS os ciclos.
--      Assinatura anual ficava com current_period_end = now() + 30 dias (errado).
--      Correto: 'monthly' → now() + interval '1 month'
--               'annual'  → now() + interval '12 months'
--
--   2. reconcile_pending_activations tinha o mesmo bug.
--
--   3. Nenhum dos fluxos atualizava credits_wallet.last_reset_at ao conceder
--      créditos mensais do plano. Agora atualiza last_reset_at,
--      last_credit_grant_at e next_credit_grant_at em todos os pontos.
--
-- IMPORTANTE: Esta migration NÃO altera saldos existentes,
--             NÃO destrói dados e NÃO altera RLS.
-- ============================================================


-- ============================================================
-- A. Garantir colunas de renovação na credits_wallet
--    (idempotente — já adicionadas pela 20260519000001 em produção,
--     mas garante para ambientes que não rodaram essa migration)
-- ============================================================

ALTER TABLE public.credits_wallet
  ADD COLUMN IF NOT EXISTS last_credit_grant_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_credit_grant_at  TIMESTAMPTZ;


-- ============================================================
-- B. Reescrever activate_purchase_for_user
--    Mudanças em relação à versão anterior (20260508000001):
--      - current_period_end usa CASE por v_billing_cycle (não 30 dias fixo)
--      - credits_wallet.last_reset_at atualizado para monthly_grant
--      - credits_wallet.last_credit_grant_at atualizado para monthly_grant
--      - credits_wallet.next_credit_grant_at = now() + 1 mês para monthly_grant
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
  v_plan_credits   int    := 0;
  v_sub_plan_name  text;
  v_rows_updated   int;
  v_plan_lookup    text;
  v_ledger_type    text;
  v_ledger_desc    text;
  v_billing_cycle  text   := 'monthly';
  v_period_end     timestamptz;
BEGIN
  v_user_email := lower(trim(auth.jwt() ->> 'email'));
  v_user_id    := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Busca e bloqueia para evitar ativação dupla (FOR UPDATE SKIP LOCKED = idempotente)
  SELECT * INTO v_purchase
  FROM   kiwify_purchases
  WHERE  id              = p_purchase_id
    AND  lower(trim(email)) = v_user_email
    AND  status           = 'APPROVED'
    AND  activated_at     IS NULL
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

  -- Calcula current_period_end baseado no ciclo real:
  -- mensal → now() + 1 mês; anual → now() + 12 meses
  v_period_end := CASE v_billing_cycle
    WHEN 'annual' THEN now() + interval '12 months'
    ELSE               now() + interval '1 month'
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
    SET    plan_id            = v_plan_id,
           status             = 'ACTIVE',
           current_period_end = v_period_end,
           provider           = 'kiwify',
           billing_cycle      = v_billing_cycle,
           updated_at         = now()
    WHERE  tenant_id = v_tenant_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    IF v_rows_updated = 0 THEN
      INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end, provider, billing_cycle)
      VALUES (v_tenant_id, v_plan_id, 'ACTIVE', v_period_end, 'kiwify', v_billing_cycle);
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

  -- ── Créditos avulsos (plan_code = NULL, credits_amount > 0) ────────────────
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
      INSERT INTO credits_wallet (tenant_id, balance, last_reset_at, last_credit_grant_at, next_credit_grant_at, updated_at)
      VALUES (v_tenant_id, v_plan_credits, now(), now(), now() + interval '1 month', now())
      ON CONFLICT (tenant_id) DO UPDATE
        SET balance               = EXCLUDED.balance,
            last_reset_at         = EXCLUDED.last_reset_at,
            last_credit_grant_at  = EXCLUDED.last_credit_grant_at,
            next_credit_grant_at  = EXCLUDED.next_credit_grant_at,
            updated_at            = EXCLUDED.updated_at;
    ELSE
      -- AVULSO: INCREMENTA sobre o saldo existente (não toca last_reset_at)
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
-- C. Reescrever reconcile_pending_activations
--    Mudanças:
--      - current_period_end usa CASE por v_billing_cycle
--      - credits_wallet.last_reset_at atualizado
--      - credits_wallet.last_credit_grant_at / next_credit_grant_at atualizados
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

    -- Calcula period_end correto por ciclo real
    v_period_end := CASE v_billing_cycle
      WHEN 'annual' THEN now() + interval '12 months'
      ELSE               now() + interval '1 month'
    END;

    UPDATE subscriptions
    SET    plan_id            = v_plan_id,
           status             = 'ACTIVE',
           current_period_end = v_period_end,
           provider           = 'kiwify',
           billing_cycle      = v_billing_cycle,
           updated_at         = now()
    WHERE  tenant_id = v_tenant_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
      INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end, provider, billing_cycle)
      VALUES (v_tenant_id, v_plan_id, 'ACTIVE', v_period_end, 'kiwify', v_billing_cycle);
    END IF;

    v_plan_credits := CASE v_plan_lookup
      WHEN 'MASTER' THEN 700
      WHEN 'PRO'    THEN 500
      ELSE 0
    END;

    IF v_plan_credits > 0 THEN
      INSERT INTO credits_wallet (tenant_id, balance, last_reset_at, last_credit_grant_at, next_credit_grant_at, updated_at)
      VALUES (v_tenant_id, v_plan_credits, now(), now(), now() + interval '1 month', now())
      ON CONFLICT (tenant_id) DO UPDATE
        SET balance               = EXCLUDED.balance,
            last_reset_at         = EXCLUDED.last_reset_at,
            last_credit_grant_at  = EXCLUDED.last_credit_grant_at,
            next_credit_grant_at  = EXCLUDED.next_credit_grant_at,
            updated_at            = EXCLUDED.updated_at;

      INSERT INTO credits_ledger (tenant_id, amount, type, description, source)
      VALUES (
        v_tenant_id, v_plan_credits, 'monthly_grant',
        'Reconciliação Kiwify — pedido ' || coalesce(v_purchase.provider_order_id, v_purchase.id::text),
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
