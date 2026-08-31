/**
 * Checkpoint 2B.1 — aviso honesto sobre ilustração.
 *
 * Mesmo raciocínio do teste de regressão do pipeline legado: ResultView é um
 * componente interno não exportado de IncluiLabView.tsx, não isolável sem a
 * refatoração ampla que o Sprint 2B (item 19) e o Checkpoint 2B.1 ("não faça
 * nenhuma outra refatoração") proíbem. Este teste garante, por inspeção do
 * código-fonte, que:
 *   1. a condição do aviso está ligada a `visualMode === 'illustration'` e à
 *      ausência de qualquer asset com `deliveredAs === 'illustration'`;
 *   2. o texto do aviso é o combinado com o usuário;
 *   3. nada no código passa a considerar pictograma como ilustração real.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const viewPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../IncluiLabView.tsx');
const source = readFileSync(viewPath, 'utf-8');

describe('IncluiLabView — aviso honesto de ilustração (Checkpoint 2B.1)', () => {
  it('define showIllustrationFallbackNotice a partir de visualMode="illustration" sem asset deliveredAs="illustration"', () => {
    expect(source).toContain('const showIllustrationFallbackNotice');
    expect(source).toContain("result.activityPackage.metadata.visualMode === 'illustration'");
    expect(source).toContain("a.deliveredAs === 'illustration'");
  });

  it('renderiza o texto combinado com o usuário apenas quando showIllustrationFallbackNotice é true', () => {
    // Checkpoint 4E: o aviso passou de bloco JSX inline `{cond && (...)}` para
    // uma variável pré-computada `showIllustrationFallbackNoticeInCard` (usada
    // no novo card compacto de resultado) — mesma condição, mesmo texto, só
    // muda ONDE o JSX é montado (ternário em vez de curto-circuito inline).
    expect(source).toContain('const showIllustrationFallbackNoticeInCard = showIllustrationFallbackNotice ? (');
    expect(source).toContain('Você pediu uma ilustração. Nesta versão, usamos apoio visual com pictogramas.');
    expect(source).toContain('A geração de ilustrações reais ainda não está disponível neste modo.');
  });
});
