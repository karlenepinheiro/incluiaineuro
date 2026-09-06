/**
 * creditServiceReserveExpiry.test.ts — FASE 0 / C-2 (06/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * `CreditTransactionService.atomicReserveCredits` (frontend) passava
 * `p_expires_at: params.expiresAt ?? null`, anulando o DEFAULT SQL de 20 min e
 * criando reservas técnicas sem validade — passíveis de ficarem presas.
 *
 * Regra Fase 0: toda reserva nova nasce com validade técnica.
 *   - sem expiresAt        -> now() + 20 min
 *   - com expiresAt        -> valor explícito é respeitado
 *   - nunca NULL
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();

vi.mock('../supabase', () => ({
  supabase: { rpc: (...args: any[]) => rpcMock(...args) },
  DEMO_MODE: false,
}));

// eslint-disable-next-line import/first
import { CreditTransactionService } from '../creditService';

const TWENTY_MIN = 20 * 60 * 1000;

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({
    data: { ok: true, reservation_id: 'r1', operation_id: 'op1', final_balance: 10 },
    error: null,
  });
});

function reservePayload() {
  const call = rpcMock.mock.calls.find(c => c[0] === 'atomic_reserve_credits');
  return call?.[1];
}

describe('FASE 0 / C-2 — creditService.atomicReserveCredits: expires_at técnico', () => {
  it('1. sem expiresAt recebe now() + 20 min', async () => {
    const before = Date.now();
    await CreditTransactionService.atomicReserveCredits({ tenantId: 't', amount: 1, description: 'x' });
    const after = Date.now();

    const p = reservePayload();
    expect(typeof p.p_expires_at).toBe('string');
    const ms = new Date(p.p_expires_at).getTime();
    expect(ms).toBeGreaterThanOrEqual(before + TWENTY_MIN - 2000);
    expect(ms).toBeLessThanOrEqual(after + TWENTY_MIN + 2000);
  });

  it('2. expiresAt explícito (30 min) é preservado', async () => {
    const explicit = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await CreditTransactionService.atomicReserveCredits({
      tenantId: 't', amount: 1, description: 'x', expiresAt: explicit,
    });
    expect(reservePayload().p_expires_at).toBe(explicit);
  });

  it('3. nunca envia NULL/undefined (mesmo passando expiresAt: null)', async () => {
    for (const extra of [{}, { expiresAt: null }, { expiresAt: undefined }]) {
      rpcMock.mockClear();
      await CreditTransactionService.atomicReserveCredits({
        tenantId: 't', amount: 1, description: 'x', ...(extra as Record<string, unknown>),
      });
      const p = reservePayload();
      expect(p.p_expires_at).toBeTruthy();
      expect(typeof p.p_expires_at).toBe('string');
    }
  });
});
