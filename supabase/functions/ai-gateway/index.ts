import { serverCreditOperation } from '../_shared/creditCatalog.ts';
import { runLabPipeline, type LabPipeline } from './_pipeline.ts';
import { financialValidationKey, validateFinancialDelivery } from './_financialValidation.ts';
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
import { checkResultUsability } from './_usability.ts';
import { sanitizeStructuredResult, validateStructuredResult } from './_resultValidation.ts';
import { clampPromptContext, logPromptBudget } from './_promptBudget.ts';
import {
  validateGatewayImages,
  friendlyImagesValidationError,
  validateGatewayPageNumbers,
  friendlyPageNumbersValidationError,
} from './_imagesValidation.ts';
import { friendlyError } from './_friendlyError.ts';

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
  operation?: string;
  pipeline?: LabPipeline;
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
  /**
   * Quando true: reserva créditos mas NÃO commita após a IA.
   * Retorna reservationId para o frontend confirmar/liberar após salvar no banco.
   * A reserva expira em 30 minutos automaticamente.
   */
  deferCommit?: boolean;
  /**
   * Quando definido (só válido para task 'json'/'document'), o consumo de
   * créditos só é confirmado (commit) se a resposta validada contiver um
   * array não vazio em `arrayField` — e, se `minAverageConfidence` +
   * `confidenceField` forem informados, também exige que a média desse
   * campo nos itens do array atinja o limite. Caso contrário, a reserva é
   * liberada e a chamada é tratada como falha (nenhum crédito consumido).
   *
   * Sprint "consumo no momento certo" (26/08/2026): permite reaproveitar o
   * caminho de commit IMEDIATO já existente para tarefas onde "resposta
   * tecnicamente válida" não é o mesmo que "resultado utilizável" — sem
   * precisar de uma segunda chamada do frontend para confirmar/liberar
   * depois. Não afeta nenhuma chamada que não informe este campo.
   */
  usabilityCheck?: {
    arrayField: string;
    minAverageConfidence?: number;
    confidenceField?: string;
  };
  /**
   * Leitura multipágina (extensão ADITIVA e retrocompatível de `imageBase64`,
   * restaurada em 06/09/2026 — regressão C-1): várias páginas do MESMO
   * documento (data URLs, em ordem) enviadas numa ÚNICA chamada multimodal.
   * Validado por `validateGatewayImages` ANTES de qualquer reserva de crédito.
   * Ausente ⇒ nenhuma chamada existente muda de comportamento. Continua sendo
   * UMA operação: um operationId, uma reserva, uma análise, um commit — nunca
   * reserva por página.
   */
  images?: unknown;
  /**
   * Números de página REAIS (1-indexado, mesmo tamanho de `images`) — evita
   * que o rótulo enviado ao modelo renumere por posição páginas do meio
   * descartadas (ex.: em branco). Ver _multiPageParts.ts.
   */
  pageNumbers?: unknown;
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
    deferCommit = false,
    usabilityCheck,
    images: rawImages,
    pageNumbers: rawPageNumbers,
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

  // Leitura multipágina (regressão C-1): valida o campo opcional `images`
  // ANTES de qualquer reserva de crédito ou chamada ao provider — payload
  // inválido/acima do limite falha cedo e sem custo. Campo ausente
  // (`rawImages === undefined`) é o caso normal de toda chamada que só usa
  // `imageBase64`: `images` fica undefined e nada muda.
  const imagesValidation = validateGatewayImages(rawImages);
  if (!imagesValidation.ok) {
    return jsonError(friendlyImagesValidationError(imagesValidation.reason!), 400);
  }
  const images = imagesValidation.images;

  // Correção de numeração: valida `pageNumbers` — só faz sentido junto de
  // `images`; sem `images`, qualquer `pageNumbers` enviado é ignorado.
  const pageNumbersValidation = images
    ? validateGatewayPageNumbers(rawPageNumbers, images.length)
    : { ok: true as const, pageNumbers: undefined };
  if (!pageNumbersValidation.ok) {
    return jsonError(friendlyPageNumbersValidationError(pageNumbersValidation.reason!), 400);
  }
  const pageNumbers = pageNumbersValidation.pageNumbers;

  let financial: ReturnType<typeof serverCreditOperation>;
  try { financial = serverCreditOperation(body); } catch (e) { return jsonError((e as Error).message,400); }
  if(deferCommit) return jsonError('Client-controlled credit completion is disabled',400);
  if(!operationId?.trim() || operationId.length>160) return jsonError('Stable operationId required',400);
  const cost = financial.cost;
  const baseOperationId = tenantId + ':' + operationId.trim();
  if(body.pipeline && (!financial.code.startsWith('INCLUILAB_') || task!=='json'))return jsonError('Invalid pipeline',400);
  for(const value of [body.pipeline?.analysisPrompt,body.pipeline?.imagePrompt]) {
    if(value !== undefined && (typeof value!=='string'||value.length>32000))return jsonError('Invalid pipeline prompt',400);
  }
  const canonicalInput = { ...body, operation: financial.code, creditsRequired: undefined, operationId: undefined, deferCommit: undefined };
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonicalInput)));
  const fingerprint = Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  let jobAttempt: number;

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

  // Orçamento do CONTEXTO montado pelo servidor: o prompt cliente já passou no
  // limite de 32k, mas o contexto canônico anexado pode empurrá-lo além do que
  // o provedor aceita. Recorta por seções inteiras, do fim (menor prioridade).
  // (auditoria 30/08/2026 — M-08)
  const SERVER_CONTEXT_BUDGET = 15_000;
  const budgetContext = (formatted: string): string => {
    const clamped = clampPromptContext(formatted, SERVER_CONTEXT_BUDGET);
    logPromptBudget(`gateway:${requestType ?? task}`, clamped.metrics);
    return clamped.text;
  };

  if (task === 'document') {
    if (!studentId) return jsonError('O campo studentId e obrigatorio para task="document"', 400);
    try {
      const ctx = await buildCanonicalContext(adminDb, studentId, tenantId);
      contextWarnings = ctx.warnings;
      missingSources = ctx.missingOptionalSources;

      const formatted = formatContextForPrompt(ctx.data, targetDocType || documentType || '');
      finalPrompt = formatted ? `${prompt}${budgetContext(formatted)}` : prompt;
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
        finalPrompt = `${prompt}${budgetContext(formatted)}`;
      }
    } catch (e: any) {
      console.warn('[ai-gateway] buildContextServer falhou (usando prompt original):', e.message);
      contextWarnings.push(`Contexto do servidor indisponivel: ${e.message}`);
    }
  }

  // Salvaguarda final: se ainda assim o prompt final exceder o limite rígido,
  // recorta o CONTEXTO (nunca a instrução, que fica no início). Isso não deve
  // acontecer depois do orçamento acima — é rede de segurança.
  if (finalPrompt.length > 32_000 && finalPrompt.length > prompt.length) {
    const extra = clampPromptContext(finalPrompt.slice(prompt.length), Math.max(0, 31_000 - prompt.length));
    finalPrompt = prompt + extra.text;
    logPromptBudget(`gateway:hardcap:${requestType ?? task}`, extra.metrics);
  }

  let reservationId: string | null = null;
  const { data: job, error: jobError } = await adminDb.rpc('begin_ai_financial_job', {
    p_id: baseOperationId,p_tenant_id:tenantId,p_user_id:userId,p_operation:financial.code,p_fingerprint:fingerprint,p_amount:cost,
  });
  if(jobError) return jsonError('Nao foi possivel iniciar a operacao financeira.',409);
  if(job.state==='cached') return jsonOk(job.response);
  if(job.state==='busy') return jsonError('Operacao em andamento; repita com o mesmo identificador.',409);
  if(job.state==='denied') return jsonError('Creditos insuficientes.',402);
  reservationId=job.reservation_id; jobAttempt=job.attempt;
  const finish = async (success: boolean, response: unknown) => {
    const {data,error}=await adminDb.rpc('finish_ai_financial_job',{p_id:baseOperationId,p_attempt:jobAttempt,p_success:success,p_response:response});
    if(error) throw error;
    return data;
  };

  const t0 = Date.now();
  let result: string;
  let parsedDocument: any = null;
  let providerError: string | null = null;

  try {
    const aiCall = async () => {
      if(body.pipeline) {
        return JSON.stringify(await runLabPipeline(financial.code,finalPrompt,imageBase64,body.pipeline,{
          text:generateGeminiText,json:generateGeminiJSON,image:generateVertexImage,
        },validateAndRepair));
      }
      if (task === 'image') {
        return await generateVertexImage(finalPrompt.trim());
      }
      const img = typeof imageBase64 === 'string' && imageBase64.length > 0 ? imageBase64 : undefined;
      if (task === 'json' || task === 'document') {
        // Leitura multipágina: `images` (já validado acima) tem precedência
        // sobre `imageBase64` — ver _vertex.ts/_multiPageParts.ts. Continua
        // sendo UMA chamada ao provider, um resultado, um commit.
        return await generateGeminiJSON(finalPrompt.trim(), img, images, pageNumbers);
      }
      return await generateGeminiText(finalPrompt.trim(), img);
    };

    result = await callAIWithRetryAndTimeout(aiCall, 0, 90_000);

    if(!result || !result.trim()) throw new Error('EMPTY_DELIVERY');
    if (task === 'json' || task === 'document') {
      parsedDocument = await validateAndRepair(result);

      if(!parsedDocument || typeof parsedDocument!=='object' || Object.keys(parsedDocument).length===0)throw new Error('EMPTY_DELIVERY');
      // Saneamento determinístico (auditoria 30/08/2026): remove itens/blocos
      // compostos apenas de texto-molde ("[Nome do jogo]", "[descrição
      // específica]"). Só REMOVE conteúdo claramente-placeholder — nunca
      // inventa nem reescreve. requestType fora de {plano_acao, plano_acao_aee,
      // perfil_inteligente} passa inalterado.
      parsedDocument = sanitizeStructuredResult(parsedDocument, financialValidationKey(financial.code));
      result = JSON.stringify(parsedDocument);

      // Gate de "resultado utilizável" — ver GatewayPayload.usabilityCheck e
      // _usability.ts (função pura, testada isoladamente). Lança dentro deste
      // mesmo try/catch de propósito: reaproveita 100% do fluxo de liberação
      // de reserva + auditoria + resposta de erro já existente logo abaixo.
      const usability = checkResultUsability(parsedDocument, usabilityCheck);
      if (!usability.usable) {
        throw new Error(`UNUSABLE_RESULT: ${usability.reason ?? 'unknown'}`);
      }

      // Validação estrutural específica por requestType, ANTES do commit do
      // crédito. JSON válido ≠ resultado utilizável: blocos obrigatórios vazios,
      // placeholders remanescentes em campo obrigatório, resposta truncada ou
      // estrutura de outro tipo de documento falham aqui e liberam a reserva.
      // Aplicada só aos 3 requestType da auditoria; todo o resto passa livre.
      const structural = validateStructuredResult(parsedDocument, financialValidationKey(financial.code), result.length);
      if (!structural.usable) {
        throw new Error(
          `UNUSABLE_RESULT: ${structural.reason ?? 'STRUCTURE'}` +
          (structural.detail ? ` [${structural.detail}]` : ''),
        );
      }
      if(!body.pipeline) validateFinancialDelivery(financial.code,parsedDocument,task);
    }
  } catch (e: unknown) {
    providerError = (e instanceof Error ? e.message : String(e)) || 'PROVIDER_ERROR';
    const latencyMs = Date.now() - t0;

    try { await finish(false,{error:'generation_failed'}); }
    catch { console.error('[ai-gateway] Release pendente; sweeper recupera reserva.'); }

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
  const response: Record<string,unknown> = {result:parsedDocument ?? result};
  if(contextWarnings.length)response.warnings=contextWarnings;
  if(missingSources.length)response.missingOptionalSources=missingSources;
  if(auditId)response.auditId=auditId;
  // Durable delivery and credit commit share the same PostgreSQL transaction.
  if(task==='document')response._document={studentId,docType:documentType,title:documentType};
  try {
    const delivered=await finish(true,response);
    if(auditId) await completeAuditRecord(adminDb,auditId,{status:'success',latencyMs,outputType:outputTypeForTask(task),content:task==='image'?'[imagem gerada]':result.slice(0,500)}).catch(()=>{});
    return jsonOk(delivered);
  } catch {
    // A successful commit whose HTTP response was lost is recovered by the same job id.
    try {await finish(false,{error:'delivery_failed'});} catch {}
    return jsonError('Falha ao salvar entrega; repita a mesma operacao.',500);
  }
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
