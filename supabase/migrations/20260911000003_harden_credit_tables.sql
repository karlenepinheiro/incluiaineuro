-- Promoted after browser writers were removed. Apply after entrypoint/authority
-- and Kiwify migrations, together with the updated frontend and Edge code.
BEGIN;
DO $hardening$
DECLARE tbl text; col text; pol record;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['credits_wallet','credits_ledger','credit_operations','credit_reservations'] LOOP
    -- Falha se faltar tabela, evitando "sucesso" parcial em schema divergente.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', tbl);
    -- REVOKE de tabela não remove grants de coluna preexistentes.
    FOR col IN SELECT a.attname FROM pg_attribute a
      WHERE a.attrelid = format('public.%I',tbl)::regclass AND a.attnum > 0 AND NOT a.attisdropped
    LOOP
      EXECUTE format('REVOKE SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON public.%2$I FROM PUBLIC, anon, authenticated', col,tbl);
    END LOOP;
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=tbl LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',pol.policyname,tbl);
    END LOOP;
    EXECUTE format('CREATE POLICY financial_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id() OR public.is_super_admin())',tbl);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role',tbl);
    EXECUTE format('CREATE POLICY financial_service ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',tbl);
  END LOOP;
END;
$hardening$;
-- users.ai_credits: não basta REVOKE UPDATE(ai_credits) se há UPDATE na tabela.
-- Trigger INVOKER bloqueia DML direto dos papéis públicos, mas preserva RPCs
-- SECURITY DEFINER executadas pelo owner e service_role. Não substitui auditoria
-- dos owners/EXECUTE de funções nem proteção de tenant_id/is_super_admin.
CREATE OR REPLACE FUNCTION public.guard_direct_legacy_ai_credits()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF current_user IN ('anon','authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      IF COALESCE(NEW.ai_credits,0) <> 0 THEN
        RAISE EXCEPTION 'Direct ai_credits write denied' USING ERRCODE='42501';
      END IF;
    ELSIF NEW.ai_credits IS DISTINCT FROM OLD.ai_credits THEN
      RAISE EXCEPTION 'Direct ai_credits write denied' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='ai_credits') THEN
    DROP TRIGGER IF EXISTS guard_direct_legacy_ai_credits ON public.users;
    CREATE TRIGGER guard_direct_legacy_ai_credits BEFORE INSERT OR UPDATE ON public.users
      FOR EACH ROW EXECUTE FUNCTION public.guard_direct_legacy_ai_credits();
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.guard_direct_legacy_ai_credits() FROM PUBLIC, anon, authenticated;
-- Updatable/owner views must not become an alternative route around table ACL/RLS.
DO $$ DECLARE v record; BEGIN
 FOR v IN WITH RECURSIVE dependent(oid) AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('credits_wallet','credits_ledger','credit_operations','credit_reservations')
  UNION
  SELECT r.ev_class FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid JOIN dependent p ON p.oid=d.refobjid
  WHERE r.ev_class<>p.oid
 ) SELECT c.oid::regclass AS name FROM dependent p JOIN pg_class c ON c.oid=p.oid WHERE c.relkind='v' LOOP
  EXECUTE format('ALTER VIEW %s SET (security_invoker=true)',v.name);
  EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,anon,authenticated',v.name);
  EXECUTE format('GRANT SELECT ON %s TO authenticated,service_role',v.name);
 END LOOP;
END $$;
COMMIT;
