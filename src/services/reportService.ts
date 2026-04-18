// reportService.ts — Geração de Relatório Técnico do Aluno
// Suporta modo 'simples' (1–2 págs, INSS) e 'completo' (3–5 págs, multidisciplinar)
import { Student, User, DocField, SchoolConfig } from '../types';
import { AIService } from './aiService';
import generateReportFull from '../prompts/generate-report-full.md?raw';
import generateReportSimple from '../prompts/generate-report-simple.md?raw';

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export type ReportMode = 'simples' | 'completo';

export interface ChecklistItem {
  area: string;
  presente: boolean;
  grau: 'leve' | 'moderado' | 'intenso' | null;
  obs: string;
}

/** Estrutura retornada pelo modo SIMPLES */
export interface RelatorioSimples {
  tipo: 'simples';
  identificacao: string;
  situacaoPedagogicaAtual: string;
  situacaoFuncional: string;
  dificuldades: string[];
  observacoesRelevantes: string;
  conclusao: string;
  recomendacoes: string[];
}

/** Estrutura retornada pelo modo COMPLETO */
export interface RelatorioCompleto {
  tipo: 'completo';
  identificacao: string;
  historicoRelevante: string;
  situacaoPedagogica: string;
  situacaoFuncional: string;
  perfilCognitivo: string;
  dificuldades: string[];
  potencialidades: string[];
  estrategiasEficazes: string[];
  checklist: ChecklistItem[];
  evolucaoObservada: string;
  observacoesRelevantes: string;
  conclusao: string;
  recomendacoesPedagogicas: string[];
  recomendacoesClinicas: string[];
  recomendacoesFamiliares: string[];
  recomendacoesInstitucionais: string[];
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

function makeReportCode(studentId: string): string {
  const now = Date.now().toString(36).toUpperCase();
  const hash = Math.abs(
    studentId.split('').reduce((h, c) => (h << 5) - h + c.charCodeAt(0), 0)
  ).toString(16).toUpperCase().padStart(6, '0').slice(0, 6);
  return `REL-${hash}-${now}`;
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

/** Constrói o bloco de contexto do aluno — nunca usa "não informado" */
function buildStudentContext(
  student: Student,
  scores: number[],
  observation: string,
  customFields: DocField[],
  school?: SchoolConfig | null,
): string {
  const age = calcAge(student.birthDate);
  const diagnoses = arrToText(student.diagnosis) || 'A confirmar por equipe multidisciplinar';
  const cid = arrToText(student.cid as any) || '';
  const support = student.supportLevel || 'A ser definido em reunião de equipe';
  const medication = student.medication?.trim()
    ? student.medication
    : 'Não reportado pela família no momento da avaliação';

  const criteriaNames = [
    'Comunicação Expressiva', 'Interação Social', 'Autonomia (AVD)',
    'Autorregulação', 'Atenção Sustentada', 'Compreensão',
    'Motricidade Fina', 'Motricidade Grossa', 'Participação', 'Linguagem/Leitura',
  ];

  const scoresBlock = scores.length
    ? criteriaNames.map((n, i) => `  • ${n}: ${scores[i] ?? 1}/5`).join('\n')
    : '  (scores não disponíveis nesta avaliação)';

  const avg = scores.length
    ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
    : 'N/A';

  const abilities  = arrToText(student.abilities)      || 'A ser identificado durante acompanhamento';
  const difficulties = arrToText(student.difficulties) || 'Conforme diagnóstico e observação pedagógica direta';
  const strategies = arrToText(student.strategies)     || 'Em desenvolvimento com a equipe especializada';
  const communication = arrToText(student.communication as any) || 'Comunicação verbal e não-verbal em avaliação';

  const customBlock = customFields.length
    ? customFields.map(f => `  • ${f.label}: ${f.value ?? ''}`).join('\n')
    : '';

  const schoolName = school?.schoolName || student.schoolName || student.externalSchoolName || 'Escola não identificada no sistema';
  const city = school?.city || student.city || student.externalSchoolCity || '';

  return `
=== DADOS DO ALUNO ===
Nome completo: ${student.name}
Idade: ${age || 'A confirmar'}
Data de nascimento: ${student.birthDate || 'A confirmar'}
Gênero: ${student.gender || 'Não especificado'}
Escola: ${schoolName}${city ? ` — ${city}` : ''}
Série/Ano: ${student.grade || 'A confirmar'}
Turno: ${student.shift || 'A confirmar'}
Professor regente: ${student.regentTeacher || 'A informar'}
Professor AEE: ${student.aeeTeacher || 'A informar'}
Responsável legal: ${student.guardianName || 'A confirmar'}
Contato: ${student.guardianPhone || 'A informar'}

=== DIAGNÓSTICO CLÍNICO ===
Diagnóstico(s): ${diagnoses}
CID: ${cid || 'A confirmar por especialista'}
Nível de suporte necessário: ${support}
Medicação em uso: ${medication}
Profissionais externos que acompanham: ${arrToText(student.professionals) || 'A ser levantado com a família'}

=== PERFIL PEDAGÓGICO ===
Habilidades e pontos fortes: ${abilities}
Dificuldades observadas: ${difficulties}
Estratégias eficazes identificadas: ${strategies}
Formas de comunicação utilizadas: ${communication}
Histórico escolar: ${student.schoolHistory || 'A ser coletado com a família e secretaria escolar'}
Contexto familiar: ${student.familyContext || 'A ser aprofundado em reunião com a família'}
Observações gerais: ${student.observations || observation || 'Observação pedagógica em andamento'}

=== AVALIAÇÃO MULTIDIMENSIONAL (escala 1–5) ===
${scoresBlock}
Média geral: ${avg}/5${avg !== 'N/A' ? ` (${Number(avg) >= 4 ? 'Avançado' : Number(avg) >= 3 ? 'Em desenvolvimento' : Number(avg) >= 2 ? 'Em construção' : 'Necessita suporte intensivo'})` : ''}
${customBlock ? `\n=== CRITÉRIOS ADICIONAIS ===\n${customBlock}` : ''}
${observation ? `\n=== PARECER DESCRITIVO DO PROFISSIONAL ===\n${observation}` : ''}
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
    if (mode === 'simples') {
      return {
        tipo: 'simples',
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
      identificacao: '',
      historicoRelevante: '',
      situacaoPedagogica: raw,
      situacaoFuncional: '',
      perfilCognitivo: '',
      dificuldades: [],
      potencialidades: [],
      estrategiasEficazes: [],
      checklist: [],
      evolucaoObservada: '',
      observacoesRelevantes: '',
      conclusao: '',
      recomendacoesPedagogicas: [],
      recomendacoesClinicas: [],
      recomendacoesFamiliares: [],
      recomendacoesInstitucionais: [],
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

/**
 * generateRelatorioAluno
 *
 * Gera um relatório técnico do aluno via IA.
 * - Detecta automaticamente modo simples ou completo
 * - Nunca produz "não informado" — infere do diagnóstico
 * - Retorna JSON estruturado + código do documento
 */
export async function generateRelatorioAluno(
  params: GenerateRelatorioParams,
): Promise<RelatorioResultado> {
  const { student, scores, observation, customFields, mode, user, modelId, school } = params;

  const systemPrompt = mode === 'completo' ? generateReportFull : generateReportSimple;
  const studentContext = buildStudentContext(student, scores, observation, customFields, school);

  const fullPrompt = `${systemPrompt}

===== DADOS PARA O RELATÓRIO =====
${studentContext}
===================================

Gere o relatório agora no formato JSON conforme instruído. Retorne APENAS o JSON, sem texto adicional.`;

  const rawText = await AIService.generateReport('', fullPrompt, user, modelId ?? 'padrao');

  const data = parseRelatorioJSON(rawText, mode);
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
