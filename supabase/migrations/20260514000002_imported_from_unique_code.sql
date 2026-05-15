-- migration: 20260514000002_imported_from_unique_code.sql
-- Adiciona coluna de rastreamento do código de origem para cópias cross-tenant.
-- Complementa 20260514000001_student_cross_tenant_import.sql.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS imported_from_unique_code TEXT;

COMMENT ON COLUMN public.students.imported_from_unique_code
  IS 'Código único do aluno original (outra escola) preservado como referência de origem';
