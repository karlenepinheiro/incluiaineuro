// config/documentWorkspaceFlags.ts
// ─────────────────────────────────────────────────────────────────────────────
// Feature flag da FASE 1 do novo DocumentWorkspace (visualização A4 profissional
// de documentos formais). Ver auditoria em auditorias/ para o contexto completo.
//
// ESCOPO DESTA FLAG (Fase 1):
//   Controla exclusivamente a exibição do novo `DocumentWorkspace` (painel lateral
//   + viewport A4) no modo de VISUALIZAÇÃO (!isEditing) do documento PAEE dentro de
//   `DocumentBuilder.tsx`. Nenhum outro tipo de documento (Estudo de Caso, PEI, PDI,
//   Plano Unificado, Ficha, Plano de Ação AEE, Relatórios) e nenhum outro fluxo
//   (edição, geração por IA, exportação PDF/Word, IncluiLAB) é afetado por esta
//   flag, ligada ou desligada.
//
// COMO HABILITAR (ambiente local):
//   1. Adicione ao seu .env ou .env.local:
//        VITE_DOCUMENT_WORKSPACE_ENABLED=true
//   2. Reinicie o servidor de desenvolvimento (o Vite lê variáveis VITE_* apenas
//      na inicialização do processo).
//
// COMO DESABILITAR (padrão de fábrica):
//   - Remova a variável do .env, ou defina VITE_DOCUMENT_WORKSPACE_ENABLED=false,
//     ou simplesmente não a declare. Qualquer valor diferente de "true" mantém a
//     experiência atual (comportamento anterior a esta fase) intacta.
//
// Não depende de banco de dados, Supabase ou tabela de configuração — é resolvida
// inteiramente em build/runtime do frontend, como o padrão já usado por DEMO_MODE
// em src/services/supabase.ts.

/**
 * Interpreta o valor bruto da variável de ambiente. Função pura e exportada
 * separadamente apenas para permitir teste unitário sem depender de
 * `import.meta.env` (que só existe em runtime do Vite). Qualquer valor que não
 * seja exatamente a string "true" resulta em `false` — fail-safe por padrão.
 */
export function resolveDocumentWorkspaceEnabled(raw: string | undefined): boolean {
  return raw === 'true';
}

const rawValue = (import.meta as any).env?.VITE_DOCUMENT_WORKSPACE_ENABLED as string | undefined;

/** Flag mestre da Fase 1 do DocumentWorkspace. Desabilitada por padrão (fail-safe). */
export const DOCUMENT_WORKSPACE_ENABLED = resolveDocumentWorkspaceEnabled(rawValue);

/**
 * Predicado puro que decide se o novo DocumentWorkspace deve substituir a
 * visualização atual. Extraído do DocumentBuilder apenas para poder ser
 * testado sem renderizar o componente (o projeto não usa Testing Library /
 * jsdom hoje). Mesma regra usada em DocumentBuilder.tsx: somente PAEE, somente
 * fora do modo de edição, somente com a flag habilitada.
 *
 * MANTIDO para compatibilidade — o piloto original era exclusivo do PAEE. A
 * expansão para os demais documentos formais usa
 * `shouldShowFormalDocumentWorkspace` (abaixo). `shouldShowPaeeWorkspace`
 * continua sendo o caso particular "docType === 'PAEE'".
 */
export function shouldShowPaeeWorkspace(
  flagEnabled: boolean,
  docType: unknown,
  isEditing: boolean,
): boolean {
  return flagEnabled && docType === 'PAEE' && !isEditing;
}

/**
 * Documentos formais que hoje possuem, ao mesmo tempo:
 *   - renderer de PDF canônico (FormalPdfPreview + PDFGenerator.generateFromSections);
 *   - renderer de Word canônico (wordExportService.exportDocumentToWord).
 *
 * São exatamente os que podem usar o DocumentWorkspace completo (Baixar PDF +
 * Baixar Word .docx + Abrir no Google Docs + Imprimir), porque o "Abrir no
 * Google Docs" reaproveita, sem duplicar nada, o MESMO Blob DOCX do botão
 * "Baixar Word (.docx)".
 *
 * Os valores são os `DocumentType` (enum em src/types.ts) já como string —
 * este arquivo é puro/testável e não importa o enum de propósito.
 */
export const FORMAL_WORKSPACE_DOC_TYPES: readonly string[] = [
  'Estudo de Caso',
  'PEI',
  'PAEE',
  'PDI',
  'Documento Unificado PEI + PAEE',
];

/**
 * Predicado puro que decide se o DocumentWorkspace deve envolver a visualização
 * de um documento formal. Generaliza `shouldShowPaeeWorkspace` para todos os
 * documentos que já têm renderer Word canônico — mesma regra de sempre: somente
 * fora do modo de edição, somente com a flag habilitada, e somente para um tipo
 * conhecido de documento formal (nunca Ficha, Plano de Ação, Relatório etc.,
 * que não têm Word canônico e ficam na Fase 2).
 */
export function shouldShowFormalDocumentWorkspace(
  flagEnabled: boolean,
  docType: unknown,
  isEditing: boolean,
): boolean {
  return (
    flagEnabled &&
    !isEditing &&
    typeof docType === 'string' &&
    FORMAL_WORKSPACE_DOC_TYPES.includes(docType)
  );
}
