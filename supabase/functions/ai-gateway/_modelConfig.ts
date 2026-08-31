import type { AIProviderName, ProviderTask } from './_types.ts';

export const GEMINI_TEXT_MODEL = 'gemini-2.5-flash';
export const VERTEX_IMAGE_MODEL = 'imagen-4.0';

const OPENAI_DEFAULT_TEXT_MODEL = 'gpt-4o-mini';
const OPENAI_DEFAULT_JSON_MODEL = 'gpt-4o-mini';
const OPENAI_DEFAULT_IMAGE_MODEL = 'gpt-image-1';

function readEnv(name: string): string | undefined {
  return Deno.env.get(name)?.trim() || undefined;
}

export function getOpenAITextModel(): string {
  return readEnv('OPENAI_TEXT_MODEL') || readEnv('OPENAI_MODEL') || OPENAI_DEFAULT_TEXT_MODEL;
}

export function getOpenAIJSONModel(): string {
  return readEnv('OPENAI_JSON_MODEL') || readEnv('OPENAI_MODEL') || OPENAI_DEFAULT_JSON_MODEL;
}

export function getOpenAIImageModel(): string {
  return readEnv('OPENAI_IMAGE_MODEL') || OPENAI_DEFAULT_IMAGE_MODEL;
}

export function modelForProviderTask(provider: AIProviderName, task: ProviderTask): string {
  if (provider === 'openai') {
    if (task === 'image') return getOpenAIImageModel();
    if (task === 'json') return getOpenAIJSONModel();
    return getOpenAITextModel();
  }

  if (task === 'image') return VERTEX_IMAGE_MODEL;
  return GEMINI_TEXT_MODEL;
}
