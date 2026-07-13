-- ============================================================
-- 20260618_audit_subscription_date_source_geizaceleste.sql
--
-- AUDITORIA: Origem da data de início da assinatura anual
--            Geizaceleste e Miriam — PRO ANUAL
--
-- OBJETIVO: Identificar por que kp.paid_at está em 11/05/2026
--           enquanto a CEO confirma pagamento em 08/05/2026.
--
-- CONCLUSÃO ANTECIPADA (documentada no código abaixo):
--   O webhook kiwify-webhook/index.ts usa new Date() como paid_at
--   em vez de ler o campo do payload da Kiwify. O valor em kp.paid_at
--   reflete quando o webhook processou o evento, não quando o pagamento
--   ocorreu na Kiwify. O patch atual (proposed_fix_pro_annual_cycle_
--   geiza_miriam_DO_NOT_RUN.sql) usa kp.paid_at → data errada.
--
-- SOMENTE SELECT — NENHUM DADO É ALTERADO.
-- ============================================================


-- ============================================================
-- PRE_SCHEMA_CHECK — confirma colunas antes de consultar
-- ============================================================
SELECT
  t.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.tables t
JOIN information_schema.columns c
  ON c.table_schema = t.table_schema
  AND c.table_name  = t.table_name
WHERE t.table_schema = 'public'
  AND t.table_name IN (
    'kiwify_purchases',
    'kiwify_products',
    'kiwify_webhook_logs',
    'users',
    'tenants',
    'subscriptions',
    'plans',
    'admin_audit_logs'
  )
ORDER BY t.table_name, c.ordinal_position;


-- ============================================================
-- SEÇÃO 1 — Todas as compras Kiwify de Geizaceleste
--
-- Busca por AMBOS os emails e pelo tenant_id.
-- Objetivo: listar todos os registros, datas e status para
-- identificar quantos eventos existem e quando ocorreram.
-- ============================================================
SELECT
  '=== KIWIFY_PURCHASES — GEIZACELESTE ===' AS secao,
  kp.id                                      AS purchase_id,
  kp.email                                   AS purchase_email,
  kp.product_key,
  kp.plan_code,
  kp.status,
  kp.activation_status,
  kp.paid_at,           -- ATENÇÃO: gerado pelo webhook como now(), NÃO é o paid_at real da Kiwify
  kp.created_at,        -- quando a linha foi inserida no banco
  kp.activated_at,      -- quando foi ativada (pode ser data de reconciliação)
  kp.tenant_id,
  kp.provider_order_id,
  -- Extrai possíveis campos de data do payload Kiwify bruto:
  -- A Kiwify pode enviar order.approved_at, order.created_at, etc.
  -- Se esses campos existirem no payload, representam a data real do pagamento.
  kp.payload->>'approved_date'                              AS payload_approved_date,
  kp.payload->'order'->>'approved_date'                    AS payload_order_approved_date,
  kp.payload->'order'->>'created_at'                       AS payload_order_created_at,
  kp.payload->>'created_at'                                AS payload_created_at,
  kp.payload->'order'->>'updated_at'                       AS payload_order_updated_at,
  kp.payload->>'order_date'                                AS payload_order_date,
  kp.payload->'order'->>'payment_date'                     AS payload_payment_date,
  kp.payload->>'payment_date'                              AS payload_payment_date_root
FROM public.kiwify_purchases kp
WHERE lower(trim(kp.email)) IN (
    'geizaceleste29@gmail.com',
    'geizaceleste64@gmail.com'
  )
  OR kp.tenant_id = '59e937e6-f66b-4941-a4ad-48bc636ec3f5'
ORDER BY kp.created_at ASC;


-- ============================================================
-- SEÇÃO 2 — Todas as compras Kiwify de Miriam
-- ============================================================
SELECT
  '=== KIWIFY_PURCHASES — MIRIAM ===' AS secao,
  kp.id                                AS purchase_id,
  kp.email                             AS purchase_email,
  kp.product_key,
  kp.plan_code,
  kp.status,
  kp.activation_status,
  kp.paid_at,
  kp.created_at,
  kp.activated_at,
  kp.tenant_id,
  kp.provider_order_id,
  kp.payload->>'approved_date'                              AS payload_approved_date,
  kp.payload->'order'->>'approved_date'                    AS payload_order_approved_date,
  kp.payload->'order'->>'created_at'                       AS payload_order_created_at,
  kp.payload->>'created_at'                                AS payload_created_at
FROM public.kiwify_purchases kp
WHERE lower(trim(kp.email)) = 'miriam123.om@gmail.com'
ORDER BY kp.created_at ASC;


-- ============================================================
-- SEÇÃO 3 — Webhook logs de Geizaceleste (todos os order_ids)
--
-- Mostra quantos eventos chegaram da Kiwify e quando,
-- para rastrear por que paid_at pode estar em 11/05.
-- ============================================================
SELECT
  '=== KIWIFY_WEBHOOK_LOGS — GEIZACELESTE ===' AS secao,
  wl.id,
  wl.kiwify_order_id,
  wl.event_type,
  wl.tenant_id,
  wl.plan_code,
  wl.processed_at,       -- quando o evento chegou e foi processado
  wl.raw_payload->>'approved_date'                  AS payload_approved_date,
  wl.raw_payload->'order'->>'approved_date'         AS order_approved_date,
  wl.raw_payload->'order'->>'created_at'            AS order_created_at,
  wl.raw_payload->>'created_at'                     AS root_created_at
FROM public.kiwify_webhook_logs wl
WHERE wl.kiwify_order_id IN (
  SELECT DISTINCT kp.provider_order_id
  FROM   public.kiwify_purchases kp
  WHERE  lower(trim(kp.email)) IN (
    'geizaceleste29@gmail.com',
    'geizaceleste64@gmail.com'
  )
  OR kp.tenant_id = '59e937e6-f66b-4941-a4ad-48bc636ec3f5'
)
ORDER BY wl.processed_at ASC;


-- ============================================================
-- SEÇÃO 4 — Usuário e tenant de Geizaceleste
-- ============================================================
SELECT
  '=== USERS + TENANTS — GEIZACELESTE ===' AS secao,
  u.id                  AS user_id,
  u.email               AS user_email,
  u.created_at          AS user_created_at,   -- data de cadastro no IncluiAI
  u.tenant_id,
  t.id                  AS tenant_id,
  t.created_at          AS tenant_created_at,
  t.name                AS tenant_name
FROM public.users u
LEFT JOIN public.tenants t ON t.id = u.tenant_id
WHERE lower(trim(u.email)) IN (
    'geizaceleste29@gmail.com',
    'geizaceleste64@gmail.com'
  )
  OR u.tenant_id = '59e937e6-f66b-4941-a4ad-48bc636ec3f5';


-- ============================================================
-- SEÇÃO 5 — Subscription atual de Geizaceleste
-- ============================================================
SELECT
  '=== SUBSCRIPTIONS — GEIZACELESTE ===' AS secao,
  s.id                       AS subscription_id,
  s.tenant_id,
  upper(trim(p.name))        AS plan_code,
  s.billing_cycle,
  s.status,
  s.current_period_start,    -- raramente definido pelo webhook (não atualizado)
  s.current_period_end,      -- definido pelo webhook ou activate_purchase_for_user
  s.provider,
  s.created_at               AS subscription_created_at,
  s.updated_at               AS subscription_updated_at
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
WHERE s.tenant_id = '59e937e6-f66b-4941-a4ad-48bc636ec3f5'
ORDER BY s.created_at DESC;


-- ============================================================
-- SEÇÃO 6 — Subscription atual de Miriam
-- ============================================================
SELECT
  '=== SUBSCRIPTIONS — MIRIAM ===' AS secao,
  s.id                       AS subscription_id,
  s.tenant_id,
  upper(trim(p.name))        AS plan_code,
  s.billing_cycle,
  s.status,
  s.current_period_start,
  s.current_period_end,
  s.provider,
  s.created_at               AS subscription_created_at,
  s.updated_at               AS subscription_updated_at
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
JOIN public.users u ON u.tenant_id = s.tenant_id
WHERE lower(trim(u.email)) = 'miriam123.om@gmail.com'
ORDER BY s.created_at DESC;


-- ============================================================
-- SEÇÃO 7 — Admin audit logs de Geizaceleste
-- ============================================================
SELECT
  '=== ADMIN_AUDIT_LOGS — GEIZACELESTE ===' AS secao,
  al.id,
  al.action,
  al.resource_type,
  al.resource_id,
  al.tenant_id,
  al.performed_by_email,
  al.before_data,
  al.after_data,
  al.reason,
  al.created_at
FROM public.admin_audit_logs al
WHERE al.tenant_id = '59e937e6-f66b-4941-a4ad-48bc636ec3f5'
   OR al.resource_id IN (
     SELECT s.id::text
     FROM   public.subscriptions s
     WHERE  s.tenant_id = '59e937e6-f66b-4941-a4ad-48bc636ec3f5'
   )
ORDER BY al.created_at ASC;


-- ============================================================
-- SEÇÃO 8 — Diagnóstico de datas: comparativo entre fontes
--
-- Resume em uma linha o que cada fonte diz sobre a data
-- da assinatura de Geizaceleste.
-- ============================================================
SELECT
  '=== DIAGNÓSTICO COMPARATIVO — GEIZACELESTE ===' AS diagnostico,

  -- Data confirmada pela CEO (informação humana)
  '2026-05-08 09:28:00-03'::timestamptz          AS data_real_pagamento_kiwify_ceo,

  -- kp.paid_at: gerado pelo webhook como now() no momento do processamento
  -- NÃO é o paid_at real da Kiwify — é a hora em que o evento chegou ao backend
  kp_all.first_paid_at                            AS kp_paid_at_primeiro_evento,
  kp_all.last_paid_at                             AS kp_paid_at_ultimo_evento,

  -- Criação da linha no banco (quando o webhook inseriu)
  kp_all.first_created_at                         AS kp_created_at_primeiro_registro,
  kp_all.last_created_at                          AS kp_created_at_ultimo_registro,

  -- activated_at: quando a compra foi marcada como ativada
  kp_all.last_activated_at                        AS kp_activated_at,

  -- user.created_at: quando a conta foi criada no IncluiAI
  u.created_at                                    AS usuario_criado_em,

  -- subscription: datas atuais
  s.current_period_start                          AS sub_period_start_atual,
  s.current_period_end                            AS sub_period_end_atual,
  s.billing_cycle                                 AS sub_billing_cycle_atual,

  -- O patch atual usaria:
  kp_all.last_paid_at                             AS data_que_patch_usaria,  -- ERRADO: é 11/05

  -- O que deveria ser usado:
  '2026-05-08 09:28:00-03'::timestamptz          AS data_comercialmente_correta,
  '2026-05-08 09:28:00-03'::timestamptz
    + interval '12 months'                        AS period_end_correto,

  -- Diagnóstico
  CASE
    WHEN kp_all.last_paid_at IS NULL THEN
      'PROBLEMA: kp.paid_at NULL — patch usaria fallback current_period_start'
    WHEN date_trunc('day', kp_all.last_paid_at) <>
         date_trunc('day', '2026-05-08'::date)
    THEN
      'DIVERGÊNCIA CONFIRMADA: kp.paid_at (' ||
      to_char(kp_all.last_paid_at, 'DD/MM/YYYY HH24:MI') ||
      ') ≠ data real do pagamento (08/05/2026). Patch PRECISA SER CORRIGIDO.'
    ELSE
      'kp.paid_at coincide com data real do pagamento — patch OK'
  END                                             AS resultado_diagnostico

FROM (
  SELECT
    min(paid_at)      AS first_paid_at,
    max(paid_at)      AS last_paid_at,
    min(created_at)   AS first_created_at,
    max(created_at)   AS last_created_at,
    max(activated_at) AS last_activated_at
  FROM public.kiwify_purchases
  WHERE lower(trim(email)) IN ('geizaceleste29@gmail.com', 'geizaceleste64@gmail.com')
     OR tenant_id = '59e937e6-f66b-4941-a4ad-48bc636ec3f5'
) kp_all
LEFT JOIN public.users u
  ON u.tenant_id = '59e937e6-f66b-4941-a4ad-48bc636ec3f5'
LEFT JOIN public.subscriptions s
  ON s.tenant_id = '59e937e6-f66b-4941-a4ad-48bc636ec3f5';


-- ============================================================
-- SEÇÃO 9 — Verifica se o payload Kiwify contém a data real
--
-- Extrai do payload JSON os campos que a Kiwify envia como
-- data do pagamento. Se existirem, são a fonte confiável.
-- ============================================================
SELECT
  '=== PAYLOAD JSON — CAMPOS DE DATA ===' AS secao,
  kp.id                           AS purchase_id,
  kp.email,
  kp.paid_at                      AS paid_at_gravado_pelo_webhook,
  kp.created_at                   AS linha_criada_em,

  -- Campos comuns que a Kiwify pode enviar no payload:
  kp.payload->>'approved_date'                         AS json_root_approved_date,
  kp.payload->'order'->>'approved_date'                AS json_order_approved_date,
  kp.payload->'order'->>'created_at'                   AS json_order_created_at,
  kp.payload->'order'->>'updated_at'                   AS json_order_updated_at,
  kp.payload->>'created_at'                            AS json_root_created_at,
  kp.payload->>'order_date'                            AS json_root_order_date,
  kp.payload->>'payment_date'                          AS json_root_payment_date,
  kp.payload->'order'->>'payment_date'                 AS json_order_payment_date,
  kp.payload->'subscription'->>'created_at'            AS json_subscription_created_at,
  kp.payload->'subscription'->>'next_payment_date'     AS json_subscription_next_payment,
  -- Lista todas as chaves do root para inspecionar formato real
  jsonb_object_keys(kp.payload)                        AS todas_chaves_root

FROM public.kiwify_purchases kp
WHERE lower(trim(kp.email)) IN ('geizaceleste29@gmail.com', 'geizaceleste64@gmail.com')
   OR kp.tenant_id = '59e937e6-f66b-4941-a4ad-48bc636ec3f5'
ORDER BY kp.created_at ASC;


-- ============================================================
-- SEÇÃO 10 — Recomendação final e resumo do problema
--
-- SOMENTE COMENTÁRIO — nenhum dado alterado.
-- ============================================================

/*
=== ANÁLISE COMPLETA DOS BUGS ENCONTRADOS ===

BUG #1 — CRÍTICO: webhook grava paid_at = now(), não o valor do payload Kiwify
  Arquivo: supabase/functions/kiwify-webhook/index.ts, linha 455
  Código:  paid_at: isApproved ? new Date().toISOString() : null,
  Problema: O webhook NUNCA lê o campo de data de pagamento do payload da Kiwify.
            Usa new Date() = hora atual do servidor no momento do processamento.
            Para Geizaceleste: o pagamento real foi 08/05/2026, mas se a Kiwify
            reenviou o evento em 11/05 (ex: subscription_activated), o UPSERT
            sobrescreveu paid_at para 11/05.
  Impacto: kp.paid_at reflete quando o evento chegou, não quando o cliente pagou.

BUG #2 — CRÍTICO: subscriptions.current_period_start nunca é definido pelo webhook
  Arquivo: supabase/functions/kiwify-webhook/index.ts, linhas 546-555
  O UPDATE na tabela subscriptions inclui apenas:
    plan_id, status, current_period_end, provider, billing_cycle
  current_period_start NÃO é atualizado. Fica com o valor default (NULL ou
  timestamp de signup), desconectado da data real do pagamento.

BUG #3 — GRAVE: activate_purchase_for_user usa now() para period_end e não define period_start
  Arquivo: supabase/migrations/20260615000001_fix_annual_period_and_last_reset_at.sql
  Para anual: v_period_end := now() + interval '12 months'
  Para mensal: v_period_end := now() + interval '1 month'
  Usa agora() em vez de paid_at da compra como âncora do período.
  current_period_start NUNCA é definido nessa RPC.

BUG #4 — GRAVE: reconcile_pending_activations tem o mesmo problema do BUG #3
  Mesmo padrão de now() + interval para period_end.
  NÃO define current_period_start.

=== POR QUE kp.paid_at DE GEIZACELESTE ESTÁ EM 11/05/2026 ===

Hipótese mais provável (confirmável com SEÇÃO 3 acima):
  1. 08/05 — Kiwify envia webhook de compra aprovada.
             Webhook insere kiwify_purchases com paid_at = now() ≈ 08/05 09:28.
             Sem tenant_id (email geizaceleste29@ não tem conta).
             activation_status = 'PENDING_ACCOUNT'.
  2. 11/05 — Geizaceleste cria conta com email geizaceleste64@gmail.com (divergente).
             Email diferente → reconciliação automática falha (busca por email).
  3. 11/05 — Kiwify reenvía evento (subscription_activated ou retry) OU
             CEO aciona reconciliação manual que faz UPSERT.
             UPSERT usa onConflict: 'provider_order_id' e sobrescreve paid_at
             com new Date() = 11/05 08:30.
             OU: a ativação manual via painel CEO atualizou activated_at = 11/05.

=== O QUE O PATCH ATUAL FAZ DE ERRADO ===

O patch (proposed_fix_pro_annual_cycle_geiza_miriam_DO_NOT_RUN.sql) seleciona:
  ORDER BY COALESCE(kp.paid_at, kp.created_at) DESC LIMIT 1
  → pega a compra com paid_at mais recente = 11/05/2026 08:30 (errado)
  → usa esse valor como current_period_start
  → result: current_period_start = 11/05/2026, current_period_end = 11/05/2027

Data comercialmente correta (confirmada pela CEO):
  current_period_start = 2026-05-08 09:28:00 (data real do pagamento Kiwify)
  current_period_end   = 2027-05-08 09:28:00

=== CORREÇÃO NECESSÁRIA NO PATCH ===

Opção A (recomendada): Hard-code a data real do pagamento (confirmada pela CEO)
  v_new_start := '2026-05-08 09:28:00-03'::timestamptz;
  v_new_end   := v_new_start + interval '12 months';

Opção B: Usar campo de data real do payload Kiwify (verificar Seção 9 acima)
  Se kp.payload->'order'->>'approved_date' ou similar existir com '2026-05-08',
  usar esse campo em vez de kp.paid_at.

=== CORREÇÃO PERMANENTE NO WEBHOOK ===

Em kiwify-webhook/index.ts, linha 455:
  ERRADO:  paid_at: isApproved ? new Date().toISOString() : null,
  CORRETO: paid_at: isApproved
    ? (payload?.order?.approved_date
       ?? payload?.approved_date
       ?? payload?.order?.created_at
       ?? new Date().toISOString())
    : null,

Esta correção garante que paid_at reflita a data real da Kiwify quando disponível,
e só usa now() como fallback quando o payload não contiver a data.

=== REGRA COMERCIAL DESEJADA ===

Para plano anual comprado via Kiwify:
  current_period_start = paid_at real da compra aprovada na Kiwify
  current_period_end   = current_period_start + interval '12 months'

NÃO usar: data de cadastro, data de ativação de conta, now().

=== CONFIRMAÇÃO ===

NENHUM DADO FOI ALTERADO POR ESTE ARQUIVO.
Apenas SELECTs foram executados.
*/