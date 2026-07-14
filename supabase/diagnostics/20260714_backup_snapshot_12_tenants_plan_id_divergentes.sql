-- ============================================================
-- BACKUP / SNAPSHOT — 12 tenants com tenants.plan_id divergente
-- Executado: 2026-07-14, via `supabase db query --linked` (produção, projeto incluiai / hvjczfncppaodebopbvd)
-- Autorização: CEO — SOMENTE LEITURA (Bloco A + B da proposta de 13/07/2026)
-- Referência: auditorias/2026-07-13_proposta-correcao-tenants-plan-id-divergente-incluiai-2.0.html
--
-- Este arquivo é o backup do Bloco A antes de qualquer UPDATE futuro.
-- Nenhum comando de escrita foi executado para gerar este snapshot.
-- ============================================================

-- QUERY EXECUTADA (Bloco A.1):
/*
SELECT
  t.id                    AS tenant_id,
  t.name                  AS tenant_name,
  t.plan_id                AS tenant_plan_id_atual,
  tp.name                  AS tenant_plan_nome_atual,
  s.id                     AS subscription_id,
  s.plan_id                AS subscription_plan_id,
  sp.name                  AS subscription_plan_nome,
  s.status                 AS subscription_status,
  s.current_period_start,
  s.current_period_end,
  s.provider,
  s.billing_cycle,
  cw.balance                AS credits_balance_atual,
  now()                     AS snapshot_capturado_em
FROM public.tenants t
JOIN public.subscriptions s   ON s.tenant_id = t.id
LEFT JOIN public.plans tp     ON tp.id = t.plan_id
LEFT JOIN public.plans sp     ON sp.id = s.plan_id
LEFT JOIN public.credits_wallet cw ON cw.tenant_id = t.id
WHERE s.status = 'ACTIVE'
  AND s.plan_id IS NOT NULL
  AND t.plan_id IS DISTINCT FROM s.plan_id
ORDER BY t.id;
*/

-- RESULTADO CAPTURADO EM 2026-07-14 13:01:46 UTC — 12 linhas (9 MASTER + 3 PRO)
-- tenant_plan_id_atual (FREE) em TODAS as 12 linhas = c4dd657f-9b0c-4d91-8c76-fc46c9bf5a29
-- subscription_plan_id MASTER = 49fe4d61-97bd-4181-a272-1114ca7f6916
-- subscription_plan_id PRO    = 4be988af-1054-4169-9d42-8be4c1633681
--
-- tenant_id                             | tenant_name                                  | plano_correto | subscription_id                       | credits_balance | current_period_end          | provider | billing_cycle
-- 176f06f1-321d-4813-b81e-0d125b44a10b  | Escola de GENICLEIDE CARVALHO                | MASTER        | b36eab05-ffab-4acc-bb2f-7a0472bc3dbf   | 696              | 2026-06-10 19:26:48.010102  | kiwify   | monthly
-- 364f3d99-c7c0-4918-9102-d03e092f1cd6  | Escola de Maria Vilany Bezerra                | MASTER        | e0fb460d-3a9b-452b-ad37-be26a5a82aaf   | 700              | 2026-06-14 19:07:42.1833    | kiwify   | annual
-- 3691bd69-c268-4d6f-b1d1-9f0f06d5b95f  | Escola de Miriam Oliveira Feitosa             | PRO           | d143c097-308e-4a10-b0c3-3bba4f4806fc   | 500              | 2026-07-03 12:23:14.066981  | kiwify   | monthly
-- 500d2569-4ed1-483b-9797-889c6cac11bb  | Escola de Sara Gonçalves Alves                | MASTER        | 17a8c519-5ecc-4772-9397-dad10a94bdf9   | 683              | 2026-06-12 11:34:47.705443  | kiwify   | annual
-- 503c5efe-6498-4488-a48b-e074f1eebfe9  | Escola de novo lucia maria                    | PRO           | e858553b-6d58-46c7-8aa4-f62ee88f6a5b   | 390              | 2026-05-18 20:34:37.434995  | kiwify   | monthly
-- 59c4aef5-6687-4ea7-b7c4-0b4468e34d03  | Escola de NOVO JOSE CARLOS ALVES PINHEIRO     | MASTER        | 860f8f4d-c89a-4ced-8f98-5c86499d2df7   | 502              | 2026-05-08 19:46:01.843441  | kiwify   | monthly
-- 59e937e6-f66b-4941-a4ad-48bc636ec3f5  | Escola de geizaceleste64                      | PRO           | ee66dba3-dbd1-48c9-a3fe-0f1991d4ce98   | 500              | NULL (ver nota abaixo)      | NONE     | NULL
-- 62fd7090-1fea-4002-be96-a8896abf166a  | Escola de Wênia de Andrade Carvalho           | MASTER        | 9f9d3aca-060e-4fb5-a5d6-4af54d6fa022   | 672              | 2026-06-11 22:45:58.009     | kiwify   | annual
-- 6536ff20-fbe3-42df-acc7-88e17b4dee28  | Escola de maria expedita lima moura           | MASTER        | 2e836245-a05b-4a24-99e4-84e3a0946b59   | 697              | 2026-06-10 19:55:40.800347  | kiwify   | monthly
-- a2337aa3-ed6f-4b5e-acc3-3ac4e6c9683b  | Escola de Jeanne P. Fialho                    | MASTER        | 06f257c2-09ae-4162-bcf7-e78811138f07   | 686              | 2026-06-12 11:59:43.070103  | kiwify   | monthly
-- ed2b6752-86ac-441d-96a3-a0d8e3d0bde7  | Escola de lusenirss                           | MASTER        | 370de75e-df8e-4a48-8f36-46252388c5e9   | 687              | 2026-06-08 22:21:27.89995   | kiwify   | monthly
-- fe081714-1873-4c3b-b0ba-a3d7d3f6ca00  | Escola de Lais da Silva e Silva               | MASTER        | 51310bdd-c256-431a-9eab-27ac0dedb320   | 672              | 2026-06-10 14:49:31.375142  | kiwify   | monthly
--
-- NOTAS:
-- 1. current_period_start = NULL em TODAS as 12 linhas — sintoma já conhecido do bug de
--    ancoragem de período (ver supabase/migrations/20260618000001_fix_subscription_period_anchoring.sql
--    e supabase/diagnostics/20260618_audit_subscription_date_source_geizaceleste.sql). Fora do escopo
--    desta correção (que trata só tenants.plan_id), mas registrado aqui por aparecer no mesmo snapshot.
-- 2. tenant_id 59e937e6 (geizaceleste64) tem provider='NONE' e billing_cycle/current_period_end NULL —
--    já é um caso previamente auditado (20260618_audit_subscription_date_source_geizaceleste.sql).
--    Mesmo assim está corretamente incluído nos 12 por ter subscriptions.status='ACTIVE' e plan_id=PRO
--    com tenants.plan_id=FREE.
-- ============================================================