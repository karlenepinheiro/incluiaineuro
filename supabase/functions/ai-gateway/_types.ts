/**
 * _types.ts — Contratos compartilhados de Provider de IA (Sprint Gateway 1 · Etapa 3)
 *
 * ESTE ARQUIVO É PURAMENTE ADITIVO E NÃO ESTÁ CONECTADO A `index.ts` AINDA.
 * Nenhuma função aqui é chamada em produção. Ele só declara os tipos que as
 * próximas etapas do Sprint Gateway 1 vão usar:
 *
 *   Etapa 4 — envolver _vertex.ts (Gemini + Vertex Imagen) num adapter que
 *             implementa `AIProvider`, sem alterar seu comportamento.
 *   Etapa 5-7 — criar _openai.ts implementando o mesmo `AIProvider`.
 *   Etapa 8+ — _router.ts passa a escolher qual `AIProvider` usar por
 *              task/requestType, com fallback controlado.
 *
 * Convenção de nome de provider ('gemini' | 'openai') alinhada com o campo
 * `provider` já usado no frontend em AI_MODEL_CONFIGS (src/services/aiService.ts).
 * 'gemini' cobre tanto texto/JSON via Gemini API quanto imagem via Vertex AI
 * Imagen — exatamente como _vertex.ts já faz hoje num único arquivo.
 */

// ─── Identidade de provider ───────────────────────────────────────────────────

export type AIProviderName = 'gemini' | 'openai';

/**
 * Task normalizada no nível do Provider (diferente da `task` do payload do
 * Gateway, que também aceita 'document'). Hoje, em index.ts, 'document' já é
 * tratado como 'json' na hora de escolher a função de geração — essa mesma
 * normalização deve ser preservada quando o Router for conectado (Etapa 4+).
 */
export type ProviderTask = 'text' | 'json' | 'image';

// ─── Entrada/saída de texto e JSON ────────────────────────────────────────────

export interface AIProviderTextInput {
  prompt: string;
  /** Data URL (ex: "data:image/jpeg;base64,...") — usado em prompts multimodais. */
  imageBase64?: string;
  /**
   * Leitura multipágina (27/08/2026): várias páginas do MESMO documento
   * (data URLs, em ordem), enviadas numa única chamada multimodal — extensão
   * aditiva e retrocompatível de `imageBase64`. Quando presente, os adapters
   * de provider devem preferir `images` a `imageBase64` (ver
   * _geminiProvider.ts/_openaiProvider.ts); quando ausente, o comportamento
   * de `imageBase64` é 100% inalterado.
   */
  images?: string[];
  /**
   * Correção de 27/08/2026 (achado da validação de numeração): números de
   * página REAIS (1-indexado, mesmo tamanho de `images`) do documento
   * original — evita que páginas do meio descartadas (ex.: em branco) façam
   * o rótulo "Página N" enviado ao modelo renumerar as páginas restantes por
   * posição. Ausente → adapters usam a posição no array (`idx + 1`), o
   * mesmo comportamento de antes desta correção.
   */
  pageNumbers?: number[];
}

export interface AIProviderUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AIProviderTextResult {
  text: string;
  provider: AIProviderName;
  /** Nome do modelo real usado (ex: "gemini-2.5-flash", "gpt-4o-mini"). */
  model: string;
  /** Preenchido quando o provider expõe contagem de tokens (nem sempre disponível). */
  usage?: AIProviderUsage;
}

// ─── Entrada/saída de imagem ──────────────────────────────────────────────────

export interface AIProviderImageInput {
  prompt: string;
}

export interface AIProviderImageResult {
  /** Sempre um data URL (ex: "data:image/png;base64,..."), igual ao contrato atual. */
  base64DataUrl: string;
  provider: AIProviderName;
  model: string;
}

// ─── Erros normalizados (base para fallback controlado — Etapa 12) ───────────

/**
 * Classificação de erro usada para decidir fallback entre providers.
 * NENHUMA lógica de fallback é implementada nesta etapa — este tipo só
 * existe para as próximas etapas não precisarem redefinir a taxonomia.
 *
 * Mapeamento pretendido (a ser aplicado quando o fallback for implementado):
 *   retryable=true  → timeout, rate_limit, server_error, network, empty_response
 *   retryable=false → invalid_request, auth, unknown
 */
export type AIProviderErrorKind =
  | 'timeout'
  | 'rate_limit'
  | 'server_error'
  | 'network'
  | 'empty_response'
  | 'invalid_request'
  | 'provider_unavailable'
  | 'invalid_response'
  | 'safety'
  | 'auth'
  | 'unknown';

export class AIProviderError extends Error {
  readonly provider: AIProviderName;
  readonly kind: AIProviderErrorKind;
  readonly retryable: boolean;
  readonly raw?: unknown;

  constructor(params: {
    provider: AIProviderName;
    kind: AIProviderErrorKind;
    message: string;
    retryable: boolean;
    raw?: unknown;
  }) {
    super(params.message);
    this.name = 'AIProviderError';
    this.provider = params.provider;
    this.kind = params.kind;
    this.retryable = params.retryable;
    this.raw = params.raw;
  }
}

// ─── Contrato de Provider ─────────────────────────────────────────────────────

/**
 * Interface que todo adapter de provider deve implementar.
 * `_vertex.ts` (Etapa 4) e `_openai.ts` (Etapa 5-7) serão envolvidos por
 * objetos que implementam este contrato — sem reescrever a lógica interna
 * de nenhum dos dois.
 */
export interface AIProvider {
  readonly name: AIProviderName;
  generateText(input: AIProviderTextInput): Promise<AIProviderTextResult>;
  generateJSON(input: AIProviderTextInput): Promise<AIProviderTextResult>;
  generateImage(input: AIProviderImageInput): Promise<AIProviderImageResult>;
}
