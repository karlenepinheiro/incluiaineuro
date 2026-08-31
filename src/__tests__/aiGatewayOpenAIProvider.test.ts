import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAIProvider } from '../../supabase/functions/ai-gateway/_openaiProvider.ts';
import { AIProviderError } from '../../supabase/functions/ai-gateway/_types.ts';

function stubDenoEnv(values: Record<string, string | undefined>) {
  vi.stubGlobal('Deno', {
    env: {
      get: (name: string) => values[name],
    },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OpenAIProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('gera texto via Responses API sem expor segredo', async () => {
    stubDenoEnv({
      OPENAI_API_KEY: 'test-secret',
      OPENAI_TEXT_MODEL: 'gpt-test-text',
    });
    const fetchMock = vi.fn(async () => jsonResponse({
      model: 'gpt-test-text',
      output_text: 'OPENAI_GATEWAY_OK',
      usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOpenAIProvider();
    const result = await provider.generateText({ prompt: 'Responda apenas: OPENAI_GATEWAY_OK' });
    const [, init] = fetchMock.mock.calls[0];

    expect(result).toEqual({
      text: 'OPENAI_GATEWAY_OK',
      provider: 'openai',
      model: 'gpt-test-text',
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
    });
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-secret',
    });
    expect(JSON.stringify((init as RequestInit).body)).not.toContain('test-secret');
  });

  it('gera JSON valido em modo json_object', async () => {
    stubDenoEnv({
      OPENAI_API_KEY: 'test-secret',
      OPENAI_JSON_MODEL: 'gpt-test-json',
    });
    const fetchMock = vi.fn(async () => jsonResponse({
      model: 'gpt-test-json',
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: '{ "ok": true, "count": 1 }' }],
      }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOpenAIProvider();
    const result = await provider.generateJSON({ prompt: 'Retorne {"ok":true,"count":1}' });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String((init as RequestInit).body));

    expect(JSON.parse(result.text)).toEqual({ ok: true, count: 1 });
    expect(result.provider).toBe('openai');
    expect(body.text).toEqual({ format: { type: 'json_object' } });
  });

  it('classifica rate limit como erro recuperavel', async () => {
    stubDenoEnv({ OPENAI_API_KEY: 'test-secret' });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      error: { type: 'rate_limit_error', message: 'too many requests' },
    }, 429)));

    const provider = createOpenAIProvider();
    await expect(provider.generateText({ prompt: 'oi' })).rejects.toMatchObject({
      kind: 'rate_limit',
      retryable: true,
    });
  });

  it('classifica JSON invalido como resposta invalida nao recuperavel', async () => {
    stubDenoEnv({ OPENAI_API_KEY: 'test-secret' });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ output_text: 'nao e json' })));

    const provider = createOpenAIProvider();
    await expect(provider.generateJSON({ prompt: 'retorne json' })).rejects.toMatchObject({
      kind: 'invalid_response',
      retryable: false,
    });
  });

  it('usa timeout proprio em chamadas OpenAI', async () => {
    stubDenoEnv({ OPENAI_API_KEY: 'test-secret' });
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    })));

    const provider = createOpenAIProvider({ timeoutMs: 1 });
    await expect(provider.generateText({ prompt: 'oi' })).rejects.toMatchObject({
      kind: 'timeout',
      retryable: true,
    });
  });

  it('mantem imagem OpenAI preparada mas nao implementada nesta Sprint', async () => {
    stubDenoEnv({ OPENAI_IMAGE_MODEL: 'gpt-image-1' });
    const provider = createOpenAIProvider();

    await expect(provider.generateImage({ prompt: 'ilustracao simples' })).rejects.toBeInstanceOf(AIProviderError);
    await expect(provider.generateImage({ prompt: 'ilustracao simples' })).rejects.toMatchObject({
      kind: 'invalid_request',
      retryable: false,
    });
  });
});
