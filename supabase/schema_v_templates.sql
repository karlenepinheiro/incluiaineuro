-- ============================================================
-- schema_v_templates.sql
-- Modelos Personalizados da Escola (Custom DOCX Templates)
-- Rodar no SQL Editor do Supabase após schema_v3.sql
-- ============================================================

-- 1. TABELA: school_templates
-- Guarda metadados dos modelos enviados por cada tenant
CREATE TABLE IF NOT EXISTS school_templates (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by            uuid REFERENCES users(id) ON DELETE SET NULL,

  -- Identificação
  name                  text NOT NULL,                -- nome amigável dado pelo usuário
  original_filename     text NOT NULL,                -- nome original do .docx
  description           text,

  -- Classificação pela IA
  document_type         text CHECK (document_type IN ('PEI','PAEE','PDI','estudo_de_caso','outro')),
  ai_confidence         float DEFAULT 0,              -- 0–1, confiança da classificação
  ai_reasoning          text,                         -- explicação da IA

  -- Status do processamento
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','processing','ready','error')),
  error_message         text,

  -- Paths no Supabase Storage (bucket: school-templates)
  storage_path_original text,                         -- arquivo bruto enviado
  storage_path_prepared text,                         -- .docx com tags injetadas

  -- Tags identificadas/injetadas pela IA
  tags_injected         jsonb DEFAULT '[]'::jsonb,    -- [{tag, label, found}]
  replacements_map      jsonb DEFAULT '[]'::jsonb,    -- [{find, tag, label}]

  -- Controle
  is_active             boolean NOT NULL DEFAULT true,
  times_used            integer NOT NULL DEFAULT 0,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_school_templates_tenant    ON school_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_school_templates_type      ON school_templates(document_type);
CREATE INDEX IF NOT EXISTS idx_school_templates_status    ON school_templates(status);
CREATE INDEX IF NOT EXISTS idx_school_templates_active    ON school_templates(is_active);

-- Trigger: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION update_school_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_school_templates_updated_at ON school_templates;
CREATE TRIGGER trg_school_templates_updated_at
  BEFORE UPDATE ON school_templates
  FOR EACH ROW EXECUTE FUNCTION update_school_templates_updated_at();

-- 2. RLS (Row Level Security)
ALTER TABLE school_templates ENABLE ROW LEVEL SECURITY;

-- Cada tenant só vê/modifica seus próprios modelos
CREATE POLICY "tenant_templates_select" ON school_templates
  FOR SELECT USING (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "tenant_templates_insert" ON school_templates
  FOR INSERT WITH CHECK (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "tenant_templates_update" ON school_templates
  FOR UPDATE USING (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "tenant_templates_delete" ON school_templates
  FOR DELETE USING (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1
    )
  );

-- 3. STORAGE BUCKET (executar separado no dashboard ou via API)
-- Criar bucket "school-templates" (privado, max 20MB por arquivo)
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'school-templates',
--   'school-templates',
--   false,
--   20971520,  -- 20 MB
--   ARRAY[
--     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
--     'application/msword',
--     'application/octet-stream'
--   ]
-- )
-- ON CONFLICT (id) DO NOTHING;

-- Storage RLS: cada tenant só acessa sua pasta
-- CREATE POLICY "tenant_storage_select" ON storage.objects FOR SELECT
--   USING (bucket_id = 'school-templates' AND auth.uid()::text = (storage.foldername(name))[1]);
-- CREATE POLICY "tenant_storage_insert" ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'school-templates' AND auth.uid()::text = (storage.foldername(name))[1]);
-- CREATE POLICY "tenant_storage_delete" ON storage.objects FOR DELETE
--   USING (bucket_id = 'school-templates' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- INSTRUÇÕES PÓS-MIGRATION:
--
-- 1. Crie o bucket "school-templates" no painel Supabase:
--    Storage → New Bucket → nome: school-templates → Private
--
-- 2. Em Storage → Policies, adicione políticas para esse bucket
--    permitindo SELECT/INSERT/DELETE para authenticated users
--    no caminho {tenant_id}/{user_id}/*
-- ============================================================
