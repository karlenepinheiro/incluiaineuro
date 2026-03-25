-- ============================================================
-- schema_asaas.sql
-- Colunas adicionais para integração com Asaas
-- Execute no Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Colunas extras na tabela subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider_customer_id  text,
  ADD COLUMN IF NOT EXISTS provider_payment_link text,
  ADD COLUMN IF NOT EXISTS provider_update_payment_link text,
  ADD COLUMN IF NOT EXISTS last_payment_status   text,
  ADD COLUMN IF NOT EXISTS next_due_date         date;

-- 2. Índice para busca por provider_customer_id
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_customer
  ON public.subscriptions (provider_customer_id)
  WHERE provider_customer_id IS NOT NULL;

-- 3. Stored procedure: pagamento aprovado
--    Chamada pelo webhook PAYMENT_CONFIRMED / PAYMENT_RECEIVED
CREATE OR REPLACE FUNCTION public.process_payment_approved(
  p_tenant_id                text,
  p_plan_code                text,
  p_credits                  int,
  p_period_end               timestamptz,
  p_provider_subscription_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_id uuid;
BEGIN
  -- Resolve plan_id pelo código (FREE/PRO/MASTER)
  SELECT id INTO v_plan_id
    FROM public.plans
   WHERE UPPER(name) = UPPER(p_plan_code)
   LIMIT 1;

  -- Atualiza subscription
  UPDATE public.subscriptions
     SET status               = 'ACTIVE',
         plan_id              = COALESCE(v_plan_id, plan_id),
         current_period_end   = p_period_end,
         last_payment_status  = 'paid',
         provider_sub_id      = COALESCE(p_provider_subscription_id, provider_sub_id),
         updated_at           = now()
   WHERE tenant_id = p_tenant_id::uuid;

  -- Atualiza tenant: plano + créditos
  UPDATE public.tenants
     SET plan_id              = COALESCE(v_plan_id, plan_id),
         creditos_ia_restantes = COALESCE(creditos_ia_restantes, 0) + p_credits,
         updated_at           = now()
   WHERE id = p_tenant_id::uuid;
END;
$$;

-- 4. Stored procedure: pagamento em atraso
CREATE OR REPLACE FUNCTION public.process_payment_overdue(
  p_tenant_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.subscriptions
     SET status             = 'OVERDUE',
         last_payment_status = 'overdue',
         updated_at          = now()
   WHERE tenant_id = p_tenant_id::uuid;
END;
$$;

-- 5. Stored procedure: assinatura cancelada
CREATE OR REPLACE FUNCTION public.process_subscription_canceled(
  p_tenant_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_free_plan_id uuid;
BEGIN
  SELECT id INTO v_free_plan_id
    FROM public.plans
   WHERE UPPER(name) = 'FREE'
   LIMIT 1;

  UPDATE public.subscriptions
     SET status    = 'CANCELED',
         plan_id   = COALESCE(v_free_plan_id, plan_id),
         updated_at = now()
   WHERE tenant_id = p_tenant_id::uuid;

  -- Rebaixa tenant para FREE
  UPDATE public.tenants
     SET plan_id    = COALESCE(v_free_plan_id, plan_id),
         updated_at = now()
   WHERE id = p_tenant_id::uuid;
END;
$$;
