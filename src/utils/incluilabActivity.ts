import type { ActivitySchema, ActivityExercise } from '../types';

export type IncluiLabSectionType =
  | 'text'
  | 'info_box'
  | 'vocabulary'
  | 'questions'
  | 'match'
  | 'fill_blank'
  | 'coloring'
  | 'table'
  | 'steps';

export interface IncluiLabQuestion {
  number?: number;
  kind?: string;
  statement: string;
  options?: string[];
  answerLines?: number;
  left?: string;
  right?: string;
}

export interface IncluiLabSection {
  type: IncluiLabSectionType;
  title?: string;
  content?: string;
  items?: Array<string | IncluiLabQuestion | Record<string, unknown>>;
  options?: string[];
  pairs?: Array<{ left: string; right: string }>;
  columns?: string[];
  rows?: Array<string[] | Record<string, unknown>>;
  steps?: string[];
}

export interface IncluiLabVisualStyle {
  theme: string;
  background: string;
  border: string;
  illustrations: string;
  density: string;
}

export interface IncluiLabActivityContent {
  title: string;
  subtitle: string;
  subject: string;
  grade: string;
  studentFields: string[];
  introText: string;
  sections: IncluiLabSection[];
  visualStyle: IncluiLabVisualStyle;
}

interface NormalizeFallback {
  title?: string;
  prompt?: string;
  subject?: string;
  grade?: string;
}

const DEFAULT_STYLE: IncluiLabVisualStyle = {
  theme: 'school_clean',
  background: 'white',
  border: 'discreet',
  illustrations: 'small_colored',
  density: 'balanced',
};

const SECTION_TYPES: IncluiLabSectionType[] = [
  'text',
  'info_box',
  'vocabulary',
  'questions',
  'match',
  'fill_blank',
  'coloring',
  'table',
  'steps',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function asStringArray(value: unknown, limit = 20): string[] {
  if (typeof value === 'string') {
    return value
      .split(/\n|;/)
      .map(item => item.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, limit);
  }
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter(Boolean).slice(0, limit);
}

function parseMaybeJson(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  const trimmed = input.trim();
  if (!trimmed) return input;
  const withoutFence = trimmed
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  if (!withoutFence.startsWith('{') && !withoutFence.startsWith('[')) return input;
  try {
    return JSON.parse(withoutFence);
  } catch {
    return input;
  }
}

function normalizeSectionType(value: unknown): IncluiLabSectionType {
  const raw = asString(value) as IncluiLabSectionType;
  return SECTION_TYPES.includes(raw) ? raw : 'text';
}

function normalizeQuestion(item: unknown, index: number): IncluiLabQuestion {
  if (typeof item === 'string') {
    return { number: index + 1, kind: 'short_answer', statement: item, answerLines: 3 };
  }
  if (!isRecord(item)) {
    return { number: index + 1, kind: 'short_answer', statement: `Questao ${index + 1}`, answerLines: 3 };
  }

  const statement =
    asString(item.statement) ||
    asString(item.prompt) ||
    asString(item.question) ||
    asString(item.comando) ||
    asString(item.content) ||
    `Questao ${index + 1}`;

  return {
    number: index + 1,
    kind: asString(item.kind ?? item.type ?? item.tipo) || 'short_answer',
    statement,
    options: asStringArray(item.options ?? item.opcoes, 8),
    answerLines: Math.max(0, Math.min(Number(item.answerLines ?? item.answer_lines ?? item.linhas_resposta ?? 3) || 0, 8)),
    left: asString(item.left),
    right: asString(item.right),
  };
}

function normalizePairs(value: unknown): Array<{ left: string; right: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): { left: string; right: string } | null => {
      if (Array.isArray(item)) {
        return { left: asString(item[0]), right: asString(item[1]) };
      }
      if (!isRecord(item)) return null;
      return {
        left: asString(item.left ?? item.esquerda ?? item.a),
        right: asString(item.right ?? item.direita ?? item.b),
      };
    })
    .filter((pair): pair is { left: string; right: string } => !!pair?.left || !!pair?.right)
    .slice(0, 8);
}

function normalizeSections(value: unknown): IncluiLabSection[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((section): IncluiLabSection => {
      const type = normalizeSectionType(section.type);
      const items = Array.isArray(section.items)
        ? section.items.slice(0, 16) as Array<string | IncluiLabQuestion | Record<string, unknown>>
        : asStringArray(section.items, 16);

      const normalized: IncluiLabSection = {
        type,
        title: asString(section.title ?? section.titulo) || undefined,
        content: asString(section.content ?? section.text ?? section.description) || undefined,
        items,
        options: asStringArray(section.options, 8),
        pairs: normalizePairs(section.pairs ?? section.matchItems ?? section.itens),
        columns: asStringArray(section.columns, 8),
        rows: Array.isArray(section.rows) ? section.rows.slice(0, 12) as Array<string[] | Record<string, unknown>> : [],
        steps: asStringArray(section.steps ?? section.items, 12),
      };

      if (type === 'questions') {
        normalized.items = (Array.isArray(section.items) ? section.items : []).map(normalizeQuestion);
      }

      return normalized;
    })
    .filter(section => section.title || section.content || section.items?.length || section.pairs?.length || section.rows?.length)
    .slice(0, 10);
}

function normalizeStandard(root: Record<string, unknown>, fallback: NormalizeFallback): IncluiLabActivityContent {
  const rawStyle = isRecord(root.visualStyle) ? root.visualStyle : {};
  const sections = normalizeSections(root.sections);

  return {
    title: asString(root.title) || fallback.title || 'Atividade IncluiLAB',
    subtitle: asString(root.subtitle),
    subject: asString(root.subject) || fallback.subject || '',
    grade: asString(root.grade) || fallback.grade || '',
    studentFields: asStringArray(root.studentFields, 6).length
      ? asStringArray(root.studentFields, 6)
      : ['Nome', 'Turma', 'Data'],
    introText: asString(root.introText) || fallback.prompt || 'Leia com atencao e responda as atividades.',
    sections: sections.length ? sections : [{
      type: 'questions',
      title: 'Questoes',
      items: [{ number: 1, kind: 'short_answer', statement: fallback.prompt || 'Registre sua resposta.', answerLines: 4 }],
    }],
    visualStyle: {
      theme: asString(rawStyle.theme) || DEFAULT_STYLE.theme,
      background: asString(rawStyle.background) || DEFAULT_STYLE.background,
      border: asString(rawStyle.border) || DEFAULT_STYLE.border,
      illustrations: asString(rawStyle.illustrations) || DEFAULT_STYLE.illustrations,
      density: asString(rawStyle.density) || DEFAULT_STYLE.density,
    },
  };
}

function questionKindFromLegacy(type: ActivityExercise['type']): string {
  const map: Record<ActivityExercise['type'], string> = {
    multiple_choice: 'multiple_choice',
    short_answer: 'short_answer',
    fill_blank: 'fill_blank',
    matching: 'match',
    drawing: 'coloring',
    ordering: 'steps',
  };
  return map[type] ?? 'short_answer';
}

function fromActivitySchema(activity: ActivitySchema): IncluiLabActivityContent {
  const sections: IncluiLabSection[] = [];
  const instructions = activity.header.instructions.filter(Boolean);

  if (activity.header.objective || instructions.length) {
    sections.push({
      type: 'info_box',
      title: 'Orientacoes',
      content: [activity.header.objective, ...instructions].filter(Boolean).join('\n'),
    });
  }

  const usefulBlocks = activity.blocks.filter(block => block.content || block.items.length);
  for (const block of usefulBlocks.slice(0, 4)) {
    sections.push({
      type: block.type === 'materials' ? 'vocabulary' : block.type === 'instructions' ? 'steps' : 'text',
      title: block.title,
      content: block.content,
      items: block.items,
      steps: block.items,
    });
  }

  sections.push({
    type: 'questions',
    title: 'Questoes',
    items: activity.exercises.map((exercise, index) => ({
      number: index + 1,
      kind: questionKindFromLegacy(exercise.type),
      statement: exercise.prompt,
      options: exercise.options,
      answerLines: exercise.answerLines,
    })),
  });

  return {
    title: activity.header.title || 'Atividade IncluiLAB',
    subtitle: activity.header.theme || '',
    subject: activity.header.theme || '',
    grade: activity.header.level || '',
    studentFields: ['Nome', 'Turma', 'Data'],
    introText: instructions[0] || activity.header.objective || '',
    sections,
    visualStyle: DEFAULT_STYLE,
  };
}

function fromFolhaDoAluno(root: Record<string, unknown>, fallback: NormalizeFallback): IncluiLabActivityContent {
  const folha = isRecord(root.folha_do_aluno) ? root.folha_do_aluno : {};
  const cab = isRecord(folha.cabecalho) ? folha.cabecalho : {};
  const exercicios = Array.isArray(folha.exercicios) ? folha.exercicios : [];
  const instrucoes = asStringArray(folha.instrucoes_simplificadas, 6);

  return {
    title: asString(folha.titulo) || fallback.title || 'Atividade IncluiLAB',
    subtitle: asString(cab.tema),
    subject: asString(cab.disciplina),
    grade: asString(cab.ano),
    studentFields: ['Nome', 'Turma', 'Data'],
    introText: asString(folha.objetivo_simplificado) || instrucoes.join('\n') || fallback.prompt || '',
    sections: [
      ...(instrucoes.length ? [{ type: 'steps' as const, title: 'Como fazer', steps: instrucoes }] : []),
      {
        type: 'questions',
        title: 'Questoes',
        items: exercicios.map(normalizeQuestion),
      },
    ],
    visualStyle: DEFAULT_STYLE,
  };
}

function fromLegacyText(text: string, fallback: NormalizeFallback): IncluiLabActivityContent {
  const lines = text
    .split('\n')
    .map(line => line.replace(/^#+\s*/, '').replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean);

  const title = fallback.title || lines[0] || 'Atividade IncluiLAB';
  const intro = fallback.prompt || lines[1] || 'Atividade salva anteriormente na biblioteca.';
  const questions = lines.slice(2, 8);

  return {
    title,
    subtitle: '',
    subject: fallback.subject || '',
    grade: fallback.grade || '',
    studentFields: ['Nome', 'Turma', 'Data'],
    introText: intro,
    sections: [
      { type: 'text', title: 'Conteudo salvo', content: intro },
      {
        type: 'questions',
        title: 'Registro',
        items: (questions.length ? questions : ['Registre sua resposta.']).map((statement, index) => ({
          number: index + 1,
          kind: 'short_answer',
          statement,
          answerLines: 3,
        })),
      },
    ],
    visualStyle: DEFAULT_STYLE,
  };
}

export function normalizeIncluiLabActivity(input: unknown, fallback: NormalizeFallback = {}): IncluiLabActivityContent {
  const parsed = parseMaybeJson(input);

  if (isRecord(parsed)) {
    if (Array.isArray(parsed.sections) || Array.isArray(parsed.studentFields)) {
      return normalizeStandard(parsed, fallback);
    }

    if (isRecord(parsed.header) && Array.isArray(parsed.exercises)) {
      return fromActivitySchema(parsed as unknown as ActivitySchema);
    }

    if (isRecord(parsed.folha_do_aluno)) {
      return fromFolhaDoAluno(parsed, fallback);
    }
  }

  if (typeof input === 'string') {
    return fromLegacyText(input, fallback);
  }

  return normalizeStandard({}, fallback);
}

export function getStoredContentJson(row: Record<string, unknown>): unknown {
  const contentJson = row.content_json;
  if (isRecord(contentJson) && Object.keys(contentJson).length > 0) return contentJson;
  if (typeof contentJson === 'string' && contentJson.trim() && contentJson.trim() !== '{}') return contentJson;
  return row.content;
}

export function sanitizePdfFilename(title: string): string {
  const clean = (title || 'atividade-incluilab')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 80);
  return `${clean || 'atividade-incluilab'}.pdf`;
}
