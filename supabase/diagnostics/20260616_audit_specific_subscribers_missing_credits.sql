-- ============================================================
-- DIAGNÓSTICO CIRÚRGICO: 15 assinantes do dry run
-- (BILLING_CYCLE_NULL e SUBSCRIPTION_EXPIRED)
-- Sprint P1.3-C — 2026-06-16
--
-- SOMENTE LEITURA (SELECT). Nenhuma alteração de dados.
--
-- Contexto:
--   A função grant_missing_monthly_credits_for_active_subscriptions()
--   retornou os seguintes grupos em dry run (p_dry_run = true):
--
--   BILLING_CYCLE_NULL (5):
--     Diana, Francisca, Geizaceleste, Nilmaria, Vanusa
--
--   SUBSCRIPTION_EXPIRED (10):
--     Genicleide, Jeanne, Lais, Luciene, Lusenir,
--     Maria Expedita, Maria Vilany, Sandra, Sara, Wênia
--
-- Objetivo:
--   Identificar, caso a caso, o plano real, o ciclo real, as
--   evidências disponíveis (Kiwify, webhook, período) e classificar
--   cada assinante para orientar a correção cirúrgica.
--
-- Classificações possíveis:
--   SAFE_TO_FIX_ANNUAL        — evidência clara de ciclo anual; corrigir
--   SAFE_TO_FIX_MONTHLY       — evidência clara de ciclo mensal; corrigir
--   NEEDS_MANUAL_REVIEW       — ambíguo; não corrigir sem análise adicional
--   EXPIRED_NO_PAYMENT_EVIDENCE — vencida sem compra Kiwify encontrada
--   ALREADY_OK                — dados corretos; não requer correção
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- CTE raiz: tenants correspondentes aos 15 nomes do dry run
-- Usa ILIKE para tolerar variações de caixa e espaços.
-- ATENÇÃO: revisar resultados para falsos positivos de nome
-- (ex.: "Sandra" pode bater em mais de um tenant).
-- ────────────────────────────────────────────────────────────
WITH

target_name_fragments AS (
  SELECT unnest(ARRAY[
    -- BILLING_CYCLE_NULL
    'Diana',
    'Francisca',
    'Geizaceleste',
    'Nilmaria',
    'Vanusa',
    -- SUBSCRIPTION_EXPIRED
    'Genicleide',
    'Jeanne',
    'Lais',
    'Luciene',
    'Lusenir',
    'Maria Expedita',
    'Maria Vilany',
    'Sandra',
    'Sara',
    'Wenia'       -- sem acento para capturar variações de encoding
  ]) AS frag
),

-- Tenants cujo nome contém algum dos fragmentos
matched_tenants AS (
  SELECT DISTINCT t.id AS tenant_id
  FROM public.tenants t
  CROSS JOIN target_name_fragments tf
  WHERE t.name ILIKE '%' || tf.frag || '%'
    AND NOT COALESCE(t.is_internal, false)
),

-- Assinatura ativa mais recente de cada tenant matched
-- (inclui EXPIRED para cobertura total do diagnóstico)
subs AS (
  SELECT DISTINCT ON (s.tenant_id)
    s.id                   AS subscription_id,
    s.tenant_id,
    s.status               AS sub_status,
    s.billing_cycle,
    s.current_period_start,
    s.current_period_end,
    s.next_due_date,
    s.provider,
    s.provider_sub_id,
    s.provider_customer_id,
    s.last_payment_status,
    s.plan_id,
    s.created_at           AS sub_created_at,
    s.updated_at           AS sub_updated_at
  FROM public.subscriptions s
  JOIN matched_tenants mt ON mt.tenant_id = s.tenant_id
  ORDER BY s.tenant_id,
    -- Preferir ACTIVE; entre ACTIVE, pegar o mais recente
    CASE WHEN s.status = 'ACTIVE' THEN 0 ELSE 1 END ASC,
    s.created_at DESC,
    s.id DESC
),

-- Usuário principal de cada tenant (o mais antigo = owner)
primary_user AS (
  SELECT DISTINCT ON (u.tenant_id)
    u.tenant_id,
    u.id        AS user_id,
    u.email     AS user_email,
    COALESCE(u.full_name, u.nome, split_part(u.email, '@', 1)) AS user_name
  FROM public.users u
  JOIN matched_tenants mt ON mt.tenant_id = u.tenant_id
  ORDER BY u.tenant_id, u.created_at ASC
),

-- Melhor compra Kiwify APPROVED para cada tenant
-- (mais recente primeiro; fallback por email se tenant_id não está preenchido)
best_purchase AS (
  SELECT DISTINCT ON (kp.tenant_id)
    kp.tenant_id,
    kp.id                  AS purchase_id,
    kp.email               AS purchase_email,
    kp.product_key,
    kp.plan_code           AS purchase_plan_code,
    kp.provider_order_id,
    kp.status              AS purchase_status,
    kp.paid_at,
    kp.activated_at,
    kp.activation_status,
    kp.created_at          AS purchase_created_at,
    -- kiwify_product_id pode estar no payload (campo não normalizado)
    kp.payload->>'kiwify_product_id'  AS kiwify_product_id_payload,
    kp.payload->>'product_id'         AS product_id_payload,
    kp.payload->'Product'->>'id'      AS product_id_nested,
    kp.payload->'Product'->>'name'    AS product_name_payload,
    kp.payload->>'product_name'       AS product_name_flat
  FROM public.kiwify_purchases kp
  JOIN matched_tenants mt ON mt.tenant_id = kp.tenant_id
  WHERE kp.status = 'APPROVED'
  ORDER BY kp.tenant_id,
    kp.paid_at DESC NULLS LAST,
    kp.created_at DESC
),

-- Compra por email como fallback (quando tenant_id não está na purchase)
purchase_by_email AS (
  SELECT DISTINCT ON (pu.tenant_id)
    pu.tenant_id,
    kp.id                  AS purchase_id,
    kp.email               AS purchase_email,
    kp.product_key,
    kp.plan_code           AS purchase_plan_code,
    kp.provider_order_id,
    kp.status              AS purchase_status,
    kp.paid_at,
    kp.activated_at,
    kp.activation_status,
    kp.created_at          AS purchase_created_at,
    kp.payload->>'kiwify_product_id'  AS kiwify_product_id_payload,
    kp.payload->>'product_id'         AS product_id_payload,
    kp.payload->'Product'->>'id'      AS product_id_nested,
    kp.payload->'Product'->>'name'    AS product_name_payload,
    kp.payload->>'product_name'       AS product_name_flat
  FROM primary_user pu
  JOIN public.kiwify_purchases kp
    ON lower(trim(kp.email)) = pu.user_email
  WHERE kp.status    = 'APPROVED'
    AND kp.tenant_id IS NULL   -- só fallback quando purchase não tem tenant_id
  ORDER BY pu.tenant_id,
    kp.paid_at DESC NULLS LAST,
    kp.created_at DESC
),

-- Catálogo de produtos Kiwify (para cruzar product_key)
product_catalog AS (
  SELECT
    kprod.product_key,
    kprod.kiwify_product_id,
    kprod.product_name,
    kprod.plan_code        AS catalog_plan_code,
    kprod.billing_cycle    AS catalog_billing_cycle,
    kprod.price_brl
  FROM public.kiwify_products kprod
  WHERE kprod.is_active = true
),

-- Último monthly_grant de cada tenant matched
last_grant AS (
  SELECT DISTINCT ON (cl.tenant_id)
    cl.tenant_id,
    cl.created_at          AS last_grant_at,
    cl.amount              AS last_grant_amount,
    cl.description         AS last_grant_description
  FROM public.credits_ledger cl
  WHERE cl.type = 'monthly_grant'
    AND cl.tenant_id IN (SELECT tenant_id FROM matched_tenants)
  ORDER BY cl.tenant_id, cl.created_at DESC
),

-- Monthly grants do mês atual
current_month_grant AS (
  SELECT
    cl.tenant_id,
    COUNT(*)               AS grants_this_month,
    MAX(cl.created_at)     AS latest_this_month
  FROM public.credits_ledger cl
  WHERE cl.type = 'monthly_grant'
    AND date_trunc('month', cl.created_at) = date_trunc('month', now())
    AND cl.tenant_id IN (SELECT tenant_id FROM matched_tenants)
  GROUP BY cl.tenant_id
),

-- Carteiras de créditos
-- Nota: credits_wallet só tem: id, tenant_id, balance, last_reset_at, updated_at
-- last_credit_grant_at e next_credit_grant_at NÃO existem — usar credits_ledger
wallets AS (
  SELECT
    cw.tenant_id,
    COALESCE(cw.balance, 0) AS balance,
    cw.last_reset_at        AS wallet_last_reset_at,
    cw.updated_at           AS wallet_updated_at
  FROM public.credits_wallet cw
  WHERE cw.tenant_id IN (SELECT tenant_id FROM matched_tenants)
),

-- Último evento webhook Kiwify para cada tenant
last_webhook AS (
  SELECT DISTINCT ON (wl.tenant_id)
    wl.tenant_id,
    wl.kiwify_order_id     AS webhook_order_id,
    wl.event_type          AS webhook_event_type,
    wl.plan_code           AS webhook_plan_code,
    wl.credits_granted     AS webhook_credits_granted,
    wl.processed_at        AS webhook_processed_at
  FROM public.kiwify_webhook_logs wl
  WHERE wl.tenant_id IN (SELECT tenant_id FROM matched_tenants)
  ORDER BY wl.tenant_id, wl.processed_at DESC
),

-- União da melhor compra: por tenant_id direto, com fallback por email
effective_purchase AS (
  SELECT
    COALESCE(bp.tenant_id, pbe.tenant_id)           AS tenant_id,
    COALESCE(bp.purchase_id, pbe.purchase_id)        AS purchase_id,
    COALESCE(bp.purchase_email, pbe.purchase_email)  AS purchase_email,
    COALESCE(bp.product_key, pbe.product_key)        AS product_key,
    COALESCE(bp.purchase_plan_code, pbe.purchase_plan_code) AS purchase_plan_code,
    COALESCE(bp.provider_order_id, pbe.provider_order_id)   AS provider_order_id,
    COALESCE(bp.purchase_status, pbe.purchase_status)       AS purchase_status,
    COALESCE(bp.paid_at, pbe.paid_at)               AS paid_at,
    COALESCE(bp.activated_at, pbe.activated_at)     AS activated_at,
    COALESCE(bp.activation_status, pbe.activation_status)   AS activation_status,
    COALESCE(bp.purchase_created_at, pbe.purchase_created_at) AS purchase_created_at,
    COALESCE(bp.kiwify_product_id_payload, pbe.kiwify_product_id_payload) AS kiwify_product_id_payload,
    COALESCE(bp.product_id_payload, pbe.product_id_payload)  AS product_id_payload,
    COALESCE(bp.product_id_nested, pbe.product_id_nested)    AS product_id_nested,
    COALESCE(bp.product_name_payload, pbe.product_name_payload) AS product_name_payload,
    COALESCE(bp.product_name_flat, pbe.product_name_flat)    AS product_name_flat,
    -- indica se a compra veio do match direto ou por email fallback
    CASE WHEN bp.tenant_id IS NOT NULL THEN 'tenant_id' ELSE 'email_fallback' END AS purchase_match_method
  FROM matched_tenants mt
  LEFT JOIN best_purchase bp    ON bp.tenant_id = mt.tenant_id
  LEFT JOIN purchase_by_email pbe ON pbe.tenant_id = mt.tenant_id
  WHERE bp.purchase_id IS NOT NULL OR pbe.purchase_id IS NOT NULL
)

-- ═══════════════════════════════════════════════════════════
-- RESULTADO PRINCIPAL — Diagnóstico cirúrgico por assinante
-- ═══════════════════════════════════════════════════════════
SELECT
  -- ── Identificação ────────────────────────────────────────────────────────
  t.id                                               AS tenant_id,
  t.name                                             AS tenant_name,
  pu.user_email,
  pu.user_name,

  -- ── Plano ────────────────────────────────────────────────────────────────
  upper(p.name)                                      AS plan_code,

  -- ── Assinatura ───────────────────────────────────────────────────────────
  s.subscription_id,
  s.sub_status,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  s.next_due_date,
  s.provider,
  s.provider_sub_id,
  s.provider_customer_id,
  s.last_payment_status,
  s.sub_created_at,
  s.sub_updated_at,
  EXTRACT(DAY FROM (s.current_period_end - s.current_period_start))::int
                                                     AS period_length_days,
  -- Dias em atraso (positivo = vencida há N dias; negativo = ainda dentro do período)
  EXTRACT(DAY FROM (now() - s.current_period_end))::int
                                                     AS days_overdue,

  -- ── Compra Kiwify ────────────────────────────────────────────────────────
  ep.purchase_id,
  ep.purchase_email,
  ep.product_key,
  ep.purchase_plan_code,
  ep.provider_order_id,
  ep.purchase_status,
  ep.paid_at,
  ep.activated_at,
  ep.activation_status,
  ep.purchase_created_at,
  ep.purchase_match_method,
  -- kiwify_product_id extraído do payload JSON (não normalizado na tabela)
  COALESCE(ep.kiwify_product_id_payload,
           ep.product_id_payload,
           ep.product_id_nested)                    AS kiwify_product_id_from_payload,
  COALESCE(ep.product_name_payload,
           ep.product_name_flat)                    AS product_name,

  -- ── Catálogo Kiwify (produto cruzado por product_key) ────────────────────
  pc.kiwify_product_id                               AS catalog_kiwify_product_id,
  pc.product_name                                    AS catalog_product_name,
  pc.catalog_plan_code,
  pc.catalog_billing_cycle,
  pc.price_brl                                       AS catalog_price_brl,

  -- ── Créditos / Wallet ────────────────────────────────────────────────────
  w.balance                                          AS credits_balance,
  w.wallet_last_reset_at,
  w.wallet_updated_at,
  -- Último monthly_grant via credits_ledger (fonte real, não colunas inexistentes)
  lg.last_grant_at                                   AS last_monthly_grant_at,
  lg.last_grant_at + interval '1 month'              AS estimated_next_credit_grant_at,
  lg.last_grant_amount,
  lg.last_grant_description,
  COALESCE(cmg.grants_this_month, 0)                 AS grants_this_month,
  cmg.latest_this_month                              AS last_grant_this_month,

  -- ── Webhook ──────────────────────────────────────────────────────────────
  lw.webhook_order_id,
  lw.webhook_event_type,
  lw.webhook_plan_code,
  lw.webhook_credits_granted,
  lw.webhook_processed_at,

  -- ── Inferência do ciclo real ──────────────────────────────────────────────
  CASE
    -- Compra tem ANNUAL no product_key → forte evidência de ciclo anual
    WHEN upper(COALESCE(ep.product_key, '')) LIKE '%ANNUAL%'
    THEN 'annual_by_product_key'

    -- Compra tem MONTHLY no product_key → forte evidência de ciclo mensal
    WHEN upper(COALESCE(ep.product_key, '')) LIKE '%MONTHLY%'
    THEN 'monthly_by_product_key'

    -- Catálogo indica 'annual' pelo product_key cruzado
    WHEN pc.catalog_billing_cycle = 'annual'
    THEN 'annual_by_catalog'

    -- Catálogo indica 'monthly' pelo product_key cruzado
    WHEN pc.catalog_billing_cycle = 'monthly'
    THEN 'monthly_by_catalog'

    -- Período gravado > 300 dias → assinatura foi gravada com período longo
    WHEN s.current_period_start IS NOT NULL
      AND s.current_period_end IS NOT NULL
      AND (s.current_period_end - s.current_period_start) > interval '300 days'
    THEN 'annual_inferido_por_periodo_longo'

    -- Período gravado <= 45 dias → provavelmente mensal
    WHEN s.current_period_start IS NOT NULL
      AND s.current_period_end IS NOT NULL
      AND (s.current_period_end - s.current_period_start) <= interval '45 days'
    THEN 'monthly_inferido_por_periodo_curto'

    ELSE 'indeterminado'
  END                                                AS ciclo_real_inferido,

  -- ── Diagnóstico específico para casos vencidos ────────────────────────────
  CASE
    WHEN s.current_period_end IS NOT NULL AND s.current_period_end < now()
      AND s.billing_cycle = 'annual'
      AND (s.current_period_end - s.current_period_start) < interval '300 days'
    THEN 'ANUAL_COM_BUG_30_DIAS — period_end deveria ser period_start + 12 meses'

    WHEN s.current_period_end IS NOT NULL AND s.current_period_end < now()
      AND s.billing_cycle = 'monthly'
    THEN 'MENSAL_SEM_RENOVACAO — webhook subscription_renewed nao chegou'

    WHEN s.current_period_end IS NOT NULL AND s.current_period_end < now()
      AND s.billing_cycle IS NULL
    THEN 'VENCIDA_SEM_CICLO — duplo problema: ciclo nulo + periodo expirado'

    WHEN s.billing_cycle IS NULL
    THEN 'CICLO_NULO — nao vencida mas billing_cycle nao definido'

    ELSE 'OK_APARENTE'
  END                                                AS diagnostico_especifico,

  -- ── Classificação final para ação ─────────────────────────────────────────
  CASE
    -- 1. Já está OK: billing_cycle preenchido + período válido
    WHEN s.billing_cycle IS NOT NULL
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end >= now()
    THEN 'ALREADY_OK'

    -- 2. SAFE ANNUAL: billing_cycle NULL + compra com ANNUAL no product_key
    WHEN s.billing_cycle IS NULL
      AND ep.purchase_id IS NOT NULL
      AND upper(COALESCE(ep.product_key, '')) LIKE '%ANNUAL%'
    THEN 'SAFE_TO_FIX_ANNUAL'

    -- 3. SAFE ANNUAL: billing_cycle NULL + catálogo confirma annual
    WHEN s.billing_cycle IS NULL
      AND ep.purchase_id IS NOT NULL
      AND pc.catalog_billing_cycle = 'annual'
      AND upper(COALESCE(ep.product_key, '')) NOT LIKE '%MONTHLY%'
    THEN 'SAFE_TO_FIX_ANNUAL'

    -- 4. SAFE MONTHLY: billing_cycle NULL + compra com MONTHLY no product_key
    WHEN s.billing_cycle IS NULL
      AND ep.purchase_id IS NOT NULL
      AND upper(COALESCE(ep.product_key, '')) LIKE '%MONTHLY%'
    THEN 'SAFE_TO_FIX_MONTHLY'

    -- 5. SAFE MONTHLY: billing_cycle NULL + catálogo confirma monthly
    WHEN s.billing_cycle IS NULL
      AND ep.purchase_id IS NOT NULL
      AND pc.catalog_billing_cycle = 'monthly'
      AND upper(COALESCE(ep.product_key, '')) NOT LIKE '%ANNUAL%'
    THEN 'SAFE_TO_FIX_MONTHLY'

    -- 6. SAFE ANNUAL: vencida + billing_cycle = 'annual' + bug 30 dias confirmado por compra anual
    WHEN s.current_period_end IS NOT NULL
      AND s.current_period_end < now()
      AND s.billing_cycle = 'annual'
      AND (s.current_period_end - s.current_period_start) < interval '300 days'
      AND ep.purchase_id IS NOT NULL
      AND (
        upper(COALESCE(ep.product_key, '')) LIKE '%ANNUAL%'
        OR pc.catalog_billing_cycle = 'annual'
      )
    THEN 'SAFE_TO_FIX_ANNUAL'

    -- 7. SAFE ANNUAL: vencida + billing_cycle = 'annual' + bug 30 dias mas sem compra
    --    Seguro apenas pelo fato do billing_cycle já estar correto
    WHEN s.current_period_end IS NOT NULL
      AND s.current_period_end < now()
      AND s.billing_cycle = 'annual'
      AND (s.current_period_end - s.current_period_start) < interval '300 days'
    THEN 'SAFE_TO_FIX_ANNUAL'

    -- 8. SAFE MONTHLY: vencida + billing_cycle = 'monthly' + compra MONTHLY confirma
    WHEN s.current_period_end IS NOT NULL
      AND s.current_period_end < now()
      AND s.billing_cycle = 'monthly'
      AND ep.purchase_id IS NOT NULL
      AND upper(COALESCE(ep.product_key, '')) LIKE '%MONTHLY%'
    THEN 'SAFE_TO_FIX_MONTHLY'

    -- 9. Vencida + billing_cycle preenchido + compra encontrada mas ciclo ambíguo
    WHEN s.current_period_end IS NOT NULL
      AND s.current_period_end < now()
      AND ep.purchase_id IS NOT NULL
    THEN 'NEEDS_MANUAL_REVIEW'

    -- 10. Vencida sem compra registrada
    WHEN s.current_period_end IS NOT NULL
      AND s.current_period_end < now()
      AND ep.purchase_id IS NULL
    THEN 'EXPIRED_NO_PAYMENT_EVIDENCE'

    -- 11. billing_cycle NULL sem compra registrada
    WHEN s.billing_cycle IS NULL AND ep.purchase_id IS NULL
    THEN 'NEEDS_MANUAL_REVIEW'

    ELSE 'NEEDS_MANUAL_REVIEW'
  END                                                AS classificacao,

  -- ── Ação proposta (texto legível) ─────────────────────────────────────────
  CASE
    WHEN s.billing_cycle IS NULL
      AND ep.purchase_id IS NOT NULL
      AND upper(COALESCE(ep.product_key, '')) LIKE '%ANNUAL%'
    THEN 'SET billing_cycle = ''annual'' (product_key confirma)'

    WHEN s.billing_cycle IS NULL
      AND ep.purchase_id IS NOT NULL
      AND upper(COALESCE(ep.product_key, '')) LIKE '%MONTHLY%'
    THEN 'SET billing_cycle = ''monthly'' (product_key confirma)'

    WHEN s.billing_cycle IS NULL
      AND ep.purchase_id IS NOT NULL
      AND pc.catalog_billing_cycle IS NOT NULL
    THEN 'SET billing_cycle = ''' || pc.catalog_billing_cycle || ''' (catálogo confirma)'

    WHEN s.current_period_end IS NOT NULL
      AND s.current_period_end < now()
      AND s.billing_cycle = 'annual'
      AND (s.current_period_end - s.current_period_start) < interval '300 days'
    THEN 'SET current_period_end = current_period_start + 12 months (bug 30 dias)'

    WHEN s.current_period_end IS NOT NULL
      AND s.current_period_end < now()
      AND s.billing_cycle = 'monthly'
    THEN 'REQUIRES_MANUAL_REVIEW — verificar último pagamento Kiwify'

    ELSE 'REQUIRES_MANUAL_REVIEW'
  END                                                AS acao_proposta,

  -- ── Proposed new period_end (somente leitura — não executar) ──────────────
  CASE
    WHEN s.billing_cycle = 'annual'
      AND s.current_period_start IS NOT NULL
      AND (s.current_period_end - s.current_period_start) < interval '300 days'
    THEN s.current_period_start + interval '12 months'
    ELSE NULL
  END                                                AS proposed_period_end_if_annual_bug,

  to_char(now(), 'YYYY-MM-DD HH24:MI:SS TZ')        AS momento_diagnostico

FROM matched_tenants mt
JOIN  public.tenants t         ON t.id    = mt.tenant_id
LEFT JOIN public.plans p       ON p.id    = t.plan_id
LEFT JOIN primary_user pu      ON pu.tenant_id  = mt.tenant_id
LEFT JOIN subs s               ON s.tenant_id   = mt.tenant_id
LEFT JOIN effective_purchase ep ON ep.tenant_id = mt.tenant_id
LEFT JOIN product_catalog pc   ON pc.product_key = ep.product_key
LEFT JOIN wallets w            ON w.tenant_id    = mt.tenant_id
LEFT JOIN last_grant lg        ON lg.tenant_id   = mt.tenant_id
LEFT JOIN current_month_grant cmg ON cmg.tenant_id = mt.tenant_id
LEFT JOIN last_webhook lw      ON lw.tenant_id   = mt.tenant_id
ORDER BY
  -- BILLING_CYCLE_NULL primeiro, depois EXPIRED
  CASE
    WHEN s.billing_cycle IS NULL AND (s.current_period_end IS NULL OR s.current_period_end >= now())
    THEN 1
    WHEN s.current_period_end IS NOT NULL AND s.current_period_end < now()
    THEN 2
    ELSE 3
  END,
  t.name;


-- ════════════════════════════════════════════════════════════
-- SEÇÃO 2 — Resumo executivo por classificação
-- ════════════════════════════════════════════════════════════
WITH

target_name_fragments AS (
  SELECT unnest(ARRAY[
    'Diana','Francisca','Geizaceleste','Nilmaria','Vanusa',
    'Genicleide','Jeanne','Lais','Luciene','Lusenir',
    'Maria Expedita','Maria Vilany','Sandra','Sara','Wenia'
  ]) AS frag
),

matched_tenants AS (
  SELECT DISTINCT t.id AS tenant_id
  FROM public.tenants t
  CROSS JOIN target_name_fragments tf
  WHERE t.name ILIKE '%' || tf.frag || '%'
    AND NOT COALESCE(t.is_internal, false)
),

subs AS (
  SELECT DISTINCT ON (s.tenant_id)
    s.tenant_id,
    s.billing_cycle,
    s.current_period_start,
    s.current_period_end
  FROM public.subscriptions s
  JOIN matched_tenants mt ON mt.tenant_id = s.tenant_id
  WHERE s.status = 'ACTIVE'
  ORDER BY s.tenant_id,
    CASE WHEN s.status = 'ACTIVE' THEN 0 ELSE 1 END,
    s.created_at DESC
),

best_purchase AS (
  SELECT DISTINCT ON (kp.tenant_id)
    kp.tenant_id,
    kp.id AS purchase_id,
    kp.product_key
  FROM public.kiwify_purchases kp
  JOIN matched_tenants mt ON mt.tenant_id = kp.tenant_id
  WHERE kp.status = 'APPROVED'
  ORDER BY kp.tenant_id, kp.paid_at DESC NULLS LAST, kp.created_at DESC
),

product_catalog AS (
  SELECT product_key, catalog_billing_cycle
  FROM (
    SELECT kprod.product_key, kprod.billing_cycle AS catalog_billing_cycle
    FROM public.kiwify_products kprod
    WHERE kprod.is_active = true
  ) x
),

classified AS (
  SELECT
    mt.tenant_id,
    CASE
      WHEN s.billing_cycle IS NOT NULL
        AND s.current_period_end IS NOT NULL
        AND s.current_period_end >= now()
      THEN 'ALREADY_OK'

      WHEN s.billing_cycle IS NULL
        AND bp.purchase_id IS NOT NULL
        AND upper(COALESCE(bp.product_key, '')) LIKE '%ANNUAL%'
      THEN 'SAFE_TO_FIX_ANNUAL'

      WHEN s.billing_cycle IS NULL
        AND bp.purchase_id IS NOT NULL
        AND (upper(COALESCE(bp.product_key, '')) LIKE '%MONTHLY%'
             OR pc.catalog_billing_cycle = 'monthly')
      THEN 'SAFE_TO_FIX_MONTHLY'

      WHEN s.current_period_end IS NOT NULL
        AND s.current_period_end < now()
        AND s.billing_cycle = 'annual'
        AND (s.current_period_end - s.current_period_start) < interval '300 days'
      THEN 'SAFE_TO_FIX_ANNUAL'

      WHEN s.current_period_end IS NOT NULL
        AND s.current_period_end < now()
        AND bp.purchase_id IS NULL
      THEN 'EXPIRED_NO_PAYMENT_EVIDENCE'

      ELSE 'NEEDS_MANUAL_REVIEW'
    END AS classificacao
  FROM matched_tenants mt
  LEFT JOIN subs s           ON s.tenant_id = mt.tenant_id
  LEFT JOIN best_purchase bp ON bp.tenant_id = mt.tenant_id
  LEFT JOIN product_catalog pc ON pc.product_key = bp.product_key
)

SELECT
  classificacao,
  COUNT(*)                               AS total,
  to_char(now(), 'YYYY-MM-DD HH24:MI')  AS momento
FROM classified
GROUP BY classificacao
ORDER BY
  CASE classificacao
    WHEN 'SAFE_TO_FIX_ANNUAL'         THEN 1
    WHEN 'SAFE_TO_FIX_MONTHLY'        THEN 2
    WHEN 'NEEDS_MANUAL_REVIEW'        THEN 3
    WHEN 'EXPIRED_NO_PAYMENT_EVIDENCE' THEN 4
    WHEN 'ALREADY_OK'                 THEN 5
    ELSE 6
  END;


-- ════════════════════════════════════════════════════════════
-- SEÇÃO 3 — Todos os webhooks históricos dos 15 tenants
--           (ordenados mais recente primeiro)
-- ════════════════════════════════════════════════════════════
WITH

target_name_fragments AS (
  SELECT unnest(ARRAY[
    'Diana','Francisca','Geizaceleste','Nilmaria','Vanusa',
    'Genicleide','Jeanne','Lais','Luciene','Lusenir',
    'Maria Expedita','Maria Vilany','Sandra','Sara','Wenia'
  ]) AS frag
),

matched_tenants AS (
  SELECT DISTINCT t.id AS tenant_id, t.name AS tenant_name
  FROM public.tenants t
  CROSS JOIN target_name_fragments tf
  WHERE t.name ILIKE '%' || tf.frag || '%'
    AND NOT COALESCE(t.is_internal, false)
)

SELECT
  mt.tenant_name,
  wl.kiwify_order_id,
  wl.event_type,
  wl.plan_code,
  wl.credits_granted,
  wl.processed_at,
  wl.raw_payload->'subscription'->>'status' AS sub_status_webhook
FROM public.kiwify_webhook_logs wl
JOIN matched_tenants mt ON mt.tenant_id = wl.tenant_id
ORDER BY mt.tenant_name, wl.processed_at DESC
LIMIT 200;


-- ════════════════════════════════════════════════════════════
-- SEÇÃO 4 — Todas as compras Kiwify dos 15 tenants
--           (incluindo PENDING e CANCELLED para histórico completo)
-- ════════════════════════════════════════════════════════════
WITH

target_name_fragments AS (
  SELECT unnest(ARRAY[
    'Diana','Francisca','Geizaceleste','Nilmaria','Vanusa',
    'Genicleide','Jeanne','Lais','Luciene','Lusenir',
    'Maria Expedita','Maria Vilany','Sandra','Sara','Wenia'
  ]) AS frag
),

matched_tenants AS (
  SELECT DISTINCT t.id AS tenant_id, t.name AS tenant_name
  FROM public.tenants t
  CROSS JOIN target_name_fragments tf
  WHERE t.name ILIKE '%' || tf.frag || '%'
    AND NOT COALESCE(t.is_internal, false)
),

primary_user AS (
  SELECT DISTINCT ON (u.tenant_id)
    u.tenant_id, u.email AS user_email
  FROM public.users u
  JOIN matched_tenants mt ON mt.tenant_id = u.tenant_id
  ORDER BY u.tenant_id, u.created_at ASC
)

SELECT
  mt.tenant_name,
  kp.id                            AS purchase_id,
  kp.email                         AS purchase_email,
  kp.product_key,
  kp.plan_code,
  kp.credits_amount,
  kp.provider_order_id,
  kp.status,
  kp.activation_status,
  kp.paid_at,
  kp.activated_at,
  kp.created_at,
  kp.tenant_id                     AS purchase_tenant_id,
  CASE WHEN kp.tenant_id IS NOT NULL THEN 'direto' ELSE 'por_email' END AS match_type
FROM matched_tenants mt
JOIN primary_user pu ON pu.tenant_id = mt.tenant_id
JOIN public.kiwify_purchases kp
  ON kp.tenant_id = mt.tenant_id
  OR lower(trim(kp.email)) = pu.user_email
ORDER BY mt.tenant_name, kp.paid_at DESC NULLS LAST;