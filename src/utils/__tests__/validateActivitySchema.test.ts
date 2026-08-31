/**
 * Sprint 2B.3 (item 6, Auditoria 2B.2-E): validateActivitySchema não pode mais
 * apagar schemaVersion '2.0'/requestType/answerKey de itens canônicos ao
 * reabri-los (ex.: handleLibSelect → parseStoredActivity → validateActivitySchema).
 * Itens legados (sem esses campos) continuam funcionando exatamente como antes.
 */
import { describe, expect, it } from 'vitest';
import { validateActivitySchema } from '../validateActivitySchema';

function canonicalJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: '2.0',
    requestType: 'avaliacao',
    header: { title: 'Prova', theme: 'Ciências', objective: 'Avaliar conteúdo' },
    exercises: [
      { id: 'exercise-1', type: 'short_answer', title: 'Q1', prompt: 'Enunciado 1' },
      { id: 'exercise-2', type: 'short_answer', title: 'Q2', prompt: 'Enunciado 2' },
    ],
    answerKey: [
      { exerciseId: 'exercise-1', answer: 'Resposta 1' },
      { exerciseId: 'exercise-2', answer: 'Resposta 2' },
    ],
    ...overrides,
  });
}

describe('validateActivitySchema — preservação de campos canônicos (round-trip)', () => {
  it('preserva schemaVersion "2.0"', () => {
    const schema = validateActivitySchema(canonicalJson());
    expect(schema.schemaVersion).toBe('2.0');
  });

  it('preserva requestType', () => {
    const schema = validateActivitySchema(canonicalJson());
    expect(schema.requestType).toBe('avaliacao');
  });

  it('preserva answerKey com todos os itens', () => {
    const schema = validateActivitySchema(canonicalJson());
    expect(schema.answerKey).toHaveLength(2);
    expect(schema.answerKey?.map(a => a.exerciseId).sort()).toEqual(['exercise-1', 'exercise-2']);
  });

  it('preserva answer_key em snake_case com exercise_id/correct_answer', () => {
    const schema = validateActivitySchema(canonicalJson({
      answerKey: undefined,
      answer_key: [
        { exercise_id: 'exercise-1', correct_answer: 'Resposta A' },
        { exercise_id: 'exercise-2', correct_answer: 'Resposta B' },
      ],
    }));
    expect(schema.answerKey).toEqual([
      { exerciseId: 'exercise-1', answer: 'Resposta A', explanation: undefined },
      { exerciseId: 'exercise-2', answer: 'Resposta B', explanation: undefined },
    ]);
  });

  it('preserva gabarito numerado em português mapeando numero para exercise-N', () => {
    const schema = validateActivitySchema(canonicalJson({
      answerKey: undefined,
      gabarito: [
        { numero: 1, resposta: 'Meio' },
        { numero: 2, resposta: 'Terço' },
      ],
    }));
    expect(schema.answerKey?.map(item => `${item.exerciseId}:${item.answer}`)).toEqual([
      'exercise-1:Meio',
      'exercise-2:Terço',
    ]);
  });

  it('descarta itens de answerKey cujo exerciseId não existe em exercises (não reintroduz gabarito solto)', () => {
    const schema = validateActivitySchema(canonicalJson({
      answerKey: [
        { exerciseId: 'exercise-1', answer: 'Resposta 1' },
        { exerciseId: 'exercise-inexistente', answer: 'X' },
      ],
    }));
    expect(schema.answerKey).toHaveLength(1);
    expect(schema.answerKey?.[0].exerciseId).toBe('exercise-1');
  });

  it('itens legados (sem schemaVersion/requestType/answerKey) continuam funcionando — schemaVersion vira "1.0"', () => {
    const legacyJson = JSON.stringify({
      header: { title: 'Atividade antiga', theme: 'Tema', objective: 'Objetivo' },
      exercises: [{ id: 'exercise-1', type: 'short_answer', title: 'Q1', prompt: 'Enunciado' }],
    });
    const schema = validateActivitySchema(legacyJson);
    expect(schema.schemaVersion).toBe('1.0');
    expect(schema.requestType).toBeUndefined();
    expect(schema.answerKey).toBeUndefined();
  });

  it('requestType inválido/desconhecido é ignorado (undefined), não quebra o parse', () => {
    const schema = validateActivitySchema(canonicalJson({ requestType: 'algo_invalido' }));
    expect(schema.requestType).toBeUndefined();
  });

  it('formato folha_do_aluno também preserva schemaVersion/requestType/answerKey quando presentes', () => {
    const json = JSON.stringify({
      schemaVersion: '2.0',
      requestType: 'avaliacao',
      folha_do_aluno: {
        titulo: 'Prova adaptada',
        exercicios: [
          { id: 'exercise-1', tipo: 'resposta_curta', comando: 'Enunciado 1' },
        ],
      },
      answerKey: [{ exerciseId: 'exercise-1', answer: 'Resposta 1' }],
    });
    const schema = validateActivitySchema(json);
    expect(schema.schemaVersion).toBe('2.0');
    expect(schema.requestType).toBe('avaliacao');
    expect(schema.answerKey).toHaveLength(1);
  });

  it('preserva tipos estruturais novos como word_search e crossword', () => {
    const schema = validateActivitySchema(JSON.stringify({
      schemaVersion: '2.0',
      requestType: 'adaptacao',
      header: { title: 'Caça-palavras', theme: 'Animais', objective: 'Localizar palavras' },
      exercises: [
        {
          id: 'exercise-1',
          type: 'word_search',
          title: 'Encontre as palavras',
          prompt: 'Procure os animais na grade.',
          options: ['GATO', 'PATO'],
          grid: ['GATOP', 'AXXXA', 'TOGAT'],
        },
        {
          id: 'exercise-2',
          type: 'crossword',
          title: 'Cruzadinha',
          prompt: 'Complete a cruzadinha.',
          options: ['SOL'],
          clues: ['Estrela do sistema solar'],
        },
      ],
    }));

    expect(schema.exercises[0].type).toBe('word_search');
    expect(schema.exercises[0].grid).toEqual(['GATOP', 'AXXXA', 'TOGAT']);
    expect(schema.exercises[1].type).toBe('crossword');
    expect(schema.exercises[1].clues).toEqual(['Estrela do sistema solar']);
  });

  it('aceita e preserva matching, fill_blank, coloring e table', () => {
    const schema = validateActivitySchema(JSON.stringify({
      header: { title: 'Tipos estruturais', theme: 'Teste', objective: 'Validar tipos' },
      exercises: [
        { id: 'exercise-1', type: 'matching', title: 'Ligue', prompt: 'Ligue as colunas.', options: ['1-A'], answerLines: 0 },
        { id: 'exercise-2', type: 'fill_blank', title: 'Complete', prompt: '1/2 é uma _____.', options: [], answerLines: 1 },
        { id: 'exercise-3', type: 'coloring', title: 'Colorir', prompt: 'Pinte a metade.', options: [], answerLines: 0 },
        { id: 'exercise-4', type: 'table', title: 'Tabela', prompt: 'Complete a tabela.', options: ['Metade', 'Terço'], answerLines: 0 },
      ],
      visualAssets: [],
      accessibilityNotes: { supports: [], adaptations: [], teacherNotes: [] },
    }));

    expect(schema.exercises.map(ex => ex.type)).toEqual(['matching', 'fill_blank', 'coloring', 'table']);
  });
});
