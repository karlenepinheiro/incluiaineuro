/**
 * Sprint 2B.3 (item 5, Auditoria 2B.2-E) — autosave da Biblioteca e erro visível.
 *
 * Mesma limitação dos outros testes baseados em código-fonte deste arquivo:
 * IncluiLabView.tsx não é isolável para teste unitário convencional sem a
 * refatoração ampla fora de escopo. Este teste garante, por inspeção do
 * código-fonte, que:
 *   1. os três geradores canônicos textuais chamam autoSavePersistedResult após o commit;
 *   2. persistResult nunca usa user.id como tenant_id (fallback perigoso removido);
 *   3. falhas de persistência acionam setErrorMsg (visível), não só console.error.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const viewPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../IncluiLabView.tsx');
const source = readFileSync(viewPath, 'utf-8');

describe('IncluiLabView — autosave e erro visível na Biblioteca (Sprint 2B.3)', () => {
  it('os três geradores canônicos textuais chamam autoSavePersistedResult após setResult', () => {
    for (const [fn, nextFn] of [
      ['generateA4EconomicaCanonical', 'generateAvaliacaoCanonical'],
      ['generateAvaliacaoCanonical', 'generateA4Visual'],
      ['generateAdaptarEconomicoCanonical', 'generateAdaptarVisual'],
    ] as const) {
      const start = source.indexOf(`async function ${fn}(`);
      const end = source.indexOf(`async function ${nextFn}(`);
      expect(start, `${fn} não encontrada`).toBeGreaterThan(-1);
      expect(end, `${nextFn} não encontrada`).toBeGreaterThan(start);
      expect(source.slice(start, end), `${fn} deveria chamar autoSavePersistedResult`).toContain('await autoSavePersistedResult(nextResult);');
    }
  });

  it('persistResult NUNCA usa user.id como fallback de tenantId (padrão perigoso removido)', () => {
    expect(source).not.toContain('tenantId:    (user as any).tenant_id ?? user.id');
    expect(source).not.toContain('tenantId: (user as any).tenant_id ?? user.id');
  });

  it('persistResult retorna erro explícito quando tenantId está ausente, sem inventar fallback', () => {
    expect(source).toContain("tenant não identificado para este usuário");
  });

  it('falhas de persistência não ficam só em console.error — setErrorMsg é chamado', () => {
    expect(source).toContain('setErrorMsg(outcome.errorMsg)');
  });

  it('handleSave e o autosave compartilham o mesmo caminho de persistência (persistResult)', () => {
    expect(source).toContain('const outcome = await persistResult(result);');
    expect(source).toContain('const outcome = await persistResult(target);');
  });
});
