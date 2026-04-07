-- ============================================================
-- schema_payment_v2.sql
-- Corrige fluxo de ativação Kiwify:
--   1. check_purchase_by_email: expõe product_key
--   2. activate_purchase_for_user:
--      - bloqueia produto UNKNOWN
--      - bloqueia créditos avulsos para usuário FREE
--      - move activated_at para DEPOIS de toda validação
--      - usa UPSERT em subscriptions (cria se não existir)
--      - usa UPDATE+INSERT em credits_wallet (compatível com tabela sem UNIQUE)
--
-- Executar após schema_payment_activation.sql
-- ============================================================

-- ── 1. RPC pública corrigida: check_purchase_by_email ──────────────────────
-- Agora expõe product_key para o frontend distinguir UNKNOWN de plano/créditos.
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
      'product_key', v_rec.product_key,
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

GRANT EXECUTE ON FUNCTION check_purchase_by_email(text) TO anon, authenticated;

-- ── 2. RPC autenticada corrigida: activate_purchase_for_user ───────────────
-- Garante:
--   - produto UNKNOWN é rejeitado (activated_at NÃO é preenchido)
--   - créditos avulsos exigem assinatura PRO ou MASTER ativa
--   - activated_at só é gravado DEPOIS de todas as validações e entregas
--   - subscriptions usa UPSERT (cria linha se não existir)
--   - créditos usam UPDATE+INSERT para compatibilidade total
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
  v_sub_plan_name text;
  v_rows_updated  int;
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
    -- Linha já ativada ou inexistente — retorna ok sem erro para o cliente
    RETURN jsonb_build_object('ok', true, 'reason', 'already_activated');
  END IF;

  -- ── BLOQUEAR produto não reconhecido ──────────────────────────────────────
  -- Não preenche activated_at, não vincula tenant_id, não concede nada.
  IF v_purchase.product_key = 'UNKNOWN'
     OR (v_purchase.plan_code IS NULL AND v_purchase.credits_amount = 0) THEN
    RETURN jsonb_build_object(
      'ok',      false,
      'reason',  'unknown_product',
      'message', 'Este produto não foi reconhecido pelo sistema. Entre em contato com o suporte informando o número do pedido.'
    );
  END IF;

  -- Busca tenant do usuário
  SELECT tenant_id INTO v_tenant_id FROM users WHERE id = v_user_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tenant_not_found');
  END IF;

  -- ── Assinatura (plano) ───────────────────────────────────────────────────
  IF v_purchase.plan_code IS NOT NULL AND v_purchase.credits_amount = 0 THEN
    -- Resolve plan_id pelo nome
    SELECT id INTO v_plan_id
    FROM plans
    WHERE name = v_purchase.plan_code
    LIMIT 1;

    -- Atualiza a assinatura existente (o trigger de signup sempre cria uma linha FREE)
    UPDATE subscriptions
    SET plan_id            = v_plan_id,
        status             = 'ACTIVE',
        current_period_end = now() + interval '30 days',
        provider           = 'kiwify',
        updated_at         = now()
    WHERE tenant_id = v_tenant_id;

    -- Guarda: se por alguma razão a linha não existia, cria
    IF NOT FOUND THEN
      INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end, provider)
      VALUES (v_tenant_id, v_plan_id, 'ACTIVE', now() + interval '30 days', 'kiwify');
    END IF;

    -- Créditos do plano
    v_plan_credits := CASE v_purchase.plan_code
      WHEN 'MASTER'  THEN 700
      WHEN 'PREMIUM' THEN 700
      WHEN 'PRO'     THEN 500
      ELSE 0
    END;

  -- ── Créditos avulsos ─────────────────────────────────────────────────────
  ELSIF v_purchase.credits_amount > 0 THEN
    -- Verifica se o tenant possui assinatura ativa PRO ou MASTER
    -- (créditos avulsos são exclusivos para assinantes pagos)
    SELECT p.name INTO v_sub_plan_name
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.tenant_id = v_tenant_id
      AND s.status = 'ACTIVE'
    LIMIT 1;

    IF v_sub_plan_name IS NULL
       OR upper(v_sub_plan_name) NOT IN ('PRO', 'MASTER', 'PREMIUM') THEN
      RETURN jsonb_build_object(
        'ok',      false,
        'reason',  'credits_require_subscription',
        'message', 'Pacotes de créditos avulsos são exclusivos para assinantes ativos do IncluiAI.'
      );
    END IF;

    v_plan_credits := v_purchase.credits_amount;
  END IF;

  -- ── Marca compra como ativada ─────────────────────────────────────────────
  -- Só chega aqui se passou TODAS as validações acima.
  -- activated_at NÃO é preenchido em caso de bloqueio.
  UPDATE kiwify_purchases
  SET activated_at = now(),
      tenant_id    = v_tenant_id
  WHERE id = p_purchase_id;

  -- ── Adiciona créditos à carteira ─────────────────────────────────────────
  IF v_plan_credits > 0 THEN
    -- Tenta atualizar; se não existir, insere
    UPDATE credits_wallet
    SET balance    = balance + v_plan_credits,
        updated_at = now()
    WHERE tenant_id = v_tenant_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN
      INSERT INTO credits_wallet (tenant_id, balance)
      VALUES (v_tenant_id, v_plan_credits);
    END IF;

    INSERT INTO credits_ledger (tenant_id, amount, operation, description)
    VALUES (
      v_tenant_id,
      v_plan_credits,
      'MANUAL_GRANT',
      'Ativação compra Kiwify ' || v_purchase.provider_order_id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'plan',            v_purchase.plan_code,
    'credits_granted', v_plan_credits
  );

EXCEPTION WHEN OTHERS THEN
  -- Expõe a mensagem real para facilitar diagnóstico, mas nunca deixa o erro
  -- propagar como exceção não tratada (evita mensagem genérica no cliente).
  RETURN jsonb_build_object(
    'ok',      false,
    'reason',  'internal_error',
    'message', 'Erro interno na ativação: ' || SQLERRM || ' (SQLSTATE: ' || SQLSTATE || ')'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION activate_purchase_for_user(uuid) TO authenticated;

-- ============================================================
-- Correção de compras UNKNOWN já ativadas incorretamente:
-- Se houver registros com activated_at preenchido mas product_key = 'UNKNOWN',
-- execute o bloco abaixo para diagnosticar e corrigir manualmente:
--
-- SELECT id, email, product_key, plan_code, credits_amount, activated_at, tenant_id
-- FROM kiwify_purchases
-- WHERE product_key = 'UNKNOWN' AND activated_at IS NOT NULL;
--
-- Para reverter uma ativação incorreta (substitua o id real):
-- UPDATE kiwify_purchases
-- SET activated_at = NULL, tenant_id = NULL
-- WHERE id = '<uuid-da-compra>'
--   AND product_key = 'UNKNOWN';
-- ============================================================
