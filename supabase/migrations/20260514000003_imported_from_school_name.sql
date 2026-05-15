-- migration: 20260514000003_imported_from_school_name.sql
-- Adiciona coluna para preservar o nome da escola de origem em cópias cross-tenant.
-- Complementa 20260514000001_student_cross_tenant_import.sql.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS imported_from_school_name TEXT;

COMMENT ON COLUMN public.students.imported_from_school_name
  IS 'Nome da escola de origem (outro tenant) preservado como referência; school_name deve conter a escola atual do aluno';
