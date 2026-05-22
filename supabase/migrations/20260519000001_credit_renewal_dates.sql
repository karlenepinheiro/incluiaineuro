-- Auditoria de billing/UX financeira
-- Objetivo: separar explicitamente renovação de assinatura e renovação de créditos.
-- Situação atual:
--   subscriptions.current_period_end / subscriptions.next_due_date já representam ciclo de plano/cobrança.
--   credits_wallet só expõe last_reset_at, o que obriga o frontend a derivar a próxima renovação.
--
-- Proposta:
--   1. Registrar o último grant mensal explicitamente.
--   2. Registrar a próxima renovação dos créditos explicitamente.
--   3. Permitir que dashboard/financeiro usem uma data canônica, sem cálculo visual.

ALTER TABLE public.credits_wallet
  ADD COLUMN IF NOT EXISTS last_credit_grant_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_credit_grant_at TIMESTAMPTZ;

COMMENT ON COLUMN public.credits_wallet.last_credit_grant_at IS
  'Data/hora do último grant mensal de créditos do plano.';

COMMENT ON COLUMN public.credits_wallet.next_credit_grant_at IS
  'Próxima data/hora prevista para renovação mensal dos créditos do plano.';

UPDATE public.credits_wallet
SET
  last_credit_grant_at = COALESCE(last_credit_grant_at, last_reset_at),
  next_credit_grant_at = COALESCE(
    next_credit_grant_at,
    CASE
      WHEN last_reset_at IS NOT NULL THEN last_reset_at + INTERVAL '1 month'
      ELSE NULL
    END
  );

CREATE INDEX IF NOT EXISTS idx_credits_wallet_next_credit_grant_at
  ON public.credits_wallet (next_credit_grant_at);
