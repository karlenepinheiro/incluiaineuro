/**
 * phase0CreditAuditGuards.test.ts — FASE 0 / C-2 (06/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Garante que a Fase 0 ficou ESTRITAMENTE no escopo:
 *   - hotfixes C-1 (falsos positivos de limite) e A-1 (multipágina) intactos;
 *   - NENHUM credit_grants / FIFO / lote / validade comercial de 2 meses;
 *   - nenhum caminho de concessão/renovação de crédito alterado;
 *   - sweeper (migration local) presente e com as salvaguardas exigidas.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p: string) => fs.existsSync(path.join(root, p));

const MIGRATION = 'supabase/migrations/20260907000001_expire_stale_credit_reservations.sql';

describe('FASE 0 — hotfixes C-1 e A-1 permanecem intactos', () => {
  const PROTECTED = [
    'supabase/functions/ai-gateway/_imagesValidation.ts',
    'supabase/functions/ai-gateway/_multiPageParts.ts',
    'supabase/functions/ai-gateway/_vertex.ts',
    'supabase/functions/ai-gateway/_credits.ts',
    'supabase/functions/ai-gateway/_friendlyError.ts',
  ];

  it.each(PROTECTED)('%s sem alterações na árvore de trabalho', (file) => {
    const diff = execFileSync('git', ['diff', 'HEAD', '--', file], { cwd: root, encoding: 'utf8' });
    expect(diff.trim()).toBe('');
  });

  it('gateway mantém validação antes do job e cobra somente no servidor', () => {
    const code=read('supabase/functions/ai-gateway/index.ts');
    expect(code.indexOf('validateGatewayImages(rawImages)')).toBeLessThan(code.indexOf("adminDb.rpc('begin_ai_financial_job'"));
    expect(code).toContain('serverCreditOperation(body)');
    expect(code).not.toContain('Number(creditsRequired)');
    expect(code).toContain('finish(true,response)');
  });
});

describe('FASE 0 — nenhum credit_grants / FIFO / lote / validade comercial', () => {
  const migrationsDir = path.join(root, 'supabase/migrations');
  const migrations = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

  it('credit_grants não existe em nenhuma migration', () => {
    for (const f of migrations) {
      expect(fs.readFileSync(path.join(migrationsDir, f), 'utf8')).not.toMatch(/credit_grants/i);
    }
  });

  it('a migration da Fase 0 não introduz tabela nova / FIFO / expiração comercial', () => {
    // ignora comentários — só a parte executável importa
    const sql = read(MIGRATION)
      .split('\n')
      .filter(l => !l.trimStart().startsWith('--'))
      .join('\n')
      .toLowerCase();
    expect(sql).not.toMatch(/create\s+table/);
    expect(sql).not.toMatch(/alter\s+table[^;]*add\s+column/);
    expect(sql).not.toMatch(/fifo|credit_grants|batch_id/);
    expect(sql).not.toMatch(/order\s+by[^;]*created_at[^;]*limit\s+1/); // consumo por origem
    // objetos criados são exatamente os previstos
    expect(sql).toContain('create or replace function public.expire_stale_credit_reservations');
    expect(sql).toMatch(/create or replace view public\.v_stale_credit_reservations/);
    expect(sql).toMatch(/create or replace view public\.v_ceo_credit_dashboard/);
  });

  it('caminhos de concessão/renovação não foram tocados', () => {
    for (const file of [
      'supabase/migrations/20260616000003_grant_missing_monthly_credits_rpc.sql',
      'supabase/migrations/20260520000002_atomic_credit_transactions.sql',
    ]) {
      const diff = execFileSync('git', ['diff', 'HEAD', '--', file], { cwd: root, encoding: 'utf8' });
      expect(diff.trim()).toBe('');
    }
  });
});

describe('FASE 0 — sweeper expire_stale_credit_reservations (migration local)', () => {
  it('migration existe', () => {
    expect(exists(MIGRATION)).toBe(true);
  });

  const sql = exists(MIGRATION) ? read(MIGRATION) : '';

  it('4/5. devolve crédito, marca expired e grava reservation_release', () => {
    expect(sql).toMatch(/status\s*=\s*'expired'/);
    expect(sql).toMatch(/balance\s*=\s*balance\s*\+\s*v_res\.amount/);
    expect(sql).toContain("'reservation_release'");
    expect(sql).toContain('Liberação automática de reserva técnica expirada');
    expect(sql).not.toMatch(/cr[ée]ditos?\s+expirados/i); // não é expiração comercial
  });

  it('6/7/8. só processa status reserved', () => {
    expect(sql).toMatch(/status\s*=\s*'reserved'/);
    expect(sql).toMatch(/v_res\.status\s*<>\s*'reserved'/);
  });

  it('9/10. recupera legado expires_at NULL só após a folga (30 min padrão)', () => {
    expect(sql).toMatch(/expires_at IS NULL AND .*created_at <= now\(\) - v_grace/s);
    expect(sql).toContain('p_null_grace_minutes integer DEFAULT 30');
  });

  it('11. idempotência: credit_operations único + ON CONFLICT DO NOTHING', () => {
    expect(sql).toContain("'sweeper:expire:'");
    expect(sql).toContain('ON CONFLICT (operation_id) DO NOTHING');
    expect(sql).toMatch(/IF v_new_op_id IS NULL THEN/);
  });

  it('12/13. concorrência: trava por linha com SKIP LOCKED + recheck sob trava', () => {
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toMatch(/Reconfirma o estado sob a trava/);
  });

  it('agendamento não configurado: sem pg_cron, sem schedule remoto', () => {
    expect(sql).not.toMatch(/create extension.*pg_cron/i);
    expect(sql).not.toMatch(/^\s*select cron\.schedule/im); // só aparece comentado
  });

  it('sweeper é service_role apenas', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.expire_stale_credit_reservations');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.expire_stale_credit_reservations(integer, integer) TO service_role');
  });
});

describe('FASE 0 — Edge Function credit-maintenance', () => {
  const fn = 'supabase/functions/credit-maintenance/index.ts';

  it('existe e chama a RPC do sweeper', () => {
    expect(exists(fn)).toBe(true);
    expect(read(fn)).toContain("db.rpc('expire_stale_credit_reservations'");
  });

  it('service role only, sem tenant do cliente, sem schedule remoto', () => {
    const src = read(fn);
    expect(src).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(src).toMatch(/token !== SUPABASE_SERVICE_KEY/);
    expect(src).not.toMatch(/tenant_id/);
    expect(src).not.toMatch(/cron\.schedule|Deno\.cron|setInterval/i);
  });
});
