-- =============================================================================
-- INCLUIAI — Schema Core v1
-- Tabelas: schools, professionals, students, documents (case_studies/paee/pei/pdi), document_versions
-- Execução: rodar no Supabase SQL Editor (substituição dos schemas anteriores)
-- =============================================================================

-- Habilita extensão UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. TENANTS (organizações / profissionais autônomos)
-- =============================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'PROFESSIONAL'
                  CHECK (type IN ('PROFESSIONAL', 'CLINIC', 'SCHOOL')),
  plan_code     TEXT NOT NULL DEFAULT 'FREE'
                  CHECK (plan_code IN ('FREE', 'PRO', 'MASTER', 'INSTITUTIONAL')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 2. SCHOOLS (escolas vinculadas a um tenant)
-- =============================================================================
CREATE TABLE IF NOT EXISTS schools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  manager_name    TEXT,
  coordinator_name TEXT,
  aee_representative TEXT,
  contact         TEXT,
  address         TEXT,
  city            TEXT,
  state           CHAR(2),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 3. PROFESSIONALS (usuários do sistema — profissionais de educação)
-- =============================================================================
CREATE TABLE IF NOT EXISTS professionals (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id     UUID REFERENCES schools(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL DEFAULT 'TEACHER'
                  CHECK (role IN ('TEACHER', 'AEE', 'COORDINATOR', 'MANAGER', 'ADMIN')),
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  lgpd_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  lgpd_accepted_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 4. STUDENTS (alunos)
-- =============================================================================
CREATE TABLE IF NOT EXISTS students (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID REFERENCES schools(id) ON DELETE SET NULL,
  professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL,

  -- Identificação
  name            TEXT NOT NULL,
  birth_date      DATE,
  gender          TEXT,
  student_code    TEXT,            -- matrícula

  -- Tipo de acompanhamento
  tipo_aluno      TEXT NOT NULL DEFAULT 'em_triagem'
                    CHECK (tipo_aluno IN ('em_triagem', 'com_laudo')),

  -- Dados pedagógicos
  grade           TEXT,            -- ano/série
  classroom       TEXT,            -- turma
  diagnosis       TEXT,            -- diagnóstico principal
  secondary_diagnosis TEXT,
  cid_code        TEXT,            -- CID-10
  needs           TEXT[],          -- necessidades educacionais
  strengths       TEXT,
  challenges      TEXT,

  -- Contato responsável
  guardian_name   TEXT,
  guardian_phone  TEXT,
  guardian_email  TEXT,

  -- Metadados
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 5. DOCUMENTS (estudo_de_caso / paee / pei / pdi — tabela unificada)
-- =============================================================================
CREATE TABLE IF NOT EXISTS documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL,

  -- Tipo de documento
  doc_type        TEXT NOT NULL
                    CHECK (doc_type IN ('ESTUDO_CASO', 'PAEE', 'PEI', 'PDI')),

  -- Referência ao documento anterior (cadeia Estudo → PAEE → PEI → PDI)
  source_id       UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Conteúdo estruturado (JSON flexível por tipo)
  structured_data JSONB NOT NULL DEFAULT '{}',

  -- Status
  status          TEXT NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT', 'FINAL', 'ARCHIVED')),

  -- Metadados de autoria
  generated_by    TEXT,
  last_edited_by  TEXT,
  audit_code      TEXT UNIQUE,     -- código público de validação

  -- Assinaturas
  signatures      JSONB NOT NULL DEFAULT '{}',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 6. DOCUMENT_VERSIONS (histórico de versões por documento)
-- =============================================================================
CREATE TABLE IF NOT EXISTS document_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL DEFAULT 1,
  content         JSONB NOT NULL DEFAULT '{}',
  change_log      TEXT,
  edited_by       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 7. PLANS (configuração de planos SaaS)
-- =============================================================================
CREATE TABLE IF NOT EXISTS plans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL UNIQUE,  -- FREE, PRO, MASTER, INSTITUTIONAL
  display_name     TEXT,
  max_students     INTEGER NOT NULL DEFAULT 5,
  monthly_credits  INTEGER NOT NULL DEFAULT 0,
  price_brl        NUMERIC(10,2) NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  features         JSONB NOT NULL DEFAULT '{}'
);

-- Seed de planos padrão
INSERT INTO plans (name, display_name, max_students, monthly_credits, price_brl, features)
VALUES
  ('FREE',          'Gratuito',     5,    0,    0.00,   '{"charts": false, "ai_gen": false}'),
  ('PRO',           'Profissional', 30,   50,   97.00,  '{"charts": true,  "ai_gen": true}'),
  ('MASTER',        'Master',       999,  70,   197.00, '{"charts": true,  "ai_gen": true,  "advanced": true}'),
  ('INSTITUTIONAL', 'Institucional',9999, 9999, 497.00, '{"charts": true,  "ai_gen": true,  "advanced": true, "multi_user": true}')
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- 8. SUBSCRIPTIONS (assinaturas dos tenants)
-- =============================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_code       TEXT NOT NULL DEFAULT 'FREE',
  status          TEXT NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING', 'COURTESY', 'INTERNAL_TEST')),
  provider        TEXT,            -- asaas, kiwify, manual
  provider_id     TEXT,            -- ID do assinante no provider
  provider_payment_link TEXT,
  next_billing    TIMESTAMPTZ,
  last_payment_status TEXT,
  is_test_account BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 9. CREDITS_WALLET (créditos de IA por tenant)
-- =============================================================================
CREATE TABLE IF NOT EXISTS credits_wallet (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  balance         INTEGER NOT NULL DEFAULT 0,
  used_this_month INTEGER NOT NULL DEFAULT 0,
  last_reset_at   TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 10. INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_students_tenant    ON students(tenant_id);
CREATE INDEX IF NOT EXISTS idx_students_school    ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant   ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_student  ON documents(student_id);
CREATE INDEX IF NOT EXISTS idx_documents_type     ON documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_doc_versions_doc   ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_professionals_tenant ON professionals(tenant_id);

-- =============================================================================
-- 11. ROW-LEVEL SECURITY
-- =============================================================================
ALTER TABLE tenants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools          ENABLE ROW LEVEL SECURITY;
ALTER TABLE professionals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE students         ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits_wallet   ENABLE ROW LEVEL SECURITY;

-- Helper: tenant_id do usuário logado
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT tenant_id FROM professionals WHERE id = auth.uid() LIMIT 1;
$$;

-- Helper: é admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT is_admin FROM professionals WHERE id = auth.uid() LIMIT 1), FALSE);
$$;

-- TENANTS
CREATE POLICY "tenant_read"   ON tenants FOR SELECT USING (id = current_tenant_id() OR is_admin());
CREATE POLICY "tenant_update" ON tenants FOR UPDATE USING (id = current_tenant_id() OR is_admin());

-- SCHOOLS (tenant-scoped)
CREATE POLICY "schools_all"   ON schools FOR ALL USING (tenant_id = current_tenant_id() OR is_admin());

-- PROFESSIONALS (self + same tenant)
CREATE POLICY "prof_read"     ON professionals FOR SELECT USING (tenant_id = current_tenant_id() OR is_admin());
CREATE POLICY "prof_self_upd" ON professionals FOR UPDATE USING (id = auth.uid() OR is_admin());
CREATE POLICY "prof_insert"   ON professionals FOR INSERT WITH CHECK (is_admin());

-- STUDENTS (tenant-scoped)
CREATE POLICY "students_all"  ON students FOR ALL USING (tenant_id = current_tenant_id() OR is_admin());

-- DOCUMENTS (tenant-scoped)
CREATE POLICY "docs_all"      ON documents FOR ALL USING (tenant_id = current_tenant_id() OR is_admin());

-- DOCUMENT_VERSIONS (via documento)
CREATE POLICY "versions_all"  ON document_versions FOR ALL
  USING (
    document_id IN (SELECT id FROM documents WHERE tenant_id = current_tenant_id())
    OR is_admin()
  );

-- SUBSCRIPTIONS (tenant-scoped)
CREATE POLICY "sub_read"      ON subscriptions FOR SELECT USING (tenant_id = current_tenant_id() OR is_admin());
CREATE POLICY "sub_admin"     ON subscriptions FOR ALL USING (is_admin());

-- CREDITS (tenant-scoped)
CREATE POLICY "credits_all"   ON credits_wallet FOR ALL USING (tenant_id = current_tenant_id() OR is_admin());

-- =============================================================================
-- 12. TRIGGER: signup automático cria tenant + professional
-- =============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_tenant_id UUID;
BEGIN
  -- Cria tenant para o novo usuário
  INSERT INTO tenants (name, type, plan_code)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'organization', split_part(NEW.email, '@', 1)),
    'PROFESSIONAL',
    'FREE'
  )
  RETURNING id INTO new_tenant_id;

  -- Cria perfil de professional
  INSERT INTO professionals (id, tenant_id, name, email, role)
  VALUES (
    NEW.id,
    new_tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'TEACHER'
  );

  -- Cria carteira de créditos
  INSERT INTO credits_wallet (tenant_id, balance)
  VALUES (new_tenant_id, 0);

  -- Cria assinatura FREE
  INSERT INTO subscriptions (tenant_id, plan_code, status)
  VALUES (new_tenant_id, 'FREE', 'ACTIVE');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================================
-- 13. TRIGGER: updated_at automático
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tenants_updated_at       BEFORE UPDATE ON tenants          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_schools_updated_at       BEFORE UPDATE ON schools           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_professionals_updated_at BEFORE UPDATE ON professionals      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_students_updated_at      BEFORE UPDATE ON students           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_documents_updated_at     BEFORE UPDATE ON documents          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_credits_updated_at       BEFORE UPDATE ON credits_wallet     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
