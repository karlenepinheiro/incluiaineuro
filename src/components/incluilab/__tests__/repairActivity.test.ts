/**
 * Sprint 2B.3 (item 1) — regressão do truncamento de exercícios no renderer.
 * Causa raiz identificada na Auditoria 2B.2-A: repairActivity() sempre cortava
 * para 5, mesmo para atividades canônicas já validadas com mais exercícios.
 */
import { describe, expect, it } from 'vitest';
import { repairActivity, sanitizeMarkdownText } from '../A4ActivityRenderer';
import type { ActivityExercise, ActivitySchema } from '../../../types';

function makeExercises(count: number): ActivityExercise[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `exercise-${i + 1}`,
    type: 'short_answer',
    title: `Questão ${i + 1}`,
    prompt: `Enunciado ${i + 1}`,
    options: [],
    answerLines: 3,
  }));
}

function makeActivity(schemaVersion: '1.0' | '2.0', count: number): ActivitySchema {
  return {
    schemaVersion,
    header: { title: 'Atividade', theme: 'Tema', objective: 'Objetivo', instructions: [] },
    blocks: [],
    exercises: makeExercises(count),
    visualAssets: [],
    accessibilityNotes: { supports: [], adaptations: [], teacherNotes: [] },
  };
}

describe('repairActivity — truncamento de exercícios', () => {
  it('canônico (2.0) com 10 exercícios: renderiza os 10, sem truncar', () => {
    const result = repairActivity(makeActivity('2.0', 10));
    expect(result.exercises).toHaveLength(10);
  });

  it('canônico (2.0) com 15 exercícios: renderiza os 15, sem truncar', () => {
    const result = repairActivity(makeActivity('2.0', 15));
    expect(result.exercises).toHaveLength(15);
  });

  it('legado (1.0) com 10 exercícios: continua truncando para 5 (compatibilidade)', () => {
    const result = repairActivity(makeActivity('1.0', 10));
    expect(result.exercises).toHaveLength(5);
  });

  it('legado sem schemaVersion explícito: trata como legado e trunca para 5', () => {
    const { schemaVersion: _omit, ...rest } = makeActivity('1.0', 8);
    const activity = rest as unknown as ActivitySchema; // simula payload legado sem o campo
    const result = repairActivity(activity);
    expect(result.exercises).toHaveLength(5);
  });

  it('canônico com poucos exercícios (menos que 5) não é afetado', () => {
    const result = repairActivity(makeActivity('2.0', 3));
    expect(result.exercises).toHaveLength(3);
  });

  it('canônico preserva bloco de texto introdutório para renderização da folha', () => {
    const activity = makeActivity('2.0', 2);
    activity.blocks = [{
      id: 'base-text-1',
      type: 'instructions',
      title: 'Texto introdutório',
      content: 'Frações aparecem quando dividimos um todo em partes iguais.',
      items: [],
      visualAssetIds: [],
    }];

    const result = repairActivity(activity);

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      id: 'base-text-1',
      type: 'instructions',
      title: 'Texto introdutório',
    });
    expect(result.blocks[0].content).toContain('Frações aparecem');
  });

  it('canônico preserva tipo estrutural word_search e sua grade', () => {
    const activity = makeActivity('2.0', 1);
    activity.exercises[0] = {
      id: 'exercise-1',
      type: 'word_search',
      title: 'Caça-palavras',
      prompt: 'Encontre as palavras.',
      options: ['GATO', 'PATO'],
      answerLines: 0,
      grid: ['GATOP', 'AXXXA'],
    };
    const result = repairActivity(activity);
    expect(result.exercises[0].type).toBe('word_search');
    expect(result.exercises[0].grid).toEqual(['GATOP', 'AXXXA']);
  });

  it.each([
    'word_search',
    'crossword',
    'matching',
    'fill_blank',
    'coloring',
    'table',
  ] as const)('canônico preserva %s e não transforma silenciosamente em short_answer', (type) => {
    const activity = makeActivity('2.0', 1);
    activity.exercises[0] = {
      id: 'exercise-1',
      type,
      title: 'Estrutural',
      prompt: 'Preserve este formato.',
      options: ['Item A', 'Item B'],
      answerLines: 0,
      grid: type === 'word_search' || type === 'crossword' ? ['ABCDE', 'FGHIJ'] : undefined,
      clues: type === 'crossword' ? ['Pista 1'] : undefined,
    };

    const result = repairActivity(activity);
    expect(result.exercises[0].type).toBe(type);
    expect(result.exercises[0].type).not.toBe('short_answer');
  });

  it('remove tokens Markdown antes do preview/export PDF/PNG', () => {
    expect(sanitizeMarkdownText('# Título\nTexto com **cultura**, *ênfase* e `código`.'))
      .toBe('Título\nTexto com cultura, ênfase e código.');
  });
});
