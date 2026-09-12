-- Credit RPC hardening. Local review only; no data backfill or pricing changes.
-- Rollback: supabase/rollback/20260910000001_harden_credit_rpcs.sql (restores
-- repository baseline definitions/ACL, including known vulnerabilities; review first).
-- Service access uses auth.role(), never absence of auth.uid() or definer current_user.
BEGIN;

CREATE OR REPLACE FUNCTION public.credit_resolve_actor(
  p_tenant_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (tenant_id uuid, user_id uuid, is_super boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_auth_tenant_id uuid;
  v_is_super boolean := false;
BEGIN
  -- PostgREST supplies the verified JWT role. A missing uid is NOT a service role.
  -- current_user is postgres inside SECURITY DEFINER and must not authorize callers.
  IF auth.role() = 'service_role' THEN
    tenant_id := p_tenant_id;
    user_id := p_user_id;
    is_super := true;
  ELSIF auth.role() = 'authenticated' AND v_auth_user_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_auth_tenant_id
      FROM public.users u WHERE u.id = v_auth_user_id;
    v_is_super := COALESCE(public.is_super_admin(), false);
    IF NOT v_is_super THEN
      IF v_auth_tenant_id IS NULL
         OR (p_tenant_id IS NOT NULL AND p_tenant_id IS DISTINCT FROM v_auth_tenant_id) THEN
        RAISE EXCEPTION 'cross-tenant credit operation denied' USING ERRCODE = '42501';
      END IF;
      IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_auth_user_id THEN
        RAISE EXCEPTION 'credit actor impersonation denied' USING ERRCODE = '42501';
      END IF;
    END IF;
    tenant_id := COALESCE(p_tenant_id, v_auth_tenant_id);
    user_id := COALESCE(p_user_id, v_auth_user_id);
    is_super := v_is_super;
  ELSE
    RAISE EXCEPTION 'authenticated credit actor required' USING ERRCODE = '42501';
  END IF;
  IF tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id required for credit operation' USING ERRCODE = '22023';
  END IF;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_prepare_operation(
  p_operation_id text,
  p_tenant_id uuid,
  p_user_id uuid,
  p_operation_kind text,
  p_amount integer,
  p_ledger_type text,
  p_description text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.credit_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op public.credit_operations;
BEGIN
  SELECT *
    INTO v_op
    FROM public.credit_operations
   WHERE operation_id = p_operation_id
   FOR UPDATE;

  IF FOUND THEN
    -- A global operation_id must never return another tenant's cached result,
    -- nor accept a replay with a different amount/kind/ledger type.
    IF v_op.tenant_id IS DISTINCT FROM p_tenant_id
       OR v_op.operation_kind IS DISTINCT FROM p_operation_kind
       OR v_op.amount IS DISTINCT FROM p_amount
       OR v_op.ledger_type IS DISTINCT FROM p_ledger_type
       OR (auth.role() = 'authenticated' AND NOT COALESCE(public.is_super_admin(), false)
           AND v_op.user_id IS DISTINCT FROM p_user_id) THEN
      RAISE EXCEPTION 'credit operation id conflicts with original request' USING ERRCODE = '42501';
    END IF;
    UPDATE public.credit_operations
       SET attempt_count = attempt_count + 1,
           last_seen_at = now(),
           metadata = COALESCE(public.credit_operations.metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb)
     WHERE id = v_op.id
     RETURNING * INTO v_op;
    RETURN v_op;
  END IF;

  INSERT INTO public.credit_operations (
    operation_id,
    tenant_id,
    user_id,
    operation_kind,
    status,
    amount,
    ledger_type,
    description,
    metadata,
    result
  )
  VALUES (
    p_operation_id,
    p_tenant_id,
    p_user_id,
    p_operation_kind,
    'pending',
    p_amount,
    p_ledger_type,
    p_description,
    COALESCE(p_metadata, '{}'::jsonb),
    '{}'::jsonb
  )
  RETURNING * INTO v_op;

  RETURN v_op;
END;
$$;

CREATE OR REPLACE FUNCTION public.atomic_grant_credits(
  p_operation_id text,
  p_amount integer,
  p_description text,
  p_tenant_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_ledger_type text DEFAULT 'manual_grant',
  p_source text DEFAULT 'atomic_grant_credits'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor record;
  v_wallet public.credits_wallet;
  v_op public.credit_operations;
  v_balance integer;
  v_result jsonb;
BEGIN
  -- Authorization precedes validation/idempotency and every wallet/ledger write.
  SELECT * INTO v_actor FROM public.credit_resolve_actor(p_tenant_id, p_user_id);
  IF v_actor.is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'credit administration requires super-admin or service_role' USING ERRCODE = '42501';
  END IF;

  IF p_operation_id IS NULL OR btrim(p_operation_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'operation_id_required');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  IF p_ledger_type IS NULL OR p_ledger_type NOT IN ('monthly_grant', 'manual_grant', 'purchase_extra', 'courtesy') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_ledger_type');
  END IF;

  v_op := public.credit_prepare_operation(
    p_operation_id, v_actor.tenant_id, v_actor.user_id, 'grant', p_amount, p_ledger_type, p_description, p_metadata
  );

  IF v_op.status <> 'pending' THEN
    RETURN COALESCE(v_op.result, '{}'::jsonb) || jsonb_build_object('idempotent', true, 'attempt_count', v_op.attempt_count);
  END IF;

  INSERT INTO public.credits_wallet (tenant_id, balance, updated_at)
  VALUES (v_actor.tenant_id, 0, now())
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT *
    INTO v_wallet
    FROM public.credits_wallet
   WHERE tenant_id = v_actor.tenant_id
   FOR UPDATE;

  UPDATE public.credits_wallet
     SET balance = balance + p_amount,
         updated_at = now()
   WHERE id = v_wallet.id
   RETURNING balance INTO v_balance;

  INSERT INTO public.credits_ledger (
    tenant_id, user_id, type, amount, description, created_at, operation, source, operation_id, metadata
  )
  VALUES (
    v_actor.tenant_id,
    v_actor.user_id,
    p_ledger_type,
    p_amount,
    p_description,
    now(),
    'grant',
    p_source,
    p_operation_id,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'status', 'succeeded',
    'operation_id', p_operation_id,
    'tenant_id', v_actor.tenant_id,
    'user_id', v_actor.user_id,
    'amount', p_amount,
    'ledger_type', p_ledger_type,
    'final_balance', v_balance,
    'idempotent', false
  );

  PERFORM public.credit_finish_operation(p_operation_id, 'succeeded', v_balance, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.atomic_refund_credits(
  p_operation_id text,
  p_amount integer,
  p_description text,
  p_tenant_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_source text DEFAULT 'atomic_refund_credits'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_ledger_type constant text := 'refund';
  v_actor record;
  v_wallet public.credits_wallet;
  v_op public.credit_operations;
  v_balance integer;
  v_result jsonb;
BEGIN
  -- Authorization precedes validation/idempotency and every wallet/ledger write.
  SELECT * INTO v_actor FROM public.credit_resolve_actor(p_tenant_id, p_user_id);
  IF v_actor.is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'credit administration requires super-admin or service_role' USING ERRCODE = '42501';
  END IF;

  IF p_operation_id IS NULL OR btrim(p_operation_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'operation_id_required');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  -- Preserve the refund marker previously supplied by the wrapper.
  p_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('refund', true);
  v_op := public.credit_prepare_operation(
    p_operation_id, v_actor.tenant_id, v_actor.user_id, 'refund', p_amount, p_ledger_type, p_description, p_metadata
  );

  IF v_op.status <> 'pending' THEN
    RETURN COALESCE(v_op.result, '{}'::jsonb) || jsonb_build_object('idempotent', true, 'attempt_count', v_op.attempt_count);
  END IF;

  INSERT INTO public.credits_wallet (tenant_id, balance, updated_at)
  VALUES (v_actor.tenant_id, 0, now())
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT *
    INTO v_wallet
    FROM public.credits_wallet
   WHERE tenant_id = v_actor.tenant_id
   FOR UPDATE;

  UPDATE public.credits_wallet
     SET balance = balance + p_amount,
         updated_at = now()
   WHERE id = v_wallet.id
   RETURNING balance INTO v_balance;

  INSERT INTO public.credits_ledger (
    tenant_id, user_id, type, amount, description, created_at, operation, source, operation_id, metadata
  )
  VALUES (
    v_actor.tenant_id,
    v_actor.user_id,
    p_ledger_type,
    p_amount,
    p_description,
    now(),
    'refund',
    p_source,
    p_operation_id,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'status', 'succeeded',
    'operation_id', p_operation_id,
    'tenant_id', v_actor.tenant_id,
    'user_id', v_actor.user_id,
    'amount', p_amount,
    'ledger_type', p_ledger_type,
    'final_balance', v_balance,
    'idempotent', false
  );

  PERFORM public.credit_finish_operation(p_operation_id, 'succeeded', v_balance, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_monthly_credits(p_tenant_id text, p_credits integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Legacy users.ai_credits reset: no application caller. Kept only for backend
  -- compatibility; does not reset credits_wallet and is not a renewal API.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'legacy credit reset requires service_role' USING ERRCODE = '42501';
  END IF;
  IF p_credits IS NULL OR p_credits < 0 OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'invalid legacy credit reset' USING ERRCODE = '22023';
  END IF;
  UPDATE public.users SET ai_credits = p_credits, updated_at = now()
    WHERE tenant_id = p_tenant_id::uuid;
END;
$$;

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
  -- Batch maintenance has no browser caller: backend credentials are mandatory,
  -- including dry-run (which exposes subscription/customer information).
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'monthly batch requires service_role' USING ERRCODE = '42501';
  END IF;
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
      -- Qualify the column: tenant_id is also a RETURNS TABLE variable.
      WHERE credits_wallet.tenant_id = v_rec.tenant_id;

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

CREATE OR REPLACE FUNCTION public.grant_missing_monthly_credits_for_subscription(
  p_subscription_id uuid,
  p_dry_run         boolean DEFAULT true
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
  v_is_super_admin boolean := false;
  v_caller_email   text;
  v_period_month   text;
  v_rec            record;
  v_plan_credits   int;
  v_op_id          text;
  v_result         jsonb;
  v_balance_before int;
  v_balance_after  int;
  v_already_ledger boolean;
BEGIN
  -- ── Verificar permissão ───────────────────────────────────────────────────
  SELECT u.is_super_admin, u.email
  INTO v_is_super_admin, v_caller_email
  FROM public.users u
  WHERE u.id = auth.uid();

  -- SELECT INTO can assign NULL when no public.users row exists: fail closed.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (auth.role() IS DISTINCT FROM 'authenticated'
          OR auth.uid() IS NULL OR v_is_super_admin IS NOT TRUE) THEN
    tenant_id        := NULL;
    tenant_name      := NULL;
    user_email       := NULL;
    plan_code        := NULL;
    billing_cycle    := NULL;
    credits_to_grant := 0;
    balance_before   := 0;
    balance_after    := NULL;
    operation_id     := NULL;
    grant_status     := 'PERMISSION_DENIED';
    detail           := 'Requer is_super_admin = true';
    RETURN NEXT;
    RETURN;
  END IF;

  v_period_month := to_char(now(), 'YYYY-MM');

  -- ── Buscar dados da assinatura ────────────────────────────────────────────
  SELECT
    t.id                                   AS tenant_id,
    t.name                                 AS tenant_name,
    COALESCE(t.is_internal, false)         AS is_internal,
    COALESCE(t.is_active, true)            AS tenant_is_active,
    upper(trim(p.name))                    AS plan_code,
    s.billing_cycle,
    s.current_period_end,
    pu.email                               AS user_email,
    COALESCE(cw.balance, 0)               AS current_balance
  INTO v_rec
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  JOIN public.tenants t ON t.id = s.tenant_id
  LEFT JOIN LATERAL (
    SELECT u2.email
    FROM public.users u2
    WHERE u2.tenant_id = t.id
    ORDER BY u2.created_at ASC
    LIMIT 1
  ) pu ON true
  LEFT JOIN public.credits_wallet cw ON cw.tenant_id = t.id
  WHERE s.id = p_subscription_id;

  IF NOT FOUND THEN
    tenant_id        := NULL;
    tenant_name      := NULL;
    user_email       := NULL;
    plan_code        := NULL;
    billing_cycle    := NULL;
    credits_to_grant := 0;
    balance_before   := 0;
    balance_after    := NULL;
    operation_id     := NULL;
    grant_status     := 'NOT_FOUND';
    detail           := 'Assinatura não encontrada: ' || p_subscription_id::text;
    RETURN NEXT;
    RETURN;
  END IF;

  -- ── Ignorar internos ─────────────────────────────────────────────────────
  IF v_rec.is_internal THEN
    tenant_id        := v_rec.tenant_id;
    tenant_name      := v_rec.tenant_name;
    user_email       := v_rec.user_email;
    plan_code        := v_rec.plan_code;
    billing_cycle    := v_rec.billing_cycle;
    credits_to_grant := 0;
    balance_before   := v_rec.current_balance;
    balance_after    := NULL;
    operation_id     := NULL;
    grant_status     := 'TENANT_INTERNAL';
    detail           := 'Tenant interno — excluído do processo de concessão';
    RETURN NEXT;
    RETURN;
  END IF;

  -- ── Créditos do plano ─────────────────────────────────────────────────────
  v_plan_credits := CASE v_rec.plan_code
    WHEN 'MASTER'  THEN 700
    WHEN 'PRO'     THEN 500
    ELSE 0
  END;

  IF v_plan_credits = 0 THEN
    tenant_id        := v_rec.tenant_id;
    tenant_name      := v_rec.tenant_name;
    user_email       := v_rec.user_email;
    plan_code        := v_rec.plan_code;
    billing_cycle    := v_rec.billing_cycle;
    credits_to_grant := 0;
    balance_before   := v_rec.current_balance;
    balance_after    := NULL;
    operation_id     := NULL;
    grant_status     := 'NOT_ELIGIBLE';
    detail           := 'Plano FREE não é elegível para concessão mensal';
    RETURN NEXT;
    RETURN;
  END IF;

  -- ── Anomalia: billing_cycle NULL ──────────────────────────────────────────
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
    detail           := 'billing_cycle não definido — corrija o ciclo antes de conceder créditos';
    RETURN NEXT;
    RETURN;
  END IF;

  -- ── Tenant inativo ────────────────────────────────────────────────────────
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
    RETURN;
  END IF;

  -- ── Assinatura vencida ────────────────────────────────────────────────────
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
    RETURN;
  END IF;

  -- ── Operation ID idempotente ──────────────────────────────────────────────
  v_op_id := 'monthly_grant:' || v_rec.tenant_id::text || ':' || v_period_month;

  -- ── Verificação 1: credit_operations ─────────────────────────────────────
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
    RETURN;
  END IF;

  -- ── Verificação 2: credits_ledger ────────────────────────────────────────
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
    RETURN;
  END IF;

  -- ── Dry run ───────────────────────────────────────────────────────────────
  v_balance_before := v_rec.current_balance;

  IF p_dry_run THEN
    tenant_id        := v_rec.tenant_id;
    tenant_name      := v_rec.tenant_name;
    user_email       := v_rec.user_email;
    plan_code        := v_rec.plan_code;
    billing_cycle    := v_rec.billing_cycle;
    credits_to_grant := v_plan_credits;
    balance_before   := v_balance_before;
    balance_after    := v_balance_before + v_plan_credits;
    operation_id     := v_op_id;
    grant_status     := 'DRY_RUN';
    detail           := 'Simulação: concederia +' || v_plan_credits::text || ' créditos. Execute com p_dry_run=false para confirmar.';
    RETURN NEXT;
    RETURN;
  END IF;

  -- ── Execução real ─────────────────────────────────────────────────────────
  v_result := public.atomic_grant_credits(
    v_op_id,
    v_plan_credits,
    'Renovação mensal de créditos do Plano '
      || CASE v_rec.plan_code WHEN 'MASTER' THEN 'Premium' ELSE 'Pro' END
      || ' (' || v_rec.billing_cycle || ') — ' || v_period_month
      || ' [manual CEO: ' || COALESCE(v_caller_email, 'service_role') || ']',
    v_rec.tenant_id,
    NULL,
    jsonb_build_object(
      'plan_code',     v_rec.plan_code,
      'billing_cycle', v_rec.billing_cycle,
      'grant_month',   v_period_month,
      'source',        'grant_missing_monthly_credits_for_subscription',
      'performed_by',  COALESCE(v_caller_email, 'service_role')
    ),
    'monthly_grant',
    'grant_missing_monthly_credits_for_subscription'
  );

  IF (v_result->>'ok')::boolean THEN
    v_balance_after := (v_result->>'final_balance')::int;

    UPDATE public.credits_wallet
    SET
      last_reset_at = now(),
      updated_at    = now()
    -- Qualify the column: tenant_id is also a RETURNS TABLE variable.
    WHERE credits_wallet.tenant_id = v_rec.tenant_id;

    -- Registrar auditoria
    INSERT INTO public.admin_audit_logs (
      action,
      resource_type,
      resource_id,
      tenant_id,
      performed_by,
      performed_by_email,
      before_data,
      after_data,
      reason
    ) VALUES (
      'GRANT_MONTHLY_CREDITS',
      'credits_wallet',
      v_rec.tenant_id::text,
      v_rec.tenant_id,
      auth.uid(),
      v_caller_email,
      jsonb_build_object('balance', v_balance_before),
      jsonb_build_object('balance', v_balance_after, 'credits_granted', v_plan_credits, 'operation_id', v_op_id),
      'Concessão manual de créditos mensais via painel CEO'
    );

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
    detail           := 'Créditos concedidos com sucesso. Saldo: ' || v_balance_before::text || ' → ' || v_balance_after::text;

  ELSIF (v_result->>'idempotent')::boolean THEN
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
    detail           := 'Idempotente: operation_id já existia (race condition ou dupla chamada)';

  ELSE
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
  END IF;

  RETURN NEXT;

EXCEPTION WHEN OTHERS THEN
  tenant_id        := NULL;
  tenant_name      := NULL;
  user_email       := NULL;
  plan_code        := NULL;
  billing_cycle    := NULL;
  credits_to_grant := 0;
  balance_before   := 0;
  balance_after    := NULL;
  operation_id     := NULL;
  grant_status     := 'ERROR';
  detail           := 'Exceção: ' || SQLERRM;
  RETURN NEXT;
END;
$$;

-- Remove default PUBLIC access AND explicit role grants (remote schema drift).
-- Helpers are owner-only; SECURITY DEFINER RPCs can still invoke them.
REVOKE ALL ON FUNCTION public.credit_resolve_actor(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.credit_prepare_operation(text, uuid, uuid, text, integer, text, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.credit_finish_operation(text, text, integer, jsonb, text, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.atomic_grant_credits(text, integer, text, uuid, uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.atomic_refund_credits(text, integer, text, uuid, uuid, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.atomic_debit_credits(text, integer, text, uuid, uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.atomic_reserve_credits(text, integer, text, uuid, uuid, jsonb, timestamptz, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.atomic_commit_reserved_credits(text, uuid, text, uuid, uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.atomic_release_reserved_credits(text, uuid, text, uuid, uuid, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reset_monthly_credits(text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.grant_missing_monthly_credits_for_active_subscriptions(boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.grant_missing_monthly_credits_for_subscription(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;

-- Browser operations retained for IncluiLab/AI and CEO; administrative bodies enforce super-admin.
GRANT EXECUTE ON FUNCTION public.atomic_grant_credits(text, integer, text, uuid, uuid, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atomic_refund_credits(text, integer, text, uuid, uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atomic_debit_credits(text, integer, text, uuid, uuid, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atomic_reserve_credits(text, integer, text, uuid, uuid, jsonb, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atomic_commit_reserved_credits(text, uuid, text, uuid, uuid, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atomic_release_reserved_credits(text, uuid, text, uuid, uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_monthly_credits(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_missing_monthly_credits_for_active_subscriptions(boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_missing_monthly_credits_for_subscription(uuid, boolean) TO authenticated, service_role;

COMMIT;
