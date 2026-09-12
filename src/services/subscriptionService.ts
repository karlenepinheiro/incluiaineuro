/**
 * subscriptionService.ts
 * Camada dedicada de gestão de assinaturas para o tenant autenticado.
 * Foca no fluxo do usuário final — diferente de billingService.ts que
 * cobre operações administrativas e processamento de webhooks.
 *
 * Reutilizável em qualquer SaaS: basta trocar a tabela-alvo e o gateway.
 */

import { resolveSubscriptionAccess, type CommercialAccess, type CommercialSubscription } from './subscriptionAccess';
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
  provider?: string | null;
  cancellationVerified?: boolean;
  /** Ciclo de cobrança ('monthly' | 'annual'). Null em contas sem subscription registrada. */
  billingCycle: 'monthly' | 'annual' | null;
}

export type SubscriptionAccessResult = CommercialAccess & {
  status: SubscriptionStatus;
  paymentLink: string | null;
};

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
    .select('id, tenant_id, plan_id, status, current_period_start, current_period_end, next_due_date, billing_cycle, provider, provider_sub_id, provider_customer_id, provider_payment_link, provider_update_payment_link, last_payment_status, created_at')
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

  // Leitura conservadora: o webhook colapsa refund/chargeback em CANCELED.
  let cancellationVerified = false;
  let lastPaymentStatus = data.last_payment_status ?? null;
  if (data.provider === 'kiwify' && ['CANCELED', 'CANCELLED'].includes(data.status)) {
    const { data: events, error: eventError } = await supabase
      .from('kiwify_webhook_logs')
      .select('event_type')
      .eq('tenant_id', tenantId)
      .in('event_type', ['subscription_canceled', 'refunded', 'chargedback', 'order_refunded', 'chargeback'])
      .gte('processed_at', data.current_period_start ?? data.created_at);
    const revocation = events?.find(event => event.event_type !== 'subscription_canceled');
    cancellationVerified = !eventError && !revocation && !!events?.some(event => event.event_type === 'subscription_canceled');
    if (revocation) lastPaymentStatus = revocation.event_type;
  }

  return {
    provider: data.provider,
    cancellationVerified,
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
    lastPaymentStatus,
  };
}

/** Adaptadores legados: toda decisão comercial passa pelo mesmo resolver. */
export function checkSubscriptionAccess(
  status: SubscriptionStatus,
  paymentLink?: string | null,
  currentPeriodEnd?: string | null,
  isInternal = false,
  subscription?: CommercialSubscription,
): SubscriptionAccessResult {
  const access = resolveSubscriptionAccess({
    isInternal, subscription: subscription ?? { status, currentPeriodEnd },
  });
  return { ...access, status, paymentLink: access.isInternal ? null : paymentLink ?? null };
}

export function isSubscriptionActive(status: SubscriptionStatus, currentPeriodEnd?: string | null, isInternal = false): boolean {
  return checkSubscriptionAccess(status, null, currentPeriodEnd, isInternal).allowed;
}

export function shouldShowExpiredBanner(status: SubscriptionStatus, currentPeriodEnd?: string | null, isInternal = false, subscription?: CommercialSubscription): boolean {
  const access = checkSubscriptionAccess(status, null, currentPeriodEnd, isInternal, subscription);
  return !access.isInternal && (!access.allowed || ['TRIAL', 'PENDING'].includes(status));
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

// Webhooks financeiros são processados exclusivamente no backend.
