/**
 * formalPdfCompaction.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * [COMPACTAÇÃO E REDESIGN DOCUMENTAL — 09/2026]
 * Guarda de regressão para a compactação dos documentos formais da Fase 2
 * (PEI, PAEE, PDI, Plano Unificado, Estudo de Caso).
 *
 * A geração real desses PDFs (`PDFGenerator.generateFromSections`) depende de
 * `window`/`document` (carrega o jsPDF via <script> CDN) e não roda no ambiente
 * `node` do Vitest — por isso os demais testes de PDF do projeto também testam
 * apenas helpers puros.
 *
 * Aqui travamos:
 *  1. os tokens tipográficos compartilhados nos limites compactos acordados
 *     (fonte preservada, entrelinha reduzida de forma equilibrada);
 *  2. o comportamento do helper puro `renderFieldBlock` do Document Design
 *     System, que agora avança `y` de forma compacta.
 */
import { describe, expect, it } from 'vitest';
import {
  FORMAL_PDF_TYPOGRAPHY,
  FORMAL_PDF_LAYOUT,
  createFormalPdfContext,
  renderFieldBlock,
  type FormalPdfDocLike,
} from '../pdf/formalPdfDesignSystem';

describe('Document Design System — tokens compactos (fonte preservada)', () => {
  it('tamanhos de fonte do corpo NÃO foram reduzidos', () => {
    // A compactação nunca pode vir de encolher a fonte.
    expect(FORMAL_PDF_TYPOGRAPHY.bodySize).toBeGreaterThanOrEqual(10.5);
    expect(FORMAL_PDF_TYPOGRAPHY.smallBodySize).toBeGreaterThanOrEqual(9);
    expect(FORMAL_PDF_TYPOGRAPHY.sectionTitleSize).toBeGreaterThanOrEqual(11);
  });

  it('entrelinhas foram compactadas de forma equilibrada', () => {
    // Corpo 11pt (~3,9mm de glifo): entrelinha entre 1,25x e 1,45x.
    expect(FORMAL_PDF_TYPOGRAPHY.bodyLineHeight).toBeLessThanOrEqual(5.4);
    expect(FORMAL_PDF_TYPOGRAPHY.bodyLineHeight).toBeGreaterThanOrEqual(4.8);
    expect(FORMAL_PDF_TYPOGRAPHY.smallLineHeight).toBeLessThanOrEqual(4.5);
  });
});

// Mock mínimo de um documento jsPDF-like — suficiente para os helpers de layout.
function makeDocMock(): FormalPdfDocLike {
  return {
    internal: {
      pageSize: { getWidth: () => 210, getHeight: () => 297 },
      getNumberOfPages: () => 1,
      getCurrentPageInfo: () => ({ pageNumber: 1 }),
    },
    setFont: () => undefined,
    setFontSize: () => undefined,
    setTextColor: () => undefined,
    setDrawColor: () => undefined,
    setFillColor: () => undefined,
    setLineWidth: () => undefined,
    text: () => undefined,
    line: () => undefined,
    rect: () => undefined,
    roundedRect: () => undefined,
    splitTextToSize: (t: string, w: number) => {
      // ~2.2mm por caractere a 11pt — aproximação estável para o teste.
      const perLine = Math.max(1, Math.floor(w / 2.2));
      const out: string[] = [];
      for (let i = 0; i < t.length; i += perLine) out.push(t.slice(i, i + perLine));
      return out.length ? out : [''];
    },
    getTextWidth: (t: string) => t.length * 2.2,
    addPage: () => undefined,
    setPage: () => undefined,
    addImage: () => undefined,
  };
}

describe('renderFieldBlock — avanço vertical compacto', () => {
  it('um campo de ~3 linhas ocupa menos que a versão anterior (folga generosa)', () => {
    const doc = makeDocMock();
    const ctx = createFormalPdfContext(doc);
    const y0 = ctx.y;
    renderFieldBlock(ctx, {
      label: 'Estratégias e adaptações',
      value: 'x'.repeat(3 * Math.floor(FORMAL_PDF_LAYOUT.contentWidth / 2.2)),
    });
    const advance = ctx.y - y0;
    // label (5.5) + 3 linhas * bodyLineHeight(<=5.2) + folga(7) + fieldGap(<=5)
    expect(advance).toBeGreaterThan(0);
    expect(advance).toBeLessThanOrEqual(5.5 + 3 * 5.2 + 7 + 5);
  });
});
