/**
 * imageService.ts
 * Geração de imagens pedagógicas.
 *
 * Cadeia de fallback:
 *   1. Imagen 4.0 (imagen-4.0-generate-001)      ← primário
 *   2. Imagen 4.0 Fast (imagen-4.0-fast-generate-001) ← fallback retryable
 *   3. OpenAI DALL-E 3                            ← fallback final
 */

export interface ImageGenerationResult {
  url: string;
  revisedPrompt?: string;
}

export class ImageService {
  private static getOpenAIKey(): string | undefined {
    return (import.meta as any).env?.VITE_OPENAI_API_KEY;
  }

  /**
   * Gera uma imagem pedagógica via DALL-E 3 (OpenAI).
   * Usado apenas como fallback quando Gemini/Imagen falham.
   */
  static async generateActivityImage(prompt: string): Promise<ImageGenerationResult> {
    // DALL-E 3 via OpenAI
    const apiKey = this.getOpenAIKey();
    if (!apiKey) {
      throw new Error('CONFIG_IMAGE: VITE_OPENAI_API_KEY não configurada. Para geração de imagens, configure a chave da OpenAI no .env ou verifique a chave do Gemini (VITE_GEMINI_API_KEY).');
    }

    const safePrompt = [
      'Ilustração educativa infantil para impressão pedagógica (A4).',
      'Traço limpo, alto contraste, poucos elementos visuais, SEM texto na imagem.',
      'Estilo: livro didático inclusivo, cores suaves, fundo branco, amigável.',
      `Tema: ${prompt}`,
    ].join(' ');

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: safePrompt,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
          response_format: 'url',
        }),
      });
    } catch (networkErr: any) {
      throw new Error(`Falha de conexão com DALL-E 3: ${networkErr?.message || networkErr}`);
    }

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const msg = (errBody as any)?.error?.message || response.statusText;
      if (response.status === 429) {
        throw new Error(`[QUOTA_EXCEEDED 429] DALL-E 3: ${msg}`);
      }
      if (response.status === 403) {
        throw new Error(`[PERMISSION_DENIED 403] DALL-E 3: ${msg}`);
      }
      throw new Error(`DALL-E 3 (HTTP ${response.status}): ${msg}`);
    }

    const data = await response.json();
    const item = data?.data?.[0];
    if (!item?.url) {
      throw new Error('DALL-E 3: resposta da API não contém URL de imagem.');
    }

    return { url: item.url, revisedPrompt: item.revised_prompt };
  }

  /**
   * Converte uma URL de imagem para base64.
   * Necessário quando a imagem vem de URLs temporárias (DALL-E 3).
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
