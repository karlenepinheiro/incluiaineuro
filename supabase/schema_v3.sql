-- ============================================================
-- INCLUIAI — SCHEMA v3 (Correções de Persistência)
-- Arquivo: supabase/schema_v3.sql
-- Descrição: Tabela tenant_appointments compatível com a UI
--   Execute APÓS schema.sql + schema_additions.sql
-- ============================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET row_security = off;

-- ============================================================
-- tenant_appointments
-- A tabela "appointments" existente usa organization_id (schema legado).
-- Esta tabela usa tenant_id e campos compatíveis com a UI React.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tenant_appointments (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         uuid        REFERENCES public.tenants(id)   ON DELETE CASCADE,
  user_id           uuid        REFERENCES public.users(id)     ON DELETE SET NULL,
  student_id        uuid        REFERENCES public.students(id)  ON DELETE SET NULL,

  student_name      text,
  title             text        NOT NULL,
  appointment_date  date        NOT NULL,
  appointment_time  text,          -- HH:MM
  duration          integer     DEFAULT 50,
  -- AEE | Avaliacao | Reuniao | Atendimento | Outro
  type              text        DEFAULT 'AEE',
  professional      text,
  location          text,
  notes             text,
  -- agendado | realizado | cancelado | reagendado
  status            text        NOT NULL DEFAULT 'agendado',

  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_appointments_tenant
  ON public.tenant_appointments (tenant_id, appointment_date DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_appointments_student
  ON public.tenant_appointments (student_id);

COMMENT ON TABLE public.tenant_appointments IS
  'Agenda de atendimentos multi-tenant. Compatível com a UI React (título, data, hora, status).';

-- RLS
ALTER TABLE public.tenant_appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_appointments_rls ON public.tenant_appointments;
CREATE POLICY tenant_appointments_rls ON public.tenant_appointments
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS tenant_appointments_insert ON public.tenant_appointments;
CREATE POLICY tenant_appointments_insert ON public.tenant_appointments
  FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS tenant_appointments_update ON public.tenant_appointments;
CREATE POLICY tenant_appointments_update ON public.tenant_appointments
  FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS tenant_appointments_delete ON public.tenant_appointments;
CREATE POLICY tenant_appointments_delete ON public.tenant_appointments
  FOR DELETE USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));


-- ============================================================
-- Garantir políticas INSERT/UPDATE/DELETE nas tabelas Sprint 2
-- (schema_additions.sql só criou política USING para SELECT)
-- ============================================================

-- student_profiles
DROP POLICY IF EXISTS student_profiles_insert ON public.student_profiles;
CREATE POLICY student_profiles_insert ON public.student_profiles
  FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS student_profiles_update ON public.student_profiles;
CREATE POLICY student_profiles_update ON public.student_profiles
  FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- student_timeline
DROP POLICY IF EXISTS student_timeline_insert ON public.student_timeline;
CREATE POLICY student_timeline_insert ON public.student_timeline
  FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- student_documents
DROP POLICY IF EXISTS student_documents_insert ON public.student_documents;
CREATE POLICY student_documents_insert ON public.student_documents
  FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS student_documents_delete ON public.student_documents;
CREATE POLICY student_documents_delete ON public.student_documents
  FOR DELETE USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- medical_reports
DROP POLICY IF EXISTS medical_reports_insert ON public.medical_reports;
CREATE POLICY medical_reports_insert ON public.medical_reports
  FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS medical_reports_update ON public.medical_reports;
CREATE POLICY medical_reports_update ON public.medical_reports
  FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- observation_forms
DROP POLICY IF EXISTS observation_forms_insert ON public.observation_forms;
CREATE POLICY observation_forms_insert ON public.observation_forms
  FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS observation_forms_update ON public.observation_forms;
CREATE POLICY observation_forms_update ON public.observation_forms
  FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS observation_forms_delete ON public.observation_forms;
CREATE POLICY observation_forms_delete ON public.observation_forms
  FOR DELETE USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- generated_activities
DROP POLICY IF EXISTS generated_activities_insert ON public.generated_activities;
CREATE POLICY generated_activities_insert ON public.generated_activities
  FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS generated_activities_delete ON public.generated_activities;
CREATE POLICY generated_activities_delete ON public.generated_activities
  FOR DELETE USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- generated_documents
DROP POLICY IF EXISTS generated_documents_insert ON public.generated_documents;
CREATE POLICY generated_documents_insert ON public.generated_documents
  FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- ai_requests
DROP POLICY IF EXISTS ai_requests_insert ON public.ai_requests;
CREATE POLICY ai_requests_insert ON public.ai_requests
  FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS ai_requests_update ON public.ai_requests;
CREATE POLICY ai_requests_update ON public.ai_requests
  FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- ai_outputs (sem tenant_id; herda via request_id)
DROP POLICY IF EXISTS ai_outputs_insert ON public.ai_outputs;
CREATE POLICY ai_outputs_insert ON public.ai_outputs
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS ai_outputs_select ON public.ai_outputs;
CREATE POLICY ai_outputs_select ON public.ai_outputs
  FOR SELECT USING (
    request_id IN (
      SELECT id FROM public.ai_requests
      WHERE tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    )
  );

-- copilot_suggestions
DROP POLICY IF EXISTS copilot_suggestions_insert ON public.copilot_suggestions;
CREATE POLICY copilot_suggestions_insert ON public.copilot_suggestions
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS copilot_suggestions_update ON public.copilot_suggestions;
CREATE POLICY copilot_suggestions_update ON public.copilot_suggestions
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================================
-- FIM schema_v3.sql
-- ============================================================
