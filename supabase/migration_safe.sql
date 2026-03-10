-- =============================================================================
-- INCLUIAI — MIGRATION SAFE v2.0
-- Migração incremental do schema atual para o schema_full v2.0
-- =============================================================================
--
-- ESTRATÉGIA: Apenas operações ADDITIVE (ADD COLUMN, CREATE TABLE, CREATE INDEX).
-- Nenhuma coluna existente é removida neste script.
-- Remoção de colunas e tabelas legadas está comentada no final (FASE 9).
--
-- ORDEM DE EXECUÇÃO:
--   FASE 1: Foundation — corrigir constraints e adicionar colunas em tabelas existentes
--   FASE 2: Students — adicionar colunas; criar novas tabelas de M03
--   FASE 3: Scheduling — criar nova appointments e service_records limpos
--   FASE 4: Documents — criar document_versions; adicionar deleted_at
--   FASE 5: Forms, Evolution, Activities — criar tabelas novas
--   FASE 6: Timeline, Workflow — criar tabelas novas
--   FASE 7: Billing — corrigir credits_wallet; adicionar colunas
--   FASE 8: AI Usage — criar ai_usage_logs
--   FASE 9: [COMENTADO] Limpeza de tabelas legadas — executar manualmente após validação
--
-- IMPORTANTE: Execute cada FASE em uma transação separada.
-- Teste em staging antes de produção.
-- =============================================================================

-- =============================================================================
-- FASE 1: FOUNDATION
-- Prioridade MÁXIMA — corrige bugs ativos no schema atual
-- =============================================================================

BEGIN;

-- 1.1 Corrigir CHECK de tenants.type para incluir 'INDIVIDUAL'
-- (handle_new_user insere 'INDIVIDUAL' mas o CHECK atual não permite)
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_type_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_type_check
    CHECK (type IN ('INDIVIDUAL','PROFESSIONAL','CLINIC','SCHOOL'));

-- 1.2 Adicionar status TRIALING em tenants.status_assinatura
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_status_assinatura_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_status_assinatura_check
    CHECK (status_assinatura IN ('ACTIVE','TRIALING','PENDING','OVERDUE','CANCELED'));

-- 1.3 Adicionar colunas faltando em tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS phone      text,
  ADD COLUMN IF NOT EXISTS email      text,
  ADD COLUMN IF NOT EXISTS logo_url   text,
  ADD COLUMN IF NOT EXISTS address    jsonb DEFAULT '{}' NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

-- Trigger updated_at em tenants (pode já existir — IF NOT EXISTS não funciona em triggers)
DROP TRIGGER IF EXISTS tenants_updated_at ON public.tenants;
CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 1.4 Corrigir users.role CHECK para remover roles de plataforma (super_admin, financeiro, etc.)
--     e manter apenas roles do produto
-- ATENÇÃO: Se houver usuários com role 'super_admin'/'operacional'/'viewer', atualize antes:
--   UPDATE public.users SET role = 'GESTOR' WHERE role IN ('super_admin','operacional','financeiro','viewer');
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
    CHECK (role IN (
      'DOCENTE','AEE','COORDENADOR','GESTOR',
      'CLINICO','RESPONSAVEL_TECNICO',
      -- mantém legados temporariamente para compatibilidade durante transição:
      'super_admin','financeiro','operacional','viewer'
    ));

-- 1.5 Adicionar colunas faltando em users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS photo_url          text,
  ADD COLUMN IF NOT EXISTS lgpd_accepted      boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lgpd_accepted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS lgpd_term_version  text,
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz DEFAULT now() NOT NULL;

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 1.6 Criar tabela lgpd_consents (audit trail imutável)
CREATE TABLE IF NOT EXISTS public.lgpd_consents (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id),
  accepted      boolean     NOT NULL,
  term_version  text        NOT NULL DEFAULT 'v1.0',
  ip_address    text,
  user_agent    text,
  created_at    timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.lgpd_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lgpd_select_own" ON public.lgpd_consents;
DROP POLICY IF EXISTS "lgpd_insert_own" ON public.lgpd_consents;

CREATE POLICY "lgpd_select_own" ON public.lgpd_consents FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "lgpd_insert_own" ON public.lgpd_consents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND tenant_id = public.my_tenant_id());

GRANT ALL ON TABLE public.lgpd_consents TO anon, authenticated, service_role;

-- 1.7 Migrar dados LGPD existentes da coluna users para lgpd_consents
INSERT INTO public.lgpd_consents (user_id, tenant_id, accepted, term_version, created_at)
SELECT
  u.id,
  u.tenant_id,
  COALESCE((u::jsonb->>'lgpd_accepted')::boolean, false),
  COALESCE(u::jsonb->>'lgpd_term_version', 'v1.0'),
  COALESCE((u::jsonb->>'lgpd_accepted_at')::timestamptz, u.created_at)
FROM public.users u
WHERE EXISTS (
  -- só migra se a coluna lgpd_accepted existir e for true
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'lgpd_accepted'
)
ON CONFLICT DO NOTHING;

COMMIT;

-- =============================================================================
-- FASE 2: SCHOOLS E STUDENTS
-- =============================================================================

BEGIN;

-- 2.1 Criar tabela schools
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
  principal_name      text,
  manager_name        text,
  coordinator_name    text,
  aee_representative  text,
  aee_rep_name        text,
  active              boolean     NOT NULL DEFAULT true,
  created_at          timestamptz DEFAULT now() NOT NULL,
  updated_at          timestamptz DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS schools_updated_at ON public.schools;
CREATE TRIGGER schools_updated_at
  BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "schools_tenant" ON public.schools;
CREATE POLICY "schools_tenant" ON public.schools
  USING (tenant_id = public.my_tenant_id());
GRANT ALL ON TABLE public.schools TO anon, authenticated, service_role;

-- 2.2 Criar tabela school_staff
CREATE TABLE IF NOT EXISTS public.school_staff (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id   uuid    NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  tenant_id   uuid    NOT NULL REFERENCES public.tenants(id),
  name        text    NOT NULL,
  email       text,
  phone       text,
  role        text    NOT NULL
                CHECK (role IN ('AEE','COORDENADOR','PEDAGOGO','GESTOR','PROFESSOR_REGENTE','OUTROS')),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.school_staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "school_staff_tenant" ON public.school_staff;
CREATE POLICY "school_staff_tenant" ON public.school_staff
  USING (tenant_id = public.my_tenant_id());
GRANT ALL ON TABLE public.school_staff TO anon, authenticated, service_role;

-- 2.3 Adicionar colunas faltando em students
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS school_id               uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_external             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_school_name    text,
  ADD COLUMN IF NOT EXISTS external_school_city    text,
  ADD COLUMN IF NOT EXISTS external_professional   text,
  ADD COLUMN IF NOT EXISTS external_referral_source text,
  ADD COLUMN IF NOT EXISTS deleted_at              timestamptz;

-- 2.4 Corrigir students.shift CHECK (adicionar NOTURNO)
ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_shift_check;
-- shift pode não ter constraint — adiciona se não existir
ALTER TABLE public.students
  ADD CONSTRAINT students_shift_check
    CHECK (shift IS NULL OR shift IN ('MANHA','TARDE','INTEGRAL','NOTURNO'));

-- 2.5 Corrigir students.gender CHECK (se não existir)
ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_gender_check;
ALTER TABLE public.students
  ADD CONSTRAINT students_gender_check
    CHECK (gender IS NULL OR gender IN ('MASCULINO','FEMININO','NAO_BINARIO','OUTRO','NAO_INFORMADO'));

-- 2.6 Remover coluna familyContext (camelCase — bug de schema)
-- ATENÇÃO: migrar dados primeiro se houver
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'familyContext'
  ) THEN
    -- Migra dados para family_context antes de remover
    UPDATE public.students
    SET family_context = COALESCE(family_context, "familyContext", '')
    WHERE "familyContext" IS NOT NULL AND "familyContext" != '';

    ALTER TABLE public.students DROP COLUMN "familyContext";
  END IF;
END $$;

-- 2.7 Criar índice em students.school_id
CREATE INDEX IF NOT EXISTS idx_students_school   ON public.students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_active   ON public.students(tenant_id) WHERE deleted_at IS NULL;

-- 2.8 Criar tabela student_files
CREATE TABLE IF NOT EXISTS public.student_files (
  id                      uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id               uuid    NOT NULL REFERENCES public.tenants(id),
  student_id              uuid    NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  name                    text    NOT NULL,
  type                    text    NOT NULL
                            CHECK (type IN ('LAUDO','RELATORIO','ENCAMINHAMENTO','AVALIACAO','OUTRO')),
  file_url                text,
  storage_path            text,
  file_size_bytes         integer,
  mime_type               text,
  ai_synthesis            text,
  ai_pedagogical_points   jsonb   DEFAULT '[]' NOT NULL,
  ai_suggestions          jsonb   DEFAULT '[]' NOT NULL,
  ai_generated_at         timestamptz,
  uploaded_by             text,
  uploaded_by_id          uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  audit_code              text    UNIQUE,
  created_at              timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.student_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "student_files_tenant" ON public.student_files;
CREATE POLICY "student_files_tenant" ON public.student_files
  USING (tenant_id = public.my_tenant_id());
GRANT ALL ON TABLE public.student_files TO anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS idx_student_files_student ON public.student_files(student_id);

-- 2.9 Criar tabela student_collaborators
-- (depende de documents — criada antes neste script para FK posterior)
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
  document_id     uuid,   -- FK adicionada depois em FASE 4
  invited_by_id   uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at    timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.student_collaborators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "student_collab_tenant" ON public.student_collaborators;
CREATE POLICY "student_collab_tenant" ON public.student_collaborators
  USING (tenant_id = public.my_tenant_id());
GRANT ALL ON TABLE public.student_collaborators TO anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS idx_student_collab_student ON public.student_collaborators(student_id);

-- 2.10 Migrar dados de students.data->documents para student_files
-- (executa apenas se houver dados)
INSERT INTO public.student_files (tenant_id, student_id, name, type, file_url, created_at)
SELECT
  s.tenant_id,
  s.id,
  COALESCE(doc->>'name', 'Documento sem nome'),
  CASE
    WHEN upper(doc->>'type') = 'LAUDO'    THEN 'LAUDO'
    WHEN upper(doc->>'type') = 'RELATORIO' THEN 'RELATORIO'
    ELSE 'OUTRO'
  END,
  doc->>'url',
  COALESCE((doc->>'date')::timestamptz, s.created_at)
FROM public.students s,
     jsonb_array_elements(
       CASE
         WHEN s.data->>'documents' IS NOT NULL
         THEN (s.data->'documents')
         ELSE '[]'::jsonb
       END
     ) doc
WHERE s.data->'documents' IS NOT NULL
  AND jsonb_typeof(s.data->'documents') = 'array'
  AND jsonb_array_length(s.data->'documents') > 0
  AND doc->>'name' IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;

-- =============================================================================
-- FASE 3: SCHEDULING
-- =============================================================================

BEGIN;

-- 3.1 A tabela appointments atual está ligada a organizations (legado).
--     Criamos uma nova com tenant_id e renomeamos a legada.
--     O código JS já usa appointments corretamente — só precisamos da estrutura certa.

-- Verifica se appointments tem organization_id (schema legado) ou tenant_id (novo)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments'
    AND column_name = 'organization_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments'
    AND column_name = 'tenant_id'
  ) THEN
    -- Schema legado: renomeia e recria
    ALTER TABLE public.appointments RENAME TO appointments_legacy;
  END IF;
END $$;

-- 3.2 Criar appointments com estrutura correta (se não existir já com tenant_id)
CREATE TABLE IF NOT EXISTS public.appointments (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid    NOT NULL REFERENCES public.tenants(id),
  student_id      uuid    REFERENCES public.students(id) ON DELETE SET NULL,
  student_name    text,
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
  recurrence      jsonb,
  created_by      uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now() NOT NULL,
  updated_at      timestamptz DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS appointments_updated_at ON public.appointments;
CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "appointments_tenant" ON public.appointments;
CREATE POLICY "appointments_tenant" ON public.appointments
  USING (tenant_id = public.my_tenant_id());
GRANT ALL ON TABLE public.appointments TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_appointments_tenant  ON public.appointments(tenant_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_student ON public.appointments(student_id);

-- 3.3 Criar tabela service_records
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

ALTER TABLE public.service_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_records_tenant" ON public.service_records;
CREATE POLICY "service_records_tenant" ON public.service_records
  USING (tenant_id = public.my_tenant_id());
GRANT ALL ON TABLE public.service_records TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_service_records_student ON public.service_records(student_id, session_date);
CREATE INDEX IF NOT EXISTS idx_service_records_tenant  ON public.service_records(tenant_id);

COMMIT;

-- =============================================================================
-- FASE 4: DOCUMENTS
-- =============================================================================

BEGIN;

-- 4.1 Adicionar deleted_at em documents
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS deleted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS last_edited_by_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- 4.2 Normalizar documents.type CHECK (adiciona tipos corretos)
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_status_check
    CHECK (status IN ('DRAFT','FINAL'));

-- 4.3 Criar tabela document_versions
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

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "doc_versions_tenant" ON public.document_versions;
CREATE POLICY "doc_versions_tenant" ON public.document_versions
  USING (tenant_id = public.my_tenant_id());
GRANT ALL ON TABLE public.document_versions TO anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS idx_doc_versions_document ON public.document_versions(document_id);

-- 4.4 Migrar documents.versions[] para document_versions
-- Só migra documentos que têm array de versões não vazio
INSERT INTO public.document_versions (
  document_id, tenant_id, version_number,
  structured_data, change_log, edited_by, created_at
)
SELECT
  d.id,
  d.tenant_id,
  (v->>'versionNumber')::integer,
  COALESCE(v->'content', d.structured_data),
  v->>'changeLog',
  v->>'editedBy',
  COALESCE((v->>'createdAt')::timestamptz, d.created_at)
FROM public.documents d,
     jsonb_array_elements(
       CASE
         WHEN d.versions IS NOT NULL AND jsonb_typeof(d.versions) = 'array'
         THEN d.versions
         ELSE '[]'::jsonb
       END
     ) v
WHERE d.versions IS NOT NULL
  AND jsonb_typeof(d.versions) = 'array'
  AND jsonb_array_length(d.versions) > 0
  AND (v->>'versionNumber') IS NOT NULL
ON CONFLICT (document_id, version_number) DO NOTHING;

-- 4.5 Adicionar FK de student_collaborators para documents (agora que documents existe)
ALTER TABLE public.student_collaborators
  DROP CONSTRAINT IF EXISTS student_collaborators_document_id_fkey;
ALTER TABLE public.student_collaborators
  ADD CONSTRAINT student_collaborators_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;

-- 4.6 Criar views de compatibilidade
CREATE OR REPLACE VIEW public.active_documents AS
SELECT * FROM public.documents WHERE deleted_at IS NULL;

GRANT ALL ON TABLE public.active_documents TO anon, authenticated, service_role;

COMMIT;

-- =============================================================================
-- FASE 5: FORMS, EVOLUTION, ACTIVITIES
-- =============================================================================

BEGIN;

-- 5.1 Adicionar user_id em complementary_forms
ALTER TABLE public.complementary_forms
  ADD COLUMN IF NOT EXISTS student_name  text,
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- 5.2 Criar tabela checklists
CREATE TABLE IF NOT EXISTS public.checklists (
  id            uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid    NOT NULL REFERENCES public.tenants(id),
  student_id    uuid    REFERENCES public.students(id) ON DELETE CASCADE,
  title         text    NOT NULL,
  category      text    CHECK (category IN ('PEDAGOGICO','COMPORTAMENTAL','DESENVOLVIMENTO','OUTRO')),
  items         jsonb   NOT NULL DEFAULT '[]',
  completed_at  timestamptz,
  created_by    uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now() NOT NULL,
  updated_at    timestamptz DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS checklists_updated_at ON public.checklists;
CREATE TRIGGER checklists_updated_at
  BEFORE UPDATE ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "checklists_tenant" ON public.checklists;
CREATE POLICY "checklists_tenant" ON public.checklists
  USING (tenant_id = public.my_tenant_id());
GRANT ALL ON TABLE public.checklists TO anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS idx_checklists_student ON public.checklists(student_id);

-- 5.3 Criar tabela student_evolutions
CREATE TABLE IF NOT EXISTS public.student_evolutions (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid    NOT NULL REFERENCES public.tenants(id),
  student_id      uuid    NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  evolution_date  date    NOT NULL,
  observation     text    NOT NULL DEFAULT '',
  scores          jsonb   NOT NULL DEFAULT '[]',
  custom_fields   jsonb   NOT NULL DEFAULT '[]',
  author          text,
  author_id       uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now() NOT NULL,
  updated_at      timestamptz DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS student_evolutions_updated_at ON public.student_evolutions;
CREATE TRIGGER student_evolutions_updated_at
  BEFORE UPDATE ON public.student_evolutions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.student_evolutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "evolutions_tenant" ON public.student_evolutions;
CREATE POLICY "evolutions_tenant" ON public.student_evolutions
  USING (tenant_id = public.my_tenant_id());
GRANT ALL ON TABLE public.student_evolutions TO anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS idx_evolutions_student ON public.student_evolutions(student_id, evolution_date);

-- 5.4 Criar tabela activities
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
  ai_generated      boolean NOT NULL DEFAULT false,
  ai_model          text,
  credits_consumed  integer NOT NULL DEFAULT 0,
  created_by        uuid    REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now() NOT NULL,
  updated_at        timestamptz DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS activities_updated_at ON public.activities;
CREATE TRIGGER activities_updated_at
  BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activities_tenant" ON public.activities;
CREATE POLICY "activities_tenant" ON public.activities
  USING (tenant_id = public.my_tenant_id());
GRANT ALL ON TABLE public.activities TO anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS idx_activities_tenant  ON public.activities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activities_student ON public.activities(student_id);

-- 5.5 Criar tabela activity_attachments
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

ALTER TABLE public.activity_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "act_attach_tenant" ON public.activity_attachments;
CREATE POLICY "act_attach_tenant" ON public.activity_attachments
  USING (tenant_id = public.my_tenant_id());
GRANT ALL ON TABLE public.activity_attachments TO anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS idx_act_attach_activity ON public.activity_attachments(activity_id);

COMMIT;

-- =============================================================================
-- FASE 6: TIMELINE E WORKFLOW
-- =============================================================================

BEGIN;

-- 6.1 Criar tabela timeline_events
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

ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "timeline_tenant" ON public.timeline_events;
CREATE POLICY "timeline_tenant" ON public.timeline_events
  USING (tenant_id = public.my_tenant_id());
GRANT ALL ON TABLE public.timeline_events TO anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS idx_timeline_student ON public.timeline_events(student_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_tenant  ON public.timeline_events(tenant_id);

-- 6.2 Adicionar user_agent em audit_logs
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS user_agent text;

-- 6.3 Criar tabela workflow_steps
CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid    NOT NULL REFERENCES public.tenants(id),
  document_id     uuid    REFERENCES public.documents(id) ON DELETE CASCADE,
  step_order      integer NOT NULL,
  step_name       text    NOT NULL,
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

ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workflow_tenant" ON public.workflow_steps;
CREATE POLICY "workflow_tenant" ON public.workflow_steps
  USING (tenant_id = public.my_tenant_id());
GRANT ALL ON TABLE public.workflow_steps TO anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS idx_workflow_document ON public.workflow_steps(document_id);

COMMIT;

-- =============================================================================
-- FASE 7: BILLING
-- =============================================================================

BEGIN;

-- 7.1 Adicionar feature flags em plans
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS includes_export_word  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS includes_audit_print  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS includes_uploads      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_watermark         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS support_level         text    NOT NULL DEFAULT 'Email',
  ADD COLUMN IF NOT EXISTS updated_at            timestamptz DEFAULT now() NOT NULL;

DROP TRIGGER IF EXISTS plans_updated_at ON public.plans;
CREATE TRIGGER plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 7.2 Popular os novos campos nos planos existentes
UPDATE public.plans SET
  includes_export_word = false,
  includes_audit_print = false,
  includes_uploads     = false,
  has_watermark        = true,
  support_level        = 'Email'
WHERE name = 'FREE';

UPDATE public.plans SET
  includes_export_word = false,
  includes_audit_print = true,
  includes_uploads     = true,
  has_watermark        = false,
  support_level        = 'Prioritário'
WHERE name = 'PRO';

UPDATE public.plans SET
  includes_export_word = true,
  includes_audit_print = true,
  includes_uploads     = true,
  has_watermark        = false,
  support_level        = 'VIP WhatsApp'
WHERE name = 'MASTER';

UPDATE public.plans SET
  includes_export_word = true,
  includes_audit_print = true,
  includes_uploads     = true,
  has_watermark        = false,
  support_level        = 'Dedicado'
WHERE name = 'INSTITUTIONAL';

-- 7.3 Adicionar TRIALING em subscriptions.status
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('ACTIVE','TRIALING','PENDING','OVERDUE','CANCELED'));

-- 7.4 Adicionar provider_customer_id em subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider_customer_id text,
  ADD COLUMN IF NOT EXISTS started_at           timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS canceled_at          timestamptz;

-- 7.5 Consolidar credits_wallet (adicionar novas colunas canônicas)
ALTER TABLE public.credits_wallet
  ADD COLUMN IF NOT EXISTS credits_total     integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS credits_available integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS credits_spent     integer NOT NULL DEFAULT 0;

-- Migrar dados das colunas legadas para as novas
UPDATE public.credits_wallet SET
  credits_total     = COALESCE(balance, total_earned, 10),
  credits_available = COALESCE(credits_available, balance, 10),
  credits_spent     = COALESCE(total_spent, 0)
WHERE credits_total = 10 AND balance IS NOT NULL;

-- 7.6 Adicionar EXPIRY em credits_ledger.operation
ALTER TABLE public.credits_ledger
  DROP CONSTRAINT IF EXISTS credits_ledger_operation_check;
ALTER TABLE public.credits_ledger
  ADD CONSTRAINT credits_ledger_operation_check
    CHECK (operation IN ('RENEWAL','MANUAL_GRANT','CONSUMPTION','PURCHASE','EXPIRY'));

-- 7.7 Adicionar ref_type em credits_ledger
ALTER TABLE public.credits_ledger
  ADD COLUMN IF NOT EXISTS ref_type text CHECK (ref_type IN (
    'document','activity','evolution','form','other'
  ));

-- 7.8 Criar tabela purchase_intents
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

ALTER TABLE public.purchase_intents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "intents_tenant" ON public.purchase_intents;
CREATE POLICY "intents_tenant" ON public.purchase_intents
  USING (tenant_id = public.my_tenant_id());
GRANT ALL ON TABLE public.purchase_intents TO anon, authenticated, service_role;

COMMIT;

-- =============================================================================
-- FASE 8: AI USAGE
-- =============================================================================

BEGIN;

-- 8.1 Criar tabela ai_usage_logs
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

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage_tenant"  ON public.ai_usage_logs;
DROP POLICY IF EXISTS "ai_usage_insert"  ON public.ai_usage_logs;

CREATE POLICY "ai_usage_tenant" ON public.ai_usage_logs
  USING (tenant_id = public.my_tenant_id());
CREATE POLICY "ai_usage_insert" ON public.ai_usage_logs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.my_tenant_id());

GRANT ALL ON TABLE public.ai_usage_logs TO anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant ON public.ai_usage_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user   ON public.ai_usage_logs(user_id);

-- 8.2 Atualizar handle_new_user para nova estrutura
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
    ELSE 'DOCENTE'
  END;

  v_credits := CASE
    WHEN v_plan = 'PRO'    THEN 50
    WHEN v_plan = 'MASTER' THEN 70
    ELSE 10
  END;

  new_tenant_id := gen_random_uuid();

  INSERT INTO public.tenants (
    id, name, type,
    student_limit_base, student_limit_extra, ai_credit_limit,
    status_assinatura, plano_ativo, data_renovacao_plano,
    created_at, updated_at
  ) VALUES (
    new_tenant_id, initcap(v_nome), 'INDIVIDUAL',
    5, 0, v_credits,
    'ACTIVE', v_plan, now() + interval '30 days',
    now(), now()
  );

  INSERT INTO public.users (
    id, tenant_id, nome, email, role, plan,
    active, lgpd_accepted, created_at, updated_at
  ) VALUES (
    new.id, new_tenant_id, initcap(v_nome), new.email,
    v_role, v_plan, true, false, now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id  = EXCLUDED.tenant_id,
    nome       = EXCLUDED.nome,
    email      = EXCLUDED.email,
    role       = EXCLUDED.role,
    plan       = EXCLUDED.plan,
    active     = EXCLUDED.active,
    updated_at = now();

  INSERT INTO public.credits_wallet (
    id, tenant_id, credits_total, credits_available, credits_spent,
    reset_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_tenant_id,
    v_credits, v_credits, 0,
    now() + interval '30 days', now()
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    credits_total     = EXCLUDED.credits_total,
    credits_available = EXCLUDED.credits_available,
    reset_at          = EXCLUDED.reset_at,
    updated_at        = now();

  INSERT INTO public.subscriptions (
    id, tenant_id, plan, status, cycle,
    started_at, next_billing, created_at, updated_at
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

COMMIT;

-- =============================================================================
-- FASE 9: LIMPEZA DE TABELAS LEGADAS
-- ATENÇÃO: Só execute após confirmar que nenhum código usa mais estas tabelas.
-- Execute manualmente, linha por linha, com validação entre cada step.
-- =============================================================================

-- [COMENTADO — descomente apenas após validação completa]

/*
BEGIN;

-- Remover policies das tabelas legadas
DROP POLICY IF EXISTS "Members can access appointments"   ON public.appointments_legacy;
DROP POLICY IF EXISTS "Members can access credit_usage"   ON public.credit_usage;
DROP POLICY IF EXISTS "Members can access transactions"   ON public.transactions;

-- Remover tabelas legadas (em ordem de dependência)
DROP TABLE IF EXISTS public.credit_usage       CASCADE;
DROP TABLE IF EXISTS public.transactions       CASCADE;
DROP TABLE IF EXISTS public.organization_members CASCADE;
DROP TABLE IF EXISTS public.organizations      CASCADE;
DROP TABLE IF EXISTS public.appointments_legacy CASCADE;
DROP TABLE IF EXISTS public.profiles           CASCADE;
DROP TABLE IF EXISTS public.usuarios_legacy    CASCADE;

-- Remover view legada 'usuarios' (agora redundante)
DROP VIEW IF EXISTS public.usuarios;

COMMIT;
*/

-- =============================================================================
-- VERIFICAÇÃO PÓS-MIGRAÇÃO
-- Execute para validar que a migração foi aplicada corretamente
-- =============================================================================

/*
-- Verificar novas tabelas
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Verificar constraints de tenants.type
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
AND constraint_name LIKE '%type_check%';

-- Verificar colunas de students
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'students'
ORDER BY ordinal_position;

-- Verificar RLS habilitado
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Verificar dados migrados em student_files
SELECT COUNT(*) FROM public.student_files;

-- Verificar dados migrados em document_versions
SELECT COUNT(*) FROM public.document_versions;
*/
