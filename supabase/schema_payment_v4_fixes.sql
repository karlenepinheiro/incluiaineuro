-- ============================================================
-- schema_payment_v4_fixes.sql
-- Correções de dados e RPC para o fluxo Kiwify
--
-- BLOCO 1 — Diagnóstico de kiwify_products (dados errados)
-- BLOCO 2 — Diagnóstico de kiwify_purchases classificadas errado
-- BLOCO 3 — Correção dos registros de kiwify_purchases errados
-- BLOCO 4 — Correção das subscriptions afetadas
-- BLOCO 5 — Atualização da RPC activate_purchase_for_user
--            (garante INSERT se subscription não existir + plano MASTER pelo code)
-- BLOCO 6 — Garantir que plans.name = 'MASTER' existe
--            (sem isso, WHERE name = 'MASTER' retorna vazio e plan_id fica NULL)
-- ============================================================


-- ============================================================
-- BLOCO 1 — Auditar kiwify_products: detectar plan_code errado
-- Execute primeiro. Resultado esperado: linhas onde produto tem
-- nome indicando MASTER/PREMIUM mas plan_code = 'PRO'.
-- ============================================================

SELECT
  kiwify_product_id,
  product_name,
  plan_code,
  product_type,
  credits_amount
FROM kiwify_products
WHERE product_type = 'subscription'
ORDER BY plan_code, product_name;

-- Se aparecer linha com product_name contendo 'master' ou 'premium' e plan_code = 'PRO',
-- corrija com o bloco abaixo (substitua o kiwify_product_id real):
--
-- UPDATE kiwify_products
-- SET plan_code = 'MASTER'
-- WHERE kiwify_product_id IN ('<id-do-produto-premium-kiwify>')
--   AND plan_code = 'PRO';


-- ============================================================
-- BLOCO 2 — Auditar kiwify_purchases classificadas errado
-- Mostra compras com plan_code = 'PRO' e product_key = 'PRO_MONTHLY'
-- que provavelmente deveriam ser MASTER.
-- ============================================================

SELECT
  id,
  email,
  product_key,
  plan_code,
  status,
  activated_at,
  tenant_id,
  paid_at,
  (payload -> 'order' -> 'product' ->> 'name') AS product_name_kiwify
FROM kiwify_purchases
WHERE plan_code = 'PRO'
  AND status    = 'APPROVED'
ORDER BY paid_at DESC;

-- Verifique a coluna product_name_kiwify — se contém "premium" ou "master",
-- essa linha está classificada errado. Corrija com BLOCO 3.


-- ============================================================
-- BLOCO 3 — Corrigir kiwify_purchases classificadas como PRO
--           mas que deveriam ser MASTER
--
-- Substitua os IDs reais antes de executar.
-- Para identificar os IDs, use a query do BLOCO 2.
-- ============================================================

-- Opção A: corrigir por ID específico (mais seguro)
-- UPDATE kiwify_purchases
-- SET
--   plan_code   = 'MASTER',
--   product_key = 'MASTER_MONTHLY'
-- WHERE id IN (
--   '<uuid-da-compra-1>',
--   '<uuid-da-compra-2>'
-- )
--   AND plan_code = 'PRO';

-- Opção B: corrigir automaticamente pelo nome do produto no payload
-- (use apenas se tiver certeza que o payload sempre tem o campo)
-- UPDATE kiwify_purchases
-- SET
--   plan_code   = 'MASTER',
--   product_key = 'MASTER_MONTHLY'
-- WHERE plan_code = 'PRO'
--   AND status    = 'APPROVED'
--   AND (
--     lower(payload -> 'order' -> 'product' ->> 'name') LIKE '%master%'
--     OR
--     lower(payload -> 'order' -> 'product' ->> 'name') LIKE '%premium%'
--   );


-- ============================================================
-- BLOCO 4 — Corrigir subscriptions de usuários afetados
-- Para cada tenant_id das compras corrigidas no BLOCO 3,
-- atualizar a assinatura para o plan_id do MASTER.
-- ============================================================

-- Passo 4a: descobrir o plan_id do MASTER no seu banco
SELECT id, name FROM plans WHERE name = 'MASTER' LIMIT 1;

-- Passo 4b: atualizar a assinatura dos tenants afetados
-- Substitua <plan_id_master> pelo UUID retornado em 4a.
-- Substitua os tenant_ids pelos da query do BLOCO 2.
--
-- UPDATE subscriptions
-- SET
--   plan_id = '<plan_id_master>',
--   status  = 'ACTIVE'
-- WHERE tenant_id IN (
--   '<tenant-uuid-1>',
--   '<tenant-uuid-2>'
-- )
--   AND status = 'ACTIVE';

-- Passo 4c: verificar resultado
-- SELECT s.tenant_id, p.name AS plan_name, s.status
-- FROM subscriptions s
-- LEFT JOIN plans p ON p.id = s.plan_id
-- WHERE s.tenant_id IN ('<tenant-uuid-1>', '<tenant-uuid-2>');


-- ============================================================
-- BLOCO 5 — Atualizar RPC activate_purchase_for_user
-- Garante:
--   - Busca plan_id por code (coluna robusta) com fallback por name
--   - INSERT em subscriptions se UPDATE não encontrar linha
--   - activated_at só é gravado após toda validação passar
-- ============================================================

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
  v_plan_lookup   text; -- plan_code normalizado para lookup em plans
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
    RETURN jsonb_build_object('ok', true, 'reason', 'already_activated');
  END IF;

  -- Bloqueia produto não reconhecido
  IF v_purchase.product_key = 'UNKNOWN'
     OR (v_purchase.plan_code IS NULL AND v_purchase.credits_amount = 0) THEN
    RETURN jsonb_build_object(
      'ok',      false,
      'reason',  'unknown_product',
      'message', 'Produto não reconhecido. Entre em contato com o suporte informando o número do pedido.'
    );
  END IF;

  -- Busca tenant do usuário
  SELECT tenant_id INTO v_tenant_id FROM users WHERE id = v_user_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tenant_not_found');
  END IF;

  -- ── Assinatura (plano) ───────────────────────────────────────────────────
  -- REGRA: plan_code preenchido = assinatura, independente de credits_amount.
  -- Planos PRO/MASTER têm credits_amount = 500/700 (créditos mensais do plano),
  -- mas NÃO são créditos avulsos. A autoridade é plan_code, não credits_amount.
  IF v_purchase.plan_code IS NOT NULL THEN

    -- Normaliza: 'PREMIUM' é alias de 'MASTER'
    v_plan_lookup := CASE upper(v_purchase.plan_code)
      WHEN 'PREMIUM' THEN 'MASTER'
      ELSE upper(v_purchase.plan_code)
    END;

    -- Busca plan_id pelo campo name (fonte única de verdade no schema base)
    -- name tem valores 'PRO', 'MASTER', 'FREE' (schema_launch_v1)
    SELECT id INTO v_plan_id
    FROM plans
    WHERE upper(name) = v_plan_lookup
    LIMIT 1;

    -- Atualiza assinatura existente
    UPDATE subscriptions
    SET plan_id            = v_plan_id,
        status             = 'ACTIVE',
        current_period_end = now() + interval '30 days',
        provider           = 'kiwify',
        updated_at         = now()
    WHERE tenant_id = v_tenant_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    -- Cria se não existia (trigger de signup às vezes demora)
    IF v_rows_updated = 0 THEN
      INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end, provider)
      VALUES (v_tenant_id, v_plan_id, 'ACTIVE', now() + interval '30 days', 'kiwify');
    END IF;

    -- Créditos do plano
    v_plan_credits := CASE v_plan_lookup
      WHEN 'MASTER'  THEN 700
      WHEN 'PRO'     THEN 500
      ELSE 0
    END;

  -- ── Créditos avulsos ─────────────────────────────────────────────────────
  -- Só entra aqui quando plan_code IS NULL (produto sem plano = pacote avulso)
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
        'message', 'Pacotes de créditos avulsos são exclusivos para assinantes ativos do IncluiAI.'
      );
    END IF;

    v_plan_credits := v_purchase.credits_amount;
  END IF;

  -- ── Marca compra como ativada ─────────────────────────────────────────────
  -- Só chega aqui se passou TODAS as validações.
  UPDATE kiwify_purchases
  SET activated_at = now(),
      tenant_id    = v_tenant_id
  WHERE id = p_purchase_id;

  -- ── Adiciona créditos à carteira ─────────────────────────────────────────
  IF v_plan_credits > 0 THEN
    UPDATE credits_wallet
    SET balance    = balance + v_plan_credits,
        updated_at = now()
    WHERE tenant_id = v_tenant_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN
      INSERT INTO credits_wallet (tenant_id, balance)
      VALUES (v_tenant_id, v_plan_credits);
    END IF;

    INSERT INTO credits_ledger (tenant_id, amount, type, description, source)
    VALUES (
      v_tenant_id,
      v_plan_credits,
      'credit',
      'Ativação compra Kiwify ' || v_purchase.provider_order_id,
      'kiwify_activation'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'plan',            v_purchase.plan_code,
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

GRANT EXECUTE ON FUNCTION activate_purchase_for_user(uuid) TO authenticated;


-- ============================================================
-- BLOCO 6 — Garantir que plans tem name = 'MASTER' e name = 'PRO'
-- O webhook e a RPC fazem WHERE name = planCode.
-- Se a tabela usa name = 'Profissional' em vez de 'PRO', o plan_id
-- fica NULL e a subscription fica sem plano (lido como FREE no frontend).
-- ============================================================

-- Inspecionar nomes atuais:
SELECT id, name, ai_credits_per_month, max_students, price_brl
FROM plans
ORDER BY price_brl NULLS FIRST;

-- Se name não for 'PRO' / 'MASTER' (ex: 'Profissional', 'Master (Clínicas/Escolas)'),
-- o webhook e a RPC não conseguirão resolver o plan_id. Corrija:
--
-- UPDATE plans SET name = 'PRO'    WHERE name ILIKE '%pro%'    AND name != 'PRO';
-- UPDATE plans SET name = 'MASTER' WHERE name ILIKE '%master%' AND name != 'MASTER';
-- UPDATE plans SET name = 'FREE'   WHERE name ILIKE '%free%'   AND name != 'FREE';


-- ============================================================
-- BLOCO 7 — Verificação final após todas as correções
-- ============================================================

-- Compras pendentes de ativação (não devem incluir compras já ativadas pelo webhook)
SELECT id, email, plan_code, product_key, status, activated_at, tenant_id, paid_at
FROM kiwify_purchases
WHERE status = 'APPROVED'
ORDER BY paid_at DESC;

-- Subscriptions ativas e seus planos
SELECT s.tenant_id, p.name AS plan_name, s.status, s.current_period_end
FROM subscriptions s
LEFT JOIN plans p ON p.id = s.plan_id
WHERE s.status = 'ACTIVE'
ORDER BY s.created_at DESC
LIMIT 20;
