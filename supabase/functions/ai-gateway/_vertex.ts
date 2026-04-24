/**
 * _vertex.ts — Clientes de IA para a Edge Function ai-gateway
 *
 * Texto/JSON : Gemini API REST (chave via Supabase Secret GEMINI_API_KEY)
 * Imagem     : Vertex AI REST + OAuth2 (service account via GOOGLE_SERVICE_ACCOUNT_JSON)
 *
 * Nenhuma credencial trafega para o browser.
 */

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

export function cleanJsonString(raw: string): string {
  let s = raw.trim().replace(/\uFEFF/g, '');
  const start  = s.indexOf('{');
  const startA = s.indexOf('[');
  if (start !== -1 || startA !== -1) {
    const first = Math.min(start >= 0 ? start : Infinity, startA >= 0 ? startA : Infinity);
    const last  = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (last > first) s = s.substring(first, last + 1);
    else              s = s.substring(first);
  }
  return s;
}

// ─── Gemini text / JSON ───────────────────────────────────────────────────────

const GEMINI_MODEL   = 'gemini-2.5-flash';
const GEMINI_BASE    = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function generateGeminiText(
  prompt: string,
  imageBase64?: string,
): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('CONFIG_GEMINI');

  const parts: GeminiPart[] = [{ text: prompt }];

  if (imageBase64) {
    const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
    const mimeType  = mimeMatch?.[1] || 'image/jpeg';
    const data      = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    parts.push({ inlineData: { mimeType, data } });
  }

  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetchWithTimeout(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ contents: [{ parts }] }),
  }, 55_000);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini ${res.status}: ${(err as any)?.error?.message || res.statusText}`);
  }

  const json = await res.json();
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('CONFIG_GEMINI');
  return text;
}

export async function generateGeminiJSON(prompt: string): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('CONFIG_GEMINI');

  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  // Tenta com responseMimeType primeiro; cai em modo texto puro se falhar
  for (const jsonMode of [true, false]) {
    const body: Record<string, unknown> = { contents: [{ parts: [{ text: prompt }] }] };
    if (jsonMode) body.generationConfig = { responseMimeType: 'application/json' };

    const res = await fetchWithTimeout(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    }, 60_000);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Gemini ${res.status}: ${(err as any)?.error?.message || res.statusText}`);
    }

    const json = await res.json();
    const raw: string = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (raw) return cleanJsonString(raw);
  }

  throw new Error('CONFIG_GEMINI');
}

// ─── Vertex AI — Imagen ───────────────────────────────────────────────────────

const IMAGEN_MODELS = ['imagen-4.0-generate-001', 'imagen-4.0-fast-generate-001'];

export async function generateVertexImage(prompt: string): Promise<string> {
  const saJson    = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  const projectId = Deno.env.get('GOOGLE_PROJECT_ID');
  const location  = Deno.env.get('GOOGLE_LOCATION') || 'us-central1';

  if (!saJson || !projectId) throw new Error('CONFIG_VERTEX_IMAGE');

  const accessToken = await getAccessToken(saJson);
  const errors: string[] = [];

  for (const model of IMAGEN_MODELS) {
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;
    try {
      const res = await fetchWithTimeout(url, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances:  [{ prompt }],
          parameters: { sampleCount: 1, outputMimeType: 'image/png' },
        }),
      }, 25_000);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = `Imagen ${model} ${res.status}: ${JSON.stringify((err as any)?.error || err)}`;
        errors.push(msg);
        // Erros permanentes (403, 400) não valem tentar o fast
        if (res.status === 403 || res.status === 400) break;
        continue;
      }

      const data  = await res.json();
      const b64   = data.predictions?.[0]?.bytesBase64Encoded;
      if (!b64) { errors.push(`${model}: resposta sem bytes`); continue; }

      return `data:image/png;base64,${b64}`;
    } catch (e: unknown) {
      errors.push(`${model}: ${(e as Error)?.message || String(e)}`);
    }
  }

  throw new Error(`CONFIG_VERTEX_IMAGE: ${errors.join(' | ')}`);
}

// ─── OAuth2 — service account JWT ────────────────────────────────────────────

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa  = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  const claim = {
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  };

  const toB64u = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const headerB64 = toB64u({ alg: 'RS256', typ: 'JWT' });
  const claimB64  = toB64u(claim);
  const input     = `${headerB64}.${claimB64}`;

  // Normaliza \\n literal (armazenado em env var) para newline real antes de decodificar PEM
  const pem    = sa.private_key
    .replace(/\\n/g, '\n')
    .replace(/-----[^-]+-----/g, '')
    .replace(/\s/g, '');
  const keyDer = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );

  const sig    = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(input));
  // Loop explícito evita stack overflow com spread em assinaturas RSA-2048 (256 bytes)
  const sigArr = new Uint8Array(sig);
  let sigBin = '';
  for (let i = 0; i < sigArr.length; i++) sigBin += String.fromCharCode(sigArr[i]);
  const sigB64 = btoa(sigBin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${input}.${sigB64}`;

  const tokenRes = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  }, 10_000);

  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}));
    throw new Error(`OAuth2 token error: ${JSON.stringify(err)}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token as string;
}

// ─── Helper: fetch com timeout ────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
