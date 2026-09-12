import { canonicalOperation } from '../../supabase/functions/_shared/creditCatalog';
/**
 * aiGatewayService.ts — Cliente frontend para a Edge Function ai-gateway
 *
 * Único ponto de contato do browser com IA.
 * O JWT do usuário logado é enviado automaticamente pelo cliente Supabase.
 */

import { supabase } from './supabase';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type AITask = 'text' | 'json' | 'image' | 'document';

export interface AIGatewayRequest {
  operation?: string;
  pipeline?: { analysisPrompt?: string; imagePrompt?: string };
  task:                AITask;
  prompt:              string;
  imageBase64?:        string;
  /**
   * Leitura multipágina (27/08/2026): várias páginas do MESMO documento
   * (data URLs, em ordem) — extensão aditiva e retrocompatível de
   * `imageBase64`. Ver ai-gateway/_imagesValidation.ts para os limites
   * (máx. 10 páginas) e formatos aceitos.
   */
  images?:             string[];
  /**
   * Correção de 27/08/2026 (numeração de páginas): números de página reais
   * (1-indexado, mesmo tamanho de `images`) do documento original — evita
   * que páginas descartadas no meio (ex.: em branco) façam o rótulo enviado
   * ao modelo renumerar as páginas restantes por posição.
   */
  pageNumbers?:        number[];
  creditsRequired?:    number;
  operationId?:        string;
  requestType?:        string;
  studentId?:          string;
  documentType?:       string;
  // Sprint IA-9: Opção C Híbrida — Edge monta contexto canônico via service_role
  buildContextServer?: boolean; // quando true: Edge busca contexto do aluno pelo studentId
  targetDocType?:      string;  // pei | paee | pdi | plano_acao_aee | plano_acao_regente | perfil_inteligente
  /**
   * Quando true: Edge reserva créditos mas não commita após a IA.
   * A resposta inclui reservationId para o frontend confirmar/liberar após salvar no banco.
   */
  deferCommit?:        boolean;
  /**
   * Quando definido (task 'json'/'document'), o Gateway só confirma o
   * consumo de créditos se a resposta validada contiver um array não vazio
   * em `arrayField` (e, opcionalmente, confiança média mínima em
   * `confidenceField`). Caso contrário, libera a reserva e retorna como
   * falha — tudo atomicamente, na mesma chamada. Ver ai-gateway/index.ts.
   */
  usabilityCheck?: {
    arrayField: string;
    minAverageConfidence?: number;
    confidenceField?: string;
  };
  /** Metadados opcionais só para auditoria (nunca usados em decisão financeira) — total real de páginas do documento de origem. */
  pageCount?: number;
  /** Metadados opcionais só para auditoria — quantas páginas foram descartadas por estarem em branco. */
  pagesSkipped?: number;
}

export interface AIGatewayResponse {
  result:                    string;
  creditsRemaining?:         number;
  auditId?:                  string;
  documentId?:               string;
  warnings?:                 string[];
  missingOptionalSources?:   string[];
  /** Presente quando deferCommit=true: ID da reserva a ser confirmada ou liberada pelo frontend */
  reservationId?:            string;
}

// ─── Chamada principal ────────────────────────────────────────────────────────

export async function callAIGateway(req: AIGatewayRequest): Promise<AIGatewayResponse> {
  let rawResponse: Response | undefined;
  const operation = canonicalOperation(req.operation ?? req.requestType);
  const canonical = {...req, operation};

  // supabase.functions.invoke não expõe o status HTTP diretamente.
  // Usamos fetch direto para ter acesso ao status e body em caso de erro.
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const supabaseUrl = (supabase as any).supabaseUrl as string;
  const anonKey    = (supabase as any).supabaseKey as string;

  const inputHash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({...canonical,operationId:undefined,creditsRequired:undefined})));
  const retryKey='ai-retry:'+session?.user.id+':'+Array.from(new Uint8Array(inputHash),b=>b.toString(16).padStart(2,'0')).join('');
  let retryId: string|null=null;
  try {retryId=sessionStorage.getItem(retryKey);} catch {}
  canonical.operationId=retryId??req.operationId??crypto.randomUUID();
  try {sessionStorage.setItem(retryKey,canonical.operationId);} catch {}
  try {
    rawResponse = await fetch(`${supabaseUrl}/functions/v1/ai-gateway`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        anonKey,
        'Authorization': token ? `Bearer ${token}` : `Bearer ${anonKey}`,
      },
      body: JSON.stringify(canonical),
    });
  } catch (networkErr: any) {
    // Erro de rede (sem conexão, DNS, etc.)
    throw new Error(`Sem conexão com o servidor de IA. Verifique sua internet. (${networkErr?.message})`);
  }

  // Lê o body uma única vez
  let body: any;
  try {
    body = await rawResponse.json();
  } catch {
    throw new Error(`Gateway de IA retornou resposta não-JSON (status ${rawResponse.status}).`);
  }

  if (!rawResponse.ok) {
    const serverMsg = body?.error ?? `Erro ${rawResponse.status} no servidor de IA`;

    // Diferencia os tipos de erro para o usuário
    if (rawResponse.status === 402) {
      throw new Error(`INSUFFICIENT_CREDITS: ${serverMsg}`);
    }
    if (rawResponse.status === 401 || rawResponse.status === 403) {
      throw new Error(`AUTH_ERROR: ${serverMsg}`);
    }
    if (rawResponse.status === 400) {
      throw new Error(`DATA_ERROR: ${serverMsg}`);
    }
    // 500 genérico — usa a mensagem amigável que o servidor já formatou
    throw new Error(serverMsg);
  }

  if (!body) throw new Error('Gateway de IA retornou resposta vazia.');
  if (body.error) throw new Error(body.error as string);

  // Para task 'document', result já é o objeto JSON parseado pelo servidor
  const result = typeof body.result === 'string'
    ? body.result
    : JSON.stringify(body.result);

  try {sessionStorage.removeItem(retryKey);} catch {}
  return {
    result,
    creditsRemaining:       body.creditsRemaining,
    auditId:                body.auditId,
    documentId:             body.documentId,
    warnings:               body.warnings,
    missingOptionalSources: body.missingOptionalSources,
    reservationId:          body.reservationId,
  };
}
