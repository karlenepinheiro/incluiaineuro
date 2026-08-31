import { describe, expect, it } from 'vitest';
import {
  buildSections,
  gridField,
  kvField,
  listField,
  NAO_INFORMADO,
  proseField,
  resetFieldSeq,
  scaleField,
  section,
  toParagraphs,
} from '../sectionBuilders';

describe('sectionBuilders — blocos puros (Fase 2)', () => {
  it('proseField vazio vira "Não informado" (regra do projeto)', () => {
    resetFieldSeq();
    const f = proseField('s', 'Rótulo', '   ');
    expect(f).toHaveLength(1);
    expect(f[0].value).toBe(NAO_INFORMADO);
    expect(f[0].label).toBe('Rótulo');
  });

  it('proseField { optional: true } vazio some (retorna [])', () => {
    resetFieldSeq();
    expect(proseField('s', '', '', { optional: true })).toEqual([]);
  });

  it('proseField multi-parágrafo vira vários campos, só o 1º com rótulo', () => {
    resetFieldSeq();
    const f = proseField('s', 'Análise', 'Primeiro parágrafo.\n\nSegundo parágrafo.\n\nTerceiro.');
    expect(f).toHaveLength(3);
    expect(f[0].label).toBe('Análise');
    expect(f[1].label).toBe('');
    expect(f[2].label).toBe('');
    expect(f[1].value).toBe('Segundo parágrafo.');
  });

  it('proseField colapsa quebras simples dentro de um parágrafo (fica single-line)', () => {
    resetFieldSeq();
    const f = proseField('s', '', 'linha um\nlinha dois\nlinha três');
    expect(f).toHaveLength(1);
    expect(f[0].value).toBe('linha um linha dois linha três');
    expect(f[0].value).not.toContain('\n');
  });

  it('listField ignora itens vazios; vazio total → []', () => {
    resetFieldSeq();
    expect(listField('s', 'X', ['', '  ', null, undefined])).toEqual([]);
    const f = listField('s', 'Dificuldades', ['Atenção', '', 'Leitura']);
    expect(f[0].type).toBe('checklist');
    expect(f[0].value).toEqual(['Atenção', 'Leitura']);
  });

  it('gridField monta cabeçalho + linhas; sem linhas de dados → []', () => {
    resetFieldSeq();
    expect(gridField('s', '', ['A', 'B'], [['', ''], [' ', '']])).toEqual([]);
    const f = gridField('s', '', ['Critério', 'Nota'], [['Comunicação', '4/5'], ['Leitura', '']]);
    expect(f[0].type).toBe('grid');
    expect(f[0].value).toEqual([
      ['Critério', 'Nota'],
      ['Comunicação', '4/5'],
      ['Leitura', '—'],
    ]);
  });

  it('scaleField: nota válida → type scale + maxScale; inválida → "Não informado"', () => {
    resetFieldSeq();
    const ok = scaleField('s', 'Nível', '4', 5, 'evoluiu bem');
    expect(ok[0]).toMatchObject({ type: 'scale', value: 4, maxScale: 5 });
    expect(ok[1]).toMatchObject({ label: 'Observação', value: 'evoluiu bem' });
    const bad = scaleField('s', 'Nível', '', 5);
    expect(bad[0]).toMatchObject({ type: 'text', value: NAO_INFORMADO });
  });

  it('section retorna null quando não há campos; buildSections filtra null/false/0', () => {
    resetFieldSeq();
    expect(section('Vazia', [[]])).toBeNull();
    const out = buildSections([
      section('Com dado', [kvField('s', 'K', 'v')]),
      null,
      false,
      0,
      section('Sem dado', [[]]),
    ]);
    expect(out.map(s => s.title)).toEqual(['Com dado']);
  });

  it('toParagraphs preserva acentuação portuguesa', () => {
    expect(toParagraphs('Avaliação funcional: ótimo é ação não-verbal.')).toEqual([
      'Avaliação funcional: ótimo é ação não-verbal.',
    ]);
  });
});
