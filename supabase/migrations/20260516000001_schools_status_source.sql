-- Sprint 3: Add status and source columns to schools table
-- status: 'active' | 'incomplete'  (incomplete = cadastrado via formulário de aluno)
-- source: 'manual' | 'student_form' | 'import'
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

-- SQL de validação: escolas cadastradas automaticamente via formulário de aluno
-- SELECT id, name, status, source, active, created_at
--   FROM public.schools
--  WHERE source = 'student_form'
--  ORDER BY created_at DESC;
