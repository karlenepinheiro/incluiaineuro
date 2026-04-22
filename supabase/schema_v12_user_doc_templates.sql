-- =============================================================================
-- schema_v12_user_doc_templates.sql
-- Modelos Personalizados de Documentos — Fase 1
--
-- Escopo inicial: ESTUDO_CASO e PEI
-- Cada tenant pode ter múltiplos modelos por tipo.
-- Apenas 1 modelo pode ser padrão (is_default=true) por tipo por tenant.
-- Templates do sistema são imutáveis e vivem em código (systemTemplates.ts).
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_document_templates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by      uuid        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,

  -- Identidade
  name            text        NOT NULL,
  description     text,

  -- Tipo de documento (escopo inicial: ESTUDO_CASO e PEI)
  document_type   text        NOT NULL
                  CHECK (document_type IN ('ESTUDO_CASO', 'PEI')),

  -- Origem explícita do modelo (Ajuste 4)
  -- 'system' = derivado do template padrão do sistema
  -- 'user'   = criado/modificado livremente pelo usuário
  source          text        NOT NULL DEFAULT 'user'
                  CHECK (source IN ('system', 'user')),

  -- UUID do template que serviu de base (se derivado de outro user template)
  base_template_id uuid       REFERENCES user_document_templates(id) ON DELETE SET NULL,

  -- Estrutura reutilizável do documento (TemplateData JSON)
  -- Contém: sections[], metadata — NÃO contém dados de aluno
  template_data   jsonb       NOT NULL,

  -- Versionamento simples
  version         integer     NOT NULL DEFAULT 1,

  -- Flags de controle
  is_default      boolean     NOT NULL DEFAULT false,
  is_active       boolean     NOT NULL DEFAULT true,

  -- Estatísticas de uso
  times_used      integer     NOT NULL DEFAULT 0,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Constraint: apenas 1 modelo padrão ativo por tipo por tenant
-- Enforçado via UNIQUE INDEX parcial (mais eficiente que trigger/check)
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_udt_one_default_per_type
  ON user_document_templates (tenant_id, document_type)
  WHERE is_default = true AND is_active = true;

-- Índices de consulta
CREATE INDEX IF NOT EXISTS idx_udt_tenant      ON user_document_templates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_udt_type        ON user_document_templates (tenant_id, document_type);
CREATE INDEX IF NOT EXISTS idx_udt_active      ON user_document_templates (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_udt_default     ON user_document_templates (tenant_id, document_type, is_default);

-- -----------------------------------------------------------------------------
-- Trigger: atualiza updated_at automaticamente
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_user_doc_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_udt_updated_at ON user_document_templates;
CREATE TRIGGER trg_udt_updated_at
  BEFORE UPDATE ON user_document_templates
  FOR EACH ROW EXECUTE FUNCTION update_user_doc_templates_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- Cada tenant só vê e modifica seus próprios modelos.
-- -----------------------------------------------------------------------------
ALTER TABLE user_document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "udt_tenant_select" ON user_document_templates
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "udt_tenant_insert" ON user_document_templates
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1)
  );

-- Usuário só atualiza seus próprios modelos (não pode alterar is_system de outros)
CREATE POLICY "udt_tenant_update" ON user_document_templates
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "udt_tenant_delete" ON user_document_templates
  FOR DELETE USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1)
  );
