/**
 * Edge Function: ai-gateway
 * Fluxo financeiro novo:
 *   reserve -> provider -> validate -> commit
 *   reserve -> failed/parse/timeout -> release
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jwtVerify, createRemoteJWKSet } from 'https://esm.sh/jose@5';
import { generateGeminiText, generateGeminiJSON, generateVertexImage } from './_vertex.ts';
import {
  getTenantContext,
  reserveCredits,
  commitReservedCredits,
  releaseReservedCredits,
} from './_credits.ts';
import {
  createAuditRecord,
  completeAuditRecord,
  modelForTask,
  outputTypeForTask,
} from './_audit.ts';
import { buildCanonicalContext } from './_contextBuilder.ts';
import { formatContextForPrompt } from './_contextFormatter.ts';
import { callAIWithRetryAndTimeout, validateAndRepair } from './_aiUtils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const JWKS = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GatewayPayload {
  task: 'text' | 'json' | 'image' | 'document';
  prompt: string;
  imageBase64?: string;
  creditsRequired?: number;
  operationId?: string;
  requestType?: string;
  studentId?: string;
  documentType?: string;
  buildContextServer?: boolean;
  targetDocType?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405);
  }

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
    if (!uid) throw new Error('JWT sem sub');
  } catch (e: unknown) {
    console.warn('[ai-gateway] JWT invalido:', (e as Error)?.message);
    return jsonError('Unauthorized', 401);
  }

  const adminDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  let tenantId: string;
  let userId: string;
  try {
    const ctx = await getTenantContext(adminDb, uid);
    tenantId = ctx.tenantId;
    userId = ctx.userId;
  } catch (e: unknown) {
    console.error('[ai-gateway] getTenantContext error:', (e as Error)?.message);
    return jsonError('Usuario sem tenant associado. Entre em contato com o suporte.', 403);
  }

  let body: GatewayPayload;
  try {
    body = await req.json() as GatewayPayload;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const {
    task,
    prompt,
    imageBase64,
    creditsRequired = 0,
    operationId,
    requestType,
    studentId,
    documentType,
    buildContextServer = false,
    targetDocType = '',
  } = body;

  if (!task || !['text', 'json', 'image', 'document'].includes(task)) {
    return jsonError('Campo "task" invalido. Valores aceitos: text, json, image, document', 400);
  }
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return jsonError('Campo "prompt" e obrigatorio e nao pode estar vazio', 400);
  }
  if (prompt.length > 32_000) {
    return jsonError('Prompt excede o limite de 32.000 caracteres', 400);
  }

  const cost = Number(creditsRequired) || 0;
  const baseOperationId = operationId?.trim() || crypto.randomUUID();

  let auditId: string | null = null;
  if (requestType) {
    auditId = await createAuditRecord(adminDb, {
      tenantId,
      userId,
      requestType,
      model: modelForTask(task === 'document' ? 'json' : task),
      creditsConsumed: cost,
      inputSummary: {
        task,
        promptLength: prompt.length,
        operationId: baseOperationId,
      },
    });
  }

  let finalPrompt = prompt;
  let contextWarnings: string[] = [];
  let missingSources: string[] = [];

  if (task === 'document') {
    if (!studentId) return jsonError('O campo studentId e obrigatorio para task="document"', 400);
    try {
      const ctx = await buildCanonicalContext(adminDb, studentId, tenantId);
      contextWarnings = ctx.warnings;
      missingSources = ctx.missingOptionalSources;

      const formatted = formatContextForPrompt(ctx.data, targetDocType || documentType || '');
      finalPrompt = formatted ? `${prompt}${formatted}` : prompt;
    } catch (e: any) {
      console.error('[ai-gateway] Erro ao construir contexto (document):', e.message);
      const isCritical = String((e as Error).message || '').includes('CRITICAL');
      return jsonError(`Falha nos dados do aluno: ${e.message}`, isCritical ? 400 : 500);
    }
  }

  if (task === 'json' && buildContextServer && studentId) {
    try {
      const ctx = await buildCanonicalContext(adminDb, studentId, tenantId);
      contextWarnings = ctx.warnings;
      missingSources = ctx.missingOptionalSources;
      const formatted = formatContextForPrompt(ctx.data, targetDocType);
      if (formatted) {
        finalPrompt = `${prompt}${formatted}`;
      }
    } catch (e: any) {
      console.warn('[ai-gateway] buildContextServer falhou (usando prompt original):', e.message);
      contextWarnings.push(`Contexto do servidor indisponivel: ${e.message}`);
    }
  }

  let reservationId: string | null = null;
  if (cost > 0) {
    try {
      const reservation = await reserveCredits(adminDb, {
        operationId: `${baseOperationId}:reserve`,
        tenantId,
        userId,
        amount: cost,
        description: `IA: ${requestType ?? task}`,
        requestType,
        task,
        metadata: {
          audit_id: auditId,
          student_id: studentId ?? null,
          document_type: documentType ?? null,
          target_doc_type: targetDocType || null,
        },
      });
      reservationId = reservation.reservationId;
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? '';
      if (msg.startsWith('INSUFFICIENT_CREDITS:')) {
        const [, balance, required] = msg.split(':');
        return jsonError(
          `Creditos insuficientes. Saldo atual: ${balance} credito(s). Necessario: ${required}.`,
          402,
        );
      }

      if (auditId) {
        await completeAuditRecord(adminDb, auditId, {
          status: 'failed',
          latencyMs: 0,
          content: `reserve_failed:${msg}`.slice(0, 500),
        });
      }

      console.error('[ai-gateway] reserveCredits failed:', msg);
      return jsonError('Nao foi possivel reservar creditos para esta operacao.', 500);
    }
  }

  const t0 = Date.now();
  let result: string;
  let parsedDocument: any = null;
  let providerError: string | null = null;

  try {
    const aiCall = async () => {
      if (task === 'image') {
        return await generateVertexImage(finalPrompt.trim());
      }
      if (task === 'json' || task === 'document') {
        return await generateGeminiJSON(finalPrompt.trim());
      }
      const img = typeof imageBase64 === 'string' && imageBase64.length > 0 ? imageBase64 : undefined;
      return await generateGeminiText(finalPrompt.trim(), img);
    };

    result = await callAIWithRetryAndTimeout(aiCall, 0, 90_000);

    if (task === 'json' || task === 'document') {
      parsedDocument = await validateAndRepair(result);
      result = JSON.stringify(parsedDocument);
    }
  } catch (e: unknown) {
    providerError = (e instanceof Error ? e.message : String(e)) || 'PROVIDER_ERROR';
    const latencyMs = Date.now() - t0;

    if (reservationId) {
      try {
        await releaseReservedCredits(adminDb, {
          operationId: `${baseOperationId}:release`,
          reservationId,
          tenantId,
          userId,
          description: `Falha IA: ${requestType ?? task}`,
          metadata: {
            failure_kind: 'provider_or_parse',
            provider_error: providerError,
            audit_id: auditId,
            latency_ms: latencyMs,
          },
        });
      } catch (releaseErr) {
        console.error('[ai-gateway] releaseReservedCredits failed:', releaseErr);
      }
    }

    if (auditId) {
      await completeAuditRecord(adminDb, auditId, {
        status: 'failed',
        latencyMs,
        content: providerError.slice(0, 500),
      });
    }

    console.error('[ai-gateway] Provider error:', providerError);
    return jsonError(friendlyError(providerError), 500);
  }

  const latencyMs = Date.now() - t0;
  let creditsRemaining: number | undefined = undefined;

  if (cost > 0 && reservationId) {
    try {
      creditsRemaining = await commitReservedCredits(adminDb, {
        operationId: `${baseOperationId}:commit`,
        reservationId,
        tenantId,
        userId,
        description: `IA: ${requestType ?? task}`,
        metadata: {
          audit_id: auditId,
          latency_ms: latencyMs,
          task,
        },
      });
    } catch (e: unknown) {
      console.error('[ai-gateway] commitReservedCredits failed:', (e as Error)?.message);

      try {
        await releaseReservedCredits(adminDb, {
          operationId: `${baseOperationId}:release_after_commit_failure`,
          reservationId,
          tenantId,
          userId,
          description: `Rollback reserva: ${requestType ?? task}`,
          metadata: {
            failure_kind: 'commit_failed',
            audit_id: auditId,
          },
        });
      } catch (releaseErr) {
        console.error('[ai-gateway] release after commit failure also failed:', releaseErr);
      }

      if (auditId) {
        await completeAuditRecord(adminDb, auditId, {
          status: 'failed',
          latencyMs,
          content: 'commit_failed',
        });
      }

      return jsonError('Falha ao concluir a transacao de creditos.', 500);
    }
  }

  if (auditId) {
    const outputSample = task === 'image' ? '[imagem gerada]' : result.slice(0, 500);
    await completeAuditRecord(adminDb, auditId, {
      status: 'success',
      latencyMs,
      outputType: outputTypeForTask(task),
      content: outputSample,
    });
  }

  let documentId: string | undefined = undefined;
  if (task === 'document' && parsedDocument) {
    try {
      const { data: docData, error: docErr } = await adminDb
        .from('documents')
        .insert({
          tenant_id: tenantId,
          student_id: studentId,
          doc_type: documentType || 'RELATORIO',
          structured_data: parsedDocument,
          status: 'DRAFT',
        })
        .select('id')
        .single();

      if (docErr) {
        console.error('[ai-gateway] Erro ao persistir documento na tabela:', docErr.message);
      } else {
        documentId = docData.id;
      }
    } catch (err) {
      console.error('[ai-gateway] Excecao ao persistir documento:', err);
    }
  }

  const response: Record<string, unknown> = {
    result: parsedDocument !== null ? parsedDocument : result,
  };

  if (task === 'document' || (task === 'json' && buildContextServer && studentId)) {
    if (contextWarnings.length > 0) response.warnings = contextWarnings;
    if (missingSources.length > 0) response.missingOptionalSources = missingSources;
    if (documentId) response.documentId = documentId;
  }

  if (creditsRemaining !== undefined) response.creditsRemaining = creditsRemaining;
  if (auditId) response.auditId = auditId;

  return jsonOk(response);
});

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
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
  if (raw.includes('CONFIG_GEMINI')) return 'Servico de texto IA nao configurado. Contate o suporte.';
  if (raw.includes('CONFIG_VERTEX_IMAGE')) return 'Servico de imagem IA nao configurado. Contate o suporte.';
  if (raw.includes('429') || raw.includes('QUOTA')) return 'Limite de uso da IA atingido. Aguarde alguns instantes.';
  if (raw.includes('403')) return 'Sem permissao para acessar o modelo de IA. Verifique a service account.';
  if (raw.includes('AbortError') || raw.includes('aborted') || raw.includes('TIMEOUT_EXCEEDED')) {
    return 'Tempo de resposta da IA excedido. Tente novamente.';
  }
  if (raw.includes('VALIDATION_ERROR')) return 'A IA gerou um documento com formato invalido. Tente novamente.';
  return 'Ocorreu um erro ao processar sua solicitacao. Tente novamente.';
}
