-- ============================================================
-- 20260616000004_admin_cycle_management.sql
--
-- SPRINT CEO — Gestão de ciclo mensal/anual de assinaturas
--
-- Objetivo:
--   1. Atualizar v_ceo_subscribers para expor campos de período
--      (subscription_id, current_period_start, current_period_end)
--      e dados de crédito (last_credit_grant_at, next_credit_grant_at)
--      necessários para o painel de gestão de ciclo.
--   2. Criar tabela admin_audit_logs para registro de ações CEO.
--   3. Criar RPC admin_update_subscription_cycle — ajuste manual seguro.
--   4. Criar RPC admin_infer_subscription_cycle — inferência automática (somente leitura).
--   5. Criar RPC grant_missing_monthly_credits_for_subscription — dry-run por assinante.
--
-- Segurança:
--   - Todas as RPCs de escrita verificam is_super_admin = true internamente.
--   - SECURITY DEFINER garante acesso às tabelas protegidas por RLS.
--   - Audit log registra: quem alterou, antes, depois, motivo, data.
--
-- NÃO ALTERA:
--   - credit_batches / FIFO / validade 60 dias
--   - Saldos automáticos ou regra de reset
--   - PDF / documentos / sidebar / UX geral
-- ============================================================


-- ============================================================
-- 1. Recriar v_ceo_subscribers com campos de período e crédito
-- ============================================================

DROP VIEW IF EXISTS public.v_ceo_subscribers CASCADE;

CREATE OR REPLACE VIEW public.v_ceo_subscribers AS
WITH findings_rollup AS (
  SELECT
    f.tenant_id,
    COUNT(*)::int AS finding_count,
    COUNT(*) FILTER (WHERE f.severity = 'critical')::int AS critical_finding_count,
    COUNT(*) FILTER (WHERE f.severity = 'warn')::int AS warn_finding_count,
    BOOL_OR(f.finding_group = 'owner') AS has_owner_issue,
    BOOL_OR(f.finding_group = 'wallet') AS has_wallet_issue,
    BOOL_OR(f.finding_group = 'subscription') AS has_subscription_issue,
    BOOL_OR(f.finding_group = 'plan') AS has_plan_issue,
    BOOL_OR(f.finding_group = 'financial') AS has_financial_issue,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'kind',      lower(f.finding_code),
          'code',      f.finding_code,
          'group',     f.finding_group,
          'label',     f.finding_title,
          'severity',  f.severity,
          'color',
          CASE
            WHEN f.severity = 'critical' THEN 'bg-red-100 text-red-700 border border-red-200'
            WHEN f.severity = 'warn'     THEN 'bg-yellow-100 text-yellow-700 border border-yellow-200'
            ELSE                              'bg-blue-100 text-blue-700 border border-blue-200'
          END
        )
        ORDER BY f.sort_order
      ) FILTER (WHERE f.finding_group <> 'financial'),
      '[]'::jsonb
    ) AS integrity_flags,
    (
      SELECT jsonb_build_object(
        'kind',     lower(f2.finding_code),
        'code',     f2.finding_code,
        'label',    f2.finding_title,
        'severity', f2.severity
      )
      FROM public.v_ceo_integrity_findings f2
      WHERE f2.tenant_id = f.tenant_id
        AND f2.finding_group IN ('plan', 'subscription', 'wallet')
      ORDER BY f2.sort_order
      LIMIT 1
    ) AS primary_divergence
  FROM public.v_ceo_integrity_findings f
  WHERE f.tenant_id IS NOT NULL
  GROUP BY f.tenant_id
)
SELECT
  h.tenant_id,
  h.tenant_name,
  h.user_name,
  h.user_email,
  h.user_phone,
  h.user_cpf,
  h.plan_code,
  h.billing_cycle,
  h.subscription_status,
  h.next_due_date,
  h.billing_provider,
  h.provider_sub_id,
  h.activated_at,
  h.credits_remaining,
  h.credits_limit,
  h.credits_used_cycle,
  h.students_active,
  h.student_limit,
  h.flag_low_credits,
  h.flag_expiring_7d,
  h.tenant_created_at,
  -- Campos de período (NOVOS — necessários para gestão de ciclo)
  h.subscription_id,
  h.current_period_start,
  h.current_period_end,
  -- Datas de crédito derivadas do ledger (credits_wallet não possui essas colunas)
  (
    SELECT MAX(cl.created_at)
    FROM public.credits_ledger cl
    WHERE cl.tenant_id = h.tenant_id
      AND cl.type = 'monthly_grant'
  ) AS last_credit_grant_at,
  (
    SELECT MAX(cl.created_at) + interval '1 month'
    FROM public.credits_ledger cl
    WHERE cl.tenant_id = h.tenant_id
      AND cl.type = 'monthly_grant'
  ) AS next_credit_grant_at,
  -- Campos de compra Kiwify
  h.purchase_id,
  h.purchase_status,
  h.purchase_email,
  h.purchase_plan_code,
  h.purchase_billing_cycle,
  h.purchase_product_key,
  h.purchase_order_id,
  h.purchase_price_brl,
  h.purchase_paid_at,
  h.purchase_activated_at,
  h.purchase_activation_status,
  -- Flags de integridade
  h.owner_missing,
  h.subscription_missing,
  h.wallet_mismatch,
  h.subscription_mismatch,
  h.plan_mismatch,
  h.inactive_subscriber,
  h.financial_inconsistency,
  h.paid_but_free,
  -- Findings aggregados
  COALESCE(fr.finding_count,           0) AS finding_count,
  COALESCE(fr.critical_finding_count,  0) AS critical_finding_count,
  COALESCE(fr.warn_finding_count,      0) AS warn_finding_count,
  COALESCE(fr.has_owner_issue,      false) AS has_owner_issue,
  COALESCE(fr.has_wallet_issue,     false) AS has_wallet_issue,
  COALESCE(fr.has_subscription_issue, false) AS has_subscription_issue,
  COALESCE(fr.has_plan_issue,       false) AS has_plan_issue,
  COALESCE(fr.has_financial_issue,  false) AS has_financial_issue,
  COALESCE(fr.integrity_flags, '[]'::jsonb) AS integrity_flags,
  fr.primary_divergence AS divergence,
  (COALESCE(fr.finding_count, 0) > 0) AS has_any_finding,
  CASE
    WHEN COALESCE(fr.critical_finding_count, 0) > 0 THEN 'critical'
    WHEN COALESCE(fr.warn_finding_count,     0) > 0
      OR h.flag_low_credits
      OR h.flag_expiring_7d              THEN 'warn'
    ELSE 'ok'
  END AS health_severity,
  CASE
    WHEN COALESCE(fr.critical_finding_count, 0) > 0 THEN 30
    WHEN COALESCE(fr.warn_finding_count,     0) > 0 THEN 20
    WHEN h.flag_low_credits OR h.flag_expiring_7d    THEN 10
    ELSE 0
  END AS health_priority
FROM public.v_ceo_subscriber_health h
LEFT JOIN findings_rollup fr ON fr.tenant_id = h.tenant_id
WHERE h.tenant_is_active = true;

GRANT SELECT ON public.v_ceo_subscribers TO authenticated, service_role;


-- ============================================================
-- 2. Tabela admin_audit_logs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action          text NOT NULL,
  resource_type   text NOT NULL,
  resource_id     text,
  tenant_id       uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  performed_by    uuid,
  performed_by_email text,
  before_data     jsonb,
  after_data      jsonb,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_tenant
  ON public.admin_audit_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action
  ON public.admin_audit_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_performed_by
  ON public.admin_audit_logs (performed_by, created_at DESC);

-- ── Segurança: tabela fechada por padrão ────────────────────────────────────
-- service_role bypassa RLS (comportamento padrão Supabase) e é o role
-- sob o qual as RPCs SECURITY DEFINER abaixo executam seus INSERTs.
-- Nenhum acesso direto para anon ou authenticated sem policy explícita.

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Revoga qualquer privilégio herdado de PUBLIC, anon e authenticated
REVOKE ALL ON public.admin_audit_logs FROM PUBLIC;
REVOKE ALL ON public.admin_audit_logs FROM anon;
REVOKE ALL ON public.admin_audit_logs FROM authenticated;

-- service_role: SELECT + INSERT (RPCs SECURITY DEFINER usam este role)
GRANT SELECT, INSERT ON public.admin_audit_logs TO service_role;

-- Policy: somente super_admins podem SELECT diretamente (leitura futura via UI CEO)
-- INSERT/UPDATE/DELETE para authenticated não são concedidos — toda escrita
-- passa pelas RPCs admin_update_subscription_cycle e
-- grant_missing_monthly_credits_for_subscription (SECURITY DEFINER).
CREATE POLICY "admin_audit_logs_select_super_admin"
  ON public.admin_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.is_super_admin = true
    )
  );


-- ============================================================
-- 3. RPC: admin_update_subscription_cycle
--    Ajuste manual seguro de billing_cycle e período.
--    Verifica is_super_admin internamente.
--    Não altera créditos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_update_subscription_cycle(
  p_subscription_id     uuid,
  p_billing_cycle       text,
  p_current_period_start timestamptz DEFAULT NULL,
  p_apply_period_end    boolean DEFAULT true,
  p_reason              text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_email   text;
  v_is_super_admin boolean := false;
  v_sub            record;
  v_new_period_end timestamptz;
  v_old_cycle      text;
  v_old_period_end timestamptz;
  v_period_start   timestamptz;
BEGIN
  -- ── Verificar permissão ───────────────────────────────────────────────────
  SELECT
    u.is_super_admin,
    u.email
  INTO v_is_super_admin, v_caller_email
  FROM public.users u
  WHERE u.id = auth.uid();

  IF NOT v_is_super_admin THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Permissão negada: requer super_admin'
    );
  END IF;

  -- ── Validar billing_cycle ─────────────────────────────────────────────────
  IF p_billing_cycle NOT IN ('monthly', 'annual') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Valor inválido para billing_cycle. Use ''monthly'' ou ''annual'''
    );
  END IF;

  -- ── Buscar subscription ───────────────────────────────────────────────────
  SELECT
    s.id,
    s.tenant_id,
    s.billing_cycle            AS old_billing_cycle,
    s.current_period_start     AS old_period_start,
    s.current_period_end       AS old_period_end
  INTO v_sub
  FROM public.subscriptions s
  WHERE s.id = p_subscription_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Assinatura não encontrada: ' || p_subscription_id::text
    );
  END IF;

  v_old_cycle      := v_sub.old_billing_cycle;
  v_old_period_end := v_sub.old_period_end;

  -- ── Calcular novo período ─────────────────────────────────────────────────
  v_period_start := COALESCE(
    p_current_period_start,
    v_sub.old_period_start,
    now()
  );

  IF p_apply_period_end THEN
    v_new_period_end := CASE p_billing_cycle
      WHEN 'monthly' THEN v_period_start + INTERVAL '1 month'
      WHEN 'annual'  THEN v_period_start + INTERVAL '12 months'
    END;
  ELSE
    v_new_period_end := v_sub.old_period_end;
  END IF;

  -- ── Atualizar subscriptions ───────────────────────────────────────────────
  UPDATE public.subscriptions
  SET
    billing_cycle        = p_billing_cycle,
    current_period_start = v_period_start,
    current_period_end   = v_new_period_end,
    updated_at           = now()
  WHERE id = p_subscription_id;

  -- ── Registrar auditoria ───────────────────────────────────────────────────
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
    'UPDATE_SUBSCRIPTION_CYCLE',
    'subscription',
    p_subscription_id::text,
    v_sub.tenant_id,
    auth.uid(),
    v_caller_email,
    jsonb_build_object(
      'billing_cycle',        v_old_cycle,
      'current_period_start', v_sub.old_period_start,
      'current_period_end',   v_old_period_end
    ),
    jsonb_build_object(
      'billing_cycle',        p_billing_cycle,
      'current_period_start', v_period_start,
      'current_period_end',   v_new_period_end,
      'apply_period_end',     p_apply_period_end
    ),
    p_reason
  );

  RETURN jsonb_build_object(
    'success',             true,
    'subscription_id',     p_subscription_id,
    'tenant_id',           v_sub.tenant_id,
    'old_billing_cycle',   v_old_cycle,
    'new_billing_cycle',   p_billing_cycle,
    'old_period_end',      v_old_period_end,
    'new_period_end',      v_new_period_end,
    'period_start_used',   v_period_start
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error',   'Erro interno: ' || SQLERRM
  );
END;
$$;

-- Acessível por usuário autenticado; verificação de super_admin é interna
REVOKE EXECUTE ON FUNCTION public.admin_update_subscription_cycle(uuid, text, timestamptz, boolean, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_subscription_cycle(uuid, text, timestamptz, boolean, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_update_subscription_cycle(uuid, text, timestamptz, boolean, text) IS
$$Ajusta manualmente billing_cycle e período de uma assinatura.
Requer is_super_admin = true. Registra auditoria em admin_audit_logs.
NÃO altera créditos, saldo ou status da assinatura.$$;


-- ============================================================
-- 4. RPC: admin_infer_subscription_cycle
--    Inferência automática de ciclo — SOMENTE LEITURA.
--    Não altera nenhum dado.
--    Verifica is_super_admin internamente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_infer_subscription_cycle(
  p_subscription_id uuid
)
RETURNS TABLE (
  subscription_id          uuid,
  tenant_id                uuid,
  user_email               text,
  plan_code                text,
  current_billing_cycle    text,
  inferred_billing_cycle   text,
  confidence               text,
  evidence                 text,
  suggested_period_start   timestamptz,
  suggested_period_end     timestamptz,
  should_fix               boolean,
  reason                   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super_admin  boolean := false;
  v_sub             record;
  v_purchase        record;
  v_product         record;

  v_annual_score    int := 0;
  v_monthly_score   int := 0;
  v_evidence_parts  text[] := '{}';

  v_inferred        text := NULL;
  v_confidence      text := 'low';
  v_period_start    timestamptz;
  v_period_end      timestamptz;
  v_should_fix      boolean := false;
  v_reason_parts    text[] := '{}';

  -- UUIDs dos produtos anuais conhecidos
  ANNUAL_MASTER_UUID constant text := 'fa763da0-2d2c-11f1-a3f6-2761766c7eda';
  ANNUAL_PRO_UUID    constant text := 'da18e220-2d30-11f1-b691-1b4aa493422c';
  -- URLs de checkout anuais conhecidas
  ANNUAL_MASTER_URL  constant text := 'https://pay.kiwify.com.br/Ux6O9pR';
  ANNUAL_PRO_URL     constant text := 'https://pay.kiwify.com.br/Mqcsie2';
  -- URLs de checkout mensais conhecidas
  MONTHLY_PRO_URL    constant text := 'https://pay.kiwify.com.br/U0RRsel';
  MONTHLY_MASTER_URL constant text := 'https://pay.kiwify.com.br/yVg81A2';

BEGIN
  -- ── Verificar permissão ───────────────────────────────────────────────────
  SELECT u.is_super_admin
  INTO v_is_super_admin
  FROM public.users u
  WHERE u.id = auth.uid();

  IF NOT v_is_super_admin THEN
    RETURN;  -- retorna 0 linhas silenciosamente (seguro)
  END IF;

  -- ── Buscar dados da subscription ─────────────────────────────────────────
  SELECT
    s.id            AS sub_id,
    s.tenant_id,
    s.billing_cycle AS current_cycle,
    s.current_period_start,
    s.current_period_end,
    s.provider_sub_id,
    upper(trim(p.name)) AS plan_code,
    pu.email        AS user_email
  INTO v_sub
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  LEFT JOIN LATERAL (
    SELECT u2.email
    FROM public.users u2
    WHERE u2.tenant_id = s.tenant_id
    ORDER BY u2.created_at ASC
    LIMIT 1
  ) pu ON true
  WHERE s.id = p_subscription_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- ── Buscar compra Kiwify mais recente para o tenant ───────────────────────
  SELECT
    kp.id,
    kp.product_key,
    kp.kiwify_product_id,
    kp.product_name,
    kp.price_brl,
    kp.paid_at
  INTO v_purchase
  FROM public.kiwify_purchases kp
  WHERE kp.tenant_id = v_sub.tenant_id
    AND upper(trim(kp.status)) = 'APPROVED'
  ORDER BY COALESCE(kp.paid_at, kp.created_at) DESC
  LIMIT 1;

  -- ── Buscar produto Kiwify do catálogo ────────────────────────────────────
  IF v_purchase.id IS NOT NULL THEN
    SELECT
      kprod.billing_cycle AS kiwify_cycle,
      kprod.checkout_url,
      kprod.price_brl    AS catalog_price
    INTO v_product
    FROM public.kiwify_products kprod
    WHERE (
      kprod.kiwify_product_id = v_purchase.kiwify_product_id
      OR (
        kprod.product_key IS NOT NULL
        AND kprod.product_key = v_purchase.product_key
      )
    )
    LIMIT 1;
  END IF;

  -- ══ Evidência primária: nome do produto (prioridade máxima) ═════════════════
  -- Os nomes reais da Kiwify são inequívocos:
  --   "PLANO PREMIUM MENSAL", "PREMIUM ANUAL", "PLANO PRO ANUAL"
  -- Quando o nome contém ANUAL ou MENSAL, a confiança é high sem precisar
  -- de scoring complementar.

  IF v_purchase.product_name ILIKE '%ANUAL%' OR v_purchase.product_name ILIKE '%ANNUAL%' THEN
    v_inferred       := 'annual';
    v_confidence     := 'high';
    v_evidence_parts := array_append(v_evidence_parts,
      'EVIDÊNCIA FORTE (high): nome do produto contém ANUAL — "' || v_purchase.product_name || '"');

  ELSIF v_purchase.product_name ILIKE '%MENSAL%' OR v_purchase.product_name ILIKE '%MONTHLY%' THEN
    v_inferred       := 'monthly';
    v_confidence     := 'high';
    v_evidence_parts := array_append(v_evidence_parts,
      'EVIDÊNCIA FORTE (high): nome do produto contém MENSAL — "' || v_purchase.product_name || '"');
  END IF;

  -- ══ Scoring complementar (somente quando nome do produto não é conclusivo) ══

  IF v_inferred IS NULL THEN

    -- A1: product_key contém ANNUAL/ANUAL
    IF v_purchase.product_key ILIKE '%ANNUAL%' OR v_purchase.product_key ILIKE '%ANUAL%' THEN
      v_annual_score   := v_annual_score + 2;
      v_evidence_parts := array_append(v_evidence_parts, 'product_key indica anual ("' || v_purchase.product_key || '")');
    END IF;

    -- A2: UUID do produto é um dos anuais conhecidos
    IF v_purchase.kiwify_product_id IN (ANNUAL_MASTER_UUID, ANNUAL_PRO_UUID) THEN
      v_annual_score   := v_annual_score + 3;
      v_evidence_parts := array_append(v_evidence_parts, 'UUID do produto Kiwify é produto anual catalogado');
    END IF;

    -- A3: catálogo Kiwify diz annual
    IF v_product.kiwify_cycle = 'annual' THEN
      v_annual_score   := v_annual_score + 3;
      v_evidence_parts := array_append(v_evidence_parts, 'catálogo kiwify_products: billing_cycle=''annual''');
    END IF;

    -- A4: URL de checkout anual
    IF v_product.checkout_url IN (ANNUAL_MASTER_URL, ANNUAL_PRO_URL) THEN
      v_annual_score   := v_annual_score + 2;
      v_evidence_parts := array_append(v_evidence_parts, 'checkout_url corresponde a produto anual conhecido');
    END IF;

    -- A5: período atual é ~365 dias (±45 dias)
    IF v_sub.current_period_start IS NOT NULL AND v_sub.current_period_end IS NOT NULL THEN
      IF EXTRACT(DAY FROM (v_sub.current_period_end - v_sub.current_period_start)) BETWEEN 320 AND 410 THEN
        v_annual_score   := v_annual_score + 2;
        v_evidence_parts := array_append(v_evidence_parts,
          'período atual ~365 dias (' ||
          EXTRACT(DAY FROM (v_sub.current_period_end - v_sub.current_period_start))::int::text ||
          ' dias)');
      END IF;
    END IF;

    -- A6: preço de compra compatível com anual (>= R$500)
    IF v_purchase.price_brl >= 500 THEN
      v_annual_score   := v_annual_score + 1;
      v_evidence_parts := array_append(v_evidence_parts,
        'valor da compra R$ ' || v_purchase.price_brl::text || ' compatível com plano anual');
    END IF;

    -- M1: product_key contém MONTHLY/MENSAL
    IF v_purchase.product_key ILIKE '%MONTHLY%' OR v_purchase.product_key ILIKE '%MENSAL%' THEN
      v_monthly_score  := v_monthly_score + 2;
      v_evidence_parts := array_append(v_evidence_parts, 'product_key indica mensal ("' || v_purchase.product_key || '")');
    END IF;

    -- M2: catálogo Kiwify diz monthly
    IF v_product.kiwify_cycle = 'monthly' THEN
      v_monthly_score  := v_monthly_score + 3;
      v_evidence_parts := array_append(v_evidence_parts, 'catálogo kiwify_products: billing_cycle=''monthly''');
    END IF;

    -- M3: URL de checkout mensal
    IF v_product.checkout_url IN (MONTHLY_PRO_URL, MONTHLY_MASTER_URL) THEN
      v_monthly_score  := v_monthly_score + 2;
      v_evidence_parts := array_append(v_evidence_parts, 'checkout_url corresponde a produto mensal conhecido');
    END IF;

    -- M4: período atual é ~30 dias (±10 dias)
    IF v_sub.current_period_start IS NOT NULL AND v_sub.current_period_end IS NOT NULL THEN
      IF EXTRACT(DAY FROM (v_sub.current_period_end - v_sub.current_period_start)) BETWEEN 20 AND 40 THEN
        v_monthly_score  := v_monthly_score + 2;
        v_evidence_parts := array_append(v_evidence_parts,
          'período atual ~30 dias (' ||
          EXTRACT(DAY FROM (v_sub.current_period_end - v_sub.current_period_start))::int::text ||
          ' dias)');
      END IF;
    END IF;

    -- M5: preço de compra compatível com mensais (R$30–R$200)
    IF v_purchase.price_brl BETWEEN 30 AND 200 THEN
      v_monthly_score  := v_monthly_score + 1;
      v_evidence_parts := array_append(v_evidence_parts,
        'valor da compra R$ ' || v_purchase.price_brl::text || ' compatível com plano mensal');
    END IF;

    -- ── Determinar inferência pelo scoring ────────────────────────────────────
    IF v_annual_score > v_monthly_score THEN
      v_inferred := 'annual';
      IF v_annual_score >= 5 THEN
        v_confidence := 'high';
      ELSIF v_annual_score >= 2 THEN
        v_confidence := 'medium';
      ELSE
        v_confidence := 'low';
      END IF;
    ELSIF v_monthly_score > v_annual_score THEN
      v_inferred := 'monthly';
      IF v_monthly_score >= 5 THEN
        v_confidence := 'high';
      ELSIF v_monthly_score >= 2 THEN
        v_confidence := 'medium';
      ELSE
        v_confidence := 'low';
      END IF;
    ELSE
      v_inferred   := NULL;
      v_confidence := 'low';
    END IF;

  END IF; -- scoring complementar (v_inferred IS NULL)

  -- ── Se sem dados, marcar low confidence ──────────────────────────────────
  IF v_purchase.id IS NULL AND v_sub.current_period_start IS NULL THEN
    v_evidence_parts := array_append(v_evidence_parts, 'sem compra Kiwify e sem datas de período — dado insuficiente');
  END IF;

  -- ── Período sugerido ──────────────────────────────────────────────────────
  v_period_start := COALESCE(v_sub.current_period_start, v_purchase.paid_at, now());

  IF v_inferred = 'annual' THEN
    v_period_end := v_period_start + INTERVAL '12 months';
  ELSIF v_inferred = 'monthly' THEN
    v_period_end := v_period_start + INTERVAL '1 month';
  ELSE
    v_period_end := NULL;
  END IF;

  -- ── Deve corrigir? ────────────────────────────────────────────────────────
  v_should_fix := (
    v_inferred IS NOT NULL
    AND v_inferred <> COALESCE(v_sub.current_cycle, '')
    AND v_confidence IN ('high', 'medium')
  );

  -- ── Motivo ────────────────────────────────────────────────────────────────
  IF v_inferred IS NULL THEN
    v_reason_parts := array_append(v_reason_parts, 'Inferência inconclusiva — dados insuficientes para determinar ciclo');
  ELSIF v_inferred = v_sub.current_cycle THEN
    v_reason_parts := array_append(v_reason_parts, 'billing_cycle atual já está correto (' || v_sub.current_cycle || ')');
  ELSIF v_sub.current_cycle IS NULL THEN
    v_reason_parts := array_append(v_reason_parts, 'billing_cycle NULL — sugerido: ' || v_inferred || ' (confiança: ' || v_confidence || ')');
  ELSE
    v_reason_parts := array_append(v_reason_parts,
      'billing_cycle atual é "' || v_sub.current_cycle || '" mas inferência sugere "' || v_inferred || '" (confiança: ' || v_confidence || ')');
  END IF;

  -- ── Retornar resultado ────────────────────────────────────────────────────
  subscription_id        := v_sub.sub_id;
  tenant_id              := v_sub.tenant_id;
  user_email             := v_sub.user_email;
  plan_code              := v_sub.plan_code;
  current_billing_cycle  := v_sub.current_cycle;
  inferred_billing_cycle := v_inferred;
  confidence             := v_confidence;
  evidence               := COALESCE(array_to_string(v_evidence_parts, ' | '), 'Sem evidências disponíveis');
  suggested_period_start := v_period_start;
  suggested_period_end   := v_period_end;
  should_fix             := v_should_fix;
  reason                 := array_to_string(v_reason_parts, '; ');
  RETURN NEXT;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_infer_subscription_cycle(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_infer_subscription_cycle(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_infer_subscription_cycle(uuid) IS
$$Infere billing_cycle de uma assinatura a partir de evidências (somente leitura).
Requer is_super_admin = true. Não altera nenhum dado.
Retorna: subscription_id, inferred_billing_cycle, confidence, evidence, suggested_period_start/end, should_fix, reason.$$;


-- ============================================================
-- 5. RPC: grant_missing_monthly_credits_for_subscription
--    Dry-run (padrão) ou concessão real para UMA assinatura.
--    Mesmas regras do grant global, mas escopo = 1 subscription.
--    Verifica is_super_admin internamente.
-- ============================================================

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

  IF NOT v_is_super_admin THEN
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
    WHERE tenant_id = v_rec.tenant_id;

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

REVOKE EXECUTE ON FUNCTION public.grant_missing_monthly_credits_for_subscription(uuid, boolean)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_missing_monthly_credits_for_subscription(uuid, boolean)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.grant_missing_monthly_credits_for_subscription(uuid, boolean) IS
$$Concede créditos mensais faltantes para UMA assinatura específica.
Requer is_super_admin = true. p_dry_run = true (padrão) — simula sem alterar.
Mesmas regras de idempotência do grant global: operation_id = monthly_grant:{tenant}:{YYYY-MM}.
Registra auditoria em admin_audit_logs quando p_dry_run = false.$$;