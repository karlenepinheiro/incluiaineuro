-- Sprint 6 — Aba "Cuidadoras e Rotina" no dossiê do aluno
-- Tabelas: student_custom_sections, student_custom_fields
-- 2026-05-16

-- ─── student_custom_sections ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_custom_sections (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  student_id  uuid        NOT NULL,
  title       text        NOT NULL,
  category    text        NOT NULL DEFAULT 'care_routine',
  order_index int         NOT NULL DEFAULT 0,
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_custom_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "care_sections_select" ON public.student_custom_sections
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "care_sections_insert" ON public.student_custom_sections
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "care_sections_update" ON public.student_custom_sections
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "care_sections_delete" ON public.student_custom_sections
  FOR DELETE USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

-- ─── student_custom_fields ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_custom_fields (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL,
  student_id   uuid        NOT NULL,
  section_id   uuid        NOT NULL REFERENCES public.student_custom_sections(id) ON DELETE CASCADE,
  label        text        NOT NULL,
  field_type   text        NOT NULL DEFAULT 'text',
  value        jsonb,
  options      jsonb,
  is_required  boolean     NOT NULL DEFAULT false,
  enable_audio boolean     NOT NULL DEFAULT false,
  order_index  int         NOT NULL DEFAULT 0,
  created_by   uuid,
  updated_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "care_fields_select" ON public.student_custom_fields
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "care_fields_insert" ON public.student_custom_fields
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "care_fields_update" ON public.student_custom_fields
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "care_fields_delete" ON public.student_custom_fields
  FOR DELETE USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_custom_sections_student
  ON public.student_custom_sections(student_id, category);

CREATE INDEX IF NOT EXISTS idx_custom_fields_section
  ON public.student_custom_fields(section_id);

CREATE INDEX IF NOT EXISTS idx_custom_fields_student
  ON public.student_custom_fields(student_id);
