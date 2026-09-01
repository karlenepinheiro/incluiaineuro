import { describe, expect, it } from 'vitest';
import { resolveWordParagraphAlign } from '../wordExportService';

// Fake elemento mínimo — evita depender de DOMParser/jsdom, que o projeto não usa.
function fakeEl(attrs: Record<string, string | undefined>) {
  return {
    getAttribute: (name: string) => attrs[name] ?? null,
  };
}

describe('resolveWordParagraphAlign (Fase 1b — alinhamento no DOCX)', () => {
  it('detecta data-align="justify" (formato real persistido pelo RichTextEditor)', () => {
    expect(resolveWordParagraphAlign(fakeEl({ 'data-align': 'justify' }))).toBe('justify');
  });

  it('detecta data-align="center" e data-align="right"', () => {
    expect(resolveWordParagraphAlign(fakeEl({ 'data-align': 'center' }))).toBe('center');
    expect(resolveWordParagraphAlign(fakeEl({ 'data-align': 'right' }))).toBe('right');
  });

  it('usa style="text-align:..." como fallback quando não há data-align', () => {
    expect(resolveWordParagraphAlign(fakeEl({ style: 'text-align: justify' }))).toBe('justify');
  });

  it('prioriza data-align sobre style quando ambos existem', () => {
    expect(resolveWordParagraphAlign(fakeEl({ 'data-align': 'right', style: 'text-align: center' }))).toBe('right');
  });

  it('retorna "left" por padrão — garante que títulos/campos curtos/assinaturas continuam sem w:jc', () => {
    expect(resolveWordParagraphAlign(fakeEl({}))).toBe('left');
    expect(resolveWordParagraphAlign(fakeEl({ 'data-align': 'left' }))).toBe('left');
  });
});
