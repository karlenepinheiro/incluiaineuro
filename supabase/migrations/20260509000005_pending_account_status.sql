-- ============================================================
-- 20260509000005_pending_account_status.sql
--
-- Adiciona coluna activation_status (GERADA) em kiwify_purchases.
--
-- PROBLEMA: O sistema dependia de (tenant_id IS NULL AND activated_at IS NULL)
-- para identificar "compras aguardando criação de conta", tornando a lógica
-- frágil e difícil de consultar no CEO dashboard.
--
-- SOLUÇÃO: Coluna GENERATED ALWAYS AS STORED que derivia automaticamente
-- o status semântico a partir dos campos existentes. Sem risco de
-- inconsistência — o banco garante a atualização automática.
--
-- Estados possíveis:
--   PENDING_ACCOUNT    — pagou mas ainda não criou conta no sistema
--   PENDING_ACTIVATION — tem conta, mas o webhook falhou ao ativar
--   ACTIVATED          — plano ativado com sucesso
--   NULL               — compra cancelada/pendente (não aprovada)
-- ============================================================

ALTER TABLE public.kiwify_purchases
  ADD COLUMN IF NOT EXISTS activation_status text
  GENERATED ALWAYS AS (
    CASE
      WHEN activated_at IS NOT NULL
        THEN 'ACTIVATED'
      WHEN status = 'APPROVED' AND tenant_id IS NULL AND activated_at IS NULL
        THEN 'PENDING_ACCOUNT'
      WHEN status = 'APPROVED' AND tenant_id IS NOT NULL AND activated_at IS NULL
        THEN 'PENDING_ACTIVATION'
      ELSE NULL
    END
  ) STORED;

COMMENT ON COLUMN public.kiwify_purchases.activation_status IS
  'Gerado automaticamente a partir de status/tenant_id/activated_at. '
  'PENDING_ACCOUNT = pagou sem conta; PENDING_ACTIVATION = webhook falhou; ACTIVATED = plano ativo.';

-- Índice para consultas CEO (listar compras pendentes de conta)
CREATE INDEX IF NOT EXISTS idx_kiwify_purchases_activation_status
  ON public.kiwify_purchases (activation_status)
  WHERE activation_status IS NOT NULL;
