import { beforeEach, expect, it, vi } from 'vitest';
import { getActiveSubscription } from '../services/subscriptionService';
import { resolveSubscriptionAccess } from '../services/subscriptionAccess';

const fixture = vi.hoisted(() => ({
  events: [] as { event_type: string }[],
  error: null as null | { message: string },
}));
vi.mock('../services/supabase', () => ({ supabase: {
  from: (table: string) => {
    const query: any = {
      select: () => query, eq: () => query, in: () => query,
      order: () => query, limit: () => query,
      gte: async () => ({ data: fixture.events, error: fixture.error }),
      maybeSingle: async () => ({ error: null, data: table === 'plans'
        ? { name: 'MASTER' }
        : { id: 's', tenant_id: 't', plan_id: 'p', status: 'CANCELED', provider: 'kiwify',
          current_period_start: '2026-01-01', current_period_end: '2100-01-01', created_at: '2026-01-01' } }),
    };
    return query;
  },
} }));
beforeEach(() => { fixture.events = []; fixture.error = null; });

it('carrega cancelamento simples e mantém o plano MASTER atribuído', async () => {
  fixture.events = [{ event_type: 'subscription_canceled' }];
  const subscription = await getActiveSubscription('t');
  expect(subscription?.planCode).toBe('MASTER');
  expect(resolveSubscriptionAccess({ subscription })).toMatchObject({ allowed: true, reason: 'paid_period' });
});

it.each(['chargeback', 'order_refunded', 'refunded', 'chargedback'])('não libera %s seguido de cancelamento', async event_type => {
  fixture.events = [{ event_type }, { event_type: 'subscription_canceled' }];
  const subscription = await getActiveSubscription('t');
  expect(resolveSubscriptionAccess({ subscription })).toMatchObject({ allowed: false, reason: 'revoked' });
  expect(resolveSubscriptionAccess({ subscription, isInternal: true }).reason).toBe('internal');
});

it('falha de leitura/RLS não concede período pago por engano', async () => {
  fixture.error = { message: 'permission denied' };
  expect(resolveSubscriptionAccess({ subscription: await getActiveSubscription('t') }).allowed).toBe(false);
});

it('ausência de evidência não concede período pago por engano', async () => {
  expect(resolveSubscriptionAccess({ subscription: await getActiveSubscription('t') }).allowed).toBe(false);
});
