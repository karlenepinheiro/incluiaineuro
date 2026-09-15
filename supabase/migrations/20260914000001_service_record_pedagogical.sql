-- Registro de Atendimento: extensão aditiva, sem alterar registros ou políticas.
-- Não aplicar em produção sem autorização.
ALTER TABLE public.service_records
  ADD COLUMN IF NOT EXISTS daily_checklist jsonb,
  ADD COLUMN IF NOT EXISTS pedagogical jsonb;

COMMENT ON COLUMN public.service_records.pedagogical IS
  'Campos pedagógicos opcionais; id, student_id e updated_at permitem futura integração ao versionamento documental.';
