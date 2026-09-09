/**
 * batchDocumentGeneration.ts — Orquestração pura da "Geração de Documentos em Lote".
 *
 * Extraído de StudentProfile.tsx (bug crítico 09/09/2026): antes o toast final
 * "Documentos gerados com sucesso" era disparado incondicionalmente ao término
 * do laço, mesmo quando 0 documentos foram gerados. Cada erro individual só
 * atualizava o estado visual do modal e nunca era propagado para um resultado
 * consolidado.
 *
 * Regras aqui implementadas:
 *   1. Resultado explícito por documento: success | failed | skipped.
 *   2. Dependência Estudo de Caso → PAEE → PEI → Plano Unificado. Se um
 *      pré-requisito do MESMO lote não chegou a "success", o dependente fica
 *      SKIPPED (sem reserva, sem cobrança) — nunca é tratado como erro da IA.
 *   3. Contagem consolidada: successCount / failedCount / skippedCount.
 *   4. Toast final coerente (verde só quando tudo deu certo).
 *   5. Retry com backoff SOMENTE para rate limit real (HTTP 429 /
 *      RESOURCE_EXHAUSTED / "Limite de uso da IA atingido" / "Gemini 429").
 *      tentativa inicial + até 2 retries (backoff 10s, 20s). Depois: failed.
 *      Cada tentativa é uma chamada nova ao gateway; o gateway faz
 *      reserve → 429 → release, então um 429 não deixa cobrança pendente
 *      (ver isRetryableRateLimitError e o teste "cobrança exatamente uma vez").
 *
 * Função pura, sem React e sem Supabase — testável isoladamente
 * (src/__tests__/batchDocumentGeneration.test.ts).
 */

import {
  FormalGuardDocKey,
  FormalSourceSnapshot,
  getFormalAiGuardMessage,
} from '../utils/formalDocumentGuards';

export type BatchDocStatus = 'success' | 'failed' | 'skipped';

export interface BatchDocResult {
  documentType: FormalGuardDocKey;
  label: string;
  status: BatchDocStatus;
  message?: string;
  recordId?: string;
  /** Créditos efetivamente cobrados por este item (0 para failed/skipped). */
  creditsCharged: number;
  /** operationId estável e independente para idempotência de retry. */
  operationId: string;
  /** Nº de tentativas feitas (1 = sucesso/falha na primeira). Só p/ auditoria. */
  attempts?: number;
}

export interface BatchGenerationSummary {
  results: BatchDocResult[];
  successCount: number;
  failedCount: number;
  skippedCount: number;
}

export interface BatchItemInput {
  documentType: FormalGuardDocKey;
  label: string;
  /** Custo em créditos do documento (usado só para relatório/telemetria). */
  cost: number;
}

export interface BatchItemGenerationOutcome {
  recordId?: string;
  warning?: string;
}

export interface BatchRetryInfo {
  /** Nº da tentativa que acabou de falhar (1 = tentativa inicial). */
  attempt: number;
  /** Quanto tempo será aguardado antes da próxima tentativa (ms). */
  waitMs: number;
  /** Quantas tentativas ainda restam após esta. */
  attemptsRemaining: number;
}

export interface RunBatchGenerationDeps {
  /** ID estável do lote — base para os operationId de cada item. */
  batchId: string;
  items: BatchItemInput[];
  /** Documentos formais JÁ persistidos para o aluno ANTES do lote começar. */
  savedSnapshot: FormalSourceSnapshot;
  /**
   * Gera + persiste UM documento. Deve lançar em qualquer falha (IA, parse,
   * persistência). Retorna o recordId quando a persistência é confirmada.
   * O operationId passado deve ser repassado ao gateway de IA para idempotência.
   */
  generate: (item: BatchItemInput, operationId: string) => Promise<BatchItemGenerationOutcome>;
  onItemStart?: (index: number, item: BatchItemInput) => void;
  /** Chamado quando um item vai aguardar retry por rate limit real. */
  onItemRetry?: (index: number, item: BatchItemInput, info: BatchRetryInfo) => void;
  onItemSettled?: (index: number, result: BatchDocResult) => void;
  /** Converte o erro bruto em mensagem amigável. Default: message do Error. */
  classifyError?: (err: unknown) => string;
  /** Espaçamento entre chamadas à IA de documentos diferentes (mitiga rate limit). */
  delayBetweenMs?: number;
  /**
   * Backoff entre as tentativas de um MESMO documento após 429 real.
   * Default: [10_000, 20_000] → tentativa inicial + 2 retries.
   * O tamanho do array define o nº máximo de retries.
   */
  retryBackoffMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

/** Backoff padrão entre tentativas de um mesmo documento após 429 real. */
export const DEFAULT_RETRY_BACKOFF_MS: readonly number[] = [10_000, 20_000];

/**
 * Mensagem de SKIP por dependência não satisfeita dentro do próprio lote.
 * NUNCA deve ser confundida com erro da IA.
 */
export const BATCH_DEPENDENCY_SKIP_MESSAGES: Record<FormalGuardDocKey, string> = {
  ESTUDO_CASO: '',
  PAEE: 'PAEE não foi gerado porque o Estudo de Caso anterior não pôde ser concluído.',
  PEI: 'PEI não foi gerado porque o PAEE anterior não pôde ser concluído.',
  DOCUMENTO_UNIFICADO_PEI_PAEE:
    'O Plano Unificado PAEE + PEI não foi gerado porque o PEI ou o PAEE anterior não pôde ser concluído.',
};

/** Feedback exibido no modal enquanto um documento aguarda retry automático. */
export const BATCH_RETRY_MESSAGE =
  'Limite temporário do provedor de IA. Nova tentativa automática em alguns segundos…';

/**
 * "[len=429]", "position 4291", "position 429" são offsets de parse / marcadores
 * de tamanho — nunca são status HTTP. Mesmo guarda de _friendlyError.ts (A-1).
 */
function looksLikeParseOffset(raw: string): boolean {
  return /\blen\s*=\s*\d+|position\s+\d+/i.test(raw);
}

function extractRawMessage(error: unknown): string {
  if (error instanceof Error) return error.message || '';
  if (typeof error === 'string') return error;
  const anyErr = error as any;
  if (anyErr && typeof anyErr.message === 'string') return anyErr.message;
  return '';
}

/**
 * Reconhece SOMENTE evidências reais de rate limit / quota do provedor.
 * Explicitamente NÃO faz `includes('429')` em texto arbitrário — offsets de
 * parse ("[len=429]", "position 4291") são descartados primeiro.
 *
 * NÃO é retryable: VALIDATION_ERROR, UNUSABLE_RESULT, erro de persistência,
 * regra de negócio (falta de Estudo de Caso), permissão, configuração, schema,
 * Supabase, ou qualquer erro não classificado como rate limit.
 */
export function isRetryableRateLimitError(error: unknown): boolean {
  if (error == null) return false;
  const anyErr = error as any;

  // 1) Formatos estruturados, quando disponíveis
  const status = anyErr?.status ?? anyErr?.statusCode ?? anyErr?.response?.status ?? anyErr?.httpStatus;
  if (status === 429 || status === '429') return true;

  const code = anyErr?.errorCode ?? anyErr?.code ?? anyErr?.reason;
  if (typeof code === 'string' && code.trim().toUpperCase() === 'RESOURCE_EXHAUSTED') return true;

  // 2) Mensagem textual — com guarda contra falsos positivos
  const raw = extractRawMessage(error);
  if (!raw) return false;
  if (looksLikeParseOffset(raw)) return false;

  // Erros que têm precedência e nunca são rate limit, mesmo se contiverem dígitos
  if (/VALIDATION_ERROR|UNUSABLE_RESULT/.test(raw)) return false;

  // Mensagem amigável explícita já formatada pelo gateway
  if (raw.includes('Limite de uso da IA atingido')) return true;

  // Sinais explícitos do provedor
  if (/\bGemini\s+429\b/.test(raw)) return true;
  if (raw.includes('RESOURCE_EXHAUSTED')) return true;

  // "429" só conta como rate limit se acompanhado de vocabulário de quota
  if (/\b429\b/.test(raw) && /quota|rate\s*limit|resource has been exhausted|too many requests/i.test(raw)) {
    return true;
  }

  return false;
}

export function batchOperationId(batchId: string, docType: FormalGuardDocKey): string {
  return `${batchId}:${docType.toLowerCase()}`;
}

function markProduced(snapshot: FormalSourceSnapshot, docType: FormalGuardDocKey): void {
  if (docType === 'ESTUDO_CASO') snapshot.estudoCaso = true;
  if (docType === 'PAEE') snapshot.paee = true;
  if (docType === 'PEI') snapshot.pei = true;
}

export function summarizeBatch(results: BatchDocResult[]): BatchGenerationSummary {
  return {
    results,
    successCount: results.filter(r => r.status === 'success').length,
    failedCount: results.filter(r => r.status === 'failed').length,
    skippedCount: results.filter(r => r.status === 'skipped').length,
  };
}

export async function runBatchGeneration(deps: RunBatchGenerationDeps): Promise<BatchGenerationSummary> {
  const { batchId, items, savedSnapshot, generate } = deps;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const classifyError =
    deps.classifyError ?? ((err: unknown) => (err instanceof Error ? err.message : String(err)));
  const delayBetweenMs = deps.delayBetweenMs ?? 0;
  const retryBackoffMs = deps.retryBackoffMs ?? [...DEFAULT_RETRY_BACKOFF_MS];
  const maxAttempts = retryBackoffMs.length + 1;

  const available: FormalSourceSnapshot = { ...savedSnapshot };
  const results: BatchDocResult[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const operationId = batchOperationId(batchId, item.documentType);
    deps.onItemStart?.(i, item);

    // ── Dependência: pré-requisito do lote não concluído → SKIPPED ────────────
    const guardMessage = getFormalAiGuardMessage(item.documentType, available);
    if (guardMessage) {
      const result: BatchDocResult = {
        documentType: item.documentType,
        label: item.label,
        status: 'skipped',
        message: BATCH_DEPENDENCY_SKIP_MESSAGES[item.documentType] || guardMessage,
        creditsCharged: 0,
        operationId,
        attempts: 0,
      };
      results.push(result);
      deps.onItemSettled?.(i, result);
      continue;
    }

    // Espaça as chamadas à IA de documentos diferentes (após o 1º item gerado)
    if (delayBetweenMs > 0 && results.some(r => r.status !== 'skipped')) {
      await sleep(delayBetweenMs);
    }

    // ── Tentativa inicial + retries com backoff SOMENTE para 429 real ─────────
    let attempt = 0;
    let settled: BatchDocResult | null = null;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const outcome = await generate(item, operationId);
        markProduced(available, item.documentType);
        settled = {
          documentType: item.documentType,
          label: item.label,
          status: 'success',
          message: outcome.warning,
          recordId: outcome.recordId,
          creditsCharged: item.cost,
          operationId,
          attempts: attempt,
        };
        break;
      } catch (err) {
        const canRetry = attempt < maxAttempts && isRetryableRateLimitError(err);
        if (canRetry) {
          const waitMs = retryBackoffMs[attempt - 1];
          deps.onItemRetry?.(i, item, {
            attempt,
            waitMs,
            attemptsRemaining: maxAttempts - attempt,
          });
          await sleep(waitMs);
          continue;
        }
        settled = {
          documentType: item.documentType,
          label: item.label,
          status: 'failed',
          message: classifyError(err),
          creditsCharged: 0,
          operationId,
          attempts: attempt,
        };
        break;
      }
    }

    // settled é sempre preenchido: o laço só termina por break (success/failed)
    results.push(settled!);
    deps.onItemSettled?.(i, settled!);
  }

  return summarizeBatch(results);
}

export type BatchToastVariant = 'success' | 'warning' | 'error';

export interface BatchToast {
  variant: BatchToastVariant;
  message: string;
  /** Só quando há pelo menos 1 documento gerado com sucesso. */
  canViewDocuments: boolean;
}

export function getBatchToast(summary: BatchGenerationSummary): BatchToast {
  const { successCount, failedCount, skippedCount } = summary;

  if (successCount === 0) {
    return { variant: 'error', message: 'Nenhum documento foi gerado.', canViewDocuments: false };
  }

  if (failedCount === 0 && skippedCount === 0) {
    const plural = successCount !== 1;
    return {
      variant: 'success',
      message: `${successCount} documento${plural ? 's' : ''} gerado${plural ? 's' : ''} com sucesso.`,
      canViewDocuments: true,
    };
  }

  const notConcluded = failedCount + skippedCount;
  const sPlural = successCount !== 1;
  const nPlural = notConcluded !== 1;
  return {
    variant: 'warning',
    message:
      `${successCount} documento${sPlural ? 's' : ''} ${sPlural ? 'foram gerados' : 'foi gerado'}. ` +
      `${notConcluded} não ${nPlural ? 'puderam' : 'pôde'} ser concluído${nPlural ? 's' : ''}.`,
    canViewDocuments: true,
  };
}
