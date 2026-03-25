-- =============================================================================
-- INCLUIAI — PASSO 4: DIAGNÓSTICO / VERIFICAÇÃO
-- Execute este arquivo no Supabase SQL Editor para diagnosticar problemas de login
-- =============================================================================

-- 1. Verifica se os usuários existem em auth.users
SELECT
  id,
  email,
  email_confirmed_at IS NOT NULL AS email_confirmado,
  raw_user_meta_data->>'full_name' AS nome,
  raw_user_meta_data->>'is_super_admin' AS is_super_admin,
  created_at
FROM auth.users
WHERE email IN (
  'ceo@incluiai.com.br',
  'professora@monteiro.edu.br',
  'diretora@santosdumont.edu.br'
)
ORDER BY created_at;

-- 2. Verifica se o trigger criou os perfis em public.users
SELECT
  u.id,
  u.email,
  u.full_name,
  u.role,
  u.is_super_admin,
  t.name AS tenant_name,
  p.name AS plan_name
FROM public.users u
JOIN public.tenants t ON t.id = u.tenant_id
JOIN public.plans   p ON p.id = t.plan_id
WHERE u.email IN (
  'ceo@incluiai.com.br',
  'professora@monteiro.edu.br',
  'diretora@santosdumont.edu.br'
)
ORDER BY u.created_at;

-- 3. Mostra todos os planos cadastrados (deve ser apenas FREE, PRO, MASTER)
SELECT name, max_students, ai_credits_per_month, price_brl FROM public.plans ORDER BY price_brl;

-- 4. Mostra estado das carteiras de crédito
SELECT t.name AS tenant, w.balance AS creditos FROM public.credits_wallet w JOIN public.tenants t ON t.id = w.tenant_id;

-- =============================================================================
-- SE A CONSULTA 1 RETORNAR LINHAS MAS A CONSULTA 2 RETORNAR VAZIO:
-- O trigger handle_new_user() falhou ao criar public.users.
-- Execute o bloco abaixo para criar manualmente:
-- =============================================================================

/*
INSERT INTO public.users (id, tenant_id, full_name, email, role, is_super_admin) VALUES
  ('10000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000001','CEO IncluiAI',         'ceo@incluiai.com.br',         'ADMIN',   true),
  ('10000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000002','Ana Paula Ferreira',   'professora@monteiro.edu.br',   'TEACHER', false),
  ('10000000-0000-0000-0000-000000000030','10000000-0000-0000-0000-000000000003','Beatriz Santos Lima',  'diretora@santosdumont.edu.br', 'MANAGER', false)
ON CONFLICT (id) DO NOTHING;
*/

-- =============================================================================
-- SE NENHUMA CONSULTA RETORNAR LINHAS:
-- O seed (03_seed.sql) não foi executado ainda.
-- Execute 01_reset.sql → 02_schema.sql → 03_seed.sql nessa ordem.
-- =============================================================================
