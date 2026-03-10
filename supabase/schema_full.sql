-- =============================================================================
-- INCLUIAI — SCHEMA COMPLETO v2.0
-- Plataforma SaaS de Educação Inclusiva
-- Arquiteto: Claude (Anthropic) — 2026
-- =============================================================================
--
-- MÓDULOS:
--   M01: Foundation       — tenants, users, lgpd_consents, admin_users
--   M02: Schools          — schools, school_staff
--   M03: Students         — students, student_files, student_collaborators
--   M04: Scheduling       — appointments, service_records
--   M05: Documents        — documents, document_versions
--   M06: Forms            — complementary_forms, checklists
--   M07: Evolution        — student_evolutions
--   M08: Activities       — activities, activity_attachments
--   M09: Timeline         — timeline_events
--   M10: Workflow         — workflow_steps
--   M11: Audit            — audit_logs
--   M12: Billing          — plans, subscriptions, credits_wallet,
--                           credits_ledger, purchase_intents
--   M13: AI Usage         — ai_usage_logs
--   M14: CMS              — landing_settings
--
-- CONVENÇÕES:
--   - Todos os PKs são UUID (gen_random_uuid())
--   - Todos os timestamps são TIMESTAMPTZ
--   - Snake_case em todas as colunas
--   - JSONB apenas para dados verdadeiramente flexíveis
--   - Soft delete via deleted_at em entidades com dados pessoais
--   - RLS habilitada em todas as tabelas de negócio
-- =============================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;

-- =============================================================================
-- EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA graphql;
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA vault;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Retorna o tenant_id do usuário autenticado (SECURITY DEFINER para bypassar RLS)
CREATE OR REPLACE FUNCTION public.my_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tenant_id
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;
$$;

ALTER FUNCTION public.my_tenant_id() OWNER TO postgres;

-- Trigger: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.update_updated_at() OWNER TO postgres;

-- Gera código de auditoria: 8 chars alfanumérico maiúsculo
CREATE OR REPLACE FUNCTION public.generate_audit_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  code text;
BEGIN
  code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  RETURN code;
END;
$$;

ALTER FUNCTION public.generate_audit_code() OWNER TO postgres;

-- Registra entrada de auditoria com audit_code único (até 5 tentativas)
CREATE OR REPLACE FUNCTION public.audit_record(
  p_tenant_id  uuid,
  p_user_id    uuid,
  p_entity_type text,
  p_entity_id  uuid,
  p_action     text,
  p_content    text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_hash text;
  v_code text;
BEGIN
  v_hash := encode(digest(coalesce(p_content, ''), 'sha256'), 'hex');

  FOR i IN 1..5 LOOP
    v_code := public.generate_audit_code();
    BEGIN
      INSERT INTO public.audit_logs (
        tenant_id, user_id, entity_type, entity_id,
        action, content_hash, audit_code, created_at
      ) VALUES (
        p_tenant_id, p_user_id, p_entity_type, p_entity_id,
        p_action, v_hash, v_code, now()
      );
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      -- tenta novamente
    END;
  END LOOP;

  RAISE EXCEPTION 'Não foi possível gerar audit_code único após 5 tentativas.';
END;
$$;

ALTER FUNCTION public.audit_record(uuid, uuid, text, uuid, text, text) OWNER TO postgres;

-- Valida documento por audit_code (uso público — validação de autenticidade)
CREATE OR REPLACE FUNCTION public.validate_audit_code(p_code text)
RETURNS TABLE(
  audit_code   text,
  entity_type  text,
  entity_id    uuid,
  action       text,
  created_at   timestamptz,
  status       text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    a.audit_code,
    a.entity_type,
    a.entity_id,
    a.action,
    a.created_at,
    'VALIDO'::text AS status
  FROM public.audit_logs a
  WHERE a.audit_code = p_code
  LIMIT 1;
$$;

ALTER FUNCTION public.validate_audit_code(text) OWNER TO postgres;

-- Provisiona tenant + user + carteira ao registrar novo usuário via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_tenant_id uuid;
  v_nome        text;
  v_plan        text;
  v_role        text;
  v_credits     int;
BEGIN
  v_nome := coalesce(
    nullif(new.raw_user_meta_data->>'name', ''),
    split_part(new.email, '@', 1),
    'Usuário'
  );

  v_plan := CASE
    WHEN new.email = 'pro@incluiai.com'     THEN 'PRO'
    WHEN new.email = 'master@incluiai.com'  THEN 'MASTER'
    WHEN new.email = 'admin@incluiai.com'   THEN 'MASTER'
    ELSE 'FREE'
  END;

  v_role := CASE
    WHEN new.email = 'admin@incluiai.com'  THEN 'GESTOR'
    WHEN new.email = 'master@incluiai.com' THEN 'GESTOR'
    WHEN new.email = 'pro@incluiai.com'    THEN 'DOCENTE'
    ELSE 'DOCENTE'
  END;

  v_credits := CASE
    WHEN v_plan = 'PRO'    THEN 50
    WHEN v_plan = 'MASTER' THEN 70
    ELSE 10
  END;

  -- 1) Criar tenant
  new_tenant_id := gen_random_uuid();

  INSERT INTO public.tenants (
    id, name, type,
    student_limit_base, student_limit_extra,
    ai_credit_limit,
    status_assinatura, plano_ativo,
    data_renovacao_plano, created_at, updated_at
  ) VALUES (
    new_tenant_id,
    initcap(v_nome),
    'INDIVIDUAL',
    5, 0,
    v_credits,
    'ACTIVE',
    v_plan,
    now() + interval '30 days',
    now(), now()
  );

  -- 2) Criar perfil em public.users
  INSERT INTO public.users (
    id, tenant_id, nome, email, role, plan,
    active, lgpd_accepted, created_at, updated_at
  ) VALUES (
    new.id, new_tenant_id, initcap(v_nome), new.email,
    v_role, v_plan,
    true, false,
    now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id  = EXCLUDED.tenant_id,
    nome       = EXCLUDED.nome,
    email      = EXCLUDED.email,
    role       = EXCLUDED.role,
    plan       = EXCLUDED.plan,
    active     = EXCLUDED.active,
    updated_at = now();

  -- 3) Criar carteira de créditos
  INSERT INTO public.credits_wallet (
    id, tenant_id,
    credits_total, credits_available, credits_spent,
    reset_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_tenant_id,
    v_credits, v_credits, 0,
    now() + interval '30 days',
    now()
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    credits_total     = EXCLUDED.credits_total,
    credits_available = EXCLUDED.credits_available,
    reset_at          = EXCLUDED.reset_at,
    updated_at        = now();

  -- 4) Criar assinatura inicial
  INSERT INTO public.subscriptions (
    id, tenant_id, plan, status, cycle,
    started_at, next_billing,
    created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_tenant_id,
    v_plan, 'ACTIVE', 'MENSAL',
    now(), now() + interval '30 days',
    now(), now()
  )
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN new;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

-- Trigger no auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- M01 — FOUNDATION
-- =============================================================================

-- TENANTS
-- Unidade de isolamento multi-tenant. Cada assinante possui um tenant.
CREATE TABLE IF NOT EXISTS public.tenants (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name                  text        NOT NULL,
  type                  text        NOT NULL DEFAULT 'INDIVIDUAL'
                          CHECK (type IN ('INDIVIDUAL','PROFESSIONAL','CLINIC','SCHOOL')),
  cnpj                  text,
  phone                 text,
  email                 text,
  logo_url              text,
  address               jsonb       DEFAULT '{}' NOT NULL,

  -- Billing desnormalizado (fonte: subscriptions + plans)
  plano_ativo           text        DEFAULT 'FREE' NOT NULL,
  status_assinatura     text        DEFAULT 'ACTIVE' NOT NULL
                          CHECK (status_assinatura IN ('ACTIVE','TRIALING','PENDING','OVERDUE','CANCELED')),
  data_renovacao_plano  timestamptz,

  -- Limites desnormalizados (atualizados quando plano muda)
  student_limit_base    integer     DEFAULT 5  NOT NULL,
  student_limit_extra   integer     DEFAULT 0  NOT NULL,
  ai_credit_limit       integer     DEFAULT 10 NOT NULL,

  created_at            timestamptz DEFAULT now() NOT NULL,
  updated_at            timestamptz DEFAULT now() NOT NULL
);

CREATE OR REPLACE TRIGGER tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- USERS (perfis de usuários da plataforma)
CREATE TABLE IF NOT EXISTS public.users (
  id                  uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id),
  nome                text        NOT NULL,
  email               text        NOT NULL UNIQUE,
  role                text        NOT NULL DEFAULT 'DOCENTE'
                        CHECK (role IN (
                          'DOCENTE','AEE','COORDENADOR','GESTOR',
                          'CLINICO','RESPONSAVEL_TECNICO'
                        )),
  plan                text        NOT NULL DEFAULT 'FREE',  -- espelho de subscriptions.plan
  active              boolean     NOT NULL DEFAULT true,
  photo_url           text,

  -- LGPD inline (para leitura rápida)
  lgpd_accepted       boolean     NOT NULL DEFAULT false,
  lgpd_accepted_at    timestamptz,
  lgpd_term_version   text,

  created_at          timestamptz DEFAULT now() NOT NULL,
  updated_at          timestamptz DEFAULT now() NOT NULL
);

CREATE OR REPLACE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- LGPD CONSENTS (audit trail imutável de consentimentos)
CREATE TABLE IF NOT EXISTS public.lgpd_consents (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id),
  accepted      boolean     NOT NULL,
  term_version  text        NOT NULL DEFAULT 'v1.0',
  ip_address    text,
  user_agent    text,
  created_at    timestamptz DEFAULT now() NOT NULL
  -- SEM updated_at — tabela append-only
);

-- ADMIN USERS (operadores internos da plataforma — não são tenants)
CREATE TABLE IF NOT EXISTS public.admin_users (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  email       text        NOT NULL UNIQUE,
  role        text        NOT NULL
                CHECK (role IN ('super_admin','financeiro','operacional','viewer')),
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now() NOT NULL
);

-- =============================================================================
-- M02 — SCHOOLS
-- =============================================================================

-- SCHOOLS (escolas vinculadas a um tenant)
CREATE TABLE IF NOT EXISTS public.schools (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id),
  name                text        NOT NULL,
  inep_code           text,
  cnpj                text,
  phone               text,
  email               text,
  instagram           text,
  logo_url            text,
  address             jsonb       DEFAULT '{}' NOT NULL,
  -- Responsáveis (texto livre, não FK — podem ser externos ao sistema)
  principal_name      text,
  manager_name        text,
  coordinator_name    text,
  aee_representative  text,
  aee_rep_name        text,

  active              boolean     NOT NULL DEFAULT true,
  created_at          timestamptz DEFAULT now() NOT NULL,
  updated_at          timestamptz DEFAULT now() NOT NULL
);

CREATE OR REPLACE TRIGGER schools_updated_at
  BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- SCHOOL STAFF (equipe da escola — não necessariamente usuários do sistema)
CREATE TABLE IF NOT EXISTS public.school_staff (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id   uuid    NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  tenant_id   uuid    NOT NULL REFERENCES public.tenants(id),
  name        text    NOT NULL,
  email       text,
  phone       text,
  role        text    NOT NULL
                CHECK (role IN (
                  'AEE','COORDENADOR','PEDAGOGO','GESTOR',
                  'PROFESSOR_REGENTE','OUTROS'
                )),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now() NOT NULL
);

-- =============================================================================
-- M03 — STUDENTS
-- =============================================================================

-- STUDENTS
CREATE TABLE IF NOT EXISTS public.students (
  id                      uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id               uuid    NOT NULL REFERENCES public.tenants(id),
  school_id               uuid    REFERENCES public.schools(id) ON DELETE SET NULL,

  -- Identidade
  name                    text    NOT NULL,
  birth_date              date,
  gender                  text    CHECK (gender IN (
                              'MASCULINO','FEMININO','NAO_BINARIO','OUTRO','NAO_INFORMADO'
                           )),
  photo_url               text,
  registration_date       date,

  -- Tipo e origem
  tipo_aluno              text    NOT NULL DEFAULT 'com_laudo'
                            CHECK (tipo_aluno IN ('com_laudo','em_triagem')),
  is_external             boolean NOT NULL DEFAULT false,
  external_school_name    text,
  external_school_city    text,
  external_professional   text,
  external_referral_source text,

  -- Escolar
  grade                   text,
  shift                   text    CHECK (shift IN ('MANHA','TARDE','INTEGRAL','NOTURNO')),
  regent_teacher          text,
  aee_teacher             text,
  coordinator             text,

  -- Responsável
  guardian_name           text,
  guardian_phone          text,
  guardian_email          text,

  -- Clínico
  diagnosis               text[]  NOT NULL DEFAULT '{}',
  cid                     text[]  NOT NULL DEFAULT '{}',
  support_level           text,
  medication              text,
  professionals           text[]  NOT NULL DEFAULT '{}',

  -- Narrativo
  school_history          text    NOT NULL DEFAULT '',
  family_context          text    NOT NULL DEFAULT '',
  abilities               text[]  NOT NULL DEFAULT '{}',
  difficulties            text[]  NOT NULL DEFAULT '{}',
  strategies              text[]  NOT NULL DEFAULT '{}',
  communication           text[]  NOT NULL DEFAULT '{}',
  observations            text    NOT NULL DEFAULT '',

  -- Meta
  active                  boolean NOT NULL DEFAULT true,
  deleted_at              timestamptz,               -- soft delete (LGPD)
  created_at              timestamptz DEFAULT now() NOT NULL,
  updated_at              timestamptz DEFAULT now() NOT NULL
);

CREATE OR REPLACE TRIGGER students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- STUDENT FILES (laudos, relatórios, avaliações — uploads)
CREATE TABLE IF NOT EXISTS public.student_files (
  id                      uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id               uuid    NOT NULL REFERENCES public.tenants(id),
  student_id              uuid    NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,

  name                    text    NOT NULL,
  type                    text    NOT NULL
                            CHECK (type IN ('LAUDO','RELATORIO','ENCAMINHAMENTO','AVALIACAO','OUTRO')),
  file_url                text,
  storage_path            text,              -- path no Supabase Storage
  file_size_bytes         integer,
  mime_type               text,

  -- Análise IA do documento (opcional)
  ai_synthesis            text,
  ai_pedagogical_points   jsonb   DEFAULT '[]' NOT NULL,
  ai_suggestions          jsonb   DEFAULT '[]' NOT NULL,
  ai_generated_at         timestamptz,

  uploaded_by             text,              -- nome do uploader (desnormalizado)
  uploaded_by_id          uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  audit_code              text    UNIQUE,

  created_at              timestamptz DEFAULT now() NOT NULL
);

-- STUDENT COLLABORATORS (convites para profissionais externos)
CREATE TABLE IF NOT EXISTS public.student_collaborators (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid    NOT NULL REFERENCES public.tenants(id),
  student_id      uuid    NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,

  name            text    NOT NULL,
  email           text,
  role            text    NOT NULL,
  permissions     text[]  NOT NULL DEFAULT '{}',
  status          text    NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','ACCEPTED','COMPLETED','REVOKED')),

  access_code     text    NOT NULL UNIQUE,
  link            text,
  document_type   text,
  document_id     uuid    REFERENCES public.documents(id) ON DELETE SET NULL,

  invited_by_id   uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at    timestamptz,
  expires_at      timestamptz,

  created_at      timestamptz DEFAULT now() NOT NULL
);

-- =============================================================================
-- M04 — SCHEDULING
-- =============================================================================

-- APPOINTMENTS (agenda — compatível com dashboard de calendário)
CREATE TABLE IF NOT EXISTS public.appointments (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid    NOT NULL REFERENCES public.tenants(id),
  student_id      uuid    REFERENCES public.students(id) ON DELETE SET NULL,
  student_name    text,                      -- desnormalizado para exibição

  title           text    NOT NULL,
  type            text    NOT NULL
                    CHECK (type IN ('AEE','AVALIACAO','REUNIAO','ATENDIMENTO','OUTRO')),

  start_at        timestamptz NOT NULL,
  end_at          timestamptz,
  duration_minutes integer,

  professional    text,
  professional_id uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  location        text,
  notes           text,

  status          text    NOT NULL DEFAULT 'agendado'
                    CHECK (status IN ('agendado','realizado','cancelado','reagendado')),

  recurrence      jsonb,                     -- {type:'weekly', days:[1,3], until:'2026-12-31'}

  created_by      uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now() NOT NULL,
  updated_at      timestamptz DEFAULT now() NOT NULL
);

CREATE OR REPLACE TRIGGER appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- SERVICE RECORDS (registro de atendimentos realizados)
CREATE TABLE IF NOT EXISTS public.service_records (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid    NOT NULL REFERENCES public.tenants(id),
  appointment_id  uuid    REFERENCES public.appointments(id) ON DELETE SET NULL,
  student_id      uuid    NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_name    text,

  session_date    date    NOT NULL,
  type            text    NOT NULL
                    CHECK (type IN (
                      'AEE','PSICOLOGIA','FONOAUDIOLOGIA',
                      'TERAPIA_OCUPACIONAL','PSICOPEDAGOGIA','OUTRO'
                    )),

  professional    text,
  professional_id uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  duration_minutes integer,

  attendance      text    NOT NULL
                    CHECK (attendance IN ('PRESENTE','FALTA','REPOSICAO')),
  observation     text    NOT NULL DEFAULT '',
  audio_url       text,

  created_by      uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now() NOT NULL
);

-- =============================================================================
-- M05 — DOCUMENTS
-- =============================================================================

-- DOCUMENTS (protocolos: PAEE, PEI, PDI, Estudo de Caso, etc.)
CREATE TABLE IF NOT EXISTS public.documents (
  id                uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         uuid    NOT NULL REFERENCES public.tenants(id),
  student_id        uuid    REFERENCES public.students(id) ON DELETE CASCADE,
  student_name      text,

  type              text    NOT NULL
                      CHECK (type IN (
                        'ESTUDO_CASO','PEI','PAEE','PDI',
                        'FICHA_ACOMPANHAMENTO','ATIVIDADE',
                        'ESTUDO_CASO_EXTERNO','PEI_EXTERNO','PAEE_EXTERNO'
                      )),
  status            text    NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT','FINAL')),

  source_id         uuid    REFERENCES public.documents(id) ON DELETE SET NULL,
  structured_data   jsonb   NOT NULL DEFAULT '{"sections":[]}',

  -- Auditoria
  audit_code        text    UNIQUE,
  content_hash      text,

  -- Autoria
  generated_by      text,
  last_edited_by    text,
  last_edited_by_id uuid    REFERENCES public.users(id) ON DELETE SET NULL,

  -- Assinaturas (JSONB — flexível por tipo de documento)
  signatures        jsonb   NOT NULL DEFAULT '{}',

  deleted_at        timestamptz,
  created_at        timestamptz DEFAULT now() NOT NULL,
  last_edited_at    timestamptz DEFAULT now() NOT NULL
);

CREATE OR REPLACE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- DOCUMENT VERSIONS (histórico de versões com integridade referencial)
CREATE TABLE IF NOT EXISTS public.document_versions (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id     uuid    NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  tenant_id       uuid    NOT NULL REFERENCES public.tenants(id),

  version_number  integer NOT NULL,
  structured_data jsonb   NOT NULL,
  change_log      text,

  edited_by       text,
  edited_by_id    uuid    REFERENCES public.users(id) ON DELETE SET NULL,

  created_at      timestamptz DEFAULT now() NOT NULL,

  UNIQUE (document_id, version_number)
);

-- =============================================================================
-- M06 — FORMS & CHECKLISTS
-- =============================================================================

-- COMPLEMENTARY FORMS (fichas: observação, escuta familiar, análise AEE, etc.)
CREATE TABLE IF NOT EXISTS public.complementary_forms (
  id            uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid    NOT NULL REFERENCES public.tenants(id),
  student_id    uuid    REFERENCES public.students(id) ON DELETE CASCADE,
  student_name  text,

  tipo          text    NOT NULL
                  CHECK (tipo IN (
                    'obs_regente','escuta_familia','analise_aee',
                    'decisao_institucional','acompanhamento_evolucao'
                  )),
  titulo        text    NOT NULL,
  status        text    NOT NULL DEFAULT 'rascunho'
                  CHECK (status IN ('rascunho','finalizado')),

  fields        jsonb   NOT NULL DEFAULT '{}',

  audit_code    text    UNIQUE,
  content_hash  text,

  created_by    text,
  created_by_id uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now() NOT NULL,
  updated_at    timestamptz DEFAULT now() NOT NULL
);

CREATE OR REPLACE TRIGGER complementary_forms_updated_at
  BEFORE UPDATE ON public.complementary_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- CHECKLISTS (checklists pedagógicos por aluno)
CREATE TABLE IF NOT EXISTS public.checklists (
  id            uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid    NOT NULL REFERENCES public.tenants(id),
  student_id    uuid    REFERENCES public.students(id) ON DELETE CASCADE,

  title         text    NOT NULL,
  category      text    CHECK (category IN ('PEDAGOGICO','COMPORTAMENTAL','DESENVOLVIMENTO','OUTRO')),
  items         jsonb   NOT NULL DEFAULT '[]',
  -- items: [{id, label, checked, notes, category}]

  completed_at  timestamptz,
  created_by    uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now() NOT NULL,
  updated_at    timestamptz DEFAULT now() NOT NULL
);

CREATE OR REPLACE TRIGGER checklists_updated_at
  BEFORE UPDATE ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- M07 — EVOLUTION
-- =============================================================================

-- STUDENT EVOLUTIONS (registros de evolução com dados para gráficos)
CREATE TABLE IF NOT EXISTS public.student_evolutions (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid    NOT NULL REFERENCES public.tenants(id),
  student_id      uuid    NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,

  evolution_date  date    NOT NULL,
  observation     text    NOT NULL DEFAULT '',
  scores          jsonb   NOT NULL DEFAULT '[]',
  -- scores: [{label, value, max, color}] — suporta múltiplos eixos para gráficos
  custom_fields   jsonb   NOT NULL DEFAULT '[]',
  -- custom_fields: [{id, label, type, value}]

  author          text,
  author_id       uuid    REFERENCES public.users(id) ON DELETE SET NULL,

  created_at      timestamptz DEFAULT now() NOT NULL,
  updated_at      timestamptz DEFAULT now() NOT NULL
);

CREATE OR REPLACE TRIGGER student_evolutions_updated_at
  BEFORE UPDATE ON public.student_evolutions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- M08 — ACTIVITIES
-- =============================================================================

-- ACTIVITIES (atividades adaptadas e templates)
CREATE TABLE IF NOT EXISTS public.activities (
  id                uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         uuid    NOT NULL REFERENCES public.tenants(id),
  student_id        uuid    REFERENCES public.students(id) ON DELETE SET NULL,

  title             text    NOT NULL,
  content           text    NOT NULL DEFAULT '',
  guidance          text,
  tags              text[]  NOT NULL DEFAULT '{}',

  is_adapted        boolean NOT NULL DEFAULT false,
  is_template       boolean NOT NULL DEFAULT false,

  -- Rastreio IA
  ai_generated      boolean NOT NULL DEFAULT false,
  ai_model          text,
  credits_consumed  integer NOT NULL DEFAULT 0,

  created_by        uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now() NOT NULL,
  updated_at        timestamptz DEFAULT now() NOT NULL
);

CREATE OR REPLACE TRIGGER activities_updated_at
  BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ACTIVITY ATTACHMENTS (imagens, PDFs, áudios de atividades)
CREATE TABLE IF NOT EXISTS public.activity_attachments (
  id                uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id       uuid    NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  tenant_id         uuid    NOT NULL REFERENCES public.tenants(id),

  type              text    NOT NULL
                      CHECK (type IN ('IMAGE','PDF','AUDIO','OTHER')),
  file_url          text,
  storage_path      text,
  file_name         text,
  mime_type         text,
  file_size_bytes   integer,

  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz DEFAULT now() NOT NULL
);

-- =============================================================================
-- M09 — TIMELINE
-- =============================================================================

-- TIMELINE EVENTS (índice cross-modular da linha do tempo vertical do aluno)
-- Não é fonte de verdade — é agregação para exibição.
-- Pode ser populada por triggers ou pela aplicação.
CREATE TABLE IF NOT EXISTS public.timeline_events (
  id                    uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             uuid    NOT NULL REFERENCES public.tenants(id),
  student_id            uuid    NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,

  event_date            date    NOT NULL,
  type                  text    NOT NULL
                          CHECK (type IN (
                            'protocolo','evolucao','laudo','ficha',
                            'atendimento','matricula','nota','atividade','outro'
                          )),
  title                 text    NOT NULL,
  description           text,

  -- Referência para entidade fonte
  linked_entity_type    text    CHECK (linked_entity_type IN (
                            'document','complementary_form','service_record',
                            'student_evolution','activity','student_file','checklist'
                          )),
  linked_entity_id      uuid,

  icon                  text,
  author                text,
  author_id             uuid    REFERENCES public.users(id) ON DELETE SET NULL,

  created_at            timestamptz DEFAULT now() NOT NULL
);

-- =============================================================================
-- M10 — WORKFLOW
-- =============================================================================

-- WORKFLOW STEPS (etapas de revisão e aprovação de documentos)
CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid    NOT NULL REFERENCES public.tenants(id),
  document_id     uuid    REFERENCES public.documents(id) ON DELETE CASCADE,

  step_order      integer NOT NULL,
  step_name       text    NOT NULL,
  -- ex: 'RASCUNHO','REVISAO_AEE','APROVACAO_COORD','ASSINATURA','PUBLICADO'

  status          text    NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','IN_PROGRESS','APPROVED','REJECTED','SKIPPED')),

  assigned_to     text,
  assigned_to_id  uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  notes           text,

  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz DEFAULT now() NOT NULL,

  UNIQUE (document_id, step_order)
);

-- =============================================================================
-- M11 — AUDIT
-- =============================================================================

-- AUDIT LOGS (append-only — RLS proíbe UPDATE e DELETE)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid    REFERENCES public.tenants(id),
  user_id       uuid,
  user_name     text,

  action        text    NOT NULL,
  entity_type   text,
  entity_id     uuid,
  details       jsonb   NOT NULL DEFAULT '{}',

  ip_address    text,
  user_agent    text,

  content_hash  text,
  audit_code    text    UNIQUE,

  created_at    timestamptz DEFAULT now() NOT NULL
  -- SEM updated_at — tabela imutável
);

-- =============================================================================
-- M12 — BILLING
-- =============================================================================

-- PLANS (definição de planos — tabela global, sem tenant_id)
CREATE TABLE IF NOT EXISTS public.plans (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name                  text        NOT NULL UNIQUE
                          CHECK (name IN ('FREE','PRO','MASTER','INSTITUTIONAL')),
  tagline               text,

  monthly_price         numeric(10,2),
  annual_price          numeric(10,2),
  promo_monthly_price   numeric(10,2),
  promo_annual_price    numeric(10,2),
  promo_active          boolean     NOT NULL DEFAULT false,
  promo_ends_at         timestamptz,

  max_students          integer     NOT NULL DEFAULT 5,
  monthly_credits       integer     NOT NULL DEFAULT 10,

  -- Feature flags explícitas (consultáveis sem parsear JSONB)
  includes_evolution    boolean     NOT NULL DEFAULT false,
  includes_graphs       boolean     NOT NULL DEFAULT false,
  includes_attendance   boolean     NOT NULL DEFAULT false,
  includes_export_word  boolean     NOT NULL DEFAULT false,
  includes_audit_print  boolean     NOT NULL DEFAULT false,
  includes_uploads      boolean     NOT NULL DEFAULT false,
  has_watermark         boolean     NOT NULL DEFAULT true,
  support_level         text        NOT NULL DEFAULT 'Email',

  -- Flags futuras em JSONB
  features              jsonb       NOT NULL DEFAULT '{}',

  is_recommended        boolean     NOT NULL DEFAULT false,
  display_order         integer     NOT NULL DEFAULT 0,

  created_at            timestamptz DEFAULT now() NOT NULL,
  updated_at            timestamptz DEFAULT now() NOT NULL
);

CREATE OR REPLACE TRIGGER plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- SUBSCRIPTIONS (assinaturas por tenant)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                    uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             uuid    NOT NULL UNIQUE REFERENCES public.tenants(id),
  plan                  text    NOT NULL DEFAULT 'FREE',
  status                text    NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE','TRIALING','PENDING','OVERDUE','CANCELED')),
  cycle                 text    NOT NULL DEFAULT 'MENSAL'
                          CHECK (cycle IN ('MENSAL','ANUAL')),
  price_cents           integer,

  provider              text    DEFAULT 'kiwify',
  provider_sub_id       text,
  provider_customer_id  text,

  started_at            timestamptz DEFAULT now(),
  next_billing          timestamptz,
  canceled_at           timestamptz,

  created_at            timestamptz DEFAULT now() NOT NULL,
  updated_at            timestamptz DEFAULT now() NOT NULL
);

CREATE OR REPLACE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- CREDITS WALLET (carteira de créditos por tenant)
CREATE TABLE IF NOT EXISTS public.credits_wallet (
  id                  uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           uuid    NOT NULL UNIQUE REFERENCES public.tenants(id),

  credits_total       integer NOT NULL DEFAULT 10,      -- total concedido no ciclo
  credits_available   integer NOT NULL DEFAULT 10,      -- disponíveis agora
  credits_spent       integer NOT NULL DEFAULT 0,       -- consumidos no ciclo

  reset_at            timestamptz,                      -- próximo reset de créditos
  updated_at          timestamptz DEFAULT now() NOT NULL
);

-- CREDITS LEDGER (razão contábil de movimentações de créditos)
CREATE TABLE IF NOT EXISTS public.credits_ledger (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid    NOT NULL REFERENCES public.tenants(id),

  amount      integer NOT NULL,                          -- positivo=crédito, negativo=débito
  operation   text    NOT NULL
                CHECK (operation IN ('RENEWAL','MANUAL_GRANT','CONSUMPTION','PURCHASE','EXPIRY')),
  description text,

  ref_id      uuid,                                      -- entity que gerou o consumo
  ref_type    text    CHECK (ref_type IN (
                  'document','activity','evolution','form','other'
              )),

  created_by  uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now() NOT NULL
);

-- PURCHASE INTENTS (intenções de compra antes do pagamento)
CREATE TABLE IF NOT EXISTS public.purchase_intents (
  id                    uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             uuid    NOT NULL REFERENCES public.tenants(id),
  user_id               uuid    REFERENCES public.users(id) ON DELETE SET NULL,

  kind                  text    NOT NULL
                          CHECK (kind IN ('PLAN_UPGRADE','AI_CREDITS','STUDENT_SLOTS')),
  sku                   text    NOT NULL,
  quantity              integer NOT NULL DEFAULT 1,
  price_cents           integer,

  status                text    NOT NULL DEFAULT 'CREATED'
                          CHECK (status IN ('CREATED','OPENED','PAID','CANCELED','EXPIRED')),

  provider              text    DEFAULT 'kiwify',
  provider_checkout_id  text,
  checkout_url          text,

  metadata              jsonb   NOT NULL DEFAULT '{}',

  created_at            timestamptz DEFAULT now() NOT NULL,
  paid_at               timestamptz,
  expires_at            timestamptz
);

-- =============================================================================
-- M13 — AI USAGE
-- =============================================================================

-- AI USAGE LOGS (rastreio de uso de IA por tenant)
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid    NOT NULL REFERENCES public.tenants(id),
  user_id         uuid    REFERENCES public.users(id) ON DELETE SET NULL,

  provider        text    NOT NULL DEFAULT 'gemini'
                    CHECK (provider IN ('gemini','openai','claude','custom')),
  model           text,

  operation_type  text    NOT NULL
                    CHECK (operation_type IN (
                      'field_ai','full_document_ai','evolution_report_ai',
                      'adapted_activity_ai','image_generation','file_analysis','other'
                    )),

  entity_type     text    CHECK (entity_type IN (
                      'document','activity','evolution','form','file','other'
                  )),
  entity_id       uuid,

  prompt_tokens     integer,
  completion_tokens integer,
  credits_consumed  integer NOT NULL DEFAULT 1,

  success           boolean NOT NULL DEFAULT true,
  error_message     text,

  created_at        timestamptz DEFAULT now() NOT NULL
);

-- =============================================================================
-- M14 — CMS / LANDING
-- =============================================================================

-- LANDING SETTINGS (singleton de configuração da landing page)
CREATE TABLE IF NOT EXISTS public.landing_settings (
  id                      uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  singleton_key           text    NOT NULL UNIQUE DEFAULT 'default',

  hero_title              text    NOT NULL DEFAULT 'IncluiAI: documentação inclusiva com auditoria e segurança jurídica',
  hero_subtitle           text    NOT NULL DEFAULT 'Estudo de Caso → PAEE → PEI → PDI com padrão profissional, histórico e código auditável.',

  promo_banner_enabled    boolean NOT NULL DEFAULT true,
  promo_banner_text       text    NOT NULL DEFAULT '',
  promo_badge_text        text    NOT NULL DEFAULT '',
  promo_disclaimer        text    NOT NULL DEFAULT '',

  faq                     jsonb   NOT NULL DEFAULT '[]',
  credits_faq_text        text    NOT NULL DEFAULT '',
  credits_rules           jsonb   NOT NULL DEFAULT '{}',
  recommended_plan        text    NOT NULL DEFAULT 'PRO',

  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- ÍNDICES
-- =============================================================================

-- M01
CREATE INDEX IF NOT EXISTS idx_users_tenant          ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_consents_user    ON public.lgpd_consents(user_id);

-- M02
CREATE INDEX IF NOT EXISTS idx_schools_tenant        ON public.schools(tenant_id);
CREATE INDEX IF NOT EXISTS idx_school_staff_school   ON public.school_staff(school_id);

-- M03
CREATE INDEX IF NOT EXISTS idx_students_tenant       ON public.students(tenant_id);
CREATE INDEX IF NOT EXISTS idx_students_school       ON public.students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_tipo         ON public.students(tipo_aluno);
CREATE INDEX IF NOT EXISTS idx_students_active       ON public.students(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_student_files_student ON public.student_files(student_id);
CREATE INDEX IF NOT EXISTS idx_student_collab_student ON public.student_collaborators(student_id);

-- M04
CREATE INDEX IF NOT EXISTS idx_appointments_tenant   ON public.appointments(tenant_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_student  ON public.appointments(student_id);
CREATE INDEX IF NOT EXISTS idx_service_records_student ON public.service_records(student_id, session_date);
CREATE INDEX IF NOT EXISTS idx_service_records_tenant ON public.service_records(tenant_id);

-- M05
CREATE INDEX IF NOT EXISTS idx_documents_tenant      ON public.documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_student     ON public.documents(student_id);
CREATE INDEX IF NOT EXISTS idx_documents_type        ON public.documents(type, status);
CREATE INDEX IF NOT EXISTS idx_documents_audit       ON public.documents(audit_code);
CREATE INDEX IF NOT EXISTS idx_doc_versions_document ON public.document_versions(document_id);

-- M06
CREATE INDEX IF NOT EXISTS idx_forms_student         ON public.complementary_forms(student_id);
CREATE INDEX IF NOT EXISTS idx_forms_tenant          ON public.complementary_forms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_checklists_student    ON public.checklists(student_id);

-- M07
CREATE INDEX IF NOT EXISTS idx_evolutions_student    ON public.student_evolutions(student_id, evolution_date);
CREATE INDEX IF NOT EXISTS idx_evolutions_tenant     ON public.student_evolutions(tenant_id);

-- M08
CREATE INDEX IF NOT EXISTS idx_activities_tenant     ON public.activities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activities_student    ON public.activities(student_id);
CREATE INDEX IF NOT EXISTS idx_act_attach_activity   ON public.activity_attachments(activity_id);

-- M09
CREATE INDEX IF NOT EXISTS idx_timeline_student      ON public.timeline_events(student_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_tenant       ON public.timeline_events(tenant_id);

-- M10
CREATE INDEX IF NOT EXISTS idx_workflow_document     ON public.workflow_steps(document_id);

-- M11
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_code     ON public.audit_logs(audit_code);
CREATE INDEX IF NOT EXISTS idx_audit_entity          ON public.audit_logs(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_tenant          ON public.audit_logs(tenant_id, created_at);

-- M12
CREATE INDEX IF NOT EXISTS idx_credits_ledger_tenant ON public.credits_ledger(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_purchase_intents_tenant ON public.purchase_intents(tenant_id);

-- M13
CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant       ON public.ai_usage_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user         ON public.ai_usage_logs(user_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- M01 — Foundation
ALTER TABLE public.tenants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lgpd_consents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users     ENABLE ROW LEVEL SECURITY;

-- tenants
CREATE POLICY "tenant_select_own"  ON public.tenants FOR SELECT TO authenticated
  USING (id = public.my_tenant_id());
CREATE POLICY "tenant_update_own"  ON public.tenants FOR UPDATE TO authenticated
  USING (id = public.my_tenant_id()) WITH CHECK (id = public.my_tenant_id());
CREATE POLICY "auth_admin_insert_tenants" ON public.tenants FOR INSERT TO supabase_auth_admin
  WITH CHECK (true);

-- users
CREATE POLICY "users_select_own"   ON public.users FOR SELECT TO authenticated
  USING (tenant_id = public.my_tenant_id());
CREATE POLICY "users_update_own"   ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "auth_admin_insert_users" ON public.users FOR INSERT TO supabase_auth_admin
  WITH CHECK (true);

-- lgpd_consents (append-only)
CREATE POLICY "lgpd_select_own"    ON public.lgpd_consents FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "lgpd_insert_own"    ON public.lgpd_consents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND tenant_id = public.my_tenant_id());

-- M02 — Schools
ALTER TABLE public.schools       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_staff  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schools_tenant"   ON public.schools
  USING (tenant_id = public.my_tenant_id());
CREATE POLICY "school_staff_tenant" ON public.school_staff
  USING (tenant_id = public.my_tenant_id());

-- M03 — Students
ALTER TABLE public.students              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_files         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students_tenant"          ON public.students
  USING (tenant_id = public.my_tenant_id());
CREATE POLICY "student_files_tenant"     ON public.student_files
  USING (tenant_id = public.my_tenant_id());
CREATE POLICY "student_collab_tenant"    ON public.student_collaborators
  USING (tenant_id = public.my_tenant_id());

-- M04 — Scheduling
ALTER TABLE public.appointments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointments_tenant"    ON public.appointments
  USING (tenant_id = public.my_tenant_id());
CREATE POLICY "service_records_tenant" ON public.service_records
  USING (tenant_id = public.my_tenant_id());

-- M05 — Documents
ALTER TABLE public.documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_tenant"      ON public.documents
  USING (tenant_id = public.my_tenant_id());
CREATE POLICY "doc_versions_tenant"   ON public.document_versions
  USING (tenant_id = public.my_tenant_id());

-- M06 — Forms
ALTER TABLE public.complementary_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forms_tenant"      ON public.complementary_forms
  USING (tenant_id = public.my_tenant_id());
CREATE POLICY "checklists_tenant" ON public.checklists
  USING (tenant_id = public.my_tenant_id());

-- M07 — Evolution
ALTER TABLE public.student_evolutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "evolutions_tenant" ON public.student_evolutions
  USING (tenant_id = public.my_tenant_id());

-- M08 — Activities
ALTER TABLE public.activities           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activities_tenant"     ON public.activities
  USING (tenant_id = public.my_tenant_id());
CREATE POLICY "act_attach_tenant"     ON public.activity_attachments
  USING (tenant_id = public.my_tenant_id());

-- M09 — Timeline
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "timeline_tenant"    ON public.timeline_events
  USING (tenant_id = public.my_tenant_id());

-- M10 — Workflow
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_tenant"   ON public.workflow_steps
  USING (tenant_id = public.my_tenant_id());

-- M11 — Audit (append-only via RLS)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_insert_own" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.my_tenant_id() AND user_id = auth.uid());
CREATE POLICY "audit_select_own" ON public.audit_logs FOR SELECT TO authenticated
  USING (tenant_id = public.my_tenant_id());
-- Sem UPDATE/DELETE — tabela imutável

-- M12 — Billing
ALTER TABLE public.plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credits_wallet   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credits_ledger   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_read_all"    ON public.plans FOR SELECT USING (true);

CREATE POLICY "sub_tenant"        ON public.subscriptions
  USING (tenant_id = public.my_tenant_id());
CREATE POLICY "wallet_tenant"     ON public.credits_wallet
  USING (tenant_id = public.my_tenant_id());
CREATE POLICY "ledger_tenant"     ON public.credits_ledger
  USING (tenant_id = public.my_tenant_id());
CREATE POLICY "intents_tenant"    ON public.purchase_intents
  USING (tenant_id = public.my_tenant_id());

-- M13 — AI Usage
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_usage_tenant"  ON public.ai_usage_logs
  USING (tenant_id = public.my_tenant_id());
CREATE POLICY "ai_usage_insert"  ON public.ai_usage_logs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.my_tenant_id());

-- M14 — CMS
ALTER TABLE public.landing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "landing_read_all"   ON public.landing_settings FOR SELECT USING (true);
CREATE POLICY "landing_update_ceo" ON public.landing_settings FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.email = 'admin@incluiai.com'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.email = 'admin@incluiai.com'
  ));

-- =============================================================================
-- VIEWS
-- =============================================================================

-- View de planos com preços efetivos (considera promoção)
CREATE OR REPLACE VIEW public.v_plans_effective AS
SELECT
  id, name, tagline,
  monthly_price, annual_price,
  promo_monthly_price, promo_annual_price,
  promo_active, promo_ends_at,
  max_students, monthly_credits,
  includes_evolution, includes_graphs, includes_attendance,
  includes_export_word, includes_audit_print, includes_uploads,
  has_watermark, support_level,
  features, is_recommended, display_order,
  CASE
    WHEN promo_active AND promo_ends_at IS NOT NULL
         AND promo_ends_at > now()
         AND promo_monthly_price IS NOT NULL
    THEN promo_monthly_price
    ELSE monthly_price
  END AS effective_monthly_price,
  CASE
    WHEN promo_active AND promo_ends_at IS NOT NULL
         AND promo_ends_at > now()
         AND promo_annual_price IS NOT NULL
    THEN promo_annual_price
    ELSE annual_price
  END AS effective_annual_price,
  CASE
    WHEN promo_active AND promo_ends_at IS NOT NULL AND promo_ends_at > now()
    THEN true
    ELSE false
  END AS promo_is_live,
  created_at, updated_at
FROM public.plans p;

-- View de validação de documentos (acesso público por audit_code)
CREATE OR REPLACE VIEW public.document_validation AS
SELECT
  audit_code,
  entity_type AS type,
  entity_id,
  action,
  content_hash,
  created_at
FROM public.audit_logs;

-- View de alunos ativos (sem soft-deleted)
CREATE OR REPLACE VIEW public.active_students AS
SELECT * FROM public.students WHERE deleted_at IS NULL;

-- View de documentos ativos (sem soft-deleted)
CREATE OR REPLACE VIEW public.active_documents AS
SELECT * FROM public.documents WHERE deleted_at IS NULL;

-- =============================================================================
-- DEFAULT DATA — PLANS
-- =============================================================================

INSERT INTO public.plans (
  name, tagline,
  monthly_price, annual_price,
  max_students, monthly_credits,
  includes_evolution, includes_graphs, includes_attendance,
  includes_export_word, includes_audit_print, includes_uploads,
  has_watermark, support_level,
  is_recommended, display_order
) VALUES
(
  'FREE', 'Para começar',
  0, 0,
  5, 10,
  false, false, false,
  false, false, false,
  true, 'Email',
  false, 1
),
(
  'PRO', 'Para profissionais',
  97, 77,
  30, 50,
  true, true, false,
  false, true, true,
  false, 'Prioritário',
  true, 2
),
(
  'MASTER', 'Para clínicas e escolas',
  197, 157,
  999, 70,
  true, true, true,
  true, true, true,
  false, 'VIP WhatsApp',
  false, 3
),
(
  'INSTITUTIONAL', 'Redes e secretarias de educação',
  NULL, NULL,
  9999, 9999,
  true, true, true,
  true, true, true,
  false, 'Dedicado',
  false, 4
)
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- GRANTS
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON FUNCTION public.my_tenant_id()     TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.generate_audit_code() TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.audit_record(uuid,uuid,text,uuid,text,text) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.validate_audit_code(text) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.handle_new_user()  TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.update_updated_at() TO anon, authenticated, service_role;

GRANT ALL ON TABLE public.tenants              TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.users                TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.lgpd_consents        TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.admin_users          TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.schools              TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.school_staff         TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.students             TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.student_files        TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.student_collaborators TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.appointments         TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.service_records      TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.documents            TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.document_versions    TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.complementary_forms  TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.checklists           TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.student_evolutions   TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.activities           TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.activity_attachments TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.timeline_events      TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.workflow_steps       TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.audit_logs           TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.plans                TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.subscriptions        TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.credits_wallet       TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.credits_ledger       TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.purchase_intents     TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ai_usage_logs        TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.landing_settings     TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.v_plans_effective    TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.document_validation  TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.active_students      TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.active_documents     TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
