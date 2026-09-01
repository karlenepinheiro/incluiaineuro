/**
 * _resultValidation.ts — Validação estrutural + saneamento determinístico de
 * respostas JSON da IA, ANTES da confirmação (commit) do crédito.
 *
 * Motivação (auditoria 30/08/2026): `validateAndRepair` (_aiUtils.ts) só faz
 * `JSON.parse` + "é objeto?". Um JSON bem formado pode ainda assim ser
 * inutilizável — blocos obrigatórios vazios, textos-molde do prompt ("[Nome do
 * jogo]", "[descrição específica]"), resposta truncada, ou uma estrutura de
 * outro tipo de documento. Confirmar crédito nesses casos é cobrar por lixo.
 *
 * Aplicado APENAS a `requestType` ∈ {plano_acao, plano_acao_aee,
 * perfil_inteligente}. Qualquer outro requestType passa inalterado
 * (`sanitizeStructuredResult` = identidade, `validateStructuredResult` =
 * { usable: true }) — nenhum outro fluxo do produto muda.
 *
 * Função pura, sem runtime Deno, sem imports remotos — testável diretamente
 * (ver src/__tests__/aiGatewayResultValidation.test.ts).
 *
 * REGRAS:
 *  - JSON válido, sozinho, não significa resultado utilizável.
 *  - Campo OPCIONAL ausente não invalida o resultado.
 *  - Placeholder em campo OBRIGATÓRIO = ausência (item removido; se o bloco
 *    obrigatório ficar vazio, o resultado é inutilizável).
 *  - Saneamento só REMOVE conteúdo claramente-placeholder; nunca inventa nem
 *    reescreve conteúdo pedagógico.
 *  - Resultado inutilizável deve FALHAR (lançar UNUSABLE_RESULT no index.ts)
 *    antes do commit do crédito.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface StructuralValidationOutcome {
  usable: boolean;
  /** Código de máquina — vai para o log/erro, nunca conteúdo do aluno. */
  reason?: string;
  /** Detalhe curto (nome de campo/bloco) para diagnóstico — sem dados do aluno. */
  detail?: string;
}

const TARGET_REQUEST_TYPES = new Set(['plano_acao', 'plano_acao_aee', 'perfil_inteligente']);

// ─── Detecção de placeholder / texto-molde ───────────────────────────────────

/**
 * Trechos que denunciam que a IA não substituiu o exemplo do prompt.
 * Conservador de propósito: evita falso-positivo em texto pedagógico real.
 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  // colchetes contendo espaço interno → quase sempre molde ("[Nome do jogo]",
  // "[descrição específica da barreira]", "[passo a passo]")
  /\[[^\]\n]*\s[^\]\n]*\]/,
  // marcadores de anonimização / tokens do prompt
  /\[(?:ALUNO|ESCOLA|PROFESSOR|DIAGN[ÓO]STICO|CID)\]/i,
  // colchete com uma única palavra-instrução
  /\[(?:nome|preencher|inserir|insira|exemplo|texto|opcional|descrever|detalhar|tipo|passo|tempo|data|valor)\]/i,
  // frases de molde
  /\bexemplo de resposta\b/i,
  /\bpreencher (?:aqui|com|o|a)\b/i,
  /\binsira (?:aqui|o|a|um|uma)\b/i,
  /\bdescri[çc][ãa]o espec[íi]fica\b/i,
  /\blorem ipsum\b/i,
  /\bpasso a passo em \d+ frases\b/i,
  /\bpasso a passo\]\s*$/i,
];

/** Valores que equivalem a "vazio" mesmo sendo string não-nula. */
const TRIVIAL_EMPTY = new Set(['', '-', '--', '—', '...', '…', 'n/a', 'na', 'tbd', 'a definir', 'nao informado', 'não informado']);

export function isPlaceholderText(value: unknown): boolean {
  if (typeof value !== 'string') return true; // ausência de string = "placeholder"
  const t = value.trim();
  if (t.length === 0) return true;
  if (TRIVIAL_EMPTY.has(t.toLowerCase())) return true;
  for (const re of PLACEHOLDER_PATTERNS) {
    if (re.test(t)) return true;
  }
  return false;
}

/** Texto substantivo: string real, não-placeholder, com tamanho mínimo. */
function isSubstantiveText(value: unknown, minLen = 1): boolean {
  return typeof value === 'string'
    && value.trim().length >= minLen
    && !isPlaceholderText(value);
}

// ─── Saneamento de blocos { title, items:[{id,text,done}] } ──────────────────

interface LooseItem { id?: unknown; text?: unknown; done?: unknown; [k: string]: unknown }
interface LooseBlock { title?: unknown; items?: unknown; [k: string]: unknown }

function isBlock(v: unknown): v is LooseBlock {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Array.isArray((v as LooseBlock).items);
}

/** Remove itens cujo `text` é placeholder/vazio. Não altera itens válidos. */
function sanitizeBlock(block: LooseBlock): LooseBlock {
  const items = (block.items as LooseItem[]).filter(it => it && isSubstantiveText(it.text));
  return { ...block, items };
}

function usableItemCount(block: unknown): number {
  if (!isBlock(block)) return 0;
  return (block.items as LooseItem[]).filter(it => it && isSubstantiveText(it.text)).length;
}

// ─── Saneamento por tipo de documento ───────────────────────────────────────

const PLAN_REGENTE_BLOCKS = [
  'beforeClass', 'duringClass', 'activitiesStrategies', 'assessment',
  'attentionObservations', 'communicationTeam', 'focusPlan', 'mainBarrier',
  'suggestedGames', 'suggestedVideos', 'suggestedMaterials', 'suggestedDynamics',
  'adaptations', 'evidenceRecording', 'studentResponse',
];
const PLAN_REGENTE_OPTIONAL_BLOCKS = new Set([
  'focusPlan', 'mainBarrier', 'suggestedGames', 'suggestedVideos',
  'suggestedMaterials', 'suggestedDynamics', 'adaptations', 'evidenceRecording', 'studentResponse',
]);
const PLAN_REGENTE_SCALARS = ['practicalObjective', 'nextStep'];

const PLAN_AEE_BLOCKS = [
  'welcomeRoutine', 'priorityBarrier', 'sessionScript', 'materials',
  'applicationGuide', 'responseRecord', 'gamesResources', 'videosResources',
  'printedActivities', 'digitalResources', 'dynamicsResources', 'adaptationsGuide',
];
const PLAN_AEE_OPTIONAL_BLOCKS = new Set([
  'gamesResources', 'videosResources', 'printedActivities', 'digitalResources',
  'dynamicsResources', 'adaptationsGuide',
]);
const PLAN_AEE_SCALARS = ['sessionObjective', 'nextStep'];

function sanitizePlan(doc: Record<string, unknown>, blockKeys: string[], optionalBlocks: Set<string>, scalarKeys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...doc };

  for (const key of blockKeys) {
    if (!isBlock(out[key])) {
      if (optionalBlocks.has(key)) delete out[key];
      continue;
    }
    const cleaned = sanitizeBlock(out[key] as LooseBlock);
    if ((cleaned.items as LooseItem[]).length === 0 && optionalBlocks.has(key)) {
      delete out[key]; // bloco opcional vazio → some (evita bloco fantasma)
    } else {
      out[key] = cleaned;
    }
  }

  for (const key of scalarKeys) {
    if (key in out && !isSubstantiveText(out[key], 4)) {
      delete out[key]; // escalar opcional placeholder → some
    }
  }

  return out;
}

function sanitizeIntelligentProfile(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...doc };

  // Listas de string: remove placeholders. Só substitui a lista se sobrar item.
  for (const key of ['strengths', 'nextSteps', 'carePoints']) {
    const arr = out[key];
    if (Array.isArray(arr)) {
      out[key] = arr.filter(v => isSubstantiveText(v));
    }
  }

  // bestLearningStrategies.items
  const bls = out.bestLearningStrategies;
  if (bls && typeof bls === 'object' && Array.isArray((bls as Record<string, unknown>).items)) {
    (bls as Record<string, unknown>).items = ((bls as Record<string, unknown>).items as unknown[]).filter(v => isSubstantiveText(v));
  }

  // observationPoints.checklist
  const obs = out.observationPoints;
  if (obs && typeof obs === 'object' && Array.isArray((obs as Record<string, unknown>).checklist)) {
    (obs as Record<string, unknown>).checklist = ((obs as Record<string, unknown>).checklist as unknown[]).filter(v => isSubstantiveText(v));
  }

  // recommendedActivities: remove atividades sem título substantivo
  if (Array.isArray(out.recommendedActivities)) {
    out.recommendedActivities = (out.recommendedActivities as Record<string, unknown>[])
      .filter(a => a && isSubstantiveText(a.title));
  }

  // challenges: remove desafios sem título substantivo
  if (Array.isArray(out.challenges)) {
    out.challenges = (out.challenges as Record<string, unknown>[])
      .filter(c => c && isSubstantiveText(c.title));
  }

  return out;
}

/**
 * Saneamento determinístico. Só REMOVE conteúdo claramente-placeholder.
 * requestType fora do alvo → devolve o documento inalterado.
 */
export function sanitizeStructuredResult(parsedDocument: unknown, requestType: string | undefined): unknown {
  if (!requestType || !TARGET_REQUEST_TYPES.has(requestType)) return parsedDocument;
  if (!parsedDocument || typeof parsedDocument !== 'object' || Array.isArray(parsedDocument)) return parsedDocument;

  const doc = parsedDocument as Record<string, unknown>;
  if (requestType === 'plano_acao') {
    return sanitizePlan(doc, PLAN_REGENTE_BLOCKS, PLAN_REGENTE_OPTIONAL_BLOCKS, PLAN_REGENTE_SCALARS);
  }
  if (requestType === 'plano_acao_aee') {
    return sanitizePlan(doc, PLAN_AEE_BLOCKS, PLAN_AEE_OPTIONAL_BLOCKS, PLAN_AEE_SCALARS);
  }
  if (requestType === 'perfil_inteligente') {
    return sanitizeIntelligentProfile(doc);
  }
  return parsedDocument;
}

// ─── Validação estrutural por tipo ──────────────────────────────────────────

const MIN_SERIALIZED_LEN: Record<string, number> = {
  plano_acao: 400,
  plano_acao_aee: 400,
  perfil_inteligente: 600,
};

function fail(reason: string, detail?: string): StructuralValidationOutcome {
  return { usable: false, reason, detail };
}
const OK: StructuralValidationOutcome = { usable: true };

function validatePlanRegente(doc: Record<string, unknown>): StructuralValidationOutcome {
  const required = ['beforeClass', 'duringClass', 'activitiesStrategies', 'assessment', 'attentionObservations', 'communicationTeam'];
  for (const key of required) {
    if (!isBlock(doc[key])) return fail('MISSING_REQUIRED_BLOCK', key);
    if (usableItemCount(doc[key]) < 1) return fail('EMPTY_REQUIRED_BLOCK', key);
  }
  if (!isSubstantiveText(doc.practicalObjective, 10)) return fail('MISSING_REQUIRED_FIELD', 'practicalObjective');
  return OK;
}

function validatePlanAEE(doc: Record<string, unknown>): StructuralValidationOutcome {
  const required = ['welcomeRoutine', 'priorityBarrier', 'sessionScript', 'materials', 'applicationGuide', 'responseRecord'];
  for (const key of required) {
    if (!isBlock(doc[key])) return fail('MISSING_REQUIRED_BLOCK', key);
    if (usableItemCount(doc[key]) < 1) return fail('EMPTY_REQUIRED_BLOCK', key);
  }
  if (!isSubstantiveText(doc.sessionObjective, 10)) return fail('MISSING_REQUIRED_FIELD', 'sessionObjective');
  return OK;
}

function validateIntelligentProfile(doc: Record<string, unknown>): StructuralValidationOutcome {
  if (!isSubstantiveText(doc.studentName, 1)) return fail('MISSING_REQUIRED_FIELD', 'studentName');

  const intro = isSubstantiveText(doc.firstPersonLetter, 20)
    || (doc.humanizedIntroduction && typeof doc.humanizedIntroduction === 'object'
        && isSubstantiveText((doc.humanizedIntroduction as Record<string, unknown>).text, 20));
  if (!intro) return fail('MISSING_REQUIRED_FIELD', 'humanizedIntroduction/firstPersonLetter');

  for (const key of ['pedagogicalReport', 'neuroPedagogicalReport']) {
    const rep = doc[key];
    if (!rep || typeof rep !== 'object') return fail('MISSING_REQUIRED_FIELD', key);
    const r = rep as Record<string, unknown>;
    if (!isSubstantiveText(r.text, 20)) return fail('EMPTY_REQUIRED_FIELD', `${key}.text`);
    if (!Array.isArray(r.checklist) || r.checklist.length < 1) return fail('EMPTY_REQUIRED_FIELD', `${key}.checklist`);
  }

  const bls = doc.bestLearningStrategies;
  const blsItems = bls && typeof bls === 'object' ? (bls as Record<string, unknown>).items : undefined;
  if (!Array.isArray(blsItems) || blsItems.filter(v => isSubstantiveText(v)).length < 1) {
    return fail('EMPTY_REQUIRED_FIELD', 'bestLearningStrategies.items');
  }

  const obs = doc.observationPoints;
  if (!obs || typeof obs !== 'object' || !isSubstantiveText((obs as Record<string, unknown>).text, 20)) {
    return fail('EMPTY_REQUIRED_FIELD', 'observationPoints.text');
  }

  return OK;
}

/**
 * Validação estrutural. Deve rodar DEPOIS de `sanitizeStructuredResult` e
 * ANTES do commit do crédito. requestType fora do alvo → { usable: true }.
 */
export function validateStructuredResult(
  parsedDocument: unknown,
  requestType: string | undefined,
  serializedLength?: number,
): StructuralValidationOutcome {
  if (!requestType || !TARGET_REQUEST_TYPES.has(requestType)) return OK;

  if (!parsedDocument || typeof parsedDocument !== 'object' || Array.isArray(parsedDocument)) {
    return fail('NOT_AN_OBJECT');
  }

  const len = typeof serializedLength === 'number'
    ? serializedLength
    : JSON.stringify(parsedDocument).length;
  if (len < (MIN_SERIALIZED_LEN[requestType] ?? 0)) {
    return fail('SUSPICIOUSLY_SHORT', `len=${len}`);
  }

  const doc = parsedDocument as Record<string, unknown>;
  if (requestType === 'plano_acao') return validatePlanRegente(doc);
  if (requestType === 'plano_acao_aee') return validatePlanAEE(doc);
  if (requestType === 'perfil_inteligente') return validateIntelligentProfile(doc);
  return OK;
}
