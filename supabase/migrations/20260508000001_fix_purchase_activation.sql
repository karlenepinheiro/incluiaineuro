-- ============================================================
-- 20260508000001_fix_purchase_activation.sql
--
-- Corrige o fluxo de ativação Kiwify para usuários que compram
-- antes de criar conta.
--
-- PROBLEMA RAIZ: activate_purchase_for_user (RPC) usava
--   type='credit' (inválido — viola credits_ledger_type_check) e
--   source='kiwify_activation' (coluna inexistente).
-- Resultado: TODA ativação via frontend falhava silenciosamente.
--
-- O QUE ESTE SCRIPT FAZ (idempotente):
--   A. Adiciona coluna source em credits_ledger
--   B. Expande credits_ledger_type_check para tipos usados pelo sistema
--   C. Corrige entradas existentes com type='credit' (bug anterior)
--   D. Garante índice único em credits_wallet.tenant_id (requerido por upsert)
--   E. Corrige saldos inflados de assinantes pagos (60 FREE + 700 = 760)
--   F. Reescreve activate_purchase_for_user (v6 + update profiles.plan)
--   G. Cria reconcile_pending_activations() para ativação administrativa
-- ============================================================


-- ============================================================
-- A. Adicionar coluna source em credits_ledger
-- ============================================================

ALTER TABLE public.credits_ledger
  ADD COLUMN IF NOT EXISTS source text;


-- ============================================================
-- B. Expandir credits_ledger_type_check
-- ============================================================

ALTER TABLE public.credits_ledger
  DROP CONSTRAINT IF EXISTS credits_ledger_type_check;

ALTER TABLE public.credits_ledger
  ADD CONSTRAINT credits_ledger_type_check CHECK (
    type = ANY (ARRAY[
      'monthly_grant',   -- créditos mensais do plano (signup, renovação, ativação)
      'usage_ai',        -- consumo de IA (debitCredits)
      'manual_grant',    -- concessão manual pelo CEO
      'purchase_extra',  -- pacote avulso comprado
      'refund',          -- estorno
      'courtesy'         -- cortesia CEO
    ])
  );


-- ============================================================
-- C. Corrigir entradas existentes com type inválido
-- ============================================================

UPDATE public.credits_ledger
SET type = 'monthly_grant'
WHERE type NOT IN (
  'monthly_grant', 'usage_ai', 'manual_grant',
  'purchase_extra', 'refund', 'courtesy'
);


-- ============================================================
-- D. Garantir índice único em credits_wallet.tenant_id
-- (necessário para upsert seguro via ON CONFLICT (tenant_id))
-- ============================================================

-- Remove wallets duplicadas — mantém a de maior saldo
DELETE FROM public.credits_wallet
WHERE id NOT IN (
  SELECT DISTINCT ON (tenant_id) id
  FROM public.credits_wallet
  ORDER BY tenant_id, balance DESC, created_at ASC
);

CREATE UNIQUE INDEX IF NOT EXISTS credits_wallet_tenant_id_unique
  ON public.credits_wallet (tenant_id);


-- ============================================================
-- E. Corrigir saldos inflados de assinantes pagos
-- (bug: 60 créditos FREE + 700 MASTER = 760; correto é 700)
-- Preserva créditos avulsos (purchase_extra) já concedidos.
-- ============================================================

DO $$
DECLARE
  r           RECORD;
  v_plan_cred int;
  v_purchased int;
BEGIN
  FOR r IN
    SELECT s.tenant_id, upper(p.name) AS plan_name
    FROM   public.subscriptions s
    JOIN   public.plans p ON p.id = s.plan_id
    WHERE  s.status IN ('ACTIVE', 'TRIAL', 'COURTESY', 'INTERNAL_TEST')
      AND  upper(p.name) IN ('PRO', 'MASTER')
  LOOP
    v_plan_cred := CASE r.plan_name WHEN 'MASTER' THEN 700 WHEN 'PRO' THEN 500 ELSE 0 END;

    -- Créditos avulsos já concedidos (purchase_extra)
    SELECT coalesce(sum(amount), 0) INTO v_purchased
    FROM   public.credits_ledger
    WHERE  tenant_id = r.tenant_id
      AND  type      = 'purchase_extra'
      AND  amount    > 0;

    -- Só corrige se o saldo estiver ACIMA do esperado (não penaliza quem tem menos)
    UPDATE public.credits_wallet
    SET    balance    = v_plan_cred + v_purchased,
           updated_at = now()
    WHERE  tenant_id = r.tenant_id
      AND  balance   > (v_plan_cred + v_purchased);
  END LOOP;
END;
$$;


-- ============================================================
-- F. Reescrever activate_purchase_for_user (versão corrigida)
-- Mudanças em relação à versão anterior:
--   - type correto ('monthly_grant' / 'purchase_extra')
--   - coluna source existente ('kiwify_activation')
--   - assinatura: RESETA saldo (não incrementa)
--   - avulso: INCREMENTA saldo
--   - detecta billing_cycle a partir do product_key
--   - atualiza profiles.plan para evitar plano antigo após reload
--   - early return explícito quando plan não encontrado
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
  v_plan_credits  int    := 0;
  v_sub_plan_name text;
  v_rows_updated  int;
  v_plan_lookup   text;
  v_ledger_type   text;
  v_ledger_desc   text;
  v_billing_cycle text   := 'monthly';
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
    -- Já ativado ou bloqueado por outra sessão — retorna ok para não reprocessar
    RETURN jsonb_build_object('ok', true, 'reason', 'already_activated');
  END IF;

  -- Produto não reconhecido pelo webhook
  IF v_purchase.product_key = 'UNKNOWN'
     OR (v_purchase.plan_code IS NULL AND v_purchase.credits_amount = 0) THEN
    RETURN jsonb_build_object(
      'ok',      false,
      'reason',  'unknown_product',
      'message', 'Produto não reconhecido. Entre em contato com o suporte informando o número do pedido.'
    );
  END IF;

  -- Resolve tenant do usuário autenticado
  SELECT tenant_id INTO v_tenant_id FROM users WHERE id = v_user_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tenant_not_found');
  END IF;

  -- billing_cycle: product_key com 'ANNUAL' indica anual
  IF upper(coalesce(v_purchase.product_key, '')) LIKE '%ANNUAL%' THEN
    v_billing_cycle := 'annual';
  END IF;

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

    -- Atualiza assinatura existente
    UPDATE subscriptions
    SET    plan_id            = v_plan_id,
           status             = 'ACTIVE',
           current_period_end = now() + interval '30 days',
           provider           = 'kiwify',
           billing_cycle      = v_billing_cycle,
           updated_at         = now()
    WHERE  tenant_id = v_tenant_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    -- Cria se não existia (trigger de signup às vezes demora)
    IF v_rows_updated = 0 THEN
      INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end, provider, billing_cycle)
      VALUES (v_tenant_id, v_plan_id, 'ACTIVE', now() + interval '30 days', 'kiwify', v_billing_cycle);
    END IF;

    -- Atualiza profiles.plan para refletir novo plano após reload
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

  -- ── Marca compra como ativada ─────────────────────────────────────────────
  UPDATE kiwify_purchases
  SET    activated_at = now(),
         tenant_id    = v_tenant_id
  WHERE  id = p_purchase_id;

  -- ── Atualiza carteira de créditos ─────────────────────────────────────────
  IF v_plan_credits > 0 THEN

    IF v_ledger_type = 'monthly_grant' THEN
      -- PLANO: RESETA saldo (remove créditos FREE acumulados antes da compra)
      INSERT INTO credits_wallet (tenant_id, balance, updated_at)
      VALUES (v_tenant_id, v_plan_credits, now())
      ON CONFLICT (tenant_id) DO UPDATE
        SET balance    = EXCLUDED.balance,
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

GRANT EXECUTE ON FUNCTION public.activate_purchase_for_user(uuid)
  TO anon, authenticated, service_role;


-- ============================================================
-- G. Função de reconciliação administrativa
-- Ativa compras aprovadas de usuários que já existem no sistema
-- mas cujo plano ainda não foi ativado (ex: compra antes do signup,
-- ou webhook falhou sem tenant_id).
--
-- USO: SELECT * FROM reconcile_pending_activations();
-- Requer: super_admin ou service_role
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
  v_rows           int;
BEGIN
  FOR v_purchase IN
    SELECT kp.*
    FROM   kiwify_purchases kp
    WHERE  kp.status       = 'APPROVED'
      AND  kp.activated_at IS NULL
      AND  kp.plan_code    IS NOT NULL    -- apenas assinaturas
    ORDER  BY kp.paid_at ASC NULLS LAST
  LOOP
    -- Localiza usuário pelo e-mail
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

    -- Normaliza plan_code
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

    -- billing_cycle
    v_billing_cycle := CASE
      WHEN upper(coalesce(v_purchase.product_key, '')) LIKE '%ANNUAL%' THEN 'annual'
      ELSE 'monthly'
    END;

    -- Atualiza assinatura
    UPDATE subscriptions
    SET    plan_id            = v_plan_id,
           status             = 'ACTIVE',
           current_period_end = now() + interval '30 days',
           provider           = 'kiwify',
           billing_cycle      = v_billing_cycle,
           updated_at         = now()
    WHERE  tenant_id = v_tenant_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
      INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end, provider, billing_cycle)
      VALUES (v_tenant_id, v_plan_id, 'ACTIVE', now() + interval '30 days', 'kiwify', v_billing_cycle);
    END IF;

    -- Créditos do plano
    v_plan_credits := CASE v_plan_lookup
      WHEN 'MASTER' THEN 700
      WHEN 'PRO'    THEN 500
      ELSE 0
    END;

    -- Reseta saldo da carteira
    IF v_plan_credits > 0 THEN
      INSERT INTO credits_wallet (tenant_id, balance, updated_at)
      VALUES (v_tenant_id, v_plan_credits, now())
      ON CONFLICT (tenant_id) DO UPDATE
        SET balance    = EXCLUDED.balance,
            updated_at = now();

      INSERT INTO credits_ledger (tenant_id, amount, type, description, source)
      VALUES (
        v_tenant_id, v_plan_credits, 'monthly_grant',
        'Reconciliação Kiwify — pedido ' || coalesce(v_purchase.provider_order_id, v_purchase.id::text),
        'reconciliation'
      );
    END IF;

    -- Atualiza profiles.plan
    IF v_user_id IS NOT NULL THEN
      UPDATE profiles SET plan = v_plan_lookup WHERE id = v_user_id;
    END IF;

    -- Marca como ativada
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
  TO service_role;

-- Apenas super_admin pode chamar reconcile via frontend (se exposto)
GRANT EXECUTE ON FUNCTION public.reconcile_pending_activations()
  TO authenticated;

CREATE POLICY "super_admin_reconcile" ON public.kiwify_purchases
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
