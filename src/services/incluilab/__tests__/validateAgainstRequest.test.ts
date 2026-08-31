import { describe, expect, it } from 'vitest';
import { validateAgainstRequest } from '../validateAgainstRequest';
import type { ActivitySchema, ActivityExercise, CanonicalGenerationRequest } from '../../../types';

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

function makeSchema(overrides: Partial<ActivitySchema> = {}): ActivitySchema {
  return {
    schemaVersion: '2.0',
    header: { title: 'Atividade', theme: 'Tema', objective: 'Objetivo', instructions: [] },
    blocks: [],
    exercises: makeExercises(4),
    visualAssets: [],
    accessibilityNotes: { supports: [], adaptations: [], teacherNotes: [] },
    guia_pedagogico: {
      objetivo_da_aula: 'Preservar o objetivo da atividade: compreender o tema por meio dos exercícios propostos.',
      metodologia_adaptada: 'Contexto individual insuficiente: aplicar como adaptação geral com DUA. Organize os exercícios em etapas, apresente um comando por vez e permita resposta curta, oral ou por seleção conforme a atividade.',
      dicas_de_mediacao: ['No exercício, leia o comando, peça que o estudante marque ou fale palavras-chave e registre o apoio sem entregar a resposta.'],
      criterios_de_avaliacao: ['Observar compreensão do tema, resolução dos exercícios e nível de ajuda utilizado.'],
      materiais_necessarios: [],
      tempo_estimado: '30 minutos',
      adaptacoes_inclusivas: ['Comandos segmentados e forma alternativa de resposta para reduzir barreiras de acesso sem alterar o objetivo.'],
    },
    ...overrides,
  };
}

function makeRequest(overrides: Partial<CanonicalGenerationRequest> = {}): CanonicalGenerationRequest {
  return {
    requestType: 'atividade',
    rawUserText: 'Atividade de teste',
    topic: 'Atividade de teste',
    hasAttachment: false,
    visualMode: 'none',
    visualModeSource: 'inferred_default',
    outputFormat: 'unspecified',
    outputModality: 'unspecified',
    baseTextSize: 'unspecified',
    ...overrides,
  };
}

function schemaWithBaseText(length: number): ActivitySchema {
  return makeSchema({
    blocks: [{
      id: 'base-text-1',
      type: 'instructions',
      title: 'Texto introdutório',
      content: 'A'.repeat(length),
      items: [],
      visualAssetIds: [],
    }],
  });
}

describe('validateAgainstRequest', () => {
  it('é válido quando a quantidade de exercícios bate com o pedido', () => {
    const schema = makeSchema({ exercises: makeExercises(10) });
    const request = makeRequest({ requestedQuestionCount: 10 });
    const result = validateAgainstRequest(schema, undefined, request);
    expect(result.valid).toBe(true);
  });

  it('acusa question_count_mismatch quando a quantidade não bate', () => {
    const schema = makeSchema({ exercises: makeExercises(8) });
    const request = makeRequest({ requestedQuestionCount: 10 });
    const result = validateAgainstRequest(schema, undefined, request);
    expect(result.valid).toBe(false);
    expect(result.issues.map(i => i.code)).toContain('question_count_mismatch');
  });

  it('não exige quantidade exata quando o professor não especificou número', () => {
    const schema = makeSchema({ exercises: makeExercises(3) });
    const request = makeRequest({ requestedQuestionCount: undefined });
    const result = validateAgainstRequest(schema, undefined, request);
    expect(result.issues.map(i => i.code)).not.toContain('question_count_mismatch');
  });

  it('texto introdutório solicitado vira contrato: acusa base_text_missing quando blocks não traz texto-base', () => {
    const schema = makeSchema({ blocks: [] });
    const request = makeRequest({ requiresBaseText: true });
    const result = validateAgainstRequest(schema, undefined, request);
    expect(result.valid).toBe(false);
    expect(result.issues.map(i => i.code)).toContain('base_text_missing');
  });

  it('texto-base com tamanho aproximado solicitado não pode virar parágrafo curto', () => {
    const schema = makeSchema({
      blocks: [{
        id: 'base-text-1',
        type: 'instructions',
        title: 'Texto introdutório',
        content: 'Texto curto demais.',
        items: [],
        visualAssetIds: [],
      }],
    });
    const request = makeRequest({ requiresBaseText: true, baseTextApproxChars: 3000 });
    const result = validateAgainstRequest(schema, undefined, request);
    expect(result.valid).toBe(false);
    expect(result.issues.map(i => i.code)).toContain('base_text_too_short');
  });

  it('texto-base suficiente atende ao requisito natural do professor', () => {
    const schema = makeSchema({
      blocks: [{
        id: 'base-text-1',
        type: 'instructions',
        title: 'Texto introdutório',
        content: 'Frações aparecem no cotidiano quando dividimos pizzas, receitas e medidas. '.repeat(42),
        items: [],
        visualAssetIds: [],
      }],
    });
    const request = makeRequest({ requiresBaseText: true, baseTextApproxChars: 3000 });
    const result = validateAgainstRequest(schema, undefined, request);
    expect(result.issues.map(i => i.code)).not.toContain('base_text_missing');
    expect(result.issues.map(i => i.code)).not.toContain('base_text_too_short');
  });

  it('texto pequeno aceita faixa 700–1400 e rejeita texto grande', () => {
    const ok = validateAgainstRequest(
      makeSchema({
        blocks: [{
          id: 'base-text-1',
          type: 'instructions',
          title: 'Texto introdutório',
          content: 'A'.repeat(1400),
          items: [],
          visualAssetIds: [],
        }],
      }),
      undefined,
      makeRequest({ requiresBaseText: true, baseTextSize: 'small' }),
    );
    expect(ok.valid).toBe(true);

    const tooLarge = validateAgainstRequest(
      makeSchema({
        blocks: [{
          id: 'base-text-1',
          type: 'instructions',
          title: 'Texto introdutório',
          content: 'A'.repeat(3200),
          items: [],
          visualAssetIds: [],
        }],
      }),
      undefined,
      makeRequest({ requiresBaseText: true, baseTextSize: 'small' }),
    );
    expect(tooLarge.valid).toBe(false);
    expect(tooLarge.issues.map(i => i.code)).toContain('base_text_too_long');
  });

  it('texto médio e grande usam faixas sem sobreposição', () => {
    const medium = validateAgainstRequest(
      schemaWithBaseText(1401),
      undefined,
      makeRequest({ requiresBaseText: true, baseTextSize: 'medium' }),
    );
    expect(medium.valid).toBe(true);

    const large = validateAgainstRequest(
      schemaWithBaseText(2801),
      undefined,
      makeRequest({ requiresBaseText: true, baseTextSize: 'large' }),
    );
    expect(large.valid).toBe(true);
  });

  it('fronteiras são não ambíguas: 1400 pequeno, 1401 médio, 2800 médio, 2801 grande', () => {
    expect(validateAgainstRequest(schemaWithBaseText(1400), undefined, makeRequest({ requiresBaseText: true, baseTextSize: 'small' })).valid).toBe(true);
    expect(validateAgainstRequest(schemaWithBaseText(1400), undefined, makeRequest({ requiresBaseText: true, baseTextSize: 'medium' })).valid).toBe(false);
    expect(validateAgainstRequest(schemaWithBaseText(1401), undefined, makeRequest({ requiresBaseText: true, baseTextSize: 'medium' })).valid).toBe(true);
    expect(validateAgainstRequest(schemaWithBaseText(2800), undefined, makeRequest({ requiresBaseText: true, baseTextSize: 'medium' })).valid).toBe(true);
    expect(validateAgainstRequest(schemaWithBaseText(2801), undefined, makeRequest({ requiresBaseText: true, baseTextSize: 'large' })).valid).toBe(true);
    expect(validateAgainstRequest(schemaWithBaseText(2801), undefined, makeRequest({ requiresBaseText: true, baseTextSize: 'medium' })).valid).toBe(false);
  });

  it('custom exato usa tolerância de 10%, não 40%', () => {
    const valid = validateAgainstRequest(
      schemaWithBaseText(4000),
      undefined,
      makeRequest({
        requiresBaseText: true,
        baseTextSize: 'custom',
        baseTextConstraint: { unit: 'characters', target: 4000 },
      }),
    );
    expect(valid.valid).toBe(true);

    const tooShort = validateAgainstRequest(
      schemaWithBaseText(2400),
      undefined,
      makeRequest({
        requiresBaseText: true,
        baseTextSize: 'custom',
        baseTextConstraint: { unit: 'characters', target: 4000 },
      }),
    );
    expect(tooShort.valid).toBe(false);
    expect(tooShort.issues.map(i => i.code)).toContain('base_text_too_short');

    const tooLong = validateAgainstRequest(
      schemaWithBaseText(5600),
      undefined,
      makeRequest({
        requiresBaseText: true,
        baseTextSize: 'custom',
        baseTextConstraint: { unit: 'characters', target: 4000 },
      }),
    );
    expect(tooLong.valid).toBe(false);
    expect(tooLong.issues.map(i => i.code)).toContain('base_text_too_long');
  });

  it('intervalo, máximo e mínimo explícitos são respeitados', () => {
    expect(validateAgainstRequest(
      schemaWithBaseText(2300),
      undefined,
      makeRequest({ requiresBaseText: true, baseTextSize: 'custom', baseTextConstraint: { unit: 'characters', min: 2000, max: 2500 } }),
    ).valid).toBe(true);
    expect(validateAgainstRequest(
      schemaWithBaseText(2600),
      undefined,
      makeRequest({ requiresBaseText: true, baseTextSize: 'custom', baseTextConstraint: { unit: 'characters', min: 2000, max: 2500 } }),
    ).issues.map(i => i.code)).toContain('base_text_too_long');
    expect(validateAgainstRequest(
      schemaWithBaseText(1600),
      undefined,
      makeRequest({ requiresBaseText: true, baseTextSize: 'custom', baseTextConstraint: { unit: 'characters', max: 1500 } }),
    ).issues.map(i => i.code)).toContain('base_text_too_long');
    expect(validateAgainstRequest(
      schemaWithBaseText(2900),
      undefined,
      makeRequest({ requiresBaseText: true, baseTextSize: 'custom', baseTextConstraint: { unit: 'characters', min: 3000 } }),
    ).issues.map(i => i.code)).toContain('base_text_too_short');
  });

  it('custom por palavras conta palavras, não caracteres', () => {
    const content = Array.from({ length: 1000 }, (_, index) => `palavra${index}`).join(' ');
    const result = validateAgainstRequest(
      makeSchema({
        blocks: [{
          id: 'base-text-1',
          type: 'instructions',
          title: 'Texto introdutório',
          content,
          items: [],
          visualAssetIds: [],
        }],
      }),
      undefined,
      makeRequest({ requiresBaseText: true, baseTextSize: 'custom', baseTextConstraint: { unit: 'words', target: 1000 } }),
    );
    expect(result.valid).toBe(true);
  });

  it('baseTextApproxChars legado usa tolerância de 10%', () => {
    const result = validateAgainstRequest(
      makeSchema({
        blocks: [{
          id: 'base-text-1',
          type: 'instructions',
          title: 'Texto introdutório',
          content: 'C'.repeat(2100),
          items: [],
          visualAssetIds: [],
        }],
      }),
      undefined,
      makeRequest({ requiresBaseText: true, baseTextSize: 'custom', baseTextApproxChars: 2000 }),
    );
    expect(result.valid).toBe(true);
  });

  // Sprint 2B.3 (item 2): Guia do Professor só é obrigatório para requestType === 'adaptacao'.
  it('guia obrigatório em adaptação: acusa guide_missing quando ausente', () => {
    const schema = makeSchema({ guia_pedagogico: undefined });
    const request = makeRequest({ requestType: 'adaptacao' });
    const result = validateAgainstRequest(schema, undefined, request);
    expect(result.valid).toBe(false);
    expect(result.issues.map(i => i.code)).toContain('guide_missing');
  });

  it('guia obrigatório em adaptação: acusa guide_missing quando incompleto (sem metodologia)', () => {
    const schema = makeSchema({
      guia_pedagogico: {
        objetivo_da_aula: 'Objetivo',
        metodologia_adaptada: '',
        dicas_de_mediacao: [], criterios_de_avaliacao: [], materiais_necessarios: [], tempo_estimado: '', adaptacoes_inclusivas: [],
      },
    });
    const result = validateAgainstRequest(schema, undefined, makeRequest({ requestType: 'adaptacao' }));
    expect(result.issues.map(i => i.code)).toContain('guide_missing');
  });

  it('guia NÃO é exigido para requestType "atividade", mesmo ausente', () => {
    const schema = makeSchema({ guia_pedagogico: undefined });
    const result = validateAgainstRequest(schema, undefined, makeRequest({ requestType: 'atividade' }));
    expect(result.issues.map(i => i.code)).not.toContain('guide_missing');
  });

  it('guia NÃO é exigido para requestType "avaliacao", mesmo ausente', () => {
    const schema = makeSchema({ guia_pedagogico: undefined, exercises: makeExercises(2) });
    const answerKey = [
      { exerciseId: 'exercise-1', answer: 'A' },
      { exerciseId: 'exercise-2', answer: 'B' },
    ];
    const result = validateAgainstRequest(schema, answerKey, makeRequest({ requestType: 'avaliacao' }));
    expect(result.issues.map(i => i.code)).not.toContain('guide_missing');
  });

  it('avaliação exige answerKey — inválido quando ausente', () => {
    const schema = makeSchema();
    const request = makeRequest({ requestType: 'avaliacao' });
    const result = validateAgainstRequest(schema, undefined, request);
    expect(result.valid).toBe(false);
    expect(result.issues.map(i => i.code)).toContain('answer_key_missing');
  });

  it('avaliação com answerKey coerente é válida', () => {
    const schema = makeSchema({ exercises: makeExercises(3) });
    const request = makeRequest({ requestType: 'avaliacao' });
    const answerKey = [
      { exerciseId: 'exercise-1', answer: 'A' },
      { exerciseId: 'exercise-2', answer: 'B' },
      { exerciseId: 'exercise-3', answer: 'C' },
    ];
    const result = validateAgainstRequest(schema, answerKey, request);
    expect(result.valid).toBe(true);
  });

  it('answerKey.exerciseId precisa existir em exercises — acusa answer_key_id_mismatch', () => {
    const schema = makeSchema({ exercises: makeExercises(2) });
    const request = makeRequest({ requestType: 'avaliacao' });
    const answerKey = [
      { exerciseId: 'exercise-1', answer: 'A' },
      { exerciseId: 'exercise-nao-existe', answer: 'B' },
    ];
    const result = validateAgainstRequest(schema, answerKey, request);
    expect(result.valid).toBe(false);
    expect(result.issues.map(i => i.code)).toContain('answer_key_id_mismatch');
  });

  it('answerKey com quantidade diferente dos exercises acusa answer_key_count_mismatch', () => {
    const schema = makeSchema({ exercises: makeExercises(3) });
    const request = makeRequest({ requestType: 'avaliacao' });
    const answerKey = [{ exerciseId: 'exercise-1', answer: 'A' }];
    const result = validateAgainstRequest(schema, answerKey, request);
    expect(result.issues.map(i => i.code)).toContain('answer_key_count_mismatch');
  });

  it('visualMode "illustration" sem url e marcado deliveredAs=illustration é rejeitado (entrega falsa)', () => {
    const schema = makeSchema({
      visualAssets: [{ id: 'v1', type: 'placeholder', title: 'Caravela', description: 'desc', deliveredAs: 'illustration' }],
    });
    const request = makeRequest({ visualMode: 'illustration', visualModeSource: 'user_explicit' });
    const result = validateAgainstRequest(schema, undefined, request);
    expect(result.valid).toBe(false);
    expect(result.issues.map(i => i.code)).toContain('visual_mode_claim_mismatch');
  });

  it('visualMode "illustration" com asset marcado como pictogram_fallback é aceito (honesto)', () => {
    const schema = makeSchema({
      visualAssets: [{ id: 'v1', type: 'placeholder', title: 'Caravela', description: 'desc', deliveredAs: 'pictogram_fallback', fallbackEmoji: '⛵' }],
    });
    const request = makeRequest({ visualMode: 'illustration', visualModeSource: 'user_explicit' });
    const result = validateAgainstRequest(schema, undefined, request);
    expect(result.issues.map(i => i.code)).not.toContain('visual_mode_claim_mismatch');
  });

  it('questão que manda observar imagem sem asset é inválida', () => {
    const schema = makeSchema({
      exercises: [{
        id: 'exercise-1',
        type: 'short_answer',
        title: 'Imagem',
        prompt: 'Observe a imagem abaixo e responda: o que está acontecendo?',
        options: [],
        answerLines: 3,
      }],
      visualAssets: [],
    });
    const result = validateAgainstRequest(schema, undefined, makeRequest());
    expect(result.valid).toBe(false);
    expect(result.issues.map(i => i.code)).toContain('missing_required_visual_asset');
  });

  it('questão que manda observar imagem com asset referenciado é válida', () => {
    const schema = makeSchema({
      exercises: [{
        id: 'exercise-1',
        type: 'short_answer',
        title: 'Imagem',
        prompt: 'Observe a imagem abaixo e responda: o que está acontecendo?',
        options: [],
        answerLines: 3,
        visualAssetId: 'visual-1',
      }],
      visualAssets: [{ id: 'visual-1', type: 'placeholder', title: 'Ciclo da água', description: 'Diagrama do ciclo da água', fallbackEmoji: '💧' }],
    });
    const result = validateAgainstRequest(schema, undefined, makeRequest());
    expect(result.issues.map(i => i.code)).not.toContain('missing_required_visual_asset');
  });

  it('questão reescrita sem referência visual é válida sem asset', () => {
    const schema = makeSchema({
      exercises: [{
        id: 'exercise-1',
        type: 'short_answer',
        title: 'Água',
        prompt: 'Explique uma situação do cotidiano em que a água muda de estado físico.',
        options: [],
        answerLines: 3,
      }],
      visualAssets: [],
    });
    const result = validateAgainstRequest(schema, undefined, makeRequest());
    expect(result.valid).toBe(true);
  });

  it('duplicidade de exerciseId é detectada', () => {
    const schema = makeSchema({
      exercises: [
        { id: 'exercise-1', type: 'short_answer', title: 'A', prompt: 'a', options: [], answerLines: 3 },
        { id: 'exercise-1', type: 'short_answer', title: 'B', prompt: 'b', options: [], answerLines: 3 },
      ],
    });
    const result = validateAgainstRequest(schema, undefined, makeRequest());
    expect(result.issues.map(i => i.code)).toContain('duplicate_exercise_id');
  });

  it('adaptação de caça-palavras exige preservar exercise.type=word_search', () => {
    const schema = makeSchema({ exercises: makeExercises(3) });
    const request = makeRequest({ requestType: 'adaptacao', originalActivityType: 'word_search' });
    const result = validateAgainstRequest(schema, undefined, request);
    expect(result.valid).toBe(false);
    expect(result.issues.map(i => i.code)).toContain('original_type_not_preserved');
  });

  it('adaptação de caça-palavras é válida quando preserva word_search e guia real', () => {
    const schema = makeSchema({
      exercises: [
        {
          id: 'exercise-1',
          type: 'word_search',
          title: 'Caça-palavras',
          prompt: 'Encontre as palavras na grade.',
          options: ['GATO', 'PATO'],
          answerLines: 0,
          grid: ['GATOP', 'AXXXA', 'TOGAT'],
        },
      ],
    });
    const request = makeRequest({ requestType: 'adaptacao', originalActivityType: 'word_search' });
    const result = validateAgainstRequest(schema, undefined, request);
    expect(result.issues.map(i => i.code)).not.toContain('original_type_not_preserved');
  });

  it('adaptação não aceita perguntas genéricas antes do caça-palavras principal', () => {
    const schema = makeSchema({
      exercises: [
        { id: 'exercise-1', type: 'short_answer', title: 'Pergunta', prompt: 'O que é uma fração?', options: [], answerLines: 3 },
        {
          id: 'exercise-2',
          type: 'word_search',
          title: 'Caça-palavras',
          prompt: 'Encontre as palavras.',
          options: ['METADE', 'TERÇO'],
          answerLines: 0,
          grid: ['METAD', 'EXXXX', 'TERCO'],
        },
      ],
    });
    const request = makeRequest({ requestType: 'adaptacao', originalActivityType: 'word_search' });
    const result = validateAgainstRequest(schema, undefined, request);
    expect(result.valid).toBe(false);
    expect(result.issues.map(i => i.code)).toContain('original_primary_type_not_preserved');
  });

  it('adaptação não fragmenta formato original principal em vários caça-palavras sem pedido explícito de quantidade', () => {
    const wordSearch = (id: string): ActivityExercise => ({
      id,
      type: 'word_search',
      title: 'Caça-palavras',
      prompt: 'Encontre as palavras.',
      options: ['METADE', 'TERÇO'],
      answerLines: 0,
      grid: ['METAD', 'EXXXX', 'TERCO'],
    });
    const schema = makeSchema({ exercises: [wordSearch('exercise-1'), wordSearch('exercise-2')] });
    const request = makeRequest({ requestType: 'adaptacao', originalActivityType: 'word_search', requestedQuestionCount: undefined });
    const result = validateAgainstRequest(schema, undefined, request);
    expect(result.valid).toBe(false);
    expect(result.issues.map(i => i.code)).toContain('original_activity_fragmented');
  });

  it('adaptação não permite exercícios extras de outros formatos quando o professor não pediu complementares', () => {
    const schema = makeSchema({
      exercises: [
        {
          id: 'exercise-1',
          type: 'word_search',
          title: 'Caça-palavras',
          prompt: 'Encontre as palavras.',
          options: ['METADE', 'TERÇO'],
          answerLines: 0,
          grid: ['METAD', 'EXXXX', 'TERCO'],
        },
        { id: 'exercise-2', type: 'multiple_choice', title: 'Extra', prompt: 'Marque a alternativa.', options: ['A', 'B'], answerLines: 0 },
      ],
    });
    const result = validateAgainstRequest(schema, undefined, makeRequest({ requestType: 'adaptacao', originalActivityType: 'word_search' }));
    expect(result.valid).toBe(false);
    expect(result.issues.map(i => i.code)).toContain('unexpected_supplementary_exercises');
  });

  it('adaptação permite exercícios extras somente quando o professor pediu complementares explicitamente', () => {
    const schema = makeSchema({
      exercises: [
        {
          id: 'exercise-1',
          type: 'word_search',
          title: 'Caça-palavras',
          prompt: 'Encontre as palavras.',
          options: ['METADE', 'TERÇO'],
          answerLines: 0,
          grid: ['METAD', 'EXXXX', 'TERCO'],
        },
        { id: 'exercise-2', type: 'multiple_choice', title: 'Extra', prompt: 'Marque a alternativa.', options: ['A', 'B'], answerLines: 0 },
      ],
    });
    const result = validateAgainstRequest(
      schema,
      undefined,
      makeRequest({ requestType: 'adaptacao', originalActivityType: 'word_search', allowSupplementaryExercises: true }),
    );
    expect(result.issues.map(i => i.code)).not.toContain('unexpected_supplementary_exercises');
    expect(result.issues.map(i => i.code)).not.toContain('original_activity_fragmented');
  });

  it.each([
    ['word_search', 'word_search'],
    ['crossword', 'crossword'],
    ['matching', 'matching'],
    ['fill_blank', 'fill_blank'],
    ['coloring', 'coloring'],
    ['table', 'table'],
  ] as const)('adaptação de %s exige preservar exercise.type=%s', (originalActivityType, exerciseType) => {
    const invalid = validateAgainstRequest(
      makeSchema({ exercises: makeExercises(1) }),
      undefined,
      makeRequest({ requestType: 'adaptacao', originalActivityType }),
    );
    expect(invalid.issues.map(i => i.code)).toContain('original_type_not_preserved');

    const valid = validateAgainstRequest(
      makeSchema({
        exercises: [{
          id: 'exercise-1',
          type: exerciseType,
          title: 'Estrutural',
          prompt: 'Preserve a estrutura.',
          options: ['Item A', 'Item B'],
          answerLines: 2,
          grid: exerciseType === 'crossword' || exerciseType === 'word_search' ? ['ABCDE', 'FGHIJ'] : undefined,
          clues: exerciseType === 'crossword' ? ['Pista 1'] : undefined,
        }],
      }),
      undefined,
      makeRequest({ requestType: 'adaptacao', originalActivityType }),
    );
    expect(valid.issues.map(i => i.code)).not.toContain('original_type_not_preserved');
  });
});
