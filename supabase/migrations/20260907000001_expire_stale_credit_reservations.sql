-- ============================================================================
-- FASE 0 — Auditoria de créditos: correção do problema C-2 / P-2
--
-- Reservas TÉCNICAS de crédito (credit_reservations.status = 'reserved') podem
-- ficar presas para sempre quando a Edge Function é interrompida ou a aba do
-- frontend é fechada antes do COMMIT/RELEASE. O crédito já foi debitado da
-- credits_wallet no momento do RESERVE e nunca volta.
--
-- Esta migration adiciona:
--   1. expire_stale_credit_reservations() — sweeper seguro, idempotente e
--      concorrente que devolve o crédito e marca a reserva como 'expired'.
--   2. v_stale_credit_reservations — view agregada (sem PII) para o painel CEO.
--   3. Colunas extras em v_ceo_credit_dashboard.
--
-- ESCOPO: SOMENTE a reserva técnica temporária de uma operação de IA.
-- Fora de escopo (intocado aqui): validade comercial de créditos, tabela de
-- concessões mensais, ordenação de consumo por origem, renovação de plano.
--
-- APLICAÇÃO: migration LOCAL. NÃO aplicar no banco remoto sem autorização.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Sweeper: expire_stale_credit_reservations()
-- ----------------------------------------------------------------------------
--
-- Processa SOMENTE credit_reservations.status = 'reserved' que estejam:
--   (a) expires_at IS NOT NULL AND expires_at <= now()                -> vencidas
--   (b) expires_at IS NULL     AND created_at <= now() - p_null_grace -> legado
--       (reservas criadas pelo bug que passava p_expires_at = NULL)
--
-- Para cada reserva vencida, dentro da MESMA transação:
--   - trava a linha (FOR UPDATE SKIP LOCKED) — se o gateway estiver no meio de um
--     commit/release, a linha está travada e o sweeper apenas a ignora nesta rodada;
--   - reconfirma status = 'reserved' sob a trava (idempotência + corrida);
--   - registra credit_operations com operation_id determinístico
--     ('sweeper:expire:<reservation_id>') via ON CONFLICT DO NOTHING —
--     se já existir, a reserva já foi tratada e nada é devolvido de novo;
--   - devolve EXATAMENTE o amount para credits_wallet.balance;
--   - marca a reserva como status = 'expired' (updated_at via trigger);
--   - grava uma linha em credits_ledger do tipo 'reservation_release'
--     (liberação técnica — NÃO é "crédito expirado" comercial).
--
-- Invariante garantida: reserved -> committed | released | expired (nunca 2 finais).
--
-- NÃO toca em reservas committed / released / expired.
-- NÃO toca em saldo por validade comercial.

CREATE OR REPLACE FUNCTION public.expire_stale_credit_reservations(
  p_limit integer DEFAULT 500,
  p_null_grace_minutes integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id            uuid;
  v_res           public.credit_reservations;
  v_wallet        public.credits_wallet;
  v_op_id         text;
  v_new_op_id     uuid;
  v_grace         interval := make_interval(mins => GREATEST(COALESCE(p_null_grace_minutes, 30), 1));
  v_scanned       integer := 0;
  v_expired_count integer := 0;
  v_expired_amount bigint := 0;
BEGIN
  FOR v_id IN
    SELECT cr.id
      FROM public.credit_reservations cr
     WHERE cr.status = 'reserved'
       AND (
         (cr.expires_at IS NOT NULL AND cr.expires_at <= now())
         OR (cr.expires_at IS NULL AND cr.created_at <= now() - v_grace)
       )
     ORDER BY cr.created_at ASC
     LIMIT GREATEST(COALESCE(p_limit, 500), 1)
  LOOP
    v_scanned := v_scanned + 1;

    -- Trava individual. Se outra transação (commit/release do gateway) já detém a
    -- linha, SKIP LOCKED faz o sweeper pular esta reserva nesta rodada.
    SELECT * INTO v_res
      FROM public.credit_reservations
     WHERE id = v_id
     FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Reconfirma o estado sob a trava (idempotência + corrida commit/release/expire).
    IF v_res.status <> 'reserved' THEN
      CONTINUE;
    END IF;

    -- Reconfirma a vencibilidade sob a trava (evita expirar reserva recente).
    IF NOT (
      (v_res.expires_at IS NOT NULL AND v_res.expires_at <= now())
      OR (v_res.expires_at IS NULL AND v_res.created_at <= now() - v_grace)
    ) THEN
      CONTINUE;
    END IF;

    v_op_id := 'sweeper:expire:' || v_res.id::text;

    -- Guarda de idempotência: um único credit_operations por reserva.
    -- Se já existe, a devolução já aconteceu -> não devolve de novo.
    INSERT INTO public.credit_operations (
      operation_id, tenant_id, user_id, operation_kind, status,
      amount, ledger_type, description, reservation_id, metadata, result
    )
    VALUES (
      v_op_id,
      v_res.tenant_id,
      v_res.user_id,
      'release_reservation',
      'released',
      v_res.amount,
      'reservation_release',
      'Liberação automática de reserva técnica expirada',
      v_res.id,
      jsonb_build_object(
        'sweeper', true,
        'reason', 'stale_technical_reservation',
        'reservation_operation_id', v_res.operation_id,
        'had_expires_at', (v_res.expires_at IS NOT NULL)
      ),
      '{}'::jsonb
    )
    ON CONFLICT (operation_id) DO NOTHING
    RETURNING id INTO v_new_op_id;

    IF v_new_op_id IS NULL THEN
      -- Já processada anteriormente. Idempotente: nada a fazer.
      CONTINUE;
    END IF;

    SELECT * INTO v_wallet
      FROM public.credits_wallet
     WHERE tenant_id = v_res.tenant_id
     FOR UPDATE;

    IF FOUND THEN
      UPDATE public.credits_wallet
         SET balance = balance + v_res.amount,
             updated_at = now()
       WHERE id = v_wallet.id;

      INSERT INTO public.credits_ledger (
        tenant_id, user_id, type, amount, description, created_at,
        operation, source, operation_id, reservation_id, metadata
      )
      VALUES (
        v_res.tenant_id,
        v_res.user_id,
        'reservation_release',
        v_res.amount,
        'Liberação automática de reserva técnica expirada',
        now(),
        'release_reservation',
        'credit_maintenance.sweeper',
        v_op_id,
        v_res.id,
        jsonb_build_object(
          'sweeper', true,
          'reason', 'stale_technical_reservation',
          'reservation_operation_id', v_res.operation_id,
          'had_expires_at', (v_res.expires_at IS NOT NULL)
        )
      );

      v_expired_amount := v_expired_amount + v_res.amount;
    ELSE
      -- Sem carteira: não há para onde devolver. Ainda assim fecha a reserva
      -- para não ficar presa como 'reserved' indefinidamente.
      UPDATE public.credit_operations
         SET status = 'failed',
             error_code = 'wallet_not_found',
             error_message = 'credits_wallet ausente ao expirar reserva',
             completed_at = now()
       WHERE operation_id = v_op_id;
    END IF;

    UPDATE public.credit_reservations
       SET status = 'expired',
           updated_at = now()
     WHERE id = v_res.id;

    UPDATE public.credit_operations
       SET completed_at = now()
     WHERE operation_id = v_op_id
       AND completed_at IS NULL;

    v_expired_count := v_expired_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'scanned', v_scanned,
    'expired_count', v_expired_count,
    'expired_amount', v_expired_amount,
    'ran_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.expire_stale_credit_reservations(integer, integer) IS
  'FASE 0 / C-2: devolve créditos de reservas técnicas (status=reserved) vencidas '
  'ou legadas (expires_at NULL há >30min) e marca a reserva como expired. '
  'Idempotente e seguro sob concorrência. Manutenção GLOBAL — service_role apenas.';

-- Somente service_role executa o sweeper (manutenção global, sem tenant do cliente).
REVOKE ALL ON FUNCTION public.expire_stale_credit_reservations(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_credit_reservations(integer, integer) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. View agregada (sem PII) para o painel CEO/Admin
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_stale_credit_reservations AS
SELECT
  COUNT(*) FILTER (WHERE status = 'reserved')                              AS open_reservations,
  COALESCE(SUM(amount) FILTER (WHERE status = 'reserved'), 0)              AS open_reservations_amount,
  COUNT(*) FILTER (WHERE status = 'reserved' AND is_stale)                 AS stale_reservations,
  COALESCE(SUM(amount) FILTER (WHERE status = 'reserved' AND is_stale), 0) AS stale_reservations_amount,
  COUNT(*) FILTER (WHERE status = 'reserved' AND expires_at IS NULL)       AS null_expiry_reservations,
  MIN(created_at) FILTER (WHERE status = 'reserved' AND is_stale)          AS oldest_stale_at
FROM (
  SELECT
    status,
    amount,
    created_at,
    expires_at,
    (
      (expires_at IS NOT NULL AND expires_at <= now())
      OR (expires_at IS NULL AND created_at <= now() - interval '30 minutes')
    ) AS is_stale
  FROM public.credit_reservations
) s;

COMMENT ON VIEW public.v_stale_credit_reservations IS
  'FASE 0 / C-2: agregados (sem PII) de reservas técnicas abertas e vencidas.';

GRANT SELECT ON public.v_stale_credit_reservations TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. v_ceo_credit_dashboard — colunas extras (append; CREATE OR REPLACE seguro)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_ceo_credit_dashboard AS
SELECT
  (SELECT COUNT(*) FROM public.v_credit_integrity WHERE integrity_status <> 'ok') AS wallet_ledger_divergences,
  (SELECT COUNT(*) FROM public.v_credit_reservations WHERE status = 'reserved') AS pending_reservations,
  (SELECT COUNT(*) FROM public.v_credit_refunds) AS refunds_total,
  (SELECT COUNT(*) FROM public.v_credit_failures) AS failed_operations,
  (SELECT COUNT(*) FROM public.v_credit_duplicates) AS suspicious_retries,
  (SELECT open_reservations_amount FROM public.v_stale_credit_reservations)  AS open_reservations_amount,
  (SELECT stale_reservations FROM public.v_stale_credit_reservations)        AS stale_reservations,
  (SELECT stale_reservations_amount FROM public.v_stale_credit_reservations) AS stale_reservations_amount;

GRANT SELECT ON public.v_ceo_credit_dashboard TO authenticated, service_role;

COMMIT;

-- ============================================================================
-- AGENDAMENTO (NÃO configurar agora)
-- ----------------------------------------------------------------------------
-- pg_cron NÃO está instalado neste projeto e NÃO deve ser habilitado agora.
-- Quando for agendar, a ordem de preferência é:
--   1. Supabase Scheduled Edge Function chamando a Edge Function
--      supabase/functions/credit-maintenance (service_role), a cada 5-10 min.
--   2. pg_cron, SE for habilitado depois:
--        select cron.schedule('expire-stale-credit-reservations', '*/10 * * * *',
--          $$ select public.expire_stale_credit_reservations(); $$);
-- ============================================================================
