-- ============================================================
-- fix_billing_v6.sql
-- Corrige definitivamente billing: créditos, billing_cycle,
-- limite de alunos e cria get_tenant_billing_summary (RPC).
--
-- Execute INTEIRO no Supabase SQL Editor.
-- Pode ser rodado sobre um banco que já tem fix_billing_v5.sql.
-- ============================================================


-- ============================================================
-- BLOCO A — Adicionar billing_cycle em subscriptions
-- ============================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle text
  CHECK (billing_cycle IN ('monthly', 'annual'));

-- Retrocompatibilidade: preenche billing_cycle a partir do
-- product_key mais recente em kiwify_purchases (ANNUAL → annual, resto → monthly)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (kp.tenant_id)
      kp.tenant_id,
      CASE WHEN upper(kp.product_key) LIKE '%ANNUAL%' THEN 'annual' ELSE 'monthly' END AS cycle
    FROM public.kiwify_purchases kp
    WHERE kp.status = 'APPROVED'
      AND kp.activated_at IS NOT NULL
      AND kp.plan_code IS NOT NULL
    ORDER BY kp.tenant_id, kp.activated_at DESC
  LOOP
    UPDATE public.subscriptions
    SET billing_cycle = r.cycle
    WHERE tenant_id = r.tenant_id
      AND billing_cycle IS NULL;
  END LOOP;
END;
$$;

-- Verificação
SELECT tenant_id, billing_cycle, status FROM public.subscriptions WHERE status = 'ACTIVE' LIMIT 20;


-- ============================================================
-- BLOCO B — Limpar créditos FREE acumulados em wallets de
-- assinantes pagos (resolve o bug 60 + 700 = 760)
-- ============================================================

-- Zera a wallet dos tenants que têm plano PAGO ativo
-- e cujo saldo atual diverge do que o plano garante.
-- ATENÇÃO: não remove compras avulsas — soma purchase_extra do ledger.
DO $$
DECLARE
  r           RECORD;
  v_plan_cred int;
  v_purchased int;
BEGIN
  FOR r IN
    SELECT s.tenant_id, upper(p.name) AS plan_name
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.status IN ('ACTIVE', 'TRIAL', 'COURTESY', 'INTERNAL_TEST')
      AND upper(p.name) IN ('PRO', 'MASTER')
  LOOP
    -- Créditos incluídos no plano
    v_plan_cred := CASE r.plan_name WHEN 'MASTER' THEN 700 WHEN 'PRO' THEN 500 ELSE 0 END;

    -- Créditos avulsos comprados (purchase_extra no ciclo)
    SELECT coalesce(sum(amount), 0) INTO v_purchased
    FROM public.credits_ledger
    WHERE tenant_id = r.tenant_id
      AND type = 'purchase_extra'
      AND amount > 0;

    -- Recalcula saldo correto: plano + avulsos
    UPDATE public.credits_wallet
    SET balance    = v_plan_cred + v_purchased,
        updated_at = now()
    WHERE tenant_id = r.tenant_id
      AND balance   > (v_plan_cred + v_purchased);
    -- (só corrige se estiver acima do esperado — proteção contra rollback acidental)
  END LOOP;
END;
$$;


-- ============================================================
-- BLOCO C — Garantir max_students canônico na tabela plans
-- MASTER deve ter 9999 (código interno "ilimitado")
-- A UI converte 9999 → "Ilimitado".
-- ============================================================

UPDATE public.plans SET max_students = 9999   WHERE upper(name) = 'MASTER' AND max_students <> 9999;
UPDATE public.plans SET max_students = 30     WHERE upper(name) = 'PRO'    AND max_students <> 30;
UPDATE public.plans SET max_students = 5      WHERE upper(name) = 'FREE'   AND max_students <> 5;

-- Verificação
SELECT name, max_students, ai_credits_per_month FROM public.plans ORDER BY price_brl;


-- ============================================================
-- BLOCO D — Recriar activate_purchase_for_user
-- Mudança crítica: ativação de PLANO usa SET balance = novo
-- (não incrementa — evita 60 FREE + 700 MASTER = 760)
-- ============================================================

CREATE OR REPLACE FUNCTION public.activate_purchase_for_user(p_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase      kiwify_purchases%ROWTYPE;
  v_user_email    text;
  v_user_id       uuid;
  v_tenant_id     uuid;
  v_plan_id       uuid;
  v_plan_credits  int := 0;
  v_sub_plan_name text;
  v_rows_updated  int;
  v_plan_lookup   text;
  v_ledger_type   text;
  v_ledger_desc   text;
  v_billing_cycle text := 'monthly';
BEGIN
  v_user_email := lower(trim(auth.jwt() ->> 'email'));
  v_user_id    := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_purchase
  FROM kiwify_purchases
  WHERE id = p_purchase_id
    AND lower(trim(email)) = v_user_email
    AND status = 'APPROVED'
    AND activated_at IS NULL
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_activated');
  END IF;

  IF v_purchase.product_key = 'UNKNOWN'
     OR (v_purchase.plan_code IS NULL AND v_purchase.credits_amount = 0) THEN
    RETURN jsonb_build_object(
      'ok',      false,
      'reason',  'unknown_product',
      'message', 'Produto não reconhecido. Contate o suporte com o número do pedido.'
    );
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM users WHERE id = v_user_id;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tenant_not_found');
  END IF;

  -- ── billing_cycle a partir do product_key ──────────────────────────────────
  IF upper(coalesce(v_purchase.product_key, '')) LIKE '%ANNUAL%' THEN
    v_billing_cycle := 'annual';
  END IF;

  -- ── Assinatura ────────────────────────────────────────────────────────────
  IF v_purchase.plan_code IS NOT NULL THEN

    v_plan_lookup := CASE upper(v_purchase.plan_code)
      WHEN 'PREMIUM' THEN 'MASTER'
      ELSE upper(v_purchase.plan_code)
    END;

    SELECT id INTO v_plan_id
    FROM plans
    WHERE upper(name) = v_plan_lookup
    LIMIT 1;

    IF v_plan_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok',      false,
        'reason',  'plan_not_found',
        'message', 'Plano "' || v_plan_lookup || '" não encontrado. Contate o suporte.'
      );
    END IF;

    UPDATE subscriptions
    SET plan_id            = v_plan_id,
        status             = 'ACTIVE',
        current_period_end = now() + interval '30 days',
        provider           = 'kiwify',
        billing_cycle      = v_billing_cycle,   -- ← novo
        updated_at         = now()
    WHERE tenant_id = v_tenant_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    IF v_rows_updated = 0 THEN
      INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end, provider, billing_cycle)
      VALUES (v_tenant_id, v_plan_id, 'ACTIVE', now() + interval '30 days', 'kiwify', v_billing_cycle);
    END IF;

    v_plan_credits := CASE v_plan_lookup
      WHEN 'MASTER' THEN 700
      WHEN 'PRO'    THEN 500
      ELSE 0
    END;

    v_ledger_type := 'monthly_grant';
    v_ledger_desc := 'Ativação plano ' || v_plan_lookup
                     || ' (' || v_billing_cycle || ') — pedido '
                     || coalesce(v_purchase.provider_order_id, v_purchase.id::text);

  -- ── Créditos avulsos ──────────────────────────────────────────────────────
  ELSIF v_purchase.plan_code IS NULL AND v_purchase.credits_amount > 0 THEN

    SELECT upper(p.name) INTO v_sub_plan_name
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.tenant_id = v_tenant_id
      AND s.status = 'ACTIVE'
    LIMIT 1;

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
                      || ' créditos — pedido ' || coalesce(v_purchase.provider_order_id, v_purchase.id::text);
  END IF;

  -- Marca compra como ativada
  UPDATE kiwify_purchases
  SET activated_at = now(),
      tenant_id    = v_tenant_id
  WHERE id = p_purchase_id;

  -- ── Wallet ────────────────────────────────────────────────────────────────
  IF v_plan_credits > 0 THEN

    IF v_ledger_type = 'monthly_grant' THEN
      -- PLANO: RESETA o saldo (remove créditos FREE acumulados antes)
      INSERT INTO credits_wallet (tenant_id, balance, updated_at)
      VALUES (v_tenant_id, v_plan_credits, now())
      ON CONFLICT (tenant_id) DO UPDATE
        SET balance    = EXCLUDED.balance,        -- ← SET, não +
            updated_at = now();
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

GRANT EXECUTE ON FUNCTION public.activate_purchase_for_user(uuid) TO anon, authenticated, service_role;


-- ============================================================
-- BLOCO E — get_tenant_billing_summary (RPC — fonte única)
-- Retorna tudo que a UI precisa em uma chamada.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_tenant_billing_summary(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub       RECORD;
  v_plan      RECORD;
  v_balance   int := 0;
  v_plan_code text;
  v_cycle     text;
  v_display   text;
BEGIN
  -- Subscription ativa mais recente
  SELECT s.status, s.plan_id, s.current_period_end, coalesce(s.billing_cycle, 'monthly') AS billing_cycle
  INTO v_sub
  FROM subscriptions s
  WHERE s.tenant_id = p_tenant_id
    AND s.status IN ('ACTIVE', 'TRIAL', 'COURTESY', 'INTERNAL_TEST')
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- Plano
  IF v_sub.plan_id IS NOT NULL THEN
    SELECT p.name, p.max_students, p.ai_credits_per_month
    INTO v_plan
    FROM plans p
    WHERE p.id = v_sub.plan_id;
  END IF;

  v_plan_code := upper(coalesce(v_plan.name, 'FREE'));
  v_cycle     := coalesce(v_sub.billing_cycle, 'monthly');

  -- Nome de exibição com ciclo
  v_display := CASE v_plan_code
    WHEN 'MASTER' THEN 'PREMIUM ' || CASE v_cycle WHEN 'annual' THEN 'ANUAL' ELSE 'MENSAL' END
    WHEN 'PRO'    THEN 'PRO '     || CASE v_cycle WHEN 'annual' THEN 'ANUAL' ELSE 'MENSAL' END
    ELSE 'FREE'
  END;

  -- Saldo da carteira
  SELECT coalesce(balance, 0) INTO v_balance
  FROM credits_wallet
  WHERE tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'plan_code',          v_plan_code,
    'plan_name',          v_display,
    'billing_cycle',      v_cycle,
    'credits_balance',    v_balance,
    'max_students',       coalesce(v_plan.max_students, 5),
    'is_unlimited',       (coalesce(v_plan.max_students, 5) >= 9999),
    'current_period_end', v_sub.current_period_end,
    'subscription_status', coalesce(v_sub.status, 'ACTIVE')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_billing_summary(uuid) TO anon, authenticated, service_role;


-- ============================================================
-- BLOCO F — Verificação final
-- ============================================================

-- 1. Planos
SELECT name, max_students, ai_credits_per_month FROM public.plans ORDER BY price_brl;

-- 2. Subscriptions ativas com billing_cycle
SELECT s.tenant_id, p.name AS plan, s.billing_cycle, s.status, s.current_period_end
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id = s.plan_id
WHERE s.status = 'ACTIVE'
ORDER BY s.created_at DESC LIMIT 20;

-- 3. Wallets (saldo deve bater com plano)
SELECT cw.tenant_id, cw.balance, upper(p.name) AS plan_name
FROM public.credits_wallet cw
JOIN public.subscriptions s  ON s.tenant_id = cw.tenant_id AND s.status = 'ACTIVE'
JOIN public.plans p           ON p.id = s.plan_id
ORDER BY cw.updated_at DESC LIMIT 20;

-- 4. Teste do summary (substitua UUID pelo tenant real)
-- SELECT get_tenant_billing_summary('<TENANT_UUID_AQUI>');
