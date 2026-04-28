/**
 * openaiActivityImageService.ts
 * Cliente HTTP para /api/openai-generate-activity-image.
 *
 * Chama o endpoint serverless que mantém a OPENAI_API_KEY segura no servidor.
 * Retorna a imagem como base64 data URL.
 */

export interface OpenAIActivityImageResult {
  base64DataUrl: string;
  model: string;
  provider: 'openai';
  durationMs: number;
}

const API_ENDPOINT = '/api/openai-generate-activity-image';

export class OpenAIActivityImageService {
  /**
   * Gera uma folha de atividade A4 via OpenAI Images API.
   *
   * @param prompt  Prompt completo descrevendo a atividade
   * @param mode    'visual' (15cr, 1024x1024) | 'premium' (50cr, retrato A4)
   */
  static async generate(
    prompt: string,
    mode: 'visual' | 'premium',
  ): Promise<OpenAIActivityImageResult> {
    console.info('[OpenAIActivityImageService] Chamando /api/openai-generate-activity-image...');

    let responseData: any;

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, mode }),
      });

      if (response.status === 404) {
        throw new Error(
          'Endpoint de imagem não encontrado. Rode "vercel dev" localmente ou publique na Vercel para habilitar geração de imagens.',
        );
      }

      responseData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));

      if (!response.ok) {
        const errMsg = responseData?.error || `HTTP ${response.status}`;
        console.error('[OpenAIActivityImageService] ✗ Servidor retornou erro:', errMsg);
        if (responseData?.details) {
          (responseData.details as string[]).forEach((d: string, i: number) =>
            console.error(`  [${i + 1}] ${d}`)
          );
        }
        throw new Error(errMsg);
      }
    } catch (e: unknown) {
      throw e;
    }

    const { base64DataUrl, model, durationMs } = responseData;

    if (!base64DataUrl || !base64DataUrl.startsWith('data:image/')) {
      throw new Error('Servidor OpenAI retornou base64DataUrl inválido ou ausente.');
    }

    console.info(`[OpenAIActivityImageService] ✓ Imagem recebida — modelo: ${model} em ${durationMs}ms`);

    return {
      base64DataUrl,
      model,
      provider: 'openai',
      durationMs,
    };
  }
}