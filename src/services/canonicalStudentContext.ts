/**
 * canonicalStudentContext.ts — Contexto Canônico Oficial do Aluno (Sprint 12 v2)
 *
 * Fonte única de verdade para todos os documentos gerados pela IA.
 *
 * Melhorias v2:
 *  - Análise temporal rica (faltas consecutivas, intervalos longos, tendência, adesão recente)
 *  - Áreas impactadas por múltiplos sinais (score + fichas + laudos + student.difficulties)
 *  - Evidence pack em camadas (priority / complementary / gaps / alerts)
 *  - Validação dimensional com score por eixo (não apenas global)
 *  - Observabilidade do reparo automático (RepairAudit)
 */

import { supabase } from './supabase';
import { Student, PriorKnowledgeProfile, PRIOR_KNOWLEDGE_LABELS } from '../types';
import type {
  CognitiveProfileEntry,
  ObservationFormEntry,
  MedicalReportEntry,
  AttachedDocumentEntry,
} from './studentContextService';

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export type DocumentCategory =
  | 'ficha_aluno'
  | 'ficha_cognitiva'
  | 'estudo_de_caso'
  | 'pei'
  | 'paee'
  | 'pdi'
  | 'relatorio'
  | 'atividade_adaptada';

export interface TimelineEntry {
  date: string;
  eventType: string;
  title: string;
  description?: string;
  author?: string;
}

export interface AppointmentEntry {
  date: string;
  type: string;
  status: 'realizado' | 'falta' | 'cancelado' | 'reagendado';
  professional?: string;
  notes?: string;
}

/** Análise temporal detalhada de atendimentos */
export interface TemporalAnalysis {
  faltasConsecutivasMax: number;        // maior sequência de faltas consecutivas
  maiorIntervaloSemAtendimento: number; // maior gap em dias entre realizados
  baixaAdesaoRecente: boolean;          // últimos 30 dias com < 50% presença
  tendenciaFrequencia: 'melhora' | 'piora' | 'estavel' | 'insuficiente';
  ultimoAtendimento: string | null;     // data do último realizado
  diasDesdeUltimoAtendimento: number | null;
  sequenciaInterrompida: boolean;       // estava regular e sumiu por 2+ semanas
}

export interface EnrichedData {
  totalAtendimentos: number;
  totalFaltas: number;
  taxaPresenca: number;
  padraoAusencia: string | null;
  areasMaisImpactadas: string[];        // multi-sinal
  sinaisRecorrentes: string[];
  scoreCompletude: number;
  riscosPedagogicos: string[];
  latestCognitiveAvg: number | null;
  latestCognitiveDate: string | null;
  laudosAnalisados: number;
  fichasPreenchidas: number;
  temporal: TemporalAnalysis;
}

/** Camada de evidências com prioridade explícita */
export interface EvidenceLayer {
  cognitiveProfiles: CognitiveProfileEntry[];
  reports: MedicalReportEntry[];
  forms: ObservationFormEntry[];
  timeline: TimelineEntry[];
  appointments: AppointmentEntry[];
}

export interface DataGap {
  field: string;
  severity: 'critical' | 'important' | 'minor';
  message: string;
}

export interface CompletenessAlert {
  type: string;
  message: string;
}

export interface EvidencePack {
  docType: DocumentCategory;
  student: Student;
  enriched: EnrichedData;
  priorKnowledge: PriorKnowledgeProfile | null;
  // Campos legados — mantidos para compatibilidade com buildPromptBlock
  selectedCognitiveProfiles: CognitiveProfileEntry[];
  selectedReports: MedicalReportEntry[];
  selectedForms: ObservationFormEntry[];
  selectedTimeline: TimelineEntry[];
  selectedAppointments: AppointmentEntry[];
  // Camadas de prioridade (v2)
  priority: EvidenceLayer;
  complementary: EvidenceLayer;
  gaps: DataGap[];
  completenessAlerts: CompletenessAlert[];
}

/** Score por dimensão validada */
export interface ValidationDimension {
  name: string;
  score: number;   // 0–100
  passed: boolean;
  issues: string[];
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  score: number;
  dimensions: ValidationDimension[];
  firstPassPassed: boolean;
}

/** Auditoria interna do reparo automático */
export interface RepairAudit {
  initialScore: number;
  initialIssues: string[];
  finalScore: number;
  finalIssues: string[];
  attempts: number;
  firstPassApproved: boolean;
  repairedAt: string;
  repairSucceeded: boolean;
}

export interface CanonicalStudentContext {
  student: Student;
  cognitiveProfiles: CognitiveProfileEntry[];
  observationForms: ObservationFormEntry[];
  medicalReports: MedicalReportEntry[];
  attachedDocuments: AttachedDocumentEntry[];
  priorKnowledge: PriorKnowledgeProfile | null;
  timeline: TimelineEntry[];
  appointments: AppointmentEntry[];
  enriched: EnrichedData;
  loadedAt: string;
}

// ─── Constantes ────────────────────────────────────────────────────────────────

const COGNITIVE_DIMENSIONS = [
  'Comunicação Expressiva', 'Interação Social', 'Autonomia (AVD)',
  'Autorregulação', 'Atenção Sustentada', 'Compreensão',
  'Motricidade Fina', 'Motricidade Grossa', 'Participação', 'Linguagem/Leitura',
];

const GENERIC_PHRASES = [
  'de acordo com as necessidades',
  'respeitando as especificidades',
  'conforme o diagnóstico',
  'de forma adequada',
  'estratégias apropriadas',
  'necessidades específicas do aluno',
  'metodologias adequadas',
  'suporte necessário',
];

const DAYS_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const MS_PER_DAY = 86_400_000;

// ─── Normalizers ───────────────────────────────────────────────────────────────

function normalizeTimeline(raw: any[]): TimelineEntry[] {
  return (raw ?? []).map(r => ({
    date: r.event_date ?? r.created_at ?? '',
    eventType: r.event_type ?? 'nota',
    title: r.title ?? '',
    description: r.description ?? undefined,
    author: r.author ?? undefined,
  }));
}

function normalizeAppointments(raw: any[]): AppointmentEntry[] {
  return (raw ?? []).map(r => ({
    date: r.date ?? r.appointment_date ?? '',
    type: r.type ?? r.appointment_type ?? 'AEE',
    status: mapAppointmentStatus(r.status),
    professional: r.professional ?? undefined,
    notes: r.notes ?? undefined,
  }));
}

function mapAppointmentStatus(raw: string): AppointmentEntry['status'] {
  const s = (raw ?? '').toLowerCase();
  if (s === 'realizado') return 'realizado';
  if (s === 'falta' || s === 'ausente' || s === 'não compareceu') return 'falta';
  if (s === 'cancelado') return 'cancelado';
  if (s === 'reagendado') return 'reagendado';
  return 'realizado';
}

function normalizeCognitiveProfiles(raw: any[]): CognitiveProfileEntry[] {
  return (raw ?? []).map(p => ({
    date: p.evaluated_at ?? '',
    scores: [
      p.comunicacao_expressiva ?? 1, p.interacao_social    ?? 1,
      p.autonomia_avd          ?? 1, p.autorregulacao      ?? 1,
      p.atencao_sustentada     ?? 1, p.compreensao         ?? 1,
      p.motricidade_fina       ?? 1, p.motricidade_grossa  ?? 1,
      p.participacao           ?? 1, p.linguagem_leitura   ?? 1,
    ],
    observation: p.observation ?? '',
    evaluatedBy: p.evaluated_by ?? '',
  }));
}

function normalizeObservationForms(raw: any[]): ObservationFormEntry[] {
  return (raw ?? []).map(f => ({
    title: f.title,
    formType: f.form_type,
    fieldsData: (typeof f.fields_data === 'object' && f.fields_data !== null ? f.fields_data : {}),
    createdAt: f.created_at ?? '',
    createdBy: f.created_by ?? '',
    auditCode: f.audit_code ?? '',
  }));
}

function normalizeMedicalReports(raw: any[]): MedicalReportEntry[] {
  return (raw ?? []).map(r => ({
    reportType: r.report_type ?? 'multidisciplinar',
    synthesis: r.synthesis ?? '',
    pedagogicalPoints: Array.isArray(r.pedagogical_points) ? r.pedagogical_points : [],
    suggestions: Array.isArray(r.suggestions) ? r.suggestions : [],
    documentName: r.raw_content ?? undefined,
  }));
}

function normalizeAttachedDocuments(raw: any[]): AttachedDocumentEntry[] {
  return (raw ?? []).map(d => ({
    name: d.name,
    documentType: d.document_type ?? 'Laudo',
    uploadedAt: d.created_at ?? '',
  }));
}

// ─── Análise temporal ──────────────────────────────────────────────────────────

function computeTemporalAnalysis(appointments: AppointmentEntry[]): TemporalAnalysis {
  if (appointments.length === 0) {
    return {
      faltasConsecutivasMax: 0,
      maiorIntervaloSemAtendimento: 0,
      baixaAdesaoRecente: false,
      tendenciaFrequencia: 'insuficiente',
      ultimoAtendimento: null,
      diasDesdeUltimoAtendimento: null,
      sequenciaInterrompida: false,
    };
  }

  // Ordena por data crescente para análise sequencial
  const sorted = [...appointments]
    .filter(a => a.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Último atendimento realizado
  const realized = sorted.filter(a => a.status === 'realizado');
  const ultimoAtendimento = realized.length > 0 ? realized[realized.length - 1].date : null;
  let diasDesdeUltimoAtendimento: number | null = null;
  if (ultimoAtendimento) {
    try {
      diasDesdeUltimoAtendimento = Math.floor(
        (Date.now() - new Date(ultimoAtendimento).getTime()) / MS_PER_DAY,
      );
    } catch { /* data inválida */ }
  }

  // Faltas consecutivas
  let maxConsec = 0;
  let curConsec = 0;
  for (const a of sorted) {
    if (a.status === 'falta') { curConsec++; maxConsec = Math.max(maxConsec, curConsec); }
    else if (a.status === 'realizado') curConsec = 0;
  }

  // Maior intervalo sem atendimento entre realizados
  let maiorIntervalo = 0;
  const realizadosDates = realized
    .map(a => { try { return new Date(a.date).getTime(); } catch { return NaN; } })
    .filter(t => !isNaN(t))
    .sort((a, b) => a - b);
  for (let i = 1; i < realizadosDates.length; i++) {
    const gap = Math.floor((realizadosDates[i] - realizadosDates[i - 1]) / MS_PER_DAY);
    if (gap > maiorIntervalo) maiorIntervalo = gap;
  }

  // Adesão recente (últimos 30 dias)
  const now = Date.now();
  const recentes = sorted.filter(a => {
    try { return (now - new Date(a.date).getTime()) / MS_PER_DAY <= 30; } catch { return false; }
  });
  const baixaAdesaoRecente = recentes.length >= 2 &&
    recentes.filter(a => a.status === 'realizado').length / recentes.length < 0.5;

  // Tendência de frequência: compara 1ª metade vs 2ª metade do histórico
  let tendenciaFrequencia: TemporalAnalysis['tendenciaFrequencia'] = 'insuficiente';
  if (sorted.length >= 6) {
    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid);
    const secondHalf = sorted.slice(mid);
    const rate1 = firstHalf.filter(a => a.status === 'realizado').length / firstHalf.length;
    const rate2 = secondHalf.filter(a => a.status === 'realizado').length / secondHalf.length;
    if (rate2 - rate1 > 0.15) tendenciaFrequencia = 'melhora';
    else if (rate1 - rate2 > 0.15) tendenciaFrequencia = 'piora';
    else tendenciaFrequencia = 'estavel';
  }

  // Sequência interrompida: estava regular (>= 4 realizados em 30 dias) e parou (>= 14 dias sem atendimento)
  const sequenciaInterrompida =
    diasDesdeUltimoAtendimento !== null &&
    diasDesdeUltimoAtendimento >= 14 &&
    realized.length >= 4;

  return {
    faltasConsecutivasMax: maxConsec,
    maiorIntervaloSemAtendimento: maiorIntervalo,
    baixaAdesaoRecente,
    tendenciaFrequencia,
    ultimoAtendimento,
    diasDesdeUltimoAtendimento,
    sequenciaInterrompida,
  };
}

// ─── Enrichment ────────────────────────────────────────────────────────────────

function computeEnrichment(
  appointments: AppointmentEntry[],
  _timeline: TimelineEntry[],
  cognitiveProfiles: CognitiveProfileEntry[],
  medicalReports: MedicalReportEntry[],
  observationForms: ObservationFormEntry[],
  student: Student,
): EnrichedData {
  // Frequência básica
  const totalAtendimentos = appointments.filter(a => a.status === 'realizado').length;
  const totalFaltas       = appointments.filter(a => a.status === 'falta').length;
  const total             = appointments.length;
  const taxaPresenca      = total > 0 ? Math.round((totalAtendimentos / total) * 100) : 0;

  // Análise temporal rica
  const temporal = computeTemporalAnalysis(appointments);

  // Padrão de ausência — agora inclui consecutivas e tendência
  let padraoAusencia: string | null = null;
  if (totalFaltas >= 3) {
    const faltaDays = appointments
      .filter(a => a.status === 'falta' && a.date)
      .map(a => { try { return new Date(a.date).getDay(); } catch { return -1; } })
      .filter(d => d >= 0);
    const dayCounts = faltaDays.reduce<Record<number, number>>((acc, d) => {
      acc[d] = (acc[d] ?? 0) + 1;
      return acc;
    }, {});
    const domEntry = Object.entries(dayCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    if (domEntry && Number(domEntry[1]) >= 2) {
      padraoAusencia = `Concentração de faltas às ${DAYS_PT[Number(domEntry[0])]}s`;
    } else if (totalFaltas > totalAtendimentos * 0.3) {
      padraoAusencia = 'Alta taxa de ausências (acima de 30% do total de atendimentos)';
    }
    if (temporal.faltasConsecutivasMax >= 3) {
      const extra = `Faltas consecutivas detectadas (máximo: ${temporal.faltasConsecutivasMax} seguidas)`;
      padraoAusencia = padraoAusencia ? `${padraoAusencia}; ${extra}` : extra;
    }
  }

  // Áreas mais impactadas — multi-sinal
  const areaScores: Record<string, number[]> = {};
  const areaHits:   Record<string, number>   = {};

  const countArea = (name: string, weight: number) => {
    if (!areaHits[name]) areaHits[name] = 0;
    areaHits[name] += weight;
  };

  // Sinal 1: scores cognitivos baixos
  if (cognitiveProfiles.length > 0) {
    const latest = cognitiveProfiles[0];
    latest.scores.forEach((s, i) => {
      const dim = COGNITIVE_DIMENSIONS[i];
      if (!areaScores[dim]) areaScores[dim] = [];
      areaScores[dim].push(s);
      if (s <= 2) countArea(dim, 3);
      else if (s === 3) countArea(dim, 1);
    });
  }

  // Sinal 2: dificuldades cadastradas no aluno
  (student.difficulties ?? []).forEach(d => {
    const normalized = d.toLowerCase();
    COGNITIVE_DIMENSIONS.forEach(dim => {
      if (normalized.includes(dim.toLowerCase().split(' ')[0])) countArea(dim, 2);
    });
    countArea(d, 2);
  });

  // Sinal 3: pontos pedagógicos dos laudos
  medicalReports.forEach(r => {
    (r.pedagogicalPoints ?? []).forEach(p => {
      const pl = p.toLowerCase();
      COGNITIVE_DIMENSIONS.forEach(dim => {
        if (pl.includes(dim.toLowerCase().split(' ')[0])) countArea(dim, 2);
      });
    });
  });

  // Sinal 4: campos recorrentes nas fichas de observação
  const fieldCounts: Record<string, number> = {};
  for (const f of observationForms) {
    for (const [key, val] of Object.entries(f.fieldsData)) {
      if (val && String(val).trim()) fieldCounts[key] = (fieldCounts[key] ?? 0) + 1;
    }
  }

  const areasMaisImpactadas: string[] = [
    ...Object.entries(areaHits)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => name),
  ].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 4);

  // Sinais recorrentes (fichas)
  const sinaisRecorrentes: string[] = Object.entries(fieldCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => key);

  // Score de completude
  let completude = 0;
  if (student.name)                 completude += 10;
  if (student.diagnosis?.length)    completude += 15;
  if (student.supportLevel)         completude += 10;
  if (student.schoolHistory)        completude += 10;
  if (student.familyContext)        completude +=  5;
  if (cognitiveProfiles.length > 0) completude += 15;
  if (medicalReports.length > 0)    completude += 15;
  if (observationForms.length > 0)  completude += 10;
  if (student.priorKnowledge && hasPKScores(student.priorKnowledge)) completude += 10;

  // Riscos pedagógicos — combinam todos os sinais
  const riscosPedagogicos: string[] = [];
  if (taxaPresenca < 70 && total > 0)
    riscosPedagogicos.push('Alta taxa de ausência — impacto direto no progresso observado');
  if (temporal.faltasConsecutivasMax >= 3)
    riscosPedagogicos.push(`Sequência de ${temporal.faltasConsecutivasMax} faltas consecutivas — possível interrupção de sequência pedagógica`);
  if (temporal.sequenciaInterrompida)
    riscosPedagogicos.push(`Atendimento interrompido há ${temporal.diasDesdeUltimoAtendimento} dias após histórico de regularidade`);
  if (temporal.baixaAdesaoRecente)
    riscosPedagogicos.push('Baixa adesão nos últimos 30 dias — requer contato com família');
  if (temporal.tendenciaFrequencia === 'piora' && total >= 6)
    riscosPedagogicos.push('Tendência de queda na frequência ao longo do acompanhamento');
  if (cognitiveProfiles.length === 0)
    riscosPedagogicos.push('Sem avaliação cognitiva registrada no sistema');
  if (medicalReports.length === 0)
    riscosPedagogicos.push('Sem laudos analisados — análise documental pendente');
  if (!student.priorKnowledge || !hasPKScores(student.priorKnowledge))
    riscosPedagogicos.push('Perfil pedagógico inicial não preenchido — comprometimento da calibração da IA');
  if (!student.schoolHistory)
    riscosPedagogicos.push('Histórico escolar ausente — trajetória de aprendizagem desconhecida');
  if (areasMaisImpactadas.some(a =>
    a.toLowerCase().includes('comunicação') || a.toLowerCase().includes('linguagem')))
    riscosPedagogicos.push('Dificuldades em comunicação/linguagem requerem estratégias específicas de mediação');

  const latestCognitiveAvg = cognitiveProfiles.length > 0
    ? Number((cognitiveProfiles[0].scores.reduce((a, b) => a + b, 0) / cognitiveProfiles[0].scores.length).toFixed(1))
    : null;

  return {
    totalAtendimentos, totalFaltas, taxaPresenca, padraoAusencia,
    areasMaisImpactadas: [...new Set(areasMaisImpactadas)],
    sinaisRecorrentes,
    scoreCompletude: Math.min(100, completude),
    riscosPedagogicos,
    latestCognitiveAvg,
    latestCognitiveDate: cognitiveProfiles.length > 0 ? cognitiveProfiles[0].date : null,
    laudosAnalisados: medicalReports.length,
    fichasPreenchidas: observationForms.length,
    temporal,
  };
}

// ─── Evidence pack — camadas de prioridade ─────────────────────────────────────

function buildEvidenceLayers(
  ctx: CanonicalStudentContext,
  docType: DocumentCategory,
): { priority: EvidenceLayer; complementary: EvidenceLayer; gaps: DataGap[]; alerts: CompletenessAlert[] } {
  const { cognitiveProfiles, observationForms, medicalReports, timeline, appointments, enriched } = ctx;

  const gaps: DataGap[] = [];
  const alerts: CompletenessAlert[] = [];

  if (cognitiveProfiles.length === 0)
    gaps.push({ field: 'perfilCognitivo', severity: 'critical', message: 'Nenhuma avaliação cognitiva registrada' });
  if (medicalReports.length === 0)
    gaps.push({ field: 'laudos', severity: 'critical', message: 'Nenhum laudo analisado no sistema' });
  if (!ctx.priorKnowledge || !hasPKScores(ctx.priorKnowledge))
    gaps.push({ field: 'priorKnowledge', severity: 'important', message: 'Perfil pedagógico inicial não preenchido' });
  if (appointments.length === 0)
    gaps.push({ field: 'atendimentos', severity: 'important', message: 'Nenhum atendimento registrado' });
  if (observationForms.length === 0)
    gaps.push({ field: 'fichas', severity: 'minor', message: 'Nenhuma ficha de observação preenchida' });
  if (timeline.length === 0)
    gaps.push({ field: 'timeline', severity: 'minor', message: 'Nenhum evento pedagógico na linha do tempo' });

  if (enriched.scoreCompletude < 50)
    alerts.push({ type: 'low_completeness', message: `Cadastro com baixa completude (${enriched.scoreCompletude}%) — documento gerado terá menor especificidade` });
  if (enriched.temporal.faltasConsecutivasMax >= 3)
    alerts.push({ type: 'consecutive_absences', message: `${enriched.temporal.faltasConsecutivasMax} faltas consecutivas detectadas` });
  if (enriched.temporal.sequenciaInterrompida)
    alerts.push({ type: 'interrupted_attendance', message: `Atendimento interrompido há ${enriched.temporal.diasDesdeUltimoAtendimento} dias` });

  // Prioridade por tipo de documento
  const priority: EvidenceLayer = { cognitiveProfiles: [], reports: [], forms: [], timeline: [], appointments: [] };
  const complementary: EvidenceLayer = { cognitiveProfiles: [], reports: [], forms: [], timeline: [], appointments: [] };

  switch (docType) {
    case 'pei':
      priority.cognitiveProfiles = cognitiveProfiles.slice(0, 2);
      priority.reports            = medicalReports.slice(0, 2);
      priority.forms              = observationForms.slice(0, 3);
      priority.timeline           = timeline.filter(t => ['evolucao', 'protocolo'].includes(t.eventType)).slice(0, 10);
      priority.appointments       = appointments.slice(-10);
      complementary.cognitiveProfiles = cognitiveProfiles.slice(2, 4);
      complementary.reports           = medicalReports.slice(2);
      complementary.forms             = observationForms.slice(3, 6);
      break;

    case 'paee':
      priority.reports      = medicalReports;       // laudos são prioritários no PAEE
      priority.forms        = observationForms.slice(0, 4);
      priority.cognitiveProfiles = cognitiveProfiles.slice(0, 2);
      priority.timeline     = timeline.filter(t => ['evolucao', 'protocolo', 'documento'].includes(t.eventType)).slice(0, 12);
      priority.appointments = appointments.slice(-15);
      complementary.cognitiveProfiles = cognitiveProfiles.slice(2);
      complementary.forms   = observationForms.slice(4);
      break;

    case 'estudo_de_caso':
    case 'pdi':
      priority.cognitiveProfiles = cognitiveProfiles;
      priority.reports            = medicalReports;
      priority.forms              = observationForms;
      priority.timeline           = timeline.slice(0, 20);
      priority.appointments       = appointments;
      break;

    case 'relatorio':
      priority.cognitiveProfiles = cognitiveProfiles.slice(0, 3);
      priority.reports            = medicalReports;
      priority.forms              = observationForms.slice(0, 4);
      priority.timeline           = timeline.slice(0, 12);
      priority.appointments       = appointments;
      complementary.forms         = observationForms.slice(4);
      break;

    case 'ficha_cognitiva':
      priority.cognitiveProfiles = cognitiveProfiles;
      priority.reports            = medicalReports.slice(0, 3);
      priority.forms              = observationForms;
      priority.timeline           = timeline.filter(t => t.eventType === 'evolucao').slice(0, 10);
      break;

    case 'atividade_adaptada':
      priority.cognitiveProfiles = cognitiveProfiles.slice(0, 1);
      priority.forms              = observationForms.slice(0, 2);
      break;

    default: // ficha_aluno + fallback
      priority.cognitiveProfiles = cognitiveProfiles.slice(0, 2);
      priority.reports            = medicalReports;
      priority.forms              = observationForms.slice(0, 4);
      priority.timeline           = timeline.slice(0, 15);
      priority.appointments       = appointments;
      complementary.cognitiveProfiles = cognitiveProfiles.slice(2);
      complementary.forms         = observationForms.slice(4);
  }

  return { priority, complementary, gaps, alerts };
}

function selectEvidence(ctx: CanonicalStudentContext, docType: DocumentCategory): EvidencePack {
  const { student, priorKnowledge, enriched } = ctx;

  const { priority, complementary, gaps, alerts } = buildEvidenceLayers(ctx, docType);

  // Campos legados populados a partir das camadas (backwards compat)
  const selectedCognitiveProfiles = [
    ...priority.cognitiveProfiles,
    ...complementary.cognitiveProfiles,
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const selectedReports = [
    ...priority.reports,
    ...complementary.reports,
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const selectedForms = [
    ...priority.forms,
    ...complementary.forms,
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const selectedTimeline = [
    ...priority.timeline,
    ...complementary.timeline,
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const selectedAppointments = [
    ...priority.appointments,
    ...complementary.appointments,
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  return {
    docType, student, enriched, priorKnowledge,
    selectedCognitiveProfiles, selectedReports, selectedForms,
    selectedTimeline, selectedAppointments,
    priority, complementary, gaps, completenessAlerts: alerts,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function hasPKScores(pk: PriorKnowledgeProfile): boolean {
  return !!(pk.leitura_score || pk.escrita_score || pk.entendimento_score ||
            pk.autonomia_score || pk.atencao_score || pk.raciocinio_score);
}

// ─── Prompt block builder ──────────────────────────────────────────────────────

export function buildPromptBlock(pack: EvidencePack): string {
  const lines: string[] = ['===== CONTEXTO CANÔNICO DO ALUNO (fonte única — use obrigatoriamente) ====='];
  const { enriched, priorKnowledge } = pack;

  // Alertas de completude no topo (para a IA saber limitações)
  if (pack.gaps.length > 0) {
    lines.push('\n--- LACUNAS DE DADOS IDENTIFICADAS ---');
    pack.gaps.forEach(g => lines.push(`  [${g.severity.toUpperCase()}] ${g.message}`));
  }
  if (pack.completenessAlerts.length > 0) {
    pack.completenessAlerts.forEach(a => lines.push(`  ⚠ ${a.message}`));
  }

  // 1. Frequência e linha do tempo de atendimentos
  const hasAttendance = pack.selectedAppointments.length > 0 || enriched.totalAtendimentos > 0;
  if (hasAttendance) {
    lines.push('\n--- FREQUÊNCIA E ATENDIMENTOS (EVIDÊNCIAS PRIORITÁRIAS) ---');
    lines.push(`Total realizados: ${enriched.totalAtendimentos} | Faltas: ${enriched.totalFaltas} | Taxa de presença: ${enriched.taxaPresenca}%`);
    if (enriched.padraoAusencia) lines.push(`⚠ Padrão: ${enriched.padraoAusencia}`);
    const t = enriched.temporal;
    if (t.faltasConsecutivasMax >= 2)
      lines.push(`⚠ Faltas consecutivas (máx): ${t.faltasConsecutivasMax}`);
    if (t.maiorIntervaloSemAtendimento > 21)
      lines.push(`⚠ Maior intervalo sem atendimento: ${t.maiorIntervaloSemAtendimento} dias`);
    if (t.sequenciaInterrompida)
      lines.push(`⚠ Sequência pedagógica interrompida há ${t.diasDesdeUltimoAtendimento} dias`);
    if (t.baixaAdesaoRecente)
      lines.push('⚠ Baixa adesão nos últimos 30 dias (< 50%)');
    if (t.tendenciaFrequencia !== 'insuficiente')
      lines.push(`Tendência de frequência: ${t.tendenciaFrequencia}`);
    if (t.ultimoAtendimento)
      lines.push(`Último atendimento realizado: ${t.ultimoAtendimento}`);

    // Últimos atendimentos realizados (prioridade)
    const realized = pack.priority.appointments.filter(a => a.status === 'realizado').slice(-5);
    if (realized.length > 0)
      lines.push(`Recentes: ${realized.map(a => `${a.date} (${a.type}${a.professional ? ' — ' + a.professional : ''})`).join(' | ')}`);
    const missed = pack.priority.appointments.filter(a => a.status === 'falta').slice(-3);
    if (missed.length > 0)
      lines.push(`Últimas faltas: ${missed.map(a => a.date).join(', ')}`);
  }

  // 2. Perfil cognitivo — prioridade primeiro, complementar depois
  const allCogProfiles = [...pack.priority.cognitiveProfiles, ...pack.complementary.cognitiveProfiles]
    .filter((v, i, arr) => arr.indexOf(v) === i);
  if (allCogProfiles.length > 0) {
    lines.push('\n--- PERFIL COGNITIVO (EVIDÊNCIAS PRIORITÁRIAS) ---');
    for (const p of allCogProfiles) {
      const avg = (p.scores.reduce((a, b) => a + b, 0) / p.scores.length).toFixed(1);
      lines.push(`Avaliação: ${p.date} | Por: ${p.evaluatedBy || 'Profissional'} | Média: ${avg}/5`);
      p.scores.forEach((s, i) => lines.push(`  • ${COGNITIVE_DIMENSIONS[i]}: ${s}/5`));
      if (p.observation) lines.push(`  Observação clínica: ${p.observation}`);
    }
    if (enriched.areasMaisImpactadas.length > 0)
      lines.push(`Áreas mais impactadas (multi-sinal): ${enriched.areasMaisImpactadas.join(', ')}`);
  }

  // 3. Laudos clínicos — prioridade
  const allReports = [...pack.priority.reports, ...pack.complementary.reports]
    .filter((v, i, arr) => arr.indexOf(v) === i);
  if (allReports.length > 0) {
    lines.push('\n--- LAUDOS E DOCUMENTOS CLÍNICOS (EVIDÊNCIAS PRIORITÁRIAS) ---');
    for (const r of allReports) {
      lines.push(`Documento: ${r.documentName || r.reportType}`);
      if (r.synthesis) lines.push(`  Síntese: ${r.synthesis.slice(0, 600)}`);
      if (r.pedagogicalPoints.length) {
        lines.push('  Pontos pedagógicos:');
        r.pedagogicalPoints.slice(0, 5).forEach(p => lines.push(`    - ${p}`));
      }
      if (r.suggestions.length) {
        lines.push('  Sugestões de intervenção:');
        r.suggestions.slice(0, 4).forEach(s => lines.push(`    - ${s}`));
      }
    }
  }

  // 4. Fichas de observação
  const allForms = [...pack.priority.forms, ...pack.complementary.forms]
    .filter((v, i, arr) => arr.indexOf(v) === i);
  if (allForms.length > 0) {
    lines.push('\n--- FICHAS DE OBSERVAÇÃO ---');
    for (const f of allForms) {
      const d = f.createdAt ? new Date(f.createdAt).toLocaleDateString('pt-BR') : '—';
      lines.push(`${f.title} (${d}) — por ${f.createdBy}`);
      for (const [key, val] of Object.entries(f.fieldsData)) {
        if (val && String(val).trim())
          lines.push(`  • ${key}: ${String(val).slice(0, 300)}`);
      }
    }
    if (enriched.sinaisRecorrentes.length > 0)
      lines.push(`Sinais recorrentes entre fichas: ${enriched.sinaisRecorrentes.join(', ')}`);
  }

  // 5. Conhecimento prévio
  if (priorKnowledge && hasPKScores(priorKnowledge)) {
    lines.push('\n--- CONHECIMENTO PRÉVIO E PERFIL PEDAGÓGICO INICIAL (EVIDÊNCIA PRIORITÁRIA) ---');
    lines.push('(1=Muito inicial | 2=Inicial | 3=Em desenvolvimento | 4=Adequado | 5=Avançado)');
    const dims = [
      { key: 'leitura',      label: 'Leitura' },
      { key: 'escrita',      label: 'Escrita' },
      { key: 'entendimento', label: 'Compreensão / Entendimento' },
      { key: 'autonomia',    label: 'Autonomia na realização de atividades' },
      { key: 'atencao',      label: 'Atenção durante atividades' },
      { key: 'raciocinio',   label: 'Raciocínio lógico-matemático' },
    ] as const;
    for (const dim of dims) {
      const score = (priorKnowledge as any)[`${dim.key}_score`] as number | undefined;
      const notes = (priorKnowledge as any)[`${dim.key}_notes`] as string | undefined;
      if (score) {
        const lbl = PRIOR_KNOWLEDGE_LABELS[score as 1|2|3|4|5] ?? String(score);
        lines.push(`  • ${dim.label}: ${score}/5 — ${lbl}${notes ? ` | Obs: ${notes}` : ''}`);
      }
    }
    if (priorKnowledge.observacoes_pedagogicas)
      lines.push(`\nObservações pedagógicas: ${priorKnowledge.observacoes_pedagogicas}`);
    if (priorKnowledge.registeredAt)
      lines.push(`(Registrado em: ${new Date(priorKnowledge.registeredAt).toLocaleDateString('pt-BR')}${priorKnowledge.registeredBy ? ' por ' + priorKnowledge.registeredBy : ''})`);
  }

  // 6. Linha do tempo
  const allTimeline = [...pack.priority.timeline, ...pack.complementary.timeline]
    .filter((v, i, arr) => arr.indexOf(v) === i);
  if (allTimeline.length > 0) {
    lines.push('\n--- HISTÓRICO DE EVENTOS PEDAGÓGICOS ---');
    for (const t of allTimeline.slice(0, 15))
      lines.push(`  [${t.date}] ${t.eventType.toUpperCase()}: ${t.title}${t.description ? ` — ${t.description.slice(0, 200)}` : ''}`);
  }

  // 7. Riscos e alertas
  if (enriched.riscosPedagogicos.length > 0) {
    lines.push('\n--- ALERTAS PEDAGÓGICOS ---');
    enriched.riscosPedagogicos.forEach(r => lines.push(`  ⚠ ${r}`));
  }

  lines.push(`\nScore de completude: ${enriched.scoreCompletude}%`);
  lines.push('\n===== FIM DO CONTEXTO CANÔNICO =====');
  lines.push(
    '\nINSTRUÇÃO CRÍTICA: Use TODOS os dados acima.' +
    ' Cite datas, frequências e padrões temporais.' +
    ' Use o perfil pedagógico inicial para calibrar complexidade.' +
    ' Use os laudos na seção clínica. Use a linha do tempo para embasar progresso.' +
    ' Não invente dados. Se há lacunas, infira a partir do diagnóstico — nunca escreva "não informado".',
  );
  return lines.join('\n');
}

// ─── Validação dimensional ─────────────────────────────────────────────────────

function makeDim(name: string, score: number, issues: string[]): ValidationDimension {
  return { name, score: Math.max(0, Math.min(100, score)), passed: score >= 60, issues };
}

export function validateAIOutput(
  raw: string,
  docType: DocumentCategory,
  ctx: CanonicalStudentContext,
): ValidationResult {
  const text = raw.toLowerCase();
  const dimensions: ValidationDimension[] = [];

  // ── D1: Identidade do aluno ──────────────────────────────────────────────────
  {
    let s = 100; const iss: string[] = [];
    if (ctx.student.name && !raw.includes(ctx.student.name)) {
      iss.push('Nome do aluno ausente'); s -= 40;
    }
    // Verifica se o nome aparece pelo menos 2 vezes em documentos ricos
    const richDoc = ['estudo_de_caso', 'relatorio', 'pei', 'paee', 'pdi'].includes(docType);
    if (richDoc && ctx.student.name) {
      const nameCount = (raw.match(new RegExp(ctx.student.name.split(' ')[0], 'gi')) ?? []).length;
      if (nameCount < 2) { iss.push('Nome mencionado muito poucas vezes para um documento técnico'); s -= 20; }
    }
    dimensions.push(makeDim('identidade', s, iss));
  }

  // ── D2: Qualidade da linguagem ───────────────────────────────────────────────
  {
    let s = 100; const iss: string[] = [];
    const genericCount = GENERIC_PHRASES.filter(p => text.includes(p)).length;
    if (genericCount >= 4) { iss.push(`Linguagem muito genérica (${genericCount} frases padronizadas)`); s -= 40; }
    else if (genericCount >= 2) { iss.push(`Frases genéricas detectadas (${genericCount})`); s -= 20; }
    dimensions.push(makeDim('linguagem', s, iss));
  }

  // ── D3: Frequência e atendimentos ───────────────────────────────────────────
  {
    let s = 100; const iss: string[] = [];
    const isRichDoc = ['estudo_de_caso', 'relatorio', 'ficha_aluno', 'paee', 'pdi'].includes(docType);
    if (isRichDoc && ctx.enriched.totalAtendimentos > 0) {
      const hasCount  = /\d+\s*(atendimento|sessão|sessao)/.test(text) || text.includes('atendimento');
      const hasRate   = text.includes('presença') || text.includes('frequência') || text.includes('%') || text.includes('falta');
      if (!hasCount) { iss.push('Número de atendimentos não citado'); s -= 30; }
      if (!hasRate)  { iss.push('Taxa de presença/faltas não mencionada'); s -= 30; }
      if (ctx.enriched.temporal.faltasConsecutivasMax >= 3 &&
          !text.includes('consecutiv') && !text.includes('interrupção') && !text.includes('sequência')) {
        iss.push('Faltas consecutivas detectadas mas não analisadas'); s -= 20;
      }
    }
    if (s === 100 && !isRichDoc) s = 100; // não aplicável
    dimensions.push(makeDim('frequencia', s, iss));
  }

  // ── D4: Laudos clínicos ──────────────────────────────────────────────────────
  {
    let s = 100; const iss: string[] = [];
    const isRichDoc = ['estudo_de_caso', 'relatorio', 'ficha_aluno', 'paee', 'pdi', 'pei'].includes(docType);
    if (isRichDoc && ctx.medicalReports.length > 0) {
      const hasRef = text.includes('laudo') || text.includes('diagnóst') || text.includes('clínic') || text.includes('avaliação');
      if (!hasRef) { iss.push('Laudos analisados não foram referenciados'); s -= 40; }
      // Verifica se citou síntese real (não genérica)
      const hasSynthesisRef = ctx.medicalReports.some(r =>
        r.synthesis && r.synthesis.length > 20 &&
        r.synthesis.toLowerCase().split(' ').slice(0, 3).some(w => w.length > 4 && text.includes(w.toLowerCase())),
      );
      if (!hasSynthesisRef && ctx.medicalReports.length > 0) {
        iss.push('Síntese dos laudos não parece ter sido usada (referência superficial)'); s -= 20;
      }
    }
    dimensions.push(makeDim('laudos', s, iss));
  }

  // ── D5: Análise cognitiva ────────────────────────────────────────────────────
  {
    let s = 100; const iss: string[] = [];
    const isRichDoc = ['estudo_de_caso', 'relatorio', 'ficha_cognitiva', 'paee', 'pdi', 'pei'].includes(docType);
    if (isRichDoc && ctx.cognitiveProfiles.length > 0) {
      const hasCognitive = text.includes('cognitiv') || text.includes('perfil') || text.includes('avaliação') || text.includes('dimensões');
      if (!hasCognitive) { iss.push('Perfil cognitivo não utilizado'); s -= 40; }
      // Verifica menção a pelo menos uma dimensão específica
      const dimMentions = COGNITIVE_DIMENSIONS.filter(d =>
        text.includes(d.toLowerCase().split(' ')[0])).length;
      if (dimMentions < 2 && ctx.cognitiveProfiles.length > 0) {
        iss.push('Poucas dimensões cognitivas citadas especificamente'); s -= 20;
      }
    }
    dimensions.push(makeDim('cognitivo', s, iss));
  }

  // ── D6: Conhecimento prévio ──────────────────────────────────────────────────
  {
    let s = 100; const iss: string[] = [];
    if (ctx.priorKnowledge && hasPKScores(ctx.priorKnowledge)) {
      const isRichDoc = ['estudo_de_caso', 'relatorio', 'pei', 'paee', 'pdi', 'atividade_adaptada'].includes(docType);
      if (isRichDoc) {
        const hasPK = text.includes('leitura') || text.includes('escrita') || text.includes('nível') ||
                      text.includes('conhecimento prévio') || text.includes('pedagógico inicial') ||
                      text.includes('autonomia') || text.includes('atenção') || text.includes('raciocínio');
        if (!hasPK) { iss.push('Conhecimento prévio registrado não utilizado'); s -= 40; }
        // Testa calibração: se leitura_score <= 2, espera menção a dificuldade ou nível básico
        const leituraScore = ctx.priorKnowledge.leitura_score;
        if (leituraScore && leituraScore <= 2 &&
            !text.includes('leitura') && !text.includes('decodificação') && !text.includes('alfabetiz')) {
          iss.push('Score baixo de leitura não refletido na análise'); s -= 20;
        }
      }
    }
    dimensions.push(makeDim('priorKnowledge', s, iss));
  }

  // ── D7: Análise temporal / cronologia ────────────────────────────────────────
  {
    let s = 100; const iss: string[] = [];
    if (docType === 'estudo_de_caso' || docType === 'pdi' || docType === 'relatorio') {
      const hasTimeline = text.includes('linha do tempo') || text.includes('período') ||
                          text.includes('desde') || text.includes('ao longo') ||
                          /\d{2}\/\d{2}\/\d{4}|\d{4}/.test(raw) ||
                          text.includes('mês') || text.includes('semestre');
      if (!hasTimeline) { iss.push('Análise temporal/cronológica ausente'); s -= 40; }
      if (ctx.enriched.temporal.tendenciaFrequencia === 'piora' &&
          !text.includes('queda') && !text.includes('redução') && !text.includes('piora')) {
        iss.push('Tendência de queda na frequência detectada mas não analisada'); s -= 20;
      }
    }
    dimensions.push(makeDim('temporal', s, iss));
  }

  // ── D8: Requisitos específicos do tipo de documento ──────────────────────────
  {
    let s = 100; const iss: string[] = [];
    if (docType === 'pei') {
      const required = ['português', 'matemática', 'ciências', 'geografia'];
      const missing = required.filter(d => !text.includes(d));
      if (missing.length > 0) { iss.push(`Disciplinas obrigatórias ausentes: ${missing.join(', ')}`); s -= 25 * missing.length; }
    }
    if (docType === 'paee') {
      const hasAccess = text.includes('acessibilidade') || text.includes('adaptação') ||
                        text.includes('recurso') || text.includes('tecnologia assistiva');
      if (!hasAccess) { iss.push('PAEE sem menção a acessibilidade ou adaptações'); s -= 40; }
    }
    if (docType === 'relatorio') {
      const scaleRefs = (raw.match(/escala|\/5|1\s*[–-]\s*5/gi) ?? []).length;
      if (scaleRefs < 2) { iss.push('Bloco de avaliação com escala 1–5 ausente ou insuficiente'); s -= 30; }
    }
    dimensions.push(makeDim('docEspecifico', s, iss));
  }

  // Score global: média ponderada das dimensões
  const weights: Record<string, number> = {
    identidade: 2, linguagem: 2, frequencia: 1.5, laudos: 1.5,
    cognitivo: 1.5, priorKnowledge: 1, temporal: 1, docEspecifico: 2,
  };
  let weightedSum = 0; let totalWeight = 0;
  for (const dim of dimensions) {
    const w = weights[dim.name] ?? 1;
    weightedSum += dim.score * w;
    totalWeight += w;
  }
  const globalScore = Math.round(weightedSum / totalWeight);

  const allIssues = dimensions.flatMap(d => d.issues);
  const valid = globalScore >= 60 && !dimensions.some(d => !d.passed && (weights[d.name] ?? 1) >= 2);

  return { valid, issues: allIssues, score: globalScore, dimensions, firstPassPassed: valid };
}

export function buildRepairPrompt(
  originalPrompt: string,
  failedOutput: string,
  validation: ValidationResult,
  ctx: CanonicalStudentContext,
): string {
  const failedDims = validation.dimensions.filter(d => !d.passed).map(d => `${d.name} (score ${d.score})`);
  return `O documento gerado apresentou problemas de qualidade. Regenere corrigindo TODOS os problemas.

DIMENSÕES COM FALHA: ${failedDims.join(', ')}

PROBLEMAS IDENTIFICADOS:
${validation.issues.map(i => `- ${i}`).join('\n')}

CONTEÚDO ANTERIOR (não reutilize partes genéricas):
${failedOutput.slice(0, 800)}...

INSTRUÇÕES DE REPARO OBRIGATÓRIAS:
1. Use o nome real do aluno: "${ctx.student.name}"
2. Substitua TODA linguagem genérica por análise específica baseada nas evidências
3. Frequência: cite ${ctx.enriched.totalAtendimentos} atendimentos e ${ctx.enriched.totalFaltas} faltas${ctx.enriched.temporal.faltasConsecutivasMax >= 3 ? ` (${ctx.enriched.temporal.faltasConsecutivasMax} faltas consecutivas)` : ''}
4. Laudos: use síntese dos ${ctx.enriched.laudosAnalisados} laudos analisados na seção clínica
5. Cognitivo: cite média ${ctx.enriched.latestCognitiveAvg ?? 'N/A'}/5 e áreas impactadas: ${ctx.enriched.areasMaisImpactadas.join(', ')}
6. Conhecimento prévio: use perfil pedagógico inicial para calibrar estratégias e linguagem
7. PEI: inclua Português, Matemática, Ciências e Geografia
8. Relatório: inclua mínimo 4 questões com escala 1–5 no blocoAvaliacao
9. Analise impacto temporal: ${ctx.enriched.temporal.sequenciaInterrompida ? `atendimento interrompido há ${ctx.enriched.temporal.diasDesdeUltimoAtendimento} dias` : 'use datas e períodos no documento'}

CONTEXTO DO ALUNO:
${buildPromptBlock(selectEvidence(ctx, ctx.enriched.riscosPedagogicos.length > 0 ? 'estudo_de_caso' : 'relatorio'))}

PROMPT ORIGINAL:
${originalPrompt.slice(0, 1000)}

Gere agora a versão CORRIGIDA. Retorne SOMENTE o JSON válido.`;
}

// ─── Service principal ─────────────────────────────────────────────────────────

export const CanonicalStudentContextService = {

  async buildCanonicalContext(student: Student): Promise<CanonicalStudentContext> {
    const sid = student.id;
    if (!sid) {
      return {
        student, cognitiveProfiles: [], observationForms: [], medicalReports: [],
        attachedDocuments: [], priorKnowledge: student.priorKnowledge ?? null,
        timeline: [], appointments: [],
        enriched: computeEnrichment([], [], [], [], [], student),
        loadedAt: new Date().toISOString(),
      };
    }

    const [profilesRes, obsFormsRes, medReportsRes, docsRes, timelineRes, apptRes] =
      await Promise.allSettled([
        supabase.from('student_profiles').select('*')
          .eq('student_id', sid).order('evaluated_at', { ascending: false }).limit(5),
        supabase.from('observation_forms').select('*')
          .eq('student_id', sid).eq('status', 'finalizado')
          .order('created_at', { ascending: false }).limit(10),
        supabase.from('medical_reports')
          .select('id, report_type, synthesis, pedagogical_points, suggestions, raw_content, document_id')
          .eq('student_id', sid).order('created_at', { ascending: false }).limit(5),
        supabase.from('student_documents').select('name, document_type, created_at')
          .eq('student_id', sid).order('created_at', { ascending: false }).limit(20),
        supabase.from('student_timeline').select('*')
          .eq('student_id', sid).order('event_date', { ascending: false }).limit(50),
        supabase.from('tenant_appointments').select('*')
          .eq('student_id', sid).order('date', { ascending: false }).limit(100),
      ]);

    const safe = <T>(res: PromiseSettledResult<{ data: T[] | null; error: any }>, norm: (raw: T[]) => any): any[] => {
      if (res.status === 'fulfilled' && !res.value.error) return norm(res.value.data ?? []);
      return [];
    };

    const cognitiveProfiles  = safe(profilesRes  as any, normalizeCognitiveProfiles);
    const observationForms   = safe(obsFormsRes   as any, normalizeObservationForms);
    const medicalReports     = safe(medReportsRes as any, normalizeMedicalReports);
    const attachedDocuments  = safe(docsRes       as any, normalizeAttachedDocuments);
    const timeline           = safe(timelineRes   as any, normalizeTimeline);
    const appointments       = safe(apptRes       as any, normalizeAppointments);
    const priorKnowledge     = student.priorKnowledge ?? null;
    const enriched           = computeEnrichment(appointments, timeline, cognitiveProfiles, medicalReports, observationForms, student);

    return {
      student, cognitiveProfiles, observationForms, medicalReports,
      attachedDocuments, priorKnowledge, timeline, appointments, enriched,
      loadedAt: new Date().toISOString(),
    };
  },

  hasData(ctx: CanonicalStudentContext): boolean {
    return (
      ctx.cognitiveProfiles.length > 0 ||
      ctx.observationForms.length   > 0 ||
      ctx.medicalReports.length     > 0 ||
      ctx.timeline.length           > 0 ||
      ctx.appointments.length       > 0 ||
      (ctx.priorKnowledge !== null && hasPKScores(ctx.priorKnowledge))
    );
  },

  buildEvidencePack(ctx: CanonicalStudentContext, docType: DocumentCategory): EvidencePack {
    return selectEvidence(ctx, docType);
  },

  toPromptText(ctx: CanonicalStudentContext, docType: DocumentCategory): string {
    const pack = selectEvidence(ctx, docType);
    return buildPromptBlock(pack);
  },

  async validateAndRepair(
    originalPrompt: string,
    rawOutput: string,
    docType: DocumentCategory,
    ctx: CanonicalStudentContext,
  ): Promise<{ output: string; repaired: boolean; validation: ValidationResult; audit: RepairAudit }> {
    const initialValidation = validateAIOutput(rawOutput, docType, ctx);

    const audit: RepairAudit = {
      initialScore:       initialValidation.score,
      initialIssues:      initialValidation.issues,
      finalScore:         initialValidation.score,
      finalIssues:        initialValidation.issues,
      attempts:           1,
      firstPassApproved:  initialValidation.valid,
      repairedAt:         new Date().toISOString(),
      repairSucceeded:    initialValidation.valid,
    };

    if (initialValidation.valid) {
      return { output: rawOutput, repaired: false, validation: initialValidation, audit };
    }

    try {
      const { callAIGateway } = await import('./aiGatewayService');
      const repairPrompt = buildRepairPrompt(originalPrompt, rawOutput, initialValidation, ctx);
      const { result } = await callAIGateway({ task: 'json', prompt: repairPrompt, creditsRequired: 0 });
      const revalidation = validateAIOutput(result, docType, ctx);

      audit.finalScore      = revalidation.score;
      audit.finalIssues     = revalidation.issues;
      audit.attempts        = 2;
      audit.repairSucceeded = revalidation.valid;

      return { output: result, repaired: true, validation: revalidation, audit };
    } catch {
      return { output: rawOutput, repaired: false, validation: initialValidation, audit };
    }
  },
};

// ─── Mapper doc type → DocumentCategory ───────────────────────────────────────

export function mapDocTypeToCategory(type: string): DocumentCategory {
  const t = String(type).toUpperCase().replace(/\s+/g, '_');
  if (t.includes('ESTUDO'))  return 'estudo_de_caso';
  if (t.includes('PEI'))     return 'pei';
  if (t.includes('PAEE'))    return 'paee';
  if (t.includes('PDI'))     return 'pdi';
  if (t.includes('FICHA') && t.includes('COGN')) return 'ficha_cognitiva';
  if (t.includes('FICHA'))   return 'ficha_aluno';
  if (t.includes('RELAT'))   return 'relatorio';
  if (t.includes('ATIVID'))  return 'atividade_adaptada';
  return 'estudo_de_caso';
}
