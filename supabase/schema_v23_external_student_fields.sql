-- schema_v23_external_student_fields.sql
-- Adiciona colunas de aluno externo que existem no TypeScript mas estavam ausentes no DB.
-- Compatível com o schema de produção (full_name, school_year, is_external, external_school_name).

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS external_school_city     TEXT,
  ADD COLUMN IF NOT EXISTS external_referral_professional TEXT,
  ADD COLUMN IF NOT EXISTS external_referral_source TEXT;

COMMENT ON COLUMN public.students.external_school_city
  IS 'Cidade da escola de origem (apenas quando is_external = true)';
COMMENT ON COLUMN public.students.external_referral_professional
  IS 'Profissional responsável pelo encaminhamento (apenas quando is_external = true)';
COMMENT ON COLUMN public.students.external_referral_source
  IS 'Origem do encaminhamento: Escola | Clínica | UBS | Família | Prefeitura | Outro';
