-- ============================================================
-- schema_payment_activation.sql
-- Fluxo de pós-pagamento Kiwify
--
-- Executar APÓS schema.sql / schema_v3.sql
-- ============================================================

-- ── 1. Tabela de compras Kiwify (fonte de verdade por e-mail) ────────────────
CREATE TABLE IF NOT EXISTS kiwify_purchases (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text        NOT NULL,
  product_key       text        NOT NULL,         -- ex: 'PRO_MONTHLY', 'CREDITS_200'
  plan_code         text,                         -- 'PRO' | 'MASTER' | null (créditos)
  credits_amount    int         NOT NULL DEFAULT 0,
  provider_order_id text        UNIQUE NOT NULL,  -- order_id da Kiwify
  status            text        NOT NULL DEFAULT 'PENDING',
    -- PENDING | APPROVED | CANCELED | REFUNDED
  payload           jsonb,                        -- payload bruto do webhook
  paid_at           timestamptz,
  activated_at      timestamptz,                  -- preenchido na ativação
  tenant_id         uuid,                         -- vinculado na ativação
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kiwify_purchases_email_idx
  ON kiwify_purchases (lower(email), status);

ALTER TABLE kiwify_purchases ENABLE ROW LEVEL SECURITY;

-- Usuário autenticado vê apenas suas próprias compras
CREATE POLICY "auth_read_own_purchase" ON kiwify_purchases
  FOR SELECT TO authenticated
  USING (lower(email) = lower(auth.jwt() ->> 'email'));

-- ── 2. RPC pública: verificar compra por e-mail ───────────────────────────────
-- Pode ser chamada sem autenticação (para exibir status antes do cadastro).
-- Retorna apenas: found, status, plan_code, purchase_id — sem dados sensíveis.
CREATE OR REPLACE FUNCTION check_purchase_by_email(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec kiwify_purchases%ROWTYPE;
BEGIN
  -- 1. Compra aprovada e ainda não ativada
  SELECT * INTO v_rec
  FROM kiwify_purchases
  WHERE lower(trim(email)) = lower(trim(p_email))
    AND status = 'APPROVED'
    AND activated_at IS NULL
  ORDER BY paid_at DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'found',       true,
      'status',      'APPROVED',
      'plan_code',   v_rec.plan_code,
      'credits',     v_rec.credits_amount,
      'purchase_id', v_rec.id
    );
  END IF;

  -- 2. Compra pendente
  SELECT * INTO v_rec
  FROM kiwify_purchases
  WHERE lower(trim(email)) = lower(trim(p_email))
    AND status = 'PENDING'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'found',  true,
      'status', 'PENDING'
    );
  END IF;

  -- 3. Nenhuma compra encontrada
  RETURN jsonb_build_object('found', false);
END;
$$;

-- Permite chamada anônima (necessário para verificar antes de criar conta)
GRANT EXECUTE ON FUNCTION check_purchase_by_email(text) TO anon, authenticated;

-- ── 3. RPC autenticada: ativar compra para o usuário logado ──────────────────
-- Exige autenticação. Verifica que o e-mail do JWT bate com o da compra.
-- Atualiza subscriptions + credits_wallet + credits_ledger.
CREATE OR REPLACE FUNCTION activate_purchase_for_user(p_purchase_id uuid)
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
BEGIN
  v_user_email := lower(trim(auth.jwt() ->> 'email'));
  v_user_id    := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Busca e bloqueia a linha para evitar ativação dupla
  SELECT * INTO v_purchase
  FROM kiwify_purchases
  WHERE id = p_purchase_id
    AND lower(trim(email)) = v_user_email
    AND status = 'APPROVED'
    AND activated_at IS NULL
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    -- Pode já ter sido ativado — retorna ok sem erro para o cliente
    RETURN jsonb_build_object('ok', true, 'reason', 'already_activated');
  END IF;

  -- Busca tenant do usuário
  SELECT tenant_id INTO v_tenant_id FROM users WHERE id = v_user_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tenant_not_found');
  END IF;

  -- Marca compra como ativada
  UPDATE kiwify_purchases
  SET activated_at = now(),
      tenant_id    = v_tenant_id
  WHERE id = p_purchase_id;

  -- ── Assinatura (plano) ───────────────────────────────────────────────────
  IF v_purchase.plan_code IS NOT NULL AND v_purchase.credits_amount = 0 THEN
    -- Resolve plan_id pelo nome
    SELECT id INTO v_plan_id
    FROM plans
    WHERE name = v_purchase.plan_code
    LIMIT 1;

    -- Atualiza a assinatura existente do tenant
    UPDATE subscriptions
    SET plan_id            = COALESCE(v_plan_id, plan_id),
        status             = 'ACTIVE',
        current_period_end = now() + interval '30 days',
        provider           = 'kiwify',
        updated_at         = now()
    WHERE tenant_id = v_tenant_id;

    v_plan_credits := CASE v_purchase.plan_code
      WHEN 'MASTER'  THEN 700
      WHEN 'PREMIUM' THEN 700
      WHEN 'PRO'     THEN 500
      ELSE 0
    END;

  -- ── Créditos avulsos ─────────────────────────────────────────────────────
  ELSIF v_purchase.credits_amount > 0 THEN
    v_plan_credits := v_purchase.credits_amount;
  END IF;

  -- ── Adiciona créditos à carteira ─────────────────────────────────────────
  IF v_plan_credits > 0 THEN
    UPDATE credits_wallet
    SET balance    = balance + v_plan_credits,
        updated_at = now()
    WHERE tenant_id = v_tenant_id;

    INSERT INTO credits_ledger (tenant_id, amount, operation, description)
    VALUES (
      v_tenant_id,
      v_plan_credits,
      'MANUAL_GRANT',
      'Ativação compra Kiwify ' || v_purchase.provider_order_id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',             true,
    'plan',           v_purchase.plan_code,
    'credits_granted', v_plan_credits
  );
END;
$$;

GRANT EXECUTE ON FUNCTION activate_purchase_for_user(uuid) TO authenticated;

-- ============================================================
-- SIMULAÇÃO DE PAGAMENTO PARA TESTE (sem pagar de verdade)
-- Execute no Supabase SQL Editor substituindo o e-mail:
-- ============================================================
--
-- INSERT INTO kiwify_purchases (
--   email, product_key, plan_code, credits_amount,
--   provider_order_id, status, paid_at
-- ) VALUES (
--   'seu@email.com',           -- e-mail do comprador
--   'PRO_MONTHLY',             -- chave do produto
--   'PRO',                     -- plano ('PRO' ou 'MASTER')
--   0,                         -- 0 para assinatura; >0 para créditos avulsos
--   'TEST-' || gen_random_uuid()::text,
--   'APPROVED',
--   now()
-- );
--
-- Para verificar depois:
-- SELECT * FROM kiwify_purchases WHERE email = 'seu@email.com';
--
-- Para cancelar/desfazer o teste:
-- DELETE FROM kiwify_purchases WHERE provider_order_id LIKE 'TEST-%';
-- ============================================================