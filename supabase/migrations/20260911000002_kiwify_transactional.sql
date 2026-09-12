BEGIN;
ALTER TABLE public.kiwify_products ADD COLUMN IF NOT EXISTS billing_cycle text;
UPDATE public.kiwify_products SET billing_cycle=CASE
 WHEN product_name ~* '(anual|annual)' THEN 'annual'
 WHEN product_name ~* '(mensal|monthly)' THEN 'monthly' END WHERE billing_cycle IS NULL;
-- Preserve the two previously hardcoded product IDs in the trusted server catalog.
INSERT INTO public.kiwify_products(kiwify_product_id,product_name,product_type,plan_code,credits_amount,billing_cycle)
VALUES('fa763da0-2d2c-11f1-a3f6-2761766c7eda','Premium anual','subscription','MASTER',700,'annual'),
('da18e220-2d30-11f1-b691-1b4aa493422c','Pro anual','subscription','PRO',500,'annual')
ON CONFLICT(kiwify_product_id) DO NOTHING;
ALTER TABLE public.kiwify_purchases ADD COLUMN IF NOT EXISTS catalog_product_id text;
CREATE TABLE public.kiwify_financial_events(
 order_id text NOT NULL,event text NOT NULL CHECK(event IN ('paid','canceled','overdue')),
 result jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(order_id,event)
);
ALTER TABLE public.kiwify_financial_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kiwify_financial_events FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.apply_verified_kiwify_purchase(p_purchase_id uuid,p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE purchase public.kiwify_purchases; product public.kiwify_products; plan public.plans;
 amount integer; previous integer; cycle text; result jsonb; operation text;
BEGIN
 SELECT * INTO STRICT purchase FROM public.kiwify_purchases WHERE id=p_purchase_id FOR UPDATE;
 IF purchase.status<>'APPROVED' THEN RAISE EXCEPTION 'Purchase not approved'; END IF;
 IF purchase.activated_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'idempotent',true); END IF;
 -- Existing pending purchases retain their verified historical catalog snapshot.
 IF purchase.catalog_product_id IS NOT NULL THEN
  SELECT * INTO STRICT product FROM public.kiwify_products WHERE kiwify_product_id=purchase.catalog_product_id AND is_active;
  cycle:=product.billing_cycle;
 ELSE
  product.product_type:=CASE WHEN purchase.product_key LIKE 'CREDITS_%' THEN 'credits' ELSE 'subscription' END;
  product.plan_code:=purchase.plan_code; product.credits_amount:=purchase.credits_amount;
  cycle:=CASE WHEN purchase.product_key LIKE '%ANNUAL%' THEN 'annual' WHEN purchase.product_key LIKE '%MONTHLY%' THEN 'monthly' END;
 END IF;
 PERFORM 1 FROM public.tenants WHERE id=p_tenant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tenant missing'; END IF;
 INSERT INTO public.credits_wallet(tenant_id,balance) VALUES(p_tenant_id,0) ON CONFLICT(tenant_id) DO NOTHING;
 SELECT balance INTO previous FROM public.credits_wallet WHERE tenant_id=p_tenant_id FOR UPDATE;
 operation:='kiwify:paid:'||purchase.provider_order_id;
 IF product.product_type='subscription' THEN
  IF cycle IS NULL OR cycle NOT IN ('monthly','annual') OR purchase.paid_at IS NULL THEN RAISE EXCEPTION 'Catalog cycle/payment date missing'; END IF;
  SELECT * INTO STRICT plan FROM public.plans WHERE upper(name)=CASE WHEN upper(product.plan_code)='PREMIUM' THEN 'MASTER' ELSE upper(product.plan_code) END AND is_active;
  amount:=plan.ai_credits_per_month;
  UPDATE public.subscriptions SET plan_id=plan.id,status='ACTIVE',provider='kiwify',billing_cycle=cycle,
   current_period_start=purchase.paid_at,current_period_end=purchase.paid_at+CASE cycle WHEN 'annual' THEN interval '1 year' ELSE interval '1 month' END,updated_at=now()
   WHERE tenant_id=p_tenant_id;
  IF NOT FOUND THEN
   INSERT INTO public.subscriptions(tenant_id,plan_id,status,provider,billing_cycle,current_period_start,current_period_end)
   VALUES(p_tenant_id,plan.id,'ACTIVE','kiwify',cycle,purchase.paid_at,purchase.paid_at+CASE cycle WHEN 'annual' THEN interval '1 year' ELSE interval '1 month' END);
  END IF;
  UPDATE public.tenants SET plan_id=plan.id WHERE id=p_tenant_id;
  UPDATE public.profiles SET plan=upper(plan.name),updated_at=now() WHERE id IN (SELECT id FROM public.users WHERE tenant_id=p_tenant_id);
  UPDATE public.credits_wallet SET balance=amount,last_reset_at=now(),updated_at=now() WHERE tenant_id=p_tenant_id;
 ELSE
  amount:=product.credits_amount;
  IF amount IS NULL OR amount<=0 THEN RAISE EXCEPTION 'Invalid catalog credits'; END IF;
  UPDATE public.credits_wallet SET balance=balance+amount,updated_at=now() WHERE tenant_id=p_tenant_id;
 END IF;
 INSERT INTO public.credits_ledger(tenant_id,type,amount,description,source,operation_id,metadata)
 VALUES(p_tenant_id,CASE WHEN product.product_type='subscription' THEN 'monthly_grant' ELSE 'purchase_extra' END,
 CASE WHEN product.product_type='subscription' THEN amount-previous ELSE amount END,
 'Compra Kiwify: '||purchase.provider_order_id,'kiwify_transaction',operation,jsonb_build_object('before_balance',previous,'catalog_credits',amount));
 UPDATE public.kiwify_purchases SET tenant_id=p_tenant_id,activated_at=now() WHERE id=p_purchase_id;
 result:=jsonb_build_object('ok',true,'plan',product.plan_code,'credits_granted',amount,'final_balance',CASE WHEN product.product_type='subscription' THEN amount ELSE previous+amount END);
 INSERT INTO public.credit_operations(operation_id,tenant_id,operation_kind,status,amount,result,final_balance)
 VALUES(operation,p_tenant_id,'grant','succeeded',amount,result,(result->>'final_balance')::integer);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.apply_verified_kiwify_purchase(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.process_verified_kiwify_event(p_order_id text,p_event text,p_email text,p_product_id text,p_paid_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE product public.kiwify_products; purchase public.kiwify_purchases; t uuid; result jsonb; n integer; pkey text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Backend only' USING ERRCODE='42501'; END IF;
 IF nullif(trim(p_order_id),'') IS NULL OR p_event NOT IN ('paid','canceled','overdue') THEN RAISE EXCEPTION 'Invalid event'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('kiwify:'||p_order_id,0));
 SELECT e.result INTO result FROM public.kiwify_financial_events e WHERE order_id=p_order_id AND event=p_event;
 IF FOUND THEN RETURN result||jsonb_build_object('idempotent',true); END IF;
 SELECT * INTO STRICT product FROM public.kiwify_products WHERE kiwify_product_id=p_product_id AND is_active;
 SELECT * INTO purchase FROM public.kiwify_purchases WHERE provider_order_id=p_order_id FOR UPDATE;
 IF FOUND AND (lower(trim(purchase.email))<>lower(trim(p_email)) OR
  (purchase.catalog_product_id IS NOT NULL AND purchase.catalog_product_id<>p_product_id)) THEN RAISE EXCEPTION 'Purchase identity conflict'; END IF;
 SELECT count(DISTINCT u.tenant_id), (array_agg(DISTINCT u.tenant_id))[1] INTO n,t
 FROM public.users u JOIN auth.users a ON a.id=u.id WHERE lower(trim(a.email))=lower(trim(p_email));
 IF n>1 THEN RAISE EXCEPTION 'Ambiguous buyer'; END IF;
 IF purchase.tenant_id IS NOT NULL AND t IS DISTINCT FROM purchase.tenant_id THEN RAISE EXCEPTION 'Buyer tenant conflict'; END IF;
 IF p_event='paid' THEN
  IF p_paid_at IS NULL THEN RAISE EXCEPTION 'Payment date required'; END IF;
  IF purchase.status='CANCELED' THEN RAISE EXCEPTION 'Canceled order cannot be reactivated'; END IF;
  pkey:=CASE WHEN product.product_type='credits' THEN 'CREDITS_'||product.credits_amount
   ELSE product.plan_code||'_'||CASE product.billing_cycle WHEN 'annual' THEN 'ANNUAL' WHEN 'monthly' THEN 'MONTHLY' ELSE 'UNKNOWN_CYCLE' END END;
  IF product.product_type='subscription' AND product.billing_cycle IS NULL THEN RAISE EXCEPTION 'Product cycle missing'; END IF;
  INSERT INTO public.kiwify_purchases(email,product_key,plan_code,credits_amount,provider_order_id,status,paid_at,catalog_product_id)
  VALUES(lower(trim(p_email)),pkey,product.plan_code,product.credits_amount,p_order_id,'APPROVED',p_paid_at,p_product_id)
  ON CONFLICT(provider_order_id) DO UPDATE SET status='APPROVED',paid_at=LEAST(kiwify_purchases.paid_at,EXCLUDED.paid_at),catalog_product_id=EXCLUDED.catalog_product_id,
   product_key=EXCLUDED.product_key,plan_code=EXCLUDED.plan_code,credits_amount=EXCLUDED.credits_amount
  RETURNING * INTO purchase;
  IF t IS NOT NULL THEN result:=public.apply_verified_kiwify_purchase(purchase.id,t);
  ELSE result:=jsonb_build_object('ok',true,'pending_activation',true); END IF;
 ELSE
  -- Out-of-order cancellation is persisted, preventing a later paid notification minting credits.
  INSERT INTO public.kiwify_purchases(email,product_key,plan_code,credits_amount,provider_order_id,status,catalog_product_id)
  VALUES(lower(trim(p_email)),'EVENT_ONLY',product.plan_code,0,p_order_id,CASE p_event WHEN 'canceled' THEN 'CANCELED' ELSE 'PENDING' END,p_product_id)
  ON CONFLICT(provider_order_id) DO UPDATE SET status=CASE p_event WHEN 'canceled' THEN 'CANCELED' ELSE kiwify_purchases.status END;
  IF t IS NOT NULL AND product.product_type='subscription' THEN
   UPDATE public.subscriptions SET status=CASE p_event WHEN 'canceled' THEN 'CANCELLED' ELSE 'PAST_DUE' END,updated_at=now()
   WHERE tenant_id=t AND provider='kiwify' AND current_period_start=purchase.paid_at;
  END IF;
  result:=jsonb_build_object('ok',true,'event',p_event);
 END IF;
 INSERT INTO public.kiwify_financial_events(order_id,event,result) VALUES(p_order_id,p_event,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.process_verified_kiwify_event(text,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.process_verified_kiwify_event(text,text,text,text,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.activate_purchase_for_user(p_purchase_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t uuid;
BEGIN
 SELECT u.tenant_id INTO t FROM public.users u JOIN auth.users a ON a.id=u.id
 JOIN public.kiwify_purchases p ON lower(trim(p.email))=lower(trim(a.email))
 WHERE u.id=auth.uid() AND p.id=p_purchase_id;
 IF t IS NULL THEN RAISE EXCEPTION 'Unauthorized purchase' USING ERRCODE='42501'; END IF;
 RETURN public.apply_verified_kiwify_purchase(p_purchase_id,t);
END $$;
REVOKE ALL ON FUNCTION public.activate_purchase_for_user(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.activate_purchase_for_user(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.reconcile_pending_activations()
RETURNS TABLE(purchase_email text,purchase_plan text,found_tenant_id uuid,result_action text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p record; r jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT COALESCE(public.is_super_admin(),false) THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 FOR p IN SELECT kp.id,kp.email,kp.plan_code,(array_agg(DISTINCT u.tenant_id))[1] AS tenant
 FROM public.kiwify_purchases kp JOIN auth.users a ON lower(trim(a.email))=lower(trim(kp.email))
 JOIN public.users u ON u.id=a.id WHERE kp.status='APPROVED' AND kp.activated_at IS NULL
 GROUP BY kp.id,kp.email,kp.plan_code HAVING count(DISTINCT u.tenant_id)=1 LOOP
  r:=public.apply_verified_kiwify_purchase(p.id,p.tenant);
  purchase_email:=p.email;purchase_plan:=p.plan_code;found_tenant_id:=p.tenant;result_action:='activated';RETURN NEXT;
 END LOOP;
END $$;
-- Close obsolete alternative financial APIs, including every overload present locally.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('process_payment_approved','process_payment_overdue','process_subscription_canceled','grant_credits','debit_credits','reconcile_pending_activations') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_pending_activations() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_pending_activations() TO authenticated,service_role;
COMMIT;
