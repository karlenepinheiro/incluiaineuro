-- ============================================================
-- fix_billing_v5.sql
-- Correção completa do fluxo de assinatura e créditos
--
-- EXECUTE ESTE ARQUIVO INTEIRO NO SUPABASE SQL EDITOR
-- Ordem importa — não pule blocos.
-- ============================================================


-- ============================================================
-- BLOCO 1 — Normalizar plans.name para os códigos canônicos
-- O webhook e a RPC fazem WHERE upper(name) = 'PRO' / 'MASTER' / 'FREE'.
-- Se a tabela contiver 'Profissional' ou 'Master (Clínicas/Escolas)', plan_id
-- fica NULL e a subscription é lida como FREE no frontend.
-- ============================================================

UPDATE public.plans
SET name = 'FREE'
WHERE upper(name) LIKE '%FREE%'
   OR upper(name) LIKE '%GRATIS%'
   OR upper(name) LIKE '%STARTER%'
   AND name <> 'FREE';

UPDATE public.plans
SET name = 'PRO'
WHERE upper(name) LIKE '%PRO%'
  AND upper(name) NOT LIKE '%MASTER%'
  AND upper(name) NOT LIKE '%PREMIUM%'
  AND name <> 'PRO';

UPDATE public.plans
SET name = 'MASTER'
WHERE (upper(name) LIKE '%MASTER%' OR upper(name) LIKE '%PREMIUM%')
  AND name <> 'MASTER';

-- Garante que todos os três planos existem (INSERT só se não existir)
INSERT INTO public.plans (name, max_students, ai_credits_per_month, price_brl, is_active)
SELECT 'FREE', 5, 60, 0, true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE upper(name) = 'FREE');

INSERT INTO public.plans (name, max_students, ai_credits_per_month, price_brl, is_active)
SELECT 'PRO', 30, 500, 79, true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE upper(name) = 'PRO');

INSERT INTO public.plans (name, max_students, ai_credits_per_month, price_brl, is_active)
SELECT 'MASTER', 9999, 700, 149, true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE upper(name) = 'MASTER');

-- Verificação
SELECT id, name, max_students, ai_credits_per_month, price_brl FROM public.plans ORDER BY price_brl;


-- ============================================================
-- BLOCO 2 — Corrigir subscriptions.status
-- Constraint atual: ('ACTIVE','TRIALING','PAST_DUE','CANCELLED')
-- Código usa:       ('ACTIVE','TRIAL','OVERDUE','CANCELED','PENDING','COURTESY','INTERNAL_TEST')
-- Estratégia: migrar dados existentes + ampliar constraint
-- ============================================================

-- 2a. Drop constraint antiga
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

-- 2b. Migrar valores legados para os canônicos do sistema
UPDATE public.subscriptions SET status = 'TRIAL'    WHERE status = 'TRIALING';
UPDATE public.subscriptions SET status = 'OVERDUE'  WHERE status = 'PAST_DUE';
UPDATE public.subscriptions SET status = 'CANCELED' WHERE status = 'CANCELLED';

-- 2c. Nova constraint alinhada com o código
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check CHECK (
    status = ANY (ARRAY[
      'ACTIVE',
      'TRIAL',
      'OVERDUE',
      'CANCELED',
      'PENDING',
      'COURTESY',
      'INTERNAL_TEST'
    ])
  );

-- Verificação
SELECT status, count(*) FROM public.subscriptions GROUP BY status;


-- ============================================================
-- BLOCO 3 — Corrigir credits_ledger
-- Problemas: constraint tem tipos insuficientes + coluna 'source' não existe
-- ============================================================

-- 3a. Drop constraint antiga
ALTER TABLE public.credits_ledger
  DROP CONSTRAINT IF EXISTS credits_ledger_type_check;

-- 3b. Adicionar coluna 'source' (usada pelo webhook e pela RPC)
ALTER TABLE public.credits_ledger
  ADD COLUMN IF NOT EXISTS source text;

-- 3c. Nova constraint com todos os tipos legítimos do sistema
ALTER TABLE public.credits_ledger
  ADD CONSTRAINT credits_ledger_type_check CHECK (
    type = ANY (ARRAY[
      'monthly_grant',   -- créditos mensais do plano (signup, renovação)
      'usage_ai',        -- consumo de IA (debitCredits)
      'manual_grant',    -- concessão manual pelo CEO
      'purchase_extra',  -- pacote avulso comprado
      'refund',          -- estorno
      'courtesy'         -- cortesia CEO
    ])
  );

-- 3d. Corrigir entradas existentes com tipo inválido
-- (registros criados com type='credit' pelo bug anterior)
UPDATE public.credits_ledger
SET type = 'monthly_grant'
WHERE type NOT IN ('monthly_grant','usage_ai','manual_grant','purchase_extra','refund','courtesy');

-- Verificação
SELECT type, count(*) FROM public.credits_ledger GROUP BY type;


-- ============================================================
-- BLOCO 4 — Adicionar UNIQUE constraint em credits_wallet.tenant_id
-- Necessário para garantir exatamente 1 wallet por tenant
-- e habilitar upsert seguro.
-- ============================================================

-- Remove linhas duplicadas (mantém a de maior balance) antes de criar o índice
DELETE FROM public.credits_wallet
WHERE id NOT IN (
  SELECT DISTINCT ON (tenant_id) id
  FROM public.credits_wallet
  ORDER BY tenant_id, balance DESC, created_at ASC
);

CREATE UNIQUE INDEX IF NOT EXISTS credits_wallet_tenant_id_unique
  ON public.credits_wallet (tenant_id);


-- ============================================================
-- BLOCO 5 — Recriar activate_purchase_for_user (RPC corrigida)
-- Correções aplicadas:
--   - credits_ledger: type correto + coluna source existente
--   - plan_id NULL → early return com mensagem clara (em vez de subscription sem plano)
--   - wallet: upsert via INSERT ON CONFLICT (requer índice único do Bloco 4)
--   - créditos avulsos: verifica 'PREMIUM' alias além de 'PRO'/'MASTER'
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
BEGIN
  v_user_email := lower(trim(auth.jwt() ->> 'email'));
  v_user_id    := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Busca e bloqueia para evitar ativação dupla
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

  -- Produto não reconhecido
  IF v_purchase.product_key = 'UNKNOWN'
     OR (v_purchase.plan_code IS NULL AND v_purchase.credits_amount = 0) THEN
    RETURN jsonb_build_object(
      'ok',      false,
      'reason',  'unknown_product',
      'message', 'Produto não reconhecido. Entre em contato com o suporte informando o número do pedido.'
    );
  END IF;

  -- Resolve tenant
  SELECT tenant_id INTO v_tenant_id FROM users WHERE id = v_user_id;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tenant_not_found');
  END IF;

  -- ── Assinatura ───────────────────────────────────────────────────────────────
  IF v_purchase.plan_code IS NOT NULL THEN

    v_plan_lookup := CASE upper(v_purchase.plan_code)
      WHEN 'PREMIUM' THEN 'MASTER'
      ELSE upper(v_purchase.plan_code)
    END;

    SELECT id INTO v_plan_id
    FROM plans
    WHERE upper(name) = v_plan_lookup
    LIMIT 1;

    -- Falha explícita: plano não encontrado no banco → não aplica NULL silenciosamente
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
        updated_at         = now()
    WHERE tenant_id = v_tenant_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    IF v_rows_updated = 0 THEN
      INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end, provider)
      VALUES (v_tenant_id, v_plan_id, 'ACTIVE', now() + interval '30 days', 'kiwify');
    END IF;

    v_plan_credits := CASE v_plan_lookup
      WHEN 'MASTER' THEN 700
      WHEN 'PRO'    THEN 500
      ELSE 0
    END;

    v_ledger_type := 'monthly_grant';
    v_ledger_desc := 'Ativação plano ' || v_plan_lookup
                     || ' — pedido ' || coalesce(v_purchase.provider_order_id, v_purchase.id::text);

  -- ── Créditos avulsos ─────────────────────────────────────────────────────────
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
        'message', 'Pacotes de créditos avulsos são exclusivos para assinantes PRO ou Master ativos.'
      );
    END IF;

    v_plan_credits := v_purchase.credits_amount;
    v_ledger_type  := 'purchase_extra';
    v_ledger_desc  := 'Pacote avulso ' || v_purchase.credits_amount::text
                      || ' créditos — pedido ' || coalesce(v_purchase.provider_order_id, v_purchase.id::text);
  END IF;

  -- ── Marca compra como ativada (só aqui, após todas as validações) ─────────────
  UPDATE kiwify_purchases
  SET activated_at = now(),
      tenant_id    = v_tenant_id
  WHERE id = p_purchase_id;

  -- ── Adiciona créditos à carteira ──────────────────────────────────────────────
  IF v_plan_credits > 0 THEN

    -- Upsert na wallet (INSERT cria, ON CONFLICT incrementa)
    INSERT INTO credits_wallet (tenant_id, balance, updated_at)
    VALUES (v_tenant_id, v_plan_credits, now())
    ON CONFLICT (tenant_id) DO UPDATE
      SET balance    = credits_wallet.balance + EXCLUDED.balance,
          updated_at = now();

    -- Registra no ledger com type e source corretos
    INSERT INTO credits_ledger (tenant_id, amount, type, description, source)
    VALUES (v_tenant_id, v_plan_credits, v_ledger_type, v_ledger_desc, 'kiwify_activation');

  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'plan',            v_purchase.plan_code,
    'credits_granted', v_plan_credits
  );

EXCEPTION WHEN OTHERS THEN
  -- Em caso de falha inesperada, retorna a mensagem real (sem swallow)
  RETURN jsonb_build_object(
    'ok',      false,
    'reason',  'internal_error',
    'message', 'Erro interno: ' || SQLERRM || ' (SQLSTATE: ' || SQLSTATE || ')'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_purchase_for_user(uuid) TO anon, authenticated, service_role;


-- ============================================================
-- BLOCO 6 — Corrigir assinaturas de usuários pagos que estão com plan_id = NULL
-- (geradas pelas versões bugadas do webhook/RPC que setavam plan_id = NULL)
-- ============================================================

-- Identifica e corrige subscriptions sem plan_id
DO $$
DECLARE
  v_pro_id    uuid;
  v_master_id uuid;
BEGIN
  SELECT id INTO v_pro_id    FROM public.plans WHERE upper(name) = 'PRO'    LIMIT 1;
  SELECT id INTO v_master_id FROM public.plans WHERE upper(name) = 'MASTER' LIMIT 1;

  -- Subscriptions sem plano que chegaram via kiwify (provider='kiwify') → plano PRO como fallback
  -- (revisão manual necessária para as de plano MASTER)
  UPDATE public.subscriptions
  SET plan_id = v_pro_id
  WHERE plan_id IS NULL
    AND provider = 'kiwify'
    AND v_pro_id IS NOT NULL;
END;
$$;


-- ============================================================
-- BLOCO 7 — Corrigir kiwify_purchases com plan_code errado
-- (produtos classificados como PRO mas que deveriam ser MASTER)
-- ============================================================

-- Detecta compras MASTER classificadas errado
SELECT
  id,
  email,
  product_key,
  plan_code,
  status,
  activated_at,
  (payload -> 'order' -> 'product' ->> 'name') AS product_name_kiwify
FROM public.kiwify_purchases
WHERE plan_code = 'PRO'
  AND status    = 'APPROVED'
  AND (
    lower(payload -> 'order' -> 'product' ->> 'name') LIKE '%master%'
    OR lower(payload -> 'order' -> 'product' ->> 'name') LIKE '%premium%'
  )
ORDER BY paid_at DESC;

-- Se a query acima retornar linhas, corrija:
UPDATE public.kiwify_purchases
SET
  plan_code   = 'MASTER',
  product_key = 'MASTER_MONTHLY'
WHERE plan_code = 'PRO'
  AND status    = 'APPROVED'
  AND (
    lower(payload -> 'order' -> 'product' ->> 'name') LIKE '%master%'
    OR lower(payload -> 'order' -> 'product' ->> 'name') LIKE '%premium%'
  );

-- Atualizar subscriptions dos tenants afetados para MASTER
UPDATE public.subscriptions s
SET plan_id = (SELECT id FROM public.plans WHERE upper(name) = 'MASTER' LIMIT 1)
WHERE s.tenant_id IN (
  SELECT DISTINCT kp.tenant_id
  FROM public.kiwify_purchases kp
  WHERE kp.plan_code = 'MASTER'
    AND kp.status = 'APPROVED'
    AND kp.tenant_id IS NOT NULL
)
AND s.status = 'ACTIVE';


-- ============================================================
-- BLOCO 8 — Verificação final
-- ============================================================

-- 1. Planos existentes
SELECT id, name, max_students, ai_credits_per_month, price_brl FROM public.plans ORDER BY price_brl;

-- 2. Subscriptions ativas com plano resolvido
SELECT s.tenant_id, p.name AS plan_name, s.status, s.current_period_end, s.provider
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id = s.plan_id
WHERE s.status = 'ACTIVE'
ORDER BY s.created_at DESC
LIMIT 20;

-- 3. Compras aprovadas ainda não ativadas (devem ser zero ou apenas as muito recentes)
SELECT id, email, plan_code, product_key, status, activated_at, tenant_id, paid_at
FROM public.kiwify_purchases
WHERE status = 'APPROVED' AND activated_at IS NULL
ORDER BY paid_at DESC;

-- 4. Ledger: tipos usados
SELECT type, source, count(*) FROM public.credits_ledger GROUP BY type, source ORDER BY count DESC;
