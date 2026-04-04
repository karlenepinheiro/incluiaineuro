/**
 * purchaseActivationService.ts
 *
 * Helpers para o fluxo de pós-pagamento Kiwify.
 *
 * Fluxo geral:
 *   1. Usuário paga na Kiwify (com ou sem estar logado)
 *   2. Webhook salva registro em kiwify_purchases com e-mail do comprador
 *   3. Usuário volta ao app → ActivationView
 *   4. checkPurchaseByEmail() verifica se há compra aprovada
 *   5. activatePurchaseForUser() vincula a compra ao tenant e ativa o plano
 *
 * As operações de banco são executadas via RPC com SECURITY DEFINER,
 * portanto não dependem de RLS do cliente.
 */

import { supabase } from './supabase';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface PurchaseCheckResult {
  /** true se existe alguma compra (aprovada ou pendente) para o e-mail */
  found: boolean;
  /** Status da compra encontrada */
  status?: 'APPROVED' | 'PENDING';
  /** Código do plano: 'PRO' | 'MASTER' | null (para créditos avulsos) */
  plan_code?: string | null;
  /** Créditos avulsos (0 para assinaturas) */
  credits?: number;
  /** ID da compra — necessário para chamar activatePurchaseForUser */
  purchase_id?: string;
}

export interface ActivationResult {
  ok: boolean;
  /** Código do plano ativado */
  plan?: string | null;
  /** Créditos concedidos */
  credits_granted?: number;
  /** Motivo em caso de falha */
  reason?: string;
}

// ── Funções ───────────────────────────────────────────────────────────────────

/**
 * Verifica se existe uma compra aprovada (e ainda não ativada) para o e-mail.
 * Pode ser chamada sem autenticação — útil para verificar antes do cadastro.
 *
 * @returns PurchaseCheckResult com found=true e status='APPROVED' se houver compra válida.
 */
export async function checkPurchaseByEmail(email: string): Promise<PurchaseCheckResult> {
  const { data, error } = await supabase.rpc('check_purchase_by_email', {
    p_email: email.toLowerCase().trim(),
  });
  if (error) throw error;
  return (data as PurchaseCheckResult) ?? { found: false };
}

/**
 * Ativa a compra para o usuário autenticado atualmente.
 * Requer que o usuário esteja logado com o mesmo e-mail da compra.
 *
 * O que faz internamente (via RPC SECURITY DEFINER):
 *   - Vincula purchase_id ao tenant_id do usuário
 *   - Atualiza subscriptions: status=ACTIVE, plan_id, current_period_end
 *   - Adiciona créditos em credits_wallet + lança ledger
 *   - Marca kiwify_purchases.activated_at
 *
 * @param purchaseId - ID retornado por checkPurchaseByEmail
 */
export async function activatePurchaseForUser(purchaseId: string): Promise<ActivationResult> {
  const { data, error } = await supabase.rpc('activate_purchase_for_user', {
    p_purchase_id: purchaseId,
  });
  if (error) throw error;
  return (data as ActivationResult) ?? { ok: false, reason: 'empty_response' };
}