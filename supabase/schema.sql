


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






CREATE OR REPLACE FUNCTION "public"."audit_record"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_action" "text", "p_content" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_hash text;
  v_code text;
begin
  v_hash := encode(digest(coalesce(p_content,''), 'sha256'), 'hex');

  -- tenta gerar um code único (até 5 tentativas)
  for i in 1..5 loop
    v_code := public.generate_audit_code();
    begin
      insert into public.audit_logs (
        tenant_id, user_id, entity_type, entity_id, action, content_hash, audit_code, created_at
      )
      values (
        p_tenant_id, p_user_id, p_entity_type, p_entity_id, p_action, v_hash, v_code, now()
      );
      return v_code;
    exception when unique_violation then
      -- tenta de novo
    end;
  end loop;

  raise exception 'Não foi possível gerar audit_code único após 5 tentativas.';
end;
$$;


ALTER FUNCTION "public"."audit_record"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_action" "text", "p_content" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_audit_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  code text;
begin
  -- 8 chars alfanumérico
  code := upper(substring(replace(gen_random_uuid()::text,'-',''), 1, 8));
  return code;
end;
$$;


ALTER FUNCTION "public"."generate_audit_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  new_tenant_id uuid;
  v_nome text;
  v_plan text;
  v_role text;
  v_credits int;
begin
  v_nome := coalesce(
    nullif(new.raw_user_meta_data->>'name',''),
    split_part(new.email,'@',1),
    'Usuário'
  );

  -- plano por e-mail seed (ajuste se quiser)
  v_plan := case
    when new.email = 'pro@incluiai.com' then 'PRO'
    when new.email = 'master@incluiai.com' then 'MASTER'
    when new.email = 'admin@incluiai.com' then 'MASTER'  -- admin herda MASTER (ou troque p/ PRO)
    else 'FREE'
  end;

  -- role precisa respeitar users_role_check
  v_role := case
    when new.email = 'admin@incluiai.com' then 'super_admin'
    when new.email = 'master@incluiai.com' then 'operacional'
    when new.email = 'pro@incluiai.com' then 'DOCENTE'
    else 'DOCENTE'
  end;

  v_credits := case
    when v_plan = 'PRO' then 70
    when v_plan = 'MASTER' then 100
    else 10
  end;

  -- 1) criar tenant
  new_tenant_id := gen_random_uuid();

  insert into public.tenants (
    id, name, type, cnpj,
    student_limit_base, student_limit_extra,
    ai_credit_limit, creditos_ia_restantes,
    status_assinatura, plano_ativo,
    data_renovacao_plano, created_at
  )
  values (
    new_tenant_id,
    initcap(v_nome),
    'INDIVIDUAL',
    null,
    5, 0,
    v_credits, v_credits,
    'ACTIVE',
    v_plan,
    now() + interval '30 days',
    now()
  );

  -- 2) criar profile em public.users
  insert into public.users (id, tenant_id, nome, email, role, plan, active, created_at)
  values (new.id, new_tenant_id, initcap(v_nome), new.email, v_role, v_plan, true, now())
  on conflict (id) do update
    set tenant_id = excluded.tenant_id,
        nome      = excluded.nome,
        email     = excluded.email,
        role      = excluded.role,
        plan      = excluded.plan,
        active    = excluded.active;

  -- 3) criar carteira de créditos
  insert into public.credits_wallet (id, tenant_id, balance, total_earned, total_spent, credits_total, credits_available, reset_at, updated_at)
  values (gen_random_uuid(), new_tenant_id, v_credits, v_credits, 0, v_credits, v_credits, now() + interval '30 days', now())
  on conflict (tenant_id) do update
    set credits_total      = excluded.credits_total,
        credits_available  = excluded.credits_available,
        reset_at           = excluded.reset_at,
        updated_at         = now();

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_tenant_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select tenant_id
  from public.users
  where id = auth.uid()
  limit 1
$$;


ALTER FUNCTION "public"."my_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


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

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "admin_users_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'financeiro'::"text", 'operacional'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "student_id" "uuid",
    "professional_id" "uuid",
    "appointment_date" timestamp without time zone,
    "presence" "text",
    "notes" "text",
    "audio_url" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    CONSTRAINT "appointments_presence_check" CHECK (("presence" = ANY (ARRAY['presente'::"text", 'falta'::"text"])))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "user_name" "text",
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "content_hash" "text",
    "audit_code" "text"
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."complementary_forms" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "student_id" "uuid",
    "student_name" "text",
    "tipo" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "status" "text" DEFAULT 'rascunho'::"text",
    "fields" "jsonb" DEFAULT '{}'::"jsonb",
    "audit_code" "text",
    "content_hash" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "complementary_forms_status_check" CHECK (("status" = ANY (ARRAY['rascunho'::"text", 'finalizado'::"text"]))),
    CONSTRAINT "complementary_forms_tipo_check" CHECK (("tipo" = ANY (ARRAY['obs_regente'::"text", 'escuta_familia'::"text", 'analise_aee'::"text", 'decisao_institucional'::"text", 'acompanhamento_evolucao'::"text"])))
);


ALTER TABLE "public"."complementary_forms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "document_id" "uuid",
    "credits" integer DEFAULT 1,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."credit_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credits_ledger" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "amount" integer NOT NULL,
    "operation" "text" NOT NULL,
    "description" "text",
    "ref_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "credits_ledger_operation_check" CHECK (("operation" = ANY (ARRAY['RENEWAL'::"text", 'MANUAL_GRANT'::"text", 'CONSUMPTION'::"text", 'PURCHASE'::"text"])))
);


ALTER TABLE "public"."credits_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credits_wallet" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "balance" integer DEFAULT 10,
    "total_earned" integer DEFAULT 10,
    "total_spent" integer DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "credits_total" integer,
    "credits_available" integer,
    "reset_at" timestamp with time zone
);


ALTER TABLE "public"."credits_wallet" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."document_validation" AS
 SELECT "audit_code",
    "entity_type" AS "type",
    "entity_id",
    "action",
    "content_hash",
    "created_at"
   FROM "public"."audit_logs";


ALTER VIEW "public"."document_validation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "student_id" "uuid",
    "student_name" "text",
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text",
    "source_id" "uuid",
    "structured_data" "jsonb" DEFAULT '{"sections": []}'::"jsonb",
    "audit_code" "text",
    "content_hash" "text",
    "generated_by" "text",
    "last_edited_by" "text",
    "signatures" "jsonb" DEFAULT '{}'::"jsonb",
    "versions" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_edited_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "documents_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'FINAL'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."landing_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "singleton_key" "text" DEFAULT 'default'::"text" NOT NULL,
    "hero_title" "text" DEFAULT 'IncluiAI: documentação inclusiva com auditoria e segurança jurídica'::"text" NOT NULL,
    "hero_subtitle" "text" DEFAULT 'Estudo de Caso → PAEE → PEI → PDI com padrão profissional, histórico e código auditável em todos os documentos.'::"text" NOT NULL,
    "promo_banner_enabled" boolean DEFAULT true NOT NULL,
    "promo_banner_text" "text" DEFAULT '⚡ Promoção Caixa Rápido por 15 dias — garanta o preço especial.'::"text" NOT NULL,
    "promo_badge_text" "text" DEFAULT 'CAIXA RÁPIDO'::"text" NOT NULL,
    "promo_disclaimer" "text" DEFAULT 'Promoção por tempo limitado. Você pode cancelar quando quiser.'::"text" NOT NULL,
    "faq" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "credits_faq_text" "text" DEFAULT '“Geração assistida por IA com auditoria e segurança jurídica.”'::"text" NOT NULL,
    "credits_rules" "jsonb" DEFAULT "jsonb_build_object"('field_ai', 1, 'full_document_ai', 3, 'evolution_report_ai', 2, 'adapted_activity_ai_min', 1, 'adapted_activity_ai_max', 2, 'manual_costs', false, 'pdf_costs', false, 'audit_costs', false, 'laudo_upload_costs', false, 'expires_days', 60) NOT NULL,
    "recommended_plan" "text" DEFAULT 'PRO'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."landing_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "user_id" "uuid",
    "role" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp without time zone DEFAULT "now"(),
    CONSTRAINT "organization_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'professional'::"text"])))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "cnpj" "text",
    "phone" "text",
    "email" "text",
    "plan_id" "uuid",
    "extra_students" integer DEFAULT 0,
    "extra_credits" integer DEFAULT 0,
    "credits_used" integer DEFAULT 0,
    "status" "text" DEFAULT 'ativo'::"text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "monthly_price" numeric,
    "annual_price" numeric,
    "max_students" integer,
    "monthly_credits" integer,
    "includes_evolution" boolean DEFAULT false,
    "includes_graphs" boolean DEFAULT false,
    "includes_attendance" boolean DEFAULT false,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "promo_monthly_price" numeric,
    "promo_annual_price" numeric,
    "promo_active" boolean DEFAULT false NOT NULL,
    "promo_ends_at" timestamp with time zone,
    "is_recommended" boolean DEFAULT false NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "tagline" "text",
    "features" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "email" "text",
    "tenant_id" "uuid",
    "tenant_type" "text",
    "plan" "text" DEFAULT 'Starter (Grátis)'::"text",
    "is_admin" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."students" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "tipo_aluno" "text" DEFAULT 'com_laudo'::"text",
    "birth_date" "date",
    "gender" "text",
    "grade" "text",
    "shift" "text",
    "guardian_name" "text",
    "guardian_phone" "text",
    "guardian_email" "text",
    "school_id" "text",
    "regent_teacher" "text",
    "aee_teacher" "text",
    "coordinator" "text",
    "diagnosis" "text"[] DEFAULT '{}'::"text"[],
    "cid" "text"[] DEFAULT '{}'::"text"[],
    "support_level" "text",
    "medication" "text",
    "professionals" "text"[] DEFAULT '{}'::"text"[],
    "school_history" "text" DEFAULT ''::"text",
    "family_context" "text" DEFAULT ''::"text",
    "abilities" "text"[] DEFAULT '{}'::"text"[],
    "difficulties" "text"[] DEFAULT '{}'::"text"[],
    "strategies" "text"[] DEFAULT '{}'::"text"[],
    "communication" "text"[] DEFAULT '{}'::"text"[],
    "observations" "text" DEFAULT ''::"text",
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    "photo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "familyContext" "text",
    "documents" "jsonb" DEFAULT '[]'::"jsonb",
    "registration_date" "date",
    CONSTRAINT "students_tipo_aluno_check" CHECK (("tipo_aluno" = ANY (ARRAY['com_laudo'::"text", 'em_triagem'::"text"])))
);


ALTER TABLE "public"."students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "plan" "text" DEFAULT 'FREE'::"text" NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text",
    "cycle" "text" DEFAULT 'MENSAL'::"text",
    "price_cents" integer,
    "next_billing" timestamp with time zone,
    "provider" "text" DEFAULT 'kiwify'::"text",
    "provider_sub_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "subscriptions_cycle_check" CHECK (("cycle" = ANY (ARRAY['MENSAL'::"text", 'ANUAL'::"text"]))),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'PENDING'::"text", 'OVERDUE'::"text", 'CANCELED'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "cnpj" "text",
    "student_limit_base" integer DEFAULT 5,
    "student_limit_extra" integer DEFAULT 0,
    "ai_credit_limit" integer DEFAULT 10,
    "creditos_ia_restantes" integer DEFAULT 10,
    "status_assinatura" "text" DEFAULT 'ACTIVE'::"text",
    "plano_ativo" "text" DEFAULT 'FREE'::"text",
    "data_renovacao_plano" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tenants_status_assinatura_check" CHECK (("status_assinatura" = ANY (ARRAY['ACTIVE'::"text", 'PENDING'::"text", 'OVERDUE'::"text", 'CANCELED'::"text"]))),
    CONSTRAINT "tenants_type_check" CHECK (("type" = ANY (ARRAY['PROFESSIONAL'::"text", 'CLINIC'::"text", 'SCHOOL'::"text"])))
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "type" "text",
    "amount" numeric,
    "status" "text",
    "gateway_id" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'DOCENTE'::"text" NOT NULL,
    "plan" "text" DEFAULT 'FREE'::"text" NOT NULL,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "plan_tier" "text",
    CONSTRAINT "users_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'financeiro'::"text", 'operacional'::"text", 'viewer'::"text", 'DOCENTE'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."usuarios" AS
 SELECT "id",
    "tenant_id",
    "nome",
    "email",
    "role",
    "plan",
    "active",
    "created_at"
   FROM "public"."users";


ALTER VIEW "public"."usuarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usuarios_legacy" (
    "id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text" NOT NULL,
    "telefone" "text",
    "tipo" "text" DEFAULT 'aluno'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."usuarios_legacy" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_plans_effective" AS
 SELECT "id",
    "name",
    "monthly_price",
    "annual_price",
    "max_students",
    "monthly_credits",
    "includes_evolution",
    "includes_graphs",
    "includes_attendance",
    "created_at",
    "promo_monthly_price",
    "promo_annual_price",
    "promo_active",
    "promo_ends_at",
    "is_recommended",
    "display_order",
    "tagline",
    "features",
        CASE
            WHEN (("promo_active" = true) AND ("promo_ends_at" IS NOT NULL) AND ("promo_ends_at" > "now"()) AND ("promo_monthly_price" IS NOT NULL)) THEN "promo_monthly_price"
            ELSE "monthly_price"
        END AS "effective_monthly_price",
        CASE
            WHEN (("promo_active" = true) AND ("promo_ends_at" IS NOT NULL) AND ("promo_ends_at" > "now"()) AND ("promo_annual_price" IS NOT NULL)) THEN "promo_annual_price"
            ELSE "annual_price"
        END AS "effective_annual_price",
        CASE
            WHEN (("promo_active" = true) AND ("promo_ends_at" IS NOT NULL) AND ("promo_ends_at" > "now"())) THEN true
            ELSE false
        END AS "promo_is_live"
   FROM "public"."plans" "p";


ALTER VIEW "public"."v_plans_effective" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."complementary_forms"
    ADD CONSTRAINT "complementary_forms_audit_code_key" UNIQUE ("audit_code");



ALTER TABLE ONLY "public"."complementary_forms"
    ADD CONSTRAINT "complementary_forms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_usage"
    ADD CONSTRAINT "credit_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credits_ledger"
    ADD CONSTRAINT "credits_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credits_wallet"
    ADD CONSTRAINT "credits_wallet_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credits_wallet"
    ADD CONSTRAINT "credits_wallet_tenant_id_key" UNIQUE ("tenant_id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_audit_code_key" UNIQUE ("audit_code");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."landing_settings"
    ADD CONSTRAINT "landing_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."landing_settings"
    ADD CONSTRAINT "landing_settings_singleton_key_key" UNIQUE ("singleton_key");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_user_id_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_tenant_id_key" UNIQUE ("tenant_id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuarios_legacy"
    ADD CONSTRAINT "usuarios_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."usuarios_legacy"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "audit_logs_audit_code_uidx" ON "public"."audit_logs" USING "btree" ("audit_code");



CREATE INDEX "idx_audit_entity" ON "public"."audit_logs" USING "btree" ("entity_id", "entity_type");



CREATE INDEX "idx_docs_audit" ON "public"."documents" USING "btree" ("audit_code");



CREATE INDEX "idx_docs_student" ON "public"."documents" USING "btree" ("student_id");



CREATE INDEX "idx_docs_tenant" ON "public"."documents" USING "btree" ("tenant_id");



CREATE INDEX "idx_forms_student" ON "public"."complementary_forms" USING "btree" ("student_id");



CREATE INDEX "idx_students_school_id" ON "public"."students" USING "btree" ("school_id");



CREATE INDEX "idx_students_tenant" ON "public"."students" USING "btree" ("tenant_id");



CREATE INDEX "idx_students_tipo" ON "public"."students" USING "btree" ("tipo_aluno");



CREATE OR REPLACE TRIGGER "documents_updated_at" BEFORE UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "forms_updated_at" BEFORE UPDATE ON "public"."complementary_forms" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "students_updated_at" BEFORE UPDATE ON "public"."students" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."complementary_forms"
    ADD CONSTRAINT "complementary_forms_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."complementary_forms"
    ADD CONSTRAINT "complementary_forms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."credit_usage"
    ADD CONSTRAINT "credit_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."credits_ledger"
    ADD CONSTRAINT "credits_ledger_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."credits_wallet"
    ADD CONSTRAINT "credits_wallet_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."usuarios_legacy"
    ADD CONSTRAINT "usuarios_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Members can access appointments" ON "public"."appointments" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."active" = true)))));



CREATE POLICY "Members can access credit_usage" ON "public"."credit_usage" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."active" = true)))));



CREATE POLICY "Members can access transactions" ON "public"."transactions" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."active" = true)))));



CREATE POLICY "Usuários podem atualizar próprio perfil" ON "public"."usuarios_legacy" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Usuários podem inserir próprio perfil" ON "public"."usuarios_legacy" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Usuários podem ver próprio perfil" ON "public"."usuarios_legacy" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_insert" ON "public"."audit_logs" FOR INSERT WITH CHECK (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "audit_insert_authenticated" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))) AND ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_read" ON "public"."audit_logs" FOR SELECT USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "audit_select_own_tenant" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "auth_admin_can_insert_tenants" ON "public"."tenants" FOR INSERT TO "supabase_auth_admin" WITH CHECK (true);



CREATE POLICY "auth_admin_can_insert_users" ON "public"."users" FOR INSERT TO "supabase_auth_admin" WITH CHECK (true);



ALTER TABLE "public"."complementary_forms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credit_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credits_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credits_wallet" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credits_wallet_select_own" ON "public"."credits_wallet" FOR SELECT TO "authenticated" USING (("tenant_id" = ( SELECT "users"."tenant_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "docs_tenant" ON "public"."documents" USING (("tenant_id" = "public"."my_tenant_id"()));



ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "forms_tenant" ON "public"."complementary_forms" USING (("tenant_id" = "public"."my_tenant_id"()));



ALTER TABLE "public"."landing_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "landing_settings_read_all" ON "public"."landing_settings" FOR SELECT USING (true);



CREATE POLICY "landing_settings_update_ceo" ON "public"."landing_settings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."email" = 'admin@incluiai.com'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."email" = 'admin@incluiai.com'::"text")))));



CREATE POLICY "ledger_tenant" ON "public"."credits_ledger" USING (("tenant_id" = "public"."my_tenant_id"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_read_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "students_select_tenant" ON "public"."students" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "students_tenant" ON "public"."students" USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "sub_tenant" ON "public"."subscriptions" USING (("tenant_id" = "public"."my_tenant_id"()));



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_own" ON "public"."tenants" USING (("id" = "public"."my_tenant_id"()));



ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenants_select_own" ON "public"."tenants" FOR SELECT TO "authenticated" USING (("id" = "public"."my_tenant_id"()));



ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_select_own" ON "public"."users" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "users_tenant" ON "public"."users" USING (("tenant_id" = "public"."my_tenant_id"()));



CREATE POLICY "users_update_own" ON "public"."users" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."usuarios_legacy" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_tenant" ON "public"."credits_wallet" USING (("tenant_id" = "public"."my_tenant_id"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."audit_record"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_action" "text", "p_content" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."audit_record"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_action" "text", "p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_record"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_action" "text", "p_content" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_audit_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_audit_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_audit_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_tenant_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_audit_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_audit_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_audit_code"("p_code" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."admin_users" TO "anon";
GRANT ALL ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."complementary_forms" TO "anon";
GRANT ALL ON TABLE "public"."complementary_forms" TO "authenticated";
GRANT ALL ON TABLE "public"."complementary_forms" TO "service_role";



GRANT ALL ON TABLE "public"."credit_usage" TO "anon";
GRANT ALL ON TABLE "public"."credit_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_usage" TO "service_role";



GRANT ALL ON TABLE "public"."credits_ledger" TO "anon";
GRANT ALL ON TABLE "public"."credits_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."credits_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."credits_wallet" TO "anon";
GRANT ALL ON TABLE "public"."credits_wallet" TO "authenticated";
GRANT ALL ON TABLE "public"."credits_wallet" TO "service_role";



GRANT ALL ON TABLE "public"."document_validation" TO "anon";
GRANT ALL ON TABLE "public"."document_validation" TO "authenticated";
GRANT ALL ON TABLE "public"."document_validation" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."landing_settings" TO "anon";
GRANT ALL ON TABLE "public"."landing_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."landing_settings" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."students" TO "anon";
GRANT ALL ON TABLE "public"."students" TO "authenticated";
GRANT ALL ON TABLE "public"."students" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."usuarios" TO "anon";
GRANT ALL ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";



GRANT ALL ON TABLE "public"."usuarios_legacy" TO "anon";
GRANT ALL ON TABLE "public"."usuarios_legacy" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios_legacy" TO "service_role";



GRANT ALL ON TABLE "public"."v_plans_effective" TO "anon";
GRANT ALL ON TABLE "public"."v_plans_effective" TO "authenticated";
GRANT ALL ON TABLE "public"."v_plans_effective" TO "service_role";









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































