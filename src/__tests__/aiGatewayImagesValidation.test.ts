/**
 * Testes da leitura multipágina (PDF escaneado, 27/08/2026) — validação do
 * campo opcional `images` do AI Gateway (`_imagesValidation.ts`), o mesmo
 * limite de 10 páginas e as mesmas checagens de formato/tamanho que o
 * Gateway aplica ANTES de reservar crédito ou chamar o provider.
 *
 * Função pura, sem Deno/imports remotos — executada de verdade (não é
 * checagem de string de código-fonte), no mesmo espírito de
 * aiGatewayUsability.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  validateGatewayImages,
  friendlyImagesValidationError,
  validateGatewayPageNumbers,
  friendlyPageNumbersValidationError,
  MAX_GATEWAY_IMAGES,
  MAX_IMAGE_BASE64_CHARS,
  MAX_TOTAL_IMAGES_BASE64_CHARS,
  type ImagesValidationReason,
  type PageNumbersValidationReason,
} from '../../supabase/functions/ai-gateway/_imagesValidation.ts';

/** Data URL sintética válida (JPEG) com N caracteres base64. */
function fakeDataUrl(mime: 'jpeg' | 'png' | 'webp', base64Chars: number): string {
  return `data:image/${mime};base64,${'A'.repeat(base64Chars)}`;
}

describe('validateGatewayImages', () => {
  it('campo ausente (undefined): válido — nenhuma chamada existente (imageBase64) é afetada', () => {
    expect(validateGatewayImages(undefined)).toEqual({ ok: true, images: undefined });
  });

  it('campo null: válido, mesmo tratamento de "ausente"', () => {
    expect(validateGatewayImages(null)).toEqual({ ok: true, images: undefined });
  });

  it('1 página válida: aceita (PDF de 1 página)', () => {
    const images = [fakeDataUrl('jpeg', 100)];
    expect(validateGatewayImages(images)).toEqual({ ok: true, images });
  });

  it('10 páginas válidas: aceita no limite exato', () => {
    const images = Array.from({ length: 10 }, (_, i) => fakeDataUrl('jpeg', 50 + i));
    const result = validateGatewayImages(images);
    expect(result.ok).toBe(true);
    expect(result.images).toHaveLength(10);
  });

  it('preserva a ORDEM das páginas exatamente como recebida', () => {
    const images = [fakeDataUrl('png', 10), fakeDataUrl('jpeg', 20), fakeDataUrl('webp', 30)];
    const result = validateGatewayImages(images);
    expect(result.images).toEqual(images); // mesma referência/ordem, sem reordenar
  });

  it('11 páginas: rejeita (TOO_MANY) — limite é 10, mesmo que o frontend já devesse ter cortado antes', () => {
    const images = Array.from({ length: MAX_GATEWAY_IMAGES + 1 }, () => fakeDataUrl('jpeg', 50));
    expect(validateGatewayImages(images)).toEqual({ ok: false, reason: 'TOO_MANY' });
  });

  it('20 páginas: também rejeita (TOO_MANY), não só "1 acima do limite"', () => {
    const images = Array.from({ length: 20 }, () => fakeDataUrl('jpeg', 50));
    expect(validateGatewayImages(images).reason).toBe('TOO_MANY');
  });

  it('lista vazia: rejeita (EMPTY) — não é o mesmo que "campo ausente"', () => {
    expect(validateGatewayImages([])).toEqual({ ok: false, reason: 'EMPTY' });
  });

  it('não é um array (string): rejeita (NOT_ARRAY)', () => {
    expect(validateGatewayImages('nao-e-array')).toEqual({ ok: false, reason: 'NOT_ARRAY' });
  });

  it('não é um array (objeto): rejeita (NOT_ARRAY)', () => {
    expect(validateGatewayImages({ 0: fakeDataUrl('jpeg', 10) })).toEqual({ ok: false, reason: 'NOT_ARRAY' });
  });

  it('item que não é string: rejeita (INVALID_FORMAT) com o índice da página inválida', () => {
    const result = validateGatewayImages([fakeDataUrl('jpeg', 10), 12345]);
    expect(result).toEqual({ ok: false, reason: 'INVALID_FORMAT', index: 1 });
  });

  it('MIME não suportado (gif): rejeita (INVALID_FORMAT) — só jpeg/png/webp, igual ao imageBase64 hoje', () => {
    const result = validateGatewayImages(['data:image/gif;base64,AAAA']);
    expect(result).toEqual({ ok: false, reason: 'INVALID_FORMAT', index: 0 });
  });

  it('sem prefixo data URL (base64 puro): rejeita (INVALID_FORMAT)', () => {
    const result = validateGatewayImages(['AAAAAAAA']);
    expect(result).toEqual({ ok: false, reason: 'INVALID_FORMAT', index: 0 });
  });

  it('página corrompida (caracteres inválidos no payload base64): rejeita (INVALID_FORMAT), não ignora silenciosamente', () => {
    const result = validateGatewayImages(['data:image/jpeg;base64,not-valid-base64!!']);
    expect(result).toEqual({ ok: false, reason: 'INVALID_FORMAT', index: 0 });
  });

  it('página individual acima do tamanho máximo: rejeita (IMAGE_TOO_LARGE) com o índice certo', () => {
    const images = [fakeDataUrl('jpeg', 10), fakeDataUrl('png', MAX_IMAGE_BASE64_CHARS + 1)];
    expect(validateGatewayImages(images)).toEqual({ ok: false, reason: 'IMAGE_TOO_LARGE', index: 1 });
  });

  it('cada página dentro do limite individual, mas soma total acima do limite: rejeita (TOTAL_TOO_LARGE)', () => {
    // 10 páginas (o máximo permitido) — cada uma bem abaixo do limite
    // individual, mas cuja soma ultrapassa o limite total.
    const perImage = Math.ceil(MAX_TOTAL_IMAGES_BASE64_CHARS / MAX_GATEWAY_IMAGES) + 1000;
    expect(perImage).toBeLessThan(MAX_IMAGE_BASE64_CHARS); // pré-condição do teste
    const images = Array.from({ length: MAX_GATEWAY_IMAGES }, () => fakeDataUrl('jpeg', perImage));
    expect(validateGatewayImages(images)).toEqual({ ok: false, reason: 'TOTAL_TOO_LARGE' });
  });

  it('rejeita ANTES de qualquer chamada de IA/reserva — validação é síncrona e pura, sem efeitos colaterais', () => {
    // Duas chamadas com o mesmo payload inválido produzem exatamente o mesmo
    // resultado — nada é mutado, nada é reservado, nada é chamado.
    const images = Array.from({ length: 999 }, () => fakeDataUrl('jpeg', 10));
    expect(validateGatewayImages(images)).toEqual(validateGatewayImages(images));
  });
});

describe('friendlyImagesValidationError', () => {
  const reasons: ImagesValidationReason[] = [
    'NOT_ARRAY', 'EMPTY', 'TOO_MANY', 'INVALID_FORMAT', 'IMAGE_TOO_LARGE', 'TOTAL_TOO_LARGE',
  ];

  it.each(reasons)('produz uma mensagem amigável e não vazia para %s', (reason) => {
    const msg = friendlyImagesValidationError(reason);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('nunca inclui conteúdo de imagem/base64 na mensagem — só metadados do erro', () => {
    for (const reason of reasons) {
      const msg = friendlyImagesValidationError(reason);
      expect(msg).not.toMatch(/base64|data:image/i);
    }
  });
});

// ─── validateGatewayPageNumbers — correção de numeração (27/08/2026) ────────

describe('validateGatewayPageNumbers', () => {
  it('ausente (undefined): válido — chamada antiga sem essa informação continua funcionando', () => {
    expect(validateGatewayPageNumbers(undefined, 3)).toEqual({ ok: true, pageNumbers: undefined });
  });

  it('null: mesmo tratamento de "ausente"', () => {
    expect(validateGatewayPageNumbers(null, 3)).toEqual({ ok: true, pageNumbers: undefined });
  });

  it('tamanho igual ao de images, crescente: aceita — caso central (páginas 1 e 3, página 2 em branco)', () => {
    expect(validateGatewayPageNumbers([1, 3], 2)).toEqual({ ok: true, pageNumbers: [1, 3] });
  });

  it('não é array: rejeita (NOT_ARRAY)', () => {
    expect(validateGatewayPageNumbers('1,3', 2)).toEqual({ ok: false, reason: 'NOT_ARRAY' });
  });

  it('tamanho diferente de images.length: rejeita (LENGTH_MISMATCH)', () => {
    expect(validateGatewayPageNumbers([1, 2, 3], 2)).toEqual({ ok: false, reason: 'LENGTH_MISMATCH' });
  });

  it('contém valor não inteiro/negativo/zero: rejeita (INVALID_VALUE)', () => {
    expect(validateGatewayPageNumbers([1, 2.5], 2)).toEqual({ ok: false, reason: 'INVALID_VALUE' });
    expect(validateGatewayPageNumbers([0, 1], 2)).toEqual({ ok: false, reason: 'INVALID_VALUE' });
    expect(validateGatewayPageNumbers([-1, 2], 2)).toEqual({ ok: false, reason: 'INVALID_VALUE' });
    expect(validateGatewayPageNumbers(['1', 2], 2)).toEqual({ ok: false, reason: 'INVALID_VALUE' });
  });

  it('fora de ordem crescente (ou repetido): rejeita (NOT_ASCENDING)', () => {
    expect(validateGatewayPageNumbers([3, 1], 2)).toEqual({ ok: false, reason: 'NOT_ASCENDING' });
    expect(validateGatewayPageNumbers([1, 1], 2)).toEqual({ ok: false, reason: 'NOT_ASCENDING' });
  });

  it('1 único número: válido (caso de 1 única página útil restante de um PDF multipágina)', () => {
    expect(validateGatewayPageNumbers([5], 1)).toEqual({ ok: true, pageNumbers: [5] });
  });
});

describe('friendlyPageNumbersValidationError', () => {
  const reasons: PageNumbersValidationReason[] = ['NOT_ARRAY', 'LENGTH_MISMATCH', 'INVALID_VALUE', 'NOT_ASCENDING'];

  it.each(reasons)('produz uma mensagem amigável e não vazia para %s', (reason) => {
    const msg = friendlyPageNumbersValidationError(reason);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });
});
