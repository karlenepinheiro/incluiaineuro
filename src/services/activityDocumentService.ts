// activityDocumentService.ts — Gerador Automático de Atividades por Disciplina
// Arquitetura: IA gera SOMENTE conteúdo JSON → sistema renderiza template fixo por disciplina

import { AtividadeJSON, DisciplinaKey, Student, User } from '../types';
import { AIService } from './aiService';
import type { ActivityGenOptions } from './aiService';

// ─── Config por disciplina ─────────────────────────────────────────────────────

export interface DisciplinaConfig {
  key: DisciplinaKey;
  label: string;
  labelShort: string;
  accent: string;
  accentLight: string;
  accentMid: string;
  emoji: string;
  promptHint: string;
}

export const DISCIPLINAS: Record<DisciplinaKey, DisciplinaConfig> = {
  matematica: {
    key: 'matematica',
    label: 'Matemática',
    labelShort: 'MAT',
    accent: '#2563EB',
    accentLight: '#EFF6FF',
    accentMid: '#BFDBFE',
    emoji: '📐',
    promptHint: 'Use enunciados com números, operações, medidas ou figuras geométricas. Questões práticas e concretas.',
  },
  portugues: {
    key: 'portugues',
    label: 'Língua Portuguesa',
    labelShort: 'PORT',
    accent: '#1F4E5F',
    accentLight: '#F0F7FA',
    accentMid: '#BAD8E4',
    emoji: '📖',
    promptHint: 'Use enunciados sobre leitura, escrita, gramática ou interpretação. Linguagem clara e adequada ao nível.',
  },
  ciencias: {
    key: 'ciencias',
    label: 'Ciências',
    labelShort: 'CIE',
    accent: '#16A34A',
    accentLight: '#F0FDF4',
    accentMid: '#BBF7D0',
    emoji: '🔬',
    promptHint: 'Use enunciados sobre fenômenos naturais, seres vivos, corpo humano ou experimentos simples.',
  },
  ingles: {
    key: 'ingles',
    label: 'Inglês',
    labelShort: 'ING',
    accent: '#7C3AED',
    accentLight: '#F5F3FF',
    accentMid: '#DDD6FE',
    emoji: '🌍',
    promptHint: 'As questões podem misturar português e inglês. Use vocabulário, frases simples e contexto comunicativo. O título e subtítulo devem estar em português; os enunciados das questões podem estar em inglês quando pertinente.',
  },
  geografia: {
    key: 'geografia',
    label: 'Geografia',
    labelShort: 'GEO',
    accent: '#D97706',
    accentLight: '#FFFBEB',
    accentMid: '#FDE68A',
    emoji: '🗺️',
    promptHint: 'Use enunciados sobre mapas, regiões, países, biomas, clima ou espaço geográfico brasileiro.',
  },
  geral: {
    key: 'geral',
    label: 'Atividade Geral',
    labelShort: 'GER',
    accent: '#1F4E5F',
    accentLight: '#F0F7FA',
    accentMid: '#BAD8E4',
    emoji: '📋',
    promptHint: 'Use enunciados práticos, claros e adequados ao nível e diagnóstico do aluno.',
  },
};

// ─── Keywords para detecção automática ────────────────────────────────────────

const KEYWORDS: Record<DisciplinaKey, string[]> = {
  matematica: [
    'matemática', 'matematica', 'número', 'numero', 'contagem', 'soma', 'subtração',
    'subtracao', 'multiplicação', 'multiplicacao', 'divisão', 'divisao', 'adição',
    'adicao', 'fração', 'fracao', 'geometria', 'medida', 'metro', 'álgebra',
    'algebra', 'equação', 'equacao', 'cálculo', 'calculo', 'tabuada', 'dezena',
    'centena', 'unidade', 'metro', 'quilômetro', 'peso', 'litro', 'perímetro',
    'perimetro', 'área', 'area', 'volume', 'dinheiro', 'moeda', 'troco',
  ],
  portugues: [
    'português', 'portugues', 'leitura', 'escrita', 'texto', 'redação', 'redacao',
    'gramática', 'gramatica', 'ortografia', 'letra', 'sílaba', 'silaba', 'vogal',
    'consoante', 'palavra', 'frase', 'poema', 'ditado', 'interpretação', 'interpretacao',
    'pontuação', 'pontuacao', 'verbo', 'substantivo', 'adjetivo', 'história',
    'historinha', 'conto', 'parlenda', 'consciência fonológica', 'alfabetização',
    'alfabetizacao', 'silabário',
  ],
  ciencias: [
    'ciências', 'ciencias', 'ciência', 'biologia', 'química', 'quimica', 'física',
    'fisica', 'planta', 'animal', 'corpo humano', 'célula', 'celula', 'ecologia',
    'meio ambiente', 'experimento', 'natureza', 'ser vivo', 'sistema solar',
    'planeta', 'fotossíntese', 'fotossintese', 'nutrição', 'nutricao', 'saúde',
    'saude', 'higiene', 'mineral', 'rocha', 'solo', 'água', 'ar', 'energia',
  ],
  ingles: [
    'inglês', 'ingles', 'english', 'vocabulary', 'verb', 'sentence', 'story',
    'reading', 'listening', 'speaking', 'writing', 'colors', 'colours', 'numbers',
    'animals', 'food', 'family', 'school', 'greetings',
  ],
  geografia: [
    'geografia', 'mapa', 'região', 'regiao', 'país', 'pais', 'estado', 'capital',
    'continente', 'latitude', 'longitude', 'relevo', 'clima', 'bioma', 'população',
    'populacao', 'urbanização', 'urbanizacao', 'espaço geográfico', 'localização',
    'localizacao', 'município', 'municipio', 'fronteira', 'território', 'territorio',
    'hidrografia', 'rio', 'oceano', 'floresta', 'cerrado', 'caatinga', 'pantanal',
  ],
  geral: [],
};

// ─── detectDiscipline ──────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function detectDiscipline(input: string): DisciplinaKey {
  const normalized = normalize(input);
  const scores: Partial<Record<DisciplinaKey, number>> = {};

  for (const [key, words] of Object.entries(KEYWORDS) as [DisciplinaKey, string[]][]) {
    if (key === 'geral') continue;
    let score = 0;
    for (const word of words) {
      if (normalized.includes(normalize(word))) score++;
    }
    if (score > 0) scores[key] = score;
  }

  if (Object.keys(scores).length === 0) return 'geral';

  return (Object.entries(scores) as [DisciplinaKey, number][]).reduce(
    (best, [k, v]) => (v > (scores[best] ?? 0) ? k : best),
    Object.keys(scores)[0] as DisciplinaKey,
  );
}

// ─── Prompt JSON (PARTE 3) ─────────────────────────────────────────────────────

export function buildActivityPrompt(
  topic: string,
  student: Student,
  disciplina: DisciplinaKey,
  opts: { grade?: string; period?: string; bncc?: string },
): string {
  const cfg = DISCIPLINAS[disciplina];
  const diagnosis = (student.diagnosis || []).join(', ') || 'Não informado';

  return `Você é uma pedagoga especialista em AEE e educação inclusiva brasileira.
Crie uma atividade pedagógica adaptada para o aluno descrito abaixo.

DISCIPLINA: ${cfg.label}
TEMA: ${topic}

DADOS DO ALUNO:
- Nome: ${student.name}
- Diagnóstico(s): ${diagnosis}
- Nível de suporte: ${student.supportLevel || 'Não informado'}
- Ano/Série: ${opts.grade || 'Não informado'}
${opts.period ? `- Período/Unidade: ${opts.period}` : ''}
${opts.bncc ? `- BNCC: ${opts.bncc}` : ''}

ORIENTAÇÃO DA DISCIPLINA:
${cfg.promptHint}

REGRAS ABSOLUTAS:
1. Idioma: SOMENTE português do Brasil (exceto questões de inglês quando disciplina=ingles).
2. Linguagem simples, clara e pedagógica.
3. Gere 3 a 5 questoes no maximo; atividades simples devem ter 3 questoes.
4. Questoes praticas, concretas e adaptadas ao diagnostico do aluno, com comandos curtos.
5. Nao inclua metodologia, materiais, observacoes do professor ou guia pedagogico na folha do aluno.
6. Nao invente termos medicos ou palavras inexistentes.
7. O campo "disciplina" deve ser EXATAMENTE um destes valores: matematica | portugues | ciencias | ingles | geografia | geral

RETORNE SOMENTE o JSON abaixo, sem markdown, sem explicações adicionais:
{
  "disciplina": "${disciplina}",
  "titulo": "Título claro da atividade em português",
  "subtitulo": "Texto curto opcional, sem explicacao pedagogica",
  "instrucao": "Instrucao curta e direta para o aluno",
  "objetivo": "Frase curta para referencia interna; nao deve virar bloco longo na folha",
  "questoes": [
    "Enunciado completo da questão 1",
    "Enunciado completo da questão 2",
    "Enunciado completo da questão 3",
    "Enunciado completo da questão 4"
  ],
  "observacao_professor": "Orientacao separada para o professor; nao misturar na folha do aluno",
  "nivel_dificuldade": "Fácil | Médio | Difícil"
}`;
}

// ─── generateActivityDocument (fluxo final - PARTE 5) ─────────────────────────

export async function generateActivityDocument(
  topic: string,
  student: Student,
  user: User,
  options?: ActivityGenOptions,
): Promise<AtividadeJSON> {
  const combinedText = [options?.discipline || '', topic].join(' ').trim();
  const disciplina = detectDiscipline(combinedText);

  const enriched: ActivityGenOptions = {
    ...options,
    discipline: DISCIPLINAS[disciplina].label,
  };

  const atividade = await AIService.generateActivityStructured(topic, student, user, enriched);

  const disciplinaFinal: DisciplinaKey =
    atividade.disciplina && atividade.disciplina in DISCIPLINAS
      ? (atividade.disciplina as DisciplinaKey)
      : disciplina;

  return { ...atividade, disciplina: disciplinaFinal };
}
