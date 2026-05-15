-- migration: 20260515000001_student_documents_persistence_fix.sql
-- Garante persistencia real de laudos/documentos anexados ao aluno.
-- Cada anexo pertence ao tenant atual e ao student_id local.

CREATE TABLE IF NOT EXISTS public.student_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id    UUID REFERENCES public.students(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'Outro',
  file_url      TEXT,
  file_path     TEXT,
  file_size     BIGINT,
  mime_type     TEXT,
  uploaded_by   TEXT,
  notes         TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.student_documents
  ADD COLUMN IF NOT EXISTS tenant_id     UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS student_id    UUID REFERENCES public.students(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS name          TEXT,
  ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'Outro',
  ADD COLUMN IF NOT EXISTS file_url      TEXT,
  ADD COLUMN IF NOT EXISTS file_path     TEXT,
  ADD COLUMN IF NOT EXISTS file_size     BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type     TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_by   TEXT,
  ADD COLUMN IF NOT EXISTS notes         TEXT,
  ADD COLUMN IF NOT EXISTS metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.student_documents
  ALTER COLUMN file_size TYPE BIGINT USING file_size::bigint,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

UPDATE public.student_documents sd
SET tenant_id = s.tenant_id
FROM public.students s
WHERE sd.student_id = s.id
  AND sd.tenant_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.student_documents
    WHERE tenant_id IS NULL OR student_id IS NULL OR name IS NULL
  ) THEN
    ALTER TABLE public.student_documents
      ALTER COLUMN tenant_id SET NOT NULL,
      ALTER COLUMN student_id SET NOT NULL,
      ALTER COLUMN name SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_student_docs_student ON public.student_documents(student_id);
CREATE INDEX IF NOT EXISTS idx_student_docs_tenant ON public.student_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_student_docs_type ON public.student_documents(document_type);

CREATE OR REPLACE FUNCTION public.set_student_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_student_documents_updated_at ON public.student_documents;
CREATE TRIGGER trg_student_documents_updated_at
BEFORE UPDATE ON public.student_documents
FOR EACH ROW
EXECUTE FUNCTION public.set_student_documents_updated_at();

ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_docs_select" ON public.student_documents;
DROP POLICY IF EXISTS "student_docs_insert" ON public.student_documents;
DROP POLICY IF EXISTS "student_docs_update" ON public.student_documents;
DROP POLICY IF EXISTS "student_docs_delete" ON public.student_documents;
DROP POLICY IF EXISTS "student_documents_tenant" ON public.student_documents;

CREATE POLICY "student_docs_select" ON public.student_documents
  FOR SELECT TO authenticated
  USING (tenant_id = public.my_tenant_id());

CREATE POLICY "student_docs_insert" ON public.student_documents
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.my_tenant_id());

CREATE POLICY "student_docs_update" ON public.student_documents
  FOR UPDATE TO authenticated
  USING (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

CREATE POLICY "student_docs_delete" ON public.student_documents
  FOR DELETE TO authenticated
  USING (tenant_id = public.my_tenant_id());

GRANT ALL ON TABLE public.student_documents TO authenticated, service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'laudos',
  'laudos',
  true,
  20971520,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "laudos_read" ON storage.objects;
DROP POLICY IF EXISTS "laudos_insert" ON storage.objects;
DROP POLICY IF EXISTS "laudos_update" ON storage.objects;
DROP POLICY IF EXISTS "laudos_delete" ON storage.objects;

CREATE POLICY "laudos_read"
ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'laudos');

CREATE POLICY "laudos_insert"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'laudos');

CREATE POLICY "laudos_update"
ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'laudos')
WITH CHECK (bucket_id = 'laudos');

CREATE POLICY "laudos_delete"
ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'laudos');
