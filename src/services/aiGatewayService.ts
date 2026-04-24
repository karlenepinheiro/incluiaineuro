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
  task:              AITask;
  prompt:            string;
  imageBase64?:      string;
  creditsRequired?:  number;
  requestType?:      string;
  studentId?:        string;
  documentType?:     string;
}

export interface AIGatewayResponse {
  result:                    string;
  creditsRemaining?:         number;
  auditId?:                  string;
  documentId?:               string;
  warnings?:                 string[];
  missingOptionalSources?:   string[];
}

// ─── Chamada principal ────────────────────────────────────────────────────────

export async function callAIGateway(req: AIGatewayRequest): Promise<AIGatewayResponse> {
  let rawResponse: Response | undefined;

  // supabase.functions.invoke não expõe o status HTTP diretamente.
  // Usamos fetch direto para ter acesso ao status e body em caso de erro.
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const supabaseUrl = (supabase as any).supabaseUrl as string;
  const anonKey    = (supabase as any).supabaseKey as string;

  try {
    rawResponse = await fetch(`${supabaseUrl}/functions/v1/ai-gateway`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        anonKey,
        'Authorization': token ? `Bearer ${token}` : `Bearer ${anonKey}`,
      },
      body: JSON.stringify(req),
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

  return {
    result,
    creditsRemaining:       body.creditsRemaining,
    auditId:                body.auditId,
    documentId:             body.documentId,
    warnings:               body.warnings,
    missingOptionalSources: body.missingOptionalSources,
  };
}
