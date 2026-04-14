/**
 * api/generate-image.ts — Vercel Serverless Function (Node.js)
 *
 * Geração de imagens via Imagen 4.0 (Google Vertex AI).
 * Roda no servidor: sem a restrição "browser runtime" do SDK Google.
 *
 * Método obrigatório: client.models.generateImages()  ← plural
 * Modelo primário   : imagen-4.0-generate-001
 * Fallback          : imagen-4.0-fast-generate-001  (só em erros de quota/503/504)
 *
 * Variáveis de ambiente necessárias (Vercel → Settings → Environment Variables):
 *   VITE_GEMINI_API_KEY       — chave Gemini / Vertex AI
 *   VITE_GOOGLE_PROJECT_ID    — ID do projeto Google Cloud
 *   VITE_GOOGLE_LOCATION      — região Vertex AI (ex: us-central1)
 */

import { GoogleGenAI } from '@google/genai';

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const IMAGEN_MODEL_PRIMARY = 'imagen-4.0-generate-001';
const IMAGEN_MODEL_FAST    = 'imagen-4.0-fast-generate-001';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function buildSafePrompt(userPrompt: string): string {
  return [
    'Ilustração educativa infantil para impressão pedagógica (A4).',
    'Traço limpo, alto contraste, poucos elementos visuais, SEM texto na imagem.',
    'Estilo: livro didático inclusivo, cores suaves, fundo branco, amigável.',
    `Tema: ${userPrompt}`,
  ].join(' ');
}

function classifyError(e: unknown): string {
  const msg = (e as any)?.message || String(e);
  const statusMatch = msg.match(/\b(4\d{2}|5\d{2})\b/);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;

  if (status === 429) return `[QUOTA_EXCEEDED 429] Limite de requisições Vertex AI atingido. Aguarde alguns minutos e tente novamente.`;
  if (status === 403) return `[PERMISSION_DENIED 403] Imagen 4.0 não habilitado no projeto Google Cloud ou chave de API sem permissão. Verifique o Cloud Console.`;
  if (status === 400) return `[BAD_REQUEST 400] Prompt rejeitado pela política de segurança do Imagen. Reformule a descrição.`;
  if (status === 503 || status === 504) return `[SERVICE_UNAVAILABLE ${status}] Serviço Imagen temporariamente indisponível. Tente novamente em instantes.`;
  if (msg.includes('imageBytes') || msg.includes('sem bytes')) return `Imagen retornou resposta vazia — sem bytes de imagem.`;
  return msg;
}

function isRetryableError(e: unknown): boolean {
  const msg = (e as any)?.message || String(e);
  return msg.includes('429') || msg.includes('503') || msg.includes('504') || msg.includes('QUOTA');
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  // CORS — permite chamada do SPA hospedado no mesmo domínio Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Valida corpo da requisição ──────────────────────────────────────────────
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'Campo "prompt" obrigatório e não pode estar vazio.' });
  }

  // ── Valida variáveis de ambiente ────────────────────────────────────────────
  const apiKey    = process.env.VITE_GEMINI_API_KEY;
  const projectId = process.env.VITE_GOOGLE_PROJECT_ID;
  const location  = process.env.VITE_GOOGLE_LOCATION || 'us-central1';

  if (!apiKey) {
    console.error('[generate-image] ✗ VITE_GEMINI_API_KEY ausente no servidor');
    return res.status(500).json({ error: 'CONFIG: VITE_GEMINI_API_KEY não configurada. Adicione no painel Vercel → Environment Variables.' });
  }
  if (!projectId) {
    console.error('[generate-image] ✗ VITE_GOOGLE_PROJECT_ID ausente no servidor');
    return res.status(500).json({ error: 'CONFIG: VITE_GOOGLE_PROJECT_ID não configurada. Adicione no painel Vercel → Environment Variables.' });
  }

  // ── Inicializa cliente Vertex AI (Node.js — sem restrição browser) ──────────
  const client = new GoogleGenAI({
    vertexai: true,
    project:  projectId,
    location,
    apiKey,
  } as any);

  const safePrompt = buildSafePrompt(prompt.trim());

  console.info(`[generate-image] projeto=${projectId} | location=${location}`);
  console.info(`[generate-image] prompt="${safePrompt.slice(0, 120)}..."`);

  const attemptErrors: string[] = [];

  // ── Tenta modelo primário; fallback para fast só em erros transitórios ──────
  for (const model of [IMAGEN_MODEL_PRIMARY, IMAGEN_MODEL_FAST]) {
    const startMs = Date.now();
    try {
      console.info(`[generate-image] Tentando ${model}...`);

      const response = await client.models.generateImages({
        model,
        prompt: safePrompt,
        config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
      });

      const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
      if (!imageBytes || (imageBytes as any).length === 0) {
        throw new Error(`${model}: Imagen retornou resposta sem bytes de imagem`);
      }

      // Node.js: Buffer.from() — sem depender de btoa() do browser
      const base64 = Buffer.from(imageBytes as unknown as Uint8Array).toString('base64');
      const base64DataUrl = `data:image/jpeg;base64,${base64}`;
      const durationMs = Date.now() - startMs;

      console.info(`[generate-image] ✓ ${model} OK em ${durationMs}ms (${(imageBytes as any).length} bytes)`);

      return res.status(200).json({
        base64DataUrl,
        model,
        promptUsed: safePrompt,
        durationMs,
      });

    } catch (e: unknown) {
      const durationMs = Date.now() - startMs;
      const classified = classifyError(e);
      attemptErrors.push(`${model} (${durationMs}ms): ${classified}`);
      console.error(`[generate-image] ✗ ${model} falhou em ${durationMs}ms:`, classified);

      // Se for o modelo primário e o erro não for transitório, não tenta o fast
      if (model === IMAGEN_MODEL_PRIMARY && !isRetryableError(e)) {
        console.error('[generate-image] Erro permanente — não tentará modelo fast');
        break;
      }

      if (model === IMAGEN_MODEL_PRIMARY) {
        console.warn('[generate-image] Erro transitório — tentando imagen-4.0-fast-generate-001...');
      }
    }
  }

  // ── Todos os modelos falharam ───────────────────────────────────────────────
  console.error('[generate-image] ✗ Todos os modelos falharam:', attemptErrors);
  return res.status(500).json({
    error: attemptErrors[0] || 'Geração de imagem falhou em todos os modelos Imagen 4.0.',
    details: attemptErrors,
  });
}
