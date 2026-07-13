-- ============================================================
-- 20260616000003_grant_missing_monthly_credits_rpc.sql
--
-- SPRINT URGENTE — Renovação mensal de créditos
--
-- Cria a função grant_missing_monthly_credits_for_active_subscriptions()
-- para conceder créditos mensais faltantes de forma segura e idempotente.
--
-- PROBLEMA DIAGNOSTICADO:
--   A renovação mensal depende 100% do evento subscription_renewed
--   da Kiwify. Se o webhook não chegar (subscriptions mensais)
--   ou não for enviado mensalmente (subscriptions anuais),
--   as assinantes ficam sem créditos.
--
--   Não existe cron interno, nem verificação no login,
--   nem fallback automático.
--
-- SOLUÇÃO:
--   Função RPC idempotente que:
--     1. Varre todas as subs PRO/MASTER ATIVAS dentro do período
--     2. Verifica se já houve monthly_grant no mês calendário atual
--        via credits_ledger (cobre todos os caminhos de concessão)
--     3. Se faltou, concede via atomic_grant_credits (INCREMENT, não reset)
--     4. Registra operation_id único por tenant/mês para idempotência via credit_operations
--     5. Atualiza last_credit_grant_at e next_credit_grant_at na wallet
--
-- SEGURANÇA:
--   - billing_cycle NULL → anomalia, NÃO concede, retorna BILLING_CYCLE_NULL
--   - subscription vencida → NÃO concede, retorna SUBSCRIPTION_EXPIRED
--   - tenant inativo → NÃO concede, retorna TENANT_INACTIVE
--   - tenant internal → SEMPRE ignorado
--   - já concedeu neste mês → retorna ALREADY_GRANTED (sem duplicação)
--   - p_dry_run = true (padrão) → simula sem conceder; false = executa real
--
-- CRÉDITOS (INCREMENT sobre saldo existente — acúmulo 60 dias):
--   PRO    → +500 créditos
--   MASTER → +700 créditos
--   FREE   → não elegível (não processado)
--
-- USO SEGURO:
--   -- Simular (padrão):
--   SELECT * FROM public.grant_missing_monthly_credits_for_active_subscriptions();
--
--   -- Executar (somente após revisar o dry_run):
--   SELECT * FROM public.grant_missing_monthly_credits_for_active_subscriptions(p_dry_run := false);
--
-- IDEMPOTÊNCIA:
--   operation_id = 'monthly_grant:{tenant_id}:{YYYY-MM}'
--   - Registrado em credit_operations (atomic_grant_credits é idempotente por design)
--   - Verificado antes via credits_ledger para cobrir grants legados sem operation_id
--   - Segunda chamada no mesmo mês retorna ALREADY_GRANTED sem alterar saldo
--
-- NÃO ALTERA:
--   - credit_batches, validade de 60 dias, FIFO
--   - Saldos de usuários FREE
--   - Assinaturas com billing_cycle NULL
--   - Assinaturas vencidas
-- ============================================================

CREATE OR REPLACE FUNCTION public.grant_missing_monthly_credits_for_active_subscriptions(
  p_dry_run boolean DEFAULT true
)
RETURNS TABLE (
  tenant_id         uuid,
  tenant_name       text,
  user_email        text,
  plan_code         text,
  billing_cycle     text,
  credits_to_grant  int,
  balance_before    int,
  balance_after     int,
  operation_id      text,
  grant_status      text,
  detail            text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_month    text;
  v_rec             record;
  v_plan_credits    int;
  v_op_id           text;
  v_result          jsonb;
  v_balance_before  int;
  v_balance_after   int;
  v_already_ledger  boolean;
BEGIN
  -- Mês calendário atual no formato YYYY-MM (ex: 2026-06)
  v_period_month := to_char(now(), 'YYYY-MM');

  -- ── Varrer todas as subs PRO/MASTER ATIVAS ──────────────────────────────
  FOR v_rec IN
    SELECT
      t.id                                      AS tenant_id,
      t.name                                    AS tenant_name,
      COALESCE(t.is_internal, false)            AS is_internal,
      COALESCE(t.is_active, true)               AS tenant_is_active,
      upper(p.name)                             AS plan_code,
      s.billing_cycle,
      s.current_period_end,
      pu.email                                  AS user_email,
      COALESCE(cw.balance, 0)                   AS current_balance
    FROM public.subscriptions s
    JOIN public.plans p
      ON p.id = s.plan_id
      AND upper(p.name) IN ('PRO', 'MASTER')
    JOIN public.tenants t
      ON t.id = s.tenant_id
    LEFT JOIN LATERAL (
      SELECT u.email
      FROM public.users u
      WHERE u.tenant_id = t.id
      ORDER BY u.created_at ASC
      LIMIT 1
    ) pu ON true
    LEFT JOIN public.credits_wallet cw
      ON cw.tenant_id = t.id
    WHERE s.status = 'ACTIVE'
    ORDER BY t.name
  LOOP

    -- ── Ignorar tenants internos ──────────────────────────────────────────
    IF v_rec.is_internal THEN
      CONTINUE;
    END IF;

    -- ── Créditos do plano ─────────────────────────────────────────────────
    v_plan_credits := CASE v_rec.plan_code
      WHEN 'MASTER'  THEN 700
      WHEN 'PRO'     THEN 500
      ELSE 0
    END;

    -- ── Anomalia: billing_cycle NULL ──────────────────────────────────────
    IF v_rec.billing_cycle IS NULL THEN
      tenant_id        := v_rec.tenant_id;
      tenant_name      := v_rec.tenant_name;
      user_email       := v_rec.user_email;
      plan_code        := v_rec.plan_code;
      billing_cycle    := NULL;
      credits_to_grant := v_plan_credits;
      balance_before   := v_rec.current_balance;
      balance_after    := NULL;
      operation_id     := NULL;
      grant_status     := 'BILLING_CYCLE_NULL';
      detail           := 'billing_cycle não definido — revisar manualmente antes de conceder';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- ── Tenant inativo ────────────────────────────────────────────────────
    IF NOT v_rec.tenant_is_active THEN
      tenant_id        := v_rec.tenant_id;
      tenant_name      := v_rec.tenant_name;
      user_email       := v_rec.user_email;
      plan_code        := v_rec.plan_code;
      billing_cycle    := v_rec.billing_cycle;
      credits_to_grant := v_plan_credits;
      balance_before   := v_rec.current_balance;
      balance_after    := NULL;
      operation_id     := NULL;
      grant_status     := 'TENANT_INACTIVE';
      detail           := 'Tenant inativo — não elegível';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- ── Assinatura vencida ────────────────────────────────────────────────
    IF v_rec.current_period_end IS NOT NULL AND v_rec.current_period_end < now() THEN
      tenant_id        := v_rec.tenant_id;
      tenant_name      := v_rec.tenant_name;
      user_email       := v_rec.user_email;
      plan_code        := v_rec.plan_code;
      billing_cycle    := v_rec.billing_cycle;
      credits_to_grant := v_plan_credits;
      balance_before   := v_rec.current_balance;
      balance_after    := NULL;
      operation_id     := NULL;
      grant_status     := 'SUBSCRIPTION_EXPIRED';
      detail           := 'current_period_end no passado: ' || v_rec.current_period_end::text;
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- ── Plano desconhecido ────────────────────────────────────────────────
    IF v_plan_credits = 0 THEN
      CONTINUE;
    END IF;

    -- ── Operation ID idempotente (1 grant por tenant por mês calendário) ─
    v_op_id := 'monthly_grant:' || v_rec.tenant_id::text || ':' || v_period_month;

    -- ── Verificação 1: credit_operations (atomic path novo) ──────────────
    PERFORM 1
    FROM public.credit_operations co
    WHERE co.operation_id = v_op_id
      AND co.status        = 'succeeded';

    IF FOUND THEN
      tenant_id        := v_rec.tenant_id;
      tenant_name      := v_rec.tenant_name;
      user_email       := v_rec.user_email;
      plan_code        := v_rec.plan_code;
      billing_cycle    := v_rec.billing_cycle;
      credits_to_grant := v_plan_credits;
      balance_before   := v_rec.current_balance;
      balance_after    := v_rec.current_balance;
      operation_id     := v_op_id;
      grant_status     := 'ALREADY_GRANTED';
      detail           := 'Já concedido neste mês (credit_operations)';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- ── Verificação 2: credits_ledger (cobre webhook e activate_purchase) ─
    SELECT EXISTS (
      SELECT 1
      FROM public.credits_ledger cl
      WHERE cl.tenant_id = v_rec.tenant_id
        AND cl.type       = 'monthly_grant'
        AND date_trunc('month', cl.created_at) = date_trunc('month', now())
    ) INTO v_already_ledger;

    IF v_already_ledger THEN
      tenant_id        := v_rec.tenant_id;
      tenant_name      := v_rec.tenant_name;
      user_email       := v_rec.user_email;
      plan_code        := v_rec.plan_code;
      billing_cycle    := v_rec.billing_cycle;
      credits_to_grant := v_plan_credits;
      balance_before   := v_rec.current_balance;
      balance_after    := v_rec.current_balance;
      operation_id     := v_op_id;
      grant_status     := 'ALREADY_GRANTED';
      detail           := 'Já concedido neste mês (credits_ledger — via webhook ou ativação)';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- ── Conceder (ou simular) ─────────────────────────────────────────────
    v_balance_before := v_rec.current_balance;

    IF p_dry_run THEN
      -- Simulação: não altera nada
      v_balance_after := v_balance_before + v_plan_credits;
      tenant_id        := v_rec.tenant_id;
      tenant_name      := v_rec.tenant_name;
      user_email       := v_rec.user_email;
      plan_code        := v_rec.plan_code;
      billing_cycle    := v_rec.billing_cycle;
      credits_to_grant := v_plan_credits;
      balance_before   := v_balance_before;
      balance_after    := v_balance_after;
      operation_id     := v_op_id;
      grant_status     := 'DRY_RUN';
      detail           := 'Simulação: nenhum dado alterado. Execute com p_dry_run=false para conceder.';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- ── Execução real: conceder via atomic_grant_credits (INCREMENT) ──────
    v_result := public.atomic_grant_credits(
      v_op_id,
      v_plan_credits,
      'Renovação mensal de créditos do Plano '
        || CASE v_rec.plan_code WHEN 'MASTER' THEN 'Premium' ELSE 'Pro' END
        || ' (' || v_rec.billing_cycle || ') — ' || v_period_month,
      v_rec.tenant_id,
      NULL,   -- user_id não necessário para grant administrativo
      jsonb_build_object(
        'plan_code',     v_rec.plan_code,
        'billing_cycle', v_rec.billing_cycle,
        'grant_month',   v_period_month,
        'source',        'grant_missing_monthly_credits_rpc'
      ),
      'monthly_grant',
      'grant_missing_monthly_credits'
    );

    IF (v_result->>'ok')::boolean THEN
      v_balance_after := (v_result->>'final_balance')::int;

      -- Atualizar datas da wallet (atomic_grant_credits não faz isso)
      UPDATE public.credits_wallet
      SET
        last_reset_at        = now(),
        last_credit_grant_at = now(),
        next_credit_grant_at = now() + interval '1 month',
        updated_at           = now()
      WHERE tenant_id = v_rec.tenant_id;

      tenant_id        := v_rec.tenant_id;
      tenant_name      := v_rec.tenant_name;
      user_email       := v_rec.user_email;
      plan_code        := v_rec.plan_code;
      billing_cycle    := v_rec.billing_cycle;
      credits_to_grant := v_plan_credits;
      balance_before   := v_balance_before;
      balance_after    := v_balance_after;
      operation_id     := v_op_id;
      grant_status     := 'GRANTED';
      detail           := 'Créditos concedidos com sucesso. Saldo: '
                          || v_balance_before::text || ' → ' || v_balance_after::text;
      RETURN NEXT;

    ELSIF (v_result->>'idempotent')::boolean THEN
      -- operation_id já existia (race condition ou dupla chamada simultânea)
      tenant_id        := v_rec.tenant_id;
      tenant_name      := v_rec.tenant_name;
      user_email       := v_rec.user_email;
      plan_code        := v_rec.plan_code;
      billing_cycle    := v_rec.billing_cycle;
      credits_to_grant := v_plan_credits;
      balance_before   := v_balance_before;
      balance_after    := v_balance_before;
      operation_id     := v_op_id;
      grant_status     := 'ALREADY_GRANTED';
      detail           := 'Idempotente: operation_id já existia em credit_operations';
      RETURN NEXT;

    ELSE
      -- Falha real
      tenant_id        := v_rec.tenant_id;
      tenant_name      := v_rec.tenant_name;
      user_email       := v_rec.user_email;
      plan_code        := v_rec.plan_code;
      billing_cycle    := v_rec.billing_cycle;
      credits_to_grant := v_plan_credits;
      balance_before   := v_balance_before;
      balance_after    := v_balance_before;
      operation_id     := v_op_id;
      grant_status     := 'ERROR';
      detail           := 'Falha ao conceder: ' || COALESCE(v_result->>'reason', v_result::text);
      RETURN NEXT;
    END IF;

  END LOOP;
END;
$$;

-- ── Permissões ────────────────────────────────────────────────────────────────
-- Somente service_role pode executar.
-- authenticated NÃO recebe acesso: a função é SECURITY DEFINER e varre todas
-- as assinaturas PRO/MASTER ativas — qualquer usuário autenticado poderia
-- disparar concessão em massa com p_dry_run := false.
-- Se o painel CEO precisar chamar futuramente, criar uma Edge Function ou RPC
-- wrapper que verifique super_admin antes de invocar com service_role.
REVOKE EXECUTE ON FUNCTION public.grant_missing_monthly_credits_for_active_subscriptions(boolean)
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.grant_missing_monthly_credits_for_active_subscriptions(boolean)
  FROM authenticated;

GRANT EXECUTE ON FUNCTION public.grant_missing_monthly_credits_for_active_subscriptions(boolean)
  TO service_role;

-- ============================================================
-- COMENTÁRIOS DE USO
-- ============================================================
COMMENT ON FUNCTION public.grant_missing_monthly_credits_for_active_subscriptions(boolean) IS
$$Concede créditos mensais faltantes para assinaturas PRO/MASTER ativas.

p_dry_run = true  (padrão): simula e lista o que seria feito, sem alterar dados.
p_dry_run = false           : executa a concessão real, idempotente por tenant/mês.

Idempotência: operation_id = "monthly_grant:{tenant_id}:{YYYY-MM}"
  Verificação dupla: credit_operations (atomic path) + credits_ledger (todos os paths).

Créditos: INCREMENT sobre saldo existente (não reset). PRO +500, MASTER +700.
Atualizações de wallet: last_reset_at, last_credit_grant_at, next_credit_grant_at.

Casos excluídos automaticamente: billing_cycle NULL, subscription vencida,
  tenant inativo, tenant interno.$$;