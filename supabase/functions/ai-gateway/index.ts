/**
 * Edge Function: ai-gateway — Sub-etapa 2A
 *
 * Fluxo completo por request:
 *   1. Verificar JWT Supabase → uid
 *   2. Buscar tenant_id/userId no DB (service_role)
 *   3. Validar payload (task, prompt, creditsRequired, requestType)
 *   4. Verificar saldo com service_role → 402 se insuficiente
 *   5. Criar registro de auditoria (status: pending)
 *   6. Chamar provider (Gemini texto/JSON ou Vertex Imagen)
 *   7. Debitar créditos após sucesso
 *   8. Completar auditoria (status: success/failed, latência real)
 *   9. Retornar { result, creditsRemaining?, auditId? }
 *
 * Secrets necessários (supabase secrets set NOME=valor):
 *   GEMINI_API_KEY                — Gemini API (texto/JSON)
 *   GOOGLE_SERVICE_ACCOUNT_JSON   — service account GCP (Imagen)
 *   GOOGLE_PROJECT_ID             — projeto GCP
 *   GOOGLE_LOCATION               — região Vertex AI (padrão: us-central1)
 *   SUPABASE_URL                  — disponível automaticamente
 *   SUPABASE_SERVICE_ROLE_KEY     — disponível automaticamente
 *
 * Deploy:
 *   supabase functions deploy ai-gateway
 */

import { createClient }        from 'https://esm.sh/@supabase/supabase-js@2';
import { jwtVerify, createRemoteJWKSet } from 'https://esm.sh/jose@5';
import { generateGeminiText, generateGeminiJSON, generateVertexImage } from './_vertex.ts';
import { getTenantContext, checkCredits, debitCredits }               from './_credits.ts';
import { createAuditRecord, completeAuditRecord, modelForTask, outputTypeForTask } from './_audit.ts';
import { buildCanonicalContext }                                      from './_contextBuilder.ts';
import { callAIWithRetryAndTimeout, validateAndRepair }               from './_aiUtils.ts';

// ─── Constantes ───────────────────────────────────────────────────────────────

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// JWKS em nível de módulo — cacheado em instâncias quentes (warm invocations)
const JWKS = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Tipos do payload ─────────────────────────────────────────────────────────

interface GatewayPayload {
  task:             'text' | 'json' | 'image' | 'document';
  prompt:           string;
  imageBase64?:     string;
  creditsRequired?: number;  // 0 ou undefined = sem check/débito
  requestType?:     string;  // undefined = sem registro de auditoria
  studentId?:       string;
  documentType?:    string;
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405);
  }

  // ── 1. Verificar JWT via JWKS (suporta ES256, RS256) ─────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonError('Missing or malformed Authorization header', 401);
  }

  const jwt = authHeader.slice(7);
  let uid: string;

  try {
    const { payload } = await jwtVerify(jwt, JWKS, {
      algorithms: ['ES256', 'RS256', 'HS256'],
    });
    uid = payload.sub as string;
    if (!uid) throw new Error('JWT sem claim "sub"');
  } catch (e: unknown) {
    console.warn('[ai-gateway] JWT inválido:', (e as Error)?.message);
    return jsonError('Unauthorized', 401);
  }

  // adminDb: service_role para operações que bypassam RLS (créditos, auditoria)
  const adminDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // ── 2. Buscar contexto do tenant ────────────────────────────────────────────
  let tenantId: string;
  let userId:   string;

  try {
    const ctx = await getTenantContext(adminDb, uid);
    tenantId  = ctx.tenantId;
    userId    = ctx.userId;
  } catch (e: unknown) {
    console.error('[ai-gateway] getTenantContext error:', (e as Error)?.message);
    return jsonError('Usuário sem tenant associado. Entre em contato com o suporte.', 403);
  }

  // ── 3. Parsear e validar payload ────────────────────────────────────────────
  let body: GatewayPayload;
  try {
    body = await req.json() as GatewayPayload;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const { task, prompt, imageBase64, creditsRequired = 0, requestType, studentId, documentType } = body;

  if (!task || !['text', 'json', 'image', 'document'].includes(task)) {
    return jsonError('Campo "task" inválido. Valores aceitos: text, json, image, document', 400);
  }
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return jsonError('Campo "prompt" é obrigatório e não pode estar vazio', 400);
  }
  if (prompt.length > 32_000) {
    return jsonError('Prompt excede o limite de 32.000 caracteres', 400);
  }

  const cost = Number(creditsRequired) || 0;

  // ── 4. Verificar créditos ────────────────────────────────────────────────────
  let wallet: Awaited<ReturnType<typeof checkCredits>> = null;

  if (cost > 0) {
    try {
      wallet = await checkCredits(adminDb, tenantId, cost);
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? '';
      if (msg.startsWith('INSUFFICIENT_CREDITS:')) {
        const [, balance, required] = msg.split(':');
        console.info(`[ai-gateway] Créditos insuficientes — tenant=${tenantId} saldo=${balance} necessário=${required}`);
        return jsonError(
          `Créditos insuficientes. Saldo atual: ${balance} crédito(s). Necessário: ${required}.`,
          402,
        );
      }
      // Erro inesperado ao ler wallet — permite a operação (mesma regra do frontend)
      console.warn('[ai-gateway] Erro ao verificar créditos (operação permitida):', msg);
    }
  }

  // ── 5. Criar registro de auditoria (pending) ────────────────────────────────
  let auditId: string | null = null;

  if (requestType) {
    auditId = await createAuditRecord(adminDb, {
      tenantId,
      userId,
      requestType,
      model:           modelForTask(task === 'document' ? 'json' : task),
      creditsConsumed: cost,
      inputSummary:    { task, promptLength: prompt.length },
    });
  }

  // ── 5.5 Carregar Contexto Canônico (se task=document) ──────────────────────
  let finalPrompt = prompt;
  let contextWarnings: string[] = [];
  let missingSources: string[] = [];

  if (task === 'document') {
    if (!studentId) return jsonError('O campo studentId é obrigatório para task="document"', 400);
    try {
      const ctx = await buildCanonicalContext(adminDb, studentId, tenantId);
      contextWarnings = ctx.warnings;
      missingSources = ctx.missingOptionalSources;

      if (contextWarnings.length > 0) {
        console.info('[ai-gateway] Contexto gerado com warnings opcionais:', contextWarnings);
      }

      finalPrompt = `${prompt}\n\n[DADOS CANÔNICOS DO ALUNO]\n${JSON.stringify(ctx.data)}`;
    } catch (e: any) {
      console.error('[ai-gateway] Erro ao construir contexto:', e.message);
      const isCritical = e.message.includes('CRITICAL');
      return jsonError(`Falha nos dados do aluno: ${e.message}`, isCritical ? 400 : 500);
    }
  }

  // ── 6. Chamar o provider com Retry, Timeout e Validação ──────────────────────
  const t0 = Date.now();
  let result: string;
  let parsedDocument: any = null;
  let providerError: string | null = null;

  try {
    const aiCall = async () => {
      if (task === 'image') {
        return await generateVertexImage(finalPrompt.trim());
      } else if (task === 'json' || task === 'document') {
        return await generateGeminiJSON(finalPrompt.trim());
      } else {
        const img = typeof imageBase64 === 'string' && imageBase64.length > 0 ? imageBase64 : undefined;
        return await generateGeminiText(finalPrompt.trim(), img);
      }
    };

    // 0 retries, 90s timeout — janela única que cobre Gemini 2.5 Flash em JSON longo
    // Sem retry: evita dupla execução concorrente que esgotava o limite de 150s
    result = await callAIWithRetryAndTimeout(aiCall, 0, 90_000);

    if (task === 'json' || task === 'document') {
      parsedDocument = await validateAndRepair(result);
      result = JSON.stringify(parsedDocument); // Formata com segurança para o Audit
    }
  } catch (e: unknown) {
    providerError = (e instanceof Error ? e.message : String(e)) || 'PROVIDER_ERROR';
    const latencyMs = Date.now() - t0;

    // Completar auditoria como failed (não critico — falha silenciosa)
    if (auditId) {
      await completeAuditRecord(adminDb, auditId, {
        status:    'failed',
        latencyMs,
        content:   providerError.slice(0, 500),
      });
    }

    console.error('[ai-gateway] Provider error:', providerError);
    return jsonError(friendlyError(providerError), 500);
  }

  const latencyMs = Date.now() - t0;

  // ── 7. Debitar créditos após sucesso ─────────────────────────────────────────
  let creditsRemaining: number | undefined = undefined;

  if (cost > 0 && wallet) {
    try {
      creditsRemaining = await debitCredits(
        adminDb, wallet, tenantId, userId, cost,
        `IA: ${requestType ?? task}`,
      );
    } catch (e: unknown) {
      // Débito falhou — log e continua (frontend debitará como fallback durante 2A)
      console.error('[ai-gateway] debitCredits failed (frontend debitará):', (e as Error)?.message);
      creditsRemaining = undefined;
    }
  }

  // ── 8. Completar auditoria (success) ─────────────────────────────────────────
  if (auditId) {
    const outputSample = task === 'image'
      ? '[imagem gerada]'
      : result.slice(0, 500);

    await completeAuditRecord(adminDb, auditId, {
      status:     'success',
      latencyMs,
      outputType: outputTypeForTask(task),
      content:    outputSample,
    });
  }

  // ── 8.5 Persistir documento gerado no banco de dados (M05) ───────────────────
  let documentId: string | undefined = undefined;
  if (task === 'document' && parsedDocument) {
    try {
      const { data: docData, error: docErr } = await adminDb.from('documents').insert({
        tenant_id: tenantId,
        student_id: studentId,
        doc_type: documentType || 'RELATORIO',
        structured_data: parsedDocument,
        status: 'DRAFT'
      }).select('id').single();

      if (docErr) {
        console.error('[ai-gateway] Erro ao persistir documento na tabela:', docErr.message);
      } else {
        documentId = docData.id;
      }
    } catch (err) {
      console.error('[ai-gateway] Exceção ao persistir documento:', err);
    }
  }

  // ── 9. Retornar resultado ────────────────────────────────────────────────────
  const response: Record<string, unknown> = {
    result: parsedDocument !== null ? parsedDocument : result
  };

  if (task === 'document') {
    response.warnings = contextWarnings;
    response.missingOptionalSources = missingSources;
    if (documentId) response.documentId = documentId;
  }

  if (creditsRemaining !== undefined) response.creditsRemaining = creditsRemaining;
  if (auditId)                         response.auditId         = auditId;

  return jsonOk(response);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status:  200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function friendlyError(raw: string): string {
  if (raw.includes('CONFIG_GEMINI'))       return 'Serviço de texto IA não configurado. Contate o suporte.';
  if (raw.includes('CONFIG_VERTEX_IMAGE')) return 'Serviço de imagem IA não configurado. Contate o suporte.';
  if (raw.includes('429') || raw.includes('QUOTA')) return 'Limite de uso da IA atingido. Aguarde alguns instantes.';
  if (raw.includes('403'))                 return 'Sem permissão para acessar o modelo de IA. Verifique a service account.';
  if (raw.includes('AbortError') || raw.includes('aborted') || raw.includes('TIMEOUT_EXCEEDED')) return 'Tempo de resposta da IA excedido. Tente novamente.';
  if (raw.includes('VALIDATION_ERROR'))    return 'A IA gerou um documento com formato inválido. Tente novamente.';
  return 'Ocorreu um erro ao processar sua solicitação. Tente novamente.';
}
