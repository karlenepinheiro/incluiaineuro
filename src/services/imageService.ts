/**
 * imageService.ts
 * Geração de imagens pedagógicas.
 *
 * REGRA: o browser NUNCA chama OpenAI ou Google diretamente.
 * Toda geração de imagem passa obrigatoriamente pelo endpoint serverless
 * /api/generate-image (Vercel Function).
 */

import { ImageGenerationService } from './imageGenerationService';

export interface ImageGenerationResult {
  url: string;
  revisedPrompt?: string;
}

export class ImageService {
  /**
   * Gera uma imagem pedagógica via /api/generate-image (backend serverless).
   * Retorna um data URL base64 que pode ser usado diretamente em <img>.
   */
  static async generateActivityImage(prompt: string): Promise<ImageGenerationResult> {
    const result = await ImageGenerationService.generateWithFallback(prompt);
    return { url: result.base64DataUrl, revisedPrompt: result.promptUsed };
  }

  /**
   * Converte uma URL de imagem para base64.
   * Necessário quando a imagem vem de URLs temporárias.
   */
  static async urlToBase64(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Falha ao baixar imagem gerada.');
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
