/**
 * asaas-proxy/index.ts
 * Edge Function — Proxy seguro para a API do Asaas.
 *
 * Por que existe:
 *   A API Key do Asaas não pode ficar exposta no frontend (VITE_ vars são públicas).
 *   Esta função recebe chamadas autenticadas do frontend e as encaminha ao Asaas
 *   com a chave real, que fica apenas nos secrets do servidor.
 *
 * Endpoint: POST/GET/PUT/DELETE /functions/v1/asaas-proxy
 *
 * Headers de entrada:
 *   Authorization: Bearer <supabase_anon_or_user_jwt>
 *   x-asaas-path: /customers          (path da API Asaas, obrigatório)
 *   x-asaas-method: POST              (método HTTP, padrão: GET)
 *   Content-Type: application/json
 *
 * Body: JSON body para o Asaas (em POST/PUT)
 *
 * Deploy:
 *   supabase functions deploy asaas-proxy --no-verify-jwt
 *   (verificação de JWT feita manualmente abaixo para flexibilidade)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Secrets (configurados via: supabase secrets set) ──────────────────────────
const ASAAS_API_KEY  = Deno.env.get('ASAAS_API_KEY')  ?? '';
const ASAAS_API_BASE = Deno.env.get('ASAAS_API_BASE') ?? 'https://sandbox.asaas.com/api/v3';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')   ?? '';
const SUPABASE_ANON  = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// Rotas permitidas (whitelist de segurança)
const ALLOWED_PATHS = [
  /^\/customers(\/[a-zA-Z0-9_-]+)?$/,
  /^\/subscriptions(\/[a-zA-Z0-9_-]+)?$/,
  /^\/payments(\/[a-zA-Z0-9_-]+)?$/,
  /^\/paymentLinks(\/[a-zA-Z0-9_-]+)?$/,
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-asaas-path, x-asaas-method',
};

serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    // ── 1. Autenticar usuário Supabase ────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return json({ error: 'Unauthorized', detail: authError?.message }, 401);
    }

    // ── 2. Extrair path e método do Asaas ─────────────────────────────────────
    const asaasPath   = req.headers.get('x-asaas-path') ?? '';
    const asaasMethod = (req.headers.get('x-asaas-method') ?? req.method).toUpperCase() as string;

    if (!asaasPath) {
      return json({ error: 'Header x-asaas-path obrigatório' }, 400);
    }

    // Valida contra whitelist
    const isAllowed = ALLOWED_PATHS.some(re => re.test(asaasPath));
    if (!isAllowed) {
      return json({ error: `Rota não permitida: ${asaasPath}` }, 403);
    }

    if (!ASAAS_API_KEY) {
      return json({ error: 'ASAAS_API_KEY não configurado nos secrets da Edge Function' }, 500);
    }

    // ── 3. Encaminhar para o Asaas ────────────────────────────────────────────
    const body = ['POST', 'PUT', 'PATCH'].includes(asaasMethod)
      ? await req.text()
      : undefined;

    const asaasRes = await fetch(`${ASAAS_API_BASE}${asaasPath}`, {
      method:  asaasMethod,
      headers: {
        'access_token': ASAAS_API_KEY,
        'Content-Type': 'application/json',
      },
      body,
    });

    const asaasData = await asaasRes.json().catch(() => ({}));

    return new Response(JSON.stringify(asaasData), {
      status:  asaasRes.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[asaas-proxy] Erro:', msg);
    return json({ error: 'Erro interno', detail: msg }, 500);
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
