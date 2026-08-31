import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_WORKSPACE_ENABLED,
  FORMAL_WORKSPACE_DOC_TYPES,
  resolveDocumentWorkspaceEnabled,
  shouldShowFormalDocumentWorkspace,
  shouldShowPaeeWorkspace,
} from '../documentWorkspaceFlags';

describe('resolveDocumentWorkspaceEnabled (Fase 1 — flag do DocumentWorkspace)', () => {
  it('é desabilitada por padrão quando a variável não está definida', () => {
    expect(resolveDocumentWorkspaceEnabled(undefined)).toBe(false);
  });

  it('só habilita com a string exata "true"', () => {
    expect(resolveDocumentWorkspaceEnabled('true')).toBe(true);
  });

  it('mantém desabilitada para qualquer outro valor (fail-safe)', () => {
    expect(resolveDocumentWorkspaceEnabled('false')).toBe(false);
    expect(resolveDocumentWorkspaceEnabled('1')).toBe(false);
    expect(resolveDocumentWorkspaceEnabled('TRUE')).toBe(false);
    expect(resolveDocumentWorkspaceEnabled('')).toBe(false);
  });

  it('a flag exportada é sempre um booleano, nunca truthy/falsy acidental (string vazia, undefined, etc.)', () => {
    // [FASE 1b] Corrigido: a asserção anterior fixava DOCUMENT_WORKSPACE_ENABLED
    // em `false`, mas esse valor reflete o .env LOCAL de quem roda o teste — e
    // habilitar VITE_DOCUMENT_WORKSPACE_ENABLED=true no .env local (exatamente
    // como esta fase pede para testar manualmente) é um cenário legítimo, não
    // um bug. A garantia que temos como invariante de código (independente do
    // .env de quem executa) é: o valor exportado é sempre `true` ou `false`,
    // nunca outro tipo — o comportamento condicional real já é coberto pelos
    // testes de resolveDocumentWorkspaceEnabled acima, que não dependem do
    // ambiente.
    expect(typeof DOCUMENT_WORKSPACE_ENABLED).toBe('boolean');
  });
});

describe('shouldShowPaeeWorkspace (isolamento estrito do PAEE — Fase 1)', () => {
  it('flag desligada nunca mostra o workspace, mesmo para PAEE em visualização', () => {
    expect(shouldShowPaeeWorkspace(false, 'PAEE', false)).toBe(false);
  });

  it('flag ligada + PAEE + modo de visualização mostra o workspace', () => {
    expect(shouldShowPaeeWorkspace(true, 'PAEE', false)).toBe(true);
  });

  it('flag ligada + PAEE, mas em modo de edição, não mostra o workspace', () => {
    expect(shouldShowPaeeWorkspace(true, 'PAEE', true)).toBe(false);
  });

  it('flag ligada, mas fora do PAEE, nunca mostra o workspace (outros documentos inalterados)', () => {
    expect(shouldShowPaeeWorkspace(true, 'Estudo de Caso', false)).toBe(false);
    expect(shouldShowPaeeWorkspace(true, 'PEI', false)).toBe(false);
    expect(shouldShowPaeeWorkspace(true, 'PDI', false)).toBe(false);
    expect(shouldShowPaeeWorkspace(true, 'Documento Unificado PEI + PAEE', false)).toBe(false);
    expect(shouldShowPaeeWorkspace(true, 'Ficha de Acompanhamento', false)).toBe(false);
  });

  it('não quebra com valores inesperados de docType', () => {
    expect(shouldShowPaeeWorkspace(true, undefined, false)).toBe(false);
    expect(shouldShowPaeeWorkspace(true, null, false)).toBe(false);
    expect(shouldShowPaeeWorkspace(true, 123, false)).toBe(false);
  });
});

describe('shouldShowFormalDocumentWorkspace (expansão das exportações — todos os documentos formais com Word canônico)', () => {
  const FORMAIS = ['Estudo de Caso', 'PEI', 'PAEE', 'PDI', 'Documento Unificado PEI + PAEE'] as const;

  it('a lista canônica é exatamente os 5 documentos com renderer Word', () => {
    expect([...FORMAL_WORKSPACE_DOC_TYPES].sort()).toEqual([...FORMAIS].sort());
  });

  it.each(FORMAIS)('flag ligada + %s + visualização mostra o workspace', (docType) => {
    expect(shouldShowFormalDocumentWorkspace(true, docType, false)).toBe(true);
  });

  it.each(FORMAIS)('flag ligada + %s, mas em edição, NÃO mostra o workspace', (docType) => {
    expect(shouldShowFormalDocumentWorkspace(true, docType, true)).toBe(false);
  });

  it.each(FORMAIS)('flag DESLIGADA + %s nunca mostra o workspace (fail-safe)', (docType) => {
    expect(shouldShowFormalDocumentWorkspace(false, docType, false)).toBe(false);
  });

  it('documentos SEM Word canônico (Fase 2) nunca mostram o workspace, mesmo com a flag ligada', () => {
    for (const docType of [
      'Ficha de Acompanhamento',
      'Plano de Ação AEE',
      'RELATORIO_TECNICO',
      'Relatório Técnico',
      'Atividade Adaptada',
      'Estudo de Caso (Externo)',
    ]) {
      expect(shouldShowFormalDocumentWorkspace(true, docType, false)).toBe(false);
    }
  });

  it('não quebra com valores inesperados de docType', () => {
    expect(shouldShowFormalDocumentWorkspace(true, undefined, false)).toBe(false);
    expect(shouldShowFormalDocumentWorkspace(true, null, false)).toBe(false);
    expect(shouldShowFormalDocumentWorkspace(true, 123, false)).toBe(false);
    expect(shouldShowFormalDocumentWorkspace(true, {}, false)).toBe(false);
  });

  it('PAEE continua sendo um caso particular coberto pelas duas funções (piloto preservado)', () => {
    expect(shouldShowPaeeWorkspace(true, 'PAEE', false)).toBe(true);
    expect(shouldShowFormalDocumentWorkspace(true, 'PAEE', false)).toBe(true);
  });
});
