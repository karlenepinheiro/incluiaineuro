/**
 * _geminiProvider.ts — Adapter fino de _vertex.ts no contrato AIProvider
 * (Sprint Gateway 1 · Etapa 4)
 *
 * NÃO reimplementa nada. Chama exatamente as mesmas três funções que
 * `index.ts` chamava diretamente antes desta etapa — `generateGeminiText`,
 * `generateGeminiJSON`, `generateVertexImage` — e só empacota o retorno
 * (hoje uma `string` crua) no formato estruturado exigido pela interface
 * `AIProvider` (`_types.ts`).
 *
 * `_vertex.ts` permanece 100% intocado: mesma autenticação Gemini/OAuth2,
 * mesmo fallback interno de modelos Imagen, mesmo tratamento de erro —
 * qualquer erro lançado por essas três funções propaga sem modificação
 * através deste adapter (sem try/catch aqui), preservando o comportamento
 * de erro já existente em `index.ts` (CONFIG_GEMINI, CONFIG_VERTEX_IMAGE,
 * mensagens "Gemini {status}: ...", "Imagen {model} {status}: ...", etc.).
 */

import {
  generateGeminiText,
  generateGeminiJSON,
  generateVertexImage,
} from './_vertex.ts';
import type {
  AIProvider,
  AIProviderImageInput,
  AIProviderImageResult,
  AIProviderTextInput,
  AIProviderTextResult,
} from './_types.ts';
import { GEMINI_TEXT_MODEL, VERTEX_IMAGE_MODEL } from './_modelConfig.ts';

export function createGeminiProvider(): AIProvider {
  return {
    name: 'gemini',

    async generateText(input: AIProviderTextInput): Promise<AIProviderTextResult> {
      const text = await generateGeminiText(input.prompt, input.imageBase64);
      return { text, provider: 'gemini', model: GEMINI_TEXT_MODEL };
    },

    async generateJSON(input: AIProviderTextInput): Promise<AIProviderTextResult> {
      const text = await generateGeminiJSON(input.prompt, input.imageBase64, input.images, input.pageNumbers);
      return { text, provider: 'gemini', model: GEMINI_TEXT_MODEL };
    },

    async generateImage(input: AIProviderImageInput): Promise<AIProviderImageResult> {
      const base64DataUrl = await generateVertexImage(input.prompt);
      return { base64DataUrl, provider: 'gemini', model: VERTEX_IMAGE_MODEL };
    },
  };
}
