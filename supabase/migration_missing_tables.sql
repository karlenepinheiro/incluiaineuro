-- ============================================================
-- INCLUIAI — MIGRATION: Tabelas Faltantes no Banco
-- Arquivo: supabase/migration_missing_tables.sql
-- Descrição: Cria as 3 tabelas que estão no código mas não no DB:
--   1. tenant_appointments   (schema_v3.sql)
--   2. parent_document_signatures (schema_v8_signatures_rls.sql)
--   3. service_records       (schema_service_records.sql)
-- Seguro p/ re-executar: usa IF NOT EXISTS em todo lugar
-- ============================================================

-- ============================================================
-- 1. tenant_appointments
--    Agenda de atendimentos multi-tenant compatível com a UI React
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
  type              text        DEFAULT 'AEE', -- AEE | Avaliacao | Reuniao | Atendimento | Outro
  professional      text,
  location          text,
  notes             text,
  status            text        NOT NULL DEFAULT 'agendado', -- agendado | realizado | cancelado | reagendado

  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_appointments_tenant
  ON public.tenant_appointments (tenant_id, appointment_date DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_appointments_student
  ON public.tenant_appointments (student_id);

ALTER TABLE public.tenant_appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_appointments_rls    ON public.tenant_appointments;
DROP POLICY IF EXISTS tenant_appointments_insert ON public.tenant_appointments;
DROP POLICY IF EXISTS tenant_appointments_update ON public.tenant_appointments;
DROP POLICY IF EXISTS tenant_appointments_delete ON public.tenant_appointments;

CREATE POLICY tenant_appointments_rls ON public.tenant_appointments
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY tenant_appointments_insert ON public.tenant_appointments
  FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY tenant_appointments_update ON public.tenant_appointments
  FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY tenant_appointments_delete ON public.tenant_appointments
  FOR DELETE USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));


-- ============================================================
-- 2. parent_document_signatures
--    Assinaturas pontuais dos responsáveis (por documento, não reutilizáveis)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.parent_document_signatures (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES public.tenants(id)   ON DELETE CASCADE,
  student_id           uuid        REFERENCES public.students(id) ON DELETE SET NULL,

  document_type        text        NOT NULL,
  audit_code           text,

  signer_name          text        NOT NULL,
  signature_mode       text        NOT NULL DEFAULT 'manual', -- digital | manual | upload

  signature_image_url  text,   -- URL storage
  signature_data_b64   text,   -- base64 do canvas

  signed_at            timestamptz NOT NULL DEFAULT NOW(),
  created_at           timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parent_sigs_tenant  ON public.parent_document_signatures(tenant_id);
CREATE INDEX IF NOT EXISTS idx_parent_sigs_student ON public.parent_document_signatures(student_id);
CREATE INDEX IF NOT EXISTS idx_parent_sigs_audit   ON public.parent_document_signatures(audit_code);

ALTER TABLE public.parent_document_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_sigs_tenant_read"   ON public.parent_document_signatures;
DROP POLICY IF EXISTS "parent_sigs_tenant_insert"  ON public.parent_document_signatures;
DROP POLICY IF EXISTS "parent_sigs_admin_all"      ON public.parent_document_signatures;

CREATE POLICY "parent_sigs_tenant_read" ON public.parent_document_signatures
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "parent_sigs_tenant_insert" ON public.parent_document_signatures
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "parent_sigs_admin_all" ON public.parent_document_signatures
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
  );


-- ============================================================
-- 4. Políticas INSERT/UPDATE na tabela documents
--    A policy "docs_tenant" existente usa USING (somente SELECT/UPDATE/DELETE).
--    Sem WITH CHECK, INSERT sempre é bloqueado pelo RLS.
-- ============================================================
DROP POLICY IF EXISTS "docs_tenant_insert" ON public.documents;
CREATE POLICY "docs_tenant_insert" ON public.documents
  FOR INSERT WITH CHECK (tenant_id = public.my_tenant_id());

DROP POLICY IF EXISTS "docs_tenant_update" ON public.documents;
CREATE POLICY "docs_tenant_update" ON public.documents
  FOR UPDATE USING (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

DROP POLICY IF EXISTS "docs_tenant_delete" ON public.documents;
CREATE POLICY "docs_tenant_delete" ON public.documents
  FOR DELETE USING (tenant_id = public.my_tenant_id());


-- ============================================================
-- 3. service_records
--    Controle de Atendimentos (ServiceControlView)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_records (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id)   ON DELETE CASCADE,
  student_id    uuid        NOT NULL REFERENCES public.students(id)  ON DELETE CASCADE,

  student_name  text        NOT NULL,
  date          date        NOT NULL,
  type          text        NOT NULL,            -- AEE | Psicologia | Fonoaudiologia | etc.
  professional  text        NOT NULL,
  duration      integer     NOT NULL DEFAULT 50, -- minutos
  observation   text        NOT NULL DEFAULT '',
  attendance    text        NOT NULL DEFAULT 'Presente', -- Presente | Falta | Reposição

  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_records_tenant
  ON public.service_records (tenant_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_service_records_student
  ON public.service_records (student_id);

ALTER TABLE public.service_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_records_tenant_access" ON public.service_records;

CREATE POLICY "service_records_tenant_access" ON public.service_records
  FOR ALL TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

-- ============================================================
-- FIM migration_missing_tables.sql
-- ============================================================
