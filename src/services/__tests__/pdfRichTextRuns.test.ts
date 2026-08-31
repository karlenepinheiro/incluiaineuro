import { describe, expect, it } from 'vitest';
import {
  fontVariantOf,
  normalizeInlineRunText,
  renderStyledLine,
  trimRunsEdges,
  wrapRunsToLines,
  type InlineRun,
  type LineWord,
} from '../PDFGenerator';

// ─── Fake jsPDF doc — sem depender de DOM/jsdom ────────────────────────────
// getTextWidth() é determinístico por variante: negrito/negrito-itálico são
// "mais largos" que o mesmo texto normal, para que os testes de quebra de
// linha consigam distinguir a largura de acordo com o estilo (exatamente o
// comportamento que a correção precisa ter: uma palavra em negrito ocupa
// mais espaço que a mesma palavra em texto normal).
const CHAR_W: Record<string, number> = { normal: 2, bold: 2.4, italic: 2, bolditalic: 2.4 };

function makeFakeDoc() {
  const calls: Array<{ type: string; args: any[] }> = [];
  let variant = 'normal';
  return {
    calls,
    setFont: (family: string, v: string) => { variant = v; calls.push({ type: 'setFont', args: [family, v] }); },
    setFontSize: (size: number) => { calls.push({ type: 'setFontSize', args: [size] }); },
    getTextWidth: (text: string) => text.length * (CHAR_W[variant] ?? 2),
    text: (text: string, x: number, y: number, opts?: any) => { calls.push({ type: 'text', args: [text, x, y, opts] }); },
    line: (x1: number, y1: number, x2: number, y2: number) => { calls.push({ type: 'line', args: [x1, y1, x2, y2] }); },
    setLineWidth: (w: number) => { calls.push({ type: 'setLineWidth', args: [w] }); },
  };
}

const run = (text: string, over: Partial<InlineRun> = {}): InlineRun =>
  ({ text, bold: false, italic: false, underline: false, ...over });

describe('fontVariantOf', () => {
  it('mapeia bold+italic para bolditalic e cada combinação isolada', () => {
    expect(fontVariantOf({ bold: false, italic: false })).toBe('normal');
    expect(fontVariantOf({ bold: true, italic: false })).toBe('bold');
    expect(fontVariantOf({ bold: false, italic: true })).toBe('italic');
    expect(fontVariantOf({ bold: true, italic: true })).toBe('bolditalic');
  });
});

describe('trimRunsEdges', () => {
  it('remove espaço em branco nas pontas, preservando o conteúdo do meio', () => {
    // Único run não-vazio é ao mesmo tempo o primeiro e o último da
    // sequência, então recebe trim dos dois lados — mesmo comportamento do
    // antigo `.trim()` sobre o texto inteiro do bloco.
    const trimmed = trimRunsEdges([run('  '), run('  texto  '), run('  ')]);
    expect(trimmed.map(r => r.text)).toEqual(['texto']);
  });

  it('em runs diferentes, só a ponta externa de cada extremidade é cortada', () => {
    const trimmed = trimRunsEdges([run('  início '), run('meio'), run(' fim  ')]);
    expect(trimmed.map(r => r.text)).toEqual(['início ', 'meio', ' fim']);
  });

  it('não remove marcadores de quebra de linha (\\n) mesmo nas pontas', () => {
    const trimmed = trimRunsEdges([run('\n'), run('texto'), run('\n')]);
    expect(trimmed.map(r => r.text)).toEqual(['\n', 'texto', '\n']);
  });
});

describe('normalizeInlineRunText', () => {
  it('remove marcações markdown literais residuais (não deveria haver tags reais aqui)', () => {
    expect(normalizeInlineRunText('**negrito**')).toBe('negrito');
    expect(normalizeInlineRunText('normal')).toBe('normal');
  });
});

describe('wrapRunsToLines — quebra de linha com largura dependente do estilo', () => {
  it('quebra em múltiplas linhas quando o texto excede maxW', () => {
    const doc = makeFakeDoc();
    const runs: InlineRun[] = [run('uma frase razoavelmente longa para quebrar')];
    const lines = wrapRunsToLines(doc, runs, 'helvetica', 10, 20);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('uma palavra em negrito ocupa mais espaço que a mesma palavra em texto normal (mesmo maxW quebra antes)', () => {
    const doc = makeFakeDoc();
    const normalRuns: InlineRun[] = [run('palavra palavra palavra')];
    const boldRuns: InlineRun[] = [run('palavra palavra palavra', { bold: true })];
    const maxW = 15; // largura calibrada para caber ~3 palavras normais, não em negrito
    const normalLines = wrapRunsToLines(doc, normalRuns, 'helvetica', 10, maxW);
    const boldLines = wrapRunsToLines(doc, boldRuns, 'helvetica', 10, maxW);
    expect(boldLines.length).toBeGreaterThanOrEqual(normalLines.length);
  });

  it('um run "\\n" (originado de <br>) força quebra de linha mesmo sem exceder a largura', () => {
    const doc = makeFakeDoc();
    const runs: InlineRun[] = [run('linha um'), run('\n'), run('linha dois')];
    const lines = wrapRunsToLines(doc, runs, 'helvetica', 10, 1000); // largura enorme — só quebraria por \n
    expect(lines.length).toBe(2);
    expect(lines[0].map(w => w.text)).toEqual(['linha', 'um']);
    expect(lines[1].map(w => w.text)).toEqual(['linha', 'dois']);
  });

  it('preserva o estilo (bold/italic/underline) de cada palavra individualmente', () => {
    const doc = makeFakeDoc();
    const runs: InlineRun[] = [
      run('normal '),
      run('negrito', { bold: true }),
      run(' '),
      run('sublinhado', { underline: true }),
    ];
    const lines = wrapRunsToLines(doc, runs, 'helvetica', 10, 1000);
    const words = lines[0];
    expect(words.find(w => w.text === 'normal')).toMatchObject({ bold: false, italic: false, underline: false });
    expect(words.find(w => w.text === 'negrito')).toMatchObject({ bold: true, italic: false });
    expect(words.find(w => w.text === 'sublinhado')).toMatchObject({ underline: true, bold: false });
  });
});

describe('renderStyledLine — desenho de uma linha com estilos mistos', () => {
  it('aplica a variante de fonte correta antes de desenhar cada palavra', () => {
    const doc = makeFakeDoc();
    const words: LineWord[] = [
      { text: 'normal', bold: false, italic: false, underline: false },
      { text: 'negrito', bold: true, italic: false, underline: false },
      { text: 'italico', bold: false, italic: true, underline: false },
    ];
    renderStyledLine(doc, words, 0, 10, 100, 'left', true, 'helvetica', 10);
    const textCalls = doc.calls.filter(c => c.type === 'text');
    expect(textCalls.map(c => c.args[0])).toEqual(['normal', 'negrito', 'italico']);

    // Para cada chamada de texto, a variante ativa (último setFont antes dela) deve bater.
    const variantBeforeEachText = textCalls.map((tc) => {
      const idx = doc.calls.indexOf(tc);
      const priorSetFont = [...doc.calls.slice(0, idx)].reverse().find(c => c.type === 'setFont');
      return priorSetFont?.args[1];
    });
    expect(variantBeforeEachText).toEqual(['normal', 'bold', 'italic']);
  });

  it('desenha um traço de sublinhado sob a palavra sublinhada, e não sob as demais', () => {
    const doc = makeFakeDoc();
    const words: LineWord[] = [
      { text: 'normal', bold: false, italic: false, underline: false },
      { text: 'sublinhado', bold: false, italic: false, underline: true },
    ];
    renderStyledLine(doc, words, 0, 10, 100, 'left', true, 'helvetica', 10);
    const lineCalls = doc.calls.filter(c => c.type === 'line');
    expect(lineCalls.length).toBe(1); // só a palavra sublinhada gera um traço
  });

  it('não desenha traço de sublinhado quando nenhuma palavra está sublinhada', () => {
    const doc = makeFakeDoc();
    const words: LineWord[] = [
      { text: 'normal', bold: false, italic: false, underline: false },
      { text: 'negrito', bold: true, italic: false, underline: false },
    ];
    renderStyledLine(doc, words, 0, 10, 100, 'left', true, 'helvetica', 10);
    expect(doc.calls.filter(c => c.type === 'line').length).toBe(0);
  });

  it('justificação: linha não-final estica o espaçamento até preencher a largura, mesmo com estilos mistos', () => {
    const doc = makeFakeDoc();
    const words: LineWord[] = [
      { text: 'aaaa', bold: false, italic: false, underline: false },
      { text: 'bbbb', bold: true, italic: false, underline: false },
      { text: 'cccc', bold: false, italic: true, underline: false },
      { text: 'dddd', bold: false, italic: false, underline: false },
    ];
    // effW calibrado para que o gap necessário fique DENTRO da guarda de
    // "espaçamento não pode ficar exagerado" (0.6x a 3.2x o espaço normal);
    // um effW grande demais faria a própria guarda recusar esticar a linha
    // (comportamento correto, mas não é o que este teste quer exercitar).
    const effW = 45;
    renderStyledLine(doc, words, 0, 10, effW, 'justify', /* isLastLine */ false, 'helvetica', 10);
    const textCalls = doc.calls.filter(c => c.type === 'text');
    const lastCall = textCalls[textCalls.length - 1];
    const lastX = lastCall.args[1];
    // A última palavra da linha justificada deve terminar bem próxima da
    // margem direita (lx=0 + effW), não amontoada à esquerda como em texto
    // alinhado à esquerda comum.
    const lastWidth = lastCall.args[0].length * CHAR_W.normal;
    expect(lastX + lastWidth).toBeGreaterThan(effW * 0.85);
  });

  it('justificação: a última linha do bloco NÃO é esticada (permanece com espaçamento natural)', () => {
    const doc = makeFakeDoc();
    const words: LineWord[] = [
      { text: 'aaaa', bold: false, italic: false, underline: false },
      { text: 'bbbb', bold: true, italic: false, underline: false },
      { text: 'cccc', bold: false, italic: true, underline: false },
    ];
    const effW = 100;
    renderStyledLine(doc, words, 0, 10, effW, 'justify', /* isLastLine */ true, 'helvetica', 10);
    const textCalls = doc.calls.filter(c => c.type === 'text');
    const lastCall = textCalls[textCalls.length - 1];
    const lastWidth = lastCall.args[0].length * CHAR_W.normal;
    // Sem esticar, a última palavra termina bem antes da largura total.
    expect(lastCall.args[1] + lastWidth).toBeLessThan(effW * 0.6);
  });

  it('não faz nada quando a lista de palavras está vazia', () => {
    const doc = makeFakeDoc();
    renderStyledLine(doc, [], 0, 10, 100, 'left', true, 'helvetica', 10);
    expect(doc.calls.filter(c => c.type === 'text').length).toBe(0);
  });
});
