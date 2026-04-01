-- =============================================================================
-- schema_v17_rls_users_fix.sql
-- Corrige RLS recursivo em public.users + trigger robusto de cadastro
--
-- PROBLEMA RAIZ IDENTIFICADO:
--   Schema v15 adicionou duas policies com subqueries INLINE sobre a propria
--   tabela public.users dentro das policies de public.users:
--
--     users_self_read:
--       USING (id = auth.uid()
--              OR tenant_id = (SELECT tenant_id FROM public.users   <-- RECURSAO
--                              WHERE id = auth.uid() LIMIT 1))
--
--     users_admin_all:
--       USING (EXISTS (SELECT 1 FROM public.users                   <-- RECURSAO
--                      WHERE id = auth.uid() AND is_super_admin = true))
--
--   O PostgreSQL avalia TODAS as policies permissivas do mesmo tipo em conjunto
--   (combinadas com OR). Mesmo que users_select_own (id = auth.uid()) fosse
--   suficiente para retornar o resultado, a presenca de qualquer policy recursiva
--   dispara: ERROR: infinite recursion detected in policy for relation "users"
--   => qualquer SELECT em public.users falha com RLS ligado.
--
-- REGRA FUNDAMENTAL:
--   Subquery inline na policy do proprio table => RECURSAO (errado).
--   Funcao SECURITY DEFINER consultando o mesmo table => SEGURO.
--   (funcao roda como postgres/superuser => bypassa RLS => sem recursao)
--
-- PROBLEMA SECUNDARIO NO TRIGGER:
--   Versoes v13/v15 inseriam role = 'TEACHER', violando a constraint
--   users_role_check que aceita apenas: super_admin, financeiro, operacional,
--   viewer, DOCENTE. O EXCEPTION handler silenciava o erro e o usuario nunca
--   era criado em public.users.
--
-- EXECUTAR EM: Supabase => SQL Editor => New Query => Run
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. FUNCOES SECURITY DEFINER (sem recursao no RLS)
-- -----------------------------------------------------------------------------

-- Ja existe no schema.sql original - garantida aqui por idempotencia.
-- SECURITY DEFINER = roda como postgres (superuser) = bypassa RLS.
-- Nao causa recursao mesmo sendo chamada dentro de uma policy de public.users.
CREATE OR REPLACE FUNCTION public.my_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1
$$;

-- Nova funcao auxiliar para verificar super_admin sem recursao.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_super_admin = true
  )
$$;

-- Garante colunas modernas (caso v15 nao tenha sido aplicado ainda).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name      TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT true;


-- -----------------------------------------------------------------------------
-- 2. REMOVER TODAS AS POLICIES DE public.users (clean slate)
--    Elimina as recursivas do v15 e qualquer residuo de outras versoes.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'users' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', pol.policyname);
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 3. POLICIES CORRETAS - zero subquery inline sobre public.users
-- -----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- SELECT: propria linha - simples, jamais recursivo.
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- SELECT: colegas do mesmo tenant via funcao SECURITY DEFINER (sem recursao).
CREATE POLICY "users_tenant" ON public.users
  FOR SELECT TO authenticated
  USING (tenant_id = public.my_tenant_id());

-- UPDATE: somente o proprio usuario.
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- INSERT: o trigger do Supabase Auth roda como supabase_auth_admin.
-- A funcao SECURITY DEFINER (postgres) ja bypassa RLS, mas esta policy
-- cobre chamadas explicitas dessa role.
CREATE POLICY "auth_admin_can_insert_users" ON public.users
  FOR INSERT TO supabase_auth_admin
  WITH CHECK (true);

-- ALL: super_admin via funcao SECURITY DEFINER - sem recursao.
CREATE POLICY "users_admin_all" ON public.users
  FOR ALL
  USING (public.is_super_admin());


-- -----------------------------------------------------------------------------
-- 4. TRIGGER DE CADASTRO ROBUSTO
--
--    Correcoes em relacao a v13/v15:
--      a) role = 'TEACHER' violava users_role_check => corrigido para 'DOCENTE'
--      b) Tenta INSERT com colunas modernas (full_name, is_super_admin, is_active)
--         e faz fallback para colunas legadas se as modernas nao existirem
--      c) SET search_path = public garante resolucao correta em runtime
--      d) 60 creditos iniciais (FREE = 60/mes conforme aiCosts.ts)
--      e) RETURN NEW no EXCEPTION garante que auth.users sempre e criado
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_user_profile_on_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tenant_id    UUID;
  v_free_plan_id UUID;
  v_nome         TEXT;
  v_inserted     BOOLEAN := false;
BEGIN
  -- Extrai nome do metadata do Supabase Auth
  v_nome := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    split_part(NEW.email, '@', 1),
    'Usuario'
  );

  -- Guard: evita duplicata em re-execucoes ou race condition
  IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Resolve plan_id do FREE (NULL se plano nao existir ainda - FK nullable)
  SELECT id INTO v_free_plan_id
  FROM public.plans
  WHERE UPPER(name) = 'FREE'
  LIMIT 1;

  -- Cria tenant (colunas REAIS confirmadas: name, plan_id, is_active)
  INSERT INTO public.tenants (name, plan_id, is_active)
  VALUES (
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'school_name'), ''),
      'Escola de ' || v_nome
    ),
    v_free_plan_id,
    true
  )
  RETURNING id INTO v_tenant_id;

  -- Tentativa 1: INSERT com colunas modernas (schema v15+)
  BEGIN
    INSERT INTO public.users (
      id, tenant_id, nome, full_name, email,
      role, is_super_admin, is_active
    )
    VALUES (
      NEW.id, v_tenant_id, v_nome, v_nome, NEW.email,
      'DOCENTE', false, true   -- 'DOCENTE' satisfaz users_role_check
    );
    v_inserted := true;
  EXCEPTION
    WHEN undefined_column OR not_null_violation THEN
      v_inserted := false;     -- colunas modernas ausentes, cai no fallback
  END;

  -- Fallback: INSERT com colunas do schema.sql original
  -- (plan e active tem DEFAULT, portanto nao precisam ser informados)
  IF NOT v_inserted THEN
    INSERT INTO public.users (id, tenant_id, nome, email, role)
    VALUES (NEW.id, v_tenant_id, v_nome, NEW.email, 'DOCENTE')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Carteira: 60 creditos iniciais (FREE = 60 creditos/mes)
  INSERT INTO public.credits_wallet (tenant_id, balance)
  VALUES (v_tenant_id, 60)
  ON CONFLICT (tenant_id) DO UPDATE
    SET balance = GREATEST(public.credits_wallet.balance, 60);

  -- Assinatura FREE
  INSERT INTO public.subscriptions (tenant_id, plan_id, status, provider)
  VALUES (v_tenant_id, v_free_plan_id, 'ACTIVE', 'NONE')
  ON CONFLICT DO NOTHING;

  -- Ledger: concessao inicial
  INSERT INTO public.credits_ledger (tenant_id, amount, type, description)
  VALUES (v_tenant_id, 60, 'courtesy', 'Creditos iniciais plano FREE')
  ON CONFLICT DO NOTHING;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Loga o erro real. RETURN NEW garante que auth.users seja criado mesmo
  -- se public.users falhar por algum motivo imprevisto.
  RAISE WARNING 'create_user_profile_on_signup ERRO user_id=%, email=%, msg=%',
    NEW.id, NEW.email, SQLERRM;
  RETURN NEW;
END;
$$;

-- Substitui qualquer trigger existente (handle_new_user ou versao anterior)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_user_profile_on_signup();


-- =============================================================================
-- VERIFICACAO POS-MIGRACAO
-- Descomente cada bloco e execute separadamente no SQL Editor.
-- =============================================================================

-- V1: Nenhuma policy recursiva deve existir (deve retornar 0 linhas)
/*
SELECT policyname, qual
FROM pg_policies
WHERE tablename = 'users' AND schemaname = 'public'
  AND qual LIKE '%SELECT%FROM%users%'
  AND qual NOT LIKE '%my_tenant_id%'
  AND qual NOT LIKE '%is_super_admin()%';
*/

-- V2: Lista as 5 policies corretas
/*
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE tablename = 'users' AND schemaname = 'public'
ORDER BY policyname;
-- Esperado: auth_admin_can_insert_users, users_admin_all,
--           users_select_own, users_tenant, users_update_own
*/

-- V3: Trigger aponta para a funcao correta
/*
SELECT tgname, tgenabled, p.proname AS function_name
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE tgname = 'on_auth_user_created';
-- Esperado: on_auth_user_created | enabled | create_user_profile_on_signup
*/

-- V4: Apos criar usuario de teste, confirma linha em public.users
/*
SELECT id, nome, full_name, email, role, tenant_id, is_super_admin, is_active
FROM public.users
ORDER BY created_at DESC
LIMIT 5;
*/

-- V5: Teste de SELECT com RLS ativo (execute como usuario autenticado, nao postgres)
/*
SELECT id, nome, email, role FROM public.users WHERE id = auth.uid();
-- Deve retornar 1 linha (a do proprio usuario)
*/
