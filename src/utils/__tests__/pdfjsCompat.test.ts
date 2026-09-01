/**
 * Testes do polyfill de compatibilidade Map.prototype.getOrInsertComputed
 * (correção do crash real da prévia A4 em Safari/WebKit — ver pdfjsCompat.ts).
 *
 * A reprodução do erro real, em um navegador real (Chromium via Playwright,
 * simulando a ausência do método nativo para reproduzir o mecanismo exato do
 * bug relatado em Safari/WebKit), está documentada no relatório da Fase 2 —
 * não é repetida aqui porque exige um navegador real, fora do alcance do
 * ambiente `node` deste vitest. Este teste cobre a lógica do polyfill em si.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { ensurePdfjsMapUpsertCompat } from '../pdfjsCompat';

describe('ensurePdfjsMapUpsertCompat', () => {
  beforeEach(() => {
    // Remove o método (nativo ou já polyfillado por um teste anterior) para
    // testar o polyfill isoladamente, em ambos os protótipos.
    delete (Map.prototype as any).getOrInsertComputed;
    delete (WeakMap.prototype as any).getOrInsertComputed;
  });

  it('adiciona getOrInsertComputed a Map.prototype quando ausente', () => {
    expect(typeof (Map.prototype as any).getOrInsertComputed).toBe('undefined');
    ensurePdfjsMapUpsertCompat();
    expect(typeof (Map.prototype as any).getOrInsertComputed).toBe('function');
  });

  it('adiciona getOrInsertComputed a WeakMap.prototype quando ausente', () => {
    ensurePdfjsMapUpsertCompat();
    expect(typeof (WeakMap.prototype as any).getOrInsertComputed).toBe('function');
  });

  it('semântica correta: retorna o valor existente sem chamar o factory', () => {
    ensurePdfjsMapUpsertCompat();
    const map = new Map<string, number>([['a', 1]]);
    let factoryCalls = 0;
    const result = (map as any).getOrInsertComputed('a', () => { factoryCalls++; return 99; });
    expect(result).toBe(1);
    expect(factoryCalls).toBe(0);
  });

  it('semântica correta: computa, insere e retorna o valor quando a chave não existe', () => {
    ensurePdfjsMapUpsertCompat();
    const map = new Map<string, number[]>();
    const arr = (map as any).getOrInsertComputed('x', () => []);
    arr.push(1, 2);
    expect(map.get('x')).toEqual([1, 2]);
  });

  it('passa a chave para o factory (compatível com fábricas que dependem dela)', () => {
    ensurePdfjsMapUpsertCompat();
    const map = new Map<string, string>();
    (map as any).getOrInsertComputed('minha-chave', (key: string) => `valor-de-${key}`);
    expect(map.get('minha-chave')).toBe('valor-de-minha-chave');
  });

  it('não sobrescreve um método nativo já existente', () => {
    const nativeImpl = () => 'nativo';
    (Map.prototype as any).getOrInsertComputed = nativeImpl;
    ensurePdfjsMapUpsertCompat();
    expect((Map.prototype as any).getOrInsertComputed).toBe(nativeImpl);
  });

  it('é seguro chamar mais de uma vez (idempotente)', () => {
    expect(() => {
      ensurePdfjsMapUpsertCompat();
      ensurePdfjsMapUpsertCompat();
      ensurePdfjsMapUpsertCompat();
    }).not.toThrow();
    expect(typeof (Map.prototype as any).getOrInsertComputed).toBe('function');
  });
});
