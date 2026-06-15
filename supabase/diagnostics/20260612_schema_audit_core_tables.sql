-- ============================================================
-- AUDITORIA DE SCHEMA — SOMENTE SELECT — NÃO ALTERA DADOS
-- ============================================================
-- Objetivo:     Listar colunas, constraints e policies reais das
--               tabelas core para gerar diagnóstico compatível
-- Data:         2026-06-12
-- Executar:     Supabase SQL Editor (service_role ou postgres)
-- ============================================================
-- PROIBIDO: UPDATE, INSERT, DELETE, ALTER, DROP, TRUNCATE
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABELAS EXISTENTES COM NOMES RELEVANTES
--    Confirma quais tabelas realmente existem no schema public
-- ────────────────────────────────────────────────────────────
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND (
  table_name ILIKE '%user%'
  OR table_name ILIKE '%tenant%'
  OR table_name ILIKE '%subscription%'
  OR table_name ILIKE '%plan%'
  OR table_name ILIKE '%credit%'
  OR table_name ILIKE '%ledger%'
  OR table_name ILIKE '%student%'
  OR table_name ILIKE '%school%'
  OR table_name ILIKE '%payment%'
  OR table_name ILIKE '%purchase%'
)
ORDER BY table_name;

-- ────────────────────────────────────────────────────────────
-- 2. COLUNAS REAIS DAS TABELAS CORE
--    Retorna nome, tipo e nullability de cada coluna
-- ────────────────────────────────────────────────────────────
SELECT
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN (
  'users',
  'subscriptions',
  'plans',
  'credit_wallets',
  'credits_ledger',
  'students',
  'tenants'
)
ORDER BY table_name, ordinal_position;

-- ────────────────────────────────────────────────────────────
-- 3. CONSTRAINTS E FOREIGN KEYS
--    Mostra PKs, UKs e FKs dessas tabelas
-- ────────────────────────────────────────────────────────────
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name  AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema   = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema   = tc.table_schema
WHERE tc.table_schema = 'public'
AND tc.table_name IN (
  'users',
  'subscriptions',
  'plans',
  'credit_wallets',
  'credits_ledger',
  'students',
  'tenants'
)
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- ────────────────────────────────────────────────────────────
-- 4. POLÍTICAS RLS (Row Level Security)
--    Verifica se e como o RLS filtra acesso por tenant/role
-- ────────────────────────────────────────────────────────────
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN (
  'users',
  'subscriptions',
  'plans',
  'credit_wallets',
  'credits_ledger',
  'students',
  'tenants'
)
ORDER BY tablename, policyname;

-- ────────────────────────────────────────────────────────────
-- FIM DA AUDITORIA DE SCHEMA
-- ============================================================