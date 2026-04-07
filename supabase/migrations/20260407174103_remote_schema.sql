


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."activate_purchase_for_user"("p_purchase_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_purchase      kiwify_purchases%ROWTYPE;
  v_user_email    text;
  v_user_id       uuid;
  v_tenant_id     uuid;
  v_plan_id       uuid;
  v_plan_credits  int := 0;
  v_sub_plan_name text;
  v_rows_updated  int;
  v_plan_lookup   text; -- plan_code normalizado para lookup em plans
BEGIN
  v_user_email := lower(trim(auth.jwt() ->> 'email'));
  v_user_id    := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Busca e bloqueia a linha para evitar ativação dupla
  SELECT * INTO v_purchase
  FROM kiwify_purchases
  WHERE id = p_purchase_id
    AND lower(trim(email)) = v_user_email
    AND status = 'APPROVED'
    AND activated_at IS NULL
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_activated');
  END IF;

  -- Bloqueia produto não reconhecido
  IF v_purchase.product_key = 'UNKNOWN'
     OR (v_purchase.plan_code IS NULL AND v_purchase.credits_amount = 0) THEN
    RETURN jsonb_build_object(
      'ok',      false,
      'reason',  'unknown_product',
      'message', 'Produto não reconhecido. Entre em contato com o suporte informando o número do pedido.'
    );
  END IF;

  -- Busca tenant do usuário
  SELECT tenant_id INTO v_tenant_id FROM users WHERE id = v_user_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tenant_not_found');
  END IF;

  -- ── Assinatura (plano) ───────────────────────────────────────────────────
  -- REGRA: plan_code preenchido = assinatura, independente de credits_amount.
  -- Planos PRO/MASTER têm credits_amount = 500/700 (créditos mensais do plano),
  -- mas NÃO são créditos avulsos. A autoridade é plan_code, não credits_amount.
  IF v_purchase.plan_code IS NOT NULL THEN

    -- Normaliza: 'PREMIUM' é alias de 'MASTER'
    v_plan_lookup := CASE upper(v_purchase.plan_code)
      WHEN 'PREMIUM' THEN 'MASTER'
      ELSE upper(v_purchase.plan_code)
    END;

    -- Busca plan_id pelo campo name (fonte única de verdade no schema base)
    -- name tem valores 'PRO', 'MASTER', 'FREE' (schema_launch_v1)
    SELECT id INTO v_plan_id
    FROM plans
    WHERE upper(name) = v_plan_lookup
    LIMIT 1;

    -- Atualiza assinatura existente
    UPDATE subscriptions
    SET plan_id            = v_plan_id,
        status             = 'ACTIVE',
        current_period_end = now() + interval '30 days',
        provider           = 'kiwify',
        updated_at         = now()
    WHERE tenant_id = v_tenant_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    -- Cria se não existia (trigger de signup às vezes demora)
    IF v_rows_updated = 0 THEN
      INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end, provider)
      VALUES (v_tenant_id, v_plan_id, 'ACTIVE', now() + interval '30 days', 'kiwify');
    END IF;

    -- Créditos do plano
    v_plan_credits := CASE v_plan_lookup
      WHEN 'MASTER'  THEN 700
      WHEN 'PRO'     THEN 500
      ELSE 0
    END;

  -- ── Créditos avulsos ─────────────────────────────────────────────────────
  -- Só entra aqui quando plan_code IS NULL (produto sem plano = pacote avulso)
  ELSIF v_purchase.plan_code IS NULL AND v_purchase.credits_amount > 0 THEN
    SELECT upper(p.name) INTO v_sub_plan_name
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.tenant_id = v_tenant_id
      AND s.status = 'ACTIVE'
    LIMIT 1;

    IF v_sub_plan_name IS NULL
       OR v_sub_plan_name NOT IN ('PRO', 'MASTER', 'PREMIUM') THEN
      RETURN jsonb_build_object(
        'ok',      false,
        'reason',  'credits_require_subscription',
        'message', 'Pacotes de créditos avulsos são exclusivos para assinantes ativos do IncluiAI.'
      );
    END IF;

    v_plan_credits := v_purchase.credits_amount;
  END IF;

  -- ── Marca compra como ativada ─────────────────────────────────────────────
  -- Só chega aqui se passou TODAS as validações.
  UPDATE kiwify_purchases
  SET activated_at = now(),
      tenant_id    = v_tenant_id
  WHERE id = p_purchase_id;

  -- ── Adiciona créditos à carteira ─────────────────────────────────────────
  IF v_plan_credits > 0 THEN
    UPDATE credits_wallet
    SET balance    = balance + v_plan_credits,
        updated_at = now()
    WHERE tenant_id = v_tenant_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN
      INSERT INTO credits_wallet (tenant_id, balance)
      VALUES (v_tenant_id, v_plan_credits);
    END IF;

    INSERT INTO credits_ledger (tenant_id, amount, type, description, source)
    VALUES (
      v_tenant_id,
      v_plan_credits,
      'credit',
      'Ativação compra Kiwify ' || v_purchase.provider_order_id,
      'kiwify_activation'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'plan',            v_purchase.plan_code,
    'credits_granted', v_plan_credits
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok',      false,
    'reason',  'internal_error',
    'message', 'Erro interno: ' || SQLERRM || ' (SQLSTATE: ' || SQLSTATE || ')'
  );
END;
$$;


ALTER FUNCTION "public"."activate_purchase_for_user"("p_purchase_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ceo_search_tenants"("search_term" "text", "lim" integer DEFAULT 10) RETURNS TABLE("tenant_id" "uuid", "tenant_name" "text", "user_email" "text", "user_name" "text", "plan_code" "text", "subscription_status" "text", "credits_remaining" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    v.tenant_id, v.tenant_name, v.user_email, v.user_name,
    v.plan_code, v.subscription_status, v.credits_remaining
  FROM v_ceo_subscribers v
  WHERE
    v.tenant_name ILIKE '%' || search_term || '%'
    OR v.user_email ILIKE '%' || search_term || '%'
    OR v.user_name  ILIKE '%' || search_term || '%'
  ORDER BY v.tenant_name
  LIMIT lim;
$$;


ALTER FUNCTION "public"."ceo_search_tenants"("search_term" "text", "lim" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_purchase_by_email"("p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_rec kiwify_purchases%ROWTYPE;
BEGIN
  -- 1. Compra aprovada e ainda não ativada
  SELECT * INTO v_rec
  FROM kiwify_purchases
  WHERE lower(trim(email)) = lower(trim(p_email))
    AND status = 'APPROVED'
    AND activated_at IS NULL
  ORDER BY paid_at DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'found',       true,
      'status',      'APPROVED',
      'plan_code',   v_rec.plan_code,
      'credits',     v_rec.credits_amount,
      'product_key', v_rec.product_key,
      'purchase_id', v_rec.id
    );
  END IF;

  -- 2. Compra pendente
  SELECT * INTO v_rec
  FROM kiwify_purchases
  WHERE lower(trim(email)) = lower(trim(p_email))
    AND status = 'PENDING'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'found',  true,
      'status', 'PENDING'
    );
  END IF;

  -- 3. Nenhuma compra encontrada
  RETURN jsonb_build_object('found', false);
END;
$$;


ALTER FUNCTION "public"."check_purchase_by_email"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_user_profile_on_signup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id    UUID;
  v_free_plan_id UUID;
  v_nome         TEXT;
BEGIN
  v_nome := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    split_part(NEW.email, '@', 1),
    'Usuario'
  );

  IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_free_plan_id
  FROM public.plans WHERE UPPER(name) = 'FREE' LIMIT 1;

  INSERT INTO public.tenants (name, plan_id, is_active)
  VALUES (
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'school_name'), ''), 'Escola de ' || v_nome),
    v_free_plan_id, true
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.users (id, tenant_id, nome, full_name, email, role, is_super_admin, is_active)
  VALUES (NEW.id, v_tenant_id, v_nome, v_nome, NEW.email, 'TEACHER', false, true);

  INSERT INTO public.profiles (id, email, full_name, role, plan)
  VALUES (NEW.id, NEW.email, v_nome, 'TEACHER', 'FREE')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.credits_wallet (tenant_id, balance)
  VALUES (v_tenant_id, 60)
  ON CONFLICT (tenant_id) DO UPDATE
    SET balance = GREATEST(public.credits_wallet.balance, 60);

  INSERT INTO public.subscriptions (tenant_id, plan_id, status, provider)
  VALUES (v_tenant_id, v_free_plan_id, 'ACTIVE', 'NONE')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.credits_ledger (tenant_id, amount, type, description)
  VALUES (v_tenant_id, 60, 'monthly_grant', 'Créditos iniciais plano FREE');

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'create_user_profile_on_signup ERRO user_id=%, email=%, msg=%',
    NEW.id, NEW.email, SQLERRM;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_user_profile_on_signup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_audit_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  chars  TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i      INT;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."generate_audit_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_tenant_id uuid;
  v_full_name text;
begin
  v_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1)
  );

  insert into public.tenants (
    name,
    is_active
  )
  values (
    v_full_name,
    true
  )
  returning id into v_tenant_id;

  insert into public.profiles (
    id,
    email,
    full_name
  )
  values (
    new.id,
    new.email,
    v_full_name
  )
  on conflict (id) do nothing;

  insert into public.users (
    id,
    tenant_id,
    full_name,
    email,
    role,
    is_active
  )
  values (
    new.id,
    v_tenant_id,
    v_full_name,
    new.email,
    'TEACHER',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_super_admin = true
  )
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_document_action"("p_tenant_id" "uuid", "p_document_id" "uuid", "p_document_table" "text", "p_student_id" "uuid", "p_action" "text", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_user_name" "text" DEFAULT NULL::"text", "p_details" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO document_audit_log (
    tenant_id, document_id, document_table, student_id,
    action, performed_by, performed_by_name, details
  )
  VALUES (
    p_tenant_id, p_document_id, p_document_table, p_student_id,
    p_action, p_user_id, p_user_name, p_details
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."log_document_action"("p_tenant_id" "uuid", "p_document_id" "uuid", "p_document_table" "text", "p_student_id" "uuid", "p_action" "text", "p_user_id" "uuid", "p_user_name" "text", "p_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_tenant_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1
$$;


ALTER FUNCTION "public"."my_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_payment_approved"("p_tenant_id" "text", "p_plan_code" "text", "p_credits" integer, "p_period_end" timestamp with time zone, "p_provider_subscription_id" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_plan_id UUID;
BEGIN
  -- 1. Resolve plan_id pelo código (nome do plano)
  SELECT id INTO v_plan_id
  FROM plans
  WHERE UPPER(name) = UPPER(p_plan_code)
  LIMIT 1;

  -- 2. Atualiza subscriptions
  UPDATE subscriptions
  SET
    status               = 'ACTIVE',
    last_payment_status  = 'paid',
    current_period_end   = p_period_end,
    plan_id              = COALESCE(v_plan_id, plan_id),
    provider_sub_id      = COALESCE(p_provider_subscription_id, provider_sub_id),
    updated_at           = NOW()
  WHERE tenant_id = p_tenant_id::UUID;

  -- 3. Atualiza tenants.plan_id
  IF v_plan_id IS NOT NULL THEN
    UPDATE tenants
    SET plan_id = v_plan_id
    WHERE id = p_tenant_id::UUID;
  END IF;

  -- 4. Adiciona créditos de IA aos usuários do tenant (renova o saldo)
  --    Estratégia: soma ao saldo atual (créditos avulsos se acumulam)
  --    Para renovação mensal usa-se a procedure separada reset_monthly_credits
  IF p_credits > 0 THEN
    UPDATE users
    SET ai_credits = COALESCE(ai_credits, 0) + p_credits
    WHERE tenant_id = p_tenant_id::UUID;
  END IF;

END;
$$;


ALTER FUNCTION "public"."process_payment_approved"("p_tenant_id" "text", "p_plan_code" "text", "p_credits" integer, "p_period_end" timestamp with time zone, "p_provider_subscription_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."process_payment_approved"("p_tenant_id" "text", "p_plan_code" "text", "p_credits" integer, "p_period_end" timestamp with time zone, "p_provider_subscription_id" "text") IS 'Ativa assinatura e adiciona créditos IA ao receber pagamento aprovado do Asaas';



CREATE OR REPLACE FUNCTION "public"."process_payment_overdue"("p_tenant_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Marca assinatura como inadimplente
  UPDATE subscriptions
  SET
    status              = 'OVERDUE',
    last_payment_status = 'overdue',
    updated_at          = NOW()
  WHERE tenant_id = p_tenant_id::UUID;

  -- Nota: não remove créditos imediatamente.
  -- O sistema continua funcional por um período de graça.
  -- Use um cron job para revogar acesso após N dias OVERDUE se necessário.
END;
$$;


ALTER FUNCTION "public"."process_payment_overdue"("p_tenant_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."process_payment_overdue"("p_tenant_id" "text") IS 'Marca assinatura como inadimplente ao receber evento de pagamento atrasado do Asaas';



CREATE OR REPLACE FUNCTION "public"."process_subscription_canceled"("p_tenant_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_free_plan_id UUID;
BEGIN
  -- Resolve plan_id do plano FREE
  SELECT id INTO v_free_plan_id
  FROM plans
  WHERE UPPER(name) = 'FREE'
  LIMIT 1;

  -- Cancela assinatura
  UPDATE subscriptions
  SET
    status     = 'CANCELED',
    updated_at = NOW()
  WHERE tenant_id = p_tenant_id::UUID;

  -- Downgrade do tenant para FREE
  IF v_free_plan_id IS NOT NULL THEN
    UPDATE tenants
    SET plan_id = v_free_plan_id
    WHERE id = p_tenant_id::UUID;
  END IF;

  -- Zera créditos IA (mantém apenas saldo de pacotes avulsos se desejar)
  -- Comentado: descomente se quiser zerar ao cancelar
  -- UPDATE users SET ai_credits = 0 WHERE tenant_id = p_tenant_id::UUID;
END;
$$;


ALTER FUNCTION "public"."process_subscription_canceled"("p_tenant_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."process_subscription_canceled"("p_tenant_id" "text") IS 'Cancela assinatura e faz downgrade para FREE ao receber cancelamento do Asaas';



CREATE OR REPLACE FUNCTION "public"."reset_monthly_credits"("p_tenant_id" "text", "p_credits" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Repõe os créditos mensais (substitui, não acumula — para assinatura)
  -- Créditos avulsos ficam em coluna separada se necessário no futuro
  UPDATE users
  SET
    ai_credits = p_credits,
    updated_at = NOW()
  WHERE tenant_id = p_tenant_id::UUID;
END;
$$;


ALTER FUNCTION "public"."reset_monthly_credits"("p_tenant_id" "text", "p_credits" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reset_monthly_credits"("p_tenant_id" "text", "p_credits" integer) IS 'Redefine o saldo de créditos mensais do tenant (uso em renovação de assinatura)';



CREATE OR REPLACE FUNCTION "public"."schools_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."schools_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_professional_signatures_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_professional_signatures_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_school_templates_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_school_templates_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_audit_code"("p_code" "text") RETURNS TABLE("audit_code" "text", "entity_type" "text", "entity_id" "uuid", "action" "text", "created_at" timestamp with time zone, "status" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    a.audit_code,
    a.entity_type,
    a.entity_id,
    a.action,
    a.created_at,
    'VALIDO'::text as status
  from public.audit_logs a
  where a.audit_code = p_code
  limit 1;
$$;


ALTER FUNCTION "public"."validate_audit_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_document_public"("p_code" "text") RETURNS TABLE("audit_code" "text", "document_type" "text", "student_name" "text", "issued_at" timestamp with time zone, "status" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    d.audit_code,
    d.doc_type           AS document_type,
    COALESCE(s.full_name, 'Aluno não identificado') AS student_name,
    d.created_at         AS issued_at,
    'VÁLIDO'::text       AS status
  FROM public.documents d
  LEFT JOIN public.students s ON s.id = d.student_id
  WHERE d.audit_code = p_code
    AND d.deleted_at IS NULL
  LIMIT 1;
$$;


ALTER FUNCTION "public"."validate_document_public"("p_code" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_users_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'financeiro'::"text", 'operacional'::"text", 'comercial'::"text", 'suporte'::"text", 'auditoria'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_outputs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid",
    "output_type" "text" NOT NULL,
    "content" "text",
    "file_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_outputs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "request_type" "text" NOT NULL,
    "model" "text",
    "prompt_tokens" integer,
    "completion_tokens" integer,
    "input_data" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "credits_consumed" integer DEFAULT 0,
    "latency_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."ai_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_requests" IS 'Auditoria completa de todas as requisições enviadas a modelos de IA.';



CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "action" "text" NOT NULL,
    "content_hash" "text",
    "audit_code" "text" DEFAULT "public"."generate_audit_code"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" DEFAULT 'asaas'::"text" NOT NULL,
    "event_type" "text" NOT NULL,
    "provider_event_id" "text",
    "provider_payment_id" "text",
    "provider_subscription_id" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "processed" boolean DEFAULT false NOT NULL,
    "processed_at" timestamp with time zone,
    "success" boolean,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."billing_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."billing_events" IS 'Log imutável de webhooks recebidos do gateway de pagamentos (Asaas). Não deletar registros.';



CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "max_students" integer DEFAULT 5 NOT NULL,
    "ai_credits_per_month" integer DEFAULT 0 NOT NULL,
    "price_brl" numeric(10,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "provider" "text" DEFAULT 'manual'::"text",
    "provider_sub_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_customer_id" "text",
    "provider_payment_link" "text",
    "provider_update_payment_link" "text",
    "last_payment_status" "text",
    "next_due_date" "date",
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'TRIALING'::"text", 'PAST_DUE'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."subscriptions"."provider_customer_id" IS 'ID do cliente no Asaas (cus_xxxxx)';



COMMENT ON COLUMN "public"."subscriptions"."provider_payment_link" IS 'Link de pagamento/boleto/PIX do Asaas';



COMMENT ON COLUMN "public"."subscriptions"."provider_update_payment_link" IS 'Link para atualização de cartão no Asaas';



COMMENT ON COLUMN "public"."subscriptions"."last_payment_status" IS 'Último status de pagamento: paid | overdue | refunded | deleted';



COMMENT ON COLUMN "public"."subscriptions"."next_due_date" IS 'Próxima data de vencimento reportada pelo Asaas';



CREATE OR REPLACE VIEW "public"."billing_overview" AS
 SELECT "s"."tenant_id",
    "s"."status" AS "subscription_status",
    "s"."last_payment_status",
    "s"."next_due_date",
    "s"."provider",
    "s"."provider_sub_id",
    "s"."current_period_end",
    "p"."name" AS "plan_name",
    "p"."price_brl" AS "plan_price",
    "count"("be"."id") AS "total_webhook_events",
    "count"("be"."id") FILTER (WHERE ("be"."success" = true)) AS "events_ok",
    "count"("be"."id") FILTER (WHERE ("be"."success" = false)) AS "events_failed",
    "max"("be"."created_at") AS "last_event_at"
   FROM (("public"."subscriptions" "s"
     LEFT JOIN "public"."plans" "p" ON (("p"."id" = "s"."plan_id")))
     LEFT JOIN "public"."billing_events" "be" ON (("be"."provider_subscription_id" = "s"."provider_sub_id")))
  GROUP BY "s"."tenant_id", "s"."status", "s"."last_payment_status", "s"."next_due_date", "s"."provider", "s"."provider_sub_id", "s"."current_period_end", "p"."name", "p"."price_brl";


ALTER VIEW "public"."billing_overview" OWNER TO "postgres";


COMMENT ON VIEW "public"."billing_overview" IS 'Visão consolidada de assinaturas + eventos de pagamento para o painel CEO';



CREATE TABLE IF NOT EXISTS "public"."copilot_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "student_id" "uuid",
    "context_view" "text",
    "context_data" "jsonb" DEFAULT '{}'::"jsonb",
    "suggestions" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "shown_at" timestamp with time zone,
    "acted_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."copilot_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credits_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "type" "text" NOT NULL,
    "amount" integer NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "operation" "text",
    CONSTRAINT "credits_ledger_type_check" CHECK (("type" = ANY (ARRAY['monthly_grant'::"text", 'usage_ai'::"text", 'manual_grant'::"text", 'refund'::"text"])))
);


ALTER TABLE "public"."credits_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credits_wallet" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "balance" integer DEFAULT 0 NOT NULL,
    "last_reset_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."credits_wallet" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_signatures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "signed_by" "uuid" NOT NULL,
    "signer_role" "text",
    "signature_data" "text",
    "signed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."document_signatures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "version_number" integer NOT NULL,
    "structured_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "content_hash" "text",
    "changed_by" "uuid" NOT NULL,
    "change_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."document_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "doc_type" "text" NOT NULL,
    "source_id" "uuid",
    "title" "text" NOT NULL,
    "structured_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "audit_code" "text" DEFAULT "public"."generate_audit_code"(),
    "content_hash" "text",
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "documents_doc_type_check" CHECK (("doc_type" = ANY (ARRAY['ESTUDO_CASO'::"text", 'PAEE'::"text", 'PEI'::"text", 'PDI'::"text"]))),
    CONSTRAINT "documents_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'REVIEW'::"text", 'APPROVED'::"text", 'SIGNED'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "student_id" "uuid",
    "workflow_run_id" "uuid",
    "title" "text" NOT NULL,
    "content" "text",
    "image_url" "text",
    "image_prompt" "text",
    "bncc_codes" "text"[] DEFAULT '{}'::"text"[],
    "discipline" "text",
    "difficulty_level" "text",
    "page_size" "text" DEFAULT 'A4'::"text",
    "guidance" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "is_adapted" boolean DEFAULT false,
    "credits_used" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "model_used" "text",
    "output_type" "text" DEFAULT 'text'::"text" NOT NULL,
    CONSTRAINT "generated_activities_output_type_check" CHECK (("output_type" = ANY (ARRAY['text'::"text", 'text_image'::"text"])))
);


ALTER TABLE "public"."generated_activities" OWNER TO "postgres";


COMMENT ON COLUMN "public"."generated_activities"."model_used" IS 'ID do modelo de IA utilizado (ex: texto_apenas, nano_banana_pro, chatgpt_imagem)';



COMMENT ON COLUMN "public"."generated_activities"."output_type" IS 'Tipo de saída: text = somente texto; text_image = texto + imagem';



CREATE TABLE IF NOT EXISTS "public"."generated_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "student_id" "uuid",
    "document_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content_data" "jsonb" DEFAULT '{}'::"jsonb",
    "file_url" "text",
    "audit_code" "text",
    "content_hash" "text",
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "source_type" "text" DEFAULT 'manual'::"text",
    "ai_model" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."generated_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kiwify_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kiwify_product_id" "text" NOT NULL,
    "product_name" "text" NOT NULL,
    "product_type" "text" NOT NULL,
    "plan_code" "text",
    "credits_amount" integer DEFAULT 0 NOT NULL,
    "price_brl" numeric(10,2),
    "checkout_url" "text" DEFAULT '#'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kiwify_products_product_type_check" CHECK (("product_type" = ANY (ARRAY['subscription'::"text", 'credits'::"text"])))
);


ALTER TABLE "public"."kiwify_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kiwify_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "product_key" "text" NOT NULL,
    "plan_code" "text",
    "credits_amount" integer DEFAULT 0 NOT NULL,
    "provider_order_id" "text" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "payload" "jsonb",
    "paid_at" timestamp with time zone,
    "activated_at" timestamp with time zone,
    "tenant_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."kiwify_purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kiwify_webhook_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kiwify_order_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "tenant_id" "uuid",
    "plan_code" "text",
    "credits_granted" integer DEFAULT 0,
    "raw_payload" "jsonb",
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."kiwify_webhook_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."landing_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "section_key" "text" NOT NULL,
    "title" "text",
    "subtitle" "text",
    "content_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "updated_by" "uuid",
    "updated_by_name" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."landing_content" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medical_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "student_id" "uuid",
    "document_id" "uuid",
    "report_type" "text",
    "issuer_name" "text",
    "issue_date" "date",
    "cid_codes" "text"[] DEFAULT '{}'::"text"[],
    "synthesis" "text",
    "pedagogical_points" "text"[] DEFAULT '{}'::"text"[],
    "suggestions" "text"[] DEFAULT '{}'::"text"[],
    "raw_content" "text",
    "analyzed_by_ai" boolean DEFAULT false,
    "audit_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."medical_reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."medical_reports" IS 'Laudos médicos e terapêuticos com análise pedagógica gerada por IA.';



CREATE TABLE IF NOT EXISTS "public"."observation_checklists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "form_id" "uuid",
    "category" "text" NOT NULL,
    "item_text" "text" NOT NULL,
    "is_checked" boolean DEFAULT false,
    "notes" "text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."observation_checklists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."observation_forms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "student_id" "uuid",
    "user_id" "uuid",
    "form_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'rascunho'::"text" NOT NULL,
    "fields_data" "jsonb" DEFAULT '{}'::"jsonb",
    "audit_code" "text",
    "content_hash" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."observation_forms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parent_document_signatures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "student_id" "uuid",
    "document_type" "text" NOT NULL,
    "audit_code" "text",
    "signer_name" "text" NOT NULL,
    "signature_mode" "text" DEFAULT 'manual'::"text" NOT NULL,
    "signature_image_url" "text",
    "signature_data_b64" "text",
    "signed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."parent_document_signatures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."professional_signatures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "signature_data" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."professional_signatures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."professionals" (
    "id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "school_id" "uuid",
    "name" "text" NOT NULL,
    "email" "text",
    "role" "text" DEFAULT 'TEACHER'::"text",
    "is_admin" boolean DEFAULT false,
    "active" boolean DEFAULT true,
    "lgpd_accepted" boolean DEFAULT false,
    "lgpd_accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."professionals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "role" "text" DEFAULT 'user'::"text",
    "plan" "text" DEFAULT 'FREE'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."profiles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referrer_user_id" "uuid" NOT NULL,
    "referred_user_id" "uuid",
    "referrer_tenant_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "plan_code" "text",
    "credits_awarded" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "referrals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'converted'::"text", 'rewarded'::"text"])))
);


ALTER TABLE "public"."referrals" OWNER TO "postgres";


COMMENT ON TABLE "public"."referrals" IS 'Registros de indicação entre usuários';



COMMENT ON COLUMN "public"."referrals"."referrer_user_id" IS 'Usuário que compartilhou o link';



COMMENT ON COLUMN "public"."referrals"."referred_user_id" IS 'Novo usuário que se cadastrou pelo link';



COMMENT ON COLUMN "public"."referrals"."referrer_tenant_id" IS 'Tenant do referrer (para creditar)';



COMMENT ON COLUMN "public"."referrals"."status" IS 'pending → converted → rewarded';



COMMENT ON COLUMN "public"."referrals"."credits_awarded" IS 'Créditos IA concedidos ao referrer';



CREATE TABLE IF NOT EXISTS "public"."school_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "name" "text" NOT NULL,
    "original_filename" "text" NOT NULL,
    "description" "text",
    "document_type" "text",
    "ai_confidence" double precision DEFAULT 0,
    "ai_reasoning" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_message" "text",
    "storage_path_original" "text",
    "storage_path_prepared" "text",
    "tags_injected" "jsonb" DEFAULT '[]'::"jsonb",
    "replacements_map" "jsonb" DEFAULT '[]'::"jsonb",
    "is_active" boolean DEFAULT true NOT NULL,
    "times_used" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "school_templates_document_type_check" CHECK (("document_type" = ANY (ARRAY['PEI'::"text", 'PAEE'::"text", 'PDI'::"text", 'estudo_de_caso'::"text", 'outro'::"text"]))),
    CONSTRAINT "school_templates_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'ready'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."school_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schools" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "inep_code" "text",
    "cnpj" "text",
    "phone" "text",
    "email" "text",
    "instagram" "text",
    "logo_url" "text",
    "address" "text",
    "neighborhood" "text",
    "city" "text",
    "state" "text",
    "zipcode" "text",
    "principal_name" "text",
    "manager_name" "text",
    "coordinator_name" "text",
    "aee_representative" "text",
    "aee_rep_name" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."schools" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "student_name" "text" NOT NULL,
    "date" "date" NOT NULL,
    "type" "text" NOT NULL,
    "professional" "text" NOT NULL,
    "duration" integer DEFAULT 50 NOT NULL,
    "observation" "text" DEFAULT ''::"text" NOT NULL,
    "attendance" "text" DEFAULT 'Presente'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."service_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "student_id" "uuid",
    "name" "text" NOT NULL,
    "document_type" "text" DEFAULT 'Outro'::"text" NOT NULL,
    "file_url" "text",
    "file_path" "text",
    "file_size" integer,
    "mime_type" "text",
    "uploaded_by" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."student_documents" OWNER TO "postgres";


COMMENT ON TABLE "public"."student_documents" IS 'Arquivos e documentos externos enviados para o perfil do aluno.';



CREATE TABLE IF NOT EXISTS "public"."student_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "student_id" "uuid",
    "comunicacao_expressiva" smallint DEFAULT 3,
    "interacao_social" smallint DEFAULT 3,
    "autonomia_avd" smallint DEFAULT 3,
    "autorregulacao" smallint DEFAULT 3,
    "atencao_sustentada" smallint DEFAULT 3,
    "compreensao" smallint DEFAULT 3,
    "motricidade_fina" smallint DEFAULT 3,
    "motricidade_grossa" smallint DEFAULT 3,
    "participacao" smallint DEFAULT 3,
    "linguagem_leitura" smallint DEFAULT 3,
    "observation" "text",
    "evaluated_by" "text",
    "evaluated_at" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "ai_model_used" "text",
    "ai_credits_used" integer DEFAULT 0,
    CONSTRAINT "student_profiles_atencao_sustentada_check" CHECK ((("atencao_sustentada" >= 1) AND ("atencao_sustentada" <= 5))),
    CONSTRAINT "student_profiles_autonomia_avd_check" CHECK ((("autonomia_avd" >= 1) AND ("autonomia_avd" <= 5))),
    CONSTRAINT "student_profiles_autorregulacao_check" CHECK ((("autorregulacao" >= 1) AND ("autorregulacao" <= 5))),
    CONSTRAINT "student_profiles_compreensao_check" CHECK ((("compreensao" >= 1) AND ("compreensao" <= 5))),
    CONSTRAINT "student_profiles_comunicacao_expressiva_check" CHECK ((("comunicacao_expressiva" >= 1) AND ("comunicacao_expressiva" <= 5))),
    CONSTRAINT "student_profiles_interacao_social_check" CHECK ((("interacao_social" >= 1) AND ("interacao_social" <= 5))),
    CONSTRAINT "student_profiles_linguagem_leitura_check" CHECK ((("linguagem_leitura" >= 1) AND ("linguagem_leitura" <= 5))),
    CONSTRAINT "student_profiles_motricidade_fina_check" CHECK ((("motricidade_fina" >= 1) AND ("motricidade_fina" <= 5))),
    CONSTRAINT "student_profiles_motricidade_grossa_check" CHECK ((("motricidade_grossa" >= 1) AND ("motricidade_grossa" <= 5))),
    CONSTRAINT "student_profiles_participacao_check" CHECK ((("participacao" >= 1) AND ("participacao" <= 5)))
);


ALTER TABLE "public"."student_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."student_profiles" IS 'Perfil cognitivo estruturado do aluno. Cada linha = uma avaliação datada.';



COMMENT ON COLUMN "public"."student_profiles"."ai_model_used" IS 'Modelo de IA usado para gerar o parecer (ex: economico, padrao, premium)';



COMMENT ON COLUMN "public"."student_profiles"."ai_credits_used" IS 'Créditos consumidos na geração do parecer por IA';



CREATE TABLE IF NOT EXISTS "public"."student_timeline" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "student_id" "uuid",
    "event_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "linked_id" "uuid",
    "linked_table" "text",
    "icon" "text",
    "author" "text",
    "event_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."student_timeline" OWNER TO "postgres";


COMMENT ON TABLE "public"."student_timeline" IS 'Linha do tempo consolidada de todos os eventos pedagógicos do aluno.';



CREATE TABLE IF NOT EXISTS "public"."students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "birth_date" "date",
    "gender" "text",
    "cpf" "text",
    "school_name" "text",
    "school_year" "text",
    "class_name" "text",
    "teacher_name" "text",
    "primary_diagnosis" "text",
    "secondary_diagnoses" "text"[] DEFAULT '{}'::"text"[],
    "cid_codes" "text"[] DEFAULT '{}'::"text"[],
    "learning_needs" "text",
    "behavioral_notes" "text",
    "medical_notes" "text",
    "guardian_name" "text",
    "guardian_phone" "text",
    "guardian_email" "text",
    "guardian_relationship" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "student_type" "text" DEFAULT 'com_laudo'::"text" NOT NULL,
    "skills" "jsonb" DEFAULT '[]'::"jsonb",
    "student_difficulties" "jsonb" DEFAULT '[]'::"jsonb",
    "student_strategies" "jsonb" DEFAULT '[]'::"jsonb",
    "is_external" boolean DEFAULT false,
    "external_school_name" "text",
    "external_school_city" "text",
    "external_professional" "text",
    "external_referral_source" "text",
    "support_level" "text" DEFAULT 'Nível 1'::"text",
    "shift" "text",
    "aee_teacher" "text",
    "coordinator" "text",
    "family_context" "text",
    "school_history" "text",
    "observations" "text",
    "photo_url" "text",
    "professionals" "jsonb" DEFAULT '[]'::"jsonb",
    "communication" "jsonb" DEFAULT '[]'::"jsonb",
    "school_id" "uuid",
    CONSTRAINT "students_external_referral_source_check" CHECK ((("external_referral_source" = ANY (ARRAY['Escola'::"text", 'Clínica'::"text", 'UBS'::"text", 'Família'::"text", 'Prefeitura'::"text", 'Outro'::"text"])) OR ("external_referral_source" IS NULL))),
    CONSTRAINT "students_gender_check" CHECK (("gender" = ANY (ARRAY['M'::"text", 'F'::"text", 'OTHER'::"text"]))),
    CONSTRAINT "students_student_type_check" CHECK (("student_type" = ANY (ARRAY['com_laudo'::"text", 'em_triagem'::"text"])))
);


ALTER TABLE "public"."students" OWNER TO "postgres";


COMMENT ON COLUMN "public"."students"."student_type" IS 'com_laudo = aluno com diagnóstico confirmado; em_triagem = em observação/avaliação';



COMMENT ON COLUMN "public"."students"."skills" IS 'Array de habilidades/potencialidades pedagógicas (jsonb)';



COMMENT ON COLUMN "public"."students"."student_difficulties" IS 'Array de dificuldades/barreiras pedagógicas (jsonb)';



COMMENT ON COLUMN "public"."students"."student_strategies" IS 'Array de estratégias pedagógicas (jsonb)';



COMMENT ON COLUMN "public"."students"."is_external" IS 'true = aluno atendido externamente (não matriculado na escola do profissional)';



COMMENT ON COLUMN "public"."students"."support_level" IS 'Nível de suporte (DSM-5): Nível 1, 2 ou 3';



CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "assigned_to" "uuid",
    "student_id" "uuid",
    "document_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "priority" "text" DEFAULT 'MEDIUM'::"text" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "due_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tasks_priority_check" CHECK (("priority" = ANY (ARRAY['LOW'::"text", 'MEDIUM'::"text", 'HIGH'::"text", 'URGENT'::"text"]))),
    CONSTRAINT "tasks_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'IN_PROGRESS'::"text", 'DONE'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "student_id" "uuid",
    "student_name" "text",
    "title" "text" NOT NULL,
    "appointment_date" "date" NOT NULL,
    "appointment_time" "text",
    "duration" integer DEFAULT 50,
    "type" "text" DEFAULT 'AEE'::"text",
    "professional" "text",
    "location" "text",
    "notes" "text",
    "status" "text" DEFAULT 'agendado'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tenant_appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "document" "text",
    "plan_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'TEACHER'::"text" NOT NULL,
    "is_super_admin" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nome" "text",
    "referral_code" "text",
    "referred_by" "text",
    CONSTRAINT "users_role_check" CHECK (("role" = ANY (ARRAY['TEACHER'::"text", 'AEE'::"text", 'COORDINATOR'::"text", 'MANAGER'::"text", 'ADMIN'::"text"])))
);

ALTER TABLE ONLY "public"."users" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."referral_code" IS 'Código único de indicação do usuário';



COMMENT ON COLUMN "public"."users"."referred_by" IS 'Código de indicação de quem indicou este usuário';



CREATE OR REPLACE VIEW "public"."v_ceo_financial_kpis" AS
 WITH "latest_subs" AS (
         SELECT DISTINCT ON ("subscriptions"."tenant_id") "subscriptions"."tenant_id",
            "subscriptions"."plan_id",
            "subscriptions"."status"
           FROM "public"."subscriptions"
          ORDER BY "subscriptions"."tenant_id", "subscriptions"."created_at" DESC
        ), "active_subs" AS (
         SELECT "ls"."tenant_id",
            "p"."price_brl"
           FROM ("latest_subs" "ls"
             JOIN "public"."plans" "p" ON (("p"."id" = "ls"."plan_id")))
          WHERE (("ls"."status" = 'ACTIVE'::"text") AND ("p"."price_brl" > (0)::numeric))
        )
 SELECT (( SELECT "count"(*) AS "count"
           FROM "latest_subs"
          WHERE ("latest_subs"."status" = 'ACTIVE'::"text")))::integer AS "active_subscribers",
    (( SELECT "count"(*) AS "count"
           FROM "latest_subs"
          WHERE ("latest_subs"."status" = 'OVERDUE'::"text")))::integer AS "overdue_subscribers",
    (( SELECT "count"(*) AS "count"
           FROM "latest_subs"
          WHERE ("latest_subs"."status" = ANY (ARRAY['TRIAL'::"text", 'INTERNAL_TEST'::"text"]))))::integer AS "trial_subscribers",
    (( SELECT "count"(*) AS "count"
           FROM "latest_subs"
          WHERE ("latest_subs"."status" = 'CANCELED'::"text")))::integer AS "canceled_subscribers",
    (( SELECT "count"(*) AS "count"
           FROM "public"."tenants"
          WHERE ("tenants"."is_active" = true)))::integer AS "total_tenants",
    COALESCE(( SELECT "sum"("active_subs"."price_brl") AS "sum"
           FROM "active_subs"), (0)::numeric) AS "mrr_estimated";


ALTER VIEW "public"."v_ceo_financial_kpis" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_ceo_subscribers" AS
 WITH "latest_sub" AS (
         SELECT DISTINCT ON ("subscriptions"."tenant_id") "subscriptions"."tenant_id",
            "subscriptions"."plan_id",
            "subscriptions"."status",
            "subscriptions"."current_period_end",
            "subscriptions"."provider",
            "subscriptions"."provider_sub_id"
           FROM "public"."subscriptions"
          ORDER BY "subscriptions"."tenant_id", "subscriptions"."created_at" DESC
        ), "primary_user" AS (
         SELECT DISTINCT ON ("users"."tenant_id") "users"."tenant_id",
            "users"."nome",
            "users"."email"
           FROM "public"."users"
          ORDER BY "users"."tenant_id", "users"."created_at"
        ), "student_counts" AS (
         SELECT "students"."tenant_id",
            ("count"(*))::integer AS "total"
           FROM "public"."students"
          GROUP BY "students"."tenant_id"
        )
 SELECT "t"."id" AS "tenant_id",
    "t"."name" AS "tenant_name",
    "pu"."nome" AS "user_name",
    "pu"."email" AS "user_email",
    COALESCE("p"."name", 'FREE'::"text") AS "plan_code",
    COALESCE("ls"."status", 'ACTIVE'::"text") AS "subscription_status",
    "ls"."current_period_end" AS "next_due_date",
    COALESCE("ls"."provider", 'manual'::"text") AS "billing_provider",
    COALESCE("cw"."balance", 0) AS "credits_remaining",
    COALESCE("p"."ai_credits_per_month", 60) AS "credits_limit",
    COALESCE("sc"."total", 0) AS "students_active",
    COALESCE("p"."max_students", 5) AS "student_limit"
   FROM ((((("public"."tenants" "t"
     LEFT JOIN "primary_user" "pu" ON (("pu"."tenant_id" = "t"."id")))
     LEFT JOIN "latest_sub" "ls" ON (("ls"."tenant_id" = "t"."id")))
     LEFT JOIN "public"."plans" "p" ON (("p"."id" = COALESCE("ls"."plan_id", "t"."plan_id"))))
     LEFT JOIN "public"."credits_wallet" "cw" ON (("cw"."tenant_id" = "t"."id")))
     LEFT JOIN "student_counts" "sc" ON (("sc"."tenant_id" = "t"."id")))
  WHERE ("t"."is_active" = true);


ALTER VIEW "public"."v_ceo_subscribers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_nodes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid",
    "node_id" "text" NOT NULL,
    "node_type" "text" NOT NULL,
    "position_x" double precision,
    "position_y" double precision,
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workflow_nodes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid",
    "tenant_id" "uuid",
    "user_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "credits_consumed" integer DEFAULT 0,
    "output_data" "jsonb" DEFAULT '{}'::"jsonb",
    "error_message" "text",
    "run_metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."workflow_runs" OWNER TO "postgres";


COMMENT ON TABLE "public"."workflow_runs" IS 'Histórico de execuções de workflows com outputs e créditos consumidos.';



CREATE TABLE IF NOT EXISTS "public"."workflow_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "workflow_type" "text" DEFAULT 'ativaIA'::"text" NOT NULL,
    "category" "text",
    "thumbnail_url" "text",
    "nodes_data" "jsonb" DEFAULT '[]'::"jsonb",
    "edges_data" "jsonb" DEFAULT '[]'::"jsonb",
    "is_public" boolean DEFAULT true,
    "is_featured" boolean DEFAULT false,
    "credits_cost" integer DEFAULT 1,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workflow_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."workflow_templates" IS 'Templates de workflow disponíveis para professores aplicarem.';



CREATE TABLE IF NOT EXISTS "public"."workflows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "student_id" "uuid",
    "name" "text" DEFAULT 'Novo Workflow'::"text" NOT NULL,
    "description" "text",
    "workflow_type" "text" DEFAULT 'ativaIA'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "nodes_data" "jsonb" DEFAULT '[]'::"jsonb",
    "edges_data" "jsonb" DEFAULT '[]'::"jsonb",
    "is_template" boolean DEFAULT false,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "credits_used" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workflows" OWNER TO "postgres";


COMMENT ON TABLE "public"."workflows" IS 'Workflows visuais criados no AtivaIA/EduLensIA/NeuroDesign.';



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_outputs"
    ADD CONSTRAINT "ai_outputs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_requests"
    ADD CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_audit_code_key" UNIQUE ("audit_code");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_events"
    ADD CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_events"
    ADD CONSTRAINT "billing_events_provider_event_id_key" UNIQUE ("provider_event_id");



ALTER TABLE ONLY "public"."copilot_suggestions"
    ADD CONSTRAINT "copilot_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credits_ledger"
    ADD CONSTRAINT "credits_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credits_wallet"
    ADD CONSTRAINT "credits_wallet_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credits_wallet"
    ADD CONSTRAINT "credits_wallet_tenant_id_key" UNIQUE ("tenant_id");



ALTER TABLE ONLY "public"."document_signatures"
    ADD CONSTRAINT "document_signatures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_versions"
    ADD CONSTRAINT "document_versions_document_id_version_number_key" UNIQUE ("document_id", "version_number");



ALTER TABLE ONLY "public"."document_versions"
    ADD CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_audit_code_key" UNIQUE ("audit_code");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_activities"
    ADD CONSTRAINT "generated_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_documents"
    ADD CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kiwify_products"
    ADD CONSTRAINT "kiwify_products_kiwify_product_id_key" UNIQUE ("kiwify_product_id");



ALTER TABLE ONLY "public"."kiwify_products"
    ADD CONSTRAINT "kiwify_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kiwify_purchases"
    ADD CONSTRAINT "kiwify_purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kiwify_purchases"
    ADD CONSTRAINT "kiwify_purchases_provider_order_id_key" UNIQUE ("provider_order_id");



ALTER TABLE ONLY "public"."kiwify_webhook_logs"
    ADD CONSTRAINT "kiwify_webhook_logs_order_event_unique" UNIQUE ("kiwify_order_id", "event_type");



ALTER TABLE ONLY "public"."kiwify_webhook_logs"
    ADD CONSTRAINT "kiwify_webhook_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."landing_content"
    ADD CONSTRAINT "landing_content_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."landing_content"
    ADD CONSTRAINT "landing_content_section_key_key" UNIQUE ("section_key");



ALTER TABLE ONLY "public"."medical_reports"
    ADD CONSTRAINT "medical_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."observation_checklists"
    ADD CONSTRAINT "observation_checklists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."observation_forms"
    ADD CONSTRAINT "observation_forms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parent_document_signatures"
    ADD CONSTRAINT "parent_document_signatures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."professional_signatures"
    ADD CONSTRAINT "professional_signatures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."professional_signatures"
    ADD CONSTRAINT "professional_signatures_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_templates"
    ADD CONSTRAINT "school_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_records"
    ADD CONSTRAINT "service_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_documents"
    ADD CONSTRAINT "student_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_timeline"
    ADD CONSTRAINT "student_timeline_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_tenant_id_key" UNIQUE ("tenant_id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_appointments"
    ADD CONSTRAINT "tenant_appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_referral_code_key" UNIQUE ("referral_code");



ALTER TABLE ONLY "public"."workflow_nodes"
    ADD CONSTRAINT "workflow_nodes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_runs"
    ADD CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_templates"
    ADD CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_ai_outputs_request" ON "public"."ai_outputs" USING "btree" ("request_id");



CREATE INDEX "idx_ai_requests_tenant" ON "public"."ai_requests" USING "btree" ("tenant_id", "request_type", "created_at" DESC);



CREATE INDEX "idx_audit_entity" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_audit_tenant" ON "public"."audit_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_billing_events_event_type" ON "public"."billing_events" USING "btree" ("event_type", "created_at" DESC);



CREATE INDEX "idx_billing_events_processed" ON "public"."billing_events" USING "btree" ("processed", "created_at" DESC);



CREATE INDEX "idx_billing_events_provider_sub" ON "public"."billing_events" USING "btree" ("provider_subscription_id") WHERE ("provider_subscription_id" IS NOT NULL);



CREATE INDEX "idx_copilot_suggestions_user" ON "public"."copilot_suggestions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_credits_wallet_tenant_id" ON "public"."credits_wallet" USING "btree" ("tenant_id");



CREATE INDEX "idx_doc_versions_doc" ON "public"."document_versions" USING "btree" ("document_id");



CREATE INDEX "idx_documents_active" ON "public"."documents" USING "btree" ("tenant_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_documents_source" ON "public"."documents" USING "btree" ("source_id");



CREATE INDEX "idx_documents_student" ON "public"."documents" USING "btree" ("student_id");



CREATE INDEX "idx_documents_type" ON "public"."documents" USING "btree" ("tenant_id", "doc_type");



CREATE INDEX "idx_generated_activities_tenant" ON "public"."generated_activities" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_generated_documents_tenant" ON "public"."generated_documents" USING "btree" ("tenant_id", "document_type", "status");



CREATE INDEX "idx_kiwify_logs_order" ON "public"."kiwify_webhook_logs" USING "btree" ("kiwify_order_id");



CREATE INDEX "idx_kiwify_logs_tenant" ON "public"."kiwify_webhook_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_ledger_tenant" ON "public"."credits_ledger" USING "btree" ("tenant_id");



CREATE INDEX "idx_medical_reports_student" ON "public"."medical_reports" USING "btree" ("student_id");



CREATE INDEX "idx_medical_reports_tenant" ON "public"."medical_reports" USING "btree" ("tenant_id");



CREATE INDEX "idx_obs_forms_student" ON "public"."observation_forms" USING "btree" ("student_id");



CREATE INDEX "idx_obs_forms_tenant" ON "public"."observation_forms" USING "btree" ("tenant_id");



CREATE INDEX "idx_obs_forms_type" ON "public"."observation_forms" USING "btree" ("form_type");



CREATE INDEX "idx_observation_checklists_form" ON "public"."observation_checklists" USING "btree" ("form_id");



CREATE INDEX "idx_observation_forms_student" ON "public"."observation_forms" USING "btree" ("student_id", "form_type");



CREATE INDEX "idx_parent_sigs_audit" ON "public"."parent_document_signatures" USING "btree" ("audit_code");



CREATE INDEX "idx_parent_sigs_student" ON "public"."parent_document_signatures" USING "btree" ("student_id");



CREATE INDEX "idx_parent_sigs_tenant" ON "public"."parent_document_signatures" USING "btree" ("tenant_id");



CREATE INDEX "idx_school_templates_active" ON "public"."school_templates" USING "btree" ("is_active");



CREATE INDEX "idx_school_templates_status" ON "public"."school_templates" USING "btree" ("status");



CREATE INDEX "idx_school_templates_tenant" ON "public"."school_templates" USING "btree" ("tenant_id");



CREATE INDEX "idx_school_templates_type" ON "public"."school_templates" USING "btree" ("document_type");



CREATE INDEX "idx_schools_active" ON "public"."schools" USING "btree" ("tenant_id", "active");



CREATE INDEX "idx_schools_inep" ON "public"."schools" USING "btree" ("inep_code") WHERE ("inep_code" IS NOT NULL);



CREATE INDEX "idx_schools_tenant" ON "public"."schools" USING "btree" ("tenant_id");



CREATE INDEX "idx_service_records_student" ON "public"."service_records" USING "btree" ("student_id");



CREATE INDEX "idx_service_records_tenant" ON "public"."service_records" USING "btree" ("tenant_id", "date" DESC);



CREATE INDEX "idx_student_docs_student" ON "public"."student_documents" USING "btree" ("student_id");



CREATE INDEX "idx_student_docs_tenant" ON "public"."student_documents" USING "btree" ("tenant_id");



CREATE INDEX "idx_student_docs_type" ON "public"."student_documents" USING "btree" ("document_type");



CREATE INDEX "idx_student_documents_student" ON "public"."student_documents" USING "btree" ("student_id");



CREATE INDEX "idx_student_profiles_date" ON "public"."student_profiles" USING "btree" ("student_id", "evaluated_at" DESC);



CREATE INDEX "idx_student_profiles_student" ON "public"."student_profiles" USING "btree" ("student_id");



CREATE INDEX "idx_student_profiles_tenant" ON "public"."student_profiles" USING "btree" ("tenant_id");



CREATE INDEX "idx_student_timeline_student" ON "public"."student_timeline" USING "btree" ("student_id", "event_date" DESC);



CREATE INDEX "idx_students_active" ON "public"."students" USING "btree" ("tenant_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_students_is_external" ON "public"."students" USING "btree" ("tenant_id", "is_external") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_students_school_id" ON "public"."students" USING "btree" ("school_id") WHERE ("school_id" IS NOT NULL);



CREATE INDEX "idx_students_student_type" ON "public"."students" USING "btree" ("tenant_id", "student_type") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_students_tenant" ON "public"."students" USING "btree" ("tenant_id");



CREATE INDEX "idx_subscriptions_provider_customer" ON "public"."subscriptions" USING "btree" ("provider_customer_id") WHERE ("provider_customer_id" IS NOT NULL);



CREATE INDEX "idx_subscriptions_provider_sub" ON "public"."subscriptions" USING "btree" ("provider_sub_id") WHERE ("provider_sub_id" IS NOT NULL);



CREATE INDEX "idx_subscriptions_tenant_id" ON "public"."subscriptions" USING "btree" ("tenant_id");



CREATE INDEX "idx_tasks_assigned" ON "public"."tasks" USING "btree" ("assigned_to");



CREATE INDEX "idx_tasks_student" ON "public"."tasks" USING "btree" ("student_id");



CREATE INDEX "idx_tasks_tenant" ON "public"."tasks" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_appointments_student" ON "public"."tenant_appointments" USING "btree" ("student_id");



CREATE INDEX "idx_tenant_appointments_tenant" ON "public"."tenant_appointments" USING "btree" ("tenant_id", "appointment_date" DESC);



CREATE INDEX "idx_timeline_student" ON "public"."student_timeline" USING "btree" ("student_id", "event_date" DESC);



CREATE INDEX "idx_timeline_tenant" ON "public"."student_timeline" USING "btree" ("tenant_id");



CREATE INDEX "idx_timeline_type" ON "public"."student_timeline" USING "btree" ("event_type");



CREATE INDEX "idx_users_tenant" ON "public"."users" USING "btree" ("tenant_id");



CREATE INDEX "idx_workflow_nodes_workflow" ON "public"."workflow_nodes" USING "btree" ("workflow_id");



CREATE INDEX "idx_workflow_runs_tenant" ON "public"."workflow_runs" USING "btree" ("tenant_id", "started_at" DESC);



CREATE INDEX "idx_workflows_tenant" ON "public"."workflows" USING "btree" ("tenant_id", "workflow_type", "status");



CREATE INDEX "kiwify_purchases_email_idx" ON "public"."kiwify_purchases" USING "btree" ("lower"("email"), "status");



CREATE INDEX "referrals_referred_idx" ON "public"."referrals" USING "btree" ("referred_user_id");



CREATE INDEX "referrals_referrer_idx" ON "public"."referrals" USING "btree" ("referrer_user_id");



CREATE INDEX "referrals_status_idx" ON "public"."referrals" USING "btree" ("status");



CREATE INDEX "users_referral_code_idx" ON "public"."users" USING "btree" ("referral_code");



CREATE INDEX "users_referred_by_idx" ON "public"."users" USING "btree" ("referred_by");



CREATE OR REPLACE TRIGGER "trg_credits_wallet_updated_at" BEFORE UPDATE ON "public"."credits_wallet" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_documents_updated_at" BEFORE UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_profsig_updated_at" BEFORE UPDATE ON "public"."professional_signatures" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_school_templates_updated_at" BEFORE UPDATE ON "public"."school_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_school_templates_updated_at"();



CREATE OR REPLACE TRIGGER "trg_students_updated_at" BEFORE UPDATE ON "public"."students" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_subscriptions_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_tasks_updated_at" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_tenants_updated_at" BEFORE UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trig_schools_updated_at" BEFORE UPDATE ON "public"."schools" FOR EACH ROW EXECUTE FUNCTION "public"."schools_set_updated_at"();



ALTER TABLE ONLY "public"."ai_outputs"
    ADD CONSTRAINT "ai_outputs_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."ai_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_requests"
    ADD CONSTRAINT "ai_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_requests"
    ADD CONSTRAINT "ai_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."copilot_suggestions"
    ADD CONSTRAINT "copilot_suggestions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."copilot_suggestions"
    ADD CONSTRAINT "copilot_suggestions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."copilot_suggestions"
    ADD CONSTRAINT "copilot_suggestions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credits_ledger"
    ADD CONSTRAINT "credits_ledger_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credits_ledger"
    ADD CONSTRAINT "credits_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."credits_wallet"
    ADD CONSTRAINT "credits_wallet_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_signatures"
    ADD CONSTRAINT "document_signatures_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_signatures"
    ADD CONSTRAINT "document_signatures_signed_by_fkey" FOREIGN KEY ("signed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."document_versions"
    ADD CONSTRAINT "document_versions_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."document_versions"
    ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."documents"("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_activities"
    ADD CONSTRAINT "generated_activities_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_activities"
    ADD CONSTRAINT "generated_activities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_activities"
    ADD CONSTRAINT "generated_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_activities"
    ADD CONSTRAINT "generated_activities_workflow_run_id_fkey" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_documents"
    ADD CONSTRAINT "generated_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_documents"
    ADD CONSTRAINT "generated_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_documents"
    ADD CONSTRAINT "generated_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kiwify_webhook_logs"
    ADD CONSTRAINT "kiwify_webhook_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."landing_content"
    ADD CONSTRAINT "landing_content_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."medical_reports"
    ADD CONSTRAINT "medical_reports_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."student_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."medical_reports"
    ADD CONSTRAINT "medical_reports_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."medical_reports"
    ADD CONSTRAINT "medical_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."observation_checklists"
    ADD CONSTRAINT "observation_checklists_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."observation_forms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."observation_forms"
    ADD CONSTRAINT "observation_forms_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."observation_forms"
    ADD CONSTRAINT "observation_forms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."observation_forms"
    ADD CONSTRAINT "observation_forms_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parent_document_signatures"
    ADD CONSTRAINT "parent_document_signatures_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parent_document_signatures"
    ADD CONSTRAINT "parent_document_signatures_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."professional_signatures"
    ADD CONSTRAINT "professional_signatures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referred_user_id_fkey" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referrer_user_id_fkey" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_templates"
    ADD CONSTRAINT "school_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."school_templates"
    ADD CONSTRAINT "school_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_records"
    ADD CONSTRAINT "service_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_records"
    ADD CONSTRAINT "service_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_documents"
    ADD CONSTRAINT "student_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_documents"
    ADD CONSTRAINT "student_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_timeline"
    ADD CONSTRAINT "student_timeline_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_timeline"
    ADD CONSTRAINT "student_timeline_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_appointments"
    ADD CONSTRAINT "tenant_appointments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tenant_appointments"
    ADD CONSTRAINT "tenant_appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_appointments"
    ADD CONSTRAINT "tenant_appointments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_nodes"
    ADD CONSTRAINT "workflow_nodes_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_runs"
    ADD CONSTRAINT "workflow_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_runs"
    ADD CONSTRAINT "workflow_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflow_runs"
    ADD CONSTRAINT "workflow_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



CREATE POLICY "Allow insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "Allow read own profile" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "Allow update own profile" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_users_super_admin_all" ON "public"."admin_users" TO "authenticated" USING ("public"."is_super_admin"());



ALTER TABLE "public"."ai_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_requests_tenant" ON "public"."ai_requests" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "audit_insert" ON "public"."audit_logs" FOR INSERT WITH CHECK ((("tenant_id" = "public"."my_tenant_id"()) OR "public"."is_super_admin"()));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_select" ON "public"."audit_logs" FOR SELECT USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "audit_super_admin" ON "public"."audit_logs" FOR SELECT USING ("public"."is_super_admin"());



CREATE POLICY "auth_admin_can_insert_users" ON "public"."users" FOR INSERT TO "supabase_auth_admin" WITH CHECK (true);



CREATE POLICY "auth_read_own_purchase" ON "public"."kiwify_purchases" FOR SELECT TO "authenticated" USING (("lower"("email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))));



ALTER TABLE "public"."billing_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "billing_events_admin_read" ON "public"."billing_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



ALTER TABLE "public"."copilot_suggestions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "copilot_suggestions_user" ON "public"."copilot_suggestions" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."credits_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credits_wallet" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "docs_own" ON "public"."documents" USING ((("tenant_id" = "public"."my_tenant_id"()) AND ("deleted_at" IS NULL))) WITH CHECK (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "docs_super_admin" ON "public"."documents" USING ("public"."is_super_admin"());



CREATE POLICY "docs_tenant_delete" ON "public"."documents" FOR DELETE USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "docs_tenant_insert" ON "public"."documents" FOR INSERT WITH CHECK (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "docs_tenant_update" ON "public"."documents" FOR UPDATE USING (("tenant_id" = "public"."my_tenant_id"())) WITH CHECK (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "docsig_own" ON "public"."document_signatures" USING (("document_id" IN ( SELECT "documents"."id"
   FROM "public"."documents"
  WHERE ("documents"."tenant_id" = "public"."my_tenant_id"()))));



ALTER TABLE "public"."document_signatures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "docver_own" ON "public"."document_versions" USING (("document_id" IN ( SELECT "documents"."id"
   FROM "public"."documents"
  WHERE ("documents"."tenant_id" = "public"."my_tenant_id"()))));



CREATE POLICY "ga_delete" ON "public"."generated_activities" FOR DELETE USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "ga_insert" ON "public"."generated_activities" FOR INSERT WITH CHECK (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "ga_select" ON "public"."generated_activities" FOR SELECT USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "ga_update" ON "public"."generated_activities" FOR UPDATE USING (("tenant_id" = "public"."my_tenant_id"()));



ALTER TABLE "public"."generated_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "generated_documents_tenant" ON "public"."generated_documents" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "kiwify_logs_admin_only" ON "public"."kiwify_webhook_logs" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'ADMIN'::"text")))));



ALTER TABLE "public"."kiwify_products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kiwify_products_admin_write" ON "public"."kiwify_products" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'ADMIN'::"text")))));



CREATE POLICY "kiwify_products_public_read" ON "public"."kiwify_products" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."kiwify_purchases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kiwify_webhook_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."landing_content" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "landing_content_admin_write" ON "public"."landing_content" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users" "au"
  WHERE (("au"."email" = (( SELECT "users"."email"
           FROM "auth"."users"
          WHERE ("users"."id" = "auth"."uid"())))::"text") AND ("au"."active" = true) AND ("au"."role" = ANY (ARRAY['super_admin'::"text", 'operacional'::"text", 'comercial'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users" "au"
  WHERE (("au"."email" = (( SELECT "users"."email"
           FROM "auth"."users"
          WHERE ("users"."id" = "auth"."uid"())))::"text") AND ("au"."active" = true) AND ("au"."role" = ANY (ARRAY['super_admin'::"text", 'operacional'::"text", 'comercial'::"text"]))))));



CREATE POLICY "landing_content_public_read" ON "public"."landing_content" FOR SELECT USING (("is_active" = true));



CREATE POLICY "landing_content_service_all" ON "public"."landing_content" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "ledger_own" ON "public"."credits_ledger" USING (("tenant_id" = "public"."my_tenant_id"())) WITH CHECK (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "ledger_super_admin" ON "public"."credits_ledger" USING ("public"."is_super_admin"());



ALTER TABLE "public"."medical_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "medical_reports_delete" ON "public"."medical_reports" FOR DELETE USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "medical_reports_insert" ON "public"."medical_reports" FOR INSERT WITH CHECK (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "medical_reports_select" ON "public"."medical_reports" FOR SELECT USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "medical_reports_tenant" ON "public"."medical_reports" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "obs_forms_delete" ON "public"."observation_forms" FOR DELETE USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "obs_forms_insert" ON "public"."observation_forms" FOR INSERT WITH CHECK (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "obs_forms_select" ON "public"."observation_forms" FOR SELECT USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "obs_forms_update" ON "public"."observation_forms" FOR UPDATE USING (("tenant_id" = "public"."my_tenant_id"()));



ALTER TABLE "public"."observation_forms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "observation_forms_tenant" ON "public"."observation_forms" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."parent_document_signatures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parent_sigs_admin_all" ON "public"."parent_document_signatures" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'super_admin'::"text")))));



CREATE POLICY "parent_sigs_tenant_insert" ON "public"."parent_document_signatures" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "parent_sigs_tenant_read" ON "public"."parent_document_signatures" FOR SELECT USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plans_select" ON "public"."plans" FOR SELECT USING (true);



ALTER TABLE "public"."professional_signatures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."professionals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "professionals_select" ON "public"."professionals" FOR SELECT USING (("tenant_id" IN ( SELECT "professionals_1"."tenant_id"
   FROM "public"."professionals" "professionals_1"
  WHERE ("professionals_1"."id" = "auth"."uid"()))));



CREATE POLICY "professionals_update_self" ON "public"."professionals" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profsig_own" ON "public"."professional_signatures" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."referrals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "referrals_insert" ON "public"."referrals" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "referrals_select_own" ON "public"."referrals" FOR SELECT USING (("referrer_user_id" = "auth"."uid"()));



CREATE POLICY "referrals_update_service" ON "public"."referrals" FOR UPDATE USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."school_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schools" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schools_delete" ON "public"."schools" FOR DELETE USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "schools_insert" ON "public"."schools" FOR INSERT WITH CHECK (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "schools_select" ON "public"."schools" FOR SELECT USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "schools_update" ON "public"."schools" FOR UPDATE USING (("tenant_id" = "public"."my_tenant_id"()));



ALTER TABLE "public"."service_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_records_tenant_access" ON "public"."service_records" TO "authenticated" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "student_docs_delete" ON "public"."student_documents" FOR DELETE USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "student_docs_insert" ON "public"."student_documents" FOR INSERT WITH CHECK (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "student_docs_select" ON "public"."student_documents" FOR SELECT USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "student_docs_update" ON "public"."student_documents" FOR UPDATE USING (("tenant_id" = "public"."my_tenant_id"()));



ALTER TABLE "public"."student_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "student_documents_tenant" ON "public"."student_documents" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."student_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "student_profiles_delete" ON "public"."student_profiles" FOR DELETE USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "student_profiles_insert" ON "public"."student_profiles" FOR INSERT WITH CHECK (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "student_profiles_select" ON "public"."student_profiles" FOR SELECT USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "student_profiles_tenant" ON "public"."student_profiles" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."student_timeline" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "student_timeline_tenant" ON "public"."student_timeline" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "students_own" ON "public"."students" USING ((("tenant_id" = "public"."my_tenant_id"()) AND ("deleted_at" IS NULL))) WITH CHECK (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "students_super_admin" ON "public"."students" USING ("public"."is_super_admin"());



CREATE POLICY "subs_own" ON "public"."subscriptions" USING (("tenant_id" = "public"."my_tenant_id"())) WITH CHECK (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "subs_super_admin" ON "public"."subscriptions" USING ("public"."is_super_admin"());



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_own" ON "public"."tasks" USING (("tenant_id" = "public"."my_tenant_id"())) WITH CHECK (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "tasks_super_admin" ON "public"."tasks" USING ("public"."is_super_admin"());



ALTER TABLE "public"."tenant_appointments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_appointments_delete" ON "public"."tenant_appointments" FOR DELETE USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "tenant_appointments_insert" ON "public"."tenant_appointments" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "tenant_appointments_rls" ON "public"."tenant_appointments" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "tenant_appointments_update" ON "public"."tenant_appointments" FOR UPDATE USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "tenant_templates_delete" ON "public"."school_templates" FOR DELETE USING (("tenant_id" = ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())
 LIMIT 1)));



CREATE POLICY "tenant_templates_insert" ON "public"."school_templates" FOR INSERT WITH CHECK (("tenant_id" = ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())
 LIMIT 1)));



CREATE POLICY "tenant_templates_select" ON "public"."school_templates" FOR SELECT USING (("tenant_id" = ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())
 LIMIT 1)));



CREATE POLICY "tenant_templates_update" ON "public"."school_templates" FOR UPDATE USING (("tenant_id" = ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())
 LIMIT 1)));



ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenants_own" ON "public"."tenants" USING (("id" = "public"."my_tenant_id"())) WITH CHECK (("id" = "public"."my_tenant_id"()));



CREATE POLICY "tenants_super_admin" ON "public"."tenants" USING ("public"."is_super_admin"());



CREATE POLICY "timeline_delete" ON "public"."student_timeline" FOR DELETE USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "timeline_insert" ON "public"."student_timeline" FOR INSERT WITH CHECK (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "timeline_select" ON "public"."student_timeline" FOR SELECT USING (("tenant_id" = "public"."my_tenant_id"()));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_admin_all" ON "public"."users" USING ("public"."is_super_admin"());



CREATE POLICY "users_select_own" ON "public"."users" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "users_tenant" ON "public"."users" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "users_update_own" ON "public"."users" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "wallet_own" ON "public"."credits_wallet" USING (("tenant_id" = "public"."my_tenant_id"())) WITH CHECK (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "wallet_super_admin" ON "public"."credits_wallet" USING ("public"."is_super_admin"());



ALTER TABLE "public"."workflow_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workflow_runs_tenant" ON "public"."workflow_runs" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."workflow_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workflow_templates_public" ON "public"."workflow_templates" FOR SELECT USING ((("is_public" = true) OR ("auth"."uid"() IS NOT NULL)));



ALTER TABLE "public"."workflows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workflows_tenant" ON "public"."workflows" USING (("tenant_id" IN ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."activate_purchase_for_user"("p_purchase_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."activate_purchase_for_user"("p_purchase_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_purchase_for_user"("p_purchase_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ceo_search_tenants"("search_term" "text", "lim" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."ceo_search_tenants"("search_term" "text", "lim" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ceo_search_tenants"("search_term" "text", "lim" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_purchase_by_email"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_purchase_by_email"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_purchase_by_email"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_user_profile_on_signup"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_user_profile_on_signup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_user_profile_on_signup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_audit_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_audit_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_audit_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_document_action"("p_tenant_id" "uuid", "p_document_id" "uuid", "p_document_table" "text", "p_student_id" "uuid", "p_action" "text", "p_user_id" "uuid", "p_user_name" "text", "p_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_document_action"("p_tenant_id" "uuid", "p_document_id" "uuid", "p_document_table" "text", "p_student_id" "uuid", "p_action" "text", "p_user_id" "uuid", "p_user_name" "text", "p_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_document_action"("p_tenant_id" "uuid", "p_document_id" "uuid", "p_document_table" "text", "p_student_id" "uuid", "p_action" "text", "p_user_id" "uuid", "p_user_name" "text", "p_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."my_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_payment_approved"("p_tenant_id" "text", "p_plan_code" "text", "p_credits" integer, "p_period_end" timestamp with time zone, "p_provider_subscription_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_payment_approved"("p_tenant_id" "text", "p_plan_code" "text", "p_credits" integer, "p_period_end" timestamp with time zone, "p_provider_subscription_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_payment_approved"("p_tenant_id" "text", "p_plan_code" "text", "p_credits" integer, "p_period_end" timestamp with time zone, "p_provider_subscription_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_payment_overdue"("p_tenant_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_payment_overdue"("p_tenant_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_payment_overdue"("p_tenant_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_subscription_canceled"("p_tenant_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_subscription_canceled"("p_tenant_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_subscription_canceled"("p_tenant_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_monthly_credits"("p_tenant_id" "text", "p_credits" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."reset_monthly_credits"("p_tenant_id" "text", "p_credits" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_monthly_credits"("p_tenant_id" "text", "p_credits" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."schools_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."schools_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."schools_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_professional_signatures_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_professional_signatures_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_professional_signatures_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_school_templates_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_school_templates_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_school_templates_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_audit_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_audit_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_audit_code"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_document_public"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_document_public"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_document_public"("p_code" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."admin_users" TO "anon";
GRANT ALL ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT ALL ON TABLE "public"."ai_outputs" TO "anon";
GRANT ALL ON TABLE "public"."ai_outputs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_outputs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_requests" TO "anon";
GRANT ALL ON TABLE "public"."ai_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_requests" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."billing_events" TO "anon";
GRANT ALL ON TABLE "public"."billing_events" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_events" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."billing_overview" TO "anon";
GRANT ALL ON TABLE "public"."billing_overview" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_overview" TO "service_role";



GRANT ALL ON TABLE "public"."copilot_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."copilot_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."copilot_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."credits_ledger" TO "anon";
GRANT ALL ON TABLE "public"."credits_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."credits_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."credits_wallet" TO "anon";
GRANT ALL ON TABLE "public"."credits_wallet" TO "authenticated";
GRANT ALL ON TABLE "public"."credits_wallet" TO "service_role";



GRANT ALL ON TABLE "public"."document_signatures" TO "anon";
GRANT ALL ON TABLE "public"."document_signatures" TO "authenticated";
GRANT ALL ON TABLE "public"."document_signatures" TO "service_role";



GRANT ALL ON TABLE "public"."document_versions" TO "anon";
GRANT ALL ON TABLE "public"."document_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."document_versions" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."generated_activities" TO "anon";
GRANT ALL ON TABLE "public"."generated_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_activities" TO "service_role";



GRANT ALL ON TABLE "public"."generated_documents" TO "anon";
GRANT ALL ON TABLE "public"."generated_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_documents" TO "service_role";



GRANT ALL ON TABLE "public"."kiwify_products" TO "anon";
GRANT ALL ON TABLE "public"."kiwify_products" TO "authenticated";
GRANT ALL ON TABLE "public"."kiwify_products" TO "service_role";



GRANT ALL ON TABLE "public"."kiwify_purchases" TO "anon";
GRANT ALL ON TABLE "public"."kiwify_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."kiwify_purchases" TO "service_role";



GRANT ALL ON TABLE "public"."kiwify_webhook_logs" TO "anon";
GRANT ALL ON TABLE "public"."kiwify_webhook_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."kiwify_webhook_logs" TO "service_role";



GRANT ALL ON TABLE "public"."landing_content" TO "anon";
GRANT ALL ON TABLE "public"."landing_content" TO "authenticated";
GRANT ALL ON TABLE "public"."landing_content" TO "service_role";



GRANT ALL ON TABLE "public"."medical_reports" TO "anon";
GRANT ALL ON TABLE "public"."medical_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."medical_reports" TO "service_role";



GRANT ALL ON TABLE "public"."observation_checklists" TO "anon";
GRANT ALL ON TABLE "public"."observation_checklists" TO "authenticated";
GRANT ALL ON TABLE "public"."observation_checklists" TO "service_role";



GRANT ALL ON TABLE "public"."observation_forms" TO "anon";
GRANT ALL ON TABLE "public"."observation_forms" TO "authenticated";
GRANT ALL ON TABLE "public"."observation_forms" TO "service_role";



GRANT ALL ON TABLE "public"."parent_document_signatures" TO "anon";
GRANT ALL ON TABLE "public"."parent_document_signatures" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_document_signatures" TO "service_role";



GRANT ALL ON TABLE "public"."professional_signatures" TO "anon";
GRANT ALL ON TABLE "public"."professional_signatures" TO "authenticated";
GRANT ALL ON TABLE "public"."professional_signatures" TO "service_role";



GRANT ALL ON TABLE "public"."professionals" TO "anon";
GRANT ALL ON TABLE "public"."professionals" TO "authenticated";
GRANT ALL ON TABLE "public"."professionals" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."referrals" TO "anon";
GRANT ALL ON TABLE "public"."referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."referrals" TO "service_role";



GRANT ALL ON TABLE "public"."school_templates" TO "anon";
GRANT ALL ON TABLE "public"."school_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."school_templates" TO "service_role";



GRANT ALL ON TABLE "public"."schools" TO "anon";
GRANT ALL ON TABLE "public"."schools" TO "authenticated";
GRANT ALL ON TABLE "public"."schools" TO "service_role";



GRANT ALL ON TABLE "public"."service_records" TO "anon";
GRANT ALL ON TABLE "public"."service_records" TO "authenticated";
GRANT ALL ON TABLE "public"."service_records" TO "service_role";



GRANT ALL ON TABLE "public"."student_documents" TO "anon";
GRANT ALL ON TABLE "public"."student_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."student_documents" TO "service_role";



GRANT ALL ON TABLE "public"."student_profiles" TO "anon";
GRANT ALL ON TABLE "public"."student_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."student_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."student_timeline" TO "anon";
GRANT ALL ON TABLE "public"."student_timeline" TO "authenticated";
GRANT ALL ON TABLE "public"."student_timeline" TO "service_role";



GRANT ALL ON TABLE "public"."students" TO "anon";
GRANT ALL ON TABLE "public"."students" TO "authenticated";
GRANT ALL ON TABLE "public"."students" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_appointments" TO "anon";
GRANT ALL ON TABLE "public"."tenant_appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_appointments" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."v_ceo_financial_kpis" TO "anon";
GRANT ALL ON TABLE "public"."v_ceo_financial_kpis" TO "authenticated";
GRANT ALL ON TABLE "public"."v_ceo_financial_kpis" TO "service_role";



GRANT ALL ON TABLE "public"."v_ceo_subscribers" TO "anon";
GRANT ALL ON TABLE "public"."v_ceo_subscribers" TO "authenticated";
GRANT ALL ON TABLE "public"."v_ceo_subscribers" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_nodes" TO "anon";
GRANT ALL ON TABLE "public"."workflow_nodes" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_nodes" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_runs" TO "anon";
GRANT ALL ON TABLE "public"."workflow_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_runs" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_templates" TO "anon";
GRANT ALL ON TABLE "public"."workflow_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_templates" TO "service_role";



GRANT ALL ON TABLE "public"."workflows" TO "anon";
GRANT ALL ON TABLE "public"."workflows" TO "authenticated";
GRANT ALL ON TABLE "public"."workflows" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_user_profile_on_signup();


  create policy "Acesso para usuarios logados 1ldyhwg_0"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'school-templates'::text));



  create policy "Acesso para usuarios logados 1ldyhwg_1"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'school-templates'::text));



  create policy "Acesso para usuarios logados 1ldyhwg_2"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'school-templates'::text));



  create policy "Acesso para usuarios logados 1ldyhwg_3"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'school-templates'::text));



  create policy "allow authenticated read from user-documents"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'user-documents'::text));



  create policy "allow authenticated uploads to user-documents"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'user-documents'::text));



  create policy "laudos_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'laudos'::text));



  create policy "laudos_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'laudos'::text));



  create policy "laudos_read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'laudos'::text));



