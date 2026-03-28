-- ============================================================
-- Schema v10 — Correção de Persistência
-- Garante tabelas e RLS corretos para:
--   schools, student_documents, medical_reports,
--   student_profiles, student_timeline, observation_forms
--
-- Executar no Supabase SQL Editor (idempotente — IF NOT EXISTS / IF NOT EXISTS)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- HELPER: função my_tenant_id() (caso ainda não exista)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.my_tenant_id() TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 1. SCHOOLS — tabela relacional de escolas por tenant
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schools (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,
  inep_code           TEXT,
  cnpj                TEXT,
  phone               TEXT,
  email               TEXT,
  instagram           TEXT,
  logo_url            TEXT,
  -- endereço como colunas separadas (mais consultável que JSONB)
  address             TEXT,
  neighborhood        TEXT,
  city                TEXT,
  state               TEXT,
  zipcode             TEXT,
  principal_name      TEXT,
  manager_name        TEXT,
  coordinator_name    TEXT,
  aee_representative  TEXT,
  aee_rep_name        TEXT,
  active              BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schools_tenant   ON public.schools(tenant_id);
CREATE INDEX IF NOT EXISTS idx_schools_inep     ON public.schools(inep_code) WHERE inep_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schools_active   ON public.schools(tenant_id, active);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.schools_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trig_schools_updated_at ON public.schools;
CREATE TRIGGER trig_schools_updated_at
  BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.schools_set_updated_at();

-- RLS
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schools_select"  ON public.schools;
DROP POLICY IF EXISTS "schools_insert"  ON public.schools;
DROP POLICY IF EXISTS "schools_update"  ON public.schools;
DROP POLICY IF EXISTS "schools_delete"  ON public.schools;

CREATE POLICY "schools_select" ON public.schools
  FOR SELECT USING (tenant_id = public.my_tenant_id());

CREATE POLICY "schools_insert" ON public.schools
  FOR INSERT WITH CHECK (tenant_id = public.my_tenant_id());

CREATE POLICY "schools_update" ON public.schools
  FOR UPDATE USING (tenant_id = public.my_tenant_id());

CREATE POLICY "schools_delete" ON public.schools
  FOR DELETE USING (tenant_id = public.my_tenant_id());

GRANT ALL ON TABLE public.schools TO anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 2. STUDENT_DOCUMENTS — laudos, relatórios e anexos
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_documents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id    UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  document_type TEXT        NOT NULL DEFAULT 'Laudo',
  file_url      TEXT,
  file_path     TEXT,
  file_size     BIGINT,
  mime_type     TEXT,
  uploaded_by   TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_docs_student  ON public.student_documents(student_id);
CREATE INDEX IF NOT EXISTS idx_student_docs_tenant   ON public.student_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_student_docs_type     ON public.student_documents(document_type);

ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_docs_select" ON public.student_documents;
DROP POLICY IF EXISTS "student_docs_insert" ON public.student_documents;
DROP POLICY IF EXISTS "student_docs_update" ON public.student_documents;
DROP POLICY IF EXISTS "student_docs_delete" ON public.student_documents;

CREATE POLICY "student_docs_select" ON public.student_documents
  FOR SELECT USING (tenant_id = public.my_tenant_id());

CREATE POLICY "student_docs_insert" ON public.student_documents
  FOR INSERT WITH CHECK (tenant_id = public.my_tenant_id());

CREATE POLICY "student_docs_update" ON public.student_documents
  FOR UPDATE USING (tenant_id = public.my_tenant_id());

CREATE POLICY "student_docs_delete" ON public.student_documents
  FOR DELETE USING (tenant_id = public.my_tenant_id());

GRANT ALL ON TABLE public.student_documents TO anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 3. MEDICAL_REPORTS — análise de laudos pela IA
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.medical_reports (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id           UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  document_id          UUID        REFERENCES public.student_documents(id) ON DELETE SET NULL,
  report_type          TEXT        NOT NULL DEFAULT 'multidisciplinar',
  synthesis            TEXT,
  pedagogical_points   TEXT[]      DEFAULT '{}',
  suggestions          TEXT[]      DEFAULT '{}',
  raw_content          TEXT,
  analyzed_by_ai       BOOLEAN     NOT NULL DEFAULT TRUE,
  audit_code           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medical_reports_student  ON public.medical_reports(student_id);
CREATE INDEX IF NOT EXISTS idx_medical_reports_tenant   ON public.medical_reports(tenant_id);

ALTER TABLE public.medical_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "medical_reports_select" ON public.medical_reports;
DROP POLICY IF EXISTS "medical_reports_insert" ON public.medical_reports;
DROP POLICY IF EXISTS "medical_reports_delete" ON public.medical_reports;

CREATE POLICY "medical_reports_select" ON public.medical_reports
  FOR SELECT USING (tenant_id = public.my_tenant_id());

CREATE POLICY "medical_reports_insert" ON public.medical_reports
  FOR INSERT WITH CHECK (tenant_id = public.my_tenant_id());

CREATE POLICY "medical_reports_delete" ON public.medical_reports
  FOR DELETE USING (tenant_id = public.my_tenant_id());

GRANT ALL ON TABLE public.medical_reports TO anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 4. STUDENT_PROFILES — perfis cognitivos (fichas evolutivas)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_profiles (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id              UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  -- 10 dimensões do perfil cognitivo (escala 1-5)
  comunicacao_expressiva  SMALLINT    CHECK (comunicacao_expressiva  BETWEEN 1 AND 5),
  interacao_social        SMALLINT    CHECK (interacao_social        BETWEEN 1 AND 5),
  autonomia_avd           SMALLINT    CHECK (autonomia_avd           BETWEEN 1 AND 5),
  autorregulacao          SMALLINT    CHECK (autorregulacao          BETWEEN 1 AND 5),
  atencao_sustentada      SMALLINT    CHECK (atencao_sustentada      BETWEEN 1 AND 5),
  compreensao             SMALLINT    CHECK (compreensao             BETWEEN 1 AND 5),
  motricidade_fina        SMALLINT    CHECK (motricidade_fina        BETWEEN 1 AND 5),
  motricidade_grossa      SMALLINT    CHECK (motricidade_grossa      BETWEEN 1 AND 5),
  participacao            SMALLINT    CHECK (participacao            BETWEEN 1 AND 5),
  linguagem_leitura       SMALLINT    CHECK (linguagem_leitura       BETWEEN 1 AND 5),
  observation             TEXT,
  evaluated_by            TEXT,
  evaluated_at            DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_profiles_student  ON public.student_profiles(student_id);
CREATE INDEX IF NOT EXISTS idx_student_profiles_tenant   ON public.student_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_student_profiles_date     ON public.student_profiles(student_id, evaluated_at DESC);

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_profiles_select" ON public.student_profiles;
DROP POLICY IF EXISTS "student_profiles_insert" ON public.student_profiles;
DROP POLICY IF EXISTS "student_profiles_delete" ON public.student_profiles;

CREATE POLICY "student_profiles_select" ON public.student_profiles
  FOR SELECT USING (tenant_id = public.my_tenant_id());

CREATE POLICY "student_profiles_insert" ON public.student_profiles
  FOR INSERT WITH CHECK (tenant_id = public.my_tenant_id());

CREATE POLICY "student_profiles_delete" ON public.student_profiles
  FOR DELETE USING (tenant_id = public.my_tenant_id());

GRANT ALL ON TABLE public.student_profiles TO anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 5. STUDENT_TIMELINE — linha do tempo unificada do aluno
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_timeline (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id   UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  event_type   TEXT        NOT NULL,   -- 'atendimento' | 'laudo' | 'ficha' | 'evolucao' | 'documento' | 'matricula'
  title        TEXT        NOT NULL,
  description  TEXT,
  linked_id    UUID,
  linked_table TEXT,
  icon         TEXT,
  author       TEXT,
  event_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline_student  ON public.student_timeline(student_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_tenant   ON public.student_timeline(tenant_id);
CREATE INDEX IF NOT EXISTS idx_timeline_type     ON public.student_timeline(event_type);

ALTER TABLE public.student_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "timeline_select" ON public.student_timeline;
DROP POLICY IF EXISTS "timeline_insert" ON public.student_timeline;
DROP POLICY IF EXISTS "timeline_delete" ON public.student_timeline;

CREATE POLICY "timeline_select" ON public.student_timeline
  FOR SELECT USING (tenant_id = public.my_tenant_id());

CREATE POLICY "timeline_insert" ON public.student_timeline
  FOR INSERT WITH CHECK (tenant_id = public.my_tenant_id());

CREATE POLICY "timeline_delete" ON public.student_timeline
  FOR DELETE USING (tenant_id = public.my_tenant_id());

GRANT ALL ON TABLE public.student_timeline TO anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 6. OBSERVATION_FORMS — fichas cognitivas/observação
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.observation_forms (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id  UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  form_type   TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'finalizado' CHECK (status IN ('rascunho','finalizado')),
  fields_data JSONB       NOT NULL DEFAULT '{}',
  audit_code  TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_forms_student  ON public.observation_forms(student_id);
CREATE INDEX IF NOT EXISTS idx_obs_forms_tenant   ON public.observation_forms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_obs_forms_type     ON public.observation_forms(form_type);

ALTER TABLE public.observation_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "obs_forms_select" ON public.observation_forms;
DROP POLICY IF EXISTS "obs_forms_insert" ON public.observation_forms;
DROP POLICY IF EXISTS "obs_forms_update" ON public.observation_forms;
DROP POLICY IF EXISTS "obs_forms_delete" ON public.observation_forms;

CREATE POLICY "obs_forms_select" ON public.observation_forms
  FOR SELECT USING (tenant_id = public.my_tenant_id());

CREATE POLICY "obs_forms_insert" ON public.observation_forms
  FOR INSERT WITH CHECK (tenant_id = public.my_tenant_id());

CREATE POLICY "obs_forms_update" ON public.observation_forms
  FOR UPDATE USING (tenant_id = public.my_tenant_id());

CREATE POLICY "obs_forms_delete" ON public.observation_forms
  FOR DELETE USING (tenant_id = public.my_tenant_id());

GRANT ALL ON TABLE public.observation_forms TO anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 7. Coluna school_id em students (referência à tabela schools)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_students_school_id ON public.students(school_id) WHERE school_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 8. STORAGE: buckets necessários
-- Os buckets devem ser criados manualmente no painel Supabase:
--   Storage > New bucket:
--     - Nome: laudos          | Public: SIM
--     - Nome: documentos_pdf  | Public: SIM
--     - Nome: imagens_atividades | Public: SIM
--   Políticas de storage (laudos):
--     INSERT: bucket_id = 'laudos' AND auth.role() = 'authenticated'
--     SELECT: bucket_id = 'laudos' AND auth.role() = 'authenticated'
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- 9. Verificação final (opcional — descomentar para debug)
-- ────────────────────────────────────────────────────────────
-- SELECT table_name, row_security FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('schools','student_documents','medical_reports',
--                    'student_profiles','student_timeline','observation_forms');
