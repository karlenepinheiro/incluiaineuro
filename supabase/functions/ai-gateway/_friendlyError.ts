/**
 * _friendlyError.ts — Tradução do erro interno (provider / validação / parse)
 * na mensagem exibida ao cliente pelo ai-gateway.
 *
 * Extraído de `index.ts` em 06/09/2026 (correção A-1) para teste unitário
 * isolado — mesmo padrão de `_usability.ts` / `_resultValidation.ts` /
 * `_imagesValidation.ts`. Função pura, sem Deno / imports remotos.
 *
 * ORDEM IMPORTA (correção A-1): erros de configuração, timeout e de
 * validação/uso do resultado são reconhecidos ANTES de qualquer análise de
 * quota (429) / permissão (403). O detalhe de um erro de validação pode
 * conter dígitos que NÃO são status HTTP:
 *   - "UNUSABLE_RESULT: SUSPICIOUSLY_SHORT [len=429]"
 *   - "VALIDATION_ERROR: JSON parse error at position 4291"
 *   - "... at position 403 ..."
 * Antes desta correção o `raw.includes('429')` / `raw.includes('403')`
 * casava com esses casos e mostrava "Limite de uso da IA atingido" ou
 * "Sem permissao para acessar o modelo" sem que houvesse quota/permissão
 * envolvida.
 *
 * NÃO faz parte deste patch (ver auditoria A-3 / A-6 / O-1): contrato de erro
 * tipado, mudança de status HTTP, errorCode estruturado, classificação de
 * `RESOURCE_EXHAUSTED`. Nenhuma mensagem existente foi alterada — só a ordem
 * de avaliação e um guarda contra offsets de parse.
 */

/**
 * "len=429", "position 4291", "position 403" são offsets de parse/tamanho de
 * resposta, não códigos HTTP — nunca devem disparar mensagem de quota/permissão.
 */
export function looksLikeParseOffset(raw: string): boolean {
  return /\blen\s*=\s*\d+|position\s+\d+/i.test(raw);
}

export function friendlyError(raw: string): string {
  if (raw.includes('CONFIG_GEMINI')) return 'Servico de texto IA nao configurado. Contate o suporte.';
  if (raw.includes('CONFIG_VERTEX_IMAGE')) return 'Servico de imagem IA nao configurado. Contate o suporte.';
  if (raw.includes('AbortError') || raw.includes('aborted') || raw.includes('TIMEOUT_EXCEEDED')) {
    return 'Tempo de resposta da IA excedido. Tente novamente.';
  }
  if (raw.includes('VALIDATION_ERROR')) return 'A IA gerou um documento com formato invalido. Tente novamente.';
  if (raw.includes('UNUSABLE_RESULT')) return 'Nao foi possivel identificar dados utilizaveis no documento. Nenhum credito foi consumido.';

  const parseOffset = looksLikeParseOffset(raw);

  if (!parseOffset && (raw.includes('429') || raw.includes('QUOTA'))) {
    return 'Limite de uso da IA atingido. Aguarde alguns instantes.';
  }
  if (!parseOffset && raw.includes('403')) {
    return 'Sem permissao para acessar o modelo de IA. Verifique a service account.';
  }
  return 'Ocorreu um erro ao processar sua solicitacao. Tente novamente.';
}
