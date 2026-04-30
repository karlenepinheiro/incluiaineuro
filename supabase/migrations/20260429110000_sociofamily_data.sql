-- =============================================================================
-- Migration: Dados Sociofamiliares e Responsáveis
-- Tabela: students
-- Data: 2026-04-29
--
-- Adiciona coluna JSONB sociofamily_data (estrutura completa de responsáveis,
-- benefícios e contexto familiar) e 4 colunas text indexáveis para contatos
-- principais, facilitando buscas sem parsing de JSON.
--
-- LGPD: dados sensíveis — uso restrito a profissionais com acesso ao tenant.
--       Não expor em PDFs públicos sem consentimento explícito.
-- =============================================================================

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS sociofamily_data        JSONB    DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS primary_contact_name    TEXT,
  ADD COLUMN IF NOT EXISTS primary_contact_phone   TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;

COMMENT ON COLUMN students.sociofamily_data IS
  'Dados sociofamiliares: responsáveis (2), benefícios sociais, estado familiar. '
  'Estrutura: { benefits, familyStatus, guardian1, guardian2 }. '
  'LGPD: uso interno — não incluir em PDFs públicos sem consentimento.';

COMMENT ON COLUMN students.primary_contact_name IS
  'Nome do responsável/contato principal para contato escolar (espelha familyStatus.mainGuardianName).';

COMMENT ON COLUMN students.primary_contact_phone IS
  'Telefone principal para contato da escola (espelha familyStatus.schoolPrimaryPhone).';

COMMENT ON COLUMN students.emergency_contact_name IS
  'Nome do contato de emergência principal.';

COMMENT ON COLUMN students.emergency_contact_phone IS
  'Telefone do contato de emergência principal.';
