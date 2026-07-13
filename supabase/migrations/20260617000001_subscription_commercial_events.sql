-- ============================================================
-- 20260617000001_subscription_commercial_events.sql
--
-- Cria tabela subscription_commercial_events para registrar
-- o histórico comercial de cada assinante: upgrades, correções
-- manuais, pagamentos de diferença, ativações Kiwify, etc.
--
-- Motivação: o Dashboard CEO mostrava apenas o plano atual, sem
-- contexto de como o cliente chegou até aquele plano. Francisca,
-- por exemplo, comprou PRO e fez upgrade para MASTER — sem esta
-- tabela o sistema interpretava como erro.
--
-- NÃO altera tabelas existentes.
-- NÃO concede créditos.
-- NÃO altera saldo.
-- ============================================================

-- ── Tipos de evento ──────────────────────────────────────────────────────────
COMMENT ON SCHEMA public IS 'subscription_commercial_events.event_type values:
  INITIAL_PURCHASE  — primeira ativação do plano
  UPGRADE_PLAN      — upgrade de plano (ex: PRO → MASTER)
  DOWNGRADE_PLAN    — downgrade de plano
  CYCLE_CORRECTION  — correção de ciclo (mensal → anual ou vice-versa)
  MANUAL_ADJUSTMENT — ajuste manual realizado por admin
  PAYMENT_DIFFERENCE — pagamento complementar de diferença de plano
  KIWIFY_ACTIVATION — ativação automática via webhook Kiwify
  ADMIN_FIX         — correção administrativa sem pagamento
  COURTESY_UPGRADE  — upgrade por cortesia comercial';

-- ── Tabela ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscription_commercial_events (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid         NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id   uuid         REFERENCES public.subscriptions(id) ON DELETE SET NULL,

  event_type        text         NOT NULL,
  -- INITIAL_PURCHASE | UPGRADE_PLAN | DOWNGRADE_PLAN | CYCLE_CORRECTION |
  -- MANUAL_ADJUSTMENT | PAYMENT_DIFFERENCE | KIWIFY_ACTIVATION | ADMIN_FIX | COURTESY_UPGRADE

  from_plan_code    text,        -- plano anterior (NULL para INITIAL_PURCHASE)
  to_plan_code      text,        -- plano novo
  from_billing_cycle text,       -- ciclo anterior
  to_billing_cycle  text,        -- ciclo novo

  amount_paid_brl   numeric(10,2),        -- valor pago neste evento (diferença ou mensalidade)
  source            text NOT NULL DEFAULT 'manual_ceo',
  -- kiwify_webhook | manual_ceo | admin_fix | reconciliation | migration

  kiwify_order_id   text,        -- order_id da Kiwify se aplicável
  kiwify_product_key text,       -- product_key Kiwify se aplicável

  notes             text,        -- observações livres
  performed_by      uuid         REFERENCES public.users(id) ON DELETE SET NULL,
  performed_by_email text,

  event_date        timestamptz  NOT NULL DEFAULT now(),
  -- data real do evento comercial (pode diferir de created_at em registros retroativos)

  created_at        timestamptz  NOT NULL DEFAULT now()
);

-- ── Índices ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS sce_tenant_idx
  ON public.subscription_commercial_events (tenant_id, event_date DESC);

CREATE INDEX IF NOT EXISTS sce_subscription_idx
  ON public.subscription_commercial_events (subscription_id, event_date DESC)
  WHERE subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sce_event_type_idx
  ON public.subscription_commercial_events (event_type, event_date DESC);

CREATE INDEX IF NOT EXISTS sce_source_idx
  ON public.subscription_commercial_events (source, event_date DESC);

-- ── Constraint de tipo de evento ──────────────────────────────────────────────
ALTER TABLE public.subscription_commercial_events
  ADD CONSTRAINT sce_event_type_check
  CHECK (event_type IN (
    'INITIAL_PURCHASE',
    'UPGRADE_PLAN',
    'DOWNGRADE_PLAN',
    'CYCLE_CORRECTION',
    'MANUAL_ADJUSTMENT',
    'PAYMENT_DIFFERENCE',
    'KIWIFY_ACTIVATION',
    'ADMIN_FIX',
    'COURTESY_UPGRADE'
  ));

ALTER TABLE public.subscription_commercial_events
  ADD CONSTRAINT sce_source_check
  CHECK (source IN (
    'kiwify_webhook',
    'manual_ceo',
    'admin_fix',
    'reconciliation',
    'migration'
  ));

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.subscription_commercial_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.subscription_commercial_events FROM PUBLIC;
REVOKE ALL ON public.subscription_commercial_events FROM anon;
REVOKE ALL ON public.subscription_commercial_events FROM authenticated;

-- Apenas service_role e super_admin leem
GRANT SELECT, INSERT, UPDATE ON public.subscription_commercial_events TO service_role;

CREATE POLICY "sce_select_super_admin"
  ON public.subscription_commercial_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_super_admin = true
    )
  );

CREATE POLICY "sce_insert_super_admin"
  ON public.subscription_commercial_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_super_admin = true
    )
  );

-- ── Comentários ───────────────────────────────────────────────────────────────
COMMENT ON TABLE public.subscription_commercial_events IS
  'Histórico comercial de cada assinante: upgrades, correções de ciclo, pagamentos complementares, etc. '
  'Permite que o Dashboard CEO mostre o contexto por trás de divergências aparentes entre a compra original e o plano atual.';

COMMENT ON COLUMN public.subscription_commercial_events.event_type IS
  'Tipo de evento comercial. Ver tipos válidos na constraint sce_event_type_check.';
COMMENT ON COLUMN public.subscription_commercial_events.source IS
  'Origem do evento: kiwify_webhook (automático), manual_ceo (CEO), admin_fix (correção), reconciliation, migration.';
COMMENT ON COLUMN public.subscription_commercial_events.event_date IS
  'Data real do evento — pode ser retroativa para registros históricos importados manualmente.';
COMMENT ON COLUMN public.subscription_commercial_events.notes IS
  'Observações livres para auditoria. Ex: "Cliente pagou diferença via PIX em 10/05/2026".';
