-- ============================================================================
-- AUDITORIA DE SCHEMA — MODELO DE NEGÓCIO INCLUIAI
-- Arquivo : 20260612_audit_business_plans_schema.sql
-- Data    : 2026-06-15
-- Autor   : auditoria automática — sem alteração de dados
-- Regras  : SOMENTE SELECT — nenhum UPDATE/INSERT/DELETE/ALTER/DROP
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. TABELAS RELEVANTES EXISTENTES NO SCHEMA PUBLIC
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (
       table_name ILIKE '%plan%'
    OR table_name ILIKE '%subscription%'
    OR table_name ILIKE '%credit%'
    OR table_name ILIKE '%ledger%'
    OR table_name ILIKE '%wallet%'
    OR table_name ILIKE '%tenant%'
    OR table_name ILIKE '%payment%'
    OR table_name ILIKE '%purchase%'
    OR table_name ILIKE '%kiwify%'
    OR table_name ILIKE '%billing%'
  )
ORDER BY table_name;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. COLUNAS REAIS DA TABELA plans
--    Verifica: code, price_monthly, price_yearly, credits_monthly,
--              ai_credits_per_month, max_students, features_json, is_active
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'plans'
ORDER BY ordinal_position;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. COLUNAS REAIS DA TABELA subscriptions
--    Verifica: billing_cycle, current_period_start, current_period_end,
--              next_due_date, status, plan_id, billing_provider, provider_sub_id
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'subscriptions'
ORDER BY ordinal_position;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. COLUNAS REAIS DA TABELA credits_wallet
--    Verifica: balance, credits_avail, last_reset_at, last_credit_grant_at,
--              next_credit_grant_at, updated_at
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'credits_wallet'
ORDER BY ordinal_position;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. COLUNAS REAIS DA TABELA credits_ledger
--    Verifica: type, amount, operation, source, operation_id, reservation_id
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'credits_ledger'
ORDER BY ordinal_position;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. COLUNAS REAIS DA TABELA tenants
--    Verifica: plano_ativo, status_assinatura, creditos_ia_restantes, ai_credit_limit
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'tenants'
ORDER BY ordinal_position;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. CONSTRAINTS CHECK DAS TABELAS CRÍTICAS
--    Verifica tipos válidos de status e de ledger type
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
  AND tc.table_schema   = cc.constraint_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('subscriptions', 'credits_ledger', 'plans', 'credit_operations')
  AND tc.constraint_type = 'CHECK'
ORDER BY tc.table_name, tc.constraint_name;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. FOREIGN KEYS ENTRE TABELAS DE BILLING
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  tc.table_name            AS origem_tabela,
  kcu.column_name          AS origem_coluna,
  ccu.table_name           AS destino_tabela,
  ccu.column_name          AS destino_coluna,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema   = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema   = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND (
       tc.table_name IN ('subscriptions','credits_wallet','credits_ledger','tenants')
    OR ccu.table_name IN ('plans','tenants')
  )
ORDER BY tc.table_name, kcu.column_name;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. POLÍTICAS RLS NAS TABELAS DE BILLING
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'plans', 'subscriptions', 'credits_wallet', 'credits_ledger',
    'kiwify_purchases', 'kiwify_products', 'kiwify_webhook_logs'
  )
ORDER BY tablename, policyname;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. FUNÇÕES/RPCs RELACIONADAS A CRÉDITOS E BILLING
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  routine_name,
  routine_type,
  security_type,
  data_type AS return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (
       routine_name ILIKE '%credit%'
    OR routine_name ILIKE '%billing%'
    OR routine_name ILIKE '%plan%'
    OR routine_name ILIKE '%subscription%'
    OR routine_name ILIKE '%grant%'
    OR routine_name ILIKE '%activate%'
    OR routine_name ILIKE '%reconcile%'
    OR routine_name ILIKE '%payment%'
    OR routine_name ILIKE '%atomic%'
  )
ORDER BY routine_name;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. ÍNDICES NAS TABELAS DE BILLING (identifica índices de desempenho/unicidade)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  t.relname   AS table_name,
  i.relname   AS index_name,
  ix.indisunique AS is_unique,
  ix.indisprimary AS is_primary,
  array_to_string(
    ARRAY(
      SELECT pg_get_indexdef(ix.indexrelid, k + 1, true)
      FROM generate_subscripts(ix.indkey, 1) AS gs(k)
    ), ', '
  ) AS columns
FROM pg_class t
JOIN pg_index  ix ON t.oid = ix.indrelid
JOIN pg_class  i  ON i.oid = ix.indexrelid
JOIN pg_namespace ns ON t.relnamespace = ns.oid
WHERE ns.nspname = 'public'
  AND t.relname IN (
    'plans', 'subscriptions', 'credits_wallet', 'credits_ledger',
    'kiwify_purchases', 'kiwify_products', 'tenants',
    'credit_operations', 'credit_reservations'
  )
ORDER BY t.relname, i.relname;

-- ────────────────────────────────────────────────────────────────────────────
-- 12. COLUNAS DA TABELA kiwify_products (se existir)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'kiwify_products'
ORDER BY ordinal_position;

-- ────────────────────────────────────────────────────────────────────────────
-- 13. COLUNAS DA TABELA kiwify_purchases (se existir)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'kiwify_purchases'
ORDER BY ordinal_position;

-- ────────────────────────────────────────────────────────────────────────────
-- 14. COLUNAS DA TABELA profiles (plano também é armazenado aqui)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'profiles'
ORDER BY ordinal_position;

-- ────────────────────────────────────────────────────────────────────────────
-- FIM DA AUDITORIA DE SCHEMA
-- Nenhum dado foi alterado. Somente SELECTs executados.
-- ============================================================================