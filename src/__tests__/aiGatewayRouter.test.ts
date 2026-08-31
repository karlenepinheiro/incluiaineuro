import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getRouterConfig,
  selectProviderChain,
  selectPrimaryProvider,
  shouldFallbackToNextProvider,
} from '../../supabase/functions/ai-gateway/_router.ts';
import { AIProviderError, type AIProvider, type AIProviderName } from '../../supabase/functions/ai-gateway/_types.ts';

function stubDenoEnv(values: Record<string, string | undefined>) {
  vi.stubGlobal('Deno', {
    env: {
      get: (name: string) => values[name],
    },
  });
}

function fakeProvider(name: AIProviderName): AIProvider {
  return {
    name,
    async generateText() {
      return { text: name, provider: name, model: `${name}-text` };
    },
    async generateJSON() {
      return { text: '{}', provider: name, model: `${name}-json` };
    },
    async generateImage() {
      return { base64DataUrl: 'data:image/png;base64,abc', provider: name, model: `${name}-image` };
    },
  };
}

describe('ai-gateway Router', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mantem Gemini como default seguro', () => {
    stubDenoEnv({});
    const config = getRouterConfig();
    const provider = selectPrimaryProvider({ gemini: fakeProvider('gemini'), openai: fakeProvider('openai') }, config, 'text');

    expect(config.mode).toBe('gemini');
    expect(provider.name).toBe('gemini');
  });

  it('seleciona OpenAI quando modo e flag estao habilitados', () => {
    stubDenoEnv({
      AI_ROUTER_MODE: 'openai',
      AI_OPENAI_ENABLED: 'true',
    });
    const config = getRouterConfig();
    const provider = selectPrimaryProvider({ gemini: fakeProvider('gemini'), openai: fakeProvider('openai') }, config, 'json');

    expect(provider.name).toBe('openai');
  });

  it('falha claramente quando provider escolhido esta desabilitado', () => {
    stubDenoEnv({
      AI_ROUTER_MODE: 'openai',
      AI_OPENAI_ENABLED: 'false',
    });
    const config = getRouterConfig();

    expect(() => selectPrimaryProvider({ gemini: fakeProvider('gemini'), openai: fakeProvider('openai') }, config, 'json'))
      .toThrow('desabilitado');
  });

  it('monta fallback maximo de dois providers quando habilitado', () => {
    stubDenoEnv({
      AI_ROUTER_MODE: 'gemini',
      AI_FALLBACK_ENABLED: 'true',
      AI_OPENAI_ENABLED: 'true',
    });
    const chain = selectProviderChain({ gemini: fakeProvider('gemini'), openai: fakeProvider('openai') }, getRouterConfig(), 'text');

    expect(chain.map(provider => provider.name)).toEqual(['gemini', 'openai']);
  });

  it('permite fallback apenas para erro recuperavel de provider', () => {
    const retryable = new AIProviderError({
      provider: 'openai',
      kind: 'rate_limit',
      retryable: true,
      message: 'OPENAI_RATE_LIMIT',
    });
    const nonRetryable = new AIProviderError({
      provider: 'openai',
      kind: 'invalid_response',
      retryable: false,
      message: 'OPENAI_INVALID_RESPONSE',
    });

    expect(shouldFallbackToNextProvider(retryable)).toBe(true);
    expect(shouldFallbackToNextProvider(nonRetryable)).toBe(false);
    expect(shouldFallbackToNextProvider(new Error('VALIDATION_ERROR: schema invalido'))).toBe(false);
  });
});
