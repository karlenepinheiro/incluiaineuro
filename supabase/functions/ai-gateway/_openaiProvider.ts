import {
  AIProviderError,
  type AIProvider,
  type AIProviderImageInput,
  type AIProviderImageResult,
  type AIProviderTextInput,
  type AIProviderTextResult,
  type AIProviderUsage,
} from './_types.ts';
import {
  getOpenAIImageModel,
  getOpenAIJSONModel,
  getOpenAITextModel,
} from './_modelConfig.ts';
import { buildOpenAIMultiImageContent, type OpenAIContentPart } from './_multiPageParts.ts';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_TIMEOUT_MS = 90_000;

interface OpenAIProviderOptions {
  timeoutMs?: number;
}

export function createOpenAIProvider(options: OpenAIProviderOptions = {}): AIProvider {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    name: 'openai',

    async generateText(input: AIProviderTextInput): Promise<AIProviderTextResult> {
      const model = getOpenAITextModel();
      const json = await callOpenAIResponses({
        input,
        model,
        timeoutMs,
        jsonMode: false,
      });

      return {
        text: extractOutputText(json),
        provider: 'openai',
        model: json.model || model,
        usage: extractUsage(json),
      };
    },

    async generateJSON(input: AIProviderTextInput): Promise<AIProviderTextResult> {
      const model = getOpenAIJSONModel();
      const json = await callOpenAIResponses({
        input: {
          ...input,
          prompt: `${input.prompt.trim()}\n\nRetorne somente JSON valido, sem markdown, sem comentarios e sem texto fora do JSON.`,
        },
        model,
        timeoutMs,
        jsonMode: true,
      });
      const text = extractOutputText(json);

      try {
        return {
          text: JSON.stringify(JSON.parse(text)),
          provider: 'openai',
          model: json.model || model,
          usage: extractUsage(json),
        };
      } catch {
        throw new AIProviderError({
          provider: 'openai',
          kind: 'invalid_response',
          retryable: false,
          message: 'OPENAI_INVALID_RESPONSE: resposta JSON invalida',
        });
      }
    },

    async generateImage(_input: AIProviderImageInput): Promise<AIProviderImageResult> {
      throw new AIProviderError({
        provider: 'openai',
        kind: 'invalid_request',
        retryable: false,
        message: `OPENAI_IMAGE_NOT_IMPLEMENTED: modelo preparado (${getOpenAIImageModel()}), integracao adiada para Sprint Visual`,
      });
    },
  };
}

async function callOpenAIResponses(params: {
  input: AIProviderTextInput;
  model: string;
  timeoutMs: number;
  jsonMode: boolean;
}): Promise<any> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new AIProviderError({
      provider: 'openai',
      kind: 'auth',
      retryable: false,
      message: 'CONFIG_OPENAI: OPENAI_API_KEY ausente',
    });
  }

  const body: Record<string, unknown> = {
    model: params.model,
    input: [buildUserMessage(params.input)],
    store: false,
  };

  if (params.jsonMode) {
    body.text = { format: { type: 'json_object' } };
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }, params.timeoutMs);
  } catch (e: unknown) {
    if ((e as Error)?.name === 'AbortError' || String((e as Error)?.message || '').includes('TIMEOUT')) {
      throw new AIProviderError({
        provider: 'openai',
        kind: 'timeout',
        retryable: true,
        message: 'OPENAI_TIMEOUT',
      });
    }
    throw new AIProviderError({
      provider: 'openai',
      kind: 'network',
      retryable: true,
      message: 'OPENAI_NETWORK_ERROR',
    });
  }

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw classifyOpenAIHTTPError(response.status, json);
  }

  return json;
}

/**
 * Leitura multipágina (27/08/2026): `input.images`, quando presente, tem
 * precedência sobre `imageBase64` — mesma convenção do adapter Gemini. Só
 * usado hoje se um fallback para OpenAI ocorrer numa análise multipágina
 * (AI_FALLBACK_ENABLED); com uma única imagem o payload enviado é idêntico
 * ao de antes desta mudança. `input.pageNumbers`, quando presente, rotula
 * cada imagem com o número real da página original (mesma correção de
 * numeração do adapter Gemini) — ver _multiPageParts.ts (testado isoladamente).
 */
function buildUserMessage(input: AIProviderTextInput): Record<string, unknown> {
  const content: OpenAIContentPart[] = [
    { type: 'input_text', text: input.prompt },
  ];

  const images = input.images && input.images.length > 0
    ? input.images
    : (input.imageBase64 ? [input.imageBase64] : []);

  content.push(...buildOpenAIMultiImageContent(images, input.pageNumbers));

  return { role: 'user', content };
}

function extractOutputText(json: any): string {
  if (typeof json.output_text === 'string' && json.output_text.trim()) {
    return json.output_text.trim();
  }

  const output = Array.isArray(json.output) ? json.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part?.type === 'output_text' && typeof part.text === 'string' && part.text.trim()) {
        return part.text.trim();
      }
      if (part?.type === 'refusal') {
        throw new AIProviderError({
          provider: 'openai',
          kind: 'safety',
          retryable: false,
          message: 'OPENAI_SAFETY_REFUSAL',
        });
      }
    }
  }

  throw new AIProviderError({
    provider: 'openai',
    kind: 'empty_response',
    retryable: true,
    message: 'OPENAI_EMPTY_RESPONSE',
  });
}

function extractUsage(json: any): AIProviderUsage | undefined {
  const usage = json?.usage;
  if (!usage || typeof usage !== 'object') return undefined;
  return {
    promptTokens: numberOrUndefined(usage.input_tokens),
    completionTokens: numberOrUndefined(usage.output_tokens),
    totalTokens: numberOrUndefined(usage.total_tokens),
  };
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function classifyOpenAIHTTPError(status: number, json: any): AIProviderError {
  const code = String(json?.error?.code || json?.error?.type || '').toLowerCase();
  const message = String(json?.error?.message || `OpenAI HTTP ${status}`);

  if (status === 401 || status === 403) {
    return new AIProviderError({ provider: 'openai', kind: 'auth', retryable: false, message: 'OPENAI_AUTH_ERROR' });
  }
  if (status === 408) {
    return new AIProviderError({ provider: 'openai', kind: 'timeout', retryable: true, message: 'OPENAI_TIMEOUT' });
  }
  if (status === 429) {
    return new AIProviderError({ provider: 'openai', kind: 'rate_limit', retryable: true, message: 'OPENAI_RATE_LIMIT' });
  }
  if (status === 400) {
    const isSafety = code.includes('safety') || code.includes('content') || message.toLowerCase().includes('safety');
    return new AIProviderError({
      provider: 'openai',
      kind: isSafety ? 'safety' : 'invalid_request',
      retryable: false,
      message: isSafety ? 'OPENAI_SAFETY_ERROR' : 'OPENAI_INVALID_REQUEST',
    });
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return new AIProviderError({
      provider: 'openai',
      kind: 'provider_unavailable',
      retryable: true,
      message: 'OPENAI_PROVIDER_UNAVAILABLE',
    });
  }

  return new AIProviderError({
    provider: 'openai',
    kind: 'unknown',
    retryable: false,
    message: 'OPENAI_UNKNOWN_ERROR',
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
