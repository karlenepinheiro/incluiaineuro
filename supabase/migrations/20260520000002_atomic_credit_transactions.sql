-- Sprint CEO-3
-- Arquitetura transacional de créditos com reserva, idempotência e observabilidade.
-- Objetivos:
--   1. Eliminar divergência wallet/ledger por operações parciais
--   2. Mover a regra financeira para PostgreSQL
--   3. Garantir idempotência por operation_id
--   4. Permitir RESERVE -> COMMIT / RELEASE para fluxos multimodais
--   5. Preservar histórico existente sem recalcular saldos legados

BEGIN;

-- ============================================================================
-- 1. Expansão segura do schema legado
-- ============================================================================

ALTER TABLE public.credits_ledger
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS operation_id text,
  ADD COLUMN IF NOT EXISTS reservation_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.credits_ledger
  DROP CONSTRAINT IF EXISTS credits_ledger_type_check;

ALTER TABLE public.credits_ledger
  ADD CONSTRAINT credits_ledger_type_check CHECK (
    type = ANY (ARRAY[
      'monthly_grant',
      'usage_ai',
      'manual_grant',
      'purchase_extra',
      'refund',
      'courtesy',
      'reservation_hold',
      'reservation_release'
    ])
  );

CREATE INDEX IF NOT EXISTS idx_credits_ledger_operation_id
  ON public.credits_ledger (operation_id)
  WHERE operation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credits_ledger_reservation_id
  ON public.credits_ledger (reservation_id)
  WHERE reservation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.credit_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  operation_kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  amount integer NOT NULL DEFAULT 0,
  ledger_type text NULL,
  description text NULL,
  reservation_id uuid NULL,
  attempt_count integer NOT NULL DEFAULT 1,
  error_code text NULL,
  error_message text NULL,
  final_balance integer NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CONSTRAINT credit_operations_kind_check CHECK (
    operation_kind = ANY (ARRAY[
      'debit',
      'grant',
      'refund',
      'reserve',
      'commit_reservation',
      'release_reservation'
    ])
  ),
  CONSTRAINT credit_operations_status_check CHECK (
    status = ANY (ARRAY[
      'pending',
      'succeeded',
      'failed',
      'committed',
      'released'
    ])
  )
);

CREATE INDEX IF NOT EXISTS idx_credit_operations_tenant_created
  ON public.credit_operations (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_operations_status
  ON public.credit_operations (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.credit_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  operation_id text NOT NULL UNIQUE,
  hold_ledger_id uuid NULL REFERENCES public.credits_ledger(id) ON DELETE SET NULL,
  amount integer NOT NULL,
  description text NULL,
  status text NOT NULL DEFAULT 'reserved',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NULL,
  committed_at timestamptz NULL,
  released_at timestamptz NULL,
  committed_operation_id text NULL,
  released_operation_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_reservations_amount_positive CHECK (amount > 0),
  CONSTRAINT credit_reservations_status_check CHECK (
    status = ANY (ARRAY['reserved', 'committed', 'released', 'expired'])
  )
);

CREATE INDEX IF NOT EXISTS idx_credit_reservations_tenant_status
  ON public.credit_reservations (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_reservations_expires_at
  ON public.credit_reservations (expires_at)
  WHERE status = 'reserved';

CREATE OR REPLACE FUNCTION public.trg_credit_ops_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_operations_updated_at ON public.credit_operations;
CREATE TRIGGER trg_credit_operations_updated_at
BEFORE UPDATE ON public.credit_operations
FOR EACH ROW
EXECUTE FUNCTION public.trg_credit_ops_updated_at();

DROP TRIGGER IF EXISTS trg_credit_reservations_updated_at ON public.credit_reservations;
CREATE TRIGGER trg_credit_reservations_updated_at
BEFORE UPDATE ON public.credit_reservations
FOR EACH ROW
EXECUTE FUNCTION public.trg_credit_ops_updated_at();

-- ============================================================================
-- 2. RLS básica das tabelas novas
-- ============================================================================

ALTER TABLE public.credit_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_operations_own ON public.credit_operations;
CREATE POLICY credit_operations_own ON public.credit_operations
  USING (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

DROP POLICY IF EXISTS credit_operations_super_admin ON public.credit_operations;
CREATE POLICY credit_operations_super_admin ON public.credit_operations
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS credit_reservations_own ON public.credit_reservations;
CREATE POLICY credit_reservations_own ON public.credit_reservations
  USING (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

DROP POLICY IF EXISTS credit_reservations_super_admin ON public.credit_reservations;
CREATE POLICY credit_reservations_super_admin ON public.credit_reservations
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

GRANT SELECT ON public.credit_operations TO authenticated, service_role;
GRANT SELECT ON public.credit_reservations TO authenticated, service_role;

-- ============================================================================
-- 3. Helpers internos
-- ============================================================================

CREATE OR REPLACE FUNCTION public.credit_resolve_actor(
  p_tenant_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  tenant_id uuid,
  user_id uuid,
  is_super boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_auth_tenant_id uuid;
  v_is_super boolean := false;
BEGIN
  IF v_auth_user_id IS NOT NULL THEN
    SELECT u.tenant_id
      INTO v_auth_tenant_id
      FROM public.users u
     WHERE u.id = v_auth_user_id;

    v_is_super := public.is_super_admin();

    IF p_tenant_id IS NOT NULL AND NOT v_is_super AND p_tenant_id <> v_auth_tenant_id THEN
      RAISE EXCEPTION 'cross-tenant credit operation denied';
    END IF;

    tenant_id := COALESCE(p_tenant_id, v_auth_tenant_id);
    user_id := COALESCE(p_user_id, v_auth_user_id);
    is_super := v_is_super;
  ELSE
    tenant_id := p_tenant_id;
    user_id := p_user_id;
    is_super := true;
  END IF;

  IF tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id required for credit operation';
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

CREATE OR REPLACE FUNCTION public.credit_finish_operation(
  p_operation_id text,
  p_status text,
  p_final_balance integer,
  p_result jsonb,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_reservation_id uuid DEFAULT NULL
)
RETURNS public.credit_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op public.credit_operations;
BEGIN
  UPDATE public.credit_operations
     SET status = p_status,
         final_balance = p_final_balance,
         result = COALESCE(p_result, '{}'::jsonb),
         error_code = p_error_code,
         error_message = p_error_message,
         reservation_id = COALESCE(p_reservation_id, reservation_id),
         completed_at = CASE WHEN p_status IN ('succeeded', 'failed', 'committed', 'released') THEN now() ELSE completed_at END,
         last_seen_at = now()
   WHERE operation_id = p_operation_id
   RETURNING * INTO v_op;

  RETURN v_op;
END;
$$;

-- ============================================================================
-- 4. RPCs atômicas
-- ============================================================================

CREATE OR REPLACE FUNCTION public.atomic_debit_credits(
  p_operation_id text,
  p_amount integer,
  p_description text,
  p_tenant_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_ledger_type text DEFAULT 'usage_ai',
  p_source text DEFAULT 'atomic_debit_credits'
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
  IF p_operation_id IS NULL OR btrim(p_operation_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'operation_id_required');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  IF p_ledger_type <> 'usage_ai' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_ledger_type');
  END IF;

  SELECT * INTO v_actor FROM public.credit_resolve_actor(p_tenant_id, p_user_id);
  v_op := public.credit_prepare_operation(
    p_operation_id, v_actor.tenant_id, v_actor.user_id, 'debit', p_amount, p_ledger_type, p_description, p_metadata
  );

  IF v_op.status <> 'pending' THEN
    RETURN COALESCE(v_op.result, '{}'::jsonb) || jsonb_build_object('idempotent', true, 'attempt_count', v_op.attempt_count);
  END IF;

  SELECT *
    INTO v_wallet
    FROM public.credits_wallet
   WHERE tenant_id = v_actor.tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    v_result := jsonb_build_object('ok', false, 'reason', 'wallet_not_found', 'operation_id', p_operation_id);
    PERFORM public.credit_finish_operation(p_operation_id, 'failed', NULL, v_result, 'wallet_not_found', 'credits_wallet not found');
    RETURN v_result;
  END IF;

  IF COALESCE(v_wallet.balance, 0) < p_amount THEN
    v_result := jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_credits',
      'operation_id', p_operation_id,
      'current_balance', COALESCE(v_wallet.balance, 0),
      'requested_amount', p_amount
    );
    PERFORM public.credit_finish_operation(p_operation_id, 'failed', v_wallet.balance, v_result, 'insufficient_credits', 'insufficient credits');
    RETURN v_result;
  END IF;

  UPDATE public.credits_wallet
     SET balance = balance - p_amount,
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
    -p_amount,
    p_description,
    now(),
    'debit',
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
    'final_balance', v_balance,
    'idempotent', false
  );

  PERFORM public.credit_finish_operation(p_operation_id, 'succeeded', v_balance, v_result);
  RETURN v_result;
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
  IF p_operation_id IS NULL OR btrim(p_operation_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'operation_id_required');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  IF p_ledger_type NOT IN ('monthly_grant', 'manual_grant', 'purchase_extra', 'courtesy') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_ledger_type');
  END IF;

  SELECT * INTO v_actor FROM public.credit_resolve_actor(p_tenant_id, p_user_id);
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
BEGIN
  RETURN public.atomic_grant_credits(
    p_operation_id,
    p_amount,
    p_description,
    p_tenant_id,
    p_user_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('refund', true),
    'refund',
    p_source
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.atomic_reserve_credits(
  p_operation_id text,
  p_amount integer,
  p_description text,
  p_tenant_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_expires_at timestamptz DEFAULT (now() + interval '20 minutes'),
  p_source text DEFAULT 'atomic_reserve_credits'
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
  v_reservation public.credit_reservations;
  v_hold_ledger_id uuid;
  v_balance integer;
  v_result jsonb;
BEGIN
  IF p_operation_id IS NULL OR btrim(p_operation_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'operation_id_required');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  SELECT * INTO v_actor FROM public.credit_resolve_actor(p_tenant_id, p_user_id);
  v_op := public.credit_prepare_operation(
    p_operation_id, v_actor.tenant_id, v_actor.user_id, 'reserve', p_amount, 'reservation_hold', p_description, p_metadata
  );

  IF v_op.status <> 'pending' THEN
    RETURN COALESCE(v_op.result, '{}'::jsonb) || jsonb_build_object('idempotent', true, 'attempt_count', v_op.attempt_count);
  END IF;

  SELECT *
    INTO v_wallet
    FROM public.credits_wallet
   WHERE tenant_id = v_actor.tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    v_result := jsonb_build_object('ok', false, 'reason', 'wallet_not_found', 'operation_id', p_operation_id);
    PERFORM public.credit_finish_operation(p_operation_id, 'failed', NULL, v_result, 'wallet_not_found', 'credits_wallet not found');
    RETURN v_result;
  END IF;

  IF COALESCE(v_wallet.balance, 0) < p_amount THEN
    v_result := jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_credits',
      'operation_id', p_operation_id,
      'current_balance', COALESCE(v_wallet.balance, 0),
      'requested_amount', p_amount
    );
    PERFORM public.credit_finish_operation(p_operation_id, 'failed', v_wallet.balance, v_result, 'insufficient_credits', 'insufficient credits');
    RETURN v_result;
  END IF;

  UPDATE public.credits_wallet
     SET balance = balance - p_amount,
         updated_at = now()
   WHERE id = v_wallet.id
   RETURNING balance INTO v_balance;

  INSERT INTO public.credits_ledger (
    tenant_id, user_id, type, amount, description, created_at, operation, source, operation_id, metadata
  )
  VALUES (
    v_actor.tenant_id,
    v_actor.user_id,
    'reservation_hold',
    -p_amount,
    p_description,
    now(),
    'reserve',
    p_source,
    p_operation_id,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_hold_ledger_id;

  INSERT INTO public.credit_reservations (
    tenant_id,
    user_id,
    operation_id,
    hold_ledger_id,
    amount,
    description,
    status,
    metadata,
    expires_at
  )
  VALUES (
    v_actor.tenant_id,
    v_actor.user_id,
    p_operation_id,
    v_hold_ledger_id,
    p_amount,
    p_description,
    'reserved',
    COALESCE(p_metadata, '{}'::jsonb),
    p_expires_at
  )
  RETURNING * INTO v_reservation;

  UPDATE public.credits_ledger
     SET reservation_id = v_reservation.id
   WHERE id = v_hold_ledger_id;

  v_result := jsonb_build_object(
    'ok', true,
    'status', 'reserved',
    'operation_id', p_operation_id,
    'reservation_id', v_reservation.id,
    'tenant_id', v_actor.tenant_id,
    'user_id', v_actor.user_id,
    'amount', p_amount,
    'final_balance', v_balance,
    'expires_at', v_reservation.expires_at,
    'idempotent', false
  );

  PERFORM public.credit_finish_operation(p_operation_id, 'succeeded', v_balance, v_result, NULL, NULL, v_reservation.id);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.atomic_commit_reserved_credits(
  p_operation_id text,
  p_reservation_id uuid,
  p_description text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_final_ledger_type text DEFAULT 'usage_ai',
  p_source text DEFAULT 'atomic_commit_reserved_credits'
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
  v_reservation public.credit_reservations;
  v_balance integer;
  v_result jsonb;
  v_description text;
BEGIN
  IF p_operation_id IS NULL OR btrim(p_operation_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'operation_id_required');
  END IF;

  IF p_reservation_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reservation_id_required');
  END IF;

  IF p_final_ledger_type <> 'usage_ai' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_ledger_type');
  END IF;

  SELECT * INTO v_actor FROM public.credit_resolve_actor(p_tenant_id, p_user_id);
  v_op := public.credit_prepare_operation(
    p_operation_id, v_actor.tenant_id, v_actor.user_id, 'commit_reservation', 0, p_final_ledger_type, p_description, p_metadata
  );

  IF v_op.status <> 'pending' THEN
    RETURN COALESCE(v_op.result, '{}'::jsonb) || jsonb_build_object('idempotent', true, 'attempt_count', v_op.attempt_count);
  END IF;

  SELECT *
    INTO v_reservation
    FROM public.credit_reservations
   WHERE id = p_reservation_id
     AND tenant_id = v_actor.tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    v_result := jsonb_build_object('ok', false, 'reason', 'reservation_not_found', 'operation_id', p_operation_id);
    PERFORM public.credit_finish_operation(p_operation_id, 'failed', NULL, v_result, 'reservation_not_found', 'reservation not found');
    RETURN v_result;
  END IF;

  IF v_reservation.status = 'committed' THEN
    SELECT * INTO v_wallet
      FROM public.credits_wallet
     WHERE tenant_id = v_actor.tenant_id
     FOR UPDATE;

    v_result := jsonb_build_object(
      'ok', true,
      'status', 'committed',
      'operation_id', p_operation_id,
      'reservation_id', v_reservation.id,
      'tenant_id', v_actor.tenant_id,
      'user_id', COALESCE(v_actor.user_id, v_reservation.user_id),
      'amount', v_reservation.amount,
      'final_balance', COALESCE(v_wallet.balance, 0),
      'idempotent', true
    );
    PERFORM public.credit_finish_operation(p_operation_id, 'committed', COALESCE(v_wallet.balance, 0), v_result, NULL, NULL, v_reservation.id);
    RETURN v_result;
  END IF;

  IF v_reservation.status <> 'reserved' THEN
    v_result := jsonb_build_object(
      'ok', false,
      'reason', 'reservation_not_open',
      'reservation_status', v_reservation.status,
      'operation_id', p_operation_id
    );
    PERFORM public.credit_finish_operation(p_operation_id, 'failed', NULL, v_result, 'reservation_not_open', 'reservation is not reserved', v_reservation.id);
    RETURN v_result;
  END IF;

  SELECT *
    INTO v_wallet
    FROM public.credits_wallet
   WHERE tenant_id = v_actor.tenant_id
   FOR UPDATE;

  v_description := COALESCE(p_description, v_reservation.description);

  UPDATE public.credit_reservations
     SET status = 'committed',
         committed_at = now(),
         committed_operation_id = p_operation_id,
         updated_at = now()
   WHERE id = v_reservation.id;

  UPDATE public.credits_ledger
     SET type = p_final_ledger_type,
         description = v_description,
         operation = 'commit_reservation',
         source = p_source,
         operation_id = p_operation_id,
         metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('reservation_operation_id', v_reservation.operation_id)
   WHERE id = v_reservation.hold_ledger_id;

  UPDATE public.credits_wallet
     SET updated_at = now()
   WHERE id = v_wallet.id
   RETURNING balance INTO v_balance;

  v_result := jsonb_build_object(
    'ok', true,
    'status', 'committed',
    'operation_id', p_operation_id,
    'reservation_id', v_reservation.id,
    'tenant_id', v_actor.tenant_id,
    'user_id', COALESCE(v_actor.user_id, v_reservation.user_id),
    'amount', v_reservation.amount,
    'final_balance', v_balance,
    'idempotent', false
  );

  PERFORM public.credit_finish_operation(p_operation_id, 'committed', v_balance, v_result, NULL, NULL, v_reservation.id);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.atomic_release_reserved_credits(
  p_operation_id text,
  p_reservation_id uuid,
  p_description text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_source text DEFAULT 'atomic_release_reserved_credits'
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
  v_reservation public.credit_reservations;
  v_balance integer;
  v_result jsonb;
  v_description text;
BEGIN
  IF p_operation_id IS NULL OR btrim(p_operation_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'operation_id_required');
  END IF;

  IF p_reservation_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reservation_id_required');
  END IF;

  SELECT * INTO v_actor FROM public.credit_resolve_actor(p_tenant_id, p_user_id);
  v_op := public.credit_prepare_operation(
    p_operation_id, v_actor.tenant_id, v_actor.user_id, 'release_reservation', 0, 'reservation_release', p_description, p_metadata
  );

  IF v_op.status <> 'pending' THEN
    RETURN COALESCE(v_op.result, '{}'::jsonb) || jsonb_build_object('idempotent', true, 'attempt_count', v_op.attempt_count);
  END IF;

  SELECT *
    INTO v_reservation
    FROM public.credit_reservations
   WHERE id = p_reservation_id
     AND tenant_id = v_actor.tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    v_result := jsonb_build_object('ok', false, 'reason', 'reservation_not_found', 'operation_id', p_operation_id);
    PERFORM public.credit_finish_operation(p_operation_id, 'failed', NULL, v_result, 'reservation_not_found', 'reservation not found');
    RETURN v_result;
  END IF;

  IF v_reservation.status = 'released' THEN
    SELECT * INTO v_wallet
      FROM public.credits_wallet
     WHERE tenant_id = v_actor.tenant_id
     FOR UPDATE;

    v_result := jsonb_build_object(
      'ok', true,
      'status', 'released',
      'operation_id', p_operation_id,
      'reservation_id', v_reservation.id,
      'tenant_id', v_actor.tenant_id,
      'user_id', COALESCE(v_actor.user_id, v_reservation.user_id),
      'amount', v_reservation.amount,
      'final_balance', COALESCE(v_wallet.balance, 0),
      'idempotent', true
    );
    PERFORM public.credit_finish_operation(p_operation_id, 'released', COALESCE(v_wallet.balance, 0), v_result, NULL, NULL, v_reservation.id);
    RETURN v_result;
  END IF;

  IF v_reservation.status <> 'reserved' THEN
    v_result := jsonb_build_object(
      'ok', false,
      'reason', 'reservation_not_open',
      'reservation_status', v_reservation.status,
      'operation_id', p_operation_id
    );
    PERFORM public.credit_finish_operation(p_operation_id, 'failed', NULL, v_result, 'reservation_not_open', 'reservation is not reserved', v_reservation.id);
    RETURN v_result;
  END IF;

  SELECT *
    INTO v_wallet
    FROM public.credits_wallet
   WHERE tenant_id = v_actor.tenant_id
   FOR UPDATE;

  v_description := COALESCE(p_description, 'Reserva liberada');

  UPDATE public.credits_wallet
     SET balance = balance + v_reservation.amount,
         updated_at = now()
   WHERE id = v_wallet.id
   RETURNING balance INTO v_balance;

  UPDATE public.credit_reservations
     SET status = 'released',
         released_at = now(),
         released_operation_id = p_operation_id,
         updated_at = now()
   WHERE id = v_reservation.id;

  INSERT INTO public.credits_ledger (
    tenant_id, user_id, type, amount, description, created_at, operation, source, operation_id, reservation_id, metadata
  )
  VALUES (
    v_actor.tenant_id,
    COALESCE(v_actor.user_id, v_reservation.user_id),
    'reservation_release',
    v_reservation.amount,
    v_description,
    now(),
    'release_reservation',
    p_source,
    p_operation_id,
    v_reservation.id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('reservation_operation_id', v_reservation.operation_id)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'status', 'released',
    'operation_id', p_operation_id,
    'reservation_id', v_reservation.id,
    'tenant_id', v_actor.tenant_id,
    'user_id', COALESCE(v_actor.user_id, v_reservation.user_id),
    'amount', v_reservation.amount,
    'final_balance', v_balance,
    'idempotent', false
  );

  PERFORM public.credit_finish_operation(p_operation_id, 'released', v_balance, v_result, NULL, NULL, v_reservation.id);
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atomic_debit_credits(text, integer, text, uuid, uuid, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atomic_grant_credits(text, integer, text, uuid, uuid, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atomic_refund_credits(text, integer, text, uuid, uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atomic_reserve_credits(text, integer, text, uuid, uuid, jsonb, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atomic_commit_reserved_credits(text, uuid, text, uuid, uuid, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atomic_release_reserved_credits(text, uuid, text, uuid, uuid, jsonb, text) TO authenticated, service_role;

-- ============================================================================
-- 5. Views de observabilidade
-- ============================================================================

CREATE OR REPLACE VIEW public.v_credit_integrity AS
WITH wallet_base AS (
  SELECT tenant_id, balance
    FROM public.credits_wallet
),
ledger_base AS (
  SELECT tenant_id, COALESCE(SUM(amount), 0) AS ledger_balance
    FROM public.credits_ledger
   GROUP BY tenant_id
),
reservation_base AS (
  SELECT tenant_id,
         COUNT(*) FILTER (WHERE status = 'reserved') AS pending_reservations,
         COALESCE(SUM(amount) FILTER (WHERE status = 'reserved'), 0) AS reserved_amount
    FROM public.credit_reservations
   GROUP BY tenant_id
),
tenants_base AS (
  SELECT tenant_id FROM wallet_base
  UNION
  SELECT tenant_id FROM ledger_base
  UNION
  SELECT tenant_id FROM reservation_base
)
SELECT
  tb.tenant_id,
  COALESCE(wb.balance, 0) AS wallet_balance,
  COALESCE(lb.ledger_balance, 0) AS ledger_balance,
  COALESCE(wb.balance, 0) - COALESCE(lb.ledger_balance, 0) AS wallet_ledger_delta,
  COALESCE(rb.pending_reservations, 0) AS pending_reservations,
  COALESCE(rb.reserved_amount, 0) AS reserved_amount,
  CASE
    WHEN wb.tenant_id IS NULL THEN 'wallet_missing'
    WHEN COALESCE(wb.balance, 0) <> COALESCE(lb.ledger_balance, 0) THEN 'wallet_ledger_mismatch'
    WHEN COALESCE(wb.balance, 0) < 0 THEN 'wallet_negative_balance'
    ELSE 'ok'
  END AS integrity_status
FROM tenants_base tb
LEFT JOIN wallet_base wb ON wb.tenant_id = tb.tenant_id
LEFT JOIN ledger_base lb ON lb.tenant_id = tb.tenant_id
LEFT JOIN reservation_base rb ON rb.tenant_id = tb.tenant_id;

CREATE OR REPLACE VIEW public.v_credit_reservations AS
SELECT
  cr.id,
  cr.tenant_id,
  t.name AS tenant_name,
  cr.user_id,
  u.email AS user_email,
  cr.operation_id,
  cr.amount,
  cr.description,
  cr.status,
  cr.expires_at,
  cr.committed_at,
  cr.released_at,
  cr.committed_operation_id,
  cr.released_operation_id,
  cr.metadata,
  cr.created_at,
  cr.updated_at
FROM public.credit_reservations cr
LEFT JOIN public.tenants t ON t.id = cr.tenant_id
LEFT JOIN public.users u ON u.id = cr.user_id;

CREATE OR REPLACE VIEW public.v_credit_failures AS
SELECT
  co.id,
  co.operation_id,
  co.tenant_id,
  t.name AS tenant_name,
  co.user_id,
  u.email AS user_email,
  co.operation_kind,
  co.status,
  co.amount,
  co.ledger_type,
  co.description,
  co.error_code,
  co.error_message,
  co.metadata,
  co.created_at,
  co.updated_at,
  co.completed_at
FROM public.credit_operations co
LEFT JOIN public.tenants t ON t.id = co.tenant_id
LEFT JOIN public.users u ON u.id = co.user_id
WHERE co.status = 'failed'
   OR (co.status = 'released' AND co.metadata ? 'failure_kind');

CREATE OR REPLACE VIEW public.v_credit_duplicates AS
SELECT
  co.id,
  co.operation_id,
  co.tenant_id,
  t.name AS tenant_name,
  co.user_id,
  u.email AS user_email,
  co.operation_kind,
  co.status,
  co.amount,
  co.ledger_type,
  co.description,
  co.attempt_count,
  co.first_seen_at,
  co.last_seen_at,
  co.completed_at,
  co.metadata
FROM public.credit_operations co
LEFT JOIN public.tenants t ON t.id = co.tenant_id
LEFT JOIN public.users u ON u.id = co.user_id
WHERE co.attempt_count > 1;

CREATE OR REPLACE VIEW public.v_credit_refunds AS
SELECT
  co.id,
  co.operation_id,
  co.tenant_id,
  t.name AS tenant_name,
  co.user_id,
  u.email AS user_email,
  co.operation_kind,
  co.status,
  co.amount,
  co.description,
  co.final_balance,
  co.metadata,
  co.created_at,
  co.completed_at
FROM public.credit_operations co
LEFT JOIN public.tenants t ON t.id = co.tenant_id
LEFT JOIN public.users u ON u.id = co.user_id
WHERE (co.operation_kind = 'refund' AND co.status = 'succeeded')
   OR (co.operation_kind = 'release_reservation' AND co.status = 'released');

CREATE OR REPLACE VIEW public.v_ceo_credit_dashboard AS
SELECT
  (SELECT COUNT(*) FROM public.v_credit_integrity WHERE integrity_status <> 'ok') AS wallet_ledger_divergences,
  (SELECT COUNT(*) FROM public.v_credit_reservations WHERE status = 'reserved') AS pending_reservations,
  (SELECT COUNT(*) FROM public.v_credit_refunds) AS refunds_total,
  (SELECT COUNT(*) FROM public.v_credit_failures) AS failed_operations,
  (SELECT COUNT(*) FROM public.v_credit_duplicates) AS suspicious_retries;

GRANT SELECT ON public.v_credit_integrity TO authenticated, service_role;
GRANT SELECT ON public.v_credit_reservations TO authenticated, service_role;
GRANT SELECT ON public.v_credit_failures TO authenticated, service_role;
GRANT SELECT ON public.v_credit_duplicates TO authenticated, service_role;
GRANT SELECT ON public.v_credit_refunds TO authenticated, service_role;
GRANT SELECT ON public.v_ceo_credit_dashboard TO authenticated, service_role;

COMMIT;
