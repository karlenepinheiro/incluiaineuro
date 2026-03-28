-- ============================================================
-- Schema v15 — Correção definitiva do trigger de cadastro
-- Executar no Supabase SQL Editor (Dashboard → SQL Editor)
--
-- Problema resolvido:
--   Trigger v8/v13 usava colunas inexistentes no schema real:
--   - tenants: type, status_assinatura, creditos_ia_restantes  ← não existem
--   - users:   plan, active                                     ← não existem
--   O EXCEPTION handler silenciava o erro → perfil nunca criado.
--
-- Colunas reais confirmadas (CSVs exportados do Supabase):
--   tenants: id, name, plan_id, is_active
--   users:   id, tenant_id, nome, full_name, email, role, is_super_admin, is_active
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. Garante colunas de nome nas versões que possam não tê-las
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS nome      TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name TEXT;


-- ─────────────────────────────────────────────────────────────
-- 2. Trigger corrigido — usa somente colunas reais
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_user_profile_on_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant_id    UUID;
  v_free_plan_id UUID;
  v_nome         TEXT;
BEGIN
  v_nome := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Evita duplicata (re-execuções ou race condition)
  IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Resolve plan_id do FREE (NULL se plano não existir — OK, FK nullable)
  SELECT id INTO v_free_plan_id
  FROM public.plans
  WHERE UPPER(name) = 'FREE'
  LIMIT 1;

  -- Cria tenant usando SOMENTE colunas reais: name, plan_id, is_active
  INSERT INTO public.tenants (name, plan_id, is_active)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'school_name', 'Escola de ' || v_nome),
    v_free_plan_id,
    true
  )
  RETURNING id INTO v_tenant_id;

  -- Cria usuário usando SOMENTE colunas reais
  INSERT INTO public.users (id, tenant_id, nome, full_name, email, role, is_super_admin, is_active)
  VALUES (
    NEW.id,
    v_tenant_id,
    v_nome,
    v_nome,
    NEW.email,
    'TEACHER',
    false,
    true
  );

  -- Carteira: 10 créditos iniciais (plano FREE)
  INSERT INTO public.credits_wallet (tenant_id, balance)
  VALUES (v_tenant_id, 10)
  ON CONFLICT (tenant_id) DO UPDATE
    SET balance = GREATEST(public.credits_wallet.balance, 10);

  -- Assinatura FREE
  INSERT INTO public.subscriptions (tenant_id, plan_id, status, provider)
  VALUES (v_tenant_id, v_free_plan_id, 'ACTIVE', 'NONE')
  ON CONFLICT DO NOTHING;

  -- Ledger: registra concessão inicial
  INSERT INTO public.credits_ledger (tenant_id, amount, type, description)
  VALUES (v_tenant_id, 10, 'courtesy', 'Créditos iniciais plano FREE')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Loga o erro real em vez de silenciar completamente
  RAISE WARNING 'create_user_profile_on_signup: ERRO para user_id=%, email=%, mensagem: %',
    NEW.id, NEW.email, SQLERRM;
  RETURN NEW;
END;
$$;

-- Recria o trigger (DROP + CREATE é idempotente)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_profile_on_signup();


-- ─────────────────────────────────────────────────────────────
-- 3. Garante RLS correto na tabela users
--    (permite que o usuário recém-criado leia seu próprio perfil)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_self_read"   ON public.users;
DROP POLICY IF EXISTS "users_self_update" ON public.users;
DROP POLICY IF EXISTS "users_admin_all"   ON public.users;

-- SELECT: próprio usuário ou colegas do mesmo tenant
CREATE POLICY "users_self_read" ON public.users
  FOR SELECT USING (
    id = auth.uid()
    OR tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
  );

-- UPDATE: somente o próprio usuário
CREATE POLICY "users_self_update" ON public.users
  FOR UPDATE USING (id = auth.uid());

-- Super admin: acesso total
CREATE POLICY "users_admin_all" ON public.users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_super_admin = true)
  );


-- ─────────────────────────────────────────────────────────────
-- 4. Verificação pós-migração (descomente e execute para validar)
-- ─────────────────────────────────────────────────────────────
/*
-- Confirma que o trigger está ativo
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';

-- Confirma que a função existe e foi atualizada
SELECT proname, prosrc
FROM pg_proc
WHERE proname = 'create_user_profile_on_signup';

-- Verifica policies na tabela users
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'users';

-- Testa: após criar usuário de teste no Supabase Auth,
-- confirme que ele aparece em public.users:
SELECT id, nome, full_name, email, tenant_id
FROM public.users
ORDER BY created_at DESC
LIMIT 5;
*/
