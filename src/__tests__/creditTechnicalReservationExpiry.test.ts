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

describe('gateway job reservation TTL',()=>{
  const sql=read('supabase/migrations/20260911000004_ai_financial_jobs.sql');
  it('always reserves with a server-owned 20 minute TTL',()=>{
    expect(sql).toContain("p_expires_at=>now()+interval '20 minutes'");
    expect(sql).toContain("reservation.expires_at>now()");
    expect(sql).toContain("':timeout'");
  });
  it('browser cannot defer settlement or change its amount',()=>{
    const index=read('supabase/functions/ai-gateway/index.ts');
    expect(index).toContain("if(deferCommit) return jsonError");
    expect(index).toContain('const cost = financial.cost');
  });
});
