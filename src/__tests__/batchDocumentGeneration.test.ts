/**
 * batchDocumentGeneration.test.ts — bug crítico do lote (09/09/2026) + resiliência a 429
 * ─────────────────────────────────────────────────────────────────────────────
 * O bug original: "Gerar Documentos em Lote" disparava o toast VERDE
 * "Documentos gerados com sucesso" ao término do laço, mesmo com 0 documentos
 * gerados. Cada erro individual só atualizava o estado visual.
 *
 * Cobertura:
 *   - resultado explícito por documento (success | failed | skipped)
 *   - dependência Estudo de Caso → PAEE (skip, nunca erro de IA, nunca cobra)
 *   - toast final coerente (verde só quando tudo deu certo)
 *   - retry com backoff SOMENTE para rate limit real (429 / RESOURCE_EXHAUSTED)
 *   - falsos positivos ([len=429], position 4291) nunca viram rate limit
 *   - cobrança exatamente 1× mesmo com 429 seguido de sucesso no retry
 */
import { describe, expect, it, vi } from 'vitest';
import {
  runBatchGeneration,
  getBatchToast,
  summarizeBatch,
  batchOperationId,
  isRetryableRateLimitError,
  BATCH_RETRY_MESSAGE,
  type BatchItemInput,
  type RunBatchGenerationDeps,
} from '../services/batchDocumentGeneration';
import type { FormalSourceSnapshot } from '../utils/formalDocumentGuards';
import { friendlyError } from '../../supabase/functions/ai-gateway/_friendlyError';

const EMPTY_SNAPSHOT: FormalSourceSnapshot = { estudoCaso: false, paee: false, pei: false };

const ITEM: Record<string, BatchItemInput> = {
  ESTUDO_CASO: { documentType: 'ESTUDO_CASO', label: 'Estudo de Caso', cost: 3 },
  PAEE: { documentType: 'PAEE', label: 'PAEE', cost: 3 },
  PEI: { documentType: 'PEI', label: 'PEI', cost: 3 },
};

const RATE_LIMIT_ERR = () => new Error('Gemini 429: Resource has been exhausted (e.g. check quota).');

/** baseDeps usa sleep instantâneo → testes determinísticos e rápidos. */
function baseDeps(overrides: Partial<RunBatchGenerationDeps> = {}): RunBatchGenerationDeps {
  return {
    batchId: 'batch-1',
    items: [],
    savedSnapshot: { ...EMPTY_SNAPSHOT },
    generate: async () => ({ recordId: 'rec-x' }),
    delayBetweenMs: 0,
    sleep: async () => {},
    ...overrides,
  };
}

describe('runBatchGeneration — resultado explícito por documento', () => {
  it('CASO 1 · Estudo de Caso sucesso → 1 success, toast verde', async () => {
    const summary = await runBatchGeneration(baseDeps({
      items: [ITEM.ESTUDO_CASO],
      generate: async () => ({ recordId: 'rec-ec' }),
    }));

    expect(summary.successCount).toBe(1);
    expect(summary.failedCount).toBe(0);
    expect(summary.skippedCount).toBe(0);
    expect(summary.results[0]).toMatchObject({ status: 'success', recordId: 'rec-ec', creditsCharged: 3, attempts: 1 });

    const toast = getBatchToast(summary);
    expect(toast.variant).toBe('success');
    expect(toast.message).toBe('1 documento gerado com sucesso.');
    expect(toast.canViewDocuments).toBe(true);
  });

  it('CASO 2 · Estudo de Caso falha (429 esgotado) → 0 success, toast vermelho', async () => {
    const summary = await runBatchGeneration(baseDeps({
      items: [ITEM.ESTUDO_CASO],
      generate: async () => { throw RATE_LIMIT_ERR(); },
      classifyError: () => 'Limite de uso da IA atingido. Aguarde alguns instantes.',
    }));

    expect(summary.successCount).toBe(0);
    expect(summary.failedCount).toBe(1);
    expect(summary.results[0]).toMatchObject({ status: 'failed', creditsCharged: 0, attempts: 3 });
    expect(summary.results[0].recordId).toBeUndefined();

    const toast = getBatchToast(summary);
    expect(toast.variant).toBe('error');
    expect(toast.message).toBe('Nenhum documento foi gerado.');
    expect(toast.canViewDocuments).toBe(false);
  });

  it('CASO 3 · Estudo de Caso + PAEE, ambos sucesso → 2 success, toast verde', async () => {
    const summary = await runBatchGeneration(baseDeps({
      items: [ITEM.ESTUDO_CASO, ITEM.PAEE],
      generate: async (item) => ({ recordId: `rec-${item.documentType}` }),
    }));

    expect(summary.successCount).toBe(2);
    expect(getBatchToast(summary)).toMatchObject({ variant: 'success', message: '2 documentos gerados com sucesso.' });
  });

  it('CASO 4 · Estudo de Caso falha DEFINITIVA (não-retryable), PAEE skipped, sem cobrança', async () => {
    const generate = vi.fn(async (item: BatchItemInput) => {
      if (item.documentType === 'ESTUDO_CASO') throw new Error('erro ao salvar documento');
      return { recordId: 'rec-paee' };
    });

    const summary = await runBatchGeneration(baseDeps({
      items: [ITEM.ESTUDO_CASO, ITEM.PAEE],
      generate,
    }));

    expect(summary.successCount).toBe(0);
    expect(summary.failedCount).toBe(1);
    expect(summary.skippedCount).toBe(1);

    const ec = summary.results.find(r => r.documentType === 'ESTUDO_CASO')!;
    const paee = summary.results.find(r => r.documentType === 'PAEE')!;
    expect(ec.status).toBe('failed');
    expect(ec.attempts).toBe(1); // erro não-retryable → sem retry
    expect(paee.status).toBe('skipped');
    expect(paee.message).toBe('PAEE não foi gerado porque o Estudo de Caso anterior não pôde ser concluído.');
    expect(paee.creditsCharged).toBe(0);

    // PAEE NUNCA chega a chamar generate → nenhum reserve/commit de PAEE
    const paeeCalls = generate.mock.calls.filter(([it]) => it.documentType === 'PAEE');
    expect(paeeCalls).toHaveLength(0);

    expect(getBatchToast(summary)).toMatchObject({ variant: 'error', canViewDocuments: false });
  });

  it('CASO 5 · 2 documentos, 1 sucesso + 1 erro → toast amarelo', async () => {
    const summary = await runBatchGeneration(baseDeps({
      items: [ITEM.PAEE, ITEM.PEI],
      savedSnapshot: { estudoCaso: true, paee: true, pei: false },
      generate: async (item) => {
        if (item.documentType === 'PEI') throw new Error('falha da IA no PEI');
        return { recordId: 'rec-paee' };
      },
    }));

    expect(summary.successCount).toBe(1);
    expect(summary.failedCount).toBe(1);
    expect(getBatchToast(summary)).toMatchObject({
      variant: 'warning',
      message: '1 documento foi gerado. 1 não pôde ser concluído.',
      canViewDocuments: true,
    });
  });

  it('CASO 8 · PAEE selecionado sem Estudo de Caso no lote → skipped, generate nunca chamado', async () => {
    const generate = vi.fn(async () => ({ recordId: 'x' }));
    const summary = await runBatchGeneration(baseDeps({ items: [ITEM.PAEE], generate }));

    expect(summary.skippedCount).toBe(1);
    expect(summary.results[0]).toMatchObject({ status: 'skipped', creditsCharged: 0, attempts: 0 });
    expect(generate).not.toHaveBeenCalled();
  });

  it('CASO 9 · operationId é estável e independente por item (idempotência de retry)', async () => {
    const seen: string[] = [];
    const run = () => runBatchGeneration(baseDeps({
      items: [ITEM.ESTUDO_CASO, ITEM.PAEE, ITEM.PEI],
      generate: async (_item, operationId) => { seen.push(operationId); return { recordId: 'r' }; },
    }));

    await run();
    await run();

    expect(seen).toEqual([
      'batch-1:estudo_caso', 'batch-1:paee', 'batch-1:pei',
      'batch-1:estudo_caso', 'batch-1:paee', 'batch-1:pei',
    ]);
    expect(batchOperationId('batch-1', 'PAEE')).toBe('batch-1:paee');
  });

  it('propaga progresso via onItemStart / onItemSettled', async () => {
    const starts: number[] = [];
    const settled: string[] = [];
    await runBatchGeneration(baseDeps({
      items: [ITEM.ESTUDO_CASO, ITEM.PAEE],
      onItemStart: (i) => starts.push(i),
      onItemSettled: (_i, r) => settled.push(r.status),
    }));
    expect(starts).toEqual([0, 1]);
    expect(settled).toEqual(['success', 'success']);
  });
});

describe('runBatchGeneration — retry com backoff para 429 real', () => {
  it('A · 429 na 1ª tentativa, sucesso na 2ª → success, attempts = 2', async () => {
    const sleep = vi.fn(async () => {});
    let call = 0;
    const summary = await runBatchGeneration(baseDeps({
      items: [ITEM.ESTUDO_CASO],
      sleep,
      generate: async () => {
        call++;
        if (call === 1) throw RATE_LIMIT_ERR();
        return { recordId: 'rec-ec' };
      },
    }));

    expect(summary.results[0]).toMatchObject({ status: 'success', attempts: 2, creditsCharged: 3 });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenNthCalledWith(1, 10_000);
  });

  it('B · 429, 429, sucesso → success, attempts = 3, backoff 10s depois 20s', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    let call = 0;
    const summary = await runBatchGeneration(baseDeps({
      items: [ITEM.ESTUDO_CASO],
      sleep,
      generate: async () => {
        call++;
        if (call <= 2) throw RATE_LIMIT_ERR();
        return { recordId: 'rec-ec' };
      },
    }));

    expect(summary.results[0]).toMatchObject({ status: 'success', attempts: 3 });
    expect(sleep.mock.calls.map(c => c[0])).toEqual([10_000, 20_000]);
  });

  it('C · 429 nas 3 tentativas → failed, attempts = 3, dependente skipped', async () => {
    const sleep = vi.fn(async () => {});
    const generate = vi.fn(async (item: BatchItemInput) => {
      if (item.documentType === 'ESTUDO_CASO') throw RATE_LIMIT_ERR();
      return { recordId: 'rec-paee' };
    });
    const summary = await runBatchGeneration(baseDeps({
      items: [ITEM.ESTUDO_CASO, ITEM.PAEE],
      sleep,
      generate,
      classifyError: () => 'Limite de uso da IA atingido. Aguarde alguns instantes.',
    }));

    const ec = summary.results.find(r => r.documentType === 'ESTUDO_CASO')!;
    const paee = summary.results.find(r => r.documentType === 'PAEE')!;
    expect(ec).toMatchObject({ status: 'failed', attempts: 3, creditsCharged: 0 });
    expect(paee).toMatchObject({ status: 'skipped', creditsCharged: 0 });
    expect(generate.mock.calls.filter(([it]) => it.documentType === 'ESTUDO_CASO')).toHaveLength(3);
    expect(generate.mock.calls.filter(([it]) => it.documentType === 'PAEE')).toHaveLength(0);
    expect(getBatchToast(summary).variant).toBe('error');
  });

  it('D · VALIDATION_ERROR → nenhuma retry', async () => {
    const sleep = vi.fn(async () => {});
    const generate = vi.fn(async () => { throw new Error('VALIDATION_ERROR: formato inconsistente at position 4291'); });
    const summary = await runBatchGeneration(baseDeps({ items: [ITEM.ESTUDO_CASO], sleep, generate }));

    expect(summary.results[0]).toMatchObject({ status: 'failed', attempts: 1 });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('D2 · erro de persistência / regra de negócio / permissão / config → nenhuma retry', async () => {
    for (const msg of [
      'erro ao salvar documento no Supabase',
      'Para gerar o PAEE com segurança, é necessário ter um Estudo de Caso registrado para este estudante.',
      'AUTH_ERROR: Sem permissao',
      'CONFIG_GEMINI',
      'UNUSABLE_RESULT: SUSPICIOUSLY_SHORT [len=429]',
    ]) {
      const generate = vi.fn(async () => { throw new Error(msg); });
      const summary = await runBatchGeneration(baseDeps({
        items: [ITEM.ESTUDO_CASO], sleep: vi.fn(async () => {}), generate,
      }));
      expect(summary.results[0].status, msg).toBe('failed');
      expect(summary.results[0].attempts, msg).toBe(1);
      expect(generate, msg).toHaveBeenCalledTimes(1);
    }
  });

  it('I · callbacks refletem "retrying" antes de marcar failed/success', async () => {
    const events: string[] = [];
    let call = 0;
    await runBatchGeneration(baseDeps({
      items: [ITEM.ESTUDO_CASO],
      sleep: async () => {},
      generate: async () => {
        call++;
        if (call === 1) throw RATE_LIMIT_ERR();
        return { recordId: 'rec-ec' };
      },
      onItemStart: () => events.push('start'),
      onItemRetry: (_i, _item, info) => events.push(`retry:${info.attempt}:${info.waitMs}:${info.attemptsRemaining}`),
      onItemSettled: (_i, r) => events.push(`settled:${r.status}`),
    }));

    expect(events).toEqual(['start', 'retry:1:10000:2', 'settled:success']);
  });

  it('G · 429 no Estudo de Caso → retry sucesso → PAEE executa depois', async () => {
    let ecCalls = 0;
    const generate = vi.fn(async (item: BatchItemInput) => {
      if (item.documentType === 'ESTUDO_CASO') {
        ecCalls++;
        if (ecCalls === 1) throw RATE_LIMIT_ERR();
        return { recordId: 'rec-ec' };
      }
      return { recordId: 'rec-paee' };
    });
    const summary = await runBatchGeneration(baseDeps({
      items: [ITEM.ESTUDO_CASO, ITEM.PAEE], sleep: async () => {}, generate,
    }));

    expect(summary.successCount).toBe(2);
    const ec = summary.results.find(r => r.documentType === 'ESTUDO_CASO')!;
    const paee = summary.results.find(r => r.documentType === 'PAEE')!;
    expect(ec).toMatchObject({ status: 'success', attempts: 2, recordId: 'rec-ec' });
    expect(paee).toMatchObject({ status: 'success', attempts: 1 });
    expect(generate.mock.calls.filter(([it]) => it.documentType === 'PAEE')).toHaveLength(1);
  });

  it('H · 429 no Estudo de Caso, retries esgotados → PAEE skipped', async () => {
    const summary = await runBatchGeneration(baseDeps({
      items: [ITEM.ESTUDO_CASO, ITEM.PAEE],
      sleep: async () => {},
      generate: async (item) => {
        if (item.documentType === 'ESTUDO_CASO') throw RATE_LIMIT_ERR();
        return { recordId: 'rec-paee' };
      },
      classifyError: (e) => friendlyError(e instanceof Error ? e.message : String(e)),
    }));

    expect(summary.results.map(r => r.status)).toEqual(['failed', 'skipped']);
    expect(summary.successCount).toBe(0);
  });

  it('cobrança exatamente 1× — 429 (reserve→release) na 1ª, sucesso (commit) na 2ª', async () => {
    // Modela o gateway: reserve segura o saldo; 429 libera; sucesso commita.
    const ledger = { balance: 100, reserves: 0, releases: 0, commits: 0 };
    let call = 0;
    const generate = async (item: BatchItemInput) => {
      call++;
      ledger.reserves++;
      ledger.balance -= item.cost; // reserva segura o valor
      if (call === 1) {
        ledger.balance += item.cost; // release devolve
        ledger.releases++;
        throw RATE_LIMIT_ERR();
      }
      ledger.commits++; // commit finaliza (saldo já debitado pela reserva)
      return { recordId: 'rec-ec' };
    };

    const summary = await runBatchGeneration(baseDeps({
      items: [ITEM.ESTUDO_CASO], sleep: async () => {}, generate,
    }));

    expect(summary.results[0]).toMatchObject({ status: 'success', attempts: 2, creditsCharged: 3 });
    expect(ledger.commits).toBe(1);
    expect(ledger.releases).toBe(1);
    expect(ledger.balance).toBe(97); // debitado UMA vez
  });
});

describe('isRetryableRateLimitError — classificação estrita', () => {
  it('reconhece rate limit REAL', () => {
    expect(isRetryableRateLimitError(new Error('Gemini 429: rate limit'))).toBe(true);
    expect(isRetryableRateLimitError(new Error('Gemini 429: Resource has been exhausted (e.g. check quota).'))).toBe(true);
    expect(isRetryableRateLimitError(new Error('Limite de uso da IA atingido. Aguarde alguns instantes.'))).toBe(true);
    expect(isRetryableRateLimitError(new Error('RESOURCE_EXHAUSTED: quota metric ...'))).toBe(true);
    expect(isRetryableRateLimitError({ status: 429, message: 'x' })).toBe(true);
    expect(isRetryableRateLimitError({ errorCode: 'RESOURCE_EXHAUSTED' })).toBe(true);
    expect(isRetryableRateLimitError({ response: { status: 429 } })).toBe(true);
  });

  it('E · "[len=429]" NÃO é rate limit', () => {
    expect(isRetryableRateLimitError(new Error('UNUSABLE_RESULT: SUSPICIOUSLY_SHORT [len=429]'))).toBe(false);
    expect(isRetryableRateLimitError('[len=429]')).toBe(false);
  });

  it('F · "position 4291" / "position 429" NÃO são rate limit', () => {
    expect(isRetryableRateLimitError(new Error('VALIDATION_ERROR: JSON parse error at position 4291'))).toBe(false);
    expect(isRetryableRateLimitError('position 429')).toBe(false);
  });

  it('outros erros NÃO são rate limit', () => {
    for (const e of [
      'VALIDATION_ERROR: formato inválido',
      'UNUSABLE_RESULT: STRUCTURE',
      'erro ao salvar documento',
      'Para gerar o PAEE com segurança, é necessário ter um Estudo de Caso registrado para este estudante.',
      'AUTH_ERROR: Sessão expirada',
      'CONFIG_GEMINI',
      'Gemini 500: Internal error',
      'algo inesperado',
      '',
      null,
      undefined,
    ]) {
      expect(isRetryableRateLimitError(typeof e === 'string' ? new Error(e) : e), String(e)).toBe(false);
    }
  });
});

describe('getBatchToast — regras A / B / C', () => {
  it('A · sucesso total → verde', () => {
    expect(getBatchToast(summarizeBatch([
      { documentType: 'ESTUDO_CASO', label: '', status: 'success', creditsCharged: 3, operationId: 'o' },
    ]))).toMatchObject({ variant: 'success', canViewDocuments: true });
  });

  it('B · sucesso parcial (failed) → amarelo', () => {
    const t = getBatchToast(summarizeBatch([
      { documentType: 'ESTUDO_CASO', label: '', status: 'success', creditsCharged: 3, operationId: 'o' },
      { documentType: 'PAEE', label: '', status: 'failed', creditsCharged: 0, operationId: 'o' },
    ]));
    expect(t).toMatchObject({ variant: 'warning', canViewDocuments: true });
  });

  it('B · sucesso parcial (skipped) → amarelo', () => {
    const t = getBatchToast(summarizeBatch([
      { documentType: 'ESTUDO_CASO', label: '', status: 'success', creditsCharged: 3, operationId: 'o' },
      { documentType: 'PAEE', label: '', status: 'skipped', creditsCharged: 0, operationId: 'o' },
    ]));
    expect(t.variant).toBe('warning');
    expect(t.message).toBe('1 documento foi gerado. 1 não pôde ser concluído.');
  });

  it('C · zero sucesso → vermelho, sem botão "Ver Documentos Gerados"', () => {
    const t = getBatchToast(summarizeBatch([
      { documentType: 'ESTUDO_CASO', label: '', status: 'failed', creditsCharged: 0, operationId: 'o' },
      { documentType: 'PAEE', label: '', status: 'skipped', creditsCharged: 0, operationId: 'o' },
    ]));
    expect(t).toMatchObject({ variant: 'error', message: 'Nenhum documento foi gerado.', canViewDocuments: false });
  });

  it('NUNCA retorna "gerado(s) com sucesso" quando successCount === 0', () => {
    const t = getBatchToast({ results: [], successCount: 0, failedCount: 2, skippedCount: 1 });
    expect(t.message).not.toMatch(/sucesso/);
  });
});

describe('classificação de erro do lote — 429 real vs. falso positivo (gateway friendlyError)', () => {
  const MSG_QUOTA = 'Limite de uso da IA atingido. Aguarde alguns instantes.';

  it('CASO 6 · 429 REAL do provider → mensagem de limite de uso', () => {
    expect(friendlyError('Gemini 429: Resource has been exhausted (e.g. check quota).')).toBe(MSG_QUOTA);
    expect(friendlyError('Gemini 429: rate limit')).toBe(MSG_QUOTA);
  });

  it('CASO 7 · texto contendo "429" que NÃO é status HTTP → NÃO vira limite de IA', () => {
    for (const raw of [
      'UNUSABLE_RESULT: SUSPICIOUSLY_SHORT [len=429]',
      'VALIDATION_ERROR: JSON parse error at position 4291',
      'position 429',
    ]) {
      expect(friendlyError(raw), raw).not.toBe(MSG_QUOTA);
    }
  });

  it('lote propaga a mensagem classificada como message do item failed', async () => {
    const summary = await runBatchGeneration(baseDeps({
      items: [ITEM.ESTUDO_CASO],
      sleep: async () => {},
      generate: async () => { throw new Error('Gemini 429: rate limit'); },
      classifyError: (e) => friendlyError(e instanceof Error ? e.message : String(e)),
    }));
    expect(summary.results[0]).toMatchObject({ status: 'failed', message: MSG_QUOTA, creditsCharged: 0, attempts: 3 });
  });
});

describe('BATCH_RETRY_MESSAGE', () => {
  it('mensagem de retry existe e é amigável (não marca erro)', () => {
    expect(BATCH_RETRY_MESSAGE).toMatch(/tentativa/i);
    expect(BATCH_RETRY_MESSAGE).not.toMatch(/erro|falha/i);
  });
});
