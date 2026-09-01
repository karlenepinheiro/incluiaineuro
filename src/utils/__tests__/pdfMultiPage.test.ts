/**
 * pdfMultiPage.test.ts — Leitura multipágina do Cadastro Inteligente (27/08/2026)
 *
 * Cobre a lógica pura de planejamento de páginas (src/utils/pdfMultiPage.ts):
 * quantas páginas processar, mensagens antes/depois do processamento, e a
 * heurística de página em branco. Nenhum teste aqui usa pdfjs/canvas/DOM —
 * ver a nota de ambiente em studentDocumentImportService.test.ts para por
 * que a renderização real não é (e não pode ser, neste ambiente) coberta por
 * teste automatizado.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_VISUAL_PDF_PAGES,
  planMultiPagePdf,
  buildMultiPagePreProcessingNotice,
  buildMultiPageButtonLabel,
  buildMultiPageSuccessMessage,
  buildAnalyzedPagesLabel,
  isImageDataLikelyBlank,
} from '../pdfMultiPage';

describe('planMultiPagePdf', () => {
  it('PDF de 1 página: planeja 1 página', () => {
    const plan = planMultiPagePdf(1);
    expect(plan.pagesToRender).toEqual([1]);
    expect(plan.limited).toBe(false);
  });

  it('PDF de 2 páginas: planeja as 2', () => {
    const plan = planMultiPagePdf(2);
    expect(plan.pagesToRender).toEqual([1, 2]);
    expect(plan.limited).toBe(false);
  });

  it('PDF de 5 páginas: planeja as 5', () => {
    const plan = planMultiPagePdf(5);
    expect(plan.pagesToRender).toEqual([1, 2, 3, 4, 5]);
    expect(plan.limited).toBe(false);
  });

  it('PDF de 10 páginas: planeja as 10 (limite exato, ainda não "limitado")', () => {
    const plan = planMultiPagePdf(10);
    expect(plan.pagesToRender).toHaveLength(10);
    expect(plan.pagesToRender).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(plan.limited).toBe(false);
  });

  it('PDF de 11 páginas: planeja somente as 10 primeiras e marca limited=true', () => {
    const plan = planMultiPagePdf(11);
    expect(plan.pagesToRender).toHaveLength(10);
    expect(plan.pagesToRender).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(plan.limited).toBe(true);
  });

  it('PDF de 20 páginas: planeja somente as 10 primeiras — nunca a página 11 em diante', () => {
    const plan = planMultiPagePdf(20);
    expect(plan.pagesToRender).toHaveLength(10);
    expect(plan.pagesToRender).not.toContain(11);
    expect(plan.pagesToRender).not.toContain(20);
    expect(plan.limited).toBe(true);
  });

  it('páginas preservam ordem crescente, começando em 1, sem repetir a primeira', () => {
    const plan = planMultiPagePdf(6);
    expect(plan.pagesToRender).toEqual([1, 2, 3, 4, 5, 6]);
    expect(plan.pagesToRender[0]).toBe(1);
    expect(new Set(plan.pagesToRender).size).toBe(plan.pagesToRender.length); // sem duplicatas
  });

  it('contagem local (planMultiPagePdf) é só aritmética — não é uma chamada de IA nem tem custo', () => {
    // Chamar duas vezes com o mesmo total produz exatamente o mesmo plano —
    // função pura, sem efeito colateral, sem estado.
    expect(planMultiPagePdf(7)).toEqual(planMultiPagePdf(7));
  });

  it('0 páginas / valores inválidos não quebram — plano vazio', () => {
    expect(planMultiPagePdf(0).pagesToRender).toEqual([]);
    expect(planMultiPagePdf(NaN).pagesToRender).toEqual([]);
    expect(planMultiPagePdf(-3).pagesToRender).toEqual([]);
  });

  it('MAX_VISUAL_PDF_PAGES é 10 (regra de páginas oficial desta fase)', () => {
    expect(MAX_VISUAL_PDF_PAGES).toBe(10);
  });
});

describe('buildMultiPagePreProcessingNotice', () => {
  it('1 página: mensagem específica', () => {
    expect(buildMultiPagePreProcessingNotice(1)).toBe(
      'Seu documento possui 1 página. Ela será analisada por leitura visual.',
    );
  });

  it('2 a 10 páginas: "todas serão analisadas"', () => {
    expect(buildMultiPagePreProcessingNotice(2)).toBe(
      'Seu documento possui 2 páginas. Todas serão analisadas por leitura visual.',
    );
    expect(buildMultiPagePreProcessingNotice(10)).toBe(
      'Seu documento possui 10 páginas. Todas serão analisadas por leitura visual.',
    );
  });

  it('mais de 10 páginas: avisa o corte e sugere dividir o arquivo', () => {
    const msg = buildMultiPagePreProcessingNotice(23);
    expect(msg).toContain('23 páginas');
    expect(msg).toContain('10 primeiras');
    expect(msg).toContain('divida o arquivo');
  });

  it('contagem desconhecida (null): mensagem honesta, plano conservador de 1 página', () => {
    const msg = buildMultiPagePreProcessingNotice(null);
    expect(msg).toContain('Não foi possível determinar o número de páginas');
  });

  it('nunca retorna vazio/null — sempre informativa', () => {
    for (const n of [null, 1, 2, 10, 11, 999]) {
      expect(buildMultiPagePreProcessingNotice(n).length).toBeGreaterThan(0);
    }
  });
});

describe('buildMultiPageButtonLabel', () => {
  it('1 página: singular', () => {
    expect(buildMultiPageButtonLabel(1, 5)).toBe('Analisar 1 página — 5 créditos');
  });

  it('N páginas dentro do limite: plural com a contagem exata', () => {
    expect(buildMultiPageButtonLabel(4, 5)).toBe('Analisar 4 páginas — 5 créditos');
    expect(buildMultiPageButtonLabel(10, 5)).toBe('Analisar 10 páginas — 5 créditos');
  });

  it('acima do limite: menciona explicitamente "as 10 primeiras"', () => {
    expect(buildMultiPageButtonLabel(15, 5)).toBe('Analisar as 10 primeiras páginas — 5 créditos');
  });
});

describe('buildMultiPageSuccessMessage', () => {
  it('singular/plural de páginas e créditos', () => {
    expect(buildMultiPageSuccessMessage(1, 1)).toBe('Análise concluída — 1 página processada e 1 crédito utilizado.');
    expect(buildMultiPageSuccessMessage(3, 5)).toBe('Análise concluída — 3 páginas processadas e 5 créditos utilizados.');
  });
});

describe('buildAnalyzedPagesLabel', () => {
  it('nenhuma página: null', () => {
    expect(buildAnalyzedPagesLabel([])).toBeNull();
  });

  it('uma única página', () => {
    expect(buildAnalyzedPagesLabel([1])).toBe('Dados analisados na página 1.');
  });

  it('intervalo contíguo: "1–N"', () => {
    expect(buildAnalyzedPagesLabel([1, 2, 3])).toBe('Dados analisados nas páginas 1–3.');
  });

  it('páginas não contíguas (ex.: página em branco removida do meio): lista natural em português', () => {
    expect(buildAnalyzedPagesLabel([1, 3])).toBe('Dados analisados nas páginas 1 e 3.');
    expect(buildAnalyzedPagesLabel([1, 2, 4])).toBe('Dados analisados nas páginas 1, 2 e 4.');
  });
});

describe('isImageDataLikelyBlank', () => {
  function solidColorImageData(r: number, g: number, b: number, pixels = 400): Uint8ClampedArray {
    const data = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
    return data;
  }

  it('página totalmente branca: em branco', () => {
    expect(isImageDataLikelyBlank(solidColorImageData(255, 255, 255))).toBe(true);
  });

  it('página quase branca (leve ruído de scanner): ainda considerada em branco', () => {
    expect(isImageDataLikelyBlank(solidColorImageData(252, 253, 251))).toBe(true);
  });

  it('página totalmente preta: não é em branco', () => {
    expect(isImageDataLikelyBlank(solidColorImageData(0, 0, 0))).toBe(false);
  });

  it('página com texto (mistura de pixels escuros e claros): não é em branco', () => {
    const data = solidColorImageData(255, 255, 255, 1000);
    // "escreve" um bloco escuro no meio, simulando texto
    for (let i = 400; i < 700; i += 4) {
      data[i] = 20; data[i + 1] = 20; data[i + 2] = 20;
    }
    expect(isImageDataLikelyBlank(data)).toBe(false);
  });

  it('array vazio/curto: tratado como em branco (nada para analisar)', () => {
    expect(isImageDataLikelyBlank(new Uint8ClampedArray(0))).toBe(true);
  });
});
