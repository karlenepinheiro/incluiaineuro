/**
 * intelligentProfileVersion.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * M-06: regenerar o Perfil Inteligente a partir de uma versão ANTIGA deve
 * produzir max(version_number) + 1 — nunca (versão selecionada) + 1.
 * M-12: o custo exibido na interface deve reutilizar a config canônica.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nextProfileVersion } from '../intelligentProfileService';
import { AI_CREDIT_COSTS } from '../../config/aiCosts';

describe('nextProfileVersion (M-06)', () => {
  it('lista vazia → 1', () => {
    expect(nextProfileVersion([])).toBe(1);
    expect(nextProfileVersion(undefined as any)).toBe(1);
  });

  it('usa o MAIOR version_number existente + 1', () => {
    const versions = [
      { version_number: 5 }, { version_number: 4 }, { version_number: 3 },
      { version_number: 2 }, { version_number: 1 },
    ];
    expect(nextProfileVersion(versions)).toBe(6);
  });

  it('regenerar a partir da versão selecionada (ex: 2) ainda produz max+1', () => {
    // simula: getVersions retorna [5,4,3,2,1]; usuário seleciona a 2 e clica "Atualizar com IA"
    const versions = [
      { version_number: 5 }, { version_number: 4 }, { version_number: 3 },
      { version_number: 2 }, { version_number: 1 },
    ];
    const selected = versions.find(v => v.version_number === 2)!;
    // o BUG antigo era `selected.version_number + 1` = 3 (duplicado)
    expect(selected.version_number + 1).toBe(3);
    // a correção:
    expect(nextProfileVersion(versions)).toBe(6);
  });

  it('tolera version_number nulo/ausente/string', () => {
    expect(nextProfileVersion([{ version_number: null }, { version_number: 3 }, {} as any])).toBe(4);
    expect(nextProfileVersion([{ version_number: '7' as any }])).toBe(8);
  });
});

describe('custo visual do Perfil Inteligente (M-12)', () => {
  const src = readFileSync(
    resolve(__dirname, '../../components/IntelligentProfileTab.tsx'), 'utf8',
  );

  it('não contém mais o literal "5 créditos"', () => {
    expect(src).not.toMatch(/\b5\s+cr[ée]ditos\b/i);
  });

  it('deriva o custo de AI_CREDIT_COSTS.PERFIL_INTELIGENTE', () => {
    expect(src).toContain('AI_CREDIT_COSTS.PERFIL_INTELIGENTE');
    expect(src).toContain('PROFILE_COST');
  });

  it('o custo canônico do Perfil Inteligente é o mesmo debitado (6)', () => {
    // guarda contra alteração silenciosa da constante sem revisar a UI
    expect(AI_CREDIT_COSTS.PERFIL_INTELIGENTE).toBe(6);
  });
});
