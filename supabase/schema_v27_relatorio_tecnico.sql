-- schema_v27_relatorio_tecnico.sql
-- Expande o CHECK constraint de documents.doc_type para aceitar RELATORIO_TECNICO.
-- Seguro: idempotente — pode rodar múltiplas vezes sem efeitos colaterais.
-- Tipos existentes (ESTUDO_CASO, PAEE, PEI, PDI) são preservados intactos.

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_doc_type_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_doc_type_check
  CHECK (doc_type IN ('ESTUDO_CASO', 'PAEE', 'PEI', 'PDI', 'RELATORIO_TECNICO'));