-- ============================================================
-- proposed_fix_specific_subscribers_cycles_DO_NOT_RUN.sql
--
-- ██████████████████████████████████████████████████████████████
-- ⛔  NÃO EXECUTAR SEM REVISÃO MANUAL E APROVAÇÃO EXPLÍCITA  ⛔
-- ██████████████████████████████████████████████████████████████
--
-- Sprint P1.3-C — 2026-06-16
--
-- Proposta de correção cirúrgica de billing_cycle e/ou
-- current_period_end para os 15 tenants identificados no dry
-- run de grant_missing_monthly_credits_for_active_subscriptions().
--
-- GRUPOS DO DRY RUN:
--   BILLING_CYCLE_NULL (5):
--     Diana, Francisca, Geizaceleste, Nilmaria, Vanusa
--
--   SUBSCRIPTION_EXPIRED (10):
--     Genicleide, Jeanne, Lais, Luciene, Lusenir,
--     Maria Expedita, Maria Vilany, Sandra, Sara, Wênia
--
-- OBJETIVO:
--   Corrigir apenas billing_cycle e/ou current_period_end em
--   subscriptions. Após corrigir, executar novamente:
--
--     SELECT * FROM public.grant_missing_monthly_credits_for_active_subscriptions();
--
--   As contas corrigidas devem aparecer como DRY_RUN.
--   Só então executar com p_dry_run = false.
--
-- ANTES DE EXECUTAR QUALQUER BLOCO:
--   1. Rodar 20260616_audit_specific_subscribers_missing_credits.sql
--   2. Confirmar classificação de cada tenant neste arquivo
--   3. Confirmar que o SELECT do diagnóstico dentro do BEGIN retorna
--      exatamente as linhas esperadas
--   4. Executar o BEGIN/ROLLBACK e revisar o resultado do RETURNING
--   5. Substituir ROLLBACK por COMMIT apenas após revisão
--
-- REGRAS ABSOLUTAS:
--   - Não alterar saldo (credits_wallet.balance)
--   - Não conceder créditos (credits_ledger)
--   - Não tocar em credit_batches, credits_wallet, credit_operations
--   - Não tocar em créditos de 60 dias / expiração
--   - Não mexer em kiwify_purchases, kiwify_webhook_logs
--   - Casos ambíguos: APENAS diagnosticar; nunca atualizar
--   - Apenas subscriptions.billing_cycle e/ou subscriptions.current_period_end
-- ============================================================


-- ============================================================
-- BLOCO A — billing_cycle NULL → 'annual'
--           Casos SEGUROS: compra Kiwify com product_key '%ANNUAL%'
--
-- Critério de segurança:
--   - billing_cycle IS NULL
--   - status = 'ACTIVE'
--   - Existe compra APPROVED com product_key LIKE '%ANNUAL%'
--     vinculada ao tenant diretamente (tenant_id) ou por email
--
-- Correção: SET billing_cycle = 'annual'
-- NÃO altera current_period_end (esse período pode estar correto
-- se já > 300 dias, ou será corrigido no Bloco C se < 300 dias).
-- ============================================================

-- DIAGNÓSTICO (executar primeiro, antes do BEGIN):
SELECT
  t.id                                              AS tenant_id,
  t.name                                            AS tenant_name,
  upper(pl.name)                                    AS plan_code,
  s.id                                              AS subscription_id,
  s.status                                          AS sub_status,
  s.billing_cycle                                   AS billing_cycle_atual,
  'annual'                                          AS billing_cycle_proposto,
  s.current_period_start,
  s.current_period_end,
  EXTRACT(DAY FROM (s.current_period_end - s.current_period_start))::int
                                                    AS period_length_days,
  kp.product_key,
  kp.plan_code                                      AS kiwify_plan_code,
  kp.paid_at,
  kp.provider_order_id
FROM public.subscriptions s
JOIN public.tenants t ON t.id = s.tenant_id
JOIN public.plans pl ON pl.id = s.plan_id
JOIN public.kiwify_purchases kp
  ON (kp.tenant_id = s.tenant_id
      OR lower(trim(kp.email)) = (
        SELECT lower(trim(u.email))
        FROM public.users u
        WHERE u.tenant_id = s.tenant_id
        ORDER BY u.created_at ASC LIMIT 1
      ))
  AND kp.status = 'APPROVED'
  AND upper(kp.product_key) LIKE '%ANNUAL%'
WHERE s.billing_cycle IS NULL
  AND s.status = 'ACTIVE'
  AND upper(pl.name) IN ('PRO', 'MASTER', 'PREMIUM')
  AND NOT COALESCE(t.is_internal, false)
  AND t.name ILIKE ANY(ARRAY[
    '%Diana%','%Francisca%','%Geizaceleste%','%Nilmaria%','%Vanusa%',
    '%Genicleide%','%Jeanne%','%Lais%','%Luciene%','%Lusenir%',
    '%Maria Expedita%','%Maria Vilany%','%Sandra%','%Sara%','%Wenia%','%Wênia%'
  ])
ORDER BY t.name;

-- UPDATE PROPOSTO — billing_cycle NULL → 'annual' com compra ANNUAL (NÃO EXECUTAR SEM REVISÃO):
/*
BEGIN;

UPDATE public.subscriptions s
SET
  billing_cycle = 'annual',
  updated_at    = now()
FROM public.tenants t
JOIN public.plans pl ON pl.id = s.plan_id
WHERE s.tenant_id     = t.id
  AND s.billing_cycle IS NULL
  AND s.status        = 'ACTIVE'
  AND upper(pl.name)  IN ('PRO', 'MASTER', 'PREMIUM')
  AND NOT COALESCE(t.is_internal, false)
  AND t.name ILIKE ANY(ARRAY[
    '%Diana%','%Francisca%','%Geizaceleste%','%Nilmaria%','%Vanusa%',
    '%Genicleide%','%Jeanne%','%Lais%','%Luciene%','%Lusenir%',
    '%Maria Expedita%','%Maria Vilany%','%Sandra%','%Sara%','%Wenia%','%Wênia%'
  ])
  AND EXISTS (
    SELECT 1 FROM public.kiwify_purchases kp
    WHERE (
      kp.tenant_id = s.tenant_id
      OR lower(trim(kp.email)) = (
        SELECT lower(trim(u.email))
        FROM public.users u
        WHERE u.tenant_id = s.tenant_id
        ORDER BY u.created_at ASC LIMIT 1
      )
    )
    AND kp.status     = 'APPROVED'
    AND upper(kp.product_key) LIKE '%ANNUAL%'
  )
RETURNING
  s.id              AS subscription_id,
  t.id              AS tenant_id,
  t.name            AS tenant_name,
  s.billing_cycle,  -- deve exibir 'annual' após UPDATE
  s.current_period_start,
  s.current_period_end,
  s.updated_at;

-- REVISAR OS ROWS ACIMA ANTES DE CONTINUAR!
-- Confirmar: apenas os tenants esperados apareceram?
-- Confirmar: billing_cycle = 'annual' para todos?
-- Se OK → trocar ROLLBACK por COMMIT.
ROLLBACK; -- TROCAR POR COMMIT APÓS REVISÃO

*/


-- ============================================================
-- BLOCO B — billing_cycle NULL → 'monthly'
--           Casos SEGUROS: compra Kiwify com product_key '%MONTHLY%'
--
-- Critério de segurança:
--   - billing_cycle IS NULL
--   - status = 'ACTIVE'
--   - Existe compra APPROVED com product_key LIKE '%MONTHLY%'
--   - NÃO existe compra com product_key '%ANNUAL%' (prevalência anual)
--
-- Correção: SET billing_cycle = 'monthly'
-- ============================================================

-- DIAGNÓSTICO (executar primeiro):
SELECT
  t.id                                              AS tenant_id,
  t.name                                            AS tenant_name,
  upper(pl.name)                                    AS plan_code,
  s.id                                              AS subscription_id,
  s.status                                          AS sub_status,
  s.billing_cycle                                   AS billing_cycle_atual,
  'monthly'                                         AS billing_cycle_proposto,
  s.current_period_start,
  s.current_period_end,
  EXTRACT(DAY FROM (s.current_period_end - s.current_period_start))::int
                                                    AS period_length_days,
  kp.product_key,
  kp.plan_code                                      AS kiwify_plan_code,
  kp.paid_at,
  kp.provider_order_id
FROM public.subscriptions s
JOIN public.tenants t ON t.id = s.tenant_id
JOIN public.plans pl ON pl.id = s.plan_id
JOIN public.kiwify_purchases kp
  ON (kp.tenant_id = s.tenant_id
      OR lower(trim(kp.email)) = (
        SELECT lower(trim(u.email))
        FROM public.users u
        WHERE u.tenant_id = s.tenant_id
        ORDER BY u.created_at ASC LIMIT 1
      ))
  AND kp.status = 'APPROVED'
  AND upper(kp.product_key) LIKE '%MONTHLY%'
WHERE s.billing_cycle IS NULL
  AND s.status = 'ACTIVE'
  AND upper(pl.name) IN ('PRO', 'MASTER', 'PREMIUM')
  AND NOT COALESCE(t.is_internal, false)
  AND t.name ILIKE ANY(ARRAY[
    '%Diana%','%Francisca%','%Geizaceleste%','%Nilmaria%','%Vanusa%',
    '%Genicleide%','%Jeanne%','%Lais%','%Luciene%','%Lusenir%',
    '%Maria Expedita%','%Maria Vilany%','%Sandra%','%Sara%','%Wenia%','%Wênia%'
  ])
  -- Garantia: sem compra ANNUAL (se tiver, vai para o Bloco A)
  AND NOT EXISTS (
    SELECT 1 FROM public.kiwify_purchases kp2
    WHERE (kp2.tenant_id = s.tenant_id
      OR lower(trim(kp2.email)) = (
        SELECT lower(trim(u.email))
        FROM public.users u
        WHERE u.tenant_id = s.tenant_id
        ORDER BY u.created_at ASC LIMIT 1
      ))
    AND kp2.status = 'APPROVED'
    AND upper(kp2.product_key) LIKE '%ANNUAL%'
  )
ORDER BY t.name;

-- UPDATE PROPOSTO — billing_cycle NULL → 'monthly' (NÃO EXECUTAR SEM REVISÃO):
/*
BEGIN;

UPDATE public.subscriptions s
SET
  billing_cycle = 'monthly',
  updated_at    = now()
FROM public.tenants t
JOIN public.plans pl ON pl.id = s.plan_id
WHERE s.tenant_id     = t.id
  AND s.billing_cycle IS NULL
  AND s.status        = 'ACTIVE'
  AND upper(pl.name)  IN ('PRO', 'MASTER', 'PREMIUM')
  AND NOT COALESCE(t.is_internal, false)
  AND t.name ILIKE ANY(ARRAY[
    '%Diana%','%Francisca%','%Geizaceleste%','%Nilmaria%','%Vanusa%',
    '%Genicleide%','%Jeanne%','%Lais%','%Luciene%','%Lusenir%',
    '%Maria Expedita%','%Maria Vilany%','%Sandra%','%Sara%','%Wenia%','%Wênia%'
  ])
  AND EXISTS (
    SELECT 1 FROM public.kiwify_purchases kp
    WHERE (
      kp.tenant_id = s.tenant_id
      OR lower(trim(kp.email)) = (
        SELECT lower(trim(u.email))
        FROM public.users u
        WHERE u.tenant_id = s.tenant_id
        ORDER BY u.created_at ASC LIMIT 1
      )
    )
    AND kp.status     = 'APPROVED'
    AND upper(kp.product_key) LIKE '%MONTHLY%'
  )
  -- Não sobrescrever casos com compra ANNUAL (Bloco A tem prioridade)
  AND NOT EXISTS (
    SELECT 1 FROM public.kiwify_purchases kp2
    WHERE (
      kp2.tenant_id = s.tenant_id
      OR lower(trim(kp2.email)) = (
        SELECT lower(trim(u.email))
        FROM public.users u
        WHERE u.tenant_id = s.tenant_id
        ORDER BY u.created_at ASC LIMIT 1
      )
    )
    AND kp2.status    = 'APPROVED'
    AND upper(kp2.product_key) LIKE '%ANNUAL%'
  )
RETURNING
  s.id              AS subscription_id,
  t.id              AS tenant_id,
  t.name            AS tenant_name,
  s.billing_cycle,  -- deve exibir 'monthly' após UPDATE
  s.current_period_start,
  s.current_period_end,
  s.updated_at;

ROLLBACK; -- TROCAR POR COMMIT APÓS REVISÃO

*/


-- ============================================================
-- BLOCO C — current_period_end vencido + billing_cycle = 'annual'
--           + período < 300 dias (bug da Sprint P1 — 30 dias no lugar de 12 meses)
--
-- Este é o bug documentado em 20260615000001_fix_annual_period_and_last_reset_at.sql:
--   activate_purchase_for_user usava now() + 30 dias para qualquer ciclo.
--   Assinaturas anuais gravadas antes da Sprint P1 têm period_end errado.
--
-- Critério de segurança (TODOS devem ser verdadeiros):
--   - billing_cycle = 'annual' (ciclo já definido corretamente)
--   - status = 'ACTIVE'
--   - current_period_end < now() (assinatura aparece como vencida)
--   - (current_period_end - current_period_start) < 300 dias (bug confirmado)
--   - tenant está na lista dos 15 do dry run
--
-- Correção: SET current_period_end = current_period_start + INTERVAL '12 months'
--
-- IMPORTANTE: Este bloco NÃO atualiza billing_cycle (já está correto = 'annual')
--             e NÃO concede créditos.
-- ============================================================

-- DIAGNÓSTICO (executar primeiro):
SELECT
  t.id                                              AS tenant_id,
  t.name                                            AS tenant_name,
  upper(pl.name)                                    AS plan_code,
  s.id                                              AS subscription_id,
  s.status                                          AS sub_status,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end                              AS current_period_end_atual,
  s.current_period_start + interval '12 months'    AS proposed_period_end,
  EXTRACT(DAY FROM (s.current_period_end - s.current_period_start))::int
                                                    AS period_length_days,
  EXTRACT(DAY FROM (now() - s.current_period_end))::int
                                                    AS days_overdue,
  s.provider,
  s.provider_sub_id,
  s.created_at                                      AS sub_created_at,
  -- Confirmar existência de compra anual (reforço de segurança)
  kp.product_key                                    AS confirmed_by_purchase,
  kp.paid_at                                        AS purchase_paid_at
FROM public.subscriptions s
JOIN public.tenants t ON t.id = s.tenant_id
JOIN public.plans pl ON pl.id = s.plan_id
LEFT JOIN public.kiwify_purchases kp
  ON (kp.tenant_id = s.tenant_id
      OR lower(trim(kp.email)) = (
        SELECT lower(trim(u.email))
        FROM public.users u
        WHERE u.tenant_id = s.tenant_id
        ORDER BY u.created_at ASC LIMIT 1
      ))
  AND kp.status = 'APPROVED'
  AND upper(kp.product_key) LIKE '%ANNUAL%'
WHERE s.billing_cycle = 'annual'
  AND s.status        = 'ACTIVE'
  AND s.current_period_start IS NOT NULL
  AND s.current_period_end IS NOT NULL
  AND s.current_period_end < now()
  AND (s.current_period_end - s.current_period_start) < interval '300 days'
  AND NOT COALESCE(t.is_internal, false)
  AND t.name ILIKE ANY(ARRAY[
    '%Diana%','%Francisca%','%Geizaceleste%','%Nilmaria%','%Vanusa%',
    '%Genicleide%','%Jeanne%','%Lais%','%Luciene%','%Lusenir%',
    '%Maria Expedita%','%Maria Vilany%','%Sandra%','%Sara%','%Wenia%','%Wênia%'
  ])
ORDER BY t.name;

-- UPDATE PROPOSTO — Estender current_period_end para 12 meses (NÃO EXECUTAR SEM REVISÃO):
/*
BEGIN;

UPDATE public.subscriptions s
SET
  current_period_end = s.current_period_start + interval '12 months',
  updated_at         = now()
FROM public.tenants t
JOIN public.plans pl ON pl.id = s.plan_id
WHERE s.tenant_id          = t.id
  AND s.billing_cycle      = 'annual'
  AND s.status             = 'ACTIVE'
  AND s.current_period_start IS NOT NULL
  AND s.current_period_end IS NOT NULL
  AND s.current_period_end < now()
  AND (s.current_period_end - s.current_period_start) < interval '300 days'
  AND NOT COALESCE(t.is_internal, false)
  AND t.name ILIKE ANY(ARRAY[
    '%Diana%','%Francisca%','%Geizaceleste%','%Nilmaria%','%Vanusa%',
    '%Genicleide%','%Jeanne%','%Lais%','%Luciene%','%Lusenir%',
    '%Maria Expedita%','%Maria Vilany%','%Sandra%','%Sara%','%Wenia%','%Wênia%'
  ])
RETURNING
  s.id                AS subscription_id,
  t.id                AS tenant_id,
  t.name              AS tenant_name,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end  -- novo valor: deve ser period_start + 12 meses
;

-- CONFIRMAR: period_end = period_start + 12 meses para cada linha?
-- CONFIRMAR: apenas os tenants esperados foram afetados?
ROLLBACK; -- TROCAR POR COMMIT APÓS REVISÃO

*/


-- ============================================================
-- BLOCO D — billing_cycle NULL + período inferido como anual
--           (sem product_key explícito, mas período > 300 dias)
--
-- Critério de segurança (MODERADO):
--   - billing_cycle IS NULL
--   - status = 'ACTIVE'
--   - (current_period_end - current_period_start) > 300 dias
--   - NÃO existe compra com product_key LIKE '%ANNUAL%' ou '%MONTHLY%'
--     (não entrou no Bloco A nem B)
--
-- ATENÇÃO: A inferência pelo período é menos segura que a evidência
-- por product_key. Revisar manualmente antes de executar.
-- ============================================================

-- DIAGNÓSTICO (somente leitura — decidir manualmente se é safe):
SELECT
  t.id                                              AS tenant_id,
  t.name                                            AS tenant_name,
  upper(pl.name)                                    AS plan_code,
  s.id                                              AS subscription_id,
  s.billing_cycle                                   AS billing_cycle_atual,
  s.current_period_start,
  s.current_period_end,
  EXTRACT(DAY FROM (s.current_period_end - s.current_period_start))::int
                                                    AS period_length_days,
  'annual_inferido_pelo_periodo'                    AS inferencia,
  'NEEDS_MANUAL_REVIEW'                             AS classificacao,
  'Sem compra com product_key ANNUAL — confirmar no painel Kiwify antes de corrigir'
                                                    AS nota
FROM public.subscriptions s
JOIN public.tenants t ON t.id = s.tenant_id
JOIN public.plans pl ON pl.id = s.plan_id
WHERE s.billing_cycle IS NULL
  AND s.status = 'ACTIVE'
  AND s.current_period_start IS NOT NULL
  AND s.current_period_end IS NOT NULL
  AND (s.current_period_end - s.current_period_start) > interval '300 days'
  AND NOT COALESCE(t.is_internal, false)
  AND t.name ILIKE ANY(ARRAY[
    '%Diana%','%Francisca%','%Geizaceleste%','%Nilmaria%','%Vanusa%',
    '%Genicleide%','%Jeanne%','%Lais%','%Luciene%','%Lusenir%',
    '%Maria Expedita%','%Maria Vilany%','%Sandra%','%Sara%','%Wenia%','%Wênia%'
  ])
  -- Excluir os que já têm compra com product_key explícito (vão para A ou B)
  AND NOT EXISTS (
    SELECT 1 FROM public.kiwify_purchases kp
    WHERE (kp.tenant_id = s.tenant_id
      OR lower(trim(kp.email)) = (
        SELECT lower(trim(u.email))
        FROM public.users u
        WHERE u.tenant_id = s.tenant_id
        ORDER BY u.created_at ASC LIMIT 1
      ))
    AND kp.status = 'APPROVED'
    AND upper(kp.product_key) IN ('PRO_ANNUAL','MASTER_ANNUAL','PRO_MONTHLY','MASTER_MONTHLY')
  )
ORDER BY t.name;

-- UPDATE PARA BLOCO D — COMENTADO: NÃO EXECUTAR SEM REVISÃO MANUAL INDIVIDUAL
/*
-- Descomente linha a linha e ajuste o tenant_id específico após revisar:

BEGIN;

-- Exemplo de correção individual para um tenant específico (substituir UUID real):
-- UPDATE public.subscriptions
-- SET billing_cycle = 'annual', updated_at = now()
-- WHERE tenant_id = '<UUID-DO-TENANT-AQUI>'
--   AND billing_cycle IS NULL
--   AND status = 'ACTIVE'
-- RETURNING id, tenant_id, billing_cycle, current_period_start, current_period_end;

ROLLBACK;
*/


-- ============================================================
-- BLOCO E — SUBSCRIPTION_EXPIRED com billing_cycle 'monthly'
--           (webhook subscription_renewed não chegou)
--
-- Situação: assinatura mensal com status ACTIVE mas current_period_end
-- vencido. A assinante provavelmente renovou na Kiwify mas o webhook
-- subscription_renewed não foi processado (falha de entrega ou produto
-- sem ID no catálogo local).
--
-- Ação segura: NÃO atualizar automaticamente.
--   1. Verificar no painel Kiwify se a cobrança mensal ocorreu.
--   2. Se sim, o webhook perdido deve ser reprocessado — ou o
--      current_period_end deve ser estendido manualmente mês a mês.
--   3. Se não, a assinante de fato cancelou ou não pagou.
--
-- Este bloco SOMENTE LISTA para revisão manual.
-- ============================================================

SELECT
  t.id                                              AS tenant_id,
  t.name                                            AS tenant_name,
  upper(pl.name)                                    AS plan_code,
  s.id                                              AS subscription_id,
  s.status                                          AS sub_status,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  EXTRACT(DAY FROM (now() - s.current_period_end))::int
                                                    AS days_overdue,
  s.last_payment_status,
  s.provider,
  s.provider_sub_id,
  -- Última compra/renovação Kiwify para referência
  kp.product_key                                    AS last_purchase_product_key,
  kp.paid_at                                        AS last_purchase_paid_at,
  kp.provider_order_id,
  -- Último evento webhook
  wl.event_type                                     AS last_webhook_event,
  wl.processed_at                                   AS last_webhook_at,
  'NEEDS_MANUAL_REVIEW'                             AS classificacao,
  'Verificar no painel Kiwify se a assinante renovou. Se sim, estender period_end manualmente.'
                                                    AS instrucao
FROM public.subscriptions s
JOIN public.tenants t ON t.id = s.tenant_id
JOIN public.plans pl ON pl.id = s.plan_id
LEFT JOIN LATERAL (
  SELECT kp2.product_key, kp2.paid_at, kp2.provider_order_id
  FROM public.kiwify_purchases kp2
  WHERE (kp2.tenant_id = s.tenant_id
    OR lower(trim(kp2.email)) = (
      SELECT lower(trim(u.email))
      FROM public.users u
      WHERE u.tenant_id = s.tenant_id
      ORDER BY u.created_at ASC LIMIT 1
    ))
  AND kp2.status = 'APPROVED'
  ORDER BY kp2.paid_at DESC NULLS LAST
  LIMIT 1
) kp ON true
LEFT JOIN LATERAL (
  SELECT wl2.event_type, wl2.processed_at
  FROM public.kiwify_webhook_logs wl2
  WHERE wl2.tenant_id = s.tenant_id
  ORDER BY wl2.processed_at DESC
  LIMIT 1
) wl ON true
WHERE s.billing_cycle = 'monthly'
  AND s.status        = 'ACTIVE'
  AND s.current_period_end IS NOT NULL
  AND s.current_period_end < now()
  AND NOT COALESCE(t.is_internal, false)
  AND t.name ILIKE ANY(ARRAY[
    '%Diana%','%Francisca%','%Geizaceleste%','%Nilmaria%','%Vanusa%',
    '%Genicleide%','%Jeanne%','%Lais%','%Luciene%','%Lusenir%',
    '%Maria Expedita%','%Maria Vilany%','%Sandra%','%Sara%','%Wenia%','%Wênia%'
  ])
ORDER BY days_overdue DESC;

-- CORREÇÃO MENSAL INDIVIDUAL — USE SOMENTE APÓS CONFIRMAR PAGAMENTO NO PAINEL KIWIFY:
/*
BEGIN;

-- Substituir '<UUID-DO-TENANT>' pelo UUID real após confirmar pagamento:
-- UPDATE public.subscriptions
-- SET
--   current_period_end = current_period_end + interval '1 month',
--   updated_at         = now()
-- WHERE tenant_id    = '<UUID-DO-TENANT>'
--   AND billing_cycle = 'monthly'
--   AND status        = 'ACTIVE'
--   AND current_period_end < now()
-- RETURNING id, tenant_id, billing_cycle, current_period_end;

ROLLBACK;
*/


-- ============================================================
-- BLOCO F — CASOS AMBÍGUOS (EXPIRED_NO_PAYMENT_EVIDENCE)
--           Tenants vencidos sem compra Kiwify encontrada
--
-- Ação: Listagem apenas. Verificar fora do banco:
--   - Assinante pagou via canal diferente (ex.: boleto direto, Asaas)?
--   - Assinante cancelou voluntariamente?
--   - Email cadastrado diverge do email Kiwify?
-- ============================================================

SELECT
  t.id                                              AS tenant_id,
  t.name                                            AS tenant_name,
  pu.user_email,
  upper(pl.name)                                    AS plan_code,
  s.id                                              AS subscription_id,
  s.status                                          AS sub_status,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  EXTRACT(DAY FROM (now() - s.current_period_end))::int
                                                    AS days_overdue,
  s.provider,
  s.last_payment_status,
  s.created_at                                      AS sub_created_at,
  'EXPIRED_NO_PAYMENT_EVIDENCE'                     AS classificacao,
  'Sem compra APPROVED no kiwify_purchases. Verificar canal de pagamento externo.'
                                                    AS instrucao
FROM public.subscriptions s
JOIN public.tenants t ON t.id = s.tenant_id
JOIN public.plans pl ON pl.id = s.plan_id
LEFT JOIN LATERAL (
  SELECT u.email AS user_email
  FROM public.users u
  WHERE u.tenant_id = s.tenant_id
  ORDER BY u.created_at ASC LIMIT 1
) pu ON true
WHERE s.status        = 'ACTIVE'
  AND s.current_period_end IS NOT NULL
  AND s.current_period_end < now()
  AND NOT COALESCE(t.is_internal, false)
  AND t.name ILIKE ANY(ARRAY[
    '%Diana%','%Francisca%','%Geizaceleste%','%Nilmaria%','%Vanusa%',
    '%Genicleide%','%Jeanne%','%Lais%','%Luciene%','%Lusenir%',
    '%Maria Expedita%','%Maria Vilany%','%Sandra%','%Sara%','%Wenia%','%Wênia%'
  ])
  AND NOT EXISTS (
    SELECT 1
    FROM public.kiwify_purchases kp
    WHERE (kp.tenant_id = s.tenant_id
      OR lower(trim(kp.email)) = pu.user_email)
    AND kp.status = 'APPROVED'
  )
ORDER BY days_overdue DESC;


-- ============================================================
-- VERIFICAÇÃO FINAL — Após executar os BEGINs/COMMITs aprovados,
-- re-verificar o estado dos 15 tenants antes de rodar o grant.
-- ============================================================

-- Executar após corrigir os casos seguros (Blocos A, B, C):
SELECT
  t.name                                            AS tenant_name,
  upper(pl.name)                                    AS plan_code,
  s.billing_cycle,
  s.current_period_end,
  EXTRACT(DAY FROM (now() - s.current_period_end))::int
                                                    AS days_overdue,
  CASE
    WHEN s.billing_cycle IS NULL THEN 'AINDA_NULL — corrigir'
    WHEN s.current_period_end < now() THEN 'AINDA_VENCIDA — corrigir'
    ELSE 'OK — pronto para grant'
  END AS status_pre_grant
FROM public.subscriptions s
JOIN public.tenants t ON t.id = s.tenant_id
JOIN public.plans pl ON pl.id = s.plan_id
WHERE s.status = 'ACTIVE'
  AND NOT COALESCE(t.is_internal, false)
  AND t.name ILIKE ANY(ARRAY[
    '%Diana%','%Francisca%','%Geizaceleste%','%Nilmaria%','%Vanusa%',
    '%Genicleide%','%Jeanne%','%Lais%','%Luciene%','%Lusenir%',
    '%Maria Expedita%','%Maria Vilany%','%Sandra%','%Sara%','%Wenia%','%Wênia%'
  ])
ORDER BY
  CASE
    WHEN s.billing_cycle IS NULL THEN 1
    WHEN s.current_period_end < now() THEN 2
    ELSE 3
  END,
  t.name;

-- ============================================================
-- FIM DO ARQUIVO
-- Nenhuma instrução SQL executável fora dos SELECTs acima
-- (os UPDATEs estão dentro de comentários /* */ ou BEGIN/ROLLBACK).
-- ============================================================