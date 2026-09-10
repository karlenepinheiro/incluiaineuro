import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { resolveSubscriptionAccess } from '../services/subscriptionAccess';
import { SubscriptionFinanceStatus } from '../components/SubscriptionFinanceStatus';
import { PaymentService } from '../services/paymentService';
import { checkSubscriptionAccess, isSubscriptionActive, shouldShowExpiredBanner } from '../services/subscriptionService';
import type { User, Student } from '../types';

vi.mock('../services/supabase', () => ({ supabase: {
  from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { balance: 0 }, error: null }) }) }) })),
} }));
vi.mock('../services/aiGatewayService', () => ({ callAIGateway: vi.fn() }));

const past = '2000-01-01T00:00:00Z';
const future = '2100-01-01T00:00:00Z';
describe('acesso comercial e conta interna', () => {
  it.each([
    [true, 'ACTIVE', past, true, 'internal'],
    [true, 'CANCELED', past, true, 'internal'],
    [false, 'ACTIVE', future, true, 'active'],
    [false, 'ACTIVE', past, false, 'expired'],
    [false, 'CANCELED', future, true, 'paid_period'],
    [false, 'CANCELED', past, false, 'canceled'],
  ])('%s / %s / %s', (isInternal, status, currentPeriodEnd, allowed, reason) => {
    const access = resolveSubscriptionAccess({ isInternal, subscription: { status, currentPeriodEnd } });
    expect(access).toMatchObject({ allowed, reason, isInternal });
  });

  it('não confunde plano MASTER nem admin com tenant interno', () => {
    expect(PaymentService.checkAccess({ plan: 'MASTER', isAdmin: true, subscriptionStatus: 'ACTIVE' } as unknown as User, past).allowed).toBe(false);
    expect(resolveSubscriptionAccess({ isInternal: 'true' as unknown as boolean }).allowed).toBe(false);
  });

  it('wrappers e banner usam a exceção interna', () => {
    expect(PaymentService.checkAccess({ isInternal: true, subscriptionStatus: 'CANCELED' } as User, past).reason).toBe('internal');
    expect(checkSubscriptionAccess('CANCELED', 'checkout', past, true)).toMatchObject({ allowed: true, paymentLink: null });
    expect(isSubscriptionActive('ACTIVE', past, true)).toBe(true);
    expect(shouldShowExpiredBanner('CANCELED', past, true)).toBe(false);
    expect(shouldShowExpiredBanner('CANCELED', future)).toBe(false);
  });

  it.each(['REFUNDED', 'CHARGEBACK', 'CHARGEDBACK', 'REVOKED', 'ORDER_REFUNDED'])('bloqueia %s mesmo dentro do período', lastPaymentStatus => {
    expect(resolveSubscriptionAccess({ subscription: { status: 'CANCELED', currentPeriodEnd: future, lastPaymentStatus } }).allowed).toBe(false);
  });

  it('não libera cancelamento Kiwify de origem desconhecida', () => {
    const subscription = { status: 'CANCELED', currentPeriodEnd: future, provider: 'kiwify' };
    expect(resolveSubscriptionAccess({ subscription }).allowed).toBe(false);
    expect(resolveSubscriptionAccess({ subscription: { ...subscription, cancellationVerified: true } }).allowed).toBe(true);
  });

  it('bloqueia inadimplência, data inválida, limite do período e ausência de assinatura', () => {
    expect(resolveSubscriptionAccess({ subscription: { status: 'OVERDUE', currentPeriodEnd: future } }).allowed).toBe(false);
    expect(resolveSubscriptionAccess({ subscription: { status: 'ACTIVE', currentPeriodEnd: 'inválida' } }).allowed).toBe(false);
    expect(resolveSubscriptionAccess({ subscription: { status: 'CANCELED' } }).allowed).toBe(false);
    expect(resolveSubscriptionAccess({ subscription: { status: 'ACTIVE', currentPeriodEnd: future }, now: Date.parse(future) }).allowed).toBe(false);
    expect(resolveSubscriptionAccess({}).allowed).toBe(false);
  });

  it('C: saldo zero impede geração real pelo serviço, mesmo com acesso interno', async () => {
    const { AIService } = await import('../services/aiService');
    const { callAIGateway } = await import('../services/aiGatewayService');
    const user = { id: 'u', tenant_id: 't', isInternal: true, subscriptionStatus: 'ACTIVE' } as User;
    expect(PaymentService.checkAccess(user, past).allowed).toBe(true);
    expect(await AIService.checkCredits(user, 3)).toBe(false);
    await expect(AIService.generateProtocolJSON('ESTUDO_CASO', { id: 's' } as Student, user)).rejects.toThrow();
    expect(callAIGateway).not.toHaveBeenCalled();
  }, 30_000);

  it.each(['ACTIVE', 'CANCELED'] as const)('H: Financeiro interno %s renderiza sem cobrança comercial', status => {
    const html = renderToStaticMarkup(<SubscriptionFinanceStatus
      status={status} planName="PREMIUM"
      access={resolveSubscriptionAccess({ isInternal: true, subscription: { status, currentPeriodEnd: past } })}
    />);
    expect(html).toContain('Conta interna / teste');
    expect(html).toContain('PREMIUM');
    expect(html).toContain('Uso interno — sem cobrança recorrente');
    expect(html).not.toMatch(/Renova em|cancelad|Reativar|2000/i);
  });
});
