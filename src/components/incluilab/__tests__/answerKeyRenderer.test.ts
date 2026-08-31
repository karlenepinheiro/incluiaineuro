/**
 * Sprint 2B.3 (item 4) — o Gabarito deliberadamente NÃO usa ReactMarkdown/remark-gfm,
 * para eliminar o risco de uma tabela GFM ou token longo forçar overflow horizontal
 * (causa raiz do layout quebrado identificada na Auditoria 2B.2-C). Este teste tranca
 * essa decisão de design por inspeção de código — regressão barata de detectar.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const componentPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../AnswerKeyRenderer.tsx');
const source = readFileSync(componentPath, 'utf-8');

describe('AnswerKeyRenderer — sem ReactMarkdown, com proteção de overflow (item 4)', () => {
  it('não importa react-markdown nem remark-gfm', () => {
    // Checa apenas linhas de import reais — o comentário do arquivo cita esses
    // nomes de propósito, para documentar a decisão de design.
    expect(source).not.toMatch(/from\s+['"]react-markdown['"]/);
    expect(source).not.toMatch(/from\s+['"]remark-gfm['"]/);
  });

  it('aplica overflowWrap/wordBreak na página e nos itens do gabarito', () => {
    expect(source).toContain("overflowWrap: 'break-word'");
    expect(source).toContain("wordBreak: 'break-word'");
  });
});
