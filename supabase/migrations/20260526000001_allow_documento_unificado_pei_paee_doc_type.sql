-- DOC-IA-10B: permitir Documento Unificado PEI + PAEE como doc_type valido.
-- Seguro: nao altera dados, colunas, RLS ou policies.

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_doc_type_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_doc_type_check
  CHECK (doc_type IN (
    'ESTUDO_CASO',
    'PAEE',
    'PEI',
    'PDI',
    'RELATORIO_SIMPLES',
    'RELATORIO_COMPLETO',
    'RELATORIO_TECNICO',
    'PLANO_ACAO_AEE',
    'RELATORIO_INSS',
    'DOCUMENTO_UNIFICADO_PEI_PAEE'
  ));
