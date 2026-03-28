-- ============================================================
-- Schema v12 — Correção RLS + GRANT de generated_activities
--
-- PROBLEMA: authenticated não tinha GRANT na tabela.
--           Policies usavam subquery inline em vez de my_tenant_id().
-- SOLUÇÃO:  Recriar policies com my_tenant_id() + GRANT explícito.
--
-- Executar no Supabase SQL Editor (idempotente).
-- ============================================================

-- Garante que a função helper existe (criada no v10/v8, mas idempotente)
CREATE OR REPLACE FUNCTION public.my_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.my_tenant_id() TO anon, authenticated, service_role;

-- ── GRANT de nível de tabela (era o que faltava) ─────────────────────────────
GRANT ALL ON TABLE public.generated_activities TO anon, authenticated, service_role;

-- ── Recriar RLS de generated_activities com my_tenant_id() ──────────────────
ALTER TABLE public.generated_activities ENABLE ROW LEVEL SECURITY;

-- Remove todas as policies antigas (nomes usados nas migrações anteriores)
DROP POLICY IF EXISTS generated_activities_tenant   ON public.generated_activities;
DROP POLICY IF EXISTS generated_activities_insert   ON public.generated_activities;
DROP POLICY IF EXISTS generated_activities_delete   ON public.generated_activities;
DROP POLICY IF EXISTS "ga_select"  ON public.generated_activities;
DROP POLICY IF EXISTS "ga_insert"  ON public.generated_activities;
DROP POLICY IF EXISTS "ga_update"  ON public.generated_activities;
DROP POLICY IF EXISTS "ga_delete"  ON public.generated_activities;

-- SELECT: vê apenas atividades do próprio tenant
CREATE POLICY "ga_select" ON public.generated_activities
  FOR SELECT USING (tenant_id = public.my_tenant_id());

-- INSERT: só pode inserir no próprio tenant
CREATE POLICY "ga_insert" ON public.generated_activities
  FOR INSERT WITH CHECK (tenant_id = public.my_tenant_id());

-- UPDATE: só altera atividades do próprio tenant
CREATE POLICY "ga_update" ON public.generated_activities
  FOR UPDATE USING (tenant_id = public.my_tenant_id());

-- DELETE: só exclui atividades do próprio tenant
CREATE POLICY "ga_delete" ON public.generated_activities
  FOR DELETE USING (tenant_id = public.my_tenant_id());

-- ── Verificação pós-migração (descomente para debug) ─────────────────────────
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'generated_activities';
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'generated_activities' AND table_schema = 'public';
