-- ============================================================
-- INCLUIAI — SCHEMA ADDITIONS v2
-- Arquivo: supabase/schema_additions.sql
-- Descrição: Tabelas adicionais para suportar os módulos:
--   • Copilot Pedagógico
--   • Agenda de Atendimentos (extensão)
--   • Perfil Cognitivo do Aluno
--   • Timeline do Aluno
--   • Workflow Visual AtivaIA
--   • Sistema de Créditos (extensão)
--   • Análise de Laudos
--   • Documentos Pedagógicos Gerados
-- Execute APÓS o schema.sql principal (é idempotente via IF NOT EXISTS)
-- ============================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET row_security = off;


-- ============================================================
-- 1. PERFIL COGNITIVO DO ALUNO (student_profiles)
-- Avaliações estruturadas das 10 dimensões cognitivas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_profiles (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid        REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id      uuid        REFERENCES public.students(id) ON DELETE CASCADE,

  -- Dimensões cognitivas (escala 1–5)
  comunicacao_expressiva  smallint DEFAULT 3 CHECK (comunicacao_expressiva  BETWEEN 1 AND 5),
  interacao_social        smallint DEFAULT 3 CHECK (interacao_social        BETWEEN 1 AND 5),
  autonomia_avd           smallint DEFAULT 3 CHECK (autonomia_avd           BETWEEN 1 AND 5),
  autorregulacao          smallint DEFAULT 3 CHECK (autorregulacao          BETWEEN 1 AND 5),
  atencao_sustentada      smallint DEFAULT 3 CHECK (atencao_sustentada      BETWEEN 1 AND 5),
  compreensao             smallint DEFAULT 3 CHECK (compreensao             BETWEEN 1 AND 5),
  motricidade_fina        smallint DEFAULT 3 CHECK (motricidade_fina        BETWEEN 1 AND 5),
  motricidade_grossa      smallint DEFAULT 3 CHECK (motricidade_grossa      BETWEEN 1 AND 5),
  participacao            smallint DEFAULT 3 CHECK (participacao            BETWEEN 1 AND 5),
  linguagem_leitura       smallint DEFAULT 3 CHECK (linguagem_leitura       BETWEEN 1 AND 5),

  -- Metadata
  observation   text,
  evaluated_by  text,
  evaluated_at  date         DEFAULT CURRENT_DATE,
  created_at    timestamptz  DEFAULT now(),
  updated_at    timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_profiles_student
  ON public.student_profiles (student_id);

COMMENT ON TABLE public.student_profiles IS
  'Perfil cognitivo estruturado do aluno. Cada linha = uma avaliação datada.';


-- ============================================================
-- 2. TIMELINE DO ALUNO (student_timeline)
-- Linha do tempo unificada de eventos do aluno
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_timeline (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid        REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id    uuid        REFERENCES public.students(id) ON DELETE CASCADE,

  -- Tipo: protocolo | evolucao | laudo | ficha | atendimento | matricula | nota | atividade
  event_type    text        NOT NULL,
  title         text        NOT NULL,
  description   text,

  -- Referência opcional para o objeto relacionado
  linked_id     uuid,
  linked_table  text,   -- 'documents' | 'appointments' | 'student_documents' | etc.

  icon          text,   -- ícone lucide (ex: 'FileText', 'Calendar', 'Brain')
  author        text,
  event_date    date    NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_timeline_student
  ON public.student_timeline (student_id, event_date DESC);

COMMENT ON TABLE public.student_timeline IS
  'Linha do tempo consolidada de todos os eventos pedagógicos do aluno.';


-- ============================================================
-- 3. DOCUMENTOS DO ALUNO (student_documents)
-- Arquivos enviados (laudos, relatórios externos, fotos)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_documents (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid        REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id    uuid        REFERENCES public.students(id) ON DELETE CASCADE,

  name          text        NOT NULL,
  -- Laudo | Relatorio | Avaliacao | Foto | Outro
  document_type text        NOT NULL DEFAULT 'Outro',

  file_url      text,
  file_path     text,
  file_size     integer,
  mime_type     text,

  uploaded_by   text,
  notes         text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_documents_student
  ON public.student_documents (student_id);

COMMENT ON TABLE public.student_documents IS
  'Arquivos e documentos externos enviados para o perfil do aluno.';


-- ============================================================
-- 4. LAUDOS MÉDICOS / ANÁLISE IA (medical_reports)
-- Laudos com síntese e insights gerados por IA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.medical_reports (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid        REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id    uuid        REFERENCES public.students(id) ON DELETE CASCADE,
  document_id   uuid        REFERENCES public.student_documents(id) ON DELETE SET NULL,

  -- neurologico | psicologico | fonoaudiologico | to | psicopedagogico | multidisciplinar
  report_type   text,
  issuer_name   text,
  issue_date    date,
  cid_codes     text[]      DEFAULT '{}',

  -- Conteúdo gerado por IA
  synthesis          text,
  pedagogical_points text[]  DEFAULT '{}',
  suggestions        text[]  DEFAULT '{}',

  raw_content        text,   -- OCR / texto extraído
  analyzed_by_ai     boolean DEFAULT false,
  audit_code         text,

  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medical_reports_student
  ON public.medical_reports (student_id);

COMMENT ON TABLE public.medical_reports IS
  'Laudos médicos e terapêuticos com análise pedagógica gerada por IA.';


-- ============================================================
-- 5. WORKFLOWS ATIVIA (workflows)
-- Definição dos fluxos visuais criados no AtivaIA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workflows (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid        REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id       uuid        REFERENCES public.users(id)   ON DELETE SET NULL,
  student_id    uuid        REFERENCES public.students(id) ON DELETE SET NULL,

  name          text        NOT NULL DEFAULT 'Novo Workflow',
  description   text,
  -- ativaIA | eduLensIA | neuroDesign
  workflow_type text        NOT NULL DEFAULT 'ativaIA',
  -- draft | active | completed | archived
  status        text        NOT NULL DEFAULT 'draft',

  -- React Flow data (nodes e edges)
  nodes_data    jsonb       DEFAULT '[]'::jsonb,
  edges_data    jsonb       DEFAULT '[]'::jsonb,

  is_template   boolean     DEFAULT false,
  tags          text[]      DEFAULT '{}',
  credits_used  integer     DEFAULT 0,

  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflows_tenant
  ON public.workflows (tenant_id, workflow_type, status);

COMMENT ON TABLE public.workflows IS
  'Workflows visuais criados no AtivaIA/EduLensIA/NeuroDesign.';


-- ============================================================
-- 6. NÓS DE WORKFLOW (workflow_nodes)
-- Detalhamento de cada nó para queries e analytics
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workflow_nodes (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id uuid    REFERENCES public.workflows(id) ON DELETE CASCADE,
  node_id     text    NOT NULL,   -- id interno do React Flow
  -- upload | prompt | discipline | bncc | image_gen | pdf_export | redesign | ocr | etc.
  node_type   text    NOT NULL,
  position_x  float,
  position_y  float,
  data        jsonb   DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_nodes_workflow
  ON public.workflow_nodes (workflow_id);


-- ============================================================
-- 7. EXECUÇÕES DE WORKFLOW (workflow_runs)
-- Histórico de cada vez que um workflow foi executado
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id     uuid        REFERENCES public.workflows(id) ON DELETE SET NULL,
  tenant_id       uuid        REFERENCES public.tenants(id)   ON DELETE CASCADE,
  user_id         uuid        REFERENCES public.users(id)     ON DELETE SET NULL,

  -- pending | running | completed | failed
  status          text        NOT NULL DEFAULT 'pending',
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz,
  credits_consumed integer    DEFAULT 0,

  output_data     jsonb       DEFAULT '{}'::jsonb,  -- resultado (URLs de imagens, texto, etc.)
  error_message   text,
  run_metadata    jsonb       DEFAULT '{}'::jsonb    -- parâmetros de entrada usados
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_tenant
  ON public.workflow_runs (tenant_id, started_at DESC);

COMMENT ON TABLE public.workflow_runs IS
  'Histórico de execuções de workflows com outputs e créditos consumidos.';


-- ============================================================
-- 8. TEMPLATES DE WORKFLOW (workflow_templates)
-- Fluxos pré-prontos disponíveis para uso
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workflow_templates (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  name            text    NOT NULL,
  description     text,
  workflow_type   text    NOT NULL DEFAULT 'ativaIA',
  category        text,   -- matematica | portugues | ciencias | artes | etc.
  thumbnail_url   text,
  nodes_data      jsonb   DEFAULT '[]'::jsonb,
  edges_data      jsonb   DEFAULT '[]'::jsonb,
  is_public       boolean DEFAULT true,
  is_featured     boolean DEFAULT false,
  credits_cost    integer DEFAULT 1,
  tags            text[]  DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

COMMENT ON TABLE public.workflow_templates IS
  'Templates de workflow disponíveis para professores aplicarem.';


-- ============================================================
-- 9. FICHAS DE OBSERVAÇÃO (observation_forms)
-- Substitui/complementa complementary_forms com estrutura mais rica
-- ============================================================
CREATE TABLE IF NOT EXISTS public.observation_forms (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid        REFERENCES public.tenants(id)   ON DELETE CASCADE,
  student_id  uuid        REFERENCES public.students(id)  ON DELETE CASCADE,
  user_id     uuid        REFERENCES public.users(id)     ON DELETE SET NULL,

  -- obs_regente | escuta_familia | analise_aee | decisao_institucional | acompanhamento_evolucao
  form_type   text        NOT NULL,
  title       text        NOT NULL,
  -- rascunho | finalizado
  status      text        NOT NULL DEFAULT 'rascunho',

  fields_data jsonb       DEFAULT '{}'::jsonb,
  audit_code  text,
  content_hash text,
  created_by  text,

  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_observation_forms_student
  ON public.observation_forms (student_id, form_type);


-- ============================================================
-- 10. ITENS DE CHECKLIST (observation_checklists)
-- Itens individuais dentro de uma ficha de observação
-- ============================================================
CREATE TABLE IF NOT EXISTS public.observation_checklists (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id     uuid    REFERENCES public.observation_forms(id) ON DELETE CASCADE,
  category    text    NOT NULL,
  item_text   text    NOT NULL,
  is_checked  boolean DEFAULT false,
  notes       text,
  sort_order  integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_observation_checklists_form
  ON public.observation_checklists (form_id);


-- ============================================================
-- 11. ATIVIDADES GERADAS (generated_activities)
-- Atividades pedagógicas criadas via workflows de IA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.generated_activities (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid        REFERENCES public.tenants(id)   ON DELETE CASCADE,
  user_id         uuid        REFERENCES public.users(id)     ON DELETE SET NULL,
  student_id      uuid        REFERENCES public.students(id)  ON DELETE SET NULL,
  workflow_run_id uuid        REFERENCES public.workflow_runs(id) ON DELETE SET NULL,

  title           text        NOT NULL,
  content         text,
  image_url       text,
  image_prompt    text,

  bncc_codes      text[]      DEFAULT '{}',
  discipline      text,
  -- facil | medio | dificil
  difficulty_level text,
  -- A4 | A5 | quadrado | vertical
  page_size       text        DEFAULT 'A4',
  guidance        text,
  tags            text[]      DEFAULT '{}',
  is_adapted      boolean     DEFAULT false,
  credits_used    integer     DEFAULT 0,

  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_activities_tenant
  ON public.generated_activities (tenant_id, created_at DESC);


-- ============================================================
-- 12. DOCUMENTOS PEDAGÓGICOS GERADOS (generated_documents)
-- Documentos finais (PDFs, Word) gerados pela plataforma
-- ============================================================
CREATE TABLE IF NOT EXISTS public.generated_documents (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid        REFERENCES public.tenants(id)   ON DELETE CASCADE,
  user_id         uuid        REFERENCES public.users(id)     ON DELETE SET NULL,
  student_id      uuid        REFERENCES public.students(id)  ON DELETE SET NULL,

  -- PEI | PAEE | PDI | estudo_caso | atividade | ficha_pedagogica | relatorio
  document_type   text        NOT NULL,
  title           text        NOT NULL,

  content_data    jsonb       DEFAULT '{}'::jsonb,
  file_url        text,
  audit_code      text,
  content_hash    text,

  -- DRAFT | FINAL
  status          text        NOT NULL DEFAULT 'DRAFT',
  -- ai_generated | manual | template
  source_type     text        DEFAULT 'manual',
  ai_model        text,

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_documents_tenant
  ON public.generated_documents (tenant_id, document_type, status);


-- ============================================================
-- 13. REQUISIÇÕES DE IA (ai_requests)
-- Registro de todas as chamadas enviadas aos modelos de IA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_requests (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid        REFERENCES public.tenants(id)   ON DELETE CASCADE,
  user_id         uuid        REFERENCES public.users(id)     ON DELETE SET NULL,

  -- document_generation | activity_generation | image_generation | ocr | analysis | copilot
  request_type    text        NOT NULL,
  -- gemini-2.0-flash | gemini-pro | gpt-4o | etc.
  model           text,

  prompt_tokens   integer,
  completion_tokens integer,
  input_data      jsonb       DEFAULT '{}'::jsonb,  -- dados de entrada (sanitizados)

  -- pending | success | failed
  status          text        NOT NULL DEFAULT 'pending',
  credits_consumed integer    DEFAULT 0,
  latency_ms      integer,

  created_at      timestamptz DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_requests_tenant
  ON public.ai_requests (tenant_id, request_type, created_at DESC);

COMMENT ON TABLE public.ai_requests IS
  'Auditoria completa de todas as requisições enviadas a modelos de IA.';


-- ============================================================
-- 14. SAÍDAS DE IA (ai_outputs)
-- Conteúdo retornado por cada requisição de IA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_outputs (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id  uuid    REFERENCES public.ai_requests(id) ON DELETE CASCADE,

  -- text | json | image | pdf | markdown
  output_type text    NOT NULL,
  content     text,       -- conteúdo texto/json
  file_url    text,       -- URL de imagem/PDF gerado
  metadata    jsonb   DEFAULT '{}'::jsonb,

  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_outputs_request
  ON public.ai_outputs (request_id);


-- ============================================================
-- 15. SUGESTÕES DO COPILOT (copilot_suggestions)  [opcional]
-- Cache de sugestões geradas pelo Copilot Pedagógico
-- ============================================================
CREATE TABLE IF NOT EXISTS public.copilot_suggestions (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid        REFERENCES public.tenants(id)  ON DELETE CASCADE,
  user_id         uuid        REFERENCES public.users(id)    ON DELETE CASCADE,
  student_id      uuid        REFERENCES public.students(id) ON DELETE SET NULL,

  -- Contexto que gerou a sugestão
  context_view    text,       -- 'ativaIA' | 'student_profile' | 'protocols' | etc.
  context_data    jsonb       DEFAULT '{}'::jsonb,

  -- Sugestões retornadas
  suggestions     jsonb       DEFAULT '[]'::jsonb,
  -- pending | shown | dismissed | acted
  status          text        NOT NULL DEFAULT 'pending',

  shown_at        timestamptz,
  acted_at        timestamptz,
  dismissed_at    timestamptz,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_suggestions_user
  ON public.copilot_suggestions (user_id, created_at DESC);


-- ============================================================
-- 16. RLS — Row Level Security
-- Garante isolamento multi-tenant em todas as novas tabelas
-- ============================================================

-- student_profiles
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_profiles_tenant ON public.student_profiles;
CREATE POLICY student_profiles_tenant ON public.student_profiles
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- student_timeline
ALTER TABLE public.student_timeline ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_timeline_tenant ON public.student_timeline;
CREATE POLICY student_timeline_tenant ON public.student_timeline
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- student_documents
ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_documents_tenant ON public.student_documents;
CREATE POLICY student_documents_tenant ON public.student_documents
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- medical_reports
ALTER TABLE public.medical_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS medical_reports_tenant ON public.medical_reports;
CREATE POLICY medical_reports_tenant ON public.medical_reports
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- workflows
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflows_tenant ON public.workflows;
CREATE POLICY workflows_tenant ON public.workflows
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- workflow_runs
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_runs_tenant ON public.workflow_runs;
CREATE POLICY workflow_runs_tenant ON public.workflow_runs
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- observation_forms
ALTER TABLE public.observation_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS observation_forms_tenant ON public.observation_forms;
CREATE POLICY observation_forms_tenant ON public.observation_forms
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- generated_activities
ALTER TABLE public.generated_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS generated_activities_tenant ON public.generated_activities;
CREATE POLICY generated_activities_tenant ON public.generated_activities
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- generated_documents
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS generated_documents_tenant ON public.generated_documents;
CREATE POLICY generated_documents_tenant ON public.generated_documents
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- ai_requests
ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_requests_tenant ON public.ai_requests;
CREATE POLICY ai_requests_tenant ON public.ai_requests
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- copilot_suggestions
ALTER TABLE public.copilot_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS copilot_suggestions_user ON public.copilot_suggestions;
CREATE POLICY copilot_suggestions_user ON public.copilot_suggestions
  USING (user_id = auth.uid());

-- workflow_templates são públicos (SELECT para todos autenticados)
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_templates_public ON public.workflow_templates;
CREATE POLICY workflow_templates_public ON public.workflow_templates
  FOR SELECT USING (is_public = true OR auth.uid() IS NOT NULL);


-- ============================================================
-- 17. DADOS INICIAIS — TEMPLATES DE WORKFLOW
-- ============================================================
INSERT INTO public.workflow_templates (name, description, workflow_type, category, is_featured, credits_cost, tags)
VALUES
  ('Atividade com Imagem', 'Gera uma atividade pedagógica com imagem ilustrativa a partir de um tema', 'ativaIA', 'geral', true, 2, ARRAY['imagem', 'atividade', 'ilustracao']),
  ('Folha Pedagógica A4', 'Cria uma folha pedagógica completa pronta para impressão', 'ativaIA', 'geral', true, 2, ARRAY['folha', 'impressao', 'a4']),
  ('Adaptar Atividade Existente', 'Recebe uma atividade e adapta para alunos com necessidades específicas', 'eduLensIA', 'inclusao', false, 1, ARRAY['adaptacao', 'inclusao', 'aee']),
  ('Redesign Visual de Texto', 'Transforma texto denso em layout acessível com ícones e cores', 'neuroDesign', 'acessibilidade', false, 1, ARRAY['visual', 'acessibilidade', 'redesign']),
  ('Sequência Didática', 'Cria sequência de 3 atividades progressivas sobre um tema', 'ativaIA', 'sequencia', false, 3, ARRAY['sequencia', 'progressao', 'planejamento'])
ON CONFLICT DO NOTHING;


-- ============================================================
-- FIM DO SCHEMA ADDITIONS v2
-- ============================================================