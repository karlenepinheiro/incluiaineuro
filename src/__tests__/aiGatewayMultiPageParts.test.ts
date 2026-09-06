/**
 * Testes da correção de numeração (27/08/2026, restaurados em 06/09/2026 —
 * regressão C-1): quando uma página do meio é descartada (ex.: em branco), o
 * rótulo "Página N" enviado ao modelo NÃO pode renumerar por posição no
 * array. Cobre `_multiPageParts.ts` — a montagem real de partes Gemini usada
 * por `_vertex.ts`.
 *
 * Função pura, sem Deno/imports remotos — executada de verdade (não é
 * checagem de string de código-fonte). `generateGeminiJSON` em si não pode
 * rodar aqui (chama `Deno.env`/faz fetch real) — por isso a montagem de
 * partes foi extraída para esta função pura, exatamente como
 * `_usability.ts`/`_imagesValidation.ts`.
 *
 * ESCOPO: esta restauração de emergência traz só o adapter Gemini. Os
 * helpers OpenAI do arquivo original de `2ee5982` NÃO foram restaurados
 * (não há provider OpenAI nesta branch).
 */
import { describe, expect, it } from 'vitest';
import {
  resolvePageLabels,
  buildGeminiMultiImageParts,
  splitDataUrl,
} from '../../supabase/functions/ai-gateway/_multiPageParts.ts';

function fakeDataUrl(mime: string, marker: string): string {
  return `data:image/${mime};base64,${marker}`;
}

describe('resolvePageLabels', () => {
  it('sem pageNumbers: rótulos por posição (1, 2, 3...) — comportamento de antes da correção', () => {
    expect(resolvePageLabels(3, undefined)).toEqual([1, 2, 3]);
  });

  it('com pageNumbers do mesmo tamanho: usa os números reais, mesmo com lacunas', () => {
    expect(resolvePageLabels(2, [1, 3])).toEqual([1, 3]);
  });

  it('pageNumbers de tamanho diferente de images: ignora e cai no fallback por posição (defensivo)', () => {
    expect(resolvePageLabels(3, [1, 3])).toEqual([1, 2, 3]);
  });
});

describe('splitDataUrl', () => {
  it('extrai mimeType e payload base64 sem o prefixo', () => {
    expect(splitDataUrl('data:image/png;base64,AAAA')).toEqual({ mimeType: 'image/png', data: 'AAAA' });
  });

  it('sem prefixo: usa image/jpeg como fallback e devolve o payload inteiro', () => {
    expect(splitDataUrl('AAAA')).toEqual({ mimeType: 'image/jpeg', data: 'AAAA' });
  });
});

describe('buildGeminiMultiImageParts — caso central da correção: PDF de 3 páginas, página 2 em branco', () => {
  it('imagens enviadas são as páginas 1 e 3 — rotula "Página 1" e "Página 3", NUNCA "Página 1"/"Página 2"', () => {
    const images = [fakeDataUrl('jpeg', 'PAG1'), fakeDataUrl('jpeg', 'PAG3')];
    const parts = buildGeminiMultiImageParts(images, [1, 3]);

    const labels = parts.filter(p => p.text).map(p => p.text);
    expect(labels).toEqual(['Página 1', 'Página 3']);
    // nunca "Página 2" — a página em branco não existe nesta lista
    expect(labels).not.toContain('Página 2');
  });

  it('sem pageNumbers (chamada antiga): cai no fallback por posição — "Página 1"/"Página 2" (comportamento preservado)', () => {
    const images = [fakeDataUrl('jpeg', 'PAG1'), fakeDataUrl('jpeg', 'PAG3')];
    const parts = buildGeminiMultiImageParts(images); // sem pageNumbers

    const labels = parts.filter(p => p.text).map(p => p.text);
    expect(labels).toEqual(['Página 1', 'Página 2']); // fallback antigo, documentado
  });

  it('1 única imagem: NENHUM rótulo de página é adicionado — payload idêntico ao de antes da leitura multipágina', () => {
    const parts = buildGeminiMultiImageParts([fakeDataUrl('jpeg', 'SOLO')]);
    expect(parts).toEqual([{ inlineData: { mimeType: 'image/jpeg', data: 'SOLO' } }]);
  });

  it('lista vazia (nenhuma imagem): nenhuma parte — o prompt textual do chamador segue intacto', () => {
    expect(buildGeminiMultiImageParts([])).toEqual([]);
  });

  it('ordem das partes preserva a ordem de entrada das imagens', () => {
    const images = [fakeDataUrl('png', 'A'), fakeDataUrl('jpeg', 'B'), fakeDataUrl('webp', 'C')];
    const parts = buildGeminiMultiImageParts(images, [2, 5, 9]);
    const inlineDataInOrder = parts.filter(p => p.inlineData).map(p => p.inlineData!.data);
    expect(inlineDataInOrder).toEqual(['A', 'B', 'C']);
  });

  it('a primeira imagem nunca aparece duas vezes', () => {
    const images = [fakeDataUrl('jpeg', 'FIRST'), fakeDataUrl('jpeg', 'SECOND'), fakeDataUrl('jpeg', 'THIRD')];
    const parts = buildGeminiMultiImageParts(images, [1, 2, 3]);
    const firstCount = parts.filter(p => p.inlineData?.data === 'FIRST').length;
    expect(firstCount).toBe(1);
  });

  it('MIME real de cada página é preservado (não colapsa tudo para jpeg): PNG e WEBP', () => {
    const images = [fakeDataUrl('png', 'A'), fakeDataUrl('webp', 'B')];
    const parts = buildGeminiMultiImageParts(images, [1, 4]);
    const mimes = parts.filter(p => p.inlineData).map(p => p.inlineData!.mimeType);
    expect(mimes).toEqual(['image/png', 'image/webp']);
  });

  it('MIME JPEG é preservado', () => {
    const parts = buildGeminiMultiImageParts([fakeDataUrl('jpeg', 'A'), fakeDataUrl('jpeg', 'B')], [1, 2]);
    const mimes = parts.filter(p => p.inlineData).map(p => p.inlineData!.mimeType);
    expect(mimes).toEqual(['image/jpeg', 'image/jpeg']);
  });

  it('nenhuma imagem é descartada silenciosamente — 1 inlineData por imagem de entrada', () => {
    const images = Array.from({ length: 6 }, (_, i) => fakeDataUrl('jpeg', `P${i}`));
    const parts = buildGeminiMultiImageParts(images, [1, 2, 3, 5, 6, 7]);
    expect(parts.filter(p => p.inlineData).length).toBe(6);
  });

  it('10 páginas (limite): 10 rótulos + 10 inlineData, na ordem', () => {
    const images = Array.from({ length: 10 }, (_, i) => fakeDataUrl('jpeg', `P${i}`));
    const pageNumbers = Array.from({ length: 10 }, (_, i) => i + 1);
    const parts = buildGeminiMultiImageParts(images, pageNumbers);
    expect(parts.filter(p => p.text).length).toBe(10);
    expect(parts.filter(p => p.inlineData).length).toBe(10);
  });
});
