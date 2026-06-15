// reportService.ts — Geração de Relatórios do Aluno
// Suporta modo 'simples', 'completo' e 'inss' (declaração escolar institucional)
import { Student, User, DocField, SchoolConfig } from '../types';
import { AIService } from './aiService';
import { CanonicalStudentContextService } from './canonicalStudentContext';
import generateReportFull from '../prompts/generate-report-full.md?raw';
import generateReportSimple from '../prompts/generate-report-simple.md?raw';
import generateReportInss from '../prompts/reports/relatorio-inss.prompt.md?raw';
import { generateDocumentCode } from '../utils/documentCodes';
import { callAIGateway } from './aiGatewayService';
import { AI_CREDIT_COSTS } from '../config/aiCosts';

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export type ReportMode = 'simples' | 'completo' | 'inss';

export interface ChecklistItem {
  area: string;
  presente: boolean;
  grau: 'leve' | 'moderado' | 'intenso' | null;
  obs: string;
}

/** Estrutura retornada pelo modo SIMPLES */
export interface RelatorioSimples {
  tipo: 'simples' | 'inss';
  identificacao: string;
  situacaoPedagogicaAtual: string;
  situacaoFuncional: string;
  dificuldades: string[];
  observacoesRelevantes: string;
  conclusao: string;
  recomendacoes: string[];
}

/** Dado de ponto para gráficos embutidos no relatório */
export interface GraficoPonto {
  label: string;
  valor: number;
  max: number;
}

/** Item do bloco de avaliação com escala 1–5 */
export interface BlocoAvaliacaoItem {
  pergunta: string;
  escala: 1 | 2 | 3 | 4 | 5;
  justificativa: string;
}

/** Estrutura retornada pelo modo COMPLETO */
export interface RelatorioCompleto {
  tipo: 'completo';
  resumoExecutivo: string;
  identificacao: string;
  historicoRelevante: string;
  analisePedagogica: string;
  situacaoFuncional: string;
  perfilCognitivo: string;
  dificuldades: string[];
  potencialidades: string[];
  estrategiasEficazes: string[];
  checklist: ChecklistItem[];
  blocoAvaliacao: BlocoAvaliacaoItem[];
  evolucaoObservada: string;
  observacoesRelevantes: string;
  conclusao: string;
  recomendacoesPedagogicas: string[];
  recomendacoesClinicas: string[];
  recomendacoesFamiliares: string[];
  recomendacoesInstitucionais: string[];
  graficoDesempenho: GraficoPonto[];
  graficoDificuldades: GraficoPonto[];
}

export type RelatorioGerado = RelatorioSimples | RelatorioCompleto;

export interface RelatorioResultado {
  data: RelatorioGerado;
  codigoDoc: string;
  geradoEm: string;
  geradoPor: string;
  rawText: string;
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function makeReportCode(_studentId: string): string {
  return generateDocumentCode('registration');
}

function calcAge(birthDate?: string): string {
  if (!birthDate) return '';
  const parts = birthDate.includes('/')
    ? birthDate.split('/')
    : birthDate.split('-');
  if (parts.length < 3) return '';
  const [d, m, y] = parts[0].length === 4
    ? [Number(parts[2]), Number(parts[1]), Number(parts[0])]
    : parts.map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age >= 0 ? `${age} anos` : '';
}

function arrToText(arr: string[] | string | undefined): string {
  if (!arr) return '';
  if (typeof arr === 'string') return arr;
  return arr.filter(Boolean).join(', ');
}

/** Constrói o bloco de knowledge prévio do aluno para o relatório */
function buildPriorKnowledgeBlock(student: Student): string {
  const pk = student.priorKnowledge;
  if (!pk) return '';
  const dims = [
    { key: 'leitura',      label: 'Leitura' },
    { key: 'escrita',      label: 'Escrita' },
    { key: 'entendimento', label: 'Compreensão / Entendimento' },
    { key: 'autonomia',    label: 'Autonomia na realização de atividades' },
    { key: 'atencao',      label: 'Atenção durante atividades' },
    { key: 'raciocinio',   label: 'Raciocínio lógico-matemático' },
  ] as const;
  const lines: string[] = [];
  for (const dim of dims) {
    const score = (pk as any)[`${dim.key}_score`] as number | undefined;
    const notes = (pk as any)[`${dim.key}_notes`] as string | undefined;
    if (score) {
      const lblMap: Record<number, string> = {
        1: 'Muito inicial', 2: 'Inicial', 3: 'Em desenvolvimento',
        4: 'Adequado para a etapa', 5: 'Avançado para a etapa',
      };
      lines.push(`  • ${dim.label}: ${score}/5 — ${lblMap[score] ?? score}${notes ? ` (${notes})` : ''}`);
    }
  }
  if (lines.length === 0) return '';
  return `
=== CONHECIMENTO PRÉVIO E PERFIL PEDAGÓGICO INICIAL ===
(Escala 1=Muito inicial a 5=Avançado para a etapa — registrado pelo professor no cadastro)
${lines.join('\n')}${pk.observacoes_pedagogicas ? `\nObservações pedagógicas: ${pk.observacoes_pedagogicas}` : ''}
INSTRUÇÃO: Use estes dados para calibrar a complexidade das análises e estratégias recomendadas.
`;
}

const NEUTRAL_MISSING_DATA = 'não há registro nos dados disponíveis';

/** Constrói o bloco de contexto do aluno com ausência de dados explícita e neutra */
function buildStudentContext(
  student: Student,
  scores: number[],
  observation: string,
  customFields: DocField[],
  school?: SchoolConfig | null,
): string {
  const age = calcAge(student.birthDate);
  const diagnoses = arrToText(student.diagnosis) || NEUTRAL_MISSING_DATA;
  const cid = arrToText(student.cid as any) || '';
  const support = student.supportLevel || NEUTRAL_MISSING_DATA;
  const medication = student.medication?.trim()
    ? student.medication
    : NEUTRAL_MISSING_DATA;

  const validScores = scores.filter(score => Number.isFinite(score));

  const scoresBlock = scores.length
    ? CRITERIA_NAMES.map((n, i) => {
      const score = scores[i];
      return Number.isFinite(score)
        ? `  • ${n}: ${score}/5`
        : `  • ${n}: ${NEUTRAL_MISSING_DATA}`;
    }).join('\n')
    : `  (${NEUTRAL_MISSING_DATA})`;

  const avg = validScores.length
    ? `${(validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(1)}/5`
    : NEUTRAL_MISSING_DATA;

  const abilities  = arrToText(student.abilities)      || NEUTRAL_MISSING_DATA;
  const difficulties = arrToText(student.difficulties) || NEUTRAL_MISSING_DATA;
  const strategies = arrToText(student.strategies)     || NEUTRAL_MISSING_DATA;
  const communication = arrToText(student.communication as any) || NEUTRAL_MISSING_DATA;

  const customBlock = customFields.length
    ? customFields.map(f => `  • ${f.label}: ${f.value ?? ''}`).join('\n')
    : '';

  const schoolName = school?.schoolName || student.schoolName || student.externalSchoolName || 'Escola não identificada no sistema';
  const city = school?.city || student.city || student.externalSchoolCity || '';
  const priorKnowledgeBlock = buildPriorKnowledgeBlock(student);

  return `
=== DADOS DO ALUNO ===
Nome completo: ${student.name}
Idade: ${age || NEUTRAL_MISSING_DATA}
Data de nascimento: ${student.birthDate || NEUTRAL_MISSING_DATA}
Gênero: ${student.gender || NEUTRAL_MISSING_DATA}
Escola: ${schoolName}${city ? ` — ${city}` : ''}
Série/Ano: ${student.grade || NEUTRAL_MISSING_DATA}
Turno: ${student.shift || NEUTRAL_MISSING_DATA}
Professor regente: ${student.regentTeacher || NEUTRAL_MISSING_DATA}
Professor AEE: ${student.aeeTeacher || NEUTRAL_MISSING_DATA}
Responsável legal: ${student.guardianName || NEUTRAL_MISSING_DATA}
Contato: ${student.guardianPhone || NEUTRAL_MISSING_DATA}

=== DIAGNÓSTICO CLÍNICO ===
Diagnóstico(s): ${diagnoses}
CID: ${cid || NEUTRAL_MISSING_DATA}
Nível de suporte necessário: ${support}
Medicação em uso: ${medication}
Profissionais externos que acompanham: ${arrToText(student.professionals) || NEUTRAL_MISSING_DATA}

=== PERFIL PEDAGÓGICO ===
Habilidades e pontos fortes: ${abilities}
Dificuldades observadas: ${difficulties}
Estratégias eficazes identificadas: ${strategies}
Formas de comunicação utilizadas: ${communication}
Histórico escolar: ${student.schoolHistory || NEUTRAL_MISSING_DATA}
Contexto familiar: ${student.familyContext || NEUTRAL_MISSING_DATA}
Observações gerais: ${student.observations || observation || NEUTRAL_MISSING_DATA}

=== AVALIAÇÃO MULTIDIMENSIONAL (escala 1–5) ===
${scoresBlock}
Média geral: ${avg}
${customBlock ? `\n=== CRITÉRIOS ADICIONAIS ===\n${customBlock}` : ''}
${observation ? `\n=== PARECER DESCRITIVO DO PROFISSIONAL ===\n${observation}` : ''}
${priorKnowledgeBlock}

=== INSTRUÇÃO DE EVIDÊNCIA PARA RELATÓRIOS ===
Ausência de dado não deve ser inferida. Diagnóstico, CID ou perfil geral não devem ser usados para deduzir dificuldade, autonomia, evolução, frequência, suporte, medicação, terapias, acompanhamento externo ou histórico familiar. Se faltar evidência, use "${NEUTRAL_MISSING_DATA}" ou deixe o campo vazio conforme o schema.`.trim();
}

function fallbackRegistro(value?: string | null): string {
  const v = typeof value === 'string' ? value.trim() : '';
  return v || 'não informado nos registros escolares disponíveis';
}

function arrToRegisteredText(value: string[] | string | undefined): string {
  const text = arrToText(value).trim();
  return text || 'não informado nos registros escolares disponíveis';
}

function buildInssStudentContext(
  student: Student,
  scores: number[],
  observation: string,
  customFields: DocField[],
  school?: SchoolConfig | null,
): string {
  const age = calcAge(student.birthDate);
  const schoolName = school?.schoolName || student.schoolName || student.externalSchoolName || '';
  const cityState = [school?.city || student.city || student.externalSchoolCity, school?.state || (student as any).state]
    .filter(Boolean)
    .join(' - ');
  const avg = scores.length
    ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
    : '';
  const customBlock = customFields
    .filter(f => String(f.value ?? '').trim())
    .map(f => `- ${f.label}: ${f.value}`)
    .join('\n');

  return `
=== REGISTROS ESCOLARES DISPONÍVEIS PARA DECLARAÇÃO INSS ===
Aluno: ${fallbackRegistro(student.name)}
Idade: ${age || 'não informado nos registros escolares disponíveis'}
Data de nascimento: ${fallbackRegistro(student.birthDate)}
Escola: ${fallbackRegistro(schoolName)}
Município/UF: ${fallbackRegistro(cityState)}
Série/Ano: ${fallbackRegistro(student.grade)}
Turno: ${fallbackRegistro(student.shift)}
Professor regente: ${fallbackRegistro(student.regentTeacher)}
Professor AEE: ${fallbackRegistro(student.aeeTeacher)}
Responsável legal: ${fallbackRegistro(student.guardianName)}

Diagnóstico(s) registrados: ${arrToRegisteredText(student.diagnosis)}
CID registrado: ${arrToRegisteredText(student.cid as any)}
Nível de suporte registrado: ${fallbackRegistro(student.supportLevel)}
Medicação informada à escola: ${fallbackRegistro(student.medication)}
Profissionais externos informados à escola: ${arrToRegisteredText(student.professionals)}

Habilidades/potencialidades registradas: ${arrToRegisteredText(student.abilities)}
Dificuldades/barreiras registradas: ${arrToRegisteredText(student.difficulties)}
Estratégias e apoios escolares registrados: ${arrToRegisteredText(student.strategies)}
Formas de comunicação registradas: ${arrToRegisteredText(student.communication as any)}
Histórico escolar registrado: ${fallbackRegistro(student.schoolHistory)}
Observações escolares registradas: ${fallbackRegistro(student.observations || observation)}
${avg ? `Média do perfil escolar/cognitivo registrado: ${avg}/5` : 'Média do perfil escolar/cognitivo registrado: não informado nos registros escolares disponíveis'}
${customBlock ? `\nCampos adicionais registrados:\n${customBlock}` : ''}
`.trim();
}

function parseRelatorioJSON(raw: string, mode: ReportMode): RelatorioGerado {
  let text = raw.trim();
  // Remove markdown code fences if present
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) text = text.substring(start, end + 1);

  try {
    const parsed = JSON.parse(text);
    return { tipo: mode, ...parsed } as RelatorioGerado;
  } catch {
    // Fallback: monta estrutura mínima com o texto bruto
    if (mode !== 'completo') {
      return {
        tipo: mode,
        identificacao: '',
        situacaoPedagogicaAtual: raw,
        situacaoFuncional: '',
        dificuldades: [],
        observacoesRelevantes: '',
        conclusao: '',
        recomendacoes: [],
      };
    }
    return {
      tipo: 'completo',
      resumoExecutivo: '',
      identificacao: '',
      historicoRelevante: '',
      analisePedagogica: raw,
      situacaoFuncional: '',
      perfilCognitivo: '',
      dificuldades: [],
      potencialidades: [],
      estrategiasEficazes: [],
      checklist: [],
      blocoAvaliacao: [],
      evolucaoObservada: '',
      observacoesRelevantes: '',
      conclusao: '',
      recomendacoesPedagogicas: [],
      recomendacoesClinicas: [],
      recomendacoesFamiliares: [],
      recomendacoesInstitucionais: [],
      graficoDesempenho: [],
      graficoDificuldades: [],
    };
  }
}

// ─── Função principal exportada ───────────────────────────────────────────────

export interface GenerateRelatorioParams {
  student: Student;
  scores: number[];
  observation: string;
  customFields: DocField[];
  mode: ReportMode;
  user: User;
  modelId?: string;
  school?: SchoolConfig | null;
}

const CRITERIA_NAMES = [
  'Comunicação Expressiva', 'Interação Social', 'Autonomia (AVD)',
  'Autorregulação', 'Atenção Sustentada', 'Compreensão',
  'Motricidade Fina', 'Motricidade Grossa', 'Participação', 'Linguagem/Leitura',
];

function enrichCharts(data: RelatorioGerado, scores: number[]): void {
  if (data.tipo !== 'completo') return;
  const c = data as RelatorioCompleto;
  if (scores.length) {
    c.graficoDesempenho = CRITERIA_NAMES.map((label, i) => ({
      label,
      valor: scores[i] ?? 1,
      max: 5,
    }));
  }
  if (c.checklist?.length) {
    const grauNum = { leve: 1, moderado: 2, intenso: 3 } as const;
    c.graficoDificuldades = c.checklist
      .filter(item => item.presente && item.grau)
      .map(item => ({
        label: item.area,
        valor: grauNum[item.grau as keyof typeof grauNum] ?? 1,
        max: 3,
      }));
  }
}

/**
 * generateRelatorioAluno
 *
 * Gera um relatório do aluno via IA.
 * - Detecta automaticamente modo simples, completo ou INSS
 * - Retorna JSON estruturado + código do documento
 */
export async function generateRelatorioAluno(
  params: GenerateRelatorioParams,
): Promise<RelatorioResultado> {
  const { student, scores, observation, customFields, mode, user, modelId, school } = params;

  const systemPrompt = mode === 'completo'
    ? generateReportFull
    : mode === 'inss'
      ? generateReportInss
      : generateReportSimple;

  if (mode === 'inss') {
    const inssContext = buildInssStudentContext(student, scores, observation, customFields, school);
    const fullPrompt = `${systemPrompt}

===== REGISTROS ESCOLARES DO ALUNO =====
${inssContext}
========================================
Gere a declaração escolar agora no formato JSON conforme instruído. Retorne APENAS o JSON, sem texto adicional.`;

    const { result } = await callAIGateway({
      task:            'json',
      prompt:          fullPrompt,
      creditsRequired: AI_CREDIT_COSTS.RELATORIO_INSS,
      requestType:     'report_inss',
    });

    const data = parseRelatorioJSON(result, mode);
    const codigoDoc = makeReportCode(student.id);
    const geradoEm = new Date().toISOString();

    return {
      data,
      codigoDoc,
      geradoEm,
      geradoPor: user.name || 'Profissional',
      rawText: result,
    };
  }

  const studentContext = buildStudentContext(student, scores, observation, customFields, school);

  // Contexto canônico — timeline, atendimentos, faltas, laudos, prior knowledge do DB
  let canonicalBlock = '';
  let canonicalCtx: Awaited<ReturnType<typeof CanonicalStudentContextService.buildCanonicalContext>> | null = null;
  try {
    canonicalCtx = await CanonicalStudentContextService.buildCanonicalContext(student);
    if (CanonicalStudentContextService.hasData(canonicalCtx)) {
      canonicalBlock = CanonicalStudentContextService.toPromptText(canonicalCtx, 'relatorio');
    }
  } catch {
    // contexto canônico é enriquecimento — não bloqueia geração
  }

  const fullPrompt = `${systemPrompt}

===== DADOS CADASTRAIS DO ALUNO =====
${studentContext}
=====================================
${canonicalBlock ? `\n${canonicalBlock}\n` : ''}
Gere o relatório agora no formato JSON conforme instruído. Retorne APENAS o JSON, sem texto adicional.`;

  let rawText = await AIService.generateReport('', fullPrompt, user, modelId ?? 'padrao');

  // Validação pós-geração + reparo automático (modo completo — sem débito extra)
  // Limitado a 12s para não bloquear o usuário
  if (mode === 'completo' && canonicalCtx) {
    try {
      const repairResult = await Promise.race([
        CanonicalStudentContextService.validateAndRepair(fullPrompt, rawText, 'relatorio', canonicalCtx),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('repair_timeout')), 12_000)),
      ]);
      if (repairResult) {
        const { output, audit } = repairResult as Awaited<ReturnType<typeof CanonicalStudentContextService.validateAndRepair>>;
        rawText = output;
        if (!audit.firstPassApproved) {
          console.info(
            `[ReportService] reparo automático — score inicial: ${audit.initialScore} | score final: ${audit.finalScore} | aprovado: ${audit.repairSucceeded}`,
            audit.initialIssues,
          );
        }
      }
    } catch { /* validação é opcional — não bloqueia */ }
  }

  const data = parseRelatorioJSON(rawText, mode);
  enrichCharts(data, scores);

  const codigoDoc = makeReportCode(student.id);
  const geradoEm = new Date().toISOString();

  return {
    data,
    codigoDoc,
    geradoEm,
    geradoPor: user.name || 'Profissional',
    rawText,
  };
}

// ─── API pública simplificada ─────────────────────────────────────────────────

export interface StudentReportInput {
  student: Student;
  user: User;
  mode: ReportMode;
  scores?: number[];
  observation?: string;
  customFields?: DocField[];
  modelId?: string;
  school?: SchoolConfig | null;
}

/**
 * generateStudentReport
 *
 * Função principal de geração de relatório do aluno.
 * Entrada: dados do aluno (JSON estruturado via StudentReportInput).
 * Saída: RelatorioResultado com JSON tipado — nunca texto puro.
 * - Idioma: pt-BR (padrão automático)
  * - Modo simples: identificação, situação pedagógica, funcional, dificuldades, conclusão
  * - Modo completo: resumo executivo, análise pedagógica, checklist visual, gráficos, recomendações multidisciplinares
  * - Modo INSS: declaração escolar/institucional curta, sem laudo clínico
  */
export async function generateStudentReport(
  input: StudentReportInput,
): Promise<RelatorioResultado> {
  return generateRelatorioAluno({
    student: input.student,
    scores: input.scores ?? [],
    observation: input.observation ?? '',
    customFields: input.customFields ?? [],
    mode: input.mode,
    user: input.user,
    modelId: input.modelId,
    school: input.school ?? null,
  });
}
