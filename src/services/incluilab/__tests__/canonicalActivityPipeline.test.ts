import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../../aiService';
import { CreditTransactionService } from '../../creditService';
import {
  buildCanonicalActivityPrompt,
  buildTeacherGuideMarkdown,
  CanonicalPipelineError,
  runCanonicalActivityPipeline,
} from '../canonicalActivityPipeline';
import { extractCanonicalIntent } from '../intentExtractor';
import type { User } from '../../../types';

const baseUser = { id: 'user-1', tenant_id: 'tenant-1', email: 'prof@escola.com' } as unknown as User;

interface BuildSchemaOpts {
  withGuide?: boolean;
  withAnswerKey?: boolean;
  exerciseType?: any;
  baseText?: string;
}

function buildSchemaObject(count: number, opts: BuildSchemaOpts = {}) {
  const exercises = Array.from({ length: count }, (_, i) => ({
    id: `exercise-${i + 1}`,
    type: opts.exerciseType ?? 'short_answer',
    title: `Questão ${i + 1}`,
    prompt: `Enunciado ${i + 1}`,
    options: [],
    answerLines: 3,
  }));

  const root: any = {
    header: { title: 'Atividade Teste', theme: 'Tema Teste', objective: 'Objetivo real desta atividade' },
    blocks: opts.baseText ? [{
      id: 'base-text-1',
      type: 'instructions',
      title: 'Texto introdutório',
      content: opts.baseText,
      items: [],
      visualAssetIds: [],
    }] : [],
    exercises,
    visualAssets: [],
    accessibilityNotes: { supports: [], adaptations: [], teacherNotes: [] },
  };

  if (opts.withGuide !== false) {
    root.guia_pedagogico = {
      objetivo_da_aula: 'Preservar o objetivo real desta atividade: compreender o tema teste por meio dos exercícios gerados.',
      metodologia_adaptada: 'Contexto individual insuficiente: aplicar como adaptação geral com DUA. Apresente o tema teste em etapas, leia cada comando, organize os exercícios do simples ao complexo e permita resposta curta, oral ou por seleção quando necessário.',
      dicas_de_mediacao: ['No exercício, leia o comando em uma ação por vez, peça que o estudante marque ou fale palavras-chave e medie sem entregar a resposta.'],
      criterios_de_avaliacao: ['Observar se o estudante compreende o tema teste, resolve os exercícios com apoio graduado e registra o nível de ajuda utilizado.'],
      materiais_necessarios: ['Lápis'],
      tempo_estimado: '30 minutos',
      adaptacoes_inclusivas: ['Comandos segmentados e forma alternativa de resposta porque o contexto individual é insuficiente para personalização específica.'],
    };
  }

  if (opts.withAnswerKey) {
    root.answerKey = exercises.map(e => ({ exerciseId: e.id, answer: `Resposta de ${e.id}` }));
  }

  return root;
}

function buildSchemaJson(count: number, opts: BuildSchemaOpts = {}): string {
  return JSON.stringify(buildSchemaObject(count, opts));
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(CreditTransactionService, 'atomicReserveCredits').mockResolvedValue({ ok: true, reservation_id: 'res-1' } as any);
  vi.spyOn(CreditTransactionService, 'atomicCommitReservedCredits').mockResolvedValue({ ok: true } as any);
  vi.spyOn(CreditTransactionService, 'atomicReleaseReservedCredits').mockResolvedValue({ ok: true } as any);
});

describe('runCanonicalActivityPipeline', () => {
  it('A4 Econômica canônica: gera exatamente 10 questões sobre frações, sem Guia, com schema 2.0', async () => {
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(buildSchemaJson(10, { withGuide: true }));
    const request = extractCanonicalIntent('10 questões sobre frações para o 6º ano', {
      requestTypeHint: 'atividade',
    });

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_a4_economica_real' });

    expect(request.requestType).toBe('atividade');
    expect(pkg.activity.schemaVersion).toBe('2.0');
    expect(pkg.activity.exercises).toHaveLength(10);
    expect(pkg.teacherGuide).toBeUndefined();
    expect(pkg.activity.guia_pedagogico).toBeUndefined();
    expect(pkg.metadata.repairAttempts).toBe(0);
  });

  it('Avaliação canônica: requestType explícito exige gabarito e remove Guia mesmo se a IA tentar incluir', async () => {
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(buildSchemaJson(5, { withGuide: true, withAnswerKey: true }));
    const request = extractCanonicalIntent('Avaliação de frações para o 6º ano com 5 questões', {
      requestTypeHint: 'avaliacao',
    });

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_avaliacao_real' });

    expect(request.requestType).toBe('avaliacao');
    expect(pkg.activity.exercises).toHaveLength(5);
    expect(pkg.answerKey).toHaveLength(5);
    expect(pkg.teacherGuide).toBeUndefined();
    expect(pkg.activity.guia_pedagogico).toBeUndefined();
  });

  it('contrato de avaliação exige gabarito automaticamente mesmo sem o professor pedir "com gabarito"', async () => {
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(buildSchemaJson(5, { withGuide: true, withAnswerKey: true }));
    const request = extractCanonicalIntent('Avaliação de frações para o 6º ano com 5 questões');

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_avaliacao_sem_pedir_gabarito' });

    expect(request.requestType).toBe('avaliacao');
    expect(pkg.activity.exercises).toHaveLength(5);
    expect(pkg.answerKey).toHaveLength(5);
    expect(pkg.teacherGuide).toBeUndefined();
    expect(pkg.activity.guia_pedagogico).toBeUndefined();
  });

  it('Adaptar Texto canônico: preserva caça-palavras detectado, mantém Guia e funciona sem aluno selecionado', async () => {
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(
      JSON.stringify({
        ...buildSchemaObject(1, { exerciseType: 'word_search', withGuide: true }),
        header: { title: 'Caça-palavras de Frações', theme: 'Frações', objective: 'Reconhecer termos de frações' },
        guia_pedagogico: {
          objetivo_da_aula: 'Preservar o objetivo de reconhecer termos de frações por meio do caça-palavras.',
          metodologia_adaptada: 'Contexto individual insuficiente: aplicar como adaptação geral com DUA. Preserve o caça-palavras como formato principal, explique as palavras de frações antes da busca e permita marcação/seleção na grade.',
          dicas_de_mediacao: ['No caça-palavras, leia uma pista por vez e peça que o estudante marque ou fale a palavra antes de procurar na grade.'],
          criterios_de_avaliacao: ['Observar se reconhece os termos de frações e registra a busca com apoio graduado.'],
          materiais_necessarios: ['Lápis'],
          tempo_estimado: '30 minutos',
          adaptacoes_inclusivas: ['Pistas curtas e resposta por marcação/seleção para preservar o objetivo sem transformar em perguntas genéricas.'],
        },
      }),
    );
    const request = extractCanonicalIntent('Caça-palavras de Frações', {
      hasAttachment: true,
      requestTypeHint: 'adaptacao',
      originalActivityType: 'word_search',
    });

    const pkg = await runCanonicalActivityPipeline({
      request,
      user: baseUser,
      cost: 5,
      actionKey: 'test_adaptar_texto_real',
      analysisText: 'A imagem mostra um caça-palavras com palavras sobre frações.',
    });

    expect(request.studentContext).toBeUndefined();
    expect(pkg.activity.exercises[0].type).toBe('word_search');
    expect(pkg.activity.exercises[0].type).not.toBe('short_answer');
    expect(pkg.activity.header.title).toBe('Caça-palavras de Frações');
    expect(pkg.teacherGuide?.objetivo_da_aula).toBeTruthy();
    expect(pkg.metadata.studentContextUsed).toBe(false);
  });

  it('entrega exatamente as N questões pedidas quando a IA acerta de primeira (sem reparo)', async () => {
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(buildSchemaJson(10));
    const request = extractCanonicalIntent('Atividade de frações para o 5º ano com 10 questões');

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_atividade' });

    expect(pkg.activity.exercises).toHaveLength(10);
    expect(pkg.metadata.repairAttempts).toBe(0);
    expect(CreditTransactionService.atomicCommitReservedCredits).toHaveBeenCalledTimes(1);
    expect(CreditTransactionService.atomicReleaseReservedCredits).not.toHaveBeenCalled();
  });

  it('quantidade errada na 1ª tentativa aciona UM reparo e entrega a quantidade correta', async () => {
    const gen = vi.spyOn(AIService, 'generateIncluiLabActivitySchema');
    gen.mockResolvedValueOnce(buildSchemaJson(8)).mockResolvedValueOnce(buildSchemaJson(10));
    const request = extractCanonicalIntent('Atividade sobre o corpo humano com 10 questões');

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_atividade' });

    expect(pkg.activity.exercises).toHaveLength(10);
    expect(pkg.metadata.repairAttempts).toBe(1);
    expect(gen).toHaveBeenCalledTimes(2);
    expect(CreditTransactionService.atomicCommitReservedCredits).toHaveBeenCalledTimes(1);
  });

  it('reparo falhou novamente → erro explícito, NÃO entrega como se estivesse correto, libera reserva e não cobra', async () => {
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(buildSchemaJson(8)); // sempre errado
    const request = extractCanonicalIntent('Atividade sobre o corpo humano com 10 questões');

    await expect(
      runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_atividade' }),
    ).rejects.toBeInstanceOf(CanonicalPipelineError);

    expect(CreditTransactionService.atomicCommitReservedCredits).not.toHaveBeenCalled();
    expect(CreditTransactionService.atomicReleaseReservedCredits).toHaveBeenCalledTimes(1);
  });

  it('requestType=avaliacao exige answerKey; IDs do gabarito são coerentes com exercises', async () => {
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(buildSchemaJson(4, { withAnswerKey: true }));
    const request = extractCanonicalIntent('avaliação sobre o sistema solar');
    expect(request.requestType).toBe('avaliacao');

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_avaliacao' });

    expect(pkg.answerKey).toHaveLength(4);
    const exerciseIds = new Set(pkg.activity.exercises.map(e => e.id));
    expect(pkg.answerKey!.every(item => exerciseIds.has(item.exerciseId))).toBe(true);
  });

  it('avaliação preserva gabarito quando a IA retorna answer_key em snake_case', async () => {
    const raw = buildSchemaObject(3);
    raw.answer_key = raw.exercises.map((e: any) => ({ exercise_id: e.id, correct_answer: `Resposta ${e.id}` }));
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(JSON.stringify(raw));
    const request = extractCanonicalIntent('avaliação com 3 questões sobre frações');

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_answer_key_snake' });

    expect(pkg.answerKey).toHaveLength(3);
    expect(pkg.answerKey?.[0]).toMatchObject({ exerciseId: 'exercise-1', answer: 'Resposta exercise-1' });
    expect(pkg.metadata.repairAttempts).toBe(0);
  });

  it('avaliação preserva gabarito numerado em português (numero/resposta)', async () => {
    const raw = buildSchemaObject(2);
    raw.gabarito = [
      { numero: 1, resposta: '1/2' },
      { numero: 2, resposta: '3/4' },
    ];
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(JSON.stringify(raw));
    const request = extractCanonicalIntent('Avaliação de frações com 2 questões');

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_gabarito_numero' });

    expect(pkg.answerKey).toEqual([
      { exerciseId: 'exercise-1', answer: '1/2', explanation: undefined },
      { exerciseId: 'exercise-2', answer: '3/4', explanation: undefined },
    ]);
    expect(CreditTransactionService.atomicCommitReservedCredits).toHaveBeenCalledTimes(1);
  });

  it('avaliação sem answerKey na 1ª tentativa aciona reparo; se a 2ª também vier sem, falha sem cobrança', async () => {
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(buildSchemaJson(3, { withAnswerKey: false }));
    const request = extractCanonicalIntent('prova com 3 questões sobre plantas');

    await expect(
      runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_avaliacao' }),
    ).rejects.toBeInstanceOf(CanonicalPipelineError);

    expect(CreditTransactionService.atomicCommitReservedCredits).not.toHaveBeenCalled();
    expect(CreditTransactionService.atomicReleaseReservedCredits).toHaveBeenCalledTimes(1);
  });

  it('avaliação sem answerKey na 1ª tentativa aciona um reparo e fica válida quando o gabarito vem na 2ª', async () => {
    const gen = vi.spyOn(AIService, 'generateIncluiLabActivitySchema');
    gen
      .mockResolvedValueOnce(buildSchemaJson(5, { withAnswerKey: false }))
      .mockResolvedValueOnce(buildSchemaJson(5, { withAnswerKey: true }));
    const request = extractCanonicalIntent('Avaliação de frações para o 6º ano com 5 questões', {
      requestTypeHint: 'avaliacao',
    });

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_repair_gabarito' });

    expect(gen).toHaveBeenCalledTimes(2);
    expect(gen.mock.calls[1][0]).toContain('requestType=avaliacao exige answerKey');
    expect(pkg.answerKey).toHaveLength(5);
    expect(pkg.metadata.repairAttempts).toBe(1);
    expect(CreditTransactionService.atomicCommitReservedCredits).toHaveBeenCalledTimes(1);
    expect(CreditTransactionService.atomicReleaseReservedCredits).not.toHaveBeenCalled();
  });

  // Sprint 2B.3 (item 2): Guia do Professor só existe para requestType === 'adaptacao'.
  it('guia do professor é obrigatório em ADAPTAÇÃO: ausente na 1ª tentativa aciona reparo e o resultado final tem guia real', async () => {
    const withoutGuide = buildSchemaObject(3, { withGuide: false });
    const withGuide = buildSchemaJson(3, { withGuide: true });
    const gen = vi.spyOn(AIService, 'generateIncluiLabActivitySchema');
    gen.mockResolvedValueOnce(JSON.stringify(withoutGuide)).mockResolvedValueOnce(withGuide);

    const request = extractCanonicalIntent('adaptar atividade sobre o ciclo da água', { requestTypeHint: 'adaptacao' });
    expect(request.requestType).toBe('adaptacao');
    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_adaptacao' });

    expect(pkg.teacherGuide?.objetivo_da_aula).toBeTruthy();
    expect(pkg.teacherGuide?.metodologia_adaptada).toBeTruthy();
    expect(pkg.metadata.repairAttempts).toBe(1);
  });

  it('guia NÃO é gerado automaticamente para requestType "atividade" — teacherGuide fica undefined mesmo se a IA incluir um', async () => {
    // buildSchemaJson por padrão inclui guia_pedagogico no JSON simulado — o pipeline
    // precisa descartá-lo mesmo assim, porque requestType aqui é 'atividade'.
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(buildSchemaJson(4, { withGuide: true }));
    const request = extractCanonicalIntent('Atividade sobre o ciclo da água');
    expect(request.requestType).toBe('atividade');

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_atividade' });

    expect(pkg.teacherGuide).toBeUndefined();
    expect(pkg.activity.guia_pedagogico).toBeUndefined();
  });

  it('guia NÃO é gerado automaticamente para requestType "avaliacao" — teacherGuide fica undefined', async () => {
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(buildSchemaJson(4, { withGuide: true, withAnswerKey: true }));
    const request = extractCanonicalIntent('avaliação sobre o sistema solar');
    expect(request.requestType).toBe('avaliacao');

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_avaliacao' });

    expect(pkg.teacherGuide).toBeUndefined();
    expect(pkg.answerKey).toHaveLength(4); // gabarito continua existindo normalmente
  });

  it('entrega exatamente 15 questões quando pedido (não trunca)', async () => {
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(buildSchemaJson(15));
    const request = extractCanonicalIntent('Atividade de história com 15 questões');
    expect(request.requestedQuestionCount).toBe(15);

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_atividade' });

    expect(pkg.activity.exercises).toHaveLength(15);
  });

  it('texto introdutório pedido: sem blocks na 1ª tentativa aciona reparo e só aceita resposta com texto + 15 questões', async () => {
    const gen = vi.spyOn(AIService, 'generateIncluiLabActivitySchema');
    gen
      .mockResolvedValueOnce(buildSchemaJson(15))
      .mockResolvedValueOnce(buildSchemaJson(15, {
        baseText: 'Frações fazem parte de muitas situações do cotidiano, como dividir alimentos, medir ingredientes e comparar partes de um todo. '.repeat(18),
      }));
    const request = extractCanonicalIntent('Faça uma atividade sobre frações para o 6º ano com um texto introdutório e 15 questões.');

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_texto_base_15' });

    expect(request.requiresBaseText).toBe(true);
    expect(pkg.activity.exercises).toHaveLength(15);
    expect(pkg.activity.blocks[0]?.title).toBe('Texto introdutório');
    expect(pkg.activity.blocks[0]?.content.length).toBeGreaterThanOrEqual(180);
    expect(pkg.metadata.repairAttempts).toBe(1);
    expect(gen.mock.calls[1][0]).toContain('texto/texto-base');
  });

  it('texto introdutório pedido: se o reparo também não trouxer texto, falha explicitamente sem cobrança', async () => {
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(buildSchemaJson(15));
    const request = extractCanonicalIntent('Faça uma atividade sobre frações com texto introdutório e 15 questões');

    await expect(
      runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_texto_base_fail' }),
    ).rejects.toBeInstanceOf(CanonicalPipelineError);

    expect(CreditTransactionService.atomicCommitReservedCredits).not.toHaveBeenCalled();
    expect(CreditTransactionService.atomicReleaseReservedCredits).toHaveBeenCalledTimes(1);
  });

  it('quantidade errada 12 quando pedido 15 aciona reparo e só aceita 15', async () => {
    const gen = vi.spyOn(AIService, 'generateIncluiLabActivitySchema');
    gen.mockResolvedValueOnce(buildSchemaJson(12)).mockResolvedValueOnce(buildSchemaJson(15));
    const request = extractCanonicalIntent('Atividade de matemática com 15 questões');

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_quantidade_15' });

    expect(pkg.activity.exercises).toHaveLength(15);
    expect(pkg.metadata.repairAttempts).toBe(1);
    expect(gen.mock.calls[1][0]).toContain('Usuário pediu 15 questão');
  });

  it('entrega exatamente 5 questões quando pedido', async () => {
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(buildSchemaJson(5));
    const request = extractCanonicalIntent('Atividade de frações com 5 questões');

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_quantidade_5' });

    expect(request.requestedQuestionCount).toBe(5);
    expect(pkg.activity.exercises).toHaveLength(5);
    expect(pkg.metadata.repairAttempts).toBe(0);
  });

  it('funciona sem aluno selecionado (studentContext ausente)', async () => {
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(buildSchemaJson(4));
    const request = extractCanonicalIntent('Atividade sobre reciclagem'); // sem studentContext

    expect(request.studentContext).toBeUndefined();
    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_atividade' });

    expect(pkg.metadata.studentContextUsed).toBe(false);
  });

  it('com aluno selecionado, o contexto do aluno é injetado no prompt enviado à IA', () => {
    const request = extractCanonicalIntent('Atividade sobre reciclagem', {
      studentContext: 'Aluno com TEA, nível 2 de suporte, prefere instruções curtas',
    });
    const prompt = buildCanonicalActivityPrompt(request);
    expect(prompt).toContain('Aluno com TEA, nível 2 de suporte');
  });

  it('contextos de aluno diferentes produzem orientações pedagógicas diferentes no prompt canônico', () => {
    const promptA = buildCanonicalActivityPrompt(extractCanonicalIntent('adaptar caça-palavras', {
      requestTypeHint: 'adaptacao',
      hasAttachment: true,
      originalActivityType: 'word_search',
      studentContext: 'Perfil cognitivo: Atenção Sustentada 2/5. Observação: beneficia-se de instruções curtas e poucos estímulos.',
    }));
    const promptB = buildCanonicalActivityPrompt(extractCanonicalIntent('adaptar caça-palavras', {
      requestTypeHint: 'adaptacao',
      hasAttachment: true,
      originalActivityType: 'word_search',
      studentContext: 'Perfil cognitivo: Linguagem/Leitura 4/5. Observação: resolve melhor tarefas com autonomia e desafio gradual.',
    }));

    expect(promptA).toContain('Atenção Sustentada 2/5');
    expect(promptA).toContain('instruções curtas');
    expect(promptB).toContain('Linguagem/Leitura 4/5');
    expect(promptB).toContain('autonomia e desafio gradual');
    expect(promptA).toContain('use evidências funcionais concretas');
    expect(promptB).toContain('use evidências funcionais concretas');
    expect(promptA).not.toBe(promptB);
  });

  it('visualMode "illustration" nunca é apresentado como ilustração real quando só há fallback (pictograma honesto)', async () => {
    const withIllustrationRequest = buildSchemaObject(3);
    withIllustrationRequest.visualAssets = [
      { id: 'visual-1', type: 'placeholder', title: 'Caravela', description: 'Uma caravela portuguesa', fallbackEmoji: '⛵' },
    ];
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(JSON.stringify(withIllustrationRequest));

    const request = extractCanonicalIntent('faça uma atividade sobre navegações com ilustrações de caravelas');
    expect(request.visualMode).toBe('illustration');

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_atividade' });

    expect(pkg.visualAssets[0].url).toBeUndefined();
    expect(pkg.visualAssets[0].deliveredAs).toBe('pictogram_fallback');
  });

  it('visualMode "pictogram" é tratado normalmente, sem exigir ilustração real', async () => {
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(buildSchemaJson(4));
    const request = extractCanonicalIntent('atividade com apoio visual sobre animais');
    expect(request.visualMode).toBe('pictogram');

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_atividade' });
    expect(pkg.metadata.visualMode).toBe('pictogram');
  });

  it('questão que exige imagem sem asset aciona reparo e só aceita quando reescrita sem dependência visual', async () => {
    const invalid = buildSchemaObject(1, { withAnswerKey: true });
    invalid.exercises[0].prompt = 'Observe a imagem abaixo e explique a fração representada.';
    const repaired = buildSchemaObject(1, { withAnswerKey: true });
    repaired.exercises[0].prompt = 'Explique uma situação em que usamos frações no cotidiano.';
    const gen = vi.spyOn(AIService, 'generateIncluiLabActivitySchema');
    gen.mockResolvedValueOnce(JSON.stringify(invalid)).mockResolvedValueOnce(JSON.stringify(repaired));
    const request = extractCanonicalIntent('Avaliação de frações com 1 questão');

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_visual_ref_repair' });

    expect(gen.mock.calls[1][0]).toContain('pede para observar/analisar recurso visual');
    expect(pkg.activity.exercises[0].prompt).not.toMatch(/observe a imagem/i);
    expect(pkg.metadata.repairAttempts).toBe(1);
  });

  it('questão que exige imagem é aceita quando referencia asset visual existente', async () => {
    const withAsset = buildSchemaObject(1, { withAnswerKey: true });
    withAsset.exercises[0].prompt = 'Observe a imagem abaixo e explique a fração representada.';
    withAsset.exercises[0].visualAssetId = 'visual-1';
    withAsset.visualAssets = [{ id: 'visual-1', type: 'placeholder', title: 'Fração', description: 'Figura dividida em partes', fallbackEmoji: '◼️' }];
    vi.spyOn(AIService, 'generateIncluiLabActivitySchema').mockResolvedValue(JSON.stringify(withAsset));
    const request = extractCanonicalIntent('Avaliação de frações com 1 questão');

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_visual_ref_asset' });

    expect(pkg.activity.exercises[0].visualAssetId).toBe('visual-1');
    expect(pkg.metadata.repairAttempts).toBe(0);
  });

  it('prompt de adaptação inclui o tipo original detectado e não manda recriar como perguntas genéricas', () => {
    const request = extractCanonicalIntent('Caça-palavras dos animais', {
      hasAttachment: true,
      requestTypeHint: 'adaptacao',
      originalActivityType: 'word_search',
    });
    const prompt = buildCanonicalActivityPrompt(request, { analysisText: 'A imagem mostra um caça-palavras com nomes de animais.' });
    expect(prompt).toContain('TIPO ORIGINAL DETECTADO: caça-palavras');
    expect(prompt).toContain('exercise.type="word_search"');
    expect(prompt).toContain('ADAPTAR NÃO É RECRIAR');
    expect(prompt).toContain('O professor NÃO pediu exercícios complementares');
  });

  it('prompt permite exercícios complementares somente quando o pedido explicita atividade mista/extras', () => {
    const request = extractCanonicalIntent('Adapte este caça-palavras e inclua exercícios complementares', {
      hasAttachment: true,
      requestTypeHint: 'adaptacao',
      originalActivityType: 'word_search',
    });
    const prompt = buildCanonicalActivityPrompt(request, { analysisText: 'A imagem mostra um caça-palavras.' });
    expect(request.allowSupplementaryExercises).toBe(true);
    expect(prompt).toContain('O professor pediu complementos/atividade mista');
  });

  it('guia do professor é descrito como apoio de aplicação da adaptação, não relatório diagnóstico', () => {
    const request = extractCanonicalIntent('adaptar atividade', {
      hasAttachment: true,
      requestTypeHint: 'adaptacao',
      originalActivityType: 'matching',
    });
    const prompt = buildCanonicalActivityPrompt(request, { analysisText: 'Atividade de ligar colunas.' });
    expect(prompt).toContain('MATERIAL DE APOIO À APLICAÇÃO');
    expect(prompt).toContain('Não transforme o Guia em relatório diagnóstico');
    expect(prompt).toContain('não exponha análise técnica da IA');
  });

  it('prompt de adaptação com tabela preserva organização tabular original', () => {
    const request = extractCanonicalIntent('Tabela de frações', {
      hasAttachment: true,
      requestTypeHint: 'adaptacao',
      originalActivityType: 'table',
    });
    const prompt = buildCanonicalActivityPrompt(request, { analysisText: 'A imagem mostra uma tabela para completar numerador e denominador.' });
    expect(prompt).toContain('TIPO ORIGINAL DETECTADO: tabela');
    expect(prompt).toContain('exercise.type="table"');
    expect(prompt).toContain('organização tabular original');
  });

  it('adaptação que perdeu caça-palavras aciona reparo e só cobra quando o tipo é preservado', async () => {
    const gen = vi.spyOn(AIService, 'generateIncluiLabActivitySchema');
    gen
      .mockResolvedValueOnce(buildSchemaJson(1, { exerciseType: 'short_answer', withGuide: true }))
      .mockResolvedValueOnce(buildSchemaJson(1, { exerciseType: 'word_search', withGuide: true }));
    const request = extractCanonicalIntent('Caça-palavras dos animais', {
      hasAttachment: true,
      requestTypeHint: 'adaptacao',
      originalActivityType: 'word_search',
    });

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_adaptacao_tipo' });

    expect(pkg.activity.exercises[0].type).toBe('word_search');
    expect(pkg.metadata.repairAttempts).toBe(1);
    expect(CreditTransactionService.atomicCommitReservedCredits).toHaveBeenCalledTimes(1);
  });

  it('adaptação de caça-palavras não aceita perguntas genéricas antes do formato original principal', async () => {
    const fragmented = buildSchemaObject(2, { withGuide: true });
    fragmented.exercises[0] = {
      id: 'exercise-1',
      type: 'short_answer',
      title: 'Pergunta genérica',
      prompt: 'Explique o que é uma fração.',
      options: [],
      answerLines: 3,
    };
    fragmented.exercises[1] = {
      id: 'exercise-2',
      type: 'word_search',
      title: 'Caça-palavras',
      prompt: 'Encontre as palavras.',
      options: ['METADE', 'TERÇO'],
      answerLines: 0,
      grid: ['METAD', 'EXXXX', 'TERCO'],
    };
    const gen = vi.spyOn(AIService, 'generateIncluiLabActivitySchema');
    gen
      .mockResolvedValueOnce(JSON.stringify(fragmented))
      .mockResolvedValueOnce(buildSchemaJson(1, { exerciseType: 'word_search', withGuide: true }));
    const request = extractCanonicalIntent('Caça-palavras dos animais', {
      hasAttachment: true,
      requestTypeHint: 'adaptacao',
      originalActivityType: 'word_search',
    });

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_adaptacao_principal' });

    expect(gen.mock.calls[1][0]).toContain('atividade principal deveria preservar word_search');
    expect(pkg.activity.exercises).toHaveLength(1);
    expect(pkg.activity.exercises[0].type).toBe('word_search');
    expect(pkg.metadata.repairAttempts).toBe(1);
  });

  it('adaptação de caça-palavras não aceita fragmentar o original em vários exercícios do mesmo tipo sem pedido explícito', async () => {
    const fragmented = buildSchemaObject(2, { exerciseType: 'word_search', withGuide: true });
    const gen = vi.spyOn(AIService, 'generateIncluiLabActivitySchema');
    gen
      .mockResolvedValueOnce(JSON.stringify(fragmented))
      .mockResolvedValueOnce(buildSchemaJson(1, { exerciseType: 'word_search', withGuide: true }));
    const request = extractCanonicalIntent('Caça-palavras dos animais', {
      hasAttachment: true,
      requestTypeHint: 'adaptacao',
      originalActivityType: 'word_search',
    });

    const pkg = await runCanonicalActivityPipeline({ request, user: baseUser, cost: 3, actionKey: 'test_adaptacao_fragmentada' });

    expect(gen.mock.calls[1][0]).toContain('fragmentou em 2 exercícios sem pedido explícito de complementares');
    expect(pkg.activity.exercises).toHaveLength(1);
    expect(pkg.activity.exercises[0].type).toBe('word_search');
    expect(pkg.metadata.repairAttempts).toBe(1);
  });
});

// Sprint 2B.3 (item 3): Gabarito é uma projeção separada — buildTeacherGuideMarkdown
// não deve mais anexar "## Gabarito" (isso agora é responsabilidade exclusiva do
// componente AnswerKeyRenderer).
describe('buildTeacherGuideMarkdown', () => {
  it('nunca inclui uma seção de Gabarito, mesmo quando answerKey está presente', () => {
    const pkg = {
      activity: {
        schemaVersion: '2.0' as const,
        header: { title: 'Atividade', theme: 'Tema', objective: 'Objetivo', instructions: [] },
        blocks: [],
        exercises: [{ id: 'exercise-1', type: 'short_answer' as const, title: 'Q1', prompt: 'Enunciado', options: [], answerLines: 3 }],
        visualAssets: [],
        accessibilityNotes: { supports: [], adaptations: [], teacherNotes: [] },
      },
      teacherGuide: {
        objetivo_da_aula: 'Objetivo real',
        metodologia_adaptada: 'Metodologia real',
        dicas_de_mediacao: [],
        criterios_de_avaliacao: [],
        materiais_necessarios: [],
        tempo_estimado: '30 minutos',
        adaptacoes_inclusivas: [],
      },
      answerKey: [{ exerciseId: 'exercise-1', answer: 'Resposta X' }],
      visualAssets: [],
      metadata: {
        schemaVersion: '2.0' as const, requestType: 'adaptacao' as const, generatedAt: new Date().toISOString(),
        repairAttempts: 0, visualMode: 'none' as const, visualModeSource: 'inferred_default' as const, studentContextUsed: false,
      },
      exportSettings: { pageSize: 'A4' as const, visualStyle: 'fundamental' as const },
    };

    const markdown = buildTeacherGuideMarkdown(pkg);
    expect(markdown).not.toContain('Gabarito');
    expect(markdown).not.toContain('Resposta X');
    expect(markdown).toContain('Objetivo real');
  });

  it('retorna string vazia quando não há teacherGuide (atividade/avaliação geral)', () => {
    const pkg = {
      activity: {
        schemaVersion: '2.0' as const,
        header: { title: 'Atividade', theme: 'Tema', objective: 'Objetivo', instructions: [] },
        blocks: [], exercises: [], visualAssets: [],
        accessibilityNotes: { supports: [], adaptations: [], teacherNotes: [] },
      },
      teacherGuide: undefined,
      visualAssets: [],
      metadata: {
        schemaVersion: '2.0' as const, requestType: 'atividade' as const, generatedAt: new Date().toISOString(),
        repairAttempts: 0, visualMode: 'none' as const, visualModeSource: 'inferred_default' as const, studentContextUsed: false,
      },
      exportSettings: { pageSize: 'A4' as const, visualStyle: 'fundamental' as const },
    };

    expect(buildTeacherGuideMarkdown(pkg)).toBe('');
  });
});
