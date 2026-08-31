import type { StudentPedagogicalContext } from '../../types';

const EMPTY_CONTEXT: StudentPedagogicalContext = {
  hasContext: false,
  isInsufficient: true,
  diagnoses: [],
  communication: [],
  attention: [],
  autonomy: [],
  commandComprehension: [],
  motorCoordination: [],
  priorKnowledge: [],
  barriers: [],
  strengths: [],
  interests: [],
  helpfulSupports: [],
  difficultSupports: [],
  responseModes: [],
  peiPaeeGoals: [],
  pedagogicalNotes: [],
  recentRecords: [],
  sourceSummary: [],
  insufficiencyReason: 'Nenhum aluno selecionado ou nenhum contexto pedagógico funcional foi carregado.',
};

const CATEGORY_PATTERNS: Array<{
  key: keyof Pick<StudentPedagogicalContext,
    'communication' | 'attention' | 'autonomy' | 'commandComprehension' | 'motorCoordination' |
    'priorKnowledge' | 'barriers' | 'strengths' | 'interests' | 'helpfulSupports' |
    'difficultSupports' | 'responseModes' | 'peiPaeeGoals' | 'pedagogicalNotes' | 'recentRecords'
  >;
  pattern: RegExp;
}> = [
  { key: 'communication', pattern: /comunica|linguagem|fala|oral|expressiva/i },
  { key: 'attention', pattern: /aten[cç][aã]o|autorregula|concentra|sustenta/i },
  { key: 'autonomy', pattern: /autonomia|avd|independen|media[cç][aã]o|apoio/i },
  { key: 'commandComprehension', pattern: /compreens[aã]o|comando|instru[cç][aã]o|uma a[cç][aã]o|passo a passo/i },
  { key: 'motorCoordination', pattern: /motricidade|motor|coordena[cç][aã]o|escrita longa|grafomotor/i },
  { key: 'priorKnowledge', pattern: /conhecimento|sabe|reconhece|domina|aprendeu/i },
  { key: 'barriers', pattern: /barreira|dificuldade|desafio|alerta|baixo|necessita|precisa/i },
  { key: 'strengths', pattern: /potencialidade|habilidade|for[cç]a|facilidade|boa resposta|melhor/i },
  { key: 'interests', pattern: /interesse|prefer[eê]ncia|gosta|motiva/i },
  { key: 'helpfulSupports', pattern: /estrat[eé]gia|recurso|ajuda|auxilia|funciona|recomenda/i },
  { key: 'difficultSupports', pattern: /dificulta|evitar|n[aã]o funciona|gatilho|sobrecarga/i },
  { key: 'responseModes', pattern: /responde|resposta|selecionar|associa|ligar|oral|palavra-chave|marcar|completar/i },
  { key: 'peiPaeeGoals', pattern: /\bpei\b|\bpaee\b|objetivo|meta/i },
  { key: 'pedagogicalNotes', pattern: /observa[cç][aã]o|ponto pedag[oó]gico|parecer|sugest[aã]o/i },
  { key: 'recentRecords', pattern: /avalia[cç][aã]o de|ficha|relat[oó]rio|registro|documento|perfil cognitivo/i },
];

function cloneEmpty(): StudentPedagogicalContext {
  return {
    ...EMPTY_CONTEXT,
    diagnoses: [],
    communication: [],
    attention: [],
    autonomy: [],
    commandComprehension: [],
    motorCoordination: [],
    priorKnowledge: [],
    barriers: [],
    strengths: [],
    interests: [],
    helpfulSupports: [],
    difficultSupports: [],
    responseModes: [],
    peiPaeeGoals: [],
    pedagogicalNotes: [],
    recentRecords: [],
    sourceSummary: [],
  };
}

function compact(value: string): string {
  return value.replace(/^[\s•\-:]+/, '').replace(/\s+/g, ' ').trim();
}

function pushUnique(target: string[], value: string, limit = 8): void {
  const clean = compact(value);
  if (!clean || target.some(item => item.toLowerCase() === clean.toLowerCase())) return;
  if (target.length < limit) target.push(clean);
}

function firstNameFrom(line: string): string | undefined {
  const match = line.match(/\bAluno(?:\(a\))?:\s*([^\n|]+)/i);
  const raw = match?.[1]?.trim();
  if (!raw) return undefined;
  return raw.split(/\s+/)[0];
}

function gradeFrom(line: string): string | undefined {
  const match = line.match(/(?:Ano\/S[eé]rie|S[eé]rie|Turma):\s*([^\n|]+)/i);
  return match?.[1]?.trim();
}

function diagnosisFrom(line: string): string | undefined {
  const match = line.match(/Diagn[oó]stico\(s\):\s*(.+)$/i);
  return match?.[1]?.trim();
}

function isIdentificationOnly(line: string): boolean {
  return /^(Aluno|Ano\/S[eé]rie|S[eé]rie|Diagn[oó]stico|N[ií]vel de suporte|=====|---)/i.test(line.trim());
}

function addScoreSignals(ctx: StudentPedagogicalContext, line: string): void {
  const match = line.match(/([^:]+):\s*([1-5])\/5/i);
  if (!match) return;
  const label = compact(match[1]);
  const score = Number(match[2]);
  if (!Number.isFinite(score)) return;
  if (score <= 2) pushUnique(ctx.barriers, `${label} ${score}/5`, 10);
  if (score >= 4) pushUnique(ctx.strengths, `${label} ${score}/5`, 10);
}

export function buildStudentPedagogicalContext(rawContext?: string): StudentPedagogicalContext {
  if (!rawContext?.trim()) return cloneEmpty();

  const ctx = cloneEmpty();
  ctx.hasContext = true;
  const lines = rawContext.split(/\r?\n/).map(compact).filter(Boolean);
  let functionalLines = 0;

  for (const line of lines) {
    ctx.firstName ||= firstNameFrom(line);
    ctx.grade ||= gradeFrom(line);
    const diagnosis = diagnosisFrom(line);
    if (diagnosis) diagnosis.split(/[,;]/).forEach(item => pushUnique(ctx.diagnoses, item, 4));
    addScoreSignals(ctx, line);

    if (!isIdentificationOnly(line)) {
      functionalLines += 1;
      pushUnique(ctx.sourceSummary, line, 14);
    }

    for (const { key, pattern } of CATEGORY_PATTERNS) {
      if (pattern.test(line)) pushUnique(ctx[key], line, 8);
    }
  }

  ctx.readingLevel = ctx.communication.find(item => /leitura|l[eê]/i.test(item));
  ctx.writingLevel = ctx.motorCoordination.find(item => /escrit|graf/i.test(item));

  const hasFunctionalEvidence = functionalLines > 0 || ctx.barriers.length > 0 || ctx.strengths.length > 0 ||
    ctx.helpfulSupports.length > 0 || ctx.responseModes.length > 0 || ctx.pedagogicalNotes.length > 0;
  ctx.isInsufficient = !hasFunctionalEvidence;
  ctx.insufficiencyReason = ctx.isInsufficient
    ? 'O contexto carregado tem identificação/diagnóstico, mas não traz evidências funcionais suficientes para personalização individual.'
    : undefined;

  return ctx;
}

export function formatStudentPedagogicalContextForPrompt(ctx?: StudentPedagogicalContext): string {
  if (!ctx?.hasContext) {
    return [
      'Contexto individual: insuficiente ou ausente.',
      'Use adaptação pedagógica geral baseada em acessibilidade e DUA. Não declare personalização individual.',
    ].join('\n');
  }

  const lines: string[] = [];
  if (ctx.firstName) lines.push(`Primeiro nome: ${ctx.firstName}`);
  if (ctx.grade) lines.push(`Ano/série: ${ctx.grade}`);
  if (ctx.diagnoses.length) lines.push(`Diagnóstico informado no sistema (não usar isoladamente): ${ctx.diagnoses.join('; ')}`);
  if (ctx.readingLevel) lines.push(`Leitura: ${ctx.readingLevel}`);
  if (ctx.writingLevel) lines.push(`Escrita/motricidade fina: ${ctx.writingLevel}`);
  addList(lines, 'Comunicação', ctx.communication);
  addList(lines, 'Atenção/autorregulação', ctx.attention);
  addList(lines, 'Autonomia/mediação', ctx.autonomy);
  addList(lines, 'Compreensão de comandos', ctx.commandComprehension);
  addList(lines, 'Conhecimentos prévios', ctx.priorKnowledge);
  addList(lines, 'Barreiras funcionais', ctx.barriers);
  addList(lines, 'Potencialidades', ctx.strengths);
  addList(lines, 'Interesses/preferências', ctx.interests);
  addList(lines, 'Recursos que ajudam', ctx.helpfulSupports);
  addList(lines, 'Formas de resposta possíveis', ctx.responseModes);
  addList(lines, 'Objetivos PEI/PAEE ou registros pedagógicos', [...ctx.peiPaeeGoals, ...ctx.pedagogicalNotes]);
  addList(lines, 'Registros recentes', ctx.recentRecords);
  if (ctx.isInsufficient) lines.push(`Contexto individual insuficiente: ${ctx.insufficiencyReason}`);
  return lines.join('\n');
}

function addList(lines: string[], label: string, values: string[]): void {
  const clean = values.slice(0, 5).filter(Boolean);
  if (clean.length) lines.push(`${label}: ${clean.join(' | ')}`);
}
