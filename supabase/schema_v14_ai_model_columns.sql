-- ============================================================
-- Schema v14 — Colunas de rastreamento de modelo de IA
-- Executar após schema_v13_auth_flow.sql
--
-- O que faz:
--   1. Adiciona `model_used` e `output_type` em generated_activities
--   2. Adiciona `model_used` e `ai_credits_used` em student_profiles
--      (para rastrear quando o parecer foi gerado por IA)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. generated_activities — modelo e tipo de saída
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.generated_activities
  ADD COLUMN IF NOT EXISTS model_used   TEXT,
  ADD COLUMN IF NOT EXISTS output_type  TEXT NOT NULL DEFAULT 'text'
    CHECK (output_type IN ('text', 'text_image'));

COMMENT ON COLUMN public.generated_activities.model_used  IS 'ID do modelo de IA utilizado (ex: texto_apenas, nano_banana_pro, chatgpt_imagem)';
COMMENT ON COLUMN public.generated_activities.output_type IS 'Tipo de saída: text = somente texto; text_image = texto + imagem';

-- ─────────────────────────────────────────────────────────────
-- 2. student_profiles — modelo usado para gerar parecer IA
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS ai_model_used    TEXT,
  ADD COLUMN IF NOT EXISTS ai_credits_used  INT DEFAULT 0;

COMMENT ON COLUMN public.student_profiles.ai_model_used   IS 'Modelo de IA usado para gerar o parecer (ex: economico, padrao, premium)';
COMMENT ON COLUMN public.student_profiles.ai_credits_used IS 'Créditos consumidos na geração do parecer por IA';
