-- =============================================================================
-- INCLUIAI — SCHEMA COMPLETO + SEED DE LANÇAMENTO
-- Versão: 1.0 — Data: 2026-03-14
-- =============================================================================
--
-- MÓDULOS ATIVOS:
--   M01 — Foundation  : plans, tenants, users, subscriptions, credits
--   M02 — Alunos      : students
--   M03 — Documentos  : documents (ESTUDO_CASO/PAEE/PEI/PDI), versions, signatures
--   M04 — Tarefas     : tasks
--   M05 — Auditoria   : audit_logs
--
-- LOGINS DE ACESSO (criados no seed):
--   CEO / Super Admin → ceo@incluiai.com.br          senha: IncluiAI@CEO2026
--   Plano MASTER      → diretora@santosdumont.edu.br  senha: Master@Incluiai2026
--   Plano PRO         → professora@monteiro.edu.br    senha: Pro@Incluiai2026
--
-- COMO USAR:
--   1. Supabase → SQL Editor
--   2. Se houver banco antigo, rode PRIMEIRO o bloco de DROP abaixo
--   3. Cole e execute este arquivo completo (Schema + Seed juntos)
-- =============================================================================

-- =============================================================================
-- [OPCIONAL] LIMPAR BANCO ANTIGO — Descomente se precisar começar do zero
-- =============================================================================
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto"  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- =============================================================================
-- FUNÇÕES UTILITÁRIAS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_audit_code()
RETURNS TEXT LANGUAGE plpgsql AS $$
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

CREATE OR REPLACE FUNCTION public.my_tenant_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  SELECT COALESCE(is_super_admin, false) FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- =============================================================================
-- M01: FOUNDATION
-- =============================================================================

-- PLANS
CREATE TABLE IF NOT EXISTS public.plans (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT        NOT NULL UNIQUE,
  max_students         INT         NOT NULL DEFAULT 5,
  ai_credits_per_month INT         NOT NULL DEFAULT 0,
  price_brl            NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.plans (name, max_students, ai_credits_per_month, price_brl) VALUES
  ('FREE',          5,    0,    0.00),
  ('PRO',           30,   50,   79.90),
  ('MASTER',        999,  70,   149.90),
  ('INSTITUTIONAL', 9999, 9999, 499.90)
ON CONFLICT (name) DO NOTHING;

-- TENANTS (Escolas / Organizações)
CREATE TABLE IF NOT EXISTS public.tenants (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  document   TEXT,
  plan_id    UUID        REFERENCES public.plans(id),
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- USERS
CREATE TABLE IF NOT EXISTS public.users (
  id             UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id      UUID    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name      TEXT    NOT NULL,
  email          TEXT    NOT NULL,
  role           TEXT    NOT NULL DEFAULT 'TEACHER'
                          CHECK (role IN ('TEACHER','AEE','COORDINATOR','MANAGER','ADMIN')),
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id              UUID        NOT NULL REFERENCES public.plans(id),
  status               TEXT        NOT NULL DEFAULT 'ACTIVE'
                                    CHECK (status IN ('ACTIVE','TRIALING','PAST_DUE','CANCELLED')),
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  provider             TEXT        DEFAULT 'manual',
  provider_sub_id      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CREDITS WALLET
CREATE TABLE IF NOT EXISTS public.credits_wallet (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  balance       INT         NOT NULL DEFAULT 0 CHECK (balance >= 0),
  last_reset_at TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CREDITS LEDGER
CREATE TABLE IF NOT EXISTS public.credits_ledger (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES public.users(id),
  type        TEXT        NOT NULL CHECK (type IN ('monthly_grant','usage_ai','manual_grant','refund')),
  amount      INT         NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- M02: ALUNOS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.students (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by            UUID        NOT NULL REFERENCES public.users(id),

  -- Identificação
  full_name             TEXT        NOT NULL,
  birth_date            DATE,
  gender                TEXT        CHECK (gender IN ('M','F','OTHER')),
  cpf                   TEXT,

  -- Dados escolares
  school_name           TEXT,
  school_year           TEXT,
  class_name            TEXT,
  teacher_name          TEXT,

  -- Diagnóstico
  primary_diagnosis     TEXT,
  secondary_diagnoses   TEXT[]      DEFAULT '{}',
  cid_codes             TEXT[]      DEFAULT '{}',

  -- Necessidades pedagógicas
  learning_needs        TEXT,
  behavioral_notes      TEXT,
  medical_notes         TEXT,

  -- Responsável
  guardian_name         TEXT,
  guardian_phone        TEXT,
  guardian_email        TEXT,
  guardian_relationship TEXT,

  -- Controle
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- M03: DOCUMENTOS PEDAGÓGICOS
-- Regra obrigatória: PAEE/PEI/PDI exigem Estudo de Caso (source_id)
-- Cadeia: ESTUDO_CASO → PAEE → PEI → PDI
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.documents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id      UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_by      UUID        NOT NULL REFERENCES public.users(id),

  doc_type        TEXT        NOT NULL CHECK (doc_type IN ('ESTUDO_CASO','PAEE','PEI','PDI')),
  source_id       UUID        REFERENCES public.documents(id),

  title           TEXT        NOT NULL,
  structured_data JSONB       NOT NULL DEFAULT '{}',

  status          TEXT        NOT NULL DEFAULT 'DRAFT'
                               CHECK (status IN ('DRAFT','REVIEW','APPROVED','SIGNED')),

  audit_code      TEXT        UNIQUE DEFAULT public.generate_audit_code(),
  content_hash    TEXT,

  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.document_versions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_number  INT         NOT NULL,
  structured_data JSONB       NOT NULL DEFAULT '{}',
  content_hash    TEXT,
  changed_by      UUID        NOT NULL REFERENCES public.users(id),
  change_note     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.professional_signatures (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  signature_data TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.document_signatures (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  signed_by      UUID        NOT NULL REFERENCES public.users(id),
  signer_role    TEXT,
  signature_data TEXT,
  signed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- M04: TAREFAS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by  UUID        NOT NULL REFERENCES public.users(id),
  assigned_to UUID        REFERENCES public.users(id),
  student_id  UUID        REFERENCES public.students(id),
  document_id UUID        REFERENCES public.documents(id),

  title       TEXT        NOT NULL,
  description TEXT,
  priority    TEXT        NOT NULL DEFAULT 'MEDIUM'
                           CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  status      TEXT        NOT NULL DEFAULT 'PENDING'
                           CHECK (status IN ('PENDING','IN_PROGRESS','DONE','CANCELLED')),
  due_date    TIMESTAMPTZ,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- M05: AUDITORIA (imutável)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id),
  user_id     UUID        REFERENCES public.users(id),
  entity_type TEXT        NOT NULL,
  entity_id   UUID,
  action      TEXT        NOT NULL,
  content_hash TEXT,
  audit_code  TEXT        UNIQUE DEFAULT public.generate_audit_code(),
  metadata    JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TRIGGERS updated_at
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants','users','subscriptions','credits_wallet',
    'students','documents','tasks','professional_signatures'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;

-- =============================================================================
-- TRIGGER: Auto-cria tenant + user no signup do Supabase Auth
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  v_tenant_id    UUID;
  v_free_plan_id UUID;
BEGIN
  SELECT id INTO v_free_plan_id FROM public.plans WHERE name = 'FREE' LIMIT 1;

  INSERT INTO public.tenants (name, plan_id)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'organization_name', 'Minha Escola'),
    v_free_plan_id
  ) RETURNING id INTO v_tenant_id;

  INSERT INTO public.subscriptions (tenant_id, plan_id, status,
    current_period_start, current_period_end)
  VALUES (v_tenant_id, v_free_plan_id, 'ACTIVE', NOW(), NOW() + INTERVAL '30 days');

  INSERT INTO public.credits_wallet (tenant_id, balance, last_reset_at)
  VALUES (v_tenant_id, 0, NOW());

  INSERT INTO public.users (id, tenant_id, full_name, email, role)
  VALUES (
    NEW.id, v_tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'TEACHER')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- ÍNDICES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_tenant          ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_students_tenant        ON public.students(tenant_id);
CREATE INDEX IF NOT EXISTS idx_students_active        ON public.students(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_student      ON public.documents(student_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_type  ON public.documents(tenant_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_source       ON public.documents(source_id);
CREATE INDEX IF NOT EXISTS idx_documents_active       ON public.documents(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_tenant           ON public.tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned         ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_student          ON public.tasks(student_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity           ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant           ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_credits_ledger_tenant  ON public.credits_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doc_versions_doc       ON public.document_versions(document_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.plans                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credits_wallet          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credits_ledger          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_signatures     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs              ENABLE ROW LEVEL SECURITY;

-- Limpa políticas antigas (idempotente)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- PLANS: leitura pública
CREATE POLICY "plans_read"          ON public.plans FOR SELECT USING (true);

-- TENANTS
CREATE POLICY "tenants_super_admin" ON public.tenants FOR ALL USING (public.is_super_admin());
CREATE POLICY "tenants_own"         ON public.tenants FOR ALL
  USING (id = public.my_tenant_id() AND NOT public.is_super_admin())
  WITH CHECK (id = public.my_tenant_id());

-- USERS
CREATE POLICY "users_super_admin"   ON public.users FOR ALL USING (public.is_super_admin());
CREATE POLICY "users_own_tenant"    ON public.users FOR ALL
  USING (tenant_id = public.my_tenant_id() AND NOT public.is_super_admin())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- SUBSCRIPTIONS
CREATE POLICY "subs_super_admin"    ON public.subscriptions FOR ALL USING (public.is_super_admin());
CREATE POLICY "subs_own"            ON public.subscriptions FOR ALL
  USING (tenant_id = public.my_tenant_id() AND NOT public.is_super_admin())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- CREDITS WALLET
CREATE POLICY "wallet_super_admin"  ON public.credits_wallet FOR ALL USING (public.is_super_admin());
CREATE POLICY "wallet_own"          ON public.credits_wallet FOR ALL
  USING (tenant_id = public.my_tenant_id() AND NOT public.is_super_admin())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- CREDITS LEDGER
CREATE POLICY "ledger_super_admin"  ON public.credits_ledger FOR ALL USING (public.is_super_admin());
CREATE POLICY "ledger_own"          ON public.credits_ledger FOR ALL
  USING (tenant_id = public.my_tenant_id() AND NOT public.is_super_admin())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- STUDENTS
CREATE POLICY "students_super_admin" ON public.students FOR ALL USING (public.is_super_admin());
CREATE POLICY "students_own"         ON public.students FOR ALL
  USING (tenant_id = public.my_tenant_id() AND deleted_at IS NULL AND NOT public.is_super_admin())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- DOCUMENTS
CREATE POLICY "docs_super_admin"    ON public.documents FOR ALL USING (public.is_super_admin());
CREATE POLICY "docs_own"            ON public.documents FOR ALL
  USING (tenant_id = public.my_tenant_id() AND deleted_at IS NULL AND NOT public.is_super_admin())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- DOCUMENT VERSIONS
CREATE POLICY "docver_own"          ON public.document_versions FOR ALL
  USING (document_id IN (SELECT id FROM public.documents WHERE tenant_id = public.my_tenant_id()));

-- PROFESSIONAL SIGNATURES
CREATE POLICY "profsig_own"         ON public.professional_signatures FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- DOCUMENT SIGNATURES
CREATE POLICY "docsig_own"          ON public.document_signatures FOR ALL
  USING (document_id IN (SELECT id FROM public.documents WHERE tenant_id = public.my_tenant_id()));

-- TASKS
CREATE POLICY "tasks_super_admin"   ON public.tasks FOR ALL USING (public.is_super_admin());
CREATE POLICY "tasks_own"           ON public.tasks FOR ALL
  USING (tenant_id = public.my_tenant_id() AND NOT public.is_super_admin())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- AUDIT LOGS (sem DELETE por design — imutável)
CREATE POLICY "audit_super_admin"   ON public.audit_logs FOR SELECT USING (public.is_super_admin());
CREATE POLICY "audit_read"          ON public.audit_logs FOR SELECT
  USING (tenant_id = public.my_tenant_id() AND NOT public.is_super_admin());
CREATE POLICY "audit_insert"        ON public.audit_logs FOR INSERT
  WITH CHECK (tenant_id = public.my_tenant_id() OR public.is_super_admin());

-- =============================================================================
-- GRANTS
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL   ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT SELECT ON public.plans TO anon;
GRANT ALL   ON ALL TABLES    IN SCHEMA public TO authenticated;
GRANT ALL   ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_tenant_id()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_audit_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at()      TO authenticated;

-- =============================================================================
-- =============================================================================
-- SEED DE LANÇAMENTO
-- =============================================================================
-- =============================================================================

-- Desabilita o trigger para evitar criação duplicada durante o seed
ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;

-- =============================================================================
-- TENANTS (Escolas)
-- =============================================================================

INSERT INTO public.tenants (id, name, document, plan_id, is_active) VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    'IncluiAI Plataforma',
    '00.000.000/0001-00',
    (SELECT id FROM public.plans WHERE name = 'INSTITUTIONAL'),
    true
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'Escola Municipal Monteiro Lobato',
    '11.222.333/0001-44',
    (SELECT id FROM public.plans WHERE name = 'PRO'),
    true
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'Escola Estadual Santos Dumont',
    '55.666.777/0001-88',
    (SELECT id FROM public.plans WHERE name = 'MASTER'),
    true
  )
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- AUTH USERS (Supabase Auth)
-- =============================================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
  -- CEO / Super Admin
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000010',
    'authenticated', 'authenticated',
    'ceo@incluiai.com.br',
    crypt('IncluiAI@CEO2026', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Carlos Eduardo Oliveira","role":"ADMIN"}',
    NOW(), NOW(), '', '', '', ''
  ),
  -- Plano PRO — Professora da Escola Monteiro Lobato
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000020',
    'authenticated', 'authenticated',
    'professora@monteiro.edu.br',
    crypt('Pro@Incluiai2026', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Ana Paula Ferreira","role":"TEACHER"}',
    NOW(), NOW(), '', '', '', ''
  ),
  -- Plano MASTER — Diretora da Escola Santos Dumont
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000030',
    'authenticated', 'authenticated',
    'diretora@santosdumont.edu.br',
    crypt('Master@Incluiai2026', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Beatriz Santos Lima","role":"MANAGER"}',
    NOW(), NOW(), '', '', '', ''
  )
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- PUBLIC USERS (Perfis)
-- =============================================================================

INSERT INTO public.users (id, tenant_id, full_name, email, role, is_super_admin, is_active) VALUES
  (
    '10000000-0000-0000-0000-000000000010',
    '10000000-0000-0000-0000-000000000001',
    'Carlos Eduardo Oliveira',
    'ceo@incluiai.com.br',
    'ADMIN', true, true
  ),
  (
    '10000000-0000-0000-0000-000000000020',
    '10000000-0000-0000-0000-000000000002',
    'Ana Paula Ferreira',
    'professora@monteiro.edu.br',
    'TEACHER', false, true
  ),
  (
    '10000000-0000-0000-0000-000000000030',
    '10000000-0000-0000-0000-000000000003',
    'Beatriz Santos Lima',
    'diretora@santosdumont.edu.br',
    'MANAGER', false, true
  )
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- SUBSCRIPTIONS
-- =============================================================================

INSERT INTO public.subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end) VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.plans WHERE name = 'INSTITUTIONAL'),
    'ACTIVE', NOW(), NOW() + INTERVAL '1 year'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    (SELECT id FROM public.plans WHERE name = 'PRO'),
    'ACTIVE', NOW(), NOW() + INTERVAL '30 days'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    (SELECT id FROM public.plans WHERE name = 'MASTER'),
    'ACTIVE', NOW(), NOW() + INTERVAL '30 days'
  )
ON CONFLICT DO NOTHING;

-- =============================================================================
-- CREDITS WALLET
-- =============================================================================

INSERT INTO public.credits_wallet (tenant_id, balance, last_reset_at) VALUES
  ('10000000-0000-0000-0000-000000000001', 9999, NOW()),
  ('10000000-0000-0000-0000-000000000002', 50,   NOW()),
  ('10000000-0000-0000-0000-000000000003', 70,   NOW())
ON CONFLICT (tenant_id) DO NOTHING;

-- =============================================================================
-- ALUNOS (4 exemplos)
-- =============================================================================

-- Escola PRO (Monteiro Lobato) → Lucas e Ana Carolina
INSERT INTO public.students (
  id, tenant_id, created_by,
  full_name, birth_date, gender,
  school_name, school_year, class_name, teacher_name,
  primary_diagnosis, cid_codes,
  learning_needs, behavioral_notes,
  guardian_name, guardian_phone, guardian_email, guardian_relationship
) VALUES
  -- Aluno 1: Lucas Ferreira Santos — TDAH
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000020',
    'Lucas Ferreira Santos',
    '2016-04-12',
    'M',
    'Escola Municipal Monteiro Lobato',
    '3º Ano',
    'Turma A',
    'Ana Paula Ferreira',
    'Transtorno de Déficit de Atenção e Hiperatividade (TDAH)',
    ARRAY['F90.0'],
    'Necessita de suporte para manter foco durante as atividades. Beneficia-se de tarefas curtas, instruções claras e feedbacks frequentes. Preferência por atividades práticas e visuais.',
    'Apresenta agitação motora frequente. Interrompe os colegas com frequência. Melhora significativa com rotina estruturada e combinados claros.',
    'Maria Ferreira Santos',
    '(11) 98765-4321',
    'maria.ferreira@email.com',
    'Mãe'
  ),
  -- Aluno 2: Ana Carolina Oliveira — Autismo Nível 1
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000020',
    'Ana Carolina Oliveira',
    '2014-08-25',
    'F',
    'Escola Municipal Monteiro Lobato',
    '5º Ano',
    'Turma B',
    'Ana Paula Ferreira',
    'Transtorno do Espectro Autista (TEA) — Nível 1',
    ARRAY['F84.0'],
    'Dificuldade na compreensão de linguagem figurada e ironias. Leitura fluente porém com dificuldades de interpretação de texto. Excelente memória visual e habilidades matemáticas acima da média.',
    'Apresenta sensibilidade sensorial a sons altos. Prefere rotinas fixas. Apresenta estereotipias motoras em situações de ansiedade. Relacionamento social limitado mas presente.',
    'Roberto Oliveira',
    '(11) 91234-5678',
    'roberto.oliveira@email.com',
    'Pai'
  )
ON CONFLICT (id) DO NOTHING;

-- Escola MASTER (Santos Dumont) → Pedro e Maria Eduarda
INSERT INTO public.students (
  id, tenant_id, created_by,
  full_name, birth_date, gender,
  school_name, school_year, class_name, teacher_name,
  primary_diagnosis, cid_codes,
  learning_needs, behavioral_notes,
  guardian_name, guardian_phone, guardian_email, guardian_relationship
) VALUES
  -- Aluno 3: Pedro Henrique Costa — Dislexia
  (
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000030',
    'Pedro Henrique Costa',
    '2012-11-03',
    'M',
    'Escola Estadual Santos Dumont',
    '7º Ano',
    'Turma C',
    'Beatriz Santos Lima',
    'Dislexia',
    ARRAY['R48.0','F81.0'],
    'Necessita de tempo estendido nas avaliações. Beneficia-se de textos com fontes maiores e maior espaçamento. Audiolivros e materiais em formato de áudio auxiliam a compreensão. Leitura lenta com trocas de letras (b/d, p/q).',
    'Autoestima comprometida em relação às atividades de leitura. Evita ler em voz alta. Rendimento muito melhor em avaliações orais. Boa capacidade de expressão verbal.',
    'Sandra Costa',
    '(21) 99876-5432',
    'sandra.costa@email.com',
    'Mãe'
  ),
  -- Aluno 4: Maria Eduarda Lima — Síndrome de Down
  (
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000030',
    'Maria Eduarda Lima',
    '2015-02-18',
    'F',
    'Escola Estadual Santos Dumont',
    '2º Ano',
    'Turma A',
    'Beatriz Santos Lima',
    'Síndrome de Down (Trissomia do Cromossomo 21)',
    ARRAY['Q90.0'],
    'Necessita de adaptação curricular significativa. Aprendizagem por repetição e rotina. Beneficia-se de materiais concretos, pictogramas e comunicação alternativa. Em processo de alfabetização com método fônico adaptado.',
    'Sociável e afetiva com colegas e professores. Participa ativamente de atividades em grupo. Apresenta hipotonia muscular e dificuldade de motricidade fina. Atenção sustentada de aproximadamente 10 minutos.',
    'Fernanda Lima',
    '(21) 98765-0000',
    'fernanda.lima@email.com',
    'Mãe'
  )
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- DOCUMENTOS — Estudos de Caso + PAEE + PEI de exemplo
-- =============================================================================

INSERT INTO public.documents (
  id, tenant_id, student_id, created_by,
  doc_type, source_id, title, status, structured_data
) VALUES

  -- ── ESTUDO DE CASO: Lucas Ferreira Santos ──────────────────────────────────
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000020',
    'ESTUDO_CASO', NULL,
    'Estudo de Caso — Lucas Ferreira Santos',
    'APPROVED',
    '{
      "queixa_principal": "Aluno apresenta grande dificuldade de manter atenção durante as aulas. Levanta frequentemente, distrai os colegas e não conclui as atividades propostas.",
      "historico_escolar": "Repetiu o 2º ano. Professores relatam comportamento semelhante desde o 1º ano. Diagnóstico de TDAH confirmado em 2024 pelo neuropediatra Dr. Marcos Alves.",
      "historico_familiar": "Família estruturada. Mãe acompanha de perto a vida escolar. Pai viaja a trabalho frequentemente. Filho único. Reside com mãe e avó materna.",
      "desenvolvimento_motor": "Desenvolvimento motor adequado para a faixa etária. Gosta de esportes, especialmente futebol. Sem queixas de coordenação motora grossa. Leve dificuldade na motricidade fina (letra ilegível).",
      "desenvolvimento_linguagem": "Linguagem oral bem desenvolvida. Vocabulário amplo para a idade. Leitura fluente com compreensão adequada quando estimulado. Produção textual abaixo do esperado.",
      "aspectos_cognitivos": "QI avaliado na faixa média (Wisc-V, 2024). Memória operacional abaixo da média. Velocidade de processamento prejudicada. Raciocínio verbal e espacial preservados.",
      "aspectos_socioemocionais": "Relacionamento positivo com colegas, mas conflitos frequentes por impulsividade. Baixa tolerância à frustração. Autoestima preservada. Relata gostar da escola.",
      "hipotese_diagnostica": "TDAH tipo combinado (F90.0). Em uso de metilfenidato 10mg conforme prescrição médica.",
      "encaminhamentos": "Acompanhamento psicopedagógico semanal. Orientação familiar. Articulação com equipe médica. Elaboração de PAEE e PEI prioritários."
    }'
  ),

  -- ── ESTUDO DE CASO: Ana Carolina Oliveira ──────────────────────────────────
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000020',
    'ESTUDO_CASO', NULL,
    'Estudo de Caso — Ana Carolina Oliveira',
    'APPROVED',
    '{
      "queixa_principal": "Aluna apresenta dificuldades de interação social e comunicação, com comportamentos repetitivos. Dificuldade em compreender ironias e linguagem não-literal.",
      "historico_escolar": "Frequenta escola regular desde o 1º ano com apoio de AEE. Diagnóstico de TEA confirmado aos 4 anos. Laudo neurológico e relatório da psicóloga disponíveis.",
      "historico_familiar": "Pais divorciados. Aluna reside com o pai. Relacionamento com a mãe por visitação. Avó paterna participa ativamente do acompanhamento escolar.",
      "desenvolvimento_motor": "Motricidade grossa preservada. Dificuldade na motricidade fina. Apresenta estereotipias motoras (balanceio, flapping de mãos) em momentos de sobrecarga sensorial.",
      "desenvolvimento_linguagem": "Comunicação verbal estabelecida. Vocabulário formal e preciso. Dificuldade com ambiguidades e ironias. Discurso por vezes descontextualizado. Ecolalia leve.",
      "aspectos_cognitivos": "Habilidades cognitivas acima da média em matemática e memorização. Leitura fluente e precisa. Interpretação textual comprometida quando envolve inferências sociais.",
      "aspectos_socioemocionais": "Prefere atividades solitárias. Tem uma amiga próxima. Demonstra afeto de forma particular (não gosta de contato físico). Ansiedade em situações de mudança de rotina.",
      "hipotese_diagnostica": "Transtorno do Espectro Autista — Nível 1 (F84.0). Sem uso de medicação no momento.",
      "encaminhamentos": "Manutenção do AEE. Orientação à família sobre comunicação. Adequação do ambiente físico. Capacitação dos professores. Elaboração de PAEE imediata."
    }'
  ),

  -- ── PAEE: Ana Carolina Oliveira ────────────────────────────────────────────
  (
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000020',
    'PAEE',
    '30000000-0000-0000-0000-000000000002',
    'PAEE — Ana Carolina Oliveira — 2026',
    'APPROVED',
    '{
      "periodo_vigencia": {"inicio": "2026-02-01", "fim": "2026-12-20"},
      "frequencia_atendimento": "2x por semana",
      "duracao_sessao": "50 minutos",
      "local_atendimento": "Sala de Recursos Multifuncionais",
      "necessidades_identificadas": [
        "Desenvolvimento das habilidades sociais e comunicação social",
        "Controle de sobrecarga sensorial",
        "Interpretação de contexto social e linguagem figurada",
        "Organização e antecipação de rotinas"
      ],
      "objetivos_atendimento": [
        "Ampliar repertório de habilidades sociais em situações estruturadas",
        "Desenvolver estratégias de autorregulação sensorial",
        "Treinar interpretação de linguagem figurada por meio de situações concretas",
        "Utilizar recursos visuais para antecipação da rotina escolar"
      ],
      "estrategias": [
        "Uso de histórias sociais (Social Stories) semanais",
        "Treinamento de habilidades sociais em grupo pequeno",
        "Criação de rotina visual com pictogramas",
        "Cantos sensoriais para autorregulação",
        "Jogos cooperativos estruturados"
      ],
      "recursos_utilizados": [
        "Pictogramas e agendas visuais",
        "Materiais de estimulação sensorial (massinha, fidget toys)",
        "Jogos de tabuleiro cooperativos",
        "Tablets com aplicativos de habilidades sociais"
      ],
      "profissional_responsavel": "Ana Paula Ferreira — Professora AEE",
      "articulacao_sala_regular": "Reunião quinzenal com professora da sala regular. Adaptações curriculares documentadas por escrito e enviadas semanalmente."
    }'
  ),

  -- ── ESTUDO DE CASO: Pedro Henrique Costa ──────────────────────────────────
  (
    '30000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000030',
    'ESTUDO_CASO', NULL,
    'Estudo de Caso — Pedro Henrique Costa',
    'APPROVED',
    '{
      "queixa_principal": "Aluno com dificuldades severas de leitura e escrita, com trocas e inversões de letras frequentes. Leitura silabada mesmo após anos de escolarização.",
      "historico_escolar": "Reprovação no 4º ano. Avaliação psicopedagógica em 2025 confirmou hipótese de Dislexia. Em acompanhamento fonoaudiológico.",
      "historico_familiar": "Família muito preocupada. Mãe relata histórico familiar de dificuldades de leitura (tio e avô). Pais separados, aluno mora com a mãe e padrasto.",
      "desenvolvimento_motor": "Coordenação motora grossa excelente — pratica natação e vôlei. Motricidade fina prejudicada: letra ilegível, pressão excessiva no lápis.",
      "desenvolvimento_linguagem": "Expressão oral excelente e rica. Leitura em voz alta muito lenta com múltiplas trocas (b/d, p/q, n/u). Compreensão auditiva preservada. Dificuldade severa em escrita espontânea.",
      "aspectos_cognitivos": "Inteligência preservada. Raciocínio lógico-matemático acima da média. Memória auditiva boa. Memória visual-fonológica comprometida.",
      "aspectos_socioemocionais": "Envergonha-se das dificuldades de leitura. Evita situações de leitura em público. Humor irritável quando pressionado. Boa integração social com colegas.",
      "hipotese_diagnostica": "Dislexia do desenvolvimento (F81.0, R48.0). Em acompanhamento fonoaudiológico há 6 meses.",
      "encaminhamentos": "Manutenção do acompanhamento fonoaudiológico. Adaptações de avaliação (tempo estendido, prova oral). Elaboração urgente de PAEE e PEI."
    }'
  ),

  -- ── ESTUDO DE CASO: Maria Eduarda Lima ────────────────────────────────────
  (
    '30000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000030',
    'ESTUDO_CASO', NULL,
    'Estudo de Caso — Maria Eduarda Lima',
    'APPROVED',
    '{
      "queixa_principal": "Aluna com Síndrome de Down em processo de alfabetização. Necessita de currículo funcional adaptado e apoio permanente em sala.",
      "historico_escolar": "Em escola regular desde os 6 anos. Frequenta AEE desde o início. Acompanhamento com terapeuta ocupacional e fonoaudióloga.",
      "historico_familiar": "Família muito participativa. Mãe presente em todas as reuniões. Participa do grupo de apoio de famílias de crianças com SD. Dois irmãos mais velhos sem comprometimentos.",
      "desenvolvimento_motor": "Hipotonia muscular presente. Marcha estabelecida. Dificuldades de motricidade fina. Em treino de preensão com terapeuta ocupacional.",
      "desenvolvimento_linguagem": "Comunicação verbal estabelecida com vocabulário funcional de aproximadamente 200 palavras. Frases simples de 2-3 palavras. Compreende mais do que expressa. Fonoaudióloga trabalhando articulação.",
      "aspectos_cognitivos": "Aprendizagem por repetição, rotina e contextualização. Reconhece algumas letras e números. Identifica o próprio nome escrito. Contagem até 10 com apoio concreto.",
      "aspectos_socioemocionais": "Muito afetiva e sociável. Querida pelos colegas. Gosta de música e dança. Demonstra preferências e recusas claramente. Humor estável.",
      "hipotese_diagnostica": "Síndrome de Down — Trissomia livre do cromossomo 21 (Q90.0). DI leve a moderada.",
      "encaminhamentos": "Currículo funcional com foco em autonomia, alfabetização e matemática funcional. Manutenção de todos os atendimentos especializados. PEI com metas de longo prazo."
    }'
  ),

  -- ── PAEE: Maria Eduarda Lima ──────────────────────────────────────────────
  (
    '30000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000030',
    'PAEE',
    '30000000-0000-0000-0000-000000000005',
    'PAEE — Maria Eduarda Lima — 2026',
    'APPROVED',
    '{
      "periodo_vigencia": {"inicio": "2026-02-01", "fim": "2026-12-20"},
      "frequencia_atendimento": "3x por semana",
      "duracao_sessao": "50 minutos",
      "local_atendimento": "Sala de Recursos Multifuncionais",
      "necessidades_identificadas": [
        "Desenvolvimento do processo de alfabetização com método adaptado",
        "Ampliação da comunicação expressiva",
        "Desenvolvimento da autonomia nas atividades de vida diária",
        "Estimulação da motricidade fina e coordenação viso-motora"
      ],
      "objetivos_atendimento": [
        "Reconhecer e escrever todas as letras do alfabeto até dezembro/2026",
        "Ler palavras simples e familiares com suporte de imagem",
        "Ampliar vocabulário funcional em 50 novas palavras",
        "Realizar atividades de vida diária com maior independência"
      ],
      "estrategias": [
        "Método fônico adaptado com suporte visual (figuras + palavras)",
        "Comunicação aumentativa e alternativa (CAA)",
        "Atividades de encaixe, recorte e colagem para motricidade fina",
        "Culinária pedagógica para matemática funcional",
        "Músicas e rimas para aquisição fonológica"
      ],
      "recursos_utilizados": [
        "Pranchas de CAA impressas e digitais",
        "Material dourado e blocos lógicos",
        "Livros de imagem e parlendas",
        "Tablets com aplicativos de comunicação (Boardmaker, LetMeTalk)"
      ],
      "profissional_responsavel": "Beatriz Santos Lima — Diretora/Professora AEE",
      "articulacao_sala_regular": "Reunião semanal com professora. Portfólio mensal compartilhado com a família."
    }'
  ),

  -- ── PEI: Maria Eduarda Lima ──────────────────────────────────────────────
  (
    '30000000-0000-0000-0000-000000000007',
    '10000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000030',
    'PEI',
    '30000000-0000-0000-0000-000000000006',
    'PEI — Maria Eduarda Lima — 2026',
    'DRAFT',
    '{
      "periodo_vigencia": {"inicio": "2026-02-01", "fim": "2026-12-20"},
      "metas_lingua_portuguesa": [
        {
          "meta": "Reconhecer e nomear todas as letras do alfabeto",
          "estrategia": "Jogo de memória com letras e figuras; músicas do alfabeto",
          "criterio_avaliacao": "Acerto em 80% das letras em 3 sessões consecutivas",
          "prazo": "Junho/2026"
        },
        {
          "meta": "Ler palavras monossílabas e dissílabas com apoio de imagem",
          "estrategia": "Caderno de palavras ilustrado; leitura pareada com colega",
          "criterio_avaliacao": "Leitura de 10 palavras do seu cotidiano de forma independente",
          "prazo": "Dezembro/2026"
        }
      ],
      "metas_matematica": [
        {
          "meta": "Contar objetos concretos até 20",
          "estrategia": "Material dourado, tampinhas coloridas, jogos de contagem",
          "criterio_avaliacao": "Contagem correta em 4 de 5 tentativas",
          "prazo": "Julho/2026"
        }
      ],
      "metas_autonomia": [
        {
          "meta": "Organizar a própria mochila com roteiro visual",
          "estrategia": "Checklist visual plastificado colado na mochila",
          "criterio_avaliacao": "Realiza com supervisão distante 4x na semana",
          "prazo": "Abril/2026"
        }
      ],
      "adaptacoes_curriculares": [
        "Atividades adaptadas com suporte visual e menos itens",
        "Avaliação por portfólio e observação sistemática",
        "Provas sem caráter classificatório; foco no processo",
        "Tempo estendido para todas as atividades",
        "Assento próximo à professora"
      ],
      "recursos_apoio": [
        "Prancha de CAA para comunicação em sala",
        "Apoio de estagiária de pedagogia 4h/dia",
        "Materiais concretos e manipuláveis em todas as aulas"
      ],
      "responsaveis": [
        "Beatriz Santos Lima — Professora / AEE",
        "Fernanda Lima — Responsável"
      ]
    }'
  )

ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- TAREFAS
-- =============================================================================

INSERT INTO public.tasks (
  id, tenant_id, created_by, assigned_to,
  student_id, document_id,
  title, description, priority, status, due_date
) VALUES
  (
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000020',
    '10000000-0000-0000-0000-000000000020',
    '20000000-0000-0000-0000-000000000001',
    NULL,
    'Elaborar PAEE de Lucas Ferreira Santos',
    'Lucas já possui Estudo de Caso aprovado. Iniciar elaboração do PAEE com base nas necessidades identificadas.',
    'HIGH', 'PENDING',
    NOW() + INTERVAL '7 days'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000020',
    '10000000-0000-0000-0000-000000000020',
    '20000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000003',
    'Reunião com família de Ana Carolina',
    'Apresentar o PAEE aprovado para o pai Roberto Oliveira e obter assinatura.',
    'MEDIUM', 'PENDING',
    NOW() + INTERVAL '5 days'
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000030',
    '10000000-0000-0000-0000-000000000030',
    '20000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000007',
    'Finalizar e aprovar PEI de Maria Eduarda Lima',
    'PEI em rascunho. Revisar metas com a fonoaudióloga antes de aprovar. Prazo máximo: fim do mês.',
    'URGENT', 'IN_PROGRESS',
    NOW() + INTERVAL '10 days'
  ),
  (
    '40000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000030',
    '10000000-0000-0000-0000-000000000030',
    '20000000-0000-0000-0000-000000000003',
    NULL,
    'Elaborar PAEE de Pedro Henrique Costa',
    'Estudo de Caso aprovado. Articular com fonoaudióloga para levantar estratégias antes de elaborar o PAEE.',
    'HIGH', 'PENDING',
    NOW() + INTERVAL '14 days'
  )
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- AUDIT LOGS de exemplo
-- =============================================================================

INSERT INTO public.audit_logs (
  tenant_id, user_id, entity_type, entity_id, action, metadata
) VALUES
  (
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000020',
    'student', '20000000-0000-0000-0000-000000000001',
    'created', '{"note":"Cadastro inicial do aluno"}'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000020',
    'document', '30000000-0000-0000-0000-000000000001',
    'created', '{"doc_type":"ESTUDO_CASO","title":"Estudo de Caso — Lucas Ferreira Santos"}'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000020',
    'document', '30000000-0000-0000-0000-000000000001',
    'approved', '{"doc_type":"ESTUDO_CASO","status_anterior":"REVIEW","status_novo":"APPROVED"}'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000030',
    'document', '30000000-0000-0000-0000-000000000007',
    'created', '{"doc_type":"PEI","title":"PEI — Maria Eduarda Lima — 2026"}'
  );

-- =============================================================================
-- Reativa o trigger de signup
-- =============================================================================

ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;

-- =============================================================================
-- FIM DO ARQUIVO
-- =============================================================================
-- TABELAS (13):
--   plans | tenants | users | subscriptions | credits_wallet | credits_ledger
--   students
--   documents | document_versions | professional_signatures | document_signatures
--   tasks
--   audit_logs
--
-- LOGINS:
--   CEO (Super Admin)  → ceo@incluiai.com.br           / IncluiAI@CEO2026
--   Plano PRO          → professora@monteiro.edu.br     / Pro@Incluiai2026
--   Plano MASTER       → diretora@santosdumont.edu.br   / Master@Incluiai2026
-- =============================================================================
