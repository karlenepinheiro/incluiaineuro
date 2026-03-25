-- =============================================================================
-- schema_asaas_etapa1.sql
-- Integração Asaas — Etapa 1: estrutura de dados e stored procedures
--
-- Execute APÓS: schema.sql + schema_additions.sql + schema_v3.sql
--
-- O que este arquivo faz:
--   1. Adiciona colunas Asaas na tabela subscriptions (idempotente via IF NOT EXISTS)
--   2. Cria tabela billing_events (log de webhooks)
--   3. Stored procedures chamadas pelo asaasService.ts via supabase.rpc()
--   4. RLS para billing_events
--   5. Índices de performance
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. COLUNAS ASAAS EM subscriptions
--    Todas idempotentes (IF NOT EXISTS) — seguro reexecutar
-- ---------------------------------------------------------------------------

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS provider_customer_id          TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_link         TEXT,
  ADD COLUMN IF NOT EXISTS provider_update_payment_link  TEXT,
  ADD COLUMN IF NOT EXISTS last_payment_status           TEXT,
  ADD COLUMN IF NOT EXISTS next_due_date                 DATE;

-- Índice para lookup por provider_customer_id (webhook)
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_customer
  ON subscriptions (provider_customer_id)
  WHERE provider_customer_id IS NOT NULL;

-- Índice para lookup por provider_sub_id (webhook)
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_sub
  ON subscriptions (provider_sub_id)
  WHERE provider_sub_id IS NOT NULL;

COMMENT ON COLUMN subscriptions.provider_customer_id
  IS 'ID do cliente no Asaas (cus_xxxxx)';
COMMENT ON COLUMN subscriptions.provider_payment_link
  IS 'Link de pagamento/boleto/PIX do Asaas';
COMMENT ON COLUMN subscriptions.provider_update_payment_link
  IS 'Link para atualização de cartão no Asaas';
COMMENT ON COLUMN subscriptions.last_payment_status
  IS 'Último status de pagamento: paid | overdue | refunded | deleted';
COMMENT ON COLUMN subscriptions.next_due_date
  IS 'Próxima data de vencimento reportada pelo Asaas';


-- ---------------------------------------------------------------------------
-- 2. TABELA billing_events
--    Log imutável de todos os webhooks recebidos do Asaas.
--    Garante idempotência (provider_event_id UNIQUE).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS billing_events (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação do evento
  provider                 TEXT        NOT NULL DEFAULT 'asaas',
  event_type               TEXT        NOT NULL,           -- ex: PAYMENT_CONFIRMED
  provider_event_id        TEXT        UNIQUE,             -- ID do evento no Asaas
  provider_payment_id      TEXT,                           -- ID do pagamento
  provider_subscription_id TEXT,                           -- ID da assinatura

  -- Payload bruto
  payload                  JSONB       NOT NULL DEFAULT '{}',

  -- Processamento
  processed                BOOLEAN     NOT NULL DEFAULT FALSE,
  processed_at             TIMESTAMPTZ,
  success                  BOOLEAN,
  error_message            TEXT,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para consultas no AdminDashboard
CREATE INDEX IF NOT EXISTS idx_billing_events_provider_sub
  ON billing_events (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_events_event_type
  ON billing_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_events_processed
  ON billing_events (processed, created_at DESC);

COMMENT ON TABLE billing_events
  IS 'Log imutável de webhooks recebidos do gateway de pagamentos (Asaas). Não deletar registros.';


-- ---------------------------------------------------------------------------
-- 3. RLS — billing_events
--    Somente service_role pode inserir/atualizar (via Edge Function).
--    Admins da plataforma podem ler via painel CEO.
-- ---------------------------------------------------------------------------

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

-- Service role ignora RLS (Edge Function usa service key)
-- Admins autenticados podem ler
CREATE POLICY "billing_events_admin_read"
  ON billing_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'super_admin')
    )
  );

-- Nenhum usuário comum pode ler/escrever diretamente
-- (inserts vêm exclusivamente da Edge Function com service_role key)


-- ---------------------------------------------------------------------------
-- 4. STORED PROCEDURE: process_payment_approved
--    Chamada por asaasService.ts quando pagamento é confirmado.
--    Ativa/renova a assinatura, adiciona créditos ao tenant.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION process_payment_approved(
  p_tenant_id                TEXT,
  p_plan_code                TEXT,
  p_credits                  INTEGER,
  p_period_end               TIMESTAMPTZ,
  p_provider_subscription_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_id UUID;
BEGIN
  -- 1. Resolve plan_id pelo código (nome do plano)
  SELECT id INTO v_plan_id
  FROM plans
  WHERE UPPER(name) = UPPER(p_plan_code)
  LIMIT 1;

  -- 2. Atualiza subscriptions
  UPDATE subscriptions
  SET
    status               = 'ACTIVE',
    last_payment_status  = 'paid',
    current_period_end   = p_period_end,
    plan_id              = COALESCE(v_plan_id, plan_id),
    provider_sub_id      = COALESCE(p_provider_subscription_id, provider_sub_id),
    updated_at           = NOW()
  WHERE tenant_id = p_tenant_id::UUID;

  -- 3. Atualiza tenants.plan_id
  IF v_plan_id IS NOT NULL THEN
    UPDATE tenants
    SET plan_id = v_plan_id
    WHERE id = p_tenant_id::UUID;
  END IF;

  -- 4. Adiciona créditos de IA aos usuários do tenant (renova o saldo)
  --    Estratégia: soma ao saldo atual (créditos avulsos se acumulam)
  --    Para renovação mensal usa-se a procedure separada reset_monthly_credits
  IF p_credits > 0 THEN
    UPDATE users
    SET ai_credits = COALESCE(ai_credits, 0) + p_credits
    WHERE tenant_id = p_tenant_id::UUID;
  END IF;

END;
$$;

COMMENT ON FUNCTION process_payment_approved
  IS 'Ativa assinatura e adiciona créditos IA ao receber pagamento aprovado do Asaas';


-- ---------------------------------------------------------------------------
-- 5. STORED PROCEDURE: process_payment_overdue
--    Chamada quando pagamento está atrasado.
--    Marca status OVERDUE (mantém acesso por período de graça).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION process_payment_overdue(
  p_tenant_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Marca assinatura como inadimplente
  UPDATE subscriptions
  SET
    status              = 'OVERDUE',
    last_payment_status = 'overdue',
    updated_at          = NOW()
  WHERE tenant_id = p_tenant_id::UUID;

  -- Nota: não remove créditos imediatamente.
  -- O sistema continua funcional por um período de graça.
  -- Use um cron job para revogar acesso após N dias OVERDUE se necessário.
END;
$$;

COMMENT ON FUNCTION process_payment_overdue
  IS 'Marca assinatura como inadimplente ao receber evento de pagamento atrasado do Asaas';


-- ---------------------------------------------------------------------------
-- 6. STORED PROCEDURE: process_subscription_canceled
--    Chamada quando assinatura é cancelada.
--    Faz downgrade para FREE.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION process_subscription_canceled(
  p_tenant_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_free_plan_id UUID;
BEGIN
  -- Resolve plan_id do plano FREE
  SELECT id INTO v_free_plan_id
  FROM plans
  WHERE UPPER(name) = 'FREE'
  LIMIT 1;

  -- Cancela assinatura
  UPDATE subscriptions
  SET
    status     = 'CANCELED',
    updated_at = NOW()
  WHERE tenant_id = p_tenant_id::UUID;

  -- Downgrade do tenant para FREE
  IF v_free_plan_id IS NOT NULL THEN
    UPDATE tenants
    SET plan_id = v_free_plan_id
    WHERE id = p_tenant_id::UUID;
  END IF;

  -- Zera créditos IA (mantém apenas saldo de pacotes avulsos se desejar)
  -- Comentado: descomente se quiser zerar ao cancelar
  -- UPDATE users SET ai_credits = 0 WHERE tenant_id = p_tenant_id::UUID;
END;
$$;

COMMENT ON FUNCTION process_subscription_canceled
  IS 'Cancela assinatura e faz downgrade para FREE ao receber cancelamento do Asaas';


-- ---------------------------------------------------------------------------
-- 7. STORED PROCEDURE: reset_monthly_credits  (auxiliar — opcional)
--    Para uso futuro: zera créditos mensais e repõe conforme plano.
--    Pode ser chamada por um cron job ou no pagamento recorrente.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reset_monthly_credits(
  p_tenant_id TEXT,
  p_credits   INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Repõe os créditos mensais (substitui, não acumula — para assinatura)
  -- Créditos avulsos ficam em coluna separada se necessário no futuro
  UPDATE users
  SET
    ai_credits = p_credits,
    updated_at = NOW()
  WHERE tenant_id = p_tenant_id::UUID;
END;
$$;

COMMENT ON FUNCTION reset_monthly_credits
  IS 'Redefine o saldo de créditos mensais do tenant (uso em renovação de assinatura)';


-- ---------------------------------------------------------------------------
-- 8. VIEW billing_overview  (para o AdminDashboard)
--    Agrega dados de billing_events com subscriptions para o painel CEO.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW billing_overview AS
SELECT
  s.tenant_id,
  s.status                      AS subscription_status,
  s.last_payment_status,
  s.next_due_date,
  s.provider,
  s.provider_sub_id,
  s.current_period_end,
  p.name                        AS plan_name,
  p.price_brl                   AS plan_price,
  COUNT(be.id)                  AS total_webhook_events,
  COUNT(be.id) FILTER (WHERE be.success = TRUE)  AS events_ok,
  COUNT(be.id) FILTER (WHERE be.success = FALSE) AS events_failed,
  MAX(be.created_at)            AS last_event_at
FROM subscriptions s
LEFT JOIN plans p      ON p.id = s.plan_id
LEFT JOIN billing_events be ON be.provider_subscription_id = s.provider_sub_id
GROUP BY
  s.tenant_id, s.status, s.last_payment_status, s.next_due_date,
  s.provider, s.provider_sub_id, s.current_period_end,
  p.name, p.price_brl;

COMMENT ON VIEW billing_overview
  IS 'Visão consolidada de assinaturas + eventos de pagamento para o painel CEO';


-- ---------------------------------------------------------------------------
-- FIM — schema_asaas_etapa1.sql
-- =============================================================================
