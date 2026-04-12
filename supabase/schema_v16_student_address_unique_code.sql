-- schema_v16_student_address_unique_code.sql
-- Adiciona código único do aluno e endereço completo à tabela students.
-- Executar após schema.sql (e versões anteriores já aplicadas).

-- ── Código único do aluno ────────────────────────────────────────────────────
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS unique_code TEXT UNIQUE;

-- ── Endereço completo ────────────────────────────────────────────────────────
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS zipcode       TEXT,
  ADD COLUMN IF NOT EXISTS street        TEXT,
  ADD COLUMN IF NOT EXISTS street_number TEXT,
  ADD COLUMN IF NOT EXISTS complement    TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood  TEXT,
  ADD COLUMN IF NOT EXISTS city          TEXT,
  ADD COLUMN IF NOT EXISTS state         CHAR(2);

-- ── Índice para busca futura por código único ─────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS students_unique_code_idx
  ON public.students (unique_code)
  WHERE unique_code IS NOT NULL;

-- ── Preencher unique_code para alunos existentes (retroativo) ────────────────
UPDATE public.students
SET unique_code = 'INC-' || upper(substring(md5(id::text) FROM 1 FOR 4)) || '-' || upper(substring(md5(id::text) FROM 5 FOR 4))
WHERE unique_code IS NULL;
