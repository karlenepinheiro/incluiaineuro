/**
 * _usability.ts — Sprint "consumo no momento certo" (26/08/2026)
 *
 * Verifica se uma resposta de IA já validada como JSON (por `validateAndRepair`,
 * em `_aiUtils.ts`) é "utilizável" o suficiente para CONFIRMAR o consumo de
 * créditos — em vez de apenas "tecnicamente válida". Uma resposta pode ser um
 * JSON perfeitamente bem formado e ainda assim não ter nenhum uso real (ex.:
 * `{"students": []}` — nenhum dado extraído; ou baixa confiança demais para
 * abrir uma revisão confiável).
 *
 * Usado pelo Gateway (`index.ts`) para decidir, na MESMA requisição que já
 * reservou e chamou o provider, entre CONFIRMAR (commit) ou LIBERAR (release)
 * o crédito — eliminando a janela de falha entre "provider respondeu" e "uma
 * segunda chamada do frontend confirma depois" (fechamento de aba, queda de
 * rede, reload no meio do caminho deixavam de importar).
 *
 * Função pura, sem dependência do runtime Deno nem de imports remotos —
 * testável diretamente em qualquer ambiente (ver
 * src/__tests__/aiGatewayUsability.test.ts).
 */

export interface UsabilityCheckConfig {
  /** Nome da chave, no JSON já validado, que deve conter um array não vazio. */
  arrayField: string;
  /** Quando informado (junto com confidenceField), exige confiança média mínima nos itens do array. */
  minAverageConfidence?: number;
  /** Nome do campo numérico de confiança dentro de cada item do array. */
  confidenceField?: string;
}

export interface UsabilityResult {
  usable: boolean;
  reason?: 'EMPTY_RESULT' | 'LOW_CONFIDENCE';
}

export function checkResultUsability(
  parsedDocument: unknown,
  config: UsabilityCheckConfig | undefined,
): UsabilityResult {
  // Sem usabilityCheck configurado: comportamento inalterado para todo o
  // resto do produto — qualquer JSON validado é considerado utilizável.
  if (!config) return { usable: true };

  const arr = (parsedDocument as Record<string, unknown> | null)?.[config.arrayField];
  if (!Array.isArray(arr) || arr.length === 0) {
    return { usable: false, reason: 'EMPTY_RESULT' };
  }

  if (config.minAverageConfidence != null && config.confidenceField) {
    const field = config.confidenceField;
    const values = arr
      .map((item) => Number((item as Record<string, unknown> | null)?.[field]))
      .filter((v): v is number => Number.isFinite(v));
    const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    if (avg < config.minAverageConfidence) {
      return { usable: false, reason: 'LOW_CONFIDENCE' };
    }
  }

  return { usable: true };
}
