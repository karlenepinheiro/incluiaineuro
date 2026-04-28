/**
 * api/openai-generate-activity-image.ts — Vercel Serverless Function
 *
 * Gera folha de atividade A4 via OpenAI Images API.
 * NUNCA expõe OPENAI_API_KEY ao frontend.
 *
 * Variáveis de ambiente necessárias (Vercel → Settings → Environment Variables):
 *   OPENAI_API_KEY — chave da OpenAI (obrigatória)
 *
 * Recebe: { prompt: string, mode: 'visual' | 'premium' }
 * Retorna: { base64DataUrl, model, provider, durationMs }
 *
 * Modelos tentados em ordem:
 *   1. gpt-image-1  — melhor renderização de texto em imagem
 *   2. dall-e-3     — fallback amplamente disponível
 */

const OPENAI_API_BASE = 'https://api.openai.com/v1';

const ALLOWED_ORIGINS = [
  'https://incluiai.app.br',
  'https://www.incluiai.app.br',
];

function setCors(req: any, res: any): void {
  const origin = req.headers['origin'] || '';
  if (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://incluiai.app.br');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function classifyOpenAIError(status: number, message: string): string {
  if (status === 429) return `[RATE_LIMIT 429] Limite de requisições OpenAI atingido. Aguarde e tente novamente.`;
  if (status === 400) return `[BAD_REQUEST 400] Prompt rejeitado pela política de conteúdo OpenAI. Reformule a descrição.`;
  if (status === 401) return `[AUTH 401] OPENAI_API_KEY inválida ou sem permissão.`;
  if (status === 403) return `[FORBIDDEN 403] Conta sem acesso ao modelo solicitado.`;
  if (status === 500 || status === 503) return `[SERVER_ERROR ${status}] Serviço OpenAI temporariamente indisponível.`;
  return message || `HTTP ${status}`;
}

export default async function handler(req: any, res: any) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[openai-generate-activity-image] ✗ OPENAI_API_KEY não configurada');
    return res.status(500).json({
      error: 'CONFIG: Adicione OPENAI_API_KEY nas Environment Variables do Vercel.',
    });
  }

  const { prompt, mode = 'visual' } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Campo "prompt" obrigatório e não pode estar vazio.' });
  }

  const isPremium = mode === 'premium';
  const startMs = Date.now();
  const errors: string[] = [];

  console.info(`[openai-generate-activity-image] mode=${mode} | prompt="${prompt.slice(0, 100)}..."`);

  // ── gpt-image-1: melhor para text rendering dentro de imagens ────────────────
  try {
    const body = {
      model: 'gpt-image-1',
      prompt: prompt.trim(),
      n: 1,
      size: isPremium ? '1024x1536' : '1024x1024',
      quality: isPremium ? 'high' : 'standard',
      output_format: 'png',
    };

    const response = await fetch(`${OPENAI_API_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      const imageItem = data?.data?.[0];
      if (imageItem?.b64_json) {
        const base64DataUrl = `data:image/png;base64,${imageItem.b64_json}`;
        const durationMs = Date.now() - startMs;
        console.info(`[openai-generate-activity-image] ✓ gpt-image-1 OK em ${durationMs}ms`);
        return res.status(200).json({
          base64DataUrl,
          model: 'gpt-image-1',
          provider: 'openai',
          durationMs,
          revised_prompt: imageItem.revised_prompt,
        });
      } else if (imageItem?.url) {
        // Converte URL para base64
        const imgResponse = await fetch(imageItem.url);
        const buffer = await imgResponse.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = imgResponse.headers.get('content-type') || 'image/png';
        const base64DataUrl = `data:${mimeType};base64,${base64}`;
        const durationMs = Date.now() - startMs;
        console.info(`[openai-generate-activity-image] ✓ gpt-image-1 (url→base64) OK em ${durationMs}ms`);
        return res.status(200).json({
          base64DataUrl,
          model: 'gpt-image-1',
          provider: 'openai',
          durationMs,
        });
      }
      errors.push(`gpt-image-1: resposta sem imagem`);
    } else {
      const errMsg = classifyOpenAIError(response.status, data?.error?.message || '');
      errors.push(`gpt-image-1: ${errMsg}`);
      console.warn(`[openai-generate-activity-image] gpt-image-1 falhou (${response.status}): ${errMsg}`);
    }
  } catch (e: any) {
    const errMsg = e?.message || String(e);
    errors.push(`gpt-image-1: ${errMsg}`);
    console.warn(`[openai-generate-activity-image] gpt-image-1 exception:`, errMsg);
  }

  // ── dall-e-3: fallback amplamente disponível ──────────────────────────────────
  try {
    const body = {
      model: 'dall-e-3',
      prompt: prompt.trim(),
      n: 1,
      size: isPremium ? '1024x1792' : '1024x1024',
      quality: isPremium ? 'hd' : 'standard',
      response_format: 'b64_json',
    };

    const response = await fetch(`${OPENAI_API_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      const imageItem = data?.data?.[0];
      if (imageItem?.b64_json) {
        const base64DataUrl = `data:image/png;base64,${imageItem.b64_json}`;
        const durationMs = Date.now() - startMs;
        console.info(`[openai-generate-activity-image] ✓ dall-e-3 OK em ${durationMs}ms`);
        return res.status(200).json({
          base64DataUrl,
          model: 'dall-e-3',
          provider: 'openai',
          durationMs,
          revised_prompt: imageItem.revised_prompt,
        });
      }
      errors.push(`dall-e-3: resposta sem b64_json`);
    } else {
      const errMsg = classifyOpenAIError(response.status, data?.error?.message || '');
      errors.push(`dall-e-3: ${errMsg}`);
      console.error(`[openai-generate-activity-image] dall-e-3 falhou (${response.status}): ${errMsg}`);
    }
  } catch (e: any) {
    const errMsg = e?.message || String(e);
    errors.push(`dall-e-3: ${errMsg}`);
    console.error(`[openai-generate-activity-image] dall-e-3 exception:`, errMsg);
  }

  console.error('[openai-generate-activity-image] ✗ Todos os modelos falharam:', errors);
  return res.status(500).json({
    error: errors[0] || 'Geração de imagem OpenAI falhou em todos os modelos.',
    details: errors,
  });
}