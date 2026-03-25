-- =============================================================================
-- INCLUIAI — SCHEMA LAUNCH v1.0
-- Data: 2026-03-14
-- Módulos: Foundation, Alunos, Documentos (Estudo de Caso/PAEE/PEI/PDI), Tarefas, Auditoria
--
-- INSTRUÇÕES DE USO:
--   1. Acesse Supabase → SQL Editor
--   2. Se banco tiver lixo de versões anteriores: rode DROP SCHEMA public CASCADE;
--      CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
--   3. Cole e rode este arquivo completo
--   4. Verifique em Table Editor que todas as tabelas aparecem
-- =============================================================================

-- Extensions (Supabase já instala a maioria, mas garantimos)
CREATE EXTENSION IF NOT EXISTS "pgcrypto"   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"  WITH SCHEMA extensions;

-- =============================================================================
-- FUNÇÕES UTILITÁRIAS
-- =============================================================================

-- Gera código de auditoria: 8 chars alfanumérico maiúsculo sem ambíguos
CREATE OR REPLACE FUNCTION public.generate_audit_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Retorna tenant_id do usuário autenticado (SECURITY DEFINER bypassa RLS)
CREATE OR REPLACE FUNCTION public.my_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

-- Trigger genérico de updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- M01: FOUNDATION — plans, tenants, users, subscriptions, credits
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.plans (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL UNIQUE,  -- FREE | PRO | MASTER | INSTITUTIONAL
  max_students   INT         NOT NULL DEFAULT 5,
  ai_credits_per_month INT  NOT NULL DEFAULT 0,
  price_brl      NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Planos padrão
INSERT INTO public.plans (name, max_students, ai_credits_per_month, price_brl) VALUES
  ('FREE',          5,    0,    0),
  ('PRO',           30,   50,   79.90),
  ('MASTER',        999,  70,   149.90),
  ('INSTITUTIONAL', 9999, 9999, 499.90)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.tenants (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  document       TEXT,                    -- CNPJ ou CPF
  plan_id        UUID        REFERENCES public.plans(id),
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.users (
  id             UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id      UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name      TEXT        NOT NULL,
  email          TEXT        NOT NULL,
  role           TEXT        NOT NULL DEFAULT 'TEACHER'
                              CHECK (role IN ('TEACHER','AEE','COORDINATOR','MANAGER','ADMIN')),
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id              UUID        NOT NULL REFERENCES public.plans(id),
  status               TEXT        NOT NULL DEFAULT 'ACTIVE'
                                    CHECK (status IN ('ACTIVE','TRIALING','PAST_DUE','CANCELLED')),
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  provider             TEXT        DEFAULT 'manual',  -- 'asaas' | 'manual'
  provider_sub_id      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.credits_wallet (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  balance        INT         NOT NULL DEFAULT 0 CHECK (balance >= 0),
  last_reset_at  TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.credits_ledger (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id        UUID        REFERENCES public.users(id),
  type           TEXT        NOT NULL
                              CHECK (type IN ('monthly_grant','usage_ai','manual_grant','refund')),
  amount         INT         NOT NULL,  -- positivo = crédito, negativo = débito
  description    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- M02: ALUNOS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.students (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by             UUID        NOT NULL REFERENCES public.users(id),

  -- Dados pessoais
  full_name              TEXT        NOT NULL,
  birth_date             DATE,
  gender                 TEXT        CHECK (gender IN ('M','F','OTHER')),
  cpf                    TEXT,

  -- Dados escolares
  school_name            TEXT,
  school_year            TEXT,
  class_name             TEXT,
  teacher_name           TEXT,

  -- Diagnóstico
  primary_diagnosis      TEXT,
  secondary_diagnoses    TEXT[]      DEFAULT '{}',
  cid_codes              TEXT[]      DEFAULT '{}',

  -- Necessidades e observações
  learning_needs         TEXT,
  behavioral_notes       TEXT,
  medical_notes          TEXT,

  -- Contato responsável
  guardian_name          TEXT,
  guardian_phone         TEXT,
  guardian_email         TEXT,
  guardian_relationship  TEXT,

  -- Controle
  is_active              BOOLEAN     NOT NULL DEFAULT TRUE,
  deleted_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- M03: DOCUMENTOS PEDAGÓGICOS
-- Regra obrigatória: PAEE e PEI só existem após Estudo de Caso
-- Encadeamento: ESTUDO_CASO → PAEE → PEI → PDI (via source_id)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.documents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id       UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_by       UUID        NOT NULL REFERENCES public.users(id),

  -- Tipo e encadeamento pedagógico
  doc_type         TEXT        NOT NULL
                                CHECK (doc_type IN ('ESTUDO_CASO','PAEE','PEI','PDI')),
  source_id        UUID        REFERENCES public.documents(id),  -- doc pai na cadeia

  -- Conteúdo
  title            TEXT        NOT NULL,
  structured_data  JSONB       NOT NULL DEFAULT '{}',

  -- Estado do documento
  status           TEXT        NOT NULL DEFAULT 'DRAFT'
                                CHECK (status IN ('DRAFT','REVIEW','APPROVED','SIGNED')),

  -- Segurança jurídica
  audit_code       TEXT        UNIQUE DEFAULT public.generate_audit_code(),
  content_hash     TEXT,

  -- Controle
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Versões imutáveis de documentos (histórico completo)
CREATE TABLE IF NOT EXISTS public.document_versions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      UUID        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_number   INT         NOT NULL,
  structured_data  JSONB       NOT NULL DEFAULT '{}',
  content_hash     TEXT,
  changed_by       UUID        NOT NULL REFERENCES public.users(id),
  change_note      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version_number)
);

-- Assinatura profissional reutilizável (base64)
CREATE TABLE IF NOT EXISTS public.professional_signatures (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  signature_data   TEXT        NOT NULL,  -- base64
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Assinaturas aplicadas a documentos específicos
CREATE TABLE IF NOT EXISTS public.document_signatures (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      UUID        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  signed_by        UUID        NOT NULL REFERENCES public.users(id),
  signer_role      TEXT,
  signature_data   TEXT,       -- base64 (snapshot no momento da assinatura)
  signed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- M04: TAREFAS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tasks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by      UUID        NOT NULL REFERENCES public.users(id),
  assigned_to     UUID        REFERENCES public.users(id),
  student_id      UUID        REFERENCES public.students(id),
  document_id     UUID        REFERENCES public.documents(id),

  title           TEXT        NOT NULL,
  description     TEXT,
  priority        TEXT        NOT NULL DEFAULT 'MEDIUM'
                               CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  status          TEXT        NOT NULL DEFAULT 'PENDING'
                               CHECK (status IN ('PENDING','IN_PROGRESS','DONE','CANCELLED')),
  due_date        TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- M05: AUDITORIA (imutável — sem DELETE policy)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES public.tenants(id),
  user_id        UUID        REFERENCES public.users(id),
  entity_type    TEXT        NOT NULL,  -- 'student' | 'document' | 'task' | 'user'
  entity_id      UUID,
  action         TEXT        NOT NULL,  -- 'created' | 'updated' | 'deleted' | 'signed' | 'exported'
  content_hash   TEXT,
  audit_code     TEXT        UNIQUE DEFAULT public.generate_audit_code(),
  metadata       JSONB       DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TRIGGERS updated_at
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants', 'users', 'subscriptions', 'credits_wallet',
    'students', 'documents', 'tasks', 'professional_signatures'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at
       BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t
    );
  END LOOP;
END $$;

-- =============================================================================
-- TRIGGER: Cria tenant + user automaticamente no signup do Supabase Auth
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id     UUID;
  v_free_plan_id  UUID;
BEGIN
  -- Busca plano FREE
  SELECT id INTO v_free_plan_id FROM public.plans WHERE name = 'FREE' LIMIT 1;

  -- Cria tenant para o novo usuário
  INSERT INTO public.tenants (name, plan_id)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'organization_name', 'Minha Escola'),
    v_free_plan_id
  )
  RETURNING id INTO v_tenant_id;

  -- Cria subscription ativa no plano FREE
  INSERT INTO public.subscriptions (tenant_id, plan_id, status)
  VALUES (v_tenant_id, v_free_plan_id, 'ACTIVE');

  -- Cria carteira de créditos zerada
  INSERT INTO public.credits_wallet (tenant_id, balance)
  VALUES (v_tenant_id, 0);

  -- Cria perfil do usuário
  INSERT INTO public.users (id, tenant_id, full_name, email, role)
  VALUES (
    NEW.id,
    v_tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
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
-- ÍNDICES de performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_tenant_id       ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_students_tenant_id    ON public.students(tenant_id);
CREATE INDEX IF NOT EXISTS idx_students_active       ON public.students(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_student_id  ON public.documents(student_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_type ON public.documents(tenant_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_source_id   ON public.documents(source_id);
CREATE INDEX IF NOT EXISTS idx_documents_active      ON public.documents(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id       ON public.tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to     ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_student_id      ON public.tasks(student_id);
CREATE INDEX IF NOT EXISTS idx_credits_ledger_tenant ON public.credits_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity     ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant     ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doc_versions_doc_id   ON public.document_versions(document_id);

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

-- Remover políticas antigas se existirem (idempotente)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- PLANS: leitura pública (qualquer um pode ver os planos disponíveis)
CREATE POLICY "plans_select_all"
  ON public.plans FOR SELECT USING (true);

-- TENANTS: apenas o próprio tenant
CREATE POLICY "tenants_own"
  ON public.tenants FOR ALL
  USING (id = public.my_tenant_id())
  WITH CHECK (id = public.my_tenant_id());

-- USERS: apenas usuários do mesmo tenant
CREATE POLICY "users_own_tenant"
  ON public.users FOR ALL
  USING (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- SUBSCRIPTIONS
CREATE POLICY "subscriptions_own"
  ON public.subscriptions FOR ALL
  USING (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- CREDITS WALLET
CREATE POLICY "credits_wallet_own"
  ON public.credits_wallet FOR ALL
  USING (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- CREDITS LEDGER
CREATE POLICY "credits_ledger_own"
  ON public.credits_ledger FOR ALL
  USING (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- STUDENTS
CREATE POLICY "students_own"
  ON public.students FOR ALL
  USING (tenant_id = public.my_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = public.my_tenant_id());

-- DOCUMENTS
CREATE POLICY "documents_own"
  ON public.documents FOR ALL
  USING (tenant_id = public.my_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = public.my_tenant_id());

-- DOCUMENT VERSIONS (read/insert via documento do tenant)
CREATE POLICY "doc_versions_own"
  ON public.document_versions FOR ALL
  USING (
    document_id IN (
      SELECT id FROM public.documents WHERE tenant_id = public.my_tenant_id()
    )
  )
  WITH CHECK (
    document_id IN (
      SELECT id FROM public.documents WHERE tenant_id = public.my_tenant_id()
    )
  );

-- PROFESSIONAL SIGNATURES: apenas o próprio profissional
CREATE POLICY "prof_signatures_own"
  ON public.professional_signatures FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DOCUMENT SIGNATURES: documentos do tenant
CREATE POLICY "doc_signatures_own"
  ON public.document_signatures FOR ALL
  USING (
    document_id IN (
      SELECT id FROM public.documents WHERE tenant_id = public.my_tenant_id()
    )
  )
  WITH CHECK (
    document_id IN (
      SELECT id FROM public.documents WHERE tenant_id = public.my_tenant_id()
    )
  );

-- TASKS
CREATE POLICY "tasks_own"
  ON public.tasks FOR ALL
  USING (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- AUDIT LOGS: insert + select (sem delete — imutável por design)
CREATE POLICY "audit_logs_select"
  ON public.audit_logs FOR SELECT
  USING (tenant_id = public.my_tenant_id());

CREATE POLICY "audit_logs_insert"
  ON public.audit_logs FOR INSERT
  WITH CHECK (tenant_id = public.my_tenant_id());

-- =============================================================================
-- SERVICE ROLE: bypass RLS para funções do backend/webhook
-- =============================================================================
-- (service_role já tem BYPASSRLS por padrão no Supabase — não é necessário configurar)

-- =============================================================================
-- GRANTS
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON public.plans TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_audit_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;

-- =============================================================================
-- FIM DO SCHEMA
-- Tabelas criadas (13 total):
--   plans, tenants, users, subscriptions, credits_wallet, credits_ledger
--   students
--   documents, document_versions, professional_signatures, document_signatures
--   tasks
--   audit_logs
-- =============================================================================
