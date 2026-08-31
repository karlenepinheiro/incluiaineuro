/**
 * intentExtractor.ts — Sprint 2B
 *
 * Função PURA (sem I/O, sem chamada de IA, sem side effects) que transforma o
 * texto livre do professor em um `CanonicalGenerationRequest`.
 *
 * Escopo do Activity Pipeline: 'atividade' | 'avaliacao' | 'adaptacao'.
 * Pedidos fora desse escopo (ex.: relatório) NÃO são forçados para cá — a UI
 * decide se o texto deve ir para este extractor ou para outro fluxo.
 *
 * Testável isoladamente (ver src/services/incluilab/__tests__/intentExtractor.test.ts).
 */
import type {
  CanonicalGenerationRequest,
  CanonicalRequestType,
  IncluiLabBaseTextConstraint,
  IncluiLabBaseTextSize,
  IncluiLabOutputFormat,
  IncluiLabOutputModality,
  IncluiLabRequestedVisualStyle,
  OriginalActivityType,
  VisualMode,
  VisualModeSource,
} from '../../types';
import { buildStudentPedagogicalContext } from './studentPedagogicalContext';

export interface ExtractIntentOptions {
  hasAttachment?: boolean;
  /** Contexto do aluno já formatado (opcional — aluno nunca é obrigatório). */
  studentContext?: string;
  /**
   * Dica explícita de requestType vinda da escolha de modo na UI
   * (ex.: usuário clicou em "Adaptar"). Tem prioridade sobre a inferência textual.
   */
  requestTypeHint?: CanonicalRequestType;
  originalActivityType?: OriginalActivityType | null;
  outputFormatHint?: IncluiLabOutputFormat;
}

// ─── Dicionários de detecção (pt-BR, minúsculo, sem acentuação obrigatória) ────

const ADAPTACAO_KEYWORDS = [
  'adaptar', 'adaptação', 'adaptacao', 'adaptada', 'adaptado', 'readapte', 'reconstruir a atividade',
];

// Checkpoint 4E: exportado para reuso pelo pipeline legado de IncluiLabView.tsx
// (detecção de intenção de Avaliação para exigir Gabarito) — sem duplicar a lista.
export const AVALIACAO_KEYWORDS = [
  'avaliação', 'avaliacao', 'prova', 'teste', 'avaliativa', 'avaliativo', 'simulado',
];

// Sprint 2B.3 (item 8, Auditoria 2B.2-D): antes, estes padrões exigiam "de"/"com"
// logo após a palavra-chave ("ilustração DE X"), então frases como "ilustrações
// premium", "atividade ilustrada" ou "quero imagens" não batiam em NADA — caíam
// em 'none' silenciosamente. Agora casam com a palavra-raiz em qualquer posição,
// o que é estritamente mais amplo (continua casando tudo que já casava antes).
// PICTOGRAM_PATTERNS é verificado ANTES de ILLUSTRATION_PATTERNS (ver
// extractVisualMode) para que combinações como "imagens de apoio" sejam
// classificadas como apoio visual, não como pedido de ilustração real.
const ILLUSTRATION_PATTERNS: RegExp[] = [
  // ilustração/ilustracao (singular, ã/a) OU ilustrações/ilustracoes (plural, õ/o+es)
  /\bilustra(?:ç|c)(?:[ãa]o|[õo]es)\b/i,
  /\bilustrad[ao]s?\b/i,            // ilustrada / ilustrado / ilustradas / ilustrados
  /\bdesenhos?\b/i,                 // desenho / desenhos
  /\bimagens?\b/i,                  // imagem / imagens (genérico — checado depois de pictogram)
];

const PICTOGRAM_PATTERNS: RegExp[] = [
  /apoio\s+visual/i,
  /pictogramas?/i,
  /(?:com|usando)\s+[ií]cones?/i,
  /imagens?\s+de\s+apoio/i,
];

// Sprint 2B (1-20) + Sprint 2B.3 (item 7): compostos de 21-50 ("vinte e cinco",
// "trinta e cinco", "quarenta e oito"...). Números em dígitos continuam com
// prioridade (checados primeiro no QUESTION_COUNT_PATTERN).
const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, 'três': 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
  catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20,
};

const TENS_WORDS: Record<string, number> = {
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
};

const ONES_WORDS: Record<string, number> = {
  um: 1, dois: 2, tres: 3, 'três': 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
};

const NUMBER_WORD_ALTERNATION = Object.keys(NUMBER_WORDS).join('|');
const TENS_WORD_ALTERNATION = Object.keys(TENS_WORDS).join('|');
const ONES_WORD_ALTERNATION = Object.keys(ONES_WORDS).join('|');

// Token de número por extenso: composto ("vinte e cinco") OU palavra simples (1-20).
const NUMBER_WORD_TOKEN =
  `(?:${TENS_WORD_ALTERNATION})(?:\\s+e\\s+(?:${ONES_WORD_ALTERNATION}))?|${NUMBER_WORD_ALTERNATION}`;

const QUESTION_COUNT_PATTERN = new RegExp(
  `(\\d+|${NUMBER_WORD_TOKEN})\\s+(question(?:ões|oes)|quest(?:õ|o)es|exerc[ií]cios|perguntas|itens)`,
  'i',
);

const BASE_TEXT_PATTERNS: RegExp[] = [
  /\btexto\s+(introdut[oó]rio|base)\b/i,
  /\btexto-base\b/i,
  /\bcom\s+um\s+texto\b/i,
  /\bcom\s+texto\b/i,
  /\btextinho\b/i,
  /\bleitura\b/i,
];

const SIZE_NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const SIZE_UNIT = String.raw`(caracteres|chars?|palavras?)`;
const BASE_TEXT_EXPLICIT_RANGE_PATTERN = new RegExp(
  String.raw`\b(?:texto|leitura)?[^.\n]{0,80}?\bentre\s+(${SIZE_NUMBER})\s*(mil)?\s+e\s+(${SIZE_NUMBER})\s*(mil)?\s*${SIZE_UNIT}\b`,
  'i',
);
const BASE_TEXT_EXPLICIT_MAX_PATTERN = new RegExp(
  String.raw`\b(?:texto|leitura)?[^.\n]{0,80}?\b(?:at[eé]|no\s+m[aá]ximo)\s+(${SIZE_NUMBER})\s*(mil)?\s*${SIZE_UNIT}\b`,
  'i',
);
const BASE_TEXT_EXPLICIT_MIN_PATTERN = new RegExp(
  String.raw`\b(?:texto|leitura)?[^.\n]{0,80}?\b(?:no\s+m[ií]nimo|pelo\s+menos|ao\s+menos)\s+(${SIZE_NUMBER})\s*(mil)?\s*${SIZE_UNIT}\b`,
  'i',
);
const BASE_TEXT_EXPLICIT_TARGET_PATTERN = new RegExp(
  String.raw`\b(?:texto|leitura)[^.\n]{0,80}?(?:aproximadamente\s+|cerca\s+de\s+|com\s+|de\s+)?(${SIZE_NUMBER})\s*(mil)?\s*${SIZE_UNIT}\b`,
  'i',
);

const BASE_TEXT_EXPLICIT_PATTERNS = [
  BASE_TEXT_EXPLICIT_RANGE_PATTERN,
  BASE_TEXT_EXPLICIT_MAX_PATTERN,
  BASE_TEXT_EXPLICIT_MIN_PATTERN,
  BASE_TEXT_EXPLICIT_TARGET_PATTERN,
];

const BASE_TEXT_SIZE_PATTERNS: Array<{ size: Exclude<IncluiLabBaseTextSize, 'custom' | 'unspecified'>; patterns: RegExp[] }> = [
  {
    size: 'small',
    patterns: [
      /\btexto\s+(?:pequeno|curto|breve)\b/i,
      /\bum\s+textinho\b/i,
      /\bleitura\s+(?:pequena|curta|breve)\b/i,
      /\buma\s+leitura\s+r[aá]pida\b/i,
    ],
  },
  {
    size: 'medium',
    patterns: [
      /\btexto\s+m[eé]dio\b/i,
      /\btexto\s+de\s+tamanho\s+m[eé]dio\b/i,
      /\btexto\s+nem\s+muito\s+curto\s+nem\s+muito\s+longo\b/i,
      /\bleitura\s+m[eé]dia\b/i,
    ],
  },
  {
    size: 'large',
    patterns: [
      /\btexto\s+(?:grande|longo)\b/i,
      /\btexto\s+(?:completo|detalhado|aprofundado)\b/i,
      /\btexto\s+bem\s+desenvolvido\b/i,
      /\btexto\s+mais\s+extenso\b/i,
      /\bleitura\s+(?:grande|longa)\b/i,
      /\bleitura\s+mais\s+extensa\b/i,
    ],
  },
];

const SUPPLEMENTARY_EXERCISES_PATTERNS: RegExp[] = [
  /\badicione\s+outras?\s+(quest(?:õ|o)es|perguntas|atividades|exerc[ií]cios)\b/i,
  /\binclua\s+(quest(?:õ|o)es|perguntas|atividades|exerc[ií]cios)\s+complementares\b/i,
  /\bexerc[ií]cios\s+complementares\b/i,
  /\bquest(?:õ|o)es\s+extras?\b/i,
  /\batividade\s+mista\b/i,
  /\bformato\s+misto\b/i,
];

const WORD_OUTPUT_PATTERNS: RegExp[] = [
  /\bem\s+word\b/i,
  /\bno\s+word\b/i,
  /\bformato\s+word\b/i,
  /\bdocx\b/i,
  /\barquivo\s+word\b/i,
  /\barquivo\s+edit[aá]vel\b/i,
  /\bquero\s+(?:em\s+)?word\b/i,
  /\bme\s+entregue\s+em\s+word\b/i,
  /\bbaixar\s+em\s+word\b/i,
];

const PDF_OUTPUT_PATTERNS: RegExp[] = [
  /\bem\s+pdf\b/i,
  /\bformato\s+pdf\b/i,
  /\bquero\s+(?:em\s+)?pdf\b/i,
  /\barquivo\s+pdf\b/i,
  /\bme\s+entregue\s+em\s+pdf\b/i,
  /\bbaixar\s+em\s+pdf\b/i,
  /\bpronto\s+para\s+imprimir\b/i,
];

const PNG_OUTPUT_PATTERNS: RegExp[] = [
  /\bem\s+imagem\b/i,
  /\bcomo\s+imagem\b/i,
  /\bem\s+png\b/i,
  /\bpng\b/i,
  /\bimagem\s+para\s+imprimir\b/i,
  /\bme\s+entregue\s+como\s+imagem\b/i,
  /\bfolha\s+ilustrada\b/i,
  /\bmaterial\s+visual\b/i,
];

const JPG_OUTPUT_PATTERNS: RegExp[] = [
  /\bem\s+jpe?g\b/i,
  /\bjpe?g\b/i,
];

/** Converte um token de número por extenso (simples ou composto) em valor numérico. */
function parsePortugueseNumberWord(raw: string): number | undefined {
  const compound = raw.match(new RegExp(`^(${TENS_WORD_ALTERNATION})(?:\\s+e\\s+(${ONES_WORD_ALTERNATION}))?$`, 'i'));
  if (compound) {
    const tens = TENS_WORDS[compound[1].toLowerCase()];
    const ones = compound[2] ? ONES_WORDS[compound[2].toLowerCase()] : 0;
    return tens + ones;
  }
  return NUMBER_WORDS[raw];
}

const DISCIPLINE_KEYWORDS: Record<string, string> = {
  'matemática': 'Matemática', matematica: 'Matemática',
  'português': 'Português', portugues: 'Português',
  'ciências': 'Ciências', ciencias: 'Ciências',
  'história': 'História', historia: 'História',
  geografia: 'Geografia',
  artes: 'Artes',
  'educação física': 'Educação Física', 'educacao fisica': 'Educação Física',
  'língua inglesa': 'Inglês', 'lingua inglesa': 'Inglês', 'inglês': 'Inglês', ingles: 'Inglês',
};

const GRADE_PATTERN = /(\d+)\s*[ºo°]?\s*ano/i;

const DIFFICULTY_KEYWORDS: Record<string, string> = {
  'básico': 'facil', basico: 'facil', 'fácil': 'facil', facil: 'facil',
  'médio': 'medio', medio: 'medio', intermediario: 'medio', 'intermediário': 'medio',
  'difícil': 'dificil', dificil: 'dificil', avancado: 'dificil', 'avançado': 'dificil',
};

// ─── Extractor principal ────────────────────────────────────────────────────

export function extractCanonicalIntent(
  rawUserText: string,
  options: ExtractIntentOptions = {},
): CanonicalGenerationRequest {
  const topic = (rawUserText ?? '').trim();
  const lower = topic.toLowerCase();
  const hasAttachment = !!options.hasAttachment;

  const requestType = options.requestTypeHint ?? detectRequestType(lower, hasAttachment);
  const requestedQuestionCount = extractQuestionCount(lower);
  const requiresBaseText = extractRequiresBaseText(lower);
  const baseTextConstraint = extractBaseTextConstraint(lower);
  const baseTextApproxChars = baseTextConstraint?.unit === 'characters' && baseTextConstraint.target ? baseTextConstraint.target : undefined;
  const baseTextSize = baseTextConstraint ? 'custom' : extractBaseTextSize(lower);
  const allowSupplementaryExercises = extractAllowsSupplementaryExercises(lower);
  const discipline = extractDiscipline(lower);
  const grade = extractGrade(lower);
  const difficulty = extractDifficulty(lower);
  const { visualMode, visualModeSource } = extractVisualMode(lower);
  const detectedOutputFormat = extractOutputFormat(lower);
  const outputFormat = detectedOutputFormat.outputFormat !== 'unspecified'
    ? detectedOutputFormat.outputFormat
    : (options.outputFormatHint ?? 'unspecified');
  const requestedVisualStyle = extractRequestedVisualStyle(lower);
  const outputModality = extractOutputModality(outputFormat, lower);
  const studentPedagogicalContext = buildStudentPedagogicalContext(options.studentContext);

  return {
    requestType,
    rawUserText: topic,
    topic,
    discipline,
    grade,
    requestedQuestionCount,
    requiresBaseText,
    baseTextApproxChars,
    baseTextSize,
    baseTextConstraint,
    allowSupplementaryExercises,
    difficulty,
    studentContext: options.studentContext,
    studentPedagogicalContext,
    originalActivityType: options.originalActivityType,
    hasAttachment,
    visualMode,
    visualModeSource,
    outputFormat,
    outputModality,
    requestedVisualStyle,
    normalizedOutputFormatNotice: detectedOutputFormat.notice,
  };
}

// ─── Helpers individuais (exportados para teste unitário granular) ──────────

export function detectRequestType(lower: string, hasAttachment: boolean): CanonicalRequestType {
  if (ADAPTACAO_KEYWORDS.some(k => lower.includes(k))) return 'adaptacao';
  if (hasAttachment) return 'adaptacao';
  if (AVALIACAO_KEYWORDS.some(k => lower.includes(k))) return 'avaliacao';
  return 'atividade';
}

export function extractQuestionCount(lower: string): number | undefined {
  const match = lower.match(QUESTION_COUNT_PATTERN);
  if (!match) return undefined;
  const raw = match[1].toLowerCase();
  // Dígitos têm prioridade e são resolvidos diretamente; números por extenso
  // (simples 1-20 ou compostos 21-50, ex.: "quarenta e oito") passam pelo parser.
  const n = /^\d+$/.test(raw) ? Number(raw) : parsePortugueseNumberWord(raw);
  if (n === undefined || !Number.isFinite(n) || n <= 0) return undefined;
  // Limite de sanidade — evita pedidos absurdos quebrarem o pipeline. Acompanha
  // o teto de "um a cinquenta" pedido no Sprint 2B.3 (item 7).
  return Math.min(n, 50);
}

export function extractRequiresBaseText(lower: string): boolean {
  return BASE_TEXT_PATTERNS.some(pattern => pattern.test(lower))
    || BASE_TEXT_EXPLICIT_PATTERNS.some(pattern => pattern.test(lower));
}

export function extractBaseTextApproxChars(lower: string): number | undefined {
  const constraint = extractBaseTextConstraint(lower);
  return constraint?.unit === 'characters' && constraint.target ? constraint.target : undefined;
}

function normalizeSizeUnit(raw: string): IncluiLabBaseTextConstraint['unit'] {
  return /^palavra/i.test(raw) ? 'words' : 'characters';
}

function parseExplicitSize(rawToken: string, mil?: string): number | undefined {
  const normalized = /[.,]\d{3}$/.test(rawToken)
    ? rawToken.replace(/[.,]/g, '')
    : rawToken.replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const value = mil ? n * 1000 : n;
  return Math.min(Math.max(Math.round(value), 1), 12000);
}

export function extractBaseTextConstraint(lower: string): IncluiLabBaseTextConstraint | undefined {
  const range = lower.match(BASE_TEXT_EXPLICIT_RANGE_PATTERN);
  if (range) {
    const first = parseExplicitSize(range[1], range[2]);
    const second = parseExplicitSize(range[3], range[4]);
    if (first && second) {
      return {
        unit: normalizeSizeUnit(range[5]),
        min: Math.min(first, second),
        max: Math.max(first, second),
      };
    }
  }

  const max = lower.match(BASE_TEXT_EXPLICIT_MAX_PATTERN);
  if (max) {
    const value = parseExplicitSize(max[1], max[2]);
    if (value) return { unit: normalizeSizeUnit(max[3]), max: value };
  }

  const min = lower.match(BASE_TEXT_EXPLICIT_MIN_PATTERN);
  if (min) {
    const value = parseExplicitSize(min[1], min[2]);
    if (value) return { unit: normalizeSizeUnit(min[3]), min: value };
  }

  const target = lower.match(BASE_TEXT_EXPLICIT_TARGET_PATTERN);
  if (target) {
    const value = parseExplicitSize(target[1], target[2]);
    if (value) return { unit: normalizeSizeUnit(target[3]), target: value };
  }

  return undefined;
}

export function extractBaseTextSize(lower: string): IncluiLabBaseTextSize {
  for (const entry of BASE_TEXT_SIZE_PATTERNS) {
    if (entry.patterns.some(pattern => pattern.test(lower))) return entry.size;
  }
  return 'unspecified';
}

export function extractAllowsSupplementaryExercises(lower: string): boolean {
  return SUPPLEMENTARY_EXERCISES_PATTERNS.some(pattern => pattern.test(lower));
}

export function extractDiscipline(lower: string): string | undefined {
  for (const [key, label] of Object.entries(DISCIPLINE_KEYWORDS)) {
    if (lower.includes(key)) return label;
  }
  return undefined;
}

export function extractGrade(lower: string): string | undefined {
  const match = lower.match(GRADE_PATTERN);
  if (!match) return undefined;
  return `${match[1]}º ano`;
}

export function extractDifficulty(lower: string): string | undefined {
  for (const [key, value] of Object.entries(DIFFICULTY_KEYWORDS)) {
    if (lower.includes(key)) return value;
  }
  return undefined;
}

export function extractVisualMode(lower: string): { visualMode: VisualMode; visualModeSource: VisualModeSource } {
  // Sprint 2B.3: pictogram é checado PRIMEIRO — "imagens de apoio" precisa ser
  // classificado como apoio visual antes que o padrão genérico de "imagens" de
  // ILLUSTRATION_PATTERNS tenha chance de capturar a frase.
  if (PICTOGRAM_PATTERNS.some(re => re.test(lower))) {
    return { visualMode: 'pictogram', visualModeSource: 'user_explicit' };
  }
  if (ILLUSTRATION_PATTERNS.some(re => re.test(lower))) {
    return { visualMode: 'illustration', visualModeSource: 'user_explicit' };
  }
  return { visualMode: 'none', visualModeSource: 'inferred_default' };
}

export function extractOutputFormat(lower: string): { outputFormat: IncluiLabOutputFormat; notice?: string } {
  if (WORD_OUTPUT_PATTERNS.some(re => re.test(lower))) return { outputFormat: 'docx' };
  if (PDF_OUTPUT_PATTERNS.some(re => re.test(lower))) return { outputFormat: 'pdf' };
  if (PNG_OUTPUT_PATTERNS.some(re => re.test(lower))) return { outputFormat: 'png' };
  if (JPG_OUTPUT_PATTERNS.some(re => re.test(lower))) {
    return {
      outputFormat: 'png',
      notice: 'A atividade será entregue em PNG.',
    };
  }
  return { outputFormat: 'unspecified' };
}

export function extractOutputModality(outputFormat: IncluiLabOutputFormat, lower: string): IncluiLabOutputModality {
  if (outputFormat === 'docx' || outputFormat === 'pdf') return 'textual';
  if (outputFormat === 'png') return 'visual';
  if (/\b(?:em|como)\s+imagem\b|\bpng\b|\bjpe?g\b|\bfolha\s+ilustrada\b|\bmaterial\s+visual\b/i.test(lower)) return 'visual';
  if (/\b(?:word|docx|pdf|arquivo\s+edit[aá]vel|documento\s+edit[aá]vel)\b/i.test(lower)) return 'textual';
  return 'unspecified';
}

export function extractRequestedVisualStyle(lower: string): IncluiLabRequestedVisualStyle | undefined {
  if (/\b(?:preto\s+e\s+branco|pb|p\/b)\b/i.test(lower)) return 'preto_e_branco';
  if (/\bcolorid[ao]s?\b/i.test(lower)) return 'colorido';
  if (/\b(?:clean|limp[ao])\b/i.test(lower)) return 'clean';
  return undefined;
}
