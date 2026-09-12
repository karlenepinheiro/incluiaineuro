-- Financial entrypoints and authority protection. Local sprint; not applied remotely.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_user_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE k text; before_row jsonb; after_row jsonb := to_jsonb(NEW);
BEGIN
  -- SECURITY DEFINER entrypoints execute as owner; ordinary REST executes as JWT role.
  IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    RAISE EXCEPTION 'Use server provisioning for identity creation' USING ERRCODE='42501';
  END IF;
  before_row := to_jsonb(OLD);
  FOREACH k IN ARRAY ARRAY['id','tenant_id','is_super_admin','role','is_active','ai_credits',
    'email','plan','plan_id','is_admin','permissions','admin_role','credits','credits_balance'] LOOP
    IF after_row->k IS DISTINCT FROM before_row->k THEN
      RAISE EXCEPTION 'Protected authority field: %',k USING ERRCODE='42501';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_user_authority ON public.users;
CREATE TRIGGER guard_user_authority BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.guard_user_authority();
DO $$ BEGIN
 IF to_regclass('public.profiles') IS NOT NULL THEN
  DROP TRIGGER IF EXISTS guard_user_authority ON public.profiles;
  CREATE TRIGGER guard_user_authority BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_authority();
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.guard_user_authority() FROM PUBLIC,anon,authenticated;
REVOKE INSERT,DELETE,TRUNCATE ON public.users FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ensure_my_credit_wallet()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t uuid; b integer; fresh uuid;
BEGIN
 SELECT tenant_id INTO t FROM public.users WHERE id=auth.uid() AND is_active;
 IF t IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 -- Lock tenant to serialize bootstrap with other provisioning calls.
 PERFORM 1 FROM public.tenants WHERE id=t FOR UPDATE;
 SELECT balance INTO b FROM public.credits_wallet WHERE tenant_id=t;
 IF FOUND THEN RETURN jsonb_build_object('ok',true,'balance',b); END IF;
 -- Paid credits are granted by purchase activation, never by a browser-triggered bootstrap.
 SELECT ai_credits_per_month INTO b FROM public.plans WHERE upper(name)='FREE' AND is_active LIMIT 1;
 IF b IS NULL OR b<0 THEN RAISE EXCEPTION 'FREE plan catalog missing'; END IF;
 INSERT INTO public.credits_wallet(tenant_id,balance,last_reset_at) VALUES(t,b,now()) RETURNING id INTO fresh;
 INSERT INTO public.credits_ledger(tenant_id,type,amount,description,source,operation_id)
 VALUES(t,'monthly_grant',b,'Provisionamento inicial','server_provisioning','bootstrap:'||t);
 RETURN jsonb_build_object('ok',true,'balance',b);
END $$;
REVOKE ALL ON FUNCTION public.ensure_my_credit_wallet() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ensure_my_credit_wallet() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_change_subscription_plan(p_tenant_id uuid,p_plan_code text,p_operation_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.plans; old_balance integer; op public.credit_operations; result jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT COALESCE(public.is_super_admin(),false) THEN
  RAISE EXCEPTION 'Admin required' USING ERRCODE='42501';
 END IF;
 IF nullif(trim(p_operation_id),'') IS NULL THEN RAISE EXCEPTION 'operation_id required'; END IF;
 SELECT * INTO STRICT p FROM public.plans WHERE upper(name)=upper(p_plan_code) AND is_active;
 PERFORM 1 FROM public.tenants WHERE id=p_tenant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tenant missing'; END IF;
 SELECT * INTO op FROM public.credit_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF op.tenant_id<>p_tenant_id OR op.metadata->>'plan_id' IS DISTINCT FROM p.id::text THEN RAISE EXCEPTION 'Idempotency conflict'; END IF;
  RETURN op.result;
 END IF;
 INSERT INTO public.credits_wallet(tenant_id,balance) VALUES(p_tenant_id,0) ON CONFLICT(tenant_id) DO NOTHING;
 SELECT balance INTO old_balance FROM public.credits_wallet WHERE tenant_id=p_tenant_id FOR UPDATE;
 UPDATE public.subscriptions SET plan_id=p.id,status='ACTIVE',updated_at=now() WHERE tenant_id=p_tenant_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subscription missing'; END IF;
 UPDATE public.tenants SET plan_id=p.id WHERE id=p_tenant_id;
 -- Join identity by id: historical profiles schemas do not all have tenant_id.
 UPDATE public.profiles SET plan=upper(p.name),updated_at=now()
 WHERE id IN (SELECT id FROM public.users WHERE tenant_id=p_tenant_id);
 UPDATE public.credits_wallet SET balance=p.ai_credits_per_month,last_reset_at=now(),updated_at=now() WHERE tenant_id=p_tenant_id;
 INSERT INTO public.credits_ledger(tenant_id,type,amount,description,source,operation_id,metadata)
 VALUES(p_tenant_id,'manual_grant',p.ai_credits_per_month-old_balance,'Troca de plano: '||p.name,
 'admin_change_plan',p_operation_id,jsonb_build_object('before_balance',old_balance,'plan_id',p.id));
 result:=jsonb_build_object('ok',true,'final_balance',p.ai_credits_per_month);
 INSERT INTO public.credit_operations(operation_id,tenant_id,user_id,operation_kind,status,amount,metadata,result,final_balance)
 VALUES(p_operation_id,p_tenant_id,auth.uid(),'grant','succeeded',p.ai_credits_per_month-old_balance,jsonb_build_object('plan_id',p.id),result,p.ai_credits_per_month);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_change_subscription_plan(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_change_subscription_plan(uuid,text,text) TO authenticated,service_role;

-- Catalog/entitlement writes must also be server or explicit admin operations.
CREATE OR REPLACE FUNCTION public.guard_financial_entitlement()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user IN ('anon','authenticated') AND NOT COALESCE(public.is_super_admin(),false) THEN
  RAISE EXCEPTION 'Server financial operation required' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['subscriptions','plans','kiwify_products','kiwify_purchases','admin_users'] LOOP
  IF to_regclass('public.'||t) IS NOT NULL THEN
   EXECUTE format('DROP TRIGGER IF EXISTS guard_financial_entitlement ON public.%I',t);
   EXECUTE format('CREATE TRIGGER guard_financial_entitlement BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_financial_entitlement()',t);
   EXECUTE format('REVOKE TRUNCATE ON public.%I FROM PUBLIC,anon,authenticated',t);
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.guard_financial_entitlement() FROM PUBLIC,anon,authenticated;
COMMIT;
