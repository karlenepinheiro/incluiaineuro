-- =============================================================================
-- schema_v12_prior_knowledge.sql
--
-- Adiciona a coluna prior_knowledge (JSONB) à tabela students.
-- Armazena o Perfil Pedagógico Inicial registrado pelo professor no cadastro.
--
-- Estrutura do JSON armazenado (espelha PriorKnowledgeProfile em types.ts):
-- {
--   "leitura_score": 3,        -- 1-5 (1=Muito inicial … 5=Avançado para a etapa)
--   "leitura_notes": "...",
--   "escrita_score": 2,
--   "escrita_notes": "...",
--   "entendimento_score": 3,
--   "entendimento_notes": "...",
--   "autonomia_score": 2,
--   "autonomia_notes": "...",
--   "atencao_score": 3,
--   "atencao_notes": "...",
--   "raciocinio_score": 2,
--   "raciocinio_notes": "...",
--   "observacoes_pedagogicas": "Texto livre do professor...",
--   "registeredAt": "2026-04-23T10:00:00.000Z",
--   "registeredBy": "Karla Santos"
-- }
--
-- Instrução: rodar após schema.sql e demais migrations existentes.
-- =============================================================================

-- 1. Adiciona a coluna (safe — não afeta registros existentes)
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS prior_knowledge JSONB DEFAULT NULL;

-- 2. Comentário da coluna para documentação do banco
COMMENT ON COLUMN students.prior_knowledge IS
  'Perfil Pedagógico Inicial registrado pelo professor no cadastro do aluno. '
  'Estrutura: {leitura_score, leitura_notes, escrita_score, escrita_notes, '
  'entendimento_score, entendimento_notes, autonomia_score, autonomia_notes, '
  'atencao_score, atencao_notes, raciocinio_score, raciocinio_notes, '
  'observacoes_pedagogicas, registeredAt, registeredBy}. '
  'Escala 1-5: 1=Muito inicial, 2=Inicial, 3=Em desenvolvimento, '
  '4=Adequado para a etapa, 5=Avançado para a etapa.';

-- 3. Índice GIN para buscas dentro do JSONB (opcional, para relatórios futuros)
CREATE INDEX IF NOT EXISTS idx_students_prior_knowledge
  ON students USING GIN (prior_knowledge)
  WHERE prior_knowledge IS NOT NULL;

-- =============================================================================
-- NOTA: RLS não precisa ser alterada — a coluna segue as mesmas políticas
-- de acesso de row-level security já definidas para a tabela students.
-- =============================================================================
