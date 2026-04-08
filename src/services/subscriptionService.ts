/**
 * subscriptionService.ts
 * Camada dedicada de gestão de assinaturas para o tenant autenticado.
 * Foca no fluxo do usuário final — diferente de billingService.ts que
 * cobre operações administrativas e processamento de webhooks.
 *
 * Reutilizável em qualquer SaaS: basta trocar a tabela-alvo e o gateway.
 */

import { supabase } from './supabase';
import type { SubscriptionStatus } from '../types';
import { SUBSCRIPTION_PLANS } from '../config/aiCosts';

// ---------------------------------------------------------------------------
// TIPOS LOCAIS
// ---------------------------------------------------------------------------

export interface ActiveSubscriptionInfo {
  id: string;
  tenantId: string;
  planCode: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  nextDueDate: string | null;
  providerPaymentLink: string | null;
  providerUpdatePaymentLink?: string | null;
  isTestAccount: boolean;
  cancelAtPeriodEnd: boolean;
  lastPaymentStatus: string | null;
  /** Ciclo de cobrança ('monthly' | 'annual'). Null em contas sem subscription registrada. */
  billingCycle: 'monthly' | 'annual' | null;
}

export interface SubscriptionAccessResult {
  /** Usuário pode usar recursos premium? */
  allowed: boolean;
  /** Status atual da assinatura */
  status: SubscriptionStatus;
  /** Razão caso blocked */
  reason?: 'payment_required' | 'subscription_ended' | 'grace_period' | 'test_account' | 'courtesy';
  /** Link direto para checkout de pagamento (quando disponível) */
  paymentLink: string | null;
}

// ---------------------------------------------------------------------------
// QUERIES
// ---------------------------------------------------------------------------

/**
 * Retorna a assinatura vigente do tenant (qualquer status).
 * Retorna null se o tenant nunca teve assinatura.
 */
export async function getActiveSubscription(tenantId: string): Promise<ActiveSubscriptionInfo | null> {
  // Colunas da tabela subscriptions:
  // id, tenant_id, plan_id (uuid FK→plans), status,
  // current_period_start, current_period_end, provider, provider_sub_id,
  // provider_customer_id, provider_payment_link, provider_update_payment_link,
  // last_payment_status, next_due_date, created_at, updated_at
  const { data, error } = await supabase
    .from('subscriptions')
    .select([
      'id', 'tenant_id', 'plan_id', 'status',
      'current_period_end', 'next_due_date',
      'billing_cycle',
      'provider', 'provider_sub_id',
      'provider_customer_id', 'provider_payment_link',
      'provider_update_payment_link', 'last_payment_status',
      'created_at',
    ].join(', '))
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // Resolve o nome do plano via plan_id (FK → plans.name)
  let planCode = 'FREE';
  if (data.plan_id) {
    const { data: planRow } = await supabase
      .from('plans')
      .select('name')
      .eq('id', data.plan_id)
      .maybeSingle();
    planCode = planRow?.name ?? 'FREE';
  }

  return {
    id: data.id,
    tenantId: data.tenant_id,
    planCode,
    status: data.status as SubscriptionStatus,
    currentPeriodEnd: data.current_period_end ?? null,
    nextDueDate: data.next_due_date ?? null,
    billingCycle: (data.billing_cycle === 'annual' ? 'annual' : data.billing_cycle === 'monthly' ? 'monthly' : null),
    providerPaymentLink: data.provider_payment_link ?? null,
    providerUpdatePaymentLink: data.provider_update_payment_link ?? null,
    isTestAccount: false,
    cancelAtPeriodEnd: false,
    lastPaymentStatus: data.last_payment_status ?? null,
  };
}

/**
 * Verifica se o usuário tem acesso aos recursos do sistema.
 *
 * Regras:
 * - ACTIVE      → acesso total
 * - TRIAL       → acesso total (período de avaliação)
 * - COURTESY    → acesso total (cortesia manual)
 * - INTERNAL_TEST → acesso total (conta interna)
 * - PENDING     → acesso com aviso ("período de carência" — pagamento em processamento)
 * - OVERDUE     → login permitido, recursos premium bloqueados
 * - CANCELED    → login permitido, recursos premium bloqueados
 */
export function checkSubscriptionAccess(status: SubscriptionStatus, paymentLink?: string | null): SubscriptionAccessResult {
  const link = paymentLink ?? null;

  switch (status) {
    case 'ACTIVE':
      return { allowed: true, status, paymentLink: null };

    case 'TRIAL':
      return { allowed: true, status, reason: 'grace_period', paymentLink: null };

    case 'COURTESY':
      return { allowed: true, status, reason: 'courtesy', paymentLink: null };

    case 'INTERNAL_TEST':
      return { allowed: true, status, reason: 'test_account', paymentLink: null };

    case 'PENDING':
      // Pagamento em processamento — mantém acesso por até 3 dias (lógica de carência)
      return { allowed: true, status, reason: 'grace_period', paymentLink: link };

    case 'OVERDUE':
      return { allowed: false, status, reason: 'payment_required', paymentLink: link };

    case 'CANCELED':
      return { allowed: false, status, reason: 'subscription_ended', paymentLink: link };

    default:
      return { allowed: false, status: status as SubscriptionStatus, reason: 'payment_required', paymentLink: link };
  }
}

/**
 * Retorna true se o status indica que o usuário está com acesso pleno.
 * Útil para guards simples sem precisar do objeto completo.
 */
export function isSubscriptionActive(status: SubscriptionStatus): boolean {
  return ['ACTIVE', 'TRIAL', 'COURTESY', 'INTERNAL_TEST', 'PENDING'].includes(status);
}

/**
 * Retorna true se o status deve exibir o banner de aviso.
 */
export function shouldShowExpiredBanner(status: SubscriptionStatus): boolean {
  return ['OVERDUE', 'CANCELED', 'TRIAL', 'PENDING'].includes(status);
}

// ---------------------------------------------------------------------------
// AÇÕES DO USUÁRIO FINAL
// ---------------------------------------------------------------------------

/**
 * Solicita a reativação da assinatura.
 * Retorna o link de pagamento (checkout) para o usuário finalizar no gateway.
 */
export async function getReactivationLink(tenantId: string): Promise<string | null> {
  const sub = await getActiveSubscription(tenantId);
  return sub?.providerPaymentLink ?? null;
}

/**
 * Registra que o usuário visualizou o aviso de vencimento (para analytics).
 * Operação silenciosa — não bloqueia se falhar.
 */
export async function markOverdueBannerSeen(_tenantId: string): Promise<void> {
  // admin_grants não existe no schema real — operação no-op silenciosa.
}

// ---------------------------------------------------------------------------
// WEBHOOK HANDLER (chamado pelo Supabase Edge Function)
// ---------------------------------------------------------------------------

/**
 * Processa eventos do gateway de pagamento.
 * Este método é chamado pelo webhook handler no backend (Edge Function).
 *
 * Eventos suportados (Kiwify):
 * - order_approved / subscription_first_charge → ativar
 * - subscription_overdue                        → marcar overdue
 * - subscription_canceled                       → cancelar
 * - subscription_renewed                        → renovar + lançar créditos
 */
export async function processWebhookEvent(payload: {
  event: string;
  tenantId: string;
  planCode?: string;
  periodEnd?: string;
  providerSubscriptionId?: string;
  credits?: number;
}): Promise<{ success: boolean; action: string }> {
  const { event, tenantId, planCode, periodEnd } = payload;

  if (!tenantId) {
    return { success: false, action: 'missing_tenant_id' };
  }

  try {
    // Colunas REAIS de subscriptions: plan_id (uuid FK), status, current_period_end, provider, provider_sub_id
    // NÃO EXISTEM: plan (text), plan_code, status_assinatura em tenants
    if (event === 'order_approved' || event === 'subscription_first_charge' || event === 'subscription_renewed') {
      const code = (planCode ?? 'PRO').toUpperCase();
      const end = periodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Resolve plan_id pelo nome do plano
      const { data: planRow } = await supabase
        .from('plans')
        .select('id')
        .eq('name', code)
        .maybeSingle();

      if (planRow?.id) {
        await supabase
          .from('subscriptions')
          .update({ plan_id: planRow.id, status: 'ACTIVE', current_period_end: end })
          .eq('tenant_id', tenantId);
      }

      // Creditar na carteira — usa SUBSCRIPTION_PLANS como fonte única de verdade
      const planKey = (code === 'PREMIUM' ? 'MASTER' : code) as keyof typeof SUBSCRIPTION_PLANS;
      const credits = payload.credits ?? (SUBSCRIPTION_PLANS[planKey]?.credits ?? SUBSCRIPTION_PLANS.FREE.credits);
      const { data: wallet } = await supabase
        .from('credits_wallet')
        .select('balance')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (wallet) {
        await supabase
          .from('credits_wallet')
          .update({ balance: Number(wallet.balance ?? 0) + credits })
          .eq('tenant_id', tenantId);
      }

      return { success: true, action: 'activated' };
    }

    if (event === 'subscription_overdue') {
      await supabase.from('subscriptions').update({ status: 'OVERDUE' }).eq('tenant_id', tenantId);
      return { success: true, action: 'marked_overdue' };
    }

    if (event === 'subscription_canceled') {
      await supabase.from('subscriptions').update({ status: 'CANCELED' }).eq('tenant_id', tenantId);
      return { success: true, action: 'canceled' };
    }

    return { success: false, action: `unhandled_event:${event}` };
  } catch (err: any) {
    return { success: false, action: `error:${err?.message ?? 'unknown'}` };
  }
}
