-- schema_v31_observation_origin.sql
-- Sprint IA-3: Separar checklists por origem e tipo
-- Adiciona colunas de proveniência em observation_forms.
-- Seguro: ADD COLUMN IF NOT EXISTS — não destrói dados existentes.

-- ── Novas colunas ──────────────────────────────────────────────────────────────

ALTER TABLE public.observation_forms
  ADD COLUMN IF NOT EXISTS origin        TEXT    DEFAULT 'digital',
  ADD COLUMN IF NOT EXISTS confidence    NUMERIC,
  ADD COLUMN IF NOT EXISTS ai_summary    TEXT,
  ADD COLUMN IF NOT EXISTS source_file_url TEXT;

-- ── Índice para filtragem por origem ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_obs_forms_origin ON public.observation_forms (origin);

-- ── Normalização de dados existentes ─────────────────────────────────────────
-- Registros digitais (sem origin no fields_data) ficam como 'digital' pelo DEFAULT.
-- Registros de upload: origin já está em fields_data; backfill seguro abaixo.

UPDATE public.observation_forms
  SET origin = fields_data->>'origin'
WHERE origin IS NULL
  AND fields_data ? 'origin'
  AND fields_data->>'origin' IS NOT NULL;

-- Confidence — backfill do JSONB onde disponível
UPDATE public.observation_forms
  SET confidence = (fields_data->>'confidence')::NUMERIC
WHERE confidence IS NULL
  AND fields_data ? 'confidence'
  AND fields_data->>'confidence' IS NOT NULL;

-- source_file_url — backfill a partir de originalFileUrl no JSONB
UPDATE public.observation_forms
  SET source_file_url = fields_data->>'originalFileUrl'
WHERE source_file_url IS NULL
  AND fields_data ? 'originalFileUrl'
  AND fields_data->>'originalFileUrl' IS NOT NULL;
