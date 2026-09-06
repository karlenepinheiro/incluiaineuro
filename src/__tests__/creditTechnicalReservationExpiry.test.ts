/**
 * creditTechnicalReservationExpiry.test.ts — FASE 0 / C-2 (06/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Toda reserva TÉCNICA de crédito (RESERVE -> COMMIT/RELEASE) do ai-gateway
 * precisa nascer com `expires_at` preenchido, para que o sweeper
 * `expire_stale_credit_reservations()` recupere o crédito de uma Edge Function
 * interrompida ou aba fechada.
 *
 * O fix da Fase 0 é aplicado no ÚNICO chamador real do gateway
 * (supabase/functions/ai-gateway/index.ts), que sempre calcula um `expiresAt`
 * explícito (20 min padrão, 30 min quando deferCommit). O helper `_credits.ts`
 * permanece intacto (congelado pelo guard do hotfix A-1) e apenas repassa o
 * valor recebido.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// _credits.ts é um módulo Deno (import remoto https://esm.sh) e está congelado
// pelo guard do hotfix A-1 — verificado por análise de fonte, não em runtime.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('FASE 0 / C-2 — _credits.reserveCredits repassa o expires_at recebido', () => {
  const creditsTs = read('supabase/functions/ai-gateway/_credits.ts');

  it('2. um expiresAt explícito é repassado sem alteração ao p_expires_at', () => {
    // params.expiresAt ?? null -> valor explícito (ISO string) passa direto
    expect(creditsTs).toMatch(/p_expires_at:\s*params\.expiresAt\s*\?\?/);
  });

  it('assinatura aceita expiresAt opcional', () => {
    expect(creditsTs).toMatch(/expiresAt\?:\s*string\s*\|\s*null/);
  });
});

describe('FASE 0 / C-2 — ai-gateway/index.ts sempre reserva com validade técnica', () => {
  const indexTs = read('supabase/functions/ai-gateway/index.ts');
  const reserveBlock = indexTs.slice(
    indexTs.indexOf('reserveCredits(adminDb'),
    indexTs.indexOf('reservationId = reservation.reservationId'),
  );

  it('1 + 3. calcula expiresAt explícito e NUNCA passa null', () => {
    expect(reserveBlock).toContain('expiresAt: new Date(');
    expect(reserveBlock).toContain('.toISOString()');
    // a linha do expiresAt não pode conter `null`
    const expiresLine = reserveBlock
      .split('\n')
      .slice(
        reserveBlock.split('\n').findIndex(l => l.includes('expiresAt:')),
        reserveBlock.split('\n').findIndex(l => l.includes('expiresAt:')) + 4,
      )
      .join(' ');
    expect(expiresLine).not.toMatch(/\bnull\b/);
  });

  it('default técnico = 20 min; deferCommit = 30 min', () => {
    expect(reserveBlock).toContain('(deferCommit ? 30 : 20) * 60 * 1000');
  });

  it('não confunde reserva técnica com validade comercial', () => {
    expect(reserveBlock.toLowerCase()).toContain('não é');
    expect(reserveBlock.toLowerCase()).toContain('comercial');
  });

  it('C-1/A-1 intactos: markers presentes, 1 reserve / 1 commit, sem "expires_at" snake', () => {
    expect(indexTs).toContain("from './_friendlyError.ts'");
    expect(indexTs).toContain("from './_imagesValidation.ts'");
    expect(indexTs).toMatch(/_multiPageParts|multiPage/);
    expect(indexTs.match(/await reserveCredits\(adminDb/g) ?? []).toHaveLength(1);
    expect(indexTs.match(/await commitReservedCredits\(adminDb/g) ?? []).toHaveLength(1);
    expect(indexTs).not.toContain('expires_at');
  });
});
