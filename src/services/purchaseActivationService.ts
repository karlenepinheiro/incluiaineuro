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
  /**
   * Chave do produto identificado pelo webhook.
   * 'UNKNOWN' indica que o produto não foi reconhecido — ativação deve ser bloqueada.
   * Exemplos válidos: 'PRO_MONTHLY', 'MASTER_MONTHLY', 'CREDITS_100', 'CREDITS_300', 'CREDITS_900'
   */
  product_key?: string;
  /** ID da compra — necessário para chamar activatePurchaseForUser */
  purchase_id?: string;
}

export interface ActivationResult {
  ok: boolean;
  /** Código do plano ativado (null para compras de créditos avulsos) */
  plan?: string | null;
  /** Créditos concedidos */
  credits_granted?: number;
  /**
   * Motivo em caso de falha:
   *   'not_authenticated'          — usuário não logado
   *   'already_activated'          — compra já ativada anteriormente (ok=true)
   *   'unknown_product'            — produto não reconhecido pelo webhook
   *   'tenant_not_found'           — perfil do usuário ainda não criado
   *   'credits_require_subscription' — usuário FREE tentou ativar créditos avulsos
   */
  reason?: string;
  /** Mensagem amigável para exibir ao usuário final */
  message?: string;
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
 *   - Rejeita produto UNKNOWN sem preencher activated_at
 *   - Para planos: cria/atualiza subscriptions + concede créditos do plano
 *   - Para créditos avulsos: verifica assinatura PRO/MASTER ativa antes de conceder
 *   - Marca kiwify_purchases.activated_at apenas após entrega bem-sucedida
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
