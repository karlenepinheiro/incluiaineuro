/**
 * aiGatewayService.ts — Cliente frontend para a Edge Function ai-gateway
 *
 * Único ponto de contato do browser com IA.
 * O JWT do usuário logado é enviado automaticamente pelo cliente Supabase.
 *
 * Sub-etapa 2A: request agora inclui creditsRequired e requestType.
 * Response agora inclui creditsRemaining e auditId quando o servidor os debitar.
 */

import { supabase } from './supabase';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type AITask = 'text' | 'json' | 'image';

export interface AIGatewayRequest {
  task:              AITask;
  prompt:            string;
  imageBase64?:      string;
  /**
   * Créditos necessários para esta operação.
   * O servidor verificará o saldo ANTES de chamar a IA e debitará APÓS sucesso.
   * 0 ou undefined = sem verificação nem débito no servidor.
   */
  creditsRequired?:  number;
  /**
   * Tipo de operação para o registro de auditoria (ex: "protocol_pei", "activity").
   * undefined = sem registro de auditoria no servidor para esta chamada.
   */
  requestType?:      string;
}

export interface AIGatewayResponse {
  result:              string;
  /**
   * Saldo restante após o débito no servidor.
   * Definido somente quando o servidor efetivamente debitou os créditos.
   * undefined durante a 2A se o débito do servidor falhar (o frontend debitará como fallback).
   */
  creditsRemaining?:   number;
  /**
   * UUID do registro em ai_requests criado pelo servidor.
   * Definido somente quando requestType foi fornecido.
   */
  auditId?:            string;
}

// ─── Chamada principal ────────────────────────────────────────────────────────

export async function callAIGateway(req: AIGatewayRequest): Promise<AIGatewayResponse> {
  const { data, error } = await supabase.functions.invoke('ai-gateway', {
    body: req,
  });

  if (error) {
    let msg = (error as any)?.message ?? 'Erro na chamada ao gateway de IA';
    try {
      const body = await (error as any)?.context?.json?.();
      if (body?.error) msg = body.error;
    } catch { /* ignora se não conseguir ler o body */ }
    throw new Error(msg);
  }

  if (!data) throw new Error('Gateway de IA retornou resposta vazia');
  if (data.error) throw new Error(data.error as string);

  return data as AIGatewayResponse;
}
