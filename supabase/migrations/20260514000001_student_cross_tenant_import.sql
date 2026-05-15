-- migration: 20260514000001_student_cross_tenant_import.sql
-- Adiciona colunas de rastreamento para cópias locais de alunos importados de outra escola.
-- Regra de produto: ao editar um aluno vinculado de outra escola, o sistema cria uma cópia
-- local com tenant_id da escola atual — sem modificar o registro original.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS imported_from_student_id UUID,
  ADD COLUMN IF NOT EXISTS imported_from_tenant_id  UUID,
  ADD COLUMN IF NOT EXISTS imported_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by              UUID;

COMMENT ON COLUMN public.students.imported_from_student_id IS 'ID do aluno original (outra escola) do qual esta linha é cópia local';
COMMENT ON COLUMN public.students.imported_from_tenant_id  IS 'tenant_id da escola de origem';
COMMENT ON COLUMN public.students.imported_at              IS 'Data/hora em que a cópia local foi criada';
COMMENT ON COLUMN public.students.imported_by              IS 'Usuário que iniciou a cópia local';
