/**
 * Edge Function: ai-gateway
 * Fluxo financeiro novo:
 *   reserve -> provider -> validate -> commit
 *   reserve -> failed/parse/timeout -> release
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jwtVerify, createRemoteJWKSet } from 'https://esm.sh/jose@5';
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
// Router + Providers. Contrato público de callAIGateway permanece inalterado.
import { getRouterConfig, selectProviderChain, shouldFallbackToNextProvider, type ProviderRegistry } from './_router.ts';
import { createGeminiProvider } from './_geminiProvider.ts';
import { createOpenAIProvider } from './_openaiProvider.ts';
import type { AIProvider, ProviderTask } from './_types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const JWKS = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

const providerRegistry: ProviderRegistry = {
  gemini: createGeminiProvider(),
  openai: createOpenAIProvider(),
};

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
   * caminho de commit IMEDIATO já existente (o mesmo usado por todo o resto
   * do produto, sem deferCommit) para tarefas onde "resposta tecnicamente
   * válida" não é o mesmo que "resultado utilizável" — sem precisar de uma
   * segunda chamada do frontend para confirmar/liberar depois. Não afeta
   * nenhuma chamada que não informe este campo.
   */
  usabilityCheck?: {
    arrayField: string;
    minAverageConfidence?: number;
    confidenceField?: string;
  };
  /**
   * Leitura multipágina (27/08/2026): extensão ADITIVA e retrocompatível de
   * `imageBase64` — várias páginas do MESMO documento (data URLs, em ordem),
   * enviadas numa ÚNICA chamada multimodal. Validado por
   * `validateGatewayImages` (_imagesValidation.ts) ANTES de qualquer reserva
   * de crédito. Quando ausente, nenhuma chamada existente muda de
   * comportamento — `imageBase64` continua funcionando exatamente como
   * antes. Continua sendo UMA operação: um operationId, uma reserva, uma
   * análise lógica, um commit — não há reserva por página.
   */
  images?: unknown;
  /**
   * Correção de 27/08/2026 (achado da validação de numeração): números de
   * página REAIS (1-indexado, mesmo tamanho de `images`) — evita que o
   * rótulo enviado ao modelo renumere por posição páginas do meio
   * descartadas (ex.: em branco). Ver _multiPageParts.ts.
   */
  pageNumbers?: unknown;
  /** Metadados opcionais só para auditoria (ai_requests.input_data) — nunca usados em decisão financeira. */
  pageCount?: number;
  pagesSkipped?: number;
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
    pageCount,
    pagesSkipped,
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

  // Leitura multipágina: valida ANTES de qualquer reserva de crédito ou
  // chamada ao provider — payload invalido/acima do limite falha cedo e sem
  // custo (mesmo espirito da validacao de provider logo abaixo). Campo
  // ausente (`rawImages === undefined`) e o caso normal de toda chamada que
  // nao usa leitura multipagina: `images` fica undefined e nada muda.
  const imagesValidation = validateGatewayImages(rawImages);
  if (!imagesValidation.ok) {
    return jsonError(friendlyImagesValidationError(imagesValidation.reason!), 400);
  }
  const images = imagesValidation.images;

  // Correção de numeração (27/08/2026): valida `pageNumbers` — só faz
  // sentido junto de `images`; sem `images`, qualquer `pageNumbers` enviado
  // é ignorado (não há nada para rotular).
  const pageNumbersValidation = images
    ? validateGatewayPageNumbers(rawPageNumbers, images.length)
    : { ok: true as const, pageNumbers: undefined };
  if (!pageNumbersValidation.ok) {
    return jsonError(friendlyPageNumbersValidationError(pageNumbersValidation.reason!), 400);
  }
  const pageNumbers = pageNumbersValidation.pageNumbers;

  // Resolve provider ANTES de qualquer reserva de crédito: configuração inválida
  // falha cedo e sem custo. Default seguro segue Gemini.
  const routerConfig = getRouterConfig();
  const providerTask: ProviderTask = task === 'document' ? 'json' : task;
  let providerChain: AIProvider[];
  try {
    providerChain = selectProviderChain(providerRegistry, routerConfig, providerTask, requestType);
  } catch (e: unknown) {
    const message = (e as Error)?.message || '';
    console.error('[ai-gateway] Router: falha ao resolver provider:', message);
    if (message.includes('desabilitado')) {
      return jsonError('Provider de IA selecionado esta desabilitado por configuracao. Contate o suporte.', 500);
    }
    return jsonError('Configuracao de IA invalida no momento. Contate o suporte.', 500);
  }
  const primaryProvider = providerChain[0];

  const cost = Number(creditsRequired) || 0;
  const baseOperationId = operationId?.trim() || crypto.randomUUID();

  let auditId: string | null = null;
  if (requestType) {
    auditId = await createAuditRecord(adminDb, {
      tenantId,
      userId,
      requestType,
      model: modelForTask(task === 'document' ? 'json' : task, primaryProvider.name),
      creditsConsumed: cost,
      inputSummary: {
        task,
        requestType,
        provider: primaryProvider.name,
        providerChain: providerChain.map(p => p.name),
        routerMode: routerConfig.mode,
        fallbackEnabled: routerConfig.fallbackEnabled,
        promptLength: prompt.length,
        operationId: baseOperationId,
        // Leitura multipágina — só metadados (contagem), nunca conteúdo:
        // nenhum base64/imagem/nome/diagnóstico entra em auditoria.
        ...(images ? { pagesProcessed: images.length } : {}),
        ...(!images && typeof imageBase64 === 'string' && imageBase64.length > 0 ? { pagesProcessed: 1 } : {}),
        ...(typeof pageCount === 'number' ? { pageCount } : {}),
        ...(typeof pagesSkipped === 'number' ? { pagesSkipped } : {}),
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
        // Quando deferCommit, a reserva expira em 30 min caso o frontend não confirme/libere
        expiresAt: deferCommit
          ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
          : null,
        metadata: {
          audit_id: auditId,
          student_id: studentId ?? null,
          document_type: documentType ?? null,
          target_doc_type: targetDocType || null,
          defer_commit: deferCommit,
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
  let providerUsed: AIProvider | null = null;
  let modelUsed: string | null = null;
  let usageUsed: Record<string, unknown> | undefined = undefined;
  let fallbackUsed = false;

  try {
    const callProvider = async (provider: AIProvider) => {
      if (task === 'image') {
        const imageResult = await provider.generateImage({ prompt: finalPrompt.trim() });
        return { text: imageResult.base64DataUrl, provider, model: imageResult.model, usage: undefined };
      }
      const imgInput = typeof imageBase64 === 'string' && imageBase64.length > 0 ? imageBase64 : undefined;
      if (task === 'json' || task === 'document') {
        // Leitura multipágina: `images` (já validado acima) tem precedência
        // sobre `imageBase64` — ver _types.ts/_geminiProvider.ts. Continua
        // sendo UMA chamada ao provider, um resultado, um commit.
        const jsonResult = await provider.generateJSON({ prompt: finalPrompt.trim(), imageBase64: imgInput, images, pageNumbers });
        return { text: jsonResult.text, provider, model: jsonResult.model, usage: jsonResult.usage };
      }
      const textResult = await provider.generateText({ prompt: finalPrompt.trim(), imageBase64: imgInput });
      return { text: textResult.text, provider, model: textResult.model, usage: textResult.usage };
    };

    let callResult: Awaited<ReturnType<typeof callProvider>> | null = null;
    let lastError: unknown;
    for (let index = 0; index < providerChain.length; index++) {
      const candidate = providerChain[index];
      try {
        callResult = await callAIWithRetryAndTimeout(() => callProvider(candidate), 0, 90_000);
        fallbackUsed = index > 0;
        break;
      } catch (e: unknown) {
        lastError = e;
        const canFallback = index < providerChain.length - 1 && shouldFallbackToNextProvider(e);
        if (!canFallback) throw e;
        console.warn('[ai-gateway] Provider recuperavel falhou; tentando fallback:', candidate.name);
      }
    }

    if (!callResult) throw lastError ?? new Error('PROVIDER_CHAIN_EMPTY');
    result = callResult.text;
    providerUsed = callResult.provider;
    modelUsed = callResult.model;
    usageUsed = callResult.usage;

    if (task === 'json' || task === 'document') {
      parsedDocument = await validateAndRepair(result);

      // Saneamento determinístico (auditoria 30/08/2026): remove itens/blocos
      // compostos apenas de texto-molde ("[Nome do jogo]", "[descrição
      // específica]"). Só REMOVE conteúdo claramente-placeholder — nunca
      // inventa nem reescreve. requestType fora de {plano_acao, plano_acao_aee,
      // perfil_inteligente} passa inalterado.
      parsedDocument = sanitizeStructuredResult(parsedDocument, requestType);
      result = JSON.stringify(parsedDocument);

      // Gate de "resultado utilizável" — ver GatewayPayload.usabilityCheck e
      // _usability.ts (função pura, testada isoladamente). Lança dentro
      // deste mesmo try/catch de propósito: reaproveita 100% do fluxo de
      // liberação de reserva + auditoria + resposta de erro já existente
      // logo abaixo, sem duplicar nenhuma lógica financeira.
      const usability = checkResultUsability(parsedDocument, usabilityCheck);
      if (!usability.usable) {
        throw new Error(`UNUSABLE_RESULT: ${usability.reason ?? 'unknown'}`);
      }

      // Validação estrutural específica por requestType, ANTES do commit do
      // crédito. JSON válido ≠ resultado utilizável: blocos obrigatórios vazios,
      // placeholders remanescentes em campo obrigatório, resposta truncada ou
      // estrutura de outro tipo de documento falham aqui e liberam a reserva.
      // Aplicada só aos 3 requestType da auditoria; todo o resto passa livre.
      const structural = validateStructuredResult(parsedDocument, requestType, result.length);
      if (!structural.usable) {
        throw new Error(
          `UNUSABLE_RESULT: ${structural.reason ?? 'STRUCTURE'}` +
          (structural.detail ? ` [${structural.detail}]` : ''),
        );
      }
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
            provider: providerUsed?.name ?? primaryProvider.name,
            model: modelUsed,
            fallback_used: fallbackUsed,
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
    if (deferCommit) {
      // Não commita agora — o frontend vai confirmar/liberar após salvar no banco
      console.info('[ai-gateway] deferCommit=true — reserva mantida:', reservationId);
    } else {
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
            request_type: requestType ?? null,
            provider: providerUsed?.name ?? primaryProvider.name,
            model: modelUsed,
            fallback_used: fallbackUsed,
            usage: usageUsed ?? null,
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
  if (deferCommit && reservationId) response.reservationId = reservationId;
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
  if (raw.includes('CONFIG_OPENAI')) return 'Servico OpenAI nao configurado. Contate o suporte.';
  if (raw.includes('OPENAI_AUTH_ERROR')) return 'Servico OpenAI sem autorizacao. Contate o suporte.';
  if (raw.includes('OPENAI_RATE_LIMIT')) return 'Limite de uso da OpenAI atingido. Aguarde alguns instantes.';
  if (raw.includes('OPENAI_PROVIDER_UNAVAILABLE')) return 'Servico OpenAI temporariamente indisponivel. Tente novamente.';
  if (raw.includes('OPENAI_INVALID_RESPONSE')) return 'A OpenAI retornou um formato invalido. Tente novamente.';
  if (raw.includes('OPENAI_SAFETY')) return 'A solicitacao foi recusada pela politica de seguranca da IA.';
  if (raw.includes('429') || raw.includes('QUOTA')) return 'Limite de uso da IA atingido. Aguarde alguns instantes.';
  if (raw.includes('403')) return 'Sem permissao para acessar o modelo de IA. Verifique a service account.';
  if (raw.includes('AbortError') || raw.includes('aborted') || raw.includes('TIMEOUT_EXCEEDED') || raw.includes('OPENAI_TIMEOUT')) {
    return 'Tempo de resposta da IA excedido. Tente novamente.';
  }
  if (raw.includes('VALIDATION_ERROR')) return 'A IA gerou um documento com formato invalido. Tente novamente.';
  if (raw.includes('UNUSABLE_RESULT')) return 'Nao foi possivel identificar dados utilizaveis no documento. Nenhum credito foi consumido.';
  return 'Ocorreu um erro ao processar sua solicitacao. Tente novamente.';
}
