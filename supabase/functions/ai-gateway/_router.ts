/**
 * _router.ts — Router de providers de IA (Sprint Gateway 1)
 *
 * Etapa 3: criado desconectado de `index.ts` (estrutura preparatória).
 * Etapa 4 (atual): CONECTADO a `index.ts`. `index.ts` agora resolve o
 * provider via `selectPrimaryProvider()` e chama `AIProvider.generateText/
 * generateJSON/generateImage` em vez de chamar `_vertex.ts` diretamente.
 * Gemini e OpenAI podem ser registrados em produção. O default permanece
 * Gemini; OpenAI só entra quando explicitamente habilitado/configurado.
 *
 * Ordem de decisão vigente:
 *   1. AI_ROUTER_MODE explícito ('gemini' | 'openai') força um provider único
 *      para TODAS as tasks — é o modo de teste controlado (Etapa 5) e também
 *      o mecanismo de rollback imediato (voltar para 'gemini').
 *   2. Ausente/inválido → default seguro 'gemini' (comportamento atual,
 *      100% Gemini/Imagen — igual ao sistema antes deste Sprint).
 *   3. Fallback entre providers é opcional e limitado a erros recuperáveis
 *      de provider, quando AI_FALLBACK_ENABLED=true.
 */

import type {
  AIProvider,
  AIProviderName,
  ProviderTask,
} from './_types.ts';
import { AIProviderError } from './_types.ts';

// ─── Feature flags (nomes apenas — sem valores, lidos via Deno.env.get) ──────
//
//   AI_ROUTER_MODE      'gemini' | 'openai'   default: 'gemini'
//   AI_OPENAI_ENABLED   'true' | 'false'      default: 'false'
//   AI_GOOGLE_ENABLED   'true' | 'false'      default: 'true'
//   AI_FALLBACK_ENABLED 'true' | 'false'      default: 'false'
//
// Nenhuma dessas variáveis precisa existir hoje no ambiente: todos os
// defaults acima reproduzem exatamente o comportamento atual do sistema
// (Gemini para texto/JSON, Vertex Imagen para imagem, sem fallback).

export interface RouterConfig {
  mode: AIProviderName;
  openaiEnabled: boolean;
  googleEnabled: boolean;
  fallbackEnabled: boolean;
}

const DEFAULT_MODE: AIProviderName = 'gemini';

function readBoolEnv(name: string, fallback: boolean): boolean {
  const raw = Deno.env.get(name);
  if (raw === undefined) return fallback;
  return raw.trim().toLowerCase() === 'true';
}

function readModeEnv(name: string, fallback: AIProviderName): AIProviderName {
  const raw = Deno.env.get(name)?.trim().toLowerCase();
  if (raw === 'openai' || raw === 'gemini') return raw;
  return fallback;
}

/**
 * Lê a configuração do Router a partir de variáveis de ambiente (Supabase
 * secrets), com defaults que reproduzem o comportamento atual do sistema.
 * Chamada por `index.ts` a cada requisição (Etapa 4).
 */
export function getRouterConfig(): RouterConfig {
  return {
    mode: readModeEnv('AI_ROUTER_MODE', DEFAULT_MODE),
    openaiEnabled: readBoolEnv('AI_OPENAI_ENABLED', false),
    googleEnabled: readBoolEnv('AI_GOOGLE_ENABLED', true),
    fallbackEnabled: readBoolEnv('AI_FALLBACK_ENABLED', false),
  };
}

// ─── Registro de providers ────────────────────────────────────────────────────

/**
 * Registry simples de adapters disponíveis, montado em `index.ts`.
 */
export type ProviderRegistry = Partial<Record<AIProviderName, AIProvider>>;

function isProviderEnabled(name: AIProviderName, config: RouterConfig): boolean {
  if (name === 'openai') return config.openaiEnabled;
  if (name === 'gemini') return config.googleEnabled;
  return false;
}

// ─── Seleção de provider ──────────────────────────────────────────────────────

/**
 * Resolve o provider PRIMARY para uma task, segundo o modo configurado.
 *
 * Resolve o provider principal. Fallback fica em `selectProviderChain()`.
 *
 * `task` e `requestType` já fazem parte da assinatura porque o Router final
 * (Etapa 8) precisa deles para decidir por funcionalidade, não por página —
 * mas nesta etapa eles não influenciam a escolha.
 */
export function selectPrimaryProvider(
  registry: ProviderRegistry,
  config: RouterConfig,
  _task: ProviderTask,
  _requestType?: string,
): AIProvider {
  const provider = registry[config.mode];
  if (!provider) {
    throw new Error(
      `AI_ROUTER: provider "${config.mode}" não está registrado no registry atual.`,
    );
  }
  if (!isProviderEnabled(provider.name, config)) {
    throw new Error(`AI_ROUTER: provider "${provider.name}" está desabilitado por configuração.`);
  }
  return provider;
}

export function selectProviderChain(
  registry: ProviderRegistry,
  config: RouterConfig,
  task: ProviderTask,
  requestType?: string,
): AIProvider[] {
  const primary = selectPrimaryProvider(registry, config, task, requestType);
  if (!config.fallbackEnabled) return [primary];

  const fallbackName: AIProviderName = primary.name === 'gemini' ? 'openai' : 'gemini';
  const fallback = registry[fallbackName];
  if (!fallback || !isProviderEnabled(fallbackName, config)) return [primary];

  return [primary, fallback];
}

export function shouldFallbackToNextProvider(error: unknown): boolean {
  if (error instanceof AIProviderError) return error.retryable;

  const raw = error instanceof Error ? error.message : String(error);
  return (
    raw.includes('TIMEOUT_EXCEEDED') ||
    raw.includes('429') ||
    raw.includes('500') ||
    raw.includes('502') ||
    raw.includes('503') ||
    raw.includes('504')
  );
}
