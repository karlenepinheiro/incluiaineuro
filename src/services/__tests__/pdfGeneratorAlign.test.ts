import { describe, expect, it } from 'vitest';
import { resolveRichTextAlign } from '../PDFGenerator';

// Fake elemento mínimo — evita depender de DOMParser/jsdom, que o projeto não usa.
function fakeEl(attrs: Record<string, string | undefined>) {
  return {
    getAttribute: (name: string) => attrs[name] ?? null,
  };
}

describe('resolveRichTextAlign (Fase 1b — alinhamento no PDF)', () => {
  it('detecta data-align="justify" (formato real persistido pelo RichTextEditor)', () => {
    expect(resolveRichTextAlign(fakeEl({ 'data-align': 'justify' }))).toBe('justify');
  });

  it('detecta data-align="center" e data-align="right"', () => {
    expect(resolveRichTextAlign(fakeEl({ 'data-align': 'center' }))).toBe('center');
    expect(resolveRichTextAlign(fakeEl({ 'data-align': 'right' }))).toBe('right');
  });

  it('usa style="text-align:..." como fallback quando não há data-align', () => {
    expect(resolveRichTextAlign(fakeEl({ style: 'text-align: justify' }))).toBe('justify');
    expect(resolveRichTextAlign(fakeEl({ style: 'text-align:center' }))).toBe('center');
  });

  it('prioriza data-align sobre style quando ambos existem', () => {
    expect(resolveRichTextAlign(fakeEl({ 'data-align': 'right', style: 'text-align: center' }))).toBe('right');
  });

  it('retorna "left" por padrão quando não há nenhuma marcação de alinhamento', () => {
    expect(resolveRichTextAlign(fakeEl({}))).toBe('left');
  });

  it('retorna "left" para data-align="left" explícito ou valores desconhecidos (não regride título/cabeçalho/campo curto)', () => {
    expect(resolveRichTextAlign(fakeEl({ 'data-align': 'left' }))).toBe('left');
    expect(resolveRichTextAlign(fakeEl({ 'data-align': 'invalido' }))).toBe('left');
  });
});
