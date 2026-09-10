/** Regra comercial única. Não concede créditos nem privilégios administrativos. */
export interface CommercialSubscription {
  status?: string | null;
  currentPeriodEnd?: string | null;
  lastPaymentStatus?: string | null;
  provider?: string | null;
  cancellationVerified?: boolean;
}

export function resolveSubscriptionAccess({
  subscription, isInternal, now = Date.now(),
}: {
  subscription?: CommercialSubscription | null;
  isInternal?: boolean;
  now?: number;
}) {
  const result = (allowed: boolean, reason: string) => ({
    allowed, reason, isInternal: isInternal === true,
    validUntil: isInternal === true ? null : subscription?.currentPeriodEnd ?? null,
  });
  if (isInternal === true) return result(true, 'internal');
  if (!subscription?.status) return result(false, 'no_subscription');
  const status = subscription.status.toUpperCase();
  const payment = subscription.lastPaymentStatus?.toUpperCase() ?? '';
  const revoked = ['REFUND', 'REFUNDED', 'ORDER_REFUNDED', 'CHARGEBACK', 'CHARGEDBACK', 'REVOKED'];
  if (revoked.includes(status) || revoked.includes(payment)) return result(false, 'revoked');
  const end = subscription.currentPeriodEnd;
  const future = !!end && Number.isFinite(Date.parse(end)) && Date.parse(end) > now;
  if (status === 'ACTIVE') return result(!end || future, !end || future ? 'active' : 'expired');
  if (status === 'CANCELED' || status === 'CANCELLED') {
    // Kiwify também grava estornos como CANCELED: exigir evidência de cancelamento simples.
    if (subscription.provider === 'kiwify' && subscription.cancellationVerified !== true) {
      return result(false, 'cancellation_unverified');
    }
    return result(future, future ? 'paid_period' : 'canceled');
  }
  if (status === 'COURTESY') return result(true, 'courtesy');
  if (status === 'INTERNAL_TEST') return result(true, 'test_account');
  if (status === 'TRIAL') return result(true, 'trial');
  if (status === 'PENDING') return result(true, 'grace_period');
  return result(false, 'payment_required');
}

export type CommercialAccess = ReturnType<typeof resolveSubscriptionAccess>;
