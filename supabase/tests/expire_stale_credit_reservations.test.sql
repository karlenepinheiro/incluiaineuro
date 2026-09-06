-- ============================================================================
-- FASE 0 / C-2 — Teste do sweeper expire_stale_credit_reservations()
-- ----------------------------------------------------------------------------
-- Executar contra um banco LOCAL (nunca produção):
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/expire_stale_credit_reservations.test.sql
--
-- Todo o teste roda dentro de uma transação e faz ROLLBACK no final:
-- nenhum dado é persistido. As asserções usam ASSERT (plpgsql.check_asserts=on).
--
-- Cobre os cenários obrigatórios 4 a 14 da auditoria.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_tenant  uuid;
  v_wallet  uuid;
  v_start_balance integer := 1000;
  v_bal     integer;
  r_expired uuid;     -- 4/5  reservada vencida (expires_at no passado)
  r_null    uuid;     -- 9    legado: expires_at NULL, criada há 40 min
  r_null_new uuid;    -- 10   expires_at NULL, criada há 5 min (NÃO expira)
  r_committed uuid;   -- 6
  r_released  uuid;   -- 7
  r_already   uuid;   -- 8
  v_res1 jsonb;
  v_res2 jsonb;
  v_ledger_type text;
  v_ledger_desc text;
BEGIN
  -- ---- setup -------------------------------------------------------------
  INSERT INTO public.tenants (name) VALUES ('FASE0 sweeper test') RETURNING id INTO v_tenant;
  INSERT INTO public.credits_wallet (tenant_id, balance, updated_at)
    VALUES (v_tenant, v_start_balance, now()) RETURNING id INTO v_wallet;

  INSERT INTO public.credit_reservations (tenant_id, operation_id, amount, status, expires_at, created_at)
    VALUES (v_tenant, 'test:expired',   10, 'reserved', now() - interval '1 minute', now() - interval '25 minutes')
    RETURNING id INTO r_expired;
  INSERT INTO public.credit_reservations (tenant_id, operation_id, amount, status, expires_at, created_at)
    VALUES (v_tenant, 'test:null-old',  20, 'reserved', NULL, now() - interval '40 minutes')
    RETURNING id INTO r_null;
  INSERT INTO public.credit_reservations (tenant_id, operation_id, amount, status, expires_at, created_at)
    VALUES (v_tenant, 'test:null-new',  30, 'reserved', NULL, now() - interval '5 minutes')
    RETURNING id INTO r_null_new;
  INSERT INTO public.credit_reservations (tenant_id, operation_id, amount, status, expires_at, committed_at, created_at)
    VALUES (v_tenant, 'test:committed', 40, 'committed', now() - interval '1 minute', now(), now() - interval '30 minutes')
    RETURNING id INTO r_committed;
  INSERT INTO public.credit_reservations (tenant_id, operation_id, amount, status, expires_at, released_at, created_at)
    VALUES (v_tenant, 'test:released',  50, 'released', now() - interval '1 minute', now(), now() - interval '30 minutes')
    RETURNING id INTO r_released;
  INSERT INTO public.credit_reservations (tenant_id, operation_id, amount, status, expires_at, created_at)
    VALUES (v_tenant, 'test:already-expired', 60, 'expired', now() - interval '1 hour', now() - interval '2 hours')
    RETURNING id INTO r_already;

  -- ---- executa o sweeper -----------------------------------------------
  v_res1 := public.expire_stale_credit_reservations();

  -- 4. reserva reservada vencida  -> status 'expired'
  ASSERT (SELECT status FROM public.credit_reservations WHERE id = r_expired) = 'expired',
    '4: reserva vencida deveria virar expired';
  -- 9. legado NULL + 40 min       -> status 'expired'
  ASSERT (SELECT status FROM public.credit_reservations WHERE id = r_null) = 'expired',
    '9: reserva NULL antiga deveria virar expired';
  -- 10. NULL recente (5 min)      -> permanece reserved
  ASSERT (SELECT status FROM public.credit_reservations WHERE id = r_null_new) = 'reserved',
    '10: reserva NULL recente NÃO pode ser expirada';
  -- 6/7/8. committed / released / expired  -> intocados
  ASSERT (SELECT status FROM public.credit_reservations WHERE id = r_committed) = 'committed', '6: committed intocada';
  ASSERT (SELECT status FROM public.credit_reservations WHERE id = r_released)  = 'released',  '7: released intocada';
  ASSERT (SELECT status FROM public.credit_reservations WHERE id = r_already)   = 'expired',   '8: expired intocada';

  -- 4. saldo devolvido: +10 (expired) +20 (null-old) = +30
  SELECT balance INTO v_bal FROM public.credits_wallet WHERE id = v_wallet;
  ASSERT v_bal = v_start_balance + 30, format('4: saldo esperado %s, obtido %s', v_start_balance + 30, v_bal);

  -- 5. ledger recebeu reservation_release com a descrição de liberação automática
  SELECT type, description INTO v_ledger_type, v_ledger_desc
    FROM public.credits_ledger
   WHERE reservation_id = r_expired
   ORDER BY created_at DESC LIMIT 1;
  ASSERT v_ledger_type = 'reservation_release', '5: ledger.type deveria ser reservation_release';
  ASSERT v_ledger_desc = 'Liberação automática de reserva técnica expirada', '5: descrição do ledger incorreta';
  ASSERT (SELECT count(*) FROM public.credits_ledger
            WHERE description ILIKE '%expirad%' AND amount < 0) = 0,
    '5: não pode haver débito rotulado como expiração';

  -- 11 + 14. rodar de novo NÃO altera saldo (idempotência)
  v_res2 := public.expire_stale_credit_reservations();
  SELECT balance INTO v_bal FROM public.credits_wallet WHERE id = v_wallet;
  ASSERT v_bal = v_start_balance + 30, format('11/14: segunda execução alterou o saldo (%s)', v_bal);
  ASSERT (v_res2 ->> 'expired_count')::int = 0, '11: segunda execução não deveria expirar nada';
  ASSERT (SELECT count(*) FROM public.credits_ledger WHERE operation_id = 'sweeper:expire:' || r_expired::text) = 1,
    '11: ledger duplicado na segunda execução';

  -- 15. créditos comerciais não foram alterados: nenhum grant/monthly_grant criado
  ASSERT (SELECT count(*) FROM public.credits_ledger
            WHERE tenant_id = v_tenant AND type IN ('monthly_grant','manual_grant','purchase_extra','courtesy')) = 0,
    '15: sweeper não pode criar créditos comerciais';

  RAISE NOTICE 'expire_stale_credit_reservations: OK (run1=%, run2=%)', v_res1, v_res2;
END $$;

-- ----------------------------------------------------------------------------
-- 12/13. Concorrência (commit x expire / release x expire) — roteiro manual:
--   Sessão A:  BEGIN; SELECT * FROM credit_reservations WHERE id = :r FOR UPDATE;  -- segura a trava
--   Sessão B:  SELECT public.expire_stale_credit_reservations();  -- SKIP LOCKED: ignora :r nesta rodada
--   Sessão A:  SELECT public.atomic_commit_reserved_credits('op:c', :r, ...); COMMIT;
--   Resultado esperado: status final = 'committed'; sweeper posterior não toca mais.
--   (inverso com atomic_release_reserved_credits -> status final = 'released'.)
--   Invariante: reserved -> committed | released | expired, nunca dois estados finais.
-- ----------------------------------------------------------------------------

ROLLBACK;
