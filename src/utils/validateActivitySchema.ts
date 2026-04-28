import type {
  ActivityAccessibilityNotes,
  ActivityBlock,
  ActivityBlockType,
  ActivityExercise,
  ActivityExerciseType,
  ActivityHeader,
  ActivitySchema,
  ActivityVisualAsset,
  GuiaPedagogico,
} from '../types';

export class ActivitySchemaValidationError extends Error {
  constructor(message = 'A IA retornou texto fora do formato esperado.') {
    super(message);
    this.name = 'ActivitySchemaValidationError';
  }
}

const BLOCK_TYPES: ActivityBlockType[] = [
  'instructions',
  'materials',
  'visual',
  'practice',
  'teacher_note',
  'accessibility',
];

const EXERCISE_TYPES: ActivityExerciseType[] = [
  'multiple_choice',
  'short_answer',
  'fill_blank',
  'matching',
  'drawing',
  'ordering',
];

// Mapeamento dos tipos da folha_do_aluno → tipos canônicos
const FOLHA_EXERCISE_TYPE_MAP: Record<string, ActivityExerciseType> = {
  multipla_escolha: 'multiple_choice',
  ligar_colunas:    'matching',
  completar_frase:  'fill_blank',
  circular:         'multiple_choice',
  desenho:          'drawing',
  resposta_curta:   'short_answer',
  verdadeiro_falso: 'multiple_choice',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown, limit = 12): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (!Array.isArray(value)) return [];
  return value
    .map(asString)
    .filter(Boolean)
    .slice(0, limit);
}

function asPositiveInt(value: unknown, fallback: number, max = 8): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.round(n), max);
}

function normalizeBlockType(value: unknown): ActivityBlockType {
  const type = asString(value) as ActivityBlockType;
  return BLOCK_TYPES.includes(type) ? type : 'practice';
}

function normalizeExerciseType(value: unknown): ActivityExerciseType {
  const raw = asString(value);
  // Tenta mapeamento do formato folha_do_aluno primeiro
  if (FOLHA_EXERCISE_TYPE_MAP[raw]) return FOLHA_EXERCISE_TYPE_MAP[raw];
  const type = raw as ActivityExerciseType;
  return EXERCISE_TYPES.includes(type) ? type : 'short_answer';
}

function parseStrictJson(input: string): unknown {
  const trimmed = input.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    throw new ActivitySchemaValidationError();
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    throw new ActivitySchemaValidationError('A IA retornou um JSON invalido. Tente gerar novamente.');
  }
}

function normalizeHeader(root: Record<string, unknown>): ActivityHeader {
  const rawHeader = isRecord(root.header) ? root.header : root;
  const title = asString(rawHeader.title ?? root.title);
  const theme = asString(rawHeader.theme ?? root.theme);
  const objective = asString(rawHeader.objective ?? root.objective);

  if (!title || !theme || !objective) {
    throw new ActivitySchemaValidationError(
      'A atividade veio incompleta. Gere novamente para obter titulo, tema e objetivo.',
    );
  }

  return {
    title,
    theme,
    objective,
    level: asString(rawHeader.level ?? root.level) || undefined,
    estimatedTime: asString(rawHeader.estimatedTime ?? rawHeader.estimated_time ?? root.estimatedTime) || undefined,
    instructions: asStringArray(rawHeader.instructions ?? root.instructions, 6),
  };
}

// Constrói header a partir do bloco folha_do_aluno
function normalizeHeaderFromFolha(fa: Record<string, unknown>): ActivityHeader {
  const cab = isRecord(fa.cabecalho) ? fa.cabecalho : {};
  const title = asString(fa.titulo ?? cab.tema ?? '');
  const theme = asString(cab.disciplina ?? cab.tema ?? fa.titulo ?? '');
  const objective = asString(fa.objetivo_simplificado ?? '');

  if (!title) {
    throw new ActivitySchemaValidationError(
      'A atividade veio incompleta (folha_do_aluno sem titulo). Gere novamente.',
    );
  }

  return {
    title,
    theme: theme || title,
    objective: objective || title,
    level: asString(cab.ano) || undefined,
    estimatedTime: undefined,
    instructions: asStringArray(fa.instrucoes_simplificadas, 6),
  };
}

function normalizeVisualAssets(value: unknown): ActivityVisualAsset[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((asset, index): ActivityVisualAsset => {
      const title = asString(asset.title ?? asset.titulo) || `Recurso visual ${index + 1}`;
      const description = asString(asset.description ?? asset.texto_apoio) || title;
      const rawType = asString(asset.type) as ActivityVisualAsset['type'];
      const type: ActivityVisualAsset['type'] =
        rawType === 'image' || rawType === 'icon' || rawType === 'diagram' || rawType === 'symbol' || rawType === 'placeholder'
          ? rawType
          : 'placeholder';
      const urlGerada = asString(asset.url_gerada ?? asset.url) || undefined;

      return {
        id: asString(asset.id) || `visual-${index + 1}`,
        type: urlGerada ? 'image' : type,
        title,
        description,
        altText: asString(asset.altText ?? asset.alt_text) || description,
        url: urlGerada,
        imagePrompt: asString(asset.prompt_ia_imagem ?? asset.imagePrompt) || undefined,
        fallbackEmoji: asString(asset.fallback_emoji ?? asset.fallbackEmoji) || undefined,
      };
    })
    .slice(0, 2);
}

// Normaliza conteudo_visual da folha_do_aluno como visualAssets
function normalizeConteudoVisual(value: unknown): ActivityVisualAsset[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item, index): ActivityVisualAsset => {
      const title = asString(item.titulo) || `Conteúdo visual ${index + 1}`;
      const description = asString(item.texto_apoio) || title;
      const urlGerada = asString(item.url_gerada) || undefined;
      const posicao = Number(item.posicao ?? index + 1);
      return {
        id: asString(item.id) || `cv-${posicao}`,
        type: urlGerada ? 'image' : 'placeholder',
        title,
        description,
        altText: description,
        url: urlGerada,
        imagePrompt: asString(item.prompt_ia_imagem) || undefined,
        fallbackEmoji: asString(item.fallback_emoji) || undefined,
      };
    })
    .slice(0, 2);
}

function normalizeBlocks(value: unknown): ActivityBlock[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((block, index): ActivityBlock => ({
      id: asString(block.id) || `block-${index + 1}`,
      type: normalizeBlockType(block.type),
      title: asString(block.title) || `Bloco ${index + 1}`,
      content: asString(block.content) || undefined,
      items: asStringArray(block.items, 8),
      visualAssetIds: asStringArray(block.visualAssetIds ?? block.visual_asset_ids, 6),
    }))
    .filter(block => block.content || block.items.length > 0 || block.visualAssetIds.length > 0)
    .slice(0, 8);
}

function normalizeExercises(value: unknown): ActivityExercise[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ActivitySchemaValidationError(
      'A atividade precisa trazer pelo menos um exercicio estruturado. Gere novamente.',
    );
  }

  const exercises = value
    .filter(isRecord)
    .map((exercise, index): ActivityExercise => {
      const rawTipo = asString(exercise.tipo ?? exercise.type);
      const type = normalizeExerciseType(rawTipo);
      const prompt = asString(exercise.comando ?? exercise.prompt ?? exercise.statement ?? exercise.question);
      const title = asString(exercise.titulo ?? exercise.title) || `Atividade ${index + 1}`;

      if (!prompt) {
        throw new ActivitySchemaValidationError(
          'Um dos exercicios veio sem enunciado. Gere novamente.',
        );
      }

      // Para verdadeiro_falso: garantir options padrão
      let options = asStringArray(exercise.opcoes ?? exercise.options, 6);
      if (rawTipo === 'verdadeiro_falso' && options.length === 0) {
        options = ['Verdadeiro', 'Falso'];
      }
      // Para ligar_colunas: juntar itens_esquerda + itens_direita em options
      if (rawTipo === 'ligar_colunas' && options.length === 0) {
        const left = asStringArray(exercise.itens_esquerda, 6);
        const right = asStringArray(exercise.itens_direita, 6);
        options = [...left, ...right];
      }

      return {
        id: asString(exercise.id) || `exercise-${index + 1}`,
        type,
        title,
        prompt,
        options,
        answerLines: asPositiveInt(exercise.linhas_resposta ?? exercise.answerLines ?? exercise.answer_lines, type === 'drawing' ? 1 : 3),
        supportHint: asString(exercise.dica_visual ?? exercise.supportHint ?? exercise.support_hint) || undefined,
        visualAssetId: asString(exercise.visualAssetId ?? exercise.visual_asset_id) || undefined,
      };
    })
    .slice(0, 5);

  if (exercises.length === 0) {
    throw new ActivitySchemaValidationError(
      'A atividade precisa trazer exercicios em objetos JSON. Gere novamente.',
    );
  }

  return exercises;
}

// Normaliza exercicios da folha_do_aluno, extraindo também visual assets inline
function normalizeFolhaExercicios(value: unknown, existingAssets: ActivityVisualAsset[]): {
  exercises: ActivityExercise[];
  extraAssets: ActivityVisualAsset[];
} {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ActivitySchemaValidationError(
      'A atividade precisa trazer pelo menos um exercicio na folha_do_aluno. Gere novamente.',
    );
  }

  const extraAssets: ActivityVisualAsset[] = [];
  const existingIds = new Set(existingAssets.map(a => a.id));

  const exercises = value
    .filter(isRecord)
    .map((ex, index): ActivityExercise => {
      const rawTipo = asString(ex.tipo ?? ex.type);
      const type = normalizeExerciseType(rawTipo);
      const prompt = asString(ex.comando ?? ex.prompt ?? ex.question);
      const title = asString(ex.titulo ?? ex.title) || `Atividade ${index + 1}`;

      if (!prompt) {
        throw new ActivitySchemaValidationError(
          'Um dos exercicios veio sem enunciado (comando). Gere novamente.',
        );
      }

      let options = asStringArray(ex.opcoes ?? ex.options, 6);
      if (rawTipo === 'verdadeiro_falso' && options.length === 0) {
        options = ['Verdadeiro', 'Falso'];
      }
      if (rawTipo === 'ligar_colunas' && options.length === 0) {
        const left = asStringArray(ex.itens_esquerda, 6);
        const right = asStringArray(ex.itens_direita, 6);
        options = [...left, ...right];
      }

      // Se o exercício tem prompt_ia_imagem, criar um visual asset para ele
      const imgPrompt = asString(ex.prompt_ia_imagem);
      let visualAssetId = asString(ex.visualAssetId ?? ex.visual_asset_id) || undefined;
      if (imgPrompt && !visualAssetId) {
        const assetId = `ex-visual-${index + 1}`;
        if (!existingIds.has(assetId)) {
          existingIds.add(assetId);
          extraAssets.push({
            id: assetId,
            type: 'placeholder',
            title,
            description: imgPrompt,
            altText: title,
            imagePrompt: imgPrompt,
            fallbackEmoji: asString(ex.fallback_emoji) || undefined,
          });
        }
        visualAssetId = assetId;
      }

      return {
        id: asString(ex.id) || `exercise-${index + 1}`,
        type,
        title,
        prompt,
        options,
        answerLines: asPositiveInt(ex.linhas_resposta ?? ex.answerLines, type === 'drawing' ? 1 : 3),
        supportHint: asString(ex.dica_visual ?? ex.supportHint) || undefined,
        visualAssetId,
      };
    })
    .slice(0, 5);

  if (exercises.length === 0) {
    throw new ActivitySchemaValidationError(
      'A atividade precisa trazer exercicios em objetos JSON. Gere novamente.',
    );
  }

  return { exercises, extraAssets };
}

function normalizeAccessibilityNotes(value: unknown): ActivityAccessibilityNotes {
  const raw = isRecord(value) ? value : {};
  return {
    supports: asStringArray(raw.supports, 8),
    adaptations: asStringArray(raw.adaptations, 8),
    teacherNotes: asStringArray(raw.teacherNotes ?? raw.teacher_notes, 8),
  };
}

function normalizeGuiaPedagogico(value: unknown): GuiaPedagogico | undefined {
  if (!isRecord(value)) return undefined;
  return {
    objetivo_da_aula:    asString(value.objetivo_da_aula),
    metodologia_adaptada: asString(value.metodologia_adaptada),
    dicas_de_mediacao:   asStringArray(value.dicas_de_mediacao, 8),
    criterios_de_avaliacao: asStringArray(value.criterios_de_avaliacao, 8),
    materiais_necessarios: asStringArray(value.materiais_necessarios, 8),
    tempo_estimado:      asString(value.tempo_estimado),
    adaptacoes_inclusivas: asStringArray(value.adaptacoes_inclusivas, 8),
  };
}

export function validateActivitySchema(input: unknown): ActivitySchema {
  const parsed = typeof input === 'string' ? parseStrictJson(input) : input;
  if (!isRecord(parsed)) {
    throw new ActivitySchemaValidationError();
  }

  const guia_pedagogico = normalizeGuiaPedagogico(parsed.guia_pedagogico);

  // Novo formato: folha_do_aluno presente
  if (isRecord(parsed.folha_do_aluno)) {
    const fa = parsed.folha_do_aluno;

    const header = normalizeHeaderFromFolha(fa);
    const visualAssets = normalizeConteudoVisual(fa.conteudo_visual);
    const { exercises, extraAssets } = normalizeFolhaExercicios(fa.exercicios, visualAssets);
    const allAssets = [...visualAssets, ...extraAssets];

    // Acessibilidade: derivar do guia_pedagogico se disponível
    const accessibilityNotes: ActivityAccessibilityNotes = {
      supports: guia_pedagogico?.adaptacoes_inclusivas?.slice(0, 4) ?? [],
      adaptations: guia_pedagogico?.dicas_de_mediacao?.slice(0, 4) ?? [],
      teacherNotes: guia_pedagogico ? [
        guia_pedagogico.metodologia_adaptada,
        ...guia_pedagogico.criterios_de_avaliacao.slice(0, 2),
      ].filter(Boolean) : [],
    };

    const rawFooter = isRecord(parsed.footer) ? parsed.footer : {};

    return {
      schemaVersion: '1.0',
      header,
      blocks: [],
      exercises,
      visualAssets: allAssets,
      accessibilityNotes,
      guia_pedagogico,
      footer: {
        note: asString(rawFooter.note) || 'Atividade gerada pelo IncluiLAB.',
        generatedBy: asString(rawFooter.generatedBy ?? rawFooter.generated_by) || 'IncluiLAB',
      },
    };
  }

  // Formato legado: header + exercises
  const header = normalizeHeader(parsed);
  const exercises = normalizeExercises(parsed.exercises);
  const blocks = normalizeBlocks(parsed.blocks);
  const visualAssets = normalizeVisualAssets(parsed.visualAssets ?? parsed.visual_assets);
  const accessibilityNotes = normalizeAccessibilityNotes(parsed.accessibilityNotes ?? parsed.accessibility_notes);
  const rawFooter = isRecord(parsed.footer) ? parsed.footer : {};

  return {
    schemaVersion: '1.0',
    header,
    blocks,
    exercises,
    visualAssets,
    accessibilityNotes,
    guia_pedagogico,
    footer: {
      note: asString(rawFooter.note) || 'Atividade gerada pelo IncluiLAB.',
      generatedBy: asString(rawFooter.generatedBy ?? rawFooter.generated_by) || 'IncluiLAB',
    },
  };
}

export function isActivitySchemaValidationError(error: unknown): error is ActivitySchemaValidationError {
  return error instanceof ActivitySchemaValidationError;
}
