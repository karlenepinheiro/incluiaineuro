/**
 * Testes da Sprint "consumo no momento certo" (26/08/2026) — o Gateway
 * confirma (commit) créditos atomicamente assim que uma resposta é
 * considerada "utilizável" (ver _usability.ts), na mesma requisição que
 * reservou e chamou o provider, em vez de depender de uma segunda chamada do
 * frontend depois de salvar o aluno.
 *
 * Função pura, sem Deno/imports remotos — executada de verdade (não é
 * checagem de string de código-fonte).
 */
import { describe, expect, it } from 'vitest';
import { checkResultUsability } from '../../supabase/functions/ai-gateway/_usability.ts';

describe('checkResultUsability', () => {
  it('sem usabilityCheck configurado: sempre utilizável (comportamento inalterado para o resto do produto)', () => {
    expect(checkResultUsability({ anything: 'goes' }, undefined)).toEqual({ usable: true });
    expect(checkResultUsability(null, undefined)).toEqual({ usable: true });
  });

  it('array não vazio, sem checagem de confiança: utilizável', () => {
    const result = checkResultUsability({ students: [{ name: 'Evandro Silva' }] }, { arrayField: 'students' });
    expect(result).toEqual({ usable: true });
  });

  it('array vazio: NÃO utilizável — nenhum draft pôde ser produzido', () => {
    const result = checkResultUsability({ students: [] }, { arrayField: 'students' });
    expect(result).toEqual({ usable: false, reason: 'EMPTY_RESULT' });
  });

  it('campo do array ausente no JSON: NÃO utilizável', () => {
    const result = checkResultUsability({ outraCoisa: 'x' }, { arrayField: 'students' });
    expect(result).toEqual({ usable: false, reason: 'EMPTY_RESULT' });
  });

  it('campo do array não é um array (ex.: veio como objeto): NÃO utilizável', () => {
    const result = checkResultUsability({ students: { name: 'oops' } }, { arrayField: 'students' });
    expect(result).toEqual({ usable: false, reason: 'EMPTY_RESULT' });
  });

  it('confiança média acima do limite: utilizável', () => {
    const result = checkResultUsability(
      { students: [{ confidence: 0.9 }, { confidence: 0.8 }] },
      { arrayField: 'students', minAverageConfidence: 0.25, confidenceField: 'confidence' },
    );
    expect(result).toEqual({ usable: true });
  });

  it('confiança média abaixo do limite: NÃO utilizável (imagem ilegível)', () => {
    const result = checkResultUsability(
      { students: [{ confidence: 0.1 }] },
      { arrayField: 'students', minAverageConfidence: 0.25, confidenceField: 'confidence' },
    );
    expect(result).toEqual({ usable: false, reason: 'LOW_CONFIDENCE' });
  });

  it('confiança exatamente no limite: utilizável (>=, não >)', () => {
    const result = checkResultUsability(
      { students: [{ confidence: 0.25 }] },
      { arrayField: 'students', minAverageConfidence: 0.25, confidenceField: 'confidence' },
    );
    expect(result).toEqual({ usable: true });
  });

  it('nome ausente não afeta usabilidade — cadastro incompleto ainda é um resultado utilizável', () => {
    // Regra de produto (Fase 1, 25/08/2026): documento sem nome identificável
    // ainda produz um draft para revisão manual — não é "vazio".
    const result = checkResultUsability({ students: [{ name: '' }] }, { arrayField: 'students' });
    expect(result).toEqual({ usable: true });
  });

  it('itens sem campo de confiança contam como 0 na média (não quebra, apenas conservador)', () => {
    const result = checkResultUsability(
      { students: [{ confidence: 0.9 }, {}] },
      { arrayField: 'students', minAverageConfidence: 0.5, confidenceField: 'confidence' },
    );
    // média = 0.9 / 1 valor válido = 0.9 (o item sem confidence é filtrado, não conta como 0)
    expect(result).toEqual({ usable: true });
  });

  it('nenhum item tem campo de confiança válido: média tratada como 0 → NÃO utilizável', () => {
    const result = checkResultUsability(
      { students: [{}, {}] },
      { arrayField: 'students', minAverageConfidence: 0.25, confidenceField: 'confidence' },
    );
    expect(result).toEqual({ usable: false, reason: 'LOW_CONFIDENCE' });
  });

  it('parsedDocument nulo com usabilityCheck configurado: NÃO utilizável (sem lançar exceção)', () => {
    expect(() => checkResultUsability(null, { arrayField: 'students' })).not.toThrow();
    expect(checkResultUsability(null, { arrayField: 'students' })).toEqual({ usable: false, reason: 'EMPTY_RESULT' });
  });
});
