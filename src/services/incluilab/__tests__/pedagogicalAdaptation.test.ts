import { describe, expect, it } from 'vitest';
import { buildCanonicalActivityPrompt } from '../canonicalActivityPipeline';
import { extractCanonicalIntent } from '../intentExtractor';
import { buildStudentPedagogicalContext } from '../studentPedagogicalContext';
import { validateAgainstRequest } from '../validateAgainstRequest';
import type { ActivityExercise, ActivityExerciseType, ActivitySchema, CanonicalGenerationRequest, GuiaPedagogico } from '../../../types';

function exercise(id: number, type: ActivityExerciseType = 'short_answer', prompt = `Resolva o item ${id} sobre frações.`): ActivityExercise {
  return {
    id: `exercise-${id}`,
    type,
    title: `Etapa ${id}`,
    prompt,
    options: type === 'matching' ? ['Metade - 1/2', 'Terço - 1/3'] : [],
    answerLines: type === 'short_answer' ? 2 : 0,
    supportHint: 'Responda por palavra-chave, seleção ou fala mediada se necessário.',
  };
}

function guide(overrides: Partial<GuiaPedagogico> = {}): GuiaPedagogico {
  return {
    objetivo_da_aula: 'Preservar o objetivo de aprendizagem sobre frações: reconhecer partes de um todo e relacionar representação e significado.',
    metodologia_adaptada: 'Apresente a atividade de frações em blocos progressivos. Use comandos curtos, um por vez, explique o vocabulário antes dos exercícios e permita resposta oral, por seleção, associação ou palavras-chave quando a escrita não for o foco.',
    dicas_de_mediacao: [
      'No primeiro exercício, modele um exemplo sem entregar a resposta; depois peça que o estudante marque, associe ou fale a palavra-chave.',
      'Use o interesse registrado apenas como tema de exemplo e retire o apoio gradualmente quando houver autonomia.',
    ],
    criterios_de_avaliacao: [
      'Observar se preserva o significado de fração, identifica partes do todo, usa estratégia de associação e registrar nível de ajuda.',
    ],
    materiais_necessarios: ['Lápis', 'cartões de apoio com palavras-chave'],
    tempo_estimado: '30 a 40 minutos, com pausa curta entre blocos se necessário',
    adaptacoes_inclusivas: [
      'Comandos segmentados porque a compreensão de uma ação por vez foi registrada.',
      'Forma alternativa de resposta por associação/seleção para reduzir barreira de registro escrito sem reduzir o objetivo.',
    ],
    ...overrides,
  };
}

function schema(exercises: ActivityExercise[], guideOverrides: Partial<GuiaPedagogico> = {}): ActivitySchema {
  return {
    schemaVersion: '2.0',
    header: {
      title: 'Frações em Situações Reais',
      theme: 'Frações',
      objective: 'Reconhecer partes de um todo e relacionar frações a situações reais.',
      level: '6º ano',
      estimatedTime: '35 minutos',
      instructions: ['Leia uma etapa por vez.', 'Responda usando a forma combinada com o professor.'],
    },
    blocks: [{
      id: 'base-text-1',
      type: 'instructions',
      title: 'Texto de apoio',
      content: 'Frações aparecem quando dividimos uma receita, uma coleção de cards ou a organização de um espaço.',
      items: [],
      visualAssetIds: [],
    }],
    exercises,
    visualAssets: [],
    accessibilityNotes: {
      supports: ['Comandos curtos', 'Palavras-chave', 'Resposta oral ou por seleção'],
      adaptations: ['Blocos progressivos', 'Mediação graduada'],
      teacherNotes: ['Registrar nível de ajuda e estratégia utilizada.'],
    },
    guia_pedagogico: guide(guideOverrides),
    requestType: 'adaptacao',
  };
}

function request(raw: string, options: Parameters<typeof extractCanonicalIntent>[1] = {}): CanonicalGenerationRequest {
  return extractCanonicalIntent(raw, {
    hasAttachment: true,
    requestTypeHint: 'adaptacao',
    ...options,
  });
}

describe('adaptação pedagógica canônica', () => {
  it('consolida contexto funcional sem inventar dados ausentes', () => {
    const ctx = buildStudentPedagogicalContext([
      'Aluno: Estudante Teste',
      'Ano/Série: 6º ano',
      'Diagnóstico(s): TEA',
      'Linguagem/Leitura: 2/5',
      'Compreensão: compreende uma ação por vez',
      'Observação: responde bem por associação e tem interesse por animais',
    ].join('\n'));

    expect(ctx.hasContext).toBe(true);
    expect(ctx.isInsufficient).toBe(false);
    expect(ctx.firstName).toBe('Estudante');
    expect(ctx.diagnoses).toContain('TEA');
    expect(ctx.barriers.join(' ')).toContain('Linguagem/Leitura 2/5');
    expect(ctx.responseModes.join(' ')).toMatch(/associa/i);
    expect(ctx.interests.join(' ')).toMatch(/animais/i);
  });

  it('Caso 1 — TEA com leitura inicial: usa comandos segmentados, associação, interesse e Guia conectado', () => {
    const studentContext = [
      'Ano/Série: 6º ano',
      'Diagnóstico(s): TEA',
      'Linguagem/Leitura: 2/5',
      'Compreensão: compreende uma ação por vez',
      'Observação: responde bem por associação e tem interesse por animais',
    ].join('\n');
    const req = request('adaptar atividade de texto e questões sobre frações', { studentContext });
    const result = validateAgainstRequest(
      schema([
        exercise(1, 'matching', 'Ligue cada fração ao exemplo com animais em uma coleção.'),
        exercise(2, 'short_answer', 'Fale ou escreva a palavra-chave que mostra metade da coleção.'),
        exercise(3, 'multiple_choice', 'Marque a alternativa que representa um terço.'),
      ], {
        metodologia_adaptada: 'Use frases curtas e uma ação por comando porque o contexto registra compreensão de uma ação por vez. Comece por associação com animais e avance para marcação e palavra-chave, preservando o objetivo sobre frações.',
      }),
      undefined,
      req,
    );

    expect(result.valid).toBe(true);
  });

  it('Caso 2 — TDAH com boa leitura: segmenta sem simplificar o desafio cognitivo', () => {
    const req = request('adaptar atividade de frações para 8º ano', {
      studentContext: 'Ano/Série: 8º ano\nAtenção Sustentada: 2/5\nLinguagem/Leitura: 4/5\nObservação: boa leitura e melhor resposta a tarefas segmentadas.',
    });
    const result = validateAgainstRequest(
      schema([
        exercise(1, 'short_answer', 'Compare duas representações equivalentes de fração.'),
        exercise(2, 'short_answer', 'Explique por palavra-chave a estratégia usada.'),
        exercise(3, 'multiple_choice', 'Escolha a equivalência correta e justifique oralmente.'),
      ], {
        metodologia_adaptada: 'Mantenha o desafio cognitivo de equivalência de frações porque a leitura está adequada. Divida em blocos por causa da atenção sustentada 2/5 e use pausas curtas entre etapas.',
      }),
      undefined,
      req,
    );

    expect(result.valid).toBe(true);
  });

  it('Caso 3 — dificuldade motora: preserva complexidade e permite registro alternativo', () => {
    const req = request('adaptar atividade de frações para aluno com dificuldade motora', {
      studentContext: 'Motricidade Fina: 2/5\nCompreensão: compatível com a série\nObservação: dificuldade para produzir respostas escritas longas.',
    });
    const result = validateAgainstRequest(
      schema([
        exercise(1, 'short_answer', 'Explique oralmente ou por palavras-chave como comparar 1/2 e 1/4.'),
        exercise(2, 'multiple_choice', 'Selecione a representação correta e diga a estratégia.'),
      ], {
        metodologia_adaptada: 'Não reduza a complexidade intelectual: a compreensão é compatível com a série. Ajuste apenas o registro por causa da motricidade fina 2/5, aceitando resposta oral, seleção ou palavras-chave.',
      }),
      undefined,
      req,
    );

    expect(result.valid).toBe(true);
  });

  it('Caso 4 — deficiência intelectual: usa exemplos concretos, progressão e evita infantilização', () => {
    const req = request('adaptar atividade de frações para anos finais', {
      studentContext: 'Diagnóstico(s): deficiência intelectual\nLinguagem/Leitura: lê palavras simples\nConhecimentos prévios: reconhece situações concretas\nCompreensão: necessita de apoio passo a passo.',
    });
    const result = validateAgainstRequest(
      schema([
        exercise(1, 'matching', 'Associe metade, terço e quarto a situações concretas.'),
        exercise(2, 'multiple_choice', 'Marque a fração que representa a situação.'),
        exercise(3, 'short_answer', 'Diga uma palavra-chave para explicar sua escolha.'),
      ], {
        metodologia_adaptada: 'Use exemplos concretos porque reconhece situações concretas e lê palavras simples. Organize progressão em etapas, com apoio passo a passo, mantendo linguagem adequada aos anos finais.',
      }),
      undefined,
      req,
    );

    expect(result.valid).toBe(true);
    expect(result.issues.map(i => i.code)).not.toContain('adaptation_infantilization_risk');
  });

  it('Caso 5 — sem aluno selecionado: aceita DUA e exige aviso de contexto insuficiente', () => {
    const req = request('adaptar atividade geral sobre frações');
    const result = validateAgainstRequest(
      schema([exercise(1), exercise(2), exercise(3)], {
        metodologia_adaptada: 'Contexto individual insuficiente: aplicar como adaptação geral com DUA e acessibilidade geral. Organize em etapas e permita resposta oral, seleção ou palavras-chave.',
      }),
      undefined,
      req,
    );

    expect(result.valid).toBe(true);
  });

  it('Caso 6 — caça-palavras enviado: preserva word_search e não substitui por perguntas comuns', () => {
    const req = request('adaptar este caça-palavras de frações', { originalActivityType: 'word_search' });
    const wordSearch = schema([{
      ...exercise(1, 'word_search', 'Encontre as palavras METADE, TERÇO e QUARTO na grade.'),
      options: ['METADE', 'TERÇO', 'QUARTO'],
      grid: ['METADEX', 'TERCOXX', 'QUARTOX'],
    }], {
      metodologia_adaptada: 'Contexto individual insuficiente: preserve o caça-palavras como atividade principal. Ajuste vocabulário e pistas, mantendo resposta por marcação/seleção na grade.',
    });
    const result = validateAgainstRequest(wordSearch, undefined, req);

    expect(result.valid).toBe(true);
    expect(wordSearch.exercises[0].type).toBe('word_search');
  });

  it('Caso 7 — quantidade explícita: mantém 10 questões e permite organizar em blocos', () => {
    const req = request('adaptar atividade de frações com 10 questões');
    const result = validateAgainstRequest(
      schema(Array.from({ length: 10 }, (_, index) => exercise(index + 1)), {
        metodologia_adaptada: 'Contexto individual insuficiente: mantenha as 10 questões solicitadas e organize em dois blocos progressivos de cinco itens, com resposta curta, oral ou por seleção.',
      }),
      undefined,
      req,
    );

    expect(req.requestedQuestionCount).toBe(10);
    expect(result.valid).toBe(true);
  });

  it('rejeita guia genérico desconectado', () => {
    const req = request('adaptar atividade de frações');
    const result = validateAgainstRequest(
      schema([exercise(1)], {
        metodologia_adaptada: 'Tenha paciência, respeite o tempo do aluno e use recursos visuais.',
        dicas_de_mediacao: ['Ofereça apoio.'],
      }),
      undefined,
      req,
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map(i => i.code)).toContain('adaptation_generic_guidance');
  });

  it('rejeita contexto funcional disponível quando atividade e Guia ignoram esse contexto', () => {
    const req = request('adaptar atividade de frações', {
      studentContext: 'Atenção Sustentada: 2/5\nObservação: responde melhor por associação.',
    });
    const result = validateAgainstRequest(
      schema([exercise(1)], {
        metodologia_adaptada: 'Apresente a atividade de frações em etapas e permita resposta oral por palavras-chave.',
        dicas_de_mediacao: ['No exercício, leia o comando e peça resposta oral curta sem entregar a resposta.'],
        criterios_de_avaliacao: ['Observar compreensão de frações e nível de ajuda.'],
        adaptacoes_inclusivas: ['Comandos claros e resposta curta.'],
      }),
      undefined,
      req,
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map(i => i.code)).toContain('adaptation_context_not_used');
  });

  it('prompt canônico orienta preservar objetivo, tipo, quantidade e não estereotipar diagnóstico', () => {
    const req = request('adaptar caça-palavras de frações com 10 questões', {
      studentContext: 'Diagnóstico(s): TEA\nCompreensão: uma ação por vez',
      originalActivityType: 'word_search',
    });
    const prompt = buildCanonicalActivityPrompt(req, { analysisText: 'Atividade original é caça-palavras de frações.' });

    expect(prompt).toContain('preserve esse objetivo');
    expect(prompt).toContain('Não baseie a adaptação somente em diagnóstico');
    expect(prompt).toContain('TIPO ORIGINAL DETECTADO: caça-palavras');
    expect(prompt).toContain('EXATAMENTE 10');
    expect(prompt).toContain('Diagnóstico informado no sistema (não usar isoladamente): TEA');
  });
});
