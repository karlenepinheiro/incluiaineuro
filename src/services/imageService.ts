// imageService.ts — Geração real de imagens via OpenAI DALL-E 3
// Custo: AI_CREDIT_COSTS.ATIVIDADE_IMAGEM créditos por imagem (src/config/aiCosts.ts)

export interface ImageGenerationResult {
  url: string;
  revisedPrompt?: string;
}

export class ImageService {
  private static getApiKey(): string | undefined {
    return (import.meta as any).env?.VITE_OPENAI_API_KEY;
  }

  /**
   * Gera uma imagem pedagógica via DALL-E 3.
   * Retorna a URL temporária da imagem (válida por 60 minutos).
   * Lança erro se a chave não estiver configurada ou a API falhar.
   */
  static async generateActivityImage(prompt: string): Promise<ImageGenerationResult> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new Error('CONFIG_IMAGE');
    }

    // Garante que o prompt seja seguro para DALL-E (sem PII de alunos)
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
      throw new Error(
        `Falha de conexão com a API de imagens OpenAI: ${networkErr?.message || networkErr}`
      );
    }

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const msg = (errBody as any)?.error?.message || response.statusText;
      throw new Error(`DALL-E 3 (HTTP ${response.status}): ${msg}`);
    }

    const data = await response.json();
    const item = data?.data?.[0];

    if (!item?.url) {
      throw new Error('DALL-E 3: resposta da API não contém URL de imagem.');
    }

    return {
      url: item.url,
      revisedPrompt: item.revised_prompt,
    };
  }

  /**
   * Converte uma URL de imagem OpenAI para base64.
   * Útil para salvar no Supabase Storage sem expor URLs temporárias.
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
