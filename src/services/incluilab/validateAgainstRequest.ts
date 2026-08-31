/**
 * validateAgainstRequest.ts — Sprint 2B
 *
 * Segunda camada de validação do Activity Pipeline canônico.
 * `validateActivitySchema` (já existente) garante ESTRUTURA (JSON bem formado,
 * campos obrigatórios presentes). Esta função garante COERÊNCIA com o que o
 * professor pediu (`CanonicalGenerationRequest`): quantidade exata de
 * questões, guia real, gabarito coerente, visualMode não-mentiroso.
 *
 * Função pura — não faz I/O nem chamadas de IA.
 */
import type {
  ActivityAnswerKeyItem,
  ActivitySchema,
  CanonicalGenerationRequest,
  GuiaPedagogico,
} from '../../types';

export type ValidationIssueCode =
  | 'question_count_mismatch'
  | 'duplicate_exercise_id'
  | 'guide_missing'
  | 'answer_key_missing'
  | 'answer_key_id_mismatch'
  | 'answer_key_count_mismatch'
  | 'visual_mode_claim_mismatch'
  | 'original_type_not_preserved'
  | 'original_primary_type_not_preserved'
  | 'original_activity_fragmented'
  | 'unexpected_supplementary_exercises'
  | 'base_text_missing'
  | 'base_text_too_short'
  | 'base_text_too_long'
  | 'missing_required_visual_asset'
  | 'adaptation_objective_weak'
  | 'adaptation_context_not_used'
  | 'adaptation_insufficient_context_not_declared'
  | 'adaptation_guide_disconnected'
  | 'adaptation_generic_guidance'
  | 'adaptation_accessible_response_missing'
  | 'adaptation_progression_missing'
  | 'adaptation_structural_change_unjustified'
  | 'adaptation_infantilization_risk';

export interface ValidationIssue {
  code: ValidationIssueCode;
  message: string;
}

export interface ValidateAgainstRequestResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export function isRealGuide(guide?: GuiaPedagogico): guide is GuiaPedagogico {
  if (!guide) return false;
  return !!(guide.objetivo_da_aula?.trim() && guide.metodologia_adaptada?.trim());
}

export function validateAgainstRequest(
  schema: ActivitySchema,
  answerKey: ActivityAnswerKeyItem[] | undefined,
  request: CanonicalGenerationRequest,
): ValidateAgainstRequestResult {
  const issues: ValidationIssue[] = [];
  const exerciseIds = schema.exercises.map(e => e.id);

  // 1. Quantidade exata de questões (quando o professor pediu um número específico)
  if (request.requestedQuestionCount != null && schema.exercises.length !== request.requestedQuestionCount) {
    issues.push({
      code: 'question_count_mismatch',
      message: `Usuário pediu ${request.requestedQuestionCount} questão(ões), mas a atividade veio com ${schema.exercises.length}.`,
    });
  }

  if (request.requiresBaseText) {
    const baseText = findBaseText(schema);
    if (!baseText) {
      issues.push({
        code: 'base_text_missing',
        message: 'O professor pediu texto/texto-base, mas a atividade veio sem bloco de texto introdutório em blocks.',
      });
    } else {
      const range = getBaseTextExpectedRange(request);
      const actualLength = range.unit === 'words' ? countWords(baseText) : baseText.length;
      const unitLabel = range.unit === 'words' ? 'palavras' : 'caracteres';
      if (actualLength < range.min) {
        issues.push({
          code: 'base_text_too_short',
          message: `O texto-base retornado tem ${actualLength} ${unitLabel}, abaixo do mínimo esperado (${range.min}) para o tamanho solicitado.`,
        });
      }
      if (range.max && actualLength > range.max) {
        issues.push({
          code: 'base_text_too_long',
          message: `O texto-base retornado tem ${actualLength} ${unitLabel}, acima do máximo esperado (${range.max}) para o tamanho solicitado.`,
        });
      }
    }
  }

  // 2. IDs de exercício únicos e coerentes
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of exerciseIds) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  if (duplicates.size > 0) {
    issues.push({
      code: 'duplicate_exercise_id',
      message: `IDs de exercício duplicados: ${[...duplicates].join(', ')}.`,
    });
  }

  // 3. Guia do professor — Sprint 2B.3 (item 2): regra definitiva de produto.
  // Só é obrigatório (e só faz sentido existir) quando requestType === 'adaptacao'.
  // Para 'atividade'/'avaliacao' gerais, o Guia NUNCA é gerado automaticamente —
  // não exigimos nem penalizamos a ausência dele nesses casos.
  if (request.requestType === 'adaptacao' && !isRealGuide(schema.guia_pedagogico)) {
    issues.push({
      code: 'guide_missing',
      message: 'Guia do professor ausente ou incompleto (faltam objetivo_da_aula/metodologia_adaptada baseados na atividade real) — obrigatório para adaptação.',
    });
  }
  if (request.requestType === 'adaptacao' && isRealGuide(schema.guia_pedagogico)) {
    issues.push(...validatePedagogicalAdaptation(schema, request));
  }

  // 4. Gabarito obrigatório e coerente para requestType = 'avaliacao'
  if (request.requestType === 'avaliacao') {
    if (!answerKey || answerKey.length === 0) {
      issues.push({
        code: 'answer_key_missing',
        message: 'requestType=avaliacao exige answerKey, mas nenhum foi retornado pela IA.',
      });
    } else {
      const validIds = new Set(exerciseIds);
      const invalidRefs = answerKey.filter(item => !validIds.has(item.exerciseId));
      if (invalidRefs.length > 0) {
        issues.push({
          code: 'answer_key_id_mismatch',
          message: `answerKey referencia exerciseId inexistente em exercises: ${invalidRefs.map(i => i.exerciseId).join(', ')}.`,
        });
      }
      if (answerKey.length !== schema.exercises.length) {
        issues.push({
          code: 'answer_key_count_mismatch',
          message: `answerKey tem ${answerKey.length} item(ns), mas há ${schema.exercises.length} exercício(s) — quantidade precisa ser coerente.`,
        });
      }
    }
  }

  // 5. visualMode = 'illustration' não pode ser satisfeito com um fallback silencioso
  if (request.visualMode === 'illustration') {
    const falseClaims = schema.visualAssets.filter(a => a.deliveredAs === 'illustration' && !a.url);
    if (falseClaims.length > 0) {
      issues.push({
        code: 'visual_mode_claim_mismatch',
        message: `${falseClaims.length} asset(s) marcados como 'illustration' sem url real — isso apresentaria pictograma como se fosse ilustração entregue.`,
      });
    }
  }

  const visualReferenceIssues = findMissingRequiredVisualAssets(schema);
  for (const exerciseId of visualReferenceIssues) {
    issues.push({
      code: 'missing_required_visual_asset',
      message: `O exercício ${exerciseId} pede para observar/analisar recurso visual, mas não referencia um asset visual existente.`,
    });
  }

  if (request.requestType === 'adaptacao' && request.originalActivityType) {
    const expectedTypes = expectedExerciseTypesForOriginal(request.originalActivityType);
    if (expectedTypes.length > 0 && !schema.exercises.some(ex => expectedTypes.includes(ex.type))) {
      issues.push({
        code: 'original_type_not_preserved',
        message: `A atividade original foi identificada como ${request.originalActivityType}, mas a adaptação não preservou esse tipo estrutural.`,
      });
    }
    if (expectedTypes.length > 0) {
      const first = schema.exercises[0];
      if (first && !expectedTypes.includes(first.type)) {
        issues.push({
          code: 'original_primary_type_not_preserved',
          message: `A atividade principal deveria preservar ${request.originalActivityType}, mas o primeiro exercício veio como ${first.type}.`,
        });
      }
      const preservedCount = schema.exercises.filter(ex => expectedTypes.includes(ex.type)).length;
      if (isSingleMainOriginalType(request.originalActivityType) && !request.allowSupplementaryExercises && schema.exercises.length > 1) {
        issues.push({
          code: 'original_activity_fragmented',
          message: `A atividade original era um formato principal único (${request.originalActivityType}), mas a adaptação fragmentou em ${schema.exercises.length} exercícios sem pedido explícito de complementares.`,
        });
      }
      const unexpected = schema.exercises.filter(ex => !expectedTypes.includes(ex.type));
      if (isSingleMainOriginalType(request.originalActivityType) && !request.allowSupplementaryExercises && unexpected.length > 0) {
        issues.push({
          code: 'unexpected_supplementary_exercises',
          message: `A adaptação adicionou exercícios suplementares não solicitados (${unexpected.map(ex => ex.type).join(', ')}).`,
        });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

function validatePedagogicalAdaptation(
  schema: ActivitySchema,
  request: CanonicalGenerationRequest,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const guide = schema.guia_pedagogico;
  if (!guide) return issues;

  const activityText = activitySearchText(schema);
  const guideText = guideSearchText(guide);
  const combinedText = `${activityText} ${guideText}`;
  const activityWords = significantWords(activityText);
  const guideWords = significantWords(guideText);
  const overlap = [...guideWords].filter(word => activityWords.has(word));
  const hasMeaningfulContext = !!request.studentPedagogicalContext?.hasContext && !request.studentPedagogicalContext.isInsufficient;

  if (guide.objetivo_da_aula.trim().length < 24 || !hasAnyOverlap(significantWords(schema.header.objective), guideWords, 1)) {
    issues.push({
      code: 'adaptation_objective_weak',
      message: 'A adaptação não demonstrou preservar o objetivo pedagógico da atividade no Guia do Professor.',
    });
  }

  if (overlap.length < 2) {
    issues.push({
      code: 'adaptation_guide_disconnected',
      message: 'O Guia do Professor está desconectado da atividade gerada; faltam referências ao objetivo, tema, comandos ou exercícios reais.',
    });
  }

  if (hasMeaningfulContext && !usesFunctionalContext(request, combinedText)) {
    issues.push({
      code: 'adaptation_context_not_used',
      message: 'Há contexto funcional do aluno disponível, mas a atividade/Guia não o utiliza de forma observável.',
    });
  }

  if (!hasMeaningfulContext && !declaresInsufficientContext(guideText)) {
    issues.push({
      code: 'adaptation_insufficient_context_not_declared',
      message: 'Sem contexto funcional suficiente, o Guia deve declarar a limitação e tratar a adaptação como geral/DUA.',
    });
  }

  if (hasGenericGuidanceOnly(guideText)) {
    issues.push({
      code: 'adaptation_generic_guidance',
      message: 'O Guia contém orientação genérica desconectada da atividade, sem dizer onde, como e por que aplicar.',
    });
  }

  if (!hasAccessibleResponseMode(combinedText)) {
    issues.push({
      code: 'adaptation_accessible_response_missing',
      message: 'A adaptação não explicita forma de resposta acessível ou alternativa compatível com a atividade.',
    });
  }

  if (schema.exercises.length >= 3 && !hasProgression(schema, guideText)) {
    issues.push({
      code: 'adaptation_progression_missing',
      message: 'A adaptação tem múltiplos itens, mas não indica progressão, blocos ou aplicação em etapas.',
    });
  }

  if (request.originalActivityType) {
    const expectedTypes = expectedExerciseTypesForOriginal(request.originalActivityType);
    const unexpected = expectedTypes.length
      ? schema.exercises.filter(ex => !expectedTypes.includes(ex.type))
      : [];
    if (unexpected.length > 0 && !mentionsStructuralJustification(guideText)) {
      issues.push({
        code: 'adaptation_structural_change_unjustified',
        message: 'A adaptação alterou forma estrutural/de resposta sem justificar a mudança no Guia do Professor.',
      });
    }
  }

  if (hasInfantilizationRisk(combinedText)) {
    issues.push({
      code: 'adaptation_infantilization_risk',
      message: 'A linguagem indica risco de infantilização automática para aluno dos anos finais.',
    });
  }

  return issues;
}

const STOPWORDS = new Set([
  'atividade', 'adaptada', 'adaptacao', 'adaptação', 'aluno', 'aluna', 'professor', 'professora',
  'questao', 'questão', 'exercicio', 'exercício', 'exercicios', 'exercícios', 'sobre', 'para',
  'como', 'com', 'sem', 'uma', 'um', 'das', 'dos', 'que', 'esta', 'este', 'sera', 'será',
  'deve', 'devem', 'realizar', 'responder', 'forma', 'apoio', 'etapa', 'item',
]);

function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function significantWords(value: string): Set<string> {
  const normalized = normalizeForSearch(value);
  const words = normalized.match(/[a-z0-9]{4,}/g) ?? [];
  return new Set(words.filter(word => !STOPWORDS.has(word)));
}

function hasAnyOverlap(a: Set<string>, b: Set<string>, min: number): boolean {
  let count = 0;
  for (const word of a) {
    if (b.has(word)) count += 1;
    if (count >= min) return true;
  }
  return false;
}

function activitySearchText(schema: ActivitySchema): string {
  return [
    schema.header.title,
    schema.header.theme,
    schema.header.objective,
    ...(schema.header.instructions ?? []),
    ...schema.blocks.flatMap(block => [block.title, block.content ?? '', ...block.items]),
    ...schema.exercises.flatMap(ex => [ex.title, ex.prompt, ex.supportHint ?? '', ...ex.options, ...(ex.clues ?? [])]),
    ...schema.accessibilityNotes.supports,
    ...schema.accessibilityNotes.adaptations,
    ...schema.accessibilityNotes.teacherNotes,
  ].join(' ');
}

function guideSearchText(guide: GuiaPedagogico): string {
  return [
    guide.objetivo_da_aula,
    guide.metodologia_adaptada,
    ...guide.dicas_de_mediacao,
    ...guide.criterios_de_avaliacao,
    ...guide.materiais_necessarios,
    guide.tempo_estimado,
    ...guide.adaptacoes_inclusivas,
  ].join(' ');
}

function usesFunctionalContext(request: CanonicalGenerationRequest, text: string): boolean {
  const ctx = request.studentPedagogicalContext;
  if (!ctx) return false;
  const normalized = normalizeForSearch(text);
  const functionalEvidence = [
    ...ctx.barriers,
    ...ctx.strengths,
    ...ctx.communication,
    ...ctx.attention,
    ...ctx.autonomy,
    ...ctx.commandComprehension,
    ...ctx.motorCoordination,
    ...ctx.priorKnowledge,
    ...ctx.interests,
    ...ctx.helpfulSupports,
    ...ctx.responseModes,
    ...ctx.peiPaeeGoals,
    ...ctx.pedagogicalNotes,
  ];
  const evidenceWords = significantWords(functionalEvidence.join(' '));
  const observable = [...evidenceWords].filter(word =>
    word.length >= 5 &&
    !['avaliacao', 'observacao', 'perfil', 'cognitivo', 'sistema', 'contexto'].includes(word)
  );
  return observable.some(word => normalized.includes(word));
}

function declaresInsufficientContext(guideText: string): boolean {
  const text = normalizeForSearch(guideText);
  return /contexto.{0,40}insuficiente|sem dados individuais|dados individuais insuficientes|dua|desenho universal|acessibilidade geral/.test(text);
}

function hasGenericGuidanceOnly(guideText: string): boolean {
  const text = normalizeForSearch(guideText);
  const genericHits = [
    /tenha paciencia/,
    /respeite o tempo/,
    /use recursos visuais/,
    /ofereca apoio/,
    /adapte conforme necessario/,
  ].filter(pattern => pattern.test(text)).length;
  if (genericHits === 0) return false;
  const hasConcreteWhereHow = /\b(exercicio|questao|item|bloco|etapa|comando|grade|lacuna|coluna|tabela|alternativa)\b.{0,80}\b(como|porque|por que|para que|aplique|apresent|medie|registre)\b/.test(text);
  return !hasConcreteWhereHow;
}

function hasAccessibleResponseMode(text: string): boolean {
  return /\b(resposta oral|oralmente|selecionar|sele[cç][aã]o|marcar|marca[cç][aã]o|apontar|ligar|associar|associa[cç][aã]o|completar|palavras?-chave|alternativas? reduzidas?|resposta curta|desenhar|ordenar|classificar)\b/i.test(text);
}

function hasProgression(schema: ActivitySchema, guideText: string): boolean {
  const text = normalizeForSearch([
    guideText,
    ...schema.exercises.flatMap(ex => [ex.title, ex.prompt, ex.supportHint ?? '']),
  ].join(' '));
  return /\b(progr|simples ao complexo|blocos?|etapas?|primeiro|depois|em seguida|gradual|pausas?)\b/.test(text);
}

function mentionsStructuralJustification(guideText: string): boolean {
  const text = normalizeForSearch(guideText);
  return /\b(alter|mudan|forma de resposta|estrutura|substitu|preserva o objetivo|sem alterar o objetivo|justifica)\b/.test(text);
}

function hasInfantilizationRisk(text: string): boolean {
  return /\b(criancinha|amiguinho|amiguinha|fofinho|fofinha|desenhinho|parabenzinho|turminha|beb[eê])\b/i.test(text);
}

const REQUIRED_VISUAL_REFERENCE_RE = /\b(observ[ea]|veja|analise|conforme|olhe)\b.{0,45}\b(imagem|figura|ilustra(?:ç|c)(?:[ãa]o|[õo]es)|desenho|gr[aá]fico|mapa|foto|quadro|tabela)\b|\b(imagem|figura|ilustra(?:ç|c)(?:[ãa]o|[õo]es)|desenho|gr[aá]fico|mapa|foto)\s+(abaixo|ao\s+lado|acima)\b/i;

function hasExistingVisualAsset(schema: ActivitySchema, visualAssetId?: string): boolean {
  if (!visualAssetId) return false;
  return schema.visualAssets.some(asset =>
    asset.id === visualAssetId &&
    !!(asset.url || asset.fallbackEmoji || asset.description || asset.title)
  );
}

function findMissingRequiredVisualAssets(schema: ActivitySchema): string[] {
  return schema.exercises
    .filter(exercise => {
      const text = `${exercise.title} ${exercise.prompt} ${exercise.supportHint ?? ''}`;
      if (!REQUIRED_VISUAL_REFERENCE_RE.test(text)) return false;
      if (/\btabela\b/i.test(text) && exercise.type === 'table') return false;
      return !hasExistingVisualAsset(schema, exercise.visualAssetId);
    })
    .map(exercise => exercise.id);
}

function findBaseText(schema: ActivitySchema): string {
  return schema.blocks
    .filter(block => block.type === 'instructions' || block.type === 'practice')
    .filter(block => /texto|leitura|introdu/i.test(`${block.id} ${block.title}`))
    .map(block => block.content?.trim() ?? '')
    .find(Boolean) ?? '';
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getBaseTextExpectedRange(request: CanonicalGenerationRequest): { min: number; max?: number; unit: 'characters' | 'words' } {
  const constraint = request.baseTextConstraint;
  if (constraint?.target) {
    return {
      unit: constraint.unit,
      min: Math.max(1, Math.floor(constraint.target * 0.9)),
      max: Math.ceil(constraint.target * 1.1),
    };
  }
  if (constraint?.min != null || constraint?.max != null) {
    return {
      unit: constraint.unit,
      min: constraint.min ?? 1,
      max: constraint.max,
    };
  }
  if (request.baseTextApproxChars) {
    return {
      unit: 'characters',
      min: Math.max(180, Math.floor(request.baseTextApproxChars * 0.9)),
      max: Math.ceil(request.baseTextApproxChars * 1.1),
    };
  }
  switch (request.baseTextSize) {
    case 'small':
      return { unit: 'characters', min: 700, max: 1400 };
    case 'medium':
      return { unit: 'characters', min: 1401, max: 2800 };
    case 'large':
      return { unit: 'characters', min: 2801, max: 5000 };
    default:
      return { unit: 'characters', min: 180 };
  }
}

function isSingleMainOriginalType(
  originalType: NonNullable<CanonicalGenerationRequest['originalActivityType']>,
): boolean {
  return originalType === 'word_search'
    || originalType === 'crossword'
    || originalType === 'matching'
    || originalType === 'fill_blank'
    || originalType === 'coloring'
    || originalType === 'table';
}

function expectedExerciseTypesForOriginal(
  originalType: NonNullable<CanonicalGenerationRequest['originalActivityType']>,
): ActivitySchema['exercises'][number]['type'][] {
  switch (originalType) {
    case 'word_search': return ['word_search'];
    case 'crossword': return ['crossword'];
    case 'multiple_choice': return ['multiple_choice'];
    case 'open_questions': return ['short_answer'];
    case 'matching': return ['matching'];
    case 'fill_blank': return ['fill_blank'];
    case 'coloring': return ['coloring', 'drawing'];
    case 'table': return ['table'];
    default: return [];
  }
}
