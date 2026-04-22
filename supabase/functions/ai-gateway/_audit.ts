/**
 * _audit.ts — Registro de auditoria de IA no servidor (Sub-etapa 2A)
 *
 * Replica a interface do AiAuditService do frontend, mas com dados reais:
 *   - latência medida do provider (não do frontend)
 *   - modelo real utilizado
 *   - conteúdo do output direto da resposta do provider
 *
 * Tabelas: ai_requests, ai_outputs (mesmo schema do persistenceService.ts)
 *
 * Durante 2A, o frontend ainda registra sua própria auditoria em paralelo.
 * Isso resulta em registros duplicados, intencionais e rastreáveis:
 *   - Registros do gateway: request_type sem prefixo (ex: "protocol_pei")
 *   - Registros do frontend: idem, mas com latência e conteúdo estimados
 *
 * Na 2B, as chamadas ao AiAuditService do frontend serão removidas.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Criação do registro ──────────────────────────────────────────────────────

export interface AuditCreateParams {
  tenantId:         string;
  userId:           string;
  requestType:      string;
  model:            string;
  creditsConsumed:  number;
  inputSummary?:    Record<string, unknown>;
}

/**
 * Insere um ai_request com status 'pending'.
 * Retorna o UUID do registro ou null se falhar (auditoria não é crítica).
 */
export async function createAuditRecord(
  adminDb: SupabaseClient,
  params:  AuditCreateParams,
): Promise<string | null> {
  try {
    const { data, error } = await adminDb
      .from('ai_requests')
      .insert({
        tenant_id:        params.tenantId,
        user_id:          params.userId,
        request_type:     params.requestType,
        model:            params.model,
        credits_consumed: params.creditsConsumed,
        input_data:       params.inputSummary ?? {},
        status:           'pending',
      })
      .select('id')
      .single();

    if (error) throw error;
    return (data as any)?.id ?? null;
  } catch (e: any) {
    console.warn('[_audit] createAuditRecord warn (não crítico):', e?.message);
    return null;
  }
}

// ─── Conclusão do registro ────────────────────────────────────────────────────

export interface AuditCompleteParams {
  status:      'success' | 'failed';
  latencyMs:   number;
  outputType?: string;
  content?:    string;
}

/**
 * Atualiza o ai_request e insere o ai_output correspondente.
 * Silencia falhas — auditoria nunca deve impactar a resposta ao usuário.
 */
export async function completeAuditRecord(
  adminDb:   SupabaseClient,
  requestId: string,
  params:    AuditCompleteParams,
): Promise<void> {
  try {
    await adminDb
      .from('ai_requests')
      .update({
        status:       params.status,
        latency_ms:   params.latencyMs,
        completed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (params.content) {
      await adminDb.from('ai_outputs').insert({
        request_id:  requestId,
        output_type: params.outputType ?? 'text',
        content:     params.content.slice(0, 20000),
      });
    }
  } catch (e: any) {
    console.warn('[_audit] completeAuditRecord warn (não crítico):', e?.message);
  }
}

// ─── Helper: modelo por task ──────────────────────────────────────────────────

export function modelForTask(task: string): string {
  if (task === 'image') return 'imagen-4.0';
  return 'gemini-2.5-flash';
}

// ─── Helper: tipo de output por task ─────────────────────────────────────────

export function outputTypeForTask(task: string): string {
  if (task === 'image') return 'image';
  if (task === 'json')  return 'json';
  return 'text';
}
