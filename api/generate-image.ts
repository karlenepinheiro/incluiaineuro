/**
 * api/generate-image.ts — Vercel Serverless Function (Node.js)
 *
 * Geração de imagens via Imagen 4.0.
 * Roda no servidor: sem a restrição "browser runtime" do SDK Google.
 *
 * Método obrigatório: client.models.generateImages()  ← plural
 * Modelo primário   : imagen-4.0-generate-001
 * Fallback          : imagen-4.0-fast-generate-001  (só em erros de quota/503/504)
 *
 * IMPORTANTE — autenticação mutuamente exclusiva:
 *   • Modo Vertex AI  → NÃO passa apiKey. Usa ADC via GOOGLE_APPLICATION_CREDENTIALS_JSON.
 *   • Modo Gemini API → usa APENAS apiKey (sem project/location).
 *
 * Variáveis de ambiente necessárias (Vercel → Settings → Environment Variables):
 *   VITE_GEMINI_API_KEY            — chave Gemini API (obrigatória)
 *   VITE_GOOGLE_PROJECT_ID         — ID do projeto GCP (opcional; ativa modo Vertex AI)
 *   VITE_GOOGLE_LOCATION           — região Vertex AI (padrão: us-central1)
 *   GOOGLE_APPLICATION_CREDENTIALS_JSON — JSON da service account GCP (opcional; necessário para Vertex AI)
 */

// Forçando novo build v2
import { GoogleGenAI } from '@google/genai';
import { writeFileSync } from 'fs';
import { join } from 'path';

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
  // CORS — permite chamada do SPA (mesmo domínio Vercel + domínio customizado)
  const origin = req.headers['origin'] || '';
  const allowed = [
    'https://incluiai.app.br',
    'https://www.incluiai.app.br',
  ];
  if (allowed.includes(origin) || origin.endsWith('.vercel.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://incluiai.app.br');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Valida corpo da requisição ──────────────────────────────────────────────
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'Campo "prompt" obrigatório e não pode estar vazio.' });
  }

  // ── Variáveis de ambiente ───────────────────────────────────────────────────
  const projectId          = process.env.VITE_GOOGLE_PROJECT_ID;
  const location           = process.env.VITE_GOOGLE_LOCATION || 'us-central1';
  const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  // apiKey usado apenas como fallback se não houver service account
  const apiKey             = process.env.VITE_GEMINI_API_KEY;

  if (!serviceAccountJson && !apiKey) {
    console.error('[generate-image] ✗ Nenhuma credencial configurada');
    return res.status(500).json({
      error: 'CONFIG: Adicione GOOGLE_APPLICATION_CREDENTIALS_JSON (Vertex AI) ou VITE_GEMINI_API_KEY no painel Vercel → Environment Variables.',
    });
  }

  // ── Inicializa cliente ──────────────────────────────────────────────────────
  //    apiKey e project/location são MUTUAMENTE EXCLUSIVOS no SDK @google/genai.
  //    REGRA: se VITE_GOOGLE_PROJECT_ID estiver presente → modo Vertex AI (SEM apiKey).
  //           caso contrário → modo Gemini API (só apiKey).
  let client: GoogleGenAI;

  if (projectId) {
    // Modo Vertex AI — apiKey NUNCA é passada aqui (causaria erro 400 mutually exclusive)
    if (serviceAccountJson) {
      try {
        JSON.parse(serviceAccountJson);
        const credPath = join('/tmp', 'gcp-sa.json');
        writeFileSync(credPath, serviceAccountJson, { encoding: 'utf-8' });
        // google-auth-library lê GOOGLE_APPLICATION_CREDENTIALS automaticamente (ADC)
        process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
        console.info('[generate-image] ADC: service account JSON escrito em /tmp/gcp-sa.json');
      } catch (parseErr) {
        console.error('[generate-image] ✗ GOOGLE_APPLICATION_CREDENTIALS_JSON inválido:', parseErr);
        return res.status(500).json({
          error: 'CONFIG: GOOGLE_APPLICATION_CREDENTIALS_JSON contém JSON inválido. Verifique o conteúdo colado na Vercel.',
        });
      }
    }

    client = new GoogleGenAI({
      vertexai: true,
      project:  projectId,
      location,
      // ← apiKey ausente: mutuamente exclusivo com project/location
    } as any);

    console.info(`[generate-image] modo=VertexAI projeto=${projectId} location=${location}`);
  } else {
    // Modo Gemini API — usa apenas apiKey, sem project/location
    if (!apiKey) {
      return res.status(500).json({
        error: 'CONFIG: Adicione VITE_GEMINI_API_KEY (Gemini API) ou VITE_GOOGLE_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS_JSON (Vertex AI) na Vercel.',
      });
    }
    client = new GoogleGenAI({ apiKey } as any);
    console.info('[generate-image] modo=GeminiAPI');
  }

  const safePrompt = buildSafePrompt(prompt.trim());

  console.info(`[generate-image] projeto=${projectId ?? 'n/a'} | location=${location}`);
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
        config: { numberOfImages: 1, outputMimeType: 'image/png' },
      });

      const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
      if (!imageBytes || (imageBytes as any).length === 0) {
        throw new Error(`${model}: Imagen retornou resposta sem bytes de imagem`);
      }

      // Vertex AI pode retornar imageBytes como string base64 já codificada
      // ou como Uint8Array de bytes crus — tratamos os dois casos.
      let base64: string;
      if (typeof imageBytes === 'string') {
        // Já é base64 — usa diretamente (sem re-encodar)
        base64 = imageBytes;
        console.info(`[generate-image] imageBytes tipo=string (já base64), len=${imageBytes.length}`);
      } else {
        // Uint8Array / Buffer — converte para base64
        base64 = Buffer.from(imageBytes as unknown as Uint8Array).toString('base64');
        console.info(`[generate-image] imageBytes tipo=Uint8Array, len=${(imageBytes as any).length}`);
      }

      const base64DataUrl = `data:image/png;base64,${base64}`;
      const durationMs = Date.now() - startMs;

      // Sanity-check: prefixo deve estar correto
      if (!base64DataUrl.startsWith('data:image/png;base64,')) {
        throw new Error(`${model}: base64DataUrl com prefixo inesperado`);
      }

      console.info(`[generate-image] ✓ ${model} OK em ${durationMs}ms | base64 len=${base64.length}`);

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
