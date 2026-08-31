/**
 * canonicalActivityPipeline.ts — Sprint 2B
 *
 * Activity Pipeline canônico. Escopo: 'atividade' | 'avaliacao' | 'adaptacao'.
 * NÃO cobre relatório, planejamento, ficha, texto geral, Word ou imagem geral
 * (esses ficam para Document Pipeline / Image Pipeline, ainda não implementados).
 *
 * Fluxo:
 *   IntentExtractor → CanonicalGenerationRequest
 *   → RESERVE créditos (RPC atômica já existente)
 *   → gera JSON via IA (mesmo canal AIService.generateIncluiLabActivitySchema
 *     usado hoje pelo IncluiLAB — nenhuma chamada de IA nova, nenhum ai-gateway novo)
 *   → parse estrito + validateActivitySchema (estrutura)
 *   → validateAgainstRequest (coerência com o pedido: quantidade, guia, gabarito, visualMode)
 *   → se inválido: UMA tentativa de reparo (novo prompt com os problemas listados)
 *   → se ainda inválido: erro explícito + RELEASE da reserva (sem cobrança)
 *   → se válido: monta ActivityPackage e COMMIT da reserva
 *
 * Este pipeline só é executado quando INCLUILAB_CANONICAL_PIPELINE === true.
 * Com a flag desligada, o fluxo legado do IncluiLabView.tsx continua intacto.
 */
import { AIService, cleanJsonString, friendlyAIError } from '../aiService';
import { isActivitySchemaValidationError, validateActivitySchema } from '../../utils/validateActivitySchema';
import { runReservedCreditFlow } from './creditReservationFlow';
import {
  validateAgainstRequest,
  type ValidationIssue,
} from './validateAgainstRequest';
import { formatStudentPedagogicalContextForPrompt } from './studentPedagogicalContext';
import type {
  ActivityAnswerKeyItem,
  ActivityPackage,
  ActivitySchema,
  CanonicalGenerationRequest,
  User,
} from '../../types';

export class CanonicalPipelineError extends Error {
  stage: 'ai_call' | 'schema_validation' | 'repair_failed';
  issues?: ValidationIssue[];
  constructor(message: string, stage: CanonicalPipelineError['stage'], issues?: ValidationIssue[]) {
    super(message);
    this.name = 'CanonicalPipelineError';
    this.stage = stage;
    this.issues = issues;
  }
}

// ─── Contrato de prompt ─────────────────────────────────────────────────────

const REQUEST_TYPE_LABEL: Record<CanonicalGenerationRequest['requestType'], string> = {
  atividade: 'uma ATIVIDADE pedagógica estruturada',
  avaliacao: 'uma AVALIAÇÃO (a atividade PRECISA vir acompanhada de gabarito/answerKey)',
  adaptacao: 'a ADAPTAÇÃO de uma atividade original para um formato inclusivo',
};

const ORIGINAL_TYPE_LABEL: Record<NonNullable<CanonicalGenerationRequest['originalActivityType']>, string> = {
  word_search: 'caça-palavras',
  crossword: 'cruzadinha',
  multiple_choice: 'múltipla escolha',
  open_questions: 'questões abertas/discursivas',
  matching: 'ligar colunas/associação',
  fill_blank: 'completar lacunas',
  coloring: 'colorir',
  table: 'tabela',
  mixed: 'atividade mista',
  other: 'outro formato',
};

function buildVisualModeInstruction(request: CanonicalGenerationRequest): string {
  if (request.visualMode === 'illustration') {
    return `O professor pediu ILUSTRAÇÃO REAL de um tema específico ("visualMode": "illustration"). ` +
      `Este pipeline NÃO tem acesso a geração paga de imagem — portanto NÃO preencha "url" em visualAssets ` +
      `(deixe ausente). Descreva o que seria ilustrado em "description" e "imagePrompt" normalmente. ` +
      `NUNCA afirme, em nenhum campo de texto (guia, instruções, footer), que uma ilustração real foi entregue — ` +
      `trate como apoio visual pendente.`;
  }
  if (request.visualMode === 'pictogram') {
    return `O professor pediu apoio visual simbólico ("visualMode": "pictogram"). Preencha visualAssets com ` +
      `"fallbackEmoji" e descrições curtas — não é necessário (nem possível) gerar imagem real.`;
  }
  return `Sem pedido de apoio visual explícito — inclua visualAssets apenas se ajudar a compreensão, sempre via "fallbackEmoji".`;
}

function buildQuestionCountInstruction(request: CanonicalGenerationRequest): string {
  if (request.requestedQuestionCount != null) {
    return `A atividade DEVE conter EXATAMENTE ${request.requestedQuestionCount} item(ns) em "exercises" — nem mais, nem menos.`;
  }
  return `O professor não especificou quantidade — gere entre 4 e 6 itens em "exercises".`;
}

function buildBaseTextInstruction(request: CanonicalGenerationRequest): string {
  if (!request.requiresBaseText) return '';
  const lengthRule = (() => {
    const constraint = request.baseTextConstraint;
    if (constraint) {
      const unitLabel = constraint.unit === 'words' ? 'palavras' : 'caracteres';
      if (constraint.target) {
        return ` com alvo de aproximadamente ${constraint.target} ${unitLabel}; mantenha variação pequena, em torno de 10%`;
      }
      if (constraint.min != null && constraint.max != null) {
        return ` entre ${constraint.min} e ${constraint.max} ${unitLabel}`;
      }
      if (constraint.max != null) {
        return ` com no máximo ${constraint.max} ${unitLabel}`;
      }
      if (constraint.min != null) {
        return ` com pelo menos ${constraint.min} ${unitLabel}`;
      }
    }
    if (request.baseTextSize === 'small') {
      return ' pequeno/curto, com alvo aproximado de 1.000 caracteres';
    }
    if (request.baseTextSize === 'medium') {
      return ' médio, com alvo aproximado de 2.200 caracteres';
    }
    if (request.baseTextSize === 'large') {
      return ' grande/longo, com alvo aproximado de 4.000 caracteres';
    }
    return ' com extensão suficiente para servir de leitura introdutória';
  })();
  return `O professor pediu TEXTO para leitura. Inclua OBRIGATORIAMENTE em "blocks" um bloco type="instructions", id="base-text-1", title="Texto introdutório" e content com um texto-base${lengthRule}. As questões devem trabalhar preferencialmente informações, vocabulário e ideias desse texto, não serem desconectadas.`;
}

function buildOriginalTypeInstruction(request: CanonicalGenerationRequest): string {
  if (request.requestType !== 'adaptacao' || !request.originalActivityType || request.originalActivityType === 'other') {
    return '';
  }
  const label = ORIGINAL_TYPE_LABEL[request.originalActivityType];
  const typeRule = (() => {
    switch (request.originalActivityType) {
      case 'word_search':
        return 'Use pelo menos um exercise.type="word_search"; coloque as palavras-alvo em "options" e, se possível, a grade em "grid" como array de linhas.';
      case 'crossword':
        return 'Use pelo menos um exercise.type="crossword"; coloque pistas em "clues", respostas/palavras em "options" e, se possível, a grade em "grid".';
      case 'matching':
        return 'Use exercise.type="matching" para preservar a associação/ligar colunas.';
      case 'fill_blank':
        return 'Use exercise.type="fill_blank" para preservar lacunas.';
      case 'multiple_choice':
        return 'Use exercise.type="multiple_choice" e mantenha alternativas objetivas.';
      case 'open_questions':
        return 'Use exercise.type="short_answer" para preservar perguntas abertas.';
      case 'coloring':
        return 'Use exercise.type="coloring" ou "drawing" e preserve o espaço visual de colorir/desenhar.';
      case 'table':
        return 'Use pelo menos um exercise.type="table"; coloque os itens/linhas principais em "options" e preserve a organização tabular original.';
      default:
        return 'Preserve a mistura de formatos do original; não reduza tudo a perguntas abertas.';
    }
  })();
  const supplementaryRule = request.allowSupplementaryExercises
    ? 'O professor pediu complementos/atividade mista; você pode incluir exercícios suplementares, claramente secundários, sem substituir o formato principal.'
    : 'O professor NÃO pediu exercícios complementares: retorne uma única atividade principal nesse formato, sem acrescentar lista de perguntas, múltipla escolha, completar ou outros formatos extras.';
  return `\nTIPO ORIGINAL DETECTADO: ${label}. ADAPTAR NÃO É RECRIAR. ${typeRule} ${supplementaryRule} Se for impossível preservar exatamente, explique a limitação em supportHint, mas não converta silenciosamente para lista genérica de perguntas.`;
}

function buildStudentContextInstruction(request: CanonicalGenerationRequest): string {
  if (request.requestType !== 'adaptacao') {
    if (!request.studentContext) return '';
    return `Use o CONTEXTO DO ALUNO apenas como orientação pedagógica real. Ajuste complexidade, tamanho das instruções, carga textual, tipo de resposta, apoio visual, nível de autonomia, mediação, quantidade de estímulos e organização da tarefa conforme os registros disponíveis. Não diagnostique, não invente características ausentes e não exponha análise técnica.`;
  }

  const hasContext = !!request.studentPedagogicalContext?.hasContext;
  const insufficient = !hasContext || !!request.studentPedagogicalContext?.isInsufficient;
  return [
    'ADAPTAÇÃO PEDAGÓGICA REAL:',
    '- Primeiro identifique o objetivo central da atividade original e preserve esse objetivo sempre que pedagogicamente possível.',
    '- Mude principalmente a forma de apresentar, explicar, organizar, responder, apoiar e avaliar; não reduza conteúdo automaticamente.',
    '- Não baseie a adaptação somente em diagnóstico. Diagnóstico informado é contexto cadastral, não estratégia pedagógica.',
    '- Use apenas dados funcionais disponíveis. Não invente idade, preferências, barreiras, habilidades, laudos, PEI/PAEE ou registros ausentes.',
    '- Mantenha adequação à idade cronológica e evite infantilização. Linguagem acessível não significa linguagem infantil.',
    '- Se houver quantidade solicitada, preserve a quantidade; se precisar dividir, organize em blocos/etapas sem reduzir silenciosamente.',
    '- Para 8 ou mais questões, organize a Folha do Aluno em Parte 1 e Parte 2, com pausa curta entre os blocos; mantenha todos os itens solicitados.',
    '- Se houver texto-base longo, segmente em blocos menores com títulos curtos e sem sintaxe Markdown visível.',
    '- Escolha somente adaptações úteis: comandos segmentados, exemplos, vocabulário explicado, apoio visual indicado, forma alternativa de resposta, organização em blocos, mediação e avaliação compatível.',
    '- Se alterar a forma de resposta ou estrutura original, preserve o objetivo e justifique claramente no Guia do Professor.',
    insufficient
      ? '- Contexto individual insuficiente: produza uma adaptação geral com DUA/acessibilidade e diga no Guia que faltam dados individuais para personalização.'
      : '- Contexto individual disponível: use evidências funcionais concretas do resumo pedagógico para decidir apoios, comandos, organização e forma de resposta.',
  ].join('\n');
}

function buildAdaptationGuideInstruction(request: CanonicalGenerationRequest): string {
  if (request.requestType !== 'adaptacao') return '';
  return [
    'GUIA DO PROFESSOR CONECTADO:',
    '- O Guia deve caber em uma página A4, com linguagem objetiva, tópicos curtos, sem repetição e sem reproduzir integralmente o contexto do aluno.',
    '- objetivo_da_aula: até 2 linhas; descreva o objetivo preservado e o que o aluno deve demonstrar.',
    '- adaptacoes_inclusivas: até 5 tópicos, cada um com adaptação aplicada e motivo pedagógico concreto.',
    '- metodologia_adaptada: até 5 passos curtos de aplicação desta atividade.',
    '- dicas_de_mediacao: até 4 tópicos sobre apoios e formas de resposta, dizendo onde aplicar.',
    '- criterios_de_avaliacao: até 4 critérios observáveis ligados ao objetivo.',
    '- materiais_necessarios: liste apenas materiais indispensáveis.',
    '- Se o contexto individual for insuficiente, registre essa limitação e sugira que o professor refine com dados funcionais.',
  ].join('\n');
}

export function buildCanonicalActivityPrompt(
  request: CanonicalGenerationRequest,
  opts: { analysisText?: string } = {},
): string {
  const contextLines: string[] = [];
  if (request.discipline) contextLines.push(`Disciplina: ${request.discipline}`);
  if (request.grade) contextLines.push(`Série/Ano: ${request.grade}`);
  if (request.difficulty) contextLines.push(`Dificuldade: ${request.difficulty}`);
  if (request.requestType === 'adaptacao') {
    contextLines.push(`Contexto pedagógico funcional do aluno:\n${formatStudentPedagogicalContextForPrompt(request.studentPedagogicalContext)}`);
  } else if (request.studentContext) {
    contextLines.push(`Contexto do aluno (opcional, use se ajudar a personalizar):\n${request.studentContext}`);
  }
  if (opts.analysisText) contextLines.push(`Conteúdo da atividade original (extraído para adaptação):\n${opts.analysisText.slice(0, 1400)}`);

  const answerKeyContract = request.requestType === 'avaliacao'
    ? `,\n  "answerKey": [\n    { "exerciseId": "exercise-1", "answer": "Resposta correta objetiva", "explanation": "Opcional" }\n  ]`
    : '';

  const answerKeyRule = request.requestType === 'avaliacao'
    ? `\n- OBRIGATÓRIO: retorne "answerKey" com um item por exercício, cada "exerciseId" IGUAL ao "id" do exercício correspondente em "exercises". Não invente gabarito solto — ele precisa corresponder exatamente aos exercícios retornados.`
    : '';

  // Sprint 2B.3 (item 2): Guia do Professor só existe para requestType === 'adaptacao'.
  // Para 'atividade'/'avaliacao' gerais, o campo nem é oferecido no contrato — e a
  // regra abaixo instrui explicitamente a IA a não incluí-lo por conta própria.
  const isAdaptacao = request.requestType === 'adaptacao';
  const guiaContract = isAdaptacao
    ? `,\n  "guia_pedagogico": {\n    "objetivo_da_aula": "Objetivo real, específico para ESTA atividade (nunca genérico)",\n    "metodologia_adaptada": "Como aplicar ESTA atividade específica em sala",\n    "dicas_de_mediacao": ["Dica baseada nos exercícios reais desta atividade"],\n    "criterios_de_avaliacao": ["Critério baseado nos exercícios reais"],\n    "materiais_necessarios": ["Material necessário para ESTA atividade"],\n    "tempo_estimado": "ex.: 30 a 45 minutos",\n    "adaptacoes_inclusivas": ["Adaptação específica para o tema/exercícios desta atividade"]\n  }`
    : '';
  const guiaRule = isAdaptacao
    ? `\n- "guia_pedagogico" é OBRIGATÓRIO aqui (é uma adaptação) e deve ser MATERIAL DE APOIO À APLICAÇÃO da atividade adaptada: objetivo da atividade, objetivo da adaptação, tempo, materiais, como aplicar, estratégias de mediação, apoios recomendados, adaptações feitas, critérios de observação/avaliação e sugestões se houver dificuldade. Não transforme o Guia em relatório diagnóstico, não exponha análise técnica da IA e não invente dados do aluno.`
    : `\n- NÃO inclua o campo "guia_pedagogico" neste JSON. Este pedido é uma atividade/avaliação geral, não uma adaptação — não há Guia do Professor neste caso.`;

  return `Você é especialista em educação inclusiva e desenho de atividades escolares para impressão (IncluiLAB).

Gere ${REQUEST_TYPE_LABEL[request.requestType]} sobre: "${request.topic}".
${contextLines.length ? '\n' + contextLines.join('\n') + '\n' : ''}
${buildQuestionCountInstruction(request)}
${buildVisualModeInstruction(request)}
${buildOriginalTypeInstruction(request)}
${buildBaseTextInstruction(request)}
${buildStudentContextInstruction(request)}
${buildAdaptationGuideInstruction(request)}

RETORNE APENAS JSON válido. Não use Markdown. Não escreva texto antes ou depois do JSON.

Use exatamente este contrato:
{
  "header": {
    "title": "Título grande e claro",
    "theme": "Tema/disciplina",
    "objective": "Objetivo pedagógico real desta atividade",
    "level": "Ano/série",
    "estimatedTime": "ex.: 30 minutos",
    "instructions": ["Instrução curta 1", "Instrução curta 2"]
  },
  "blocks": [
    {
      "id": "base-text-1",
      "type": "instructions",
      "title": "Texto introdutório",
      "content": "Texto-base solicitado pelo professor, quando houver",
      "items": [],
      "visualAssetIds": []
    }
  ],
  "exercises": [
    {
      "id": "exercise-1",
      "type": "multiple_choice",
      "title": "Questão 1",
      "prompt": "Enunciado claro e objetivo",
      "options": ["Opção A", "Opção B", "Opção C", "Opção D"],
      "answerLines": 0,
      "supportHint": "Dica opcional de apoio",
      "visualAssetId": null,
      "grid": ["Opcional: linhas da grade para caça-palavras/cruzadinha"],
      "clues": ["Opcional: pistas para cruzadinha"]
    }
  ],
  "visualAssets": [
    {
      "id": "visual-1",
      "type": "placeholder",
      "title": "Nome do recurso visual",
      "description": "O que o recurso representa",
      "altText": "Texto alternativo",
      "imagePrompt": "Descrição para eventual geração futura",
      "fallbackEmoji": "🖼️"
    }
  ],
  "accessibilityNotes": {
    "supports": ["Apoio 1"],
    "adaptations": ["Adaptação 1"],
    "teacherNotes": ["Nota 1"]
  }${guiaContract}${answerKeyContract}
}

Tipos válidos de exercise.type: multiple_choice | short_answer | fill_blank | matching | drawing | ordering | word_search | crossword | coloring | table.

Regras obrigatórias:${guiaRule}
- Todo "id" de exercise precisa ser único.
- Se não houver pedido de texto/leitura, "blocks" pode ser [].
- Folha do aluno: linguagem revisada, adequada à série informada, sem poluição visual.
- Não inclua metodologia/BNCC dentro dos exercícios.${answerKeyRule}
- Retorne somente o JSON acima, sem comentários.`;
}

export function buildRepairPrompt(originalPrompt: string, issues: ValidationIssue[], previousRawJson: string): string {
  const issuesList = issues.map(i => `- ${i.message}`).join('\n');
  return `${originalPrompt}

---
ATENÇÃO: uma tentativa anterior gerou um JSON com os seguintes problemas, que precisam ser corrigidos AGORA:
${issuesList}

JSON anterior (para referência do que corrigir — não repita os mesmos erros):
${previousRawJson.slice(0, 4000)}

Gere novamente o JSON COMPLETO, corrigindo exatamente os problemas acima, seguindo o mesmo contrato. Retorne apenas o JSON.`;
}

// ─── Extração do answerKey (campo aditivo, fora do contrato de validateActivitySchema) ─

function extractAnswerKeyFromRaw(rawJsonText: string): ActivityAnswerKeyItem[] | undefined {
  let root: any;
  try {
    root = JSON.parse(rawJsonText);
  } catch {
    return undefined;
  }
  const raw = root?.answerKey ?? root?.answer_key ?? root?.gabarito;
  if (!Array.isArray(raw)) return undefined;

  const items: ActivityAnswerKeyItem[] = raw
    .filter((x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x: Record<string, unknown>): ActivityAnswerKeyItem => {
      const numbered = Number(x.numero ?? x.number ?? x.questao ?? x.questão);
      return {
        exerciseId: String(x.exerciseId ?? x.exercise_id ?? (Number.isFinite(numbered) && numbered > 0 ? `exercise-${Math.round(numbered)}` : '')).trim(),
        answer: String(x.answer ?? x.resposta ?? x.correctAnswer ?? x.correct_answer ?? '').trim(),
        explanation: (x.explanation ?? x.explicacao)
          ? String(x.explanation ?? x.explicacao).trim()
          : undefined,
      };
    })
    .filter((item: ActivityAnswerKeyItem) => !!item.exerciseId && !!item.answer);

  return items.length > 0 ? items : undefined;
}

// ─── Geração + parsing de uma tentativa ─────────────────────────────────────

interface GenerateOnceResult {
  schema: ActivitySchema;
  answerKey?: ActivityAnswerKeyItem[];
  rawJson: string;
}

async function generateOnce(prompt: string, user: User): Promise<GenerateOnceResult> {
  let raw: string;
  try {
    raw = await AIService.generateIncluiLabActivitySchema(prompt, user);
  } catch (e) {
    throw new CanonicalPipelineError(`Falha ao chamar IA: ${friendlyAIError(e)}`, 'ai_call');
  }

  const cleaned = cleanJsonString(raw);

  let schema: ActivitySchema;
  try {
    schema = validateActivitySchema(cleaned);
  } catch (e) {
    const message = isActivitySchemaValidationError(e)
      ? e.message
      : 'A IA retornou um formato inválido para a atividade.';
    throw new CanonicalPipelineError(message, 'schema_validation');
  }

  const answerKey = extractAnswerKeyFromRaw(cleaned);
  return { schema, answerKey, rawJson: cleaned };
}

/**
 * Marca cada visualAsset com o que foi REALMENTE entregue (fato objetivo: tem url ou não),
 * nunca confiando na palavra da IA sobre isso — evita apresentar pictograma como ilustração real.
 *
 * Sprint 2B.3 (item 2): também aplica a regra definitiva de Guia do Professor —
 * `guia_pedagogico` só sobrevive no schema final quando `requestType === 'adaptacao'`.
 * Isso vale mesmo que a IA tenha incluído um `guia_pedagogico` por conta própria
 * (o prompt já instrui a não incluir, mas esta é a garantia estrutural: o dado
 * nunca chega ao ActivityPackage/Biblioteca/UI fora de adaptação).
 */
function finalizeSchema(
  schema: ActivitySchema,
  request: CanonicalGenerationRequest,
  answerKey: ActivityAnswerKeyItem[] | undefined,
): ActivitySchema {
  const visualAssets = schema.visualAssets.map(asset => ({
    ...asset,
    deliveredAs: (asset.url ? 'illustration' : 'pictogram_fallback') as 'illustration' | 'pictogram_fallback',
  }));
  const isAdaptacao = request.requestType === 'adaptacao';

  return {
    ...schema,
    schemaVersion: '2.0',
    requestType: request.requestType,
    guia_pedagogico: isAdaptacao ? schema.guia_pedagogico : undefined,
    answerKey: request.requestType === 'avaliacao' ? answerKey : undefined,
    visualAssets,
  };
}

// ─── Orquestração principal ─────────────────────────────────────────────────
//
// Sprint 2B.3 (item 9) — sequência financeira, documentada explicitamente:
//   1. RESERVE  — atomic_reserve_credits (runReservedCreditFlow)
//   2. GENERATE — chamada(s) de IA (generateOnce, com no máx. 1 reparo)
//   3. VALIDATE — validateActivitySchema + validateAgainstRequest
//   4. COMMIT   — atomic_commit_reserved_credits, SOMENTE se (3) passou
//      ou RELEASE — atomic_release_reserved_credits, se (2)/(3) falharem
//
// O COMMIT acontece assim que o conteúdo é validado — ANTES de qualquer
// renderização na UI, exportação de PDF/PNG, ou salvamento na Biblioteca.
// O autosave na Biblioteca (ver IncluiLabView.tsx, generateA4EconomicaCanonical/
// generateAdaptarEconomicoCanonical) roda LOGO DEPOIS do COMMIT, como um passo
// separado — se o autosave falhar, os créditos já foram cobrados (o conteúdo
// gerado era válido) e o professor recebe um erro visível, mas SEM estorno
// automático neste sprint (não implementado por decisão explícita do escopo).
export interface RunCanonicalActivityPipelineParams {
  request: CanonicalGenerationRequest;
  user: User;
  /** Custo em créditos — reutiliza os valores já existentes em INCLUILAB_ACTIVITY_COSTS (nenhum preço novo). */
  cost: number;
  /** Prefixo do operationId (auditoria) — ex.: 'incluilab_canonical_atividade'. */
  actionKey: string;
  /** Presente apenas para requestType === 'adaptacao' (texto extraído da imagem original). */
  analysisText?: string;
}

export async function runCanonicalActivityPipeline(params: RunCanonicalActivityPipelineParams): Promise<ActivityPackage> {
  const { request, user, cost, actionKey, analysisText } = params;

  return runReservedCreditFlow<ActivityPackage>({
    user,
    amount: cost,
    actionKey,
    description: `IncluiLAB Activity Pipeline — ${request.requestType}`,
    metadata: {
      requestType: request.requestType,
      topic: request.topic,
      visualMode: request.visualMode,
      requestedQuestionCount: request.requestedQuestionCount ?? null,
      hasStudentContext: !!request.studentContext,
      originalActivityType: request.originalActivityType ?? null,
      allowSupplementaryExercises: !!request.allowSupplementaryExercises,
    },
    work: async () => {
      const prompt = buildCanonicalActivityPrompt(request, { analysisText });

      let attempt = await generateOnce(prompt, user);
      let finalized = finalizeSchema(attempt.schema, request, attempt.answerKey);
      let check = validateAgainstRequest(finalized, finalized.answerKey, request);
      let repairAttempts = 0;

      if (!check.valid) {
        repairAttempts = 1; // máximo de UMA tentativa de reparo
        const repairPrompt = buildRepairPrompt(prompt, check.issues, attempt.rawJson);
        attempt = await generateOnce(repairPrompt, user);
        finalized = finalizeSchema(attempt.schema, request, attempt.answerKey);
        check = validateAgainstRequest(finalized, finalized.answerKey, request);

        if (!check.valid) {
          // Falhou de novo após o único reparo permitido: erro explícito, sem cobrança
          // (o `throw` aqui faz runReservedCreditFlow liberar a reserva automaticamente).
          throw new CanonicalPipelineError(
            `A atividade não passou na validação mesmo após reparo: ${check.issues.map(i => i.message).join(' | ')}`,
            'repair_failed',
            check.issues,
          );
        }
      }

      const activityPackage: ActivityPackage = {
        activity: finalized,
        // Sprint 2B.3 (item 2): opcional — só existe quando requestType === 'adaptacao'
        // (finalizeSchema já garante que finalized.guia_pedagogico é undefined nos demais casos).
        teacherGuide: finalized.guia_pedagogico,
        answerKey: finalized.answerKey,
        visualAssets: finalized.visualAssets,
        metadata: {
          schemaVersion: '2.0',
          requestType: request.requestType,
          generatedAt: new Date().toISOString(),
          repairAttempts,
          visualMode: request.visualMode,
          visualModeSource: request.visualModeSource,
          studentContextUsed: !!request.studentContext,
        },
        exportSettings: {
          pageSize: 'A4',
          visualStyle: request.requestedVisualStyle === 'preto_e_branco' ? 'pb' : 'fundamental',
          outputFormat: request.outputFormat,
          requestedVisualStyle: request.requestedVisualStyle,
          normalizedOutputFormatNotice: request.normalizedOutputFormatNotice,
        },
      };

      return activityPackage;
    },
  });
}

/**
 * Constrói o Markdown do Guia do Professor — SOMENTE o guia.
 *
 * Sprint 2B.3 (item 3): o Gabarito deixou de ser anexado aqui. Guia e Gabarito
 * são duas projeções independentes do mesmo ActivityPackage — o Gabarito tem
 * seu próprio componente de renderização (`AnswerKeyRenderer`,
 * `src/components/incluilab/AnswerKeyRenderer.tsx`), com seu próprio layout,
 * largura controlada e ref de exportação. Não fundir os dois de novo.
 *
 * Retorna string vazia se não houver `teacherGuide` (ex.: requestType !== 'adaptacao') —
 * o chamador deve checar `pkg.teacherGuide` antes de usar isto para decidir se a
 * aba/seção de Guia deve existir.
 */
export function buildTeacherGuideMarkdown(pkg: ActivityPackage): string {
  const g = pkg.teacherGuide;
  if (!g) return '';
  const lines: string[] = ['# Guia do Professor'];
  lines.push(`\n## Objetivo da atividade\n${clipGuideText(g.objetivo_da_aula, 36)}`);
  const adaptations = compactGuideItems(g.adaptacoes_inclusivas, 5, 26);
  if (adaptations.length) lines.push(`\n## Adaptações aplicadas\n${adaptations.map(a => `- ${a}`).join('\n')}`);
  const steps = compactGuideItems(splitGuideSentences(g.metodologia_adaptada), 5, 28);
  if (steps.length) lines.push(`\n## Como aplicar\n${steps.map(s => `- ${s}`).join('\n')}`);
  const supports = compactGuideItems(g.dicas_de_mediacao, 4, 28);
  if (supports.length) lines.push(`\n## Apoios e formas de resposta\n${supports.map(s => `- ${s}`).join('\n')}`);
  const observations = compactGuideItems(g.criterios_de_avaliacao, 4, 26);
  if (observations.length) lines.push(`\n## O que observar\n${observations.map(o => `- ${o}`).join('\n')}`);
  lines.push('\n## Ampliação ou nova tentativa\n- Se houver dificuldade, retome um exemplo e reduza uma etapa de cada vez.\n- Para ampliar, mantenha o objetivo e aumente gradualmente a autonomia.');

  return lines.join('');
}

function splitGuideSentences(text: string): string[] {
  return stripMarkdown(text)
    .split(/\n+|(?<=[.!?])\s+/)
    .map(item => item.replace(/^•\s*/, '').replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
}

function compactGuideItems(values: string[], maxItems: number, maxWords: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = clipGuideText(value, maxWords);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= maxItems) break;
  }
  return result;
}

function clipGuideText(value: string, maxWords: number): string {
  const clean = stripMarkdown(value).replace(/\s+/g, ' ').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return clean;
  return `${words.slice(0, maxWords).join(' ')}.`;
}

function stripMarkdown(value: string): string {
  return String(value ?? '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/(^|\s)#{1,6}\s+([A-Za-zÀ-ÿ])/g, '$1$2')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/(^|[\s([{"'“])\*([^*\n]+)\*(?=$|[\s)\].,;:!?"'”}])/g, '$1$2')
    .replace(/(^|[\s([{"'“])_([^_\n]+)_(?=$|[\s)\].,;:!?"'”}])/g, '$1$2')
    .replace(/\*\*+/g, '')
    .replace(/__+/g, '')
    .trim();
}
