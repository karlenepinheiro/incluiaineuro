-- ============================================================
-- MIGRATION: schema_v_triagem.sql
-- Objetivo: Adicionar suporte a Triagem vs Laudo e campos
--           pedagógicos e clínicos extras na tabela students.
-- Rodar em: Supabase SQL Editor (uma vez)
-- Seguro p/ re-executar: usa IF NOT EXISTS / DO ... IF
-- ============================================================

-- 1. Tipo de aluno: 'com_laudo' | 'em_triagem'
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS student_type text
    NOT NULL DEFAULT 'com_laudo'
    CHECK (student_type IN ('com_laudo', 'em_triagem'));

-- 2. Perfil pedagógico (habilidades, dificuldades, estratégias)
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS skills               jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS student_difficulties jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS student_strategies   jsonb DEFAULT '[]'::jsonb;

-- 3. Campos de aluno externo (atendido fora da escola)
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS is_external              boolean DEFAULT false;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS external_school_name     text;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS external_school_city     text;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS external_professional    text;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS external_referral_source text
    CHECK (external_referral_source IN ('Escola','Clínica','UBS','Família','Prefeitura','Outro') OR external_referral_source IS NULL);

-- 4. Campos clínicos e pedagógicos complementares
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS support_level  text DEFAULT 'Nível 1';

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS shift          text; -- Matutino | Vespertino | Integral

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS aee_teacher    text;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS coordinator    text;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS family_context text;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS school_history text;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS observations   text;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS photo_url      text;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS professionals  jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS communication  jsonb DEFAULT '[]'::jsonb;

-- 5. Índices úteis para buscas
CREATE INDEX IF NOT EXISTS idx_students_student_type
  ON public.students (tenant_id, student_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_students_is_external
  ON public.students (tenant_id, is_external)
  WHERE deleted_at IS NULL;

-- 6. Comentários para documentar o schema
COMMENT ON COLUMN public.students.student_type           IS 'com_laudo = aluno com diagnóstico confirmado; em_triagem = em observação/avaliação';
COMMENT ON COLUMN public.students.skills                 IS 'Array de habilidades/potencialidades pedagógicas (jsonb)';
COMMENT ON COLUMN public.students.student_difficulties   IS 'Array de dificuldades/barreiras pedagógicas (jsonb)';
COMMENT ON COLUMN public.students.student_strategies     IS 'Array de estratégias pedagógicas (jsonb)';
COMMENT ON COLUMN public.students.is_external            IS 'true = aluno atendido externamente (não matriculado na escola do profissional)';
COMMENT ON COLUMN public.students.support_level          IS 'Nível de suporte (DSM-5): Nível 1, 2 ou 3';
