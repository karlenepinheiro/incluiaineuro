BEGIN;
CREATE TABLE public.ai_financial_jobs (
 id text PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id),user_id uuid NOT NULL REFERENCES public.users(id),
 operation text NOT NULL, fingerprint text NOT NULL, amount integer NOT NULL CHECK(amount>0),
 status text NOT NULL CHECK(status IN ('running','succeeded','failed')),attempt integer NOT NULL DEFAULT 1,
 reservation_id uuid REFERENCES public.credit_reservations(id),response jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_financial_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_financial_jobs FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.begin_ai_financial_job(p_id text,p_tenant_id uuid,p_user_id uuid,p_operation text,p_fingerprint text,p_amount integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.ai_financial_jobs; r jsonb; reservation public.credit_reservations;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Backend only' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_user_id AND tenant_id=p_tenant_id AND is_active) THEN RAISE EXCEPTION 'Invalid actor'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('ai:'||p_id,0));
 SELECT * INTO j FROM public.ai_financial_jobs WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF j.tenant_id<>p_tenant_id OR j.user_id<>p_user_id OR j.operation<>p_operation OR j.fingerprint<>p_fingerprint OR j.amount<>p_amount THEN RAISE EXCEPTION 'Idempotency conflict'; END IF;
  IF j.status='succeeded' THEN RETURN jsonb_build_object('state','cached','response',j.response); END IF;
  SELECT * INTO reservation FROM public.credit_reservations WHERE id=j.reservation_id;
  IF j.status='running' AND reservation.status='reserved' AND reservation.expires_at>now() THEN RETURN jsonb_build_object('state','busy'); END IF;
  IF reservation.status='reserved' THEN
   r:=public.atomic_release_reserved_credits(p_operation_id=>p_id||':'||j.attempt||':timeout',p_reservation_id=>j.reservation_id,p_tenant_id=>p_tenant_id,p_user_id=>p_user_id);
   IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'Release failed'; END IF;
  END IF;
  j.attempt:=j.attempt+1;
 ELSE
  j.attempt:=1;
 END IF;
 r:=public.atomic_reserve_credits(p_operation_id=>p_id||':'||j.attempt||':reserve',p_amount=>p_amount,
 p_description=>p_operation,p_tenant_id=>p_tenant_id,p_user_id=>p_user_id,p_metadata=>jsonb_build_object('canonical_operation',p_operation),
 p_expires_at=>now()+interval '20 minutes',p_source=>'ai_gateway');
 IF NOT (r->>'ok')::boolean THEN RETURN r||jsonb_build_object('state','denied'); END IF;
 INSERT INTO public.ai_financial_jobs(id,tenant_id,user_id,operation,fingerprint,amount,status,attempt,reservation_id)
 VALUES(p_id,p_tenant_id,p_user_id,p_operation,p_fingerprint,p_amount,'running',j.attempt,(r->>'reservation_id')::uuid)
 ON CONFLICT(id) DO UPDATE SET status='running',attempt=EXCLUDED.attempt,reservation_id=EXCLUDED.reservation_id,updated_at=now();
 RETURN jsonb_build_object('state','running','reservation_id',r->>'reservation_id','attempt',j.attempt);
END $$;

CREATE OR REPLACE FUNCTION public.finish_ai_financial_job(p_id text,p_attempt integer,p_response jsonb,p_success boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.ai_financial_jobs; r jsonb; document_id uuid; d jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Backend only' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT j FROM public.ai_financial_jobs WHERE id=p_id FOR UPDATE;
 IF j.status='succeeded' THEN RETURN j.response; END IF;
 IF j.attempt<>p_attempt OR j.status<>'running' THEN RAISE EXCEPTION 'Stale attempt'; END IF;
 IF p_success THEN
  IF p_response IS NULL OR p_response->'result' IS NULL OR p_response->'result'='null'::jsonb THEN RAISE EXCEPTION 'Missing delivery'; END IF;
  d:=p_response->'_document';
  IF d IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.students WHERE id=(d->>'studentId')::uuid AND tenant_id=j.tenant_id) THEN RAISE EXCEPTION 'Invalid student'; END IF;
   INSERT INTO public.documents(tenant_id,student_id,created_by,doc_type,title,structured_data,status)
   VALUES(j.tenant_id,(d->>'studentId')::uuid,j.user_id,d->>'docType',d->>'title',p_response->'result','DRAFT') RETURNING id INTO document_id;
   p_response:=(p_response-'_document')||jsonb_build_object('documentId',document_id);
  END IF;
  r:=public.atomic_commit_reserved_credits(p_operation_id=>p_id||':'||j.attempt||':commit',p_reservation_id=>j.reservation_id,
    p_tenant_id=>j.tenant_id,p_user_id=>j.user_id,p_description=>j.operation);
 ELSE
  r:=public.atomic_release_reserved_credits(p_operation_id=>p_id||':'||j.attempt||':release',p_reservation_id=>j.reservation_id,
    p_tenant_id=>j.tenant_id,p_user_id=>j.user_id,p_description=>'Falha: '||j.operation);
 END IF;
 IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'Financial completion failed: %',r; END IF;
 p_response:=COALESCE(p_response,'{}')||jsonb_build_object('creditsRemaining',(r->>'final_balance')::integer);
 UPDATE public.ai_financial_jobs SET status=CASE WHEN p_success THEN 'succeeded' ELSE 'failed' END,
 response=p_response,updated_at=now() WHERE id=p_id;
 RETURN p_response;
END $$;
REVOKE ALL ON FUNCTION public.begin_ai_financial_job(text,uuid,uuid,text,text,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.finish_ai_financial_job(text,integer,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_ai_financial_job(text,uuid,uuid,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_ai_financial_job(text,integer,jsonb,boolean) TO service_role;
-- The browser may request generation, never choose an amount or refund delivered AI.
REVOKE ALL ON FUNCTION public.atomic_debit_credits(text,integer,text,uuid,uuid,jsonb,text,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.atomic_reserve_credits(text,integer,text,uuid,uuid,jsonb,timestamptz,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.atomic_commit_reserved_credits(text,uuid,text,uuid,uuid,jsonb,text,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.atomic_release_reserved_credits(text,uuid,text,uuid,uuid,jsonb,text) FROM authenticated;
COMMIT;
