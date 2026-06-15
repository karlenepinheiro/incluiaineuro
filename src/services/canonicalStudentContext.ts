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
  | 'documento_unificado_pei_paee'
  | 'pdi'
  | 'relatorio'
  | 'atividade_adaptada'
  | 'plano_acao_regente'
  | 'plano_acao_aee'
  | 'perfil_inteligente';

/** Documento pedagógico salvo (PEI, PAEE, PDI, Estudo de Caso etc.) da tabela `documents` */
export interface SavedPedagogicalDocument {
  id: string;
  docType: string;
  category: DocumentCategory;
  title: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  auditCode?: string;
  /** Resumo compacto extraído de structured_data.sections */
  contentSummary: string;
  /** Títulos das seções que têm conteúdo */
  sectionsPresent: string[];
}

/** Plano de ação salvo (regente ou AEE) */
export interface SavedActionPlan {
  id: string;
  source: 'regente' | 'aee';
  planType: string;
  title?: string;
  contentSummary: string;
  registerCode?: string;
  versionNumber: number;
  createdAt: string;
}

/** Versão mais recente do Perfil Inteligente salvo */
export interface SavedIntelligentProfile {
  id: string;
  versionNumber: number;
  createdAt: string;
  hasPreviousVersions: boolean;
  generatedBy?: string;
  synthesis?: string;
  pedagogical?: string;
  /** Potencialidades identificadas */
  strengths?: string[];
  /** Barreiras / desafios identificados, formato "Título: descrição" */
  challenges?: string[];
  /** Texto do parecer neuropedagógico */
  neuropsychologicalText?: string;
  /** Ações e adaptações neuropedagógicas concretas */
  neuropsychologicalActions?: string[];
  /** Texto do perfil de aprendizagem */
  learningProfileText?: string;
  /** Tempo estimado de atenção sustentada */
  attentionSpan?: string;
  bestStrategies?: string[];
  nextSteps?: string[];
  observationPoints?: string[];
  carePoints?: string[];
  /** Fontes consideradas na geração */
  sourcesConsidered?: string[];
  /** Principais mudanças desde a versão anterior */
  changesSinceLastVersion?: string;
}

/** Atividade pedagógica gerada para o aluno */
export interface ContextGeneratedActivity {
  id: string;
  title: string;
  discipline?: string;
  grade?: string;
  createdAt: string;
  contentSummary: string;
  // Sprint IA-6: histórico de atividades e estratégias
  bnccCodes?: string[];
  bnccCode?: string;
  difficultyLevel?: string;
  isAdapted?: boolean;
  mode?: string;
  objective?: string;
  strategies?: string[];
  materials?: string[];
}

/** Evidência estruturada extraída de um checklist (regente ou cuidadora) */
export interface ChecklistEvidence {
  origin: 'regente' | 'cuidadora';
  /** Como o registro foi gerado: digital=preenchimento direto, uploaded_ai_read=upload+OCR, scan_sheet=leitura ENEM-like */
  originDetail: 'digital' | 'uploaded_ai_read' | 'scan_sheet' | 'unknown';
  /** Confiança da leitura automática (0–1). null quando preenchimento digital. */
  confidence: number | null;
  date: string;
  professional: string;
  title: string;
  summary: string[];           // observações principais
  strategiesWorked: string[];  // estratégias que funcionaram
  barriers: string[];          // barreiras / dificuldades identificadas
  alerts: string[];            // alertas que requerem atenção imediata
  recommendations: string[];   // recomendações do profissional
  parecer?: string;            // parecer pedagógico gerado pela IA (se disponível)
}

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
  // Evidências estruturadas de checklists (Sprint 14)
  checklistEvidences: ChecklistEvidence[];
  // Camadas de prioridade (v2)
  priority: EvidenceLayer;
  complementary: EvidenceLayer;
  gaps: DataGap[];
  completenessAlerts: CompletenessAlert[];
  // Documentos pedagógicos salvos (Sprint IA-1)
  savedDocuments: SavedPedagogicalDocument[];
  savedActionPlans: SavedActionPlan[];
  savedAEEActionPlans: SavedActionPlan[];
  savedIntelligentProfile: SavedIntelligentProfile | null;
  generatedActivities: ContextGeneratedActivity[];
  attachedDocuments: (AttachedDocumentEntry & { notes?: string })[];
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
  checklistEvidences: ChecklistEvidence[];
  enriched: EnrichedData;
  loadedAt: string;
  // Sprint IA-1: documentos pedagógicos e perfis salvos
  savedDocuments: SavedPedagogicalDocument[];
  savedActionPlans: SavedActionPlan[];
  savedAEEActionPlans: SavedActionPlan[];
  savedIntelligentProfile: SavedIntelligentProfile | null;
  generatedActivities: ContextGeneratedActivity[];
}

// ─── Constantes ────────────────────────────────────────────────────────────────

const COGNITIVE_DIMENSIONS = [
  'Comunicação Expressiva', 'Interação Social', 'Autonomia (AVD)',
  'Autorregulação', 'Atenção Sustentada', 'Compreensão',
  'Motricidade Fina', 'Motricidade Grossa', 'Participação', 'Linguagem/Leitura',
];

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  ficha_aluno:        'Ficha do Aluno',
  ficha_cognitiva:    'Ficha Cognitiva',
  estudo_de_caso:     'Estudo de Caso',
  pei:                'PEI (Plano Educacional Individualizado)',
  paee:               'PAEE (Plano de AEE)',
  documento_unificado_pei_paee: 'Documento Unificado PEI + PAEE',
  pdi:                'PDI (Plano de Desenvolvimento Individual)',
  relatorio:          'Relatório',
  atividade_adaptada: 'Atividade Adaptada',
  plano_acao_regente: 'Plano de Ação — Professor Regente',
  plano_acao_aee:     'Plano de Ação AEE',
  perfil_inteligente: 'Perfil Inteligente',
};

/** Quais categorias de documentos salvos são relevantes para cada tipo de documento gerado */
function getRelevantDocTypes(docType: DocumentCategory): DocumentCategory[] {
  switch (docType) {
    case 'pei':
      return ['estudo_de_caso', 'paee'];
    case 'paee':
      return ['estudo_de_caso'];
    case 'pdi':
      return ['pei', 'paee', 'estudo_de_caso'];
    case 'documento_unificado_pei_paee':
      return ['estudo_de_caso', 'paee', 'pei'];
    case 'plano_acao_regente':
      return ['estudo_de_caso', 'pei', 'paee', 'plano_acao_aee'];
    case 'plano_acao_aee':
      return ['paee', 'estudo_de_caso'];
    case 'perfil_inteligente':
      return ['pei', 'paee', 'pdi', 'estudo_de_caso', 'plano_acao_regente', 'plano_acao_aee', 'relatorio'];
    default:
      return ['estudo_de_caso'];
  }
}

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
    notes: d.notes ?? undefined,
  } as AttachedDocumentEntry & { notes?: string }));
}

// ─── Normalizers — documentos pedagógicos salvos (Sprint IA-1) ────────────────

function summarizeSavedDocContent(structured_data: any): { summary: string; sections: string[] } {
  if (!structured_data || typeof structured_data !== 'object') return { summary: '', sections: [] };
  const sections: string[] = [];
  const parts: string[] = [];
  try {
    const secs = Array.isArray(structured_data.sections)
      ? structured_data.sections
      : Array.isArray(structured_data.blocos) ? structured_data.blocos : [];
    for (const sec of secs) {
      const secTitle = sec.title ?? sec.titulo ?? '';
      if (secTitle) sections.push(String(secTitle));
      const fields = Array.isArray(sec.fields) ? sec.fields : Array.isArray(sec.campos) ? sec.campos : [];
      for (const f of fields) {
        const val = f.value ?? f.valor ?? '';
        const label = f.label ?? f.rotulo ?? f.id ?? '';
        if (typeof val === 'string' && val.trim().length > 10 && label) {
          parts.push(`${label}: ${val.slice(0, 280)}`);
        }
      }
    }
  } catch { /* ignora erros de parsing */ }
  return { summary: parts.slice(0, 10).join('\n'), sections: sections.filter(Boolean) };
}

function normalizeSavedDocuments(raw: any[]): SavedPedagogicalDocument[] {
  return (raw ?? []).map(d => {
    const { summary, sections } = summarizeSavedDocContent(d.structured_data);
    return {
      id: d.id,
      docType: d.doc_type ?? '',
      category: mapDocTypeToCategory(d.doc_type ?? ''),
      title: d.title ?? d.doc_type ?? '',
      status: d.status ?? 'APPROVED',
      createdAt: d.created_at ?? '',
      updatedAt: d.updated_at ?? undefined,
      auditCode: d.audit_code ?? undefined,
      contentSummary: summary,
      sectionsPresent: sections,
    };
  });
}

function normalizeActionPlans(raw: any[], source: 'regente' | 'aee'): SavedActionPlan[] {
  return (raw ?? []).map(r => {
    const cj = r.content_json ?? {};
    const parts: string[] = [];
    for (const key of ['session_objective', 'next_step', 'summary']) {
      if (cj[key] && typeof cj[key] === 'string') parts.push(`${key}: ${String(cj[key]).slice(0, 200)}`);
    }
    const planSummary = r.summary ?? '';
    return {
      id: r.id,
      source,
      planType: r.plan_type ?? 'mensal',
      title: r.title ?? '',
      contentSummary: planSummary || parts.slice(0, 4).join('\n'),
      registerCode: r.register_code ?? undefined,
      versionNumber: r.version_number ?? 1,
      createdAt: r.created_at ?? '',
    };
  });
}

function normalizeIntelligentProfile(raw: any[]): SavedIntelligentProfile | null {
  if (!raw || raw.length === 0) return null;
  const latest = raw[0];
  const pj = latest.profile_json ?? {};
  return {
    id: latest.id,
    versionNumber: latest.version_number ?? 1,
    createdAt: latest.created_at ?? '',
    hasPreviousVersions: raw.length > 1,
    generatedBy: typeof pj.generatedBy === 'string' && pj.generatedBy ? pj.generatedBy : undefined,
    synthesis:         pj.humanizedIntroduction?.text?.slice(0, 600) ?? undefined,
    pedagogical:       pj.pedagogicalReport?.text?.slice(0, 600) ?? undefined,
    strengths:         Array.isArray(pj.strengths) ? pj.strengths.slice(0, 5) : undefined,
    challenges:        Array.isArray(pj.challenges)
      ? pj.challenges.map((c: any) => `${c.title ?? ''}: ${c.description ?? ''}`).slice(0, 3) : undefined,
    neuropsychologicalText: typeof pj.neuropsychologicalReport?.text === 'string'
      ? pj.neuropsychologicalReport.text.slice(0, 400) : undefined,
    neuropsychologicalActions: Array.isArray(pj.neuropsychologicalReport?.checklist)
      ? pj.neuropsychologicalReport.checklist.slice(0, 4) : undefined,
    learningProfileText: typeof pj.learningProfile?.text === 'string'
      ? pj.learningProfile.text.slice(0, 300) : undefined,
    attentionSpan: typeof pj.learningProfile?.attentionSpan === 'string'
      ? pj.learningProfile.attentionSpan : undefined,
    bestStrategies:    Array.isArray(pj.bestLearningStrategies?.items)
      ? pj.bestLearningStrategies.items.slice(0, 6) : undefined,
    nextSteps:         Array.isArray(pj.nextSteps) ? pj.nextSteps.slice(0, 4) : undefined,
    observationPoints: Array.isArray(pj.observationPoints?.checklist)
      ? pj.observationPoints.checklist.slice(0, 4) : undefined,
    carePoints:        Array.isArray(pj.carePoints) ? pj.carePoints.slice(0, 3) : undefined,
    sourcesConsidered: Array.isArray(pj.sourcesConsidered) ? pj.sourcesConsidered : undefined,
    changesSinceLastVersion: typeof pj.changesSinceLastVersion === 'string' && pj.changesSinceLastVersion
      ? pj.changesSinceLastVersion : undefined,
  };
}

function normalizeGeneratedActivities(raw: any[]): ContextGeneratedActivity[] {
  return (raw ?? []).map(a => {
    const cj = typeof a.content_json === 'object' && a.content_json ? a.content_json : {};
    const guia = cj.guia_pedagogico ?? {};

    const objective = (
      guia.objetivo_da_aula?.trim() ||
      cj.folha_do_aluno?.objetivo_simplificado?.trim() ||
      ''
    ).slice(0, 200) || undefined;

    const strategies: string[] = [];
    if (Array.isArray(guia.dicas_de_mediacao))    strategies.push(...guia.dicas_de_mediacao.slice(0, 3));
    if (Array.isArray(guia.adaptacoes_inclusivas)) strategies.push(...guia.adaptacoes_inclusivas.slice(0, 2));

    const materials: string[] = Array.isArray(guia.materiais_necessarios)
      ? guia.materiais_necessarios.slice(0, 4) : [];

    const rawBnccCode: string = guia.bncc_alinhamento?.codigo_bncc ?? '';
    const bnccCode = rawBnccCode && !rawBnccCode.toLowerCase().includes('sugerido')
      ? rawBnccCode : undefined;
    const bnccFromField = Array.isArray(a.bncc_codes) && a.bncc_codes.length > 0
      ? a.bncc_codes as string[] : undefined;

    return {
      id: a.id,
      title: a.title ?? 'Atividade gerada',
      discipline: a.discipline ?? undefined,
      grade: a.grade ?? undefined,
      createdAt: a.created_at ?? '',
      contentSummary: typeof a.content === 'string' ? a.content.slice(0, 200) : '',
      bnccCodes: bnccFromField ?? (bnccCode ? [bnccCode] : undefined),
      bnccCode,
      difficultyLevel: a.difficulty_level ?? undefined,
      isAdapted: typeof a.is_adapted === 'boolean' ? a.is_adapted : undefined,
      mode: a.mode ?? undefined,
      objective,
      strategies: strategies.length > 0 ? strategies : undefined,
      materials: materials.length > 0 ? materials : undefined,
    };
  });
}

// ─── Checklist parsing ─────────────────────────────────────────────────────────

function arrFromField(fd: any, key: string): string[] {
  const v = fd?.[key];
  if (Array.isArray(v)) return v.filter(Boolean) as string[];
  if (typeof v === 'string' && v.trim()) return [v];
  return [];
}

/** Extrai evidência estruturada de um observation_form do tipo checklist */
function parseChecklistEvidence(form: ObservationFormEntry): ChecklistEvidence {
  const fd = form.fieldsData as any;
  const isRegente = form.formType === 'checklist_regente';

  // Lê origin do fields_data (onde todos os formulários armazenam)
  const rawOrigin: string = fd?.origin ?? 'digital';
  const originDetail: ChecklistEvidence['originDetail'] =
    rawOrigin === 'uploaded_ai_read' ? 'uploaded_ai_read'
    : rawOrigin === 'scan_sheet'    ? 'scan_sheet'
    : rawOrigin === 'digital'       ? 'digital'
    : 'unknown';

  const confidence: number | null =
    typeof fd?.confidence === 'number' ? fd.confidence : null;

  const strategiesWorked = arrFromField(fd, 'estrategiasEficazes');

  let summary: string[] = [];
  let barriers: string[] = [];
  let alerts: string[] = [];
  let recommendations: string[] = [];

  if (isRegente) {
    summary = [
      ...arrFromField(fd, 'atencaoParticipacao').slice(0, 2),
      ...arrFromField(fd, 'aprendizagem').slice(0, 2),
      ...arrFromField(fd, 'autonomia').slice(0, 1),
    ].slice(0, 5);

    barriers = [
      ...arrFromField(fd, 'atencaoParticipacao').filter((i: string) =>
        /distrai|evita|abandona|repetidos/i.test(i)),
      ...arrFromField(fd, 'comunicacao').filter((i: string) =>
        /dificuldade|ecolalia|não se comunica|apoio visual/i.test(i)),
      ...arrFromField(fd, 'regulacaoComportamento').filter((i: string) =>
        /agitação|ansied|irrit|chora|recusa/i.test(i)),
      ...arrFromField(fd, 'interacaoSocial').filter((i: string) =>
        /sozinho|conflitos|frustração/i.test(i)),
    ].slice(0, 5);

    recommendations = arrFromField(fd, 'recomendacoesImediatas').slice(0, 5);
    alerts = arrFromField(fd, 'recomendacoesImediatas').filter((r: string) =>
      /encaminhar|solicitar|família|estudo de caso/i.test(r));
  } else {
    // Cuidadora
    summary = [
      ...arrFromField(fd, 'regulacaoEmocional').slice(0, 2),
      ...arrFromField(fd, 'comunicacaoNecessidades').slice(0, 2),
      ...arrFromField(fd, 'alimentacao').slice(0, 1),
    ].slice(0, 5);

    barriers = [
      ...arrFromField(fd, 'chegadaEscola').filter((i: string) =>
        /choroso|agitado|Resistiu|cansaço/i.test(i)),
      ...arrFromField(fd, 'regulacaoEmocional').filter((i: string) =>
        /irritab|choro|gritos|crise|fuga/i.test(i)),
      ...arrFromField(fd, 'transicoesRotina').filter((i: string) =>
        /Resiste|crise|extra/i.test(i)),
    ].slice(0, 5);

    alerts = arrFromField(fd, 'alertasSemana').slice(0, 5);
    recommendations = arrFromField(fd, 'alertasSemana').slice(0, 3);
  }

  const parecer = typeof fd?.parecer === 'string' && fd.parecer.trim()
    ? fd.parecer
    : undefined;

  return {
    origin: isRegente ? 'regente' : 'cuidadora',
    originDetail,
    confidence,
    date: form.createdAt,
    professional: form.createdBy,
    title: form.title,
    summary,
    strategiesWorked,
    barriers,
    alerts,
    recommendations,
    parecer,
  };
}

/**
 * Extrai e estrutura os últimos checklists a partir dos observation_forms já carregados.
 * Limita a 3 regente + 2 cuidadora para controle de tokens.
 */
function extractChecklistEvidences(forms: ObservationFormEntry[]): ChecklistEvidence[] {
  const checklists = forms.filter(f =>
    f.formType === 'checklist_regente' || f.formType === 'checklist_cuidadora',
  );
  if (checklists.length === 0) return [];

  const regente   = checklists.filter(f => f.formType === 'checklist_regente').slice(0, 3);
  const cuidadora = checklists.filter(f => f.formType === 'checklist_cuidadora').slice(0, 2);

  return [...regente, ...cuidadora]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(parseChecklistEvidence);
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

    case 'documento_unificado_pei_paee':
      priority.cognitiveProfiles = cognitiveProfiles.slice(0, 2);
      priority.reports            = medicalReports.slice(0, 2);
      priority.forms              = observationForms.slice(0, 4);
      priority.timeline           = timeline.filter(t => ['evolucao', 'protocolo', 'documento'].includes(t.eventType)).slice(0, 10);
      priority.appointments       = appointments.slice(-10);
      complementary.cognitiveProfiles = cognitiveProfiles.slice(2, 3);
      complementary.reports           = medicalReports.slice(2, 4);
      complementary.forms             = observationForms.slice(4, 6);
      break;

    case 'ficha_cognitiva':
      priority.cognitiveProfiles = cognitiveProfiles;
      priority.reports            = medicalReports.slice(0, 3);
      priority.forms              = observationForms;
      priority.timeline           = timeline.filter(t => t.eventType === 'evolucao').slice(0, 10);
      break;

    case 'plano_acao_regente':
      priority.cognitiveProfiles = cognitiveProfiles.slice(0, 1);
      priority.forms             = observationForms.slice(0, 5);
      priority.reports           = medicalReports.slice(0, 2);
      priority.timeline          = timeline.filter(t => ['evolucao', 'nota'].includes(t.eventType)).slice(0, 8);
      priority.appointments      = appointments.slice(-10);
      complementary.cognitiveProfiles = cognitiveProfiles.slice(1, 3);
      complementary.forms        = observationForms.slice(5, 8);
      break;

    case 'plano_acao_aee':
      priority.reports           = medicalReports;
      priority.forms             = observationForms.slice(0, 4);
      priority.cognitiveProfiles = cognitiveProfiles.slice(0, 2);
      priority.timeline          = timeline.filter(t => ['evolucao', 'protocolo'].includes(t.eventType)).slice(0, 10);
      priority.appointments      = appointments.slice(-20);
      complementary.cognitiveProfiles = cognitiveProfiles.slice(2);
      complementary.forms        = observationForms.slice(4);
      break;

    case 'perfil_inteligente':
      priority.cognitiveProfiles = cognitiveProfiles;
      priority.reports           = medicalReports;
      priority.forms             = observationForms.slice(0, 6);
      priority.timeline          = timeline.slice(0, 15);
      priority.appointments      = appointments;
      complementary.forms        = observationForms.slice(6);
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
    checklistEvidences: ctx.checklistEvidences,
    priority, complementary, gaps, completenessAlerts: alerts,
    // Sprint IA-1 — documentos pedagógicos e perfis salvos
    savedDocuments:          ctx.savedDocuments,
    savedActionPlans:        ctx.savedActionPlans,
    savedAEEActionPlans:     ctx.savedAEEActionPlans,
    savedIntelligentProfile: ctx.savedIntelligentProfile,
    generatedActivities:     ctx.generatedActivities,
    attachedDocuments:       ctx.attachedDocuments as (AttachedDocumentEntry & { notes?: string })[],
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function hasPKScores(pk: PriorKnowledgeProfile): boolean {
  return !!(pk.leitura_score || pk.escrita_score || pk.entendimento_score ||
            pk.autonomia_score || pk.atencao_score || pk.raciocinio_score);
}

// ─── Builders de blocos de prompt — documentos salvos (Sprint IA-1) ───────────

export function buildDocumentSummaryBlock(
  docs: SavedPedagogicalDocument[],
  docType: DocumentCategory,
): string {
  const relevantCategories = getRelevantDocTypes(docType);
  const relevant = docs.filter(d => relevantCategories.includes(d.category));

  const lines: string[] = ['\n=== DOCUMENTOS PEDAGÓGICOS EXISTENTES ==='];

  if (relevant.length === 0) {
    const missing = relevantCategories.map(c => CATEGORY_LABELS[c] ?? c).join(', ');
    lines.push(`Nenhum documento relevante encontrado (esperados: ${missing}). Sinalize esta lacuna ao gerar.`);
    return lines.join('\n');
  }

  lines.push('INSTRUÇÃO: Use os conteúdos abaixo para garantir coerência e continuidade pedagógica. Não contradiga documentos existentes sem justificativa explícita.');

  for (const doc of relevant) {
    const date = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('pt-BR') : '—';
    lines.push(`\n[${CATEGORY_LABELS[doc.category] ?? doc.docType}] ${doc.title} (${date}) | Status: ${doc.status}${doc.auditCode ? ` | Cód: ${doc.auditCode}` : ''}`);
    if (doc.sectionsPresent.length > 0) lines.push(`  Seções: ${doc.sectionsPresent.join(' | ')}`);
    if (doc.contentSummary) {
      lines.push('  Conteúdo extraído:');
      for (const line of doc.contentSummary.split('\n').slice(0, 10)) {
        if (line.trim()) lines.push(`    ${line.slice(0, 300)}`);
      }
    }
  }
  return lines.join('\n');
}

export function buildUploadedReportsBlock(attached: (AttachedDocumentEntry & { notes?: string })[]): string {
  const lines: string[] = ['\n=== LAUDOS E RELATÓRIOS SUBIDOS ==='];
  if (attached.length === 0) {
    lines.push('Nenhum arquivo subido registrado.');
    return lines.join('\n');
  }
  lines.push('NOTA: Arquivos físicos enviados pelo profissional. Apenas metadados disponíveis — não invente conteúdo. Cite como "arquivo anexado" ou "laudo subido pelo profissional".');
  for (const doc of attached) {
    const date = doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('pt-BR') : '—';
    lines.push(`  • ${doc.documentType || 'Documento'}: ${doc.name} (subido em ${date})`);
    if (doc.notes) lines.push(`    Observações: ${String(doc.notes).slice(0, 300)}`);
  }
  return lines.join('\n');
}

export function buildSavedActionPlansBlock(
  actionPlans: SavedActionPlan[],
  aeeActionPlans: SavedActionPlan[],
  docType: DocumentCategory,
): string {
  const needsRegente = ['plano_acao_aee', 'perfil_inteligente', 'pei', 'pdi', 'plano_acao_regente'].includes(docType);
  const needsAEE     = ['plano_acao_regente', 'perfil_inteligente', 'pei', 'paee', 'pdi', 'plano_acao_aee'].includes(docType);
  const lines: string[] = [];

  if (needsRegente && actionPlans.length > 0) {
    lines.push('\n=== PLANOS DE AÇÃO DO PROFESSOR REGENTE ===');
    for (const p of actionPlans.slice(0, 2)) {
      const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString('pt-BR') : '—';
      lines.push(`  [v${p.versionNumber}] ${p.title || p.planType} (${date})${p.registerCode ? ` — Cód: ${p.registerCode}` : ''}`);
      if (p.contentSummary) lines.push(`  ${p.contentSummary.slice(0, 400)}`);
    }
  }

  if (needsAEE && aeeActionPlans.length > 0) {
    lines.push('\n=== PLANOS DE AÇÃO AEE ===');
    for (const p of aeeActionPlans.slice(0, 2)) {
      const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString('pt-BR') : '—';
      lines.push(`  [v${p.versionNumber}] ${p.title || p.planType} (${date})${p.registerCode ? ` — Cód: ${p.registerCode}` : ''}`);
      if (p.contentSummary) lines.push(`  ${p.contentSummary.slice(0, 400)}`);
    }
  }

  return lines.join('\n');
}

export function buildIntelligentProfileBlock(profile: SavedIntelligentProfile | null): string {
  if (!profile) return '';
  const date = profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('pt-BR') : '—';
  const lines = ['\n=== PERFIL INTELIGENTE MAIS RECENTE ==='];
  lines.push(
    `Versão ${profile.versionNumber} — gerado em ${date}` +
    (profile.generatedBy ? ` por ${profile.generatedBy}` : '') +
    (profile.hasPreviousVersions ? ' (versões anteriores existem)' : ''),
  );
  if (profile.synthesis)
    lines.push(`\nSíntese narrativa do aluno:\n${profile.synthesis}`);
  if (profile.pedagogical)
    lines.push(`\nParecer pedagógico:\n${profile.pedagogical}`);
  if (profile.strengths?.length) {
    lines.push('\nPotencialidades identificadas:');
    profile.strengths.forEach(s => lines.push(`  • ${s}`));
  }
  if (profile.challenges?.length) {
    lines.push('\nBarreiras / Desafios identificados:');
    profile.challenges.forEach(c => lines.push(`  • ${c}`));
  }
  if (profile.neuropsychologicalText)
    lines.push(`\nParecer neuropedagógico:\n${profile.neuropsychologicalText}`);
  if (profile.neuropsychologicalActions?.length) {
    lines.push('\nAdaptações e ações neuropedagógicas:');
    profile.neuropsychologicalActions.forEach(a => lines.push(`  • ${a}`));
  }
  if (profile.learningProfileText) {
    lines.push(`\nPerfil de aprendizagem:\n${profile.learningProfileText}`);
    if (profile.attentionSpan)
      lines.push(`  Tempo de atenção sustentada: ${profile.attentionSpan}`);
  }
  if (profile.bestStrategies?.length) {
    lines.push('\nMelhores estratégias de aprendizagem:');
    profile.bestStrategies.forEach(s => lines.push(`  • ${s}`));
  }
  if (profile.nextSteps?.length) {
    lines.push('\nRecomendações pedagógicas / Próximos passos:');
    profile.nextSteps.forEach(s => lines.push(`  • ${s}`));
  }
  if (profile.observationPoints?.length) {
    lines.push('\nPontos de observação para as próximas semanas:');
    profile.observationPoints.forEach(o => lines.push(`  • ${o}`));
  }
  if (profile.carePoints?.length) {
    lines.push('\nAlertas e cuidados importantes:');
    profile.carePoints.forEach(c => lines.push(`  • ${c}`));
  }
  if (profile.changesSinceLastVersion)
    lines.push(`\nMudanças desde a versão anterior:\n${profile.changesSinceLastVersion}`);
  if (profile.sourcesConsidered?.length) {
    lines.push('\nFontes consideradas na geração deste perfil:');
    profile.sourcesConsidered.forEach(s => lines.push(`  • ${s}`));
  }
  lines.push('\n[Fim do Perfil Inteligente — use como síntese complementar. Não substitui documentos oficiais (PEI, PAEE, Estudo de Caso).]');
  return lines.join('\n');
}

// ─── Sprint IA-6: Histórico de atividades e estratégias ───────────────────────

const ACTIVITIES_RELEVANT_DOCS: DocumentCategory[] = [
  'atividade_adaptada', 'plano_acao_regente', 'plano_acao_aee',
  'perfil_inteligente', 'pei', 'paee', 'pdi', 'relatorio', 'estudo_de_caso',
];

/**
 * Bloco compacto com o histórico de atividades pedagógicas geradas para o aluno.
 * Inclui padrões identificados e regras anti-repetição para a IA.
 */
export function buildActivitiesHistoryBlock(
  activities: ContextGeneratedActivity[],
  docType: DocumentCategory,
): string {
  if (activities.length === 0) return '';
  if (!ACTIVITIES_RELEVANT_DOCS.includes(docType)) return '';

  const lines: string[] = ['\n=== ATIVIDADES PEDAGÓGICAS JÁ GERADAS PARA ESTE ALUNO ==='];
  lines.push('INSTRUÇÃO: Use para evitar repetição, garantir progressão e propor continuidade pedagógica.');

  for (const a of activities) {
    const date = a.createdAt ? new Date(a.createdAt).toLocaleDateString('pt-BR') : '—';
    const parts: string[] = [`  • [${date}] ${a.title}`];
    if (a.discipline)      parts.push(`Área: ${a.discipline}`);
    if (a.grade)           parts.push(`Série: ${a.grade}`);
    if (a.difficultyLevel) parts.push(`Nível: ${a.difficultyLevel}`);
    const bncc = a.bnccCodes?.[0] ?? a.bnccCode;
    if (bncc)        parts.push(`BNCC: ${bncc}`);
    if (a.isAdapted) parts.push('Adaptada');
    lines.push(parts.join(' | '));
    if (a.objective)          lines.push(`    Obj.: ${a.objective.slice(0, 150)}`);
    if (a.materials?.length)  lines.push(`    Materiais: ${a.materials.slice(0, 3).join(', ')}`);
    if (a.strategies?.length) lines.push(`    Mediação: ${a.strategies.slice(0, 2).join('; ')}`);
  }

  // Resumo de padrões do histórico
  const disciplines = [...new Set(activities.map(a => a.discipline).filter(Boolean))];
  const levels      = [...new Set(activities.map(a => a.difficultyLevel).filter(Boolean))];
  const allBncc     = activities.flatMap(a => a.bnccCodes?.length ? a.bnccCodes : a.bnccCode ? [a.bnccCode] : []);
  const topBncc     = [...new Set(allBncc)].slice(0, 4);

  if (disciplines.length > 0 || levels.length > 0 || topBncc.length > 0) {
    lines.push('\nPadrões do histórico:');
    if (disciplines.length > 0) lines.push(`  Disciplinas abordadas: ${disciplines.join(', ')}`);
    if (levels.length > 0)      lines.push(`  Níveis trabalhados: ${levels.join(', ')}`);
    if (topBncc.length > 0)     lines.push(`  BNCCs já trabalhadas: ${topBncc.join(', ')}`);
  }

  lines.push('\nREGRAS ANTI-REPETIÇÃO (obrigatório ao gerar nova atividade ou plano):');
  lines.push('  1. Não repetir título, tema ou formato das atividades acima sem justificativa pedagógica.');
  lines.push('  2. Variar formato (pareamento, sequência, jogo, história, oral, recorte-colagem), recurso (concreto, digital, impresso) e nível de mediação.');
  lines.push('  3. Ao propor nova atividade, indicar conexão: continuidade, aprofundamento ou variação do histórico.');
  lines.push('  4. Manter coerência BNCC — avançar ou aprofundar habilidades já iniciadas.');
  lines.push('  5. Calibrar dificuldade a partir do histórico: não regredir sem justificativa.');

  return lines.join('\n');
}

/**
 * Bloco de estratégias que funcionaram e que exigem cautela, extraídas de
 * checklists (regente + cuidadora) e do Perfil Inteligente.
 */
export function buildStrategiesBlock(pack: EvidencePack): string {
  const worked: string[]   = [];
  const cautious: string[] = [];

  // Checklists do professor regente e cuidadora
  for (const ev of pack.checklistEvidences) {
    const origin = ev.origin === 'regente' ? 'Sala comum' : 'AEE/Rotina';
    ev.strategiesWorked.forEach(s => { if (s.trim()) worked.push(s.trim()); });
    ev.barriers.forEach(b => { if (b.trim()) cautious.push(`${origin}: ${b.trim()}`); });
    ev.alerts.forEach(a => { if (a.trim()) cautious.push(`${origin} (alerta): ${a.trim()}`); });
  }

  // Perfil Inteligente
  if (pack.savedIntelligentProfile) {
    (pack.savedIntelligentProfile.bestStrategies ?? []).forEach(s => worked.push(s));
    (pack.savedIntelligentProfile.carePoints ?? []).forEach(c => cautious.push(c));
  }

  const workedUnique   = [...new Set(worked.filter(Boolean))].slice(0, 10);
  const cautiousUnique = [...new Set(cautious.filter(Boolean))].slice(0, 6);

  if (workedUnique.length === 0 && cautiousUnique.length === 0) return '';

  const lines: string[] = [];

  if (workedUnique.length > 0) {
    lines.push('\n=== ESTRATÉGIAS QUE FUNCIONARAM ===');
    lines.push('Fonte: checklists pedagógicos e Perfil Inteligente. Priorize ao planejar atividades, planos e adaptações.');
    workedUnique.forEach(s => lines.push(`  ✓ ${s}`));
  }

  if (cautiousUnique.length > 0) {
    lines.push('\n=== ESTRATÉGIAS QUE EXIGEM CAUTELA ===');
    lines.push('Fonte: barreiras observadas em sala e rotina. Evite ou adapte antes de usar.');
    cautiousUnique.forEach(s => lines.push(`  ⚠ ${s}`));
  }

  return lines.join('\n');
}

// ─── Cadeia documental por tipo de documento (Sprint IA-2) ────────────────────

export interface DocumentChainEntry {
  label: string;
  found: boolean;
  count?: number;
}

export interface DocumentChain {
  targetDocType: DocumentCategory;
  targetLabel: string;
  primarySources: DocumentChainEntry[];
  secondarySources: DocumentChainEntry[];
  complementarySources: DocumentChainEntry[];
  criticalGaps: string[];
  warnings: string[];
}

/** Instrução de prioridade por tipo de documento */
const DOC_PRIORITY_INSTRUCTIONS: Partial<Record<DocumentCategory, string>> = {
  pei:
    'Baseie o PEI prioritariamente no Estudo de Caso e na Ficha do Aluno. Use PAEE, laudos, relatórios e fichas preenchidas como complementos. O PEI deve tratar do que o aluno aprende, objetivos educacionais, adaptações curriculares, estratégias, BNCC e avaliação.',
  paee:
    'Baseie o PAEE prioritariamente no Estudo de Caso, na Ficha do Aluno e nos laudos/relatórios subidos. O PAEE deve tratar de barreiras, acessibilidade, tecnologia assistiva, recursos, estratégias do AEE e articulação com sala comum.',
  pdi:
    'Baseie o PDI no Estudo de Caso, PEI, PAEE e Ficha do Aluno. O PDI deve integrar metas de desenvolvimento, indicadores e monitoramento; evolução, avanço, regressão ou manutenção só devem ser mencionados quando houver registros temporais comparáveis.',
  documento_unificado_pei_paee:
    'Baseie o Documento Unificado PEI + PAEE prioritariamente no Estudo de Caso, PAEE e PEI. Sintetize e integre as fontes sem copiar integralmente. Use ficha do aluno, família registrada, laudos/documentos analisados, ficha cognitiva, observações e registros pedagógicos apenas como fontes secundárias. Perfil Inteligente, Planos de Ação e atividades geradas não devem ser base principal.',
  plano_acao_regente:
    'Baseie o Plano Regente prioritariamente no Estudo de Caso, PEI e PAEE quando existirem. Use o PAEE como fonte de acessibilidade, apoios e barreiras, sem transformar o documento em Plano AEE. Recursos e atividades só devem ser sugeridos quando houver relação com barreira, objetivo pedagógico, necessidade de acesso ou registro disponível.',
  plano_acao_aee:
    'Baseie o Plano AEE obrigatoriamente no PAEE e no Estudo de Caso. Use ficha do aluno, laudos, fichas cognitivas, relatório da cuidadora e Perfil Inteligente como evidências complementares. Mantenha foco em acessibilidade, barreiras, recursos e acompanhamento do AEE; não transforme o plano em currículo de sala comum. Recursos e atividades só devem ser sugeridos quando houver evidência ou indicação no PAEE/contexto.',
  perfil_inteligente:
    'Considere todos os documentos e evidências disponíveis. Produza uma síntese pedagógica objetiva, sem inventar dados e diferenciando laudo, observação pedagógica, rotina e documento oficial. Perfil anterior pode ser usado como histórico complementar, nunca como verdade única; evolução só deve ser mencionada com registros temporais comparáveis.',
  estudo_de_caso:
    'Integre todos os dados disponíveis: laudos, fichas, linha do tempo, família e perfil cognitivo. O Estudo de Caso é o documento-base de toda a cadeia pedagógica — deve ser analítico e interpretativo, não meramente descritivo.',
};

/**
 * Determina a cadeia documental oficial para cada tipo de documento.
 * Retorna fontes primárias, secundárias, complementares e lacunas identificadas.
 */
export function selectDocumentChainForTarget(
  ctx: CanonicalStudentContext,
  targetDocType: DocumentCategory,
): DocumentChain {
  const criticalGaps: string[] = [];
  const warnings: string[] = [];

  // Documentos salvos
  const ecDoc   = ctx.savedDocuments.find(d => d.category === 'estudo_de_caso') ?? null;
  const peiDoc  = ctx.savedDocuments.find(d => d.category === 'pei')            ?? null;
  const paeeDoc = ctx.savedDocuments.find(d => d.category === 'paee')           ?? null;
  const pdiDoc  = ctx.savedDocuments.find(d => d.category === 'pdi')            ?? null;

  // Evidências e contagens
  const laudosCount = ctx.medicalReports.length + ctx.attachedDocuments.length;
  const fichasCount = ctx.observationForms.filter(
    f => f.formType !== 'checklist_regente' && f.formType !== 'checklist_cuidadora',
  ).length;
  const hasEvolucoes = ctx.timeline.some(t => t.eventType === 'evolucao');
  const hasCuidadora = ctx.checklistEvidences.some(e => e.origin === 'cuidadora');
  const hasRegente   = ctx.checklistEvidences.some(e => e.origin === 'regente');
  const hasPerfil    = ctx.savedIntelligentProfile !== null;
  const hasAEEPlans  = ctx.savedAEEActionPlans.length > 0;
  const hasRegentePlans = ctx.savedActionPlans.length > 0;

  const entry = (label: string, found: boolean, count?: number): DocumentChainEntry =>
    ({ label, found, ...(count !== undefined ? { count } : {}) });

  const ec     = entry('Estudo de Caso',              !!ecDoc);
  const pei    = entry('PEI',                         !!peiDoc);
  const paee   = entry('PAEE',                        !!paeeDoc);
  const pdi    = entry('PDI',                         !!pdiDoc);
  const ficha  = entry('Ficha do Aluno',              true);
  const laudos = entry('Laudos e relatórios',         laudosCount > 0, laudosCount);
  const fichas = entry('Fichas cognitivas preenchidas', fichasCount > 0, fichasCount);
  const cuid   = entry('Relatório da cuidadora',      hasCuidadora);
  const reg    = entry('Observação do professor regente', hasRegente);
  const perfil = entry('Perfil Inteligente',          hasPerfil);
  const evol   = entry('Evoluções',                   hasEvolucoes);
  const aee    = entry('Planos de Ação AEE',          hasAEEPlans);

  let primarySources: DocumentChainEntry[];
  let secondarySources: DocumentChainEntry[];
  let complementarySources: DocumentChainEntry[];

  switch (targetDocType) {
    case 'pei':
      primarySources       = [ec, ficha];
      secondarySources     = [paee, laudos, fichas];
      complementarySources = [perfil, evol];
      if (!ecDoc) criticalGaps.push('Estudo de Caso ausente — fundamente nas demais fontes disponíveis e sinalize a lacuna no documento');
      if (!paeeDoc && laudosCount === 0) warnings.push('PAEE ausente e sem laudos — contextualização de acessibilidade pode ficar incompleta');
      break;

    case 'paee':
      primarySources       = [ec, ficha];
      secondarySources     = [laudos, perfil, fichas];
      complementarySources = [evol, reg];
      if (!ecDoc) criticalGaps.push('Estudo de Caso ausente — foque em laudos, ficha do aluno e fichas preenchidas');
      if (laudosCount === 0) warnings.push('Sem laudos analisados — barreiras de acessibilidade podem não estar suficientemente fundamentadas');
      break;

    case 'pdi':
      primarySources       = [ec, pei, paee];
      secondarySources     = [ficha, evol];
      complementarySources = [perfil];
      if (!ecDoc) criticalGaps.push('Estudo de Caso ausente — use PEI e PAEE como fontes principais');
      if (!peiDoc) warnings.push('PEI ausente — metas educacionais podem ficar incompletas no PDI');
      if (!paeeDoc) warnings.push('PAEE ausente — perspectiva de acessibilidade pode ficar incompleta no PDI');
      break;

    case 'documento_unificado_pei_paee':
      primarySources       = [ec, paee, pei];
      secondarySources     = [ficha, laudos, fichas, cuid, reg, evol];
      complementarySources = [perfil];
      if (!ecDoc) criticalGaps.push('Estudo de Caso ausente — o Documento Unificado deve sinalizar a lacuna e sintetizar apenas as fontes disponíveis');
      if (!paeeDoc) criticalGaps.push('PAEE ausente — o bloco de apoios e acessibilidade deve reconhecer a ausência e não inventar barreiras ou recursos');
      if (!peiDoc) criticalGaps.push('PEI ausente — o bloco curricular deve reconhecer a ausência e não inventar objetivos, BNCC ou adaptações');
      break;

    case 'plano_acao_regente':
      primarySources       = [ec, pei, paee];
      secondarySources     = [ficha, laudos, fichas, cuid, reg];
      complementarySources = [perfil];
      if (!peiDoc) criticalGaps.push('PEI ausente — o Plano Regente deve se basear no PEI; foque no Estudo de Caso e nos dados do aluno');
      if (!paeeDoc) warnings.push('PAEE ausente — apoios de acessibilidade e barreiras podem ficar incompletos; não invente recursos ou estratégias de acessibilidade');
      if (!ecDoc && !peiDoc && !paeeDoc) criticalGaps.push('Estudo de Caso, PEI e PAEE ausentes — use apenas dados registrados, laudos, fichas e observações disponíveis');
      break;

    case 'plano_acao_aee':
      primarySources       = [paee, ec];
      secondarySources     = [ficha, laudos, fichas, cuid];
      complementarySources = [perfil, evol];
      if (!paeeDoc) criticalGaps.push('PAEE AUSENTE — o Plano AEE deve ser fundamentado obrigatoriamente no PAEE. Sinalize esta lacuna crítica no documento gerado e fundamente nas demais fontes disponíveis');
      if (!ecDoc) warnings.push('Estudo de Caso ausente — use ficha do aluno, laudos e fichas como fontes principais');
      break;

    case 'perfil_inteligente':
      primarySources       = [ficha, ec];
      secondarySources     = [pei, paee, pdi, laudos, fichas, cuid];
      complementarySources = [evol, entry('Planos de Ação Regente', hasRegentePlans), aee];
      break;

    case 'estudo_de_caso':
      primarySources       = [ficha, laudos];
      secondarySources     = [fichas, cuid, reg];
      complementarySources = [evol, perfil];
      break;

    default:
      primarySources       = [ec, ficha];
      secondarySources     = [laudos, fichas];
      complementarySources = [perfil, evol];
  }

  return {
    targetDocType,
    targetLabel: CATEGORY_LABELS[targetDocType] ?? targetDocType,
    primarySources,
    secondarySources,
    complementarySources,
    criticalGaps,
    warnings,
  };
}

/**
 * Gera o bloco de cadeia documental prioritária para injeção no prompt da IA.
 * Indica quais fontes usar, quais estão disponíveis e quais estão ausentes.
 */
export function buildDocumentChainBlock(
  ctx: CanonicalStudentContext,
  targetDocType: DocumentCategory,
): string {
  const chain = selectDocumentChainForTarget(ctx, targetDocType);
  const lines: string[] = [];

  lines.push('\n=== CADEIA DOCUMENTAL PRIORITÁRIA ===');
  lines.push(`Documento a gerar: ${chain.targetLabel}`);

  const fmt = (e: DocumentChainEntry): string => {
    if (e.count !== undefined) return e.found ? `${e.count} encontrado(s)` : 'ausente (0)';
    return e.found ? 'encontrado ✓' : 'AUSENTE ⚠';
  };

  lines.push('\nFontes primárias:');
  chain.primarySources.forEach((s, i) => lines.push(`${i + 1}. ${s.label}: ${fmt(s)}`));

  lines.push('\nFontes secundárias:');
  chain.secondarySources.forEach((s, i) => lines.push(`${i + 1}. ${s.label}: ${fmt(s)}`));

  lines.push('\nFontes complementares:');
  chain.complementarySources.forEach((s, i) => lines.push(`${i + 1}. ${s.label}: ${fmt(s)}`));

  if (chain.criticalGaps.length > 0) {
    lines.push('\nLacunas críticas:');
    chain.criticalGaps.forEach(g => lines.push(`⚠ ${g}`));
  }
  if (chain.warnings.length > 0) {
    lines.push('\nAvisos:');
    chain.warnings.forEach(w => lines.push(`• ${w}`));
  }

  const instruction = DOC_PRIORITY_INSTRUCTIONS[targetDocType];
  if (instruction) {
    lines.push(`\nInstrução: ${instruction}`);
  }

  lines.push('\nRegra: use primeiro as fontes primárias; use fontes secundárias para complementar; não contradiga dados dos documentos-base; se houver lacuna, sinalize sem inventar.');
  lines.push('=== FIM DA CADEIA DOCUMENTAL ===\n');

  return lines.join('\n');
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

  // 4. Fichas de observação (apenas fichas não-checklist)
  const allForms = [...pack.priority.forms, ...pack.complementary.forms]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .filter(f => f.formType !== 'checklist_regente' && f.formType !== 'checklist_cuidadora');
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

  // 4b. Evidências pedagógicas e de rotina (checklists estruturados + pareceres)
  const { checklistEvidences } = pack;
  if (checklistEvidences.length > 0) {
    const regenteEvs   = checklistEvidences.filter(e => e.origin === 'regente');
    const cuidadoraEvs = checklistEvidences.filter(e => e.origin === 'cuidadora');

    // ── Bloco 1: Observação em Sala — Professor Regente ─────────────────────
    if (regenteEvs.length > 0) {
      lines.push('\n=== OBSERVAÇÃO EM SALA — PROFESSOR REGENTE ===');
      lines.push('Fonte: evidência pedagógica de sala de aula registrada pelo professor regente.');
      lines.push('Use para: planejamento pedagógico, adaptações curriculares, estratégias de sala, Plano Regente.');
      lines.push('Não use para: diagnóstico clínico, laudo médico ou conclusões sobre saúde do aluno.\n');

      for (const ev of regenteEvs) {
        const d = ev.date ? new Date(ev.date).toLocaleDateString('pt-BR') : '—';
        const originLabel =
          ev.originDetail === 'uploaded_ai_read' ? 'upload + leitura IA'
          : ev.originDetail === 'scan_sheet'     ? 'scan ENEM-like'
          : 'preenchimento digital';
        lines.push(`  Data: ${d} — Professor(a): ${ev.professional || 'Professor Regente'} — Origem: ${originLabel}`);

        // Alerta de baixa confiança em leituras automáticas
        if ((ev.originDetail === 'uploaded_ai_read' || ev.originDetail === 'scan_sheet') && ev.confidence !== null) {
          const pct = Math.round(ev.confidence * 100);
          if (pct < 80) {
            lines.push(`  ⚠ ATENÇÃO — leitura automática com ${pct}% de confiança. Dados podem conter erros; recomende revisão antes de usar.`);
          } else {
            lines.push(`  Confiança da leitura automática: ${pct}%`);
          }
        }

        if (ev.summary.length > 0)
          lines.push(`  Observações principais: ${ev.summary.join(' | ')}`);
        if (ev.barriers.length > 0)
          lines.push(`  Barreiras identificadas: ${ev.barriers.join(' | ')}`);
        if (ev.strategiesWorked.length > 0)
          lines.push(`  Estratégias que funcionaram: ${ev.strategiesWorked.join(' | ')}`);
        if (ev.recommendations.length > 0)
          lines.push(`  Recomendações: ${ev.recommendations.join(' | ')}`);
        if (ev.alerts.length > 0)
          lines.push(`  ⚠ Alertas: ${ev.alerts.join(' | ')}`);
        if (ev.parecer)
          lines.push(`  Parecer pedagógico gerado: ${ev.parecer.slice(0, 600)}`);
      }
    }

    // ── Bloco 2: Rotina da Semana — Cuidadora ────────────────────────────────
    if (cuidadoraEvs.length > 0) {
      lines.push('\n=== ROTINA DA SEMANA — CUIDADORA / APOIO ESCOLAR ===');
      lines.push('Fonte: registro de rotina escolar preenchido pela cuidadora ou apoio.');
      lines.push('Use para: planejamento de rotina, cuidado, transições, Plano AEE (seções de rotina e suporte).');
      lines.push('NÃO transforme registro de rotina em laudo clínico. NÃO use para afirmar diagnóstico.\n');

      for (const ev of cuidadoraEvs) {
        const d = ev.date ? new Date(ev.date).toLocaleDateString('pt-BR') : '—';
        const semana = (ev as any).semanaReferencia ?? '';
        const originLabel =
          ev.originDetail === 'uploaded_ai_read' ? 'upload + leitura IA'
          : ev.originDetail === 'scan_sheet'     ? 'scan ENEM-like'
          : 'preenchimento digital';
        lines.push(`  Data: ${d}${semana ? ` (Semana: ${semana})` : ''} — Cuidadora/Apoio: ${ev.professional || 'Cuidadora'} — Origem: ${originLabel}`);

        // Alerta de baixa confiança
        if ((ev.originDetail === 'uploaded_ai_read' || ev.originDetail === 'scan_sheet') && ev.confidence !== null) {
          const pct = Math.round(ev.confidence * 100);
          if (pct < 80) {
            lines.push(`  ⚠ ATENÇÃO — leitura automática com ${pct}% de confiança. Dados podem conter erros; recomende revisão antes de usar.`);
          } else {
            lines.push(`  Confiança da leitura automática: ${pct}%`);
          }
        }

        if (ev.summary.length > 0)
          lines.push(`  Rotina observada: ${ev.summary.join(' | ')}`);
        if (ev.barriers.length > 0)
          lines.push(`  Dificuldades de rotina: ${ev.barriers.join(' | ')}`);
        if (ev.strategiesWorked.length > 0)
          lines.push(`  Estratégias eficazes: ${ev.strategiesWorked.join(' | ')}`);
        if (ev.alerts.length > 0)
          lines.push(`  ⚠ Alertas da semana: ${ev.alerts.join(' | ')}`);
        if (ev.parecer)
          lines.push(`  Parecer de rotina gerado: ${ev.parecer.slice(0, 600)}`);
      }
    }

    // Padrões recorrentes entre múltiplos registros
    const allStrategies = checklistEvidences.flatMap(e => e.strategiesWorked);
    const allBarriers   = checklistEvidences.flatMap(e => e.barriers);
    const freqStrategies = [...new Set(allStrategies)].filter(s =>
      allStrategies.filter(x => x === s).length >= 2,
    );
    const freqBarriers = [...new Set(allBarriers)].filter(b =>
      allBarriers.filter(x => x === b).length >= 2,
    );
    if (freqStrategies.length > 0)
      lines.push(`\nEstratégias recorrentemente eficazes (múltiplos registros): ${freqStrategies.join(' | ')}`);
    if (freqBarriers.length > 0)
      lines.push(`⚠ Barreiras recorrentes (múltiplos registros): ${freqBarriers.join(' | ')}`);

    // ── Regras obrigatórias para uso da IA ───────────────────────────────────
    lines.push('\n--- REGRAS PARA USO DAS EVIDÊNCIAS DE CHECKLIST ---');
    lines.push('1. Observação do professor regente = evidência pedagógica de sala. Use para sugerir estratégias de ensino.');
    lines.push('2. Registro da cuidadora = evidência de cuidado, rotina, alimentação, higiene, comunicação e regulação. NÃO é laudo clínico.');
    lines.push('3. NÃO transforme rotina da cuidadora em laudo clínico ou diagnóstico presumido.');
    lines.push('4. NÃO use observação isolada para afirmar diagnóstico — use para sugerir próximos passos pedagógicos.');
    lines.push('5. Se leitura automática tiver confiança < 80%, sinalize que os dados precisam de revisão profissional.');
    lines.push('6. Cite a fonte ao usar: "conforme observações em sala (prof. regente)" ou "segundo registro de rotina (cuidadora)".');
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

  // 8. Documentos pedagógicos salvos
  const docSummaryBlock = buildDocumentSummaryBlock(pack.savedDocuments, pack.docType);
  if (docSummaryBlock) lines.push(docSummaryBlock);

  // 9. Laudos e relatórios subidos (metadados de student_documents)
  const uploadedBlock = buildUploadedReportsBlock(pack.attachedDocuments ?? []);
  if (uploadedBlock) lines.push(uploadedBlock);

  // 10. Planos de ação salvos (regente + AEE)
  const actionPlansBlock = buildSavedActionPlansBlock(
    pack.savedActionPlans,
    pack.savedAEEActionPlans,
    pack.docType,
  );
  if (actionPlansBlock) lines.push(actionPlansBlock);

  // 11. Perfil Inteligente salvo
  const profileBlock = buildIntelligentProfileBlock(pack.savedIntelligentProfile);
  if (profileBlock) lines.push(profileBlock);

  // 12. Estratégias que funcionaram / exigem cautela (Sprint IA-6)
  const strategiesBlock = buildStrategiesBlock(pack);
  if (strategiesBlock) lines.push(strategiesBlock);

  // 13. Histórico de atividades geradas (Sprint IA-6)
  const activitiesHistoryBlock = buildActivitiesHistoryBlock(pack.generatedActivities, pack.docType);
  if (activitiesHistoryBlock) lines.push(activitiesHistoryBlock);

  // 14. Alerta PAEE ausente (Plano AEE)
  if (pack.docType === 'plano_acao_aee' && !pack.savedDocuments.some(d => d.category === 'paee')) {
    lines.push('\n⚠ AVISO PLANO AEE: PAEE não encontrado para este aluno. O PAEE é a fonte primária do Plano AEE. Sinalize a ausência no documento gerado e fundamente nas demais fontes disponíveis.');
  }

  lines.push(`\nScore de completude: ${enriched.scoreCompletude}%`);
  lines.push('\n===== FIM DO CONTEXTO CANÔNICO =====');
  lines.push(
    '\nINSTRUÇÃO CRÍTICA: Use apenas os dados acima que tenham evidência disponível.' +
    ' Cite datas, frequências e padrões temporais somente quando estiverem registrados.' +
    ' Use o perfil pedagógico inicial para calibrar complexidade.' +
    ' Use laudos apenas como fonte registrada e diferencie-os de observações pedagógicas. Use a linha do tempo para embasar progresso somente quando houver registros temporais comparáveis.' +
    ' Não invente dados. Se não houver evidência nos dados disponíveis, use ausência neutra. Não deduza informação a partir de diagnóstico/CID. Não transforme ausência de dado em hipótese.' +
    '\n\nGUARDRAILS ÉTICOS OBRIGATÓRIOS:' +
    ' (1) Não invente laudos, diagnósticos, CID ou histórico não fornecido.' +
    ' (2) Não afirme ter lido arquivo cujo conteúdo não foi disponibilizado.' +
    ' (3) Não transforme observação pedagógica em diagnóstico clínico.' +
    ' (4) Não prescreva conduta médica ou terapêutica.' +
    ' (5) Diferencie sempre: laudo clínico (profissional de saúde) ≠ observação pedagógica (professor/AEE) ≠ registro de rotina (cuidadora) ≠ documento pedagógico oficial.' +
    ' (6) Sinalize lacunas quando informação essencial estiver ausente.' +
    ' (7) Não crie CID inexistente. Use apenas diagnósticos presentes nos dados.' +
    ' (8) Diagnóstico e CID são contexto cadastral, não prova funcional; não os use isoladamente para deduzir comportamento, autonomia, comunicação, suporte, frequência, evolução, estratégia ou dificuldade pedagógica.',
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

  // ── D9: Termos proibidos e linguagem indevida ────────────────────────────────
  {
    let s = 100; const iss: string[] = [];
    const FORBIDDEN = [
      'cid provável', 'diagnóstico provável', 'diagnóstico compatível com',
      'certamente apresenta', 'provavelmente possui',
      'tratamento medicamentoso', 'prescrição de', 'terapia obrigatória',
      'laudo confirma', 'diagnóstico confirma',
    ];
    const found = FORBIDDEN.filter(t => text.includes(t));
    if (found.length > 0) {
      iss.push(`Termos proibidos detectados: "${found.join('", "')}"`);
      s -= Math.min(80, 30 * found.length);
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[validateAIOutput] Termos proibidos encontrados:', found);
      }
    }
    // Detecta possível afirmação de leitura de arquivo sem conteúdo extraído
    if ((text.includes('ao analisar o arquivo') || text.includes('li o documento') ||
         text.includes('o arquivo indica') || text.includes('o documento enviado indica')) &&
        !text.includes('não foi extraído') && !text.includes('não acessível') &&
        !text.includes('não disponível')) {
      iss.push('Possível afirmação de leitura de arquivo — verificar se conteúdo foi extraído');
      s -= 15;
    }
    dimensions.push(makeDim('guardrails', s, iss));
  }

  // Score global: média ponderada das dimensões
  const weights: Record<string, number> = {
    identidade: 2, linguagem: 2, frequencia: 1.5, laudos: 1.5,
    cognitivo: 1.5, priorKnowledge: 1, temporal: 1, docEspecifico: 2, guardrails: 2,
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
  return `O documento gerado apresentou problemas de qualidade. Regenere corrigindo os problemas indicados sem criar conteúdo artificial.

GUARDRAILS OBRIGATÓRIOS NO REPARO:
- NUNCA gere: "CID provável", "diagnóstico provável", "certamente apresenta", "provavelmente possui", "tratamento medicamentoso", "prescrição de", "terapia obrigatória".
- Dado ausente → use ausência neutra ou deixe vazio conforme o schema — nunca inventar dados clínicos, pedagógicos ou familiares.
- Diagnóstico e CID são contexto cadastral, não prova funcional. Não deduza comportamento, autonomia, comunicação, suporte, frequência, evolução, estratégia ou dificuldade pedagógica a partir deles.
- Evolução, avanço, regressão ou manutenção só podem ser mencionados quando houver registros temporais comparáveis.
- Não transforme observação pedagógica em diagnóstico clínico.
- Não afirme ter lido arquivo cujo conteúdo não foi extraído.
- Preserve o schema, os nomes de campos e o formato JSON esperado. O reparo deve corrigir formato, JSON e aderência às evidências, não preencher lacunas por suposição.

DIMENSÕES COM FALHA: ${failedDims.join(', ')}

PROBLEMAS IDENTIFICADOS:
${validation.issues.map(i => `- ${i}`).join('\n')}

CONTEÚDO ANTERIOR (não reutilize partes genéricas):
${failedOutput.slice(0, 800)}...

INSTRUÇÕES DE REPARO OBRIGATÓRIAS:
1. Use o nome real do aluno: "${ctx.student.name}"
2. Substitua linguagem genérica por conteúdo específico somente quando houver evidência.
3. Frequência, faltas e atendimento só devem aparecer se houver registros disponíveis no contexto.
4. Laudos só devem ser usados quando houver síntese ou dados registrados; não invente seção clínica.
5. Perfil cognitivo e conhecimento prévio só devem calibrar estratégias quando houver dados registrados.
6. PEI, PAEE, PDI, Estudo de Caso e relatórios anteriores devem ser usados apenas como fontes registradas; não copie conteúdo integral.
7. Não crie mínimos artificiais de itens, perguntas, disciplinas, recursos, jogos, vídeos, materiais, frequência ou análise temporal.
8. Se faltar evidência para um campo, use ausência neutra ou lista vazia quando o schema permitir.

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
        timeline: [], appointments: [], checklistEvidences: [],
        enriched: computeEnrichment([], [], [], [], [], student),
        savedDocuments: [], savedActionPlans: [], savedAEEActionPlans: [],
        savedIntelligentProfile: null, generatedActivities: [],
        loadedAt: new Date().toISOString(),
      };
    }

    const [
      profilesRes, obsFormsRes, medReportsRes, docsRes, timelineRes, apptRes,
      savedDocsRes, actionPlansRes, aeeActionPlansRes, intelligentProfileRes, activitiesRes,
    ] = await Promise.allSettled([
      supabase.from('student_profiles').select('*')
        .eq('student_id', sid).order('evaluated_at', { ascending: false }).limit(5),
      supabase.from('observation_forms').select('*')
        .eq('student_id', sid).eq('status', 'finalizado')
        .order('created_at', { ascending: false }).limit(10),
      supabase.from('medical_reports')
        .select('id, report_type, synthesis, pedagogical_points, suggestions, raw_content, document_id')
        .eq('student_id', sid).order('created_at', { ascending: false }).limit(5),
      supabase.from('student_documents').select('name, document_type, created_at, notes')
        .eq('student_id', sid).order('created_at', { ascending: false }).limit(20),
      supabase.from('student_timeline').select('*')
        .eq('student_id', sid).order('event_date', { ascending: false }).limit(50),
      supabase.from('tenant_appointments').select('*')
        .eq('student_id', sid).order('date', { ascending: false }).limit(100),
      // Sprint IA-1 — documentos pedagógicos gerados (PEI, PAEE, PDI, Estudo de Caso etc.)
      supabase.from('documents')
        .select('id, doc_type, title, status, structured_data, audit_code, created_at, updated_at')
        .eq('student_id', sid)
        .is('deleted_at', null)
        .in('status', ['APPROVED', 'DRAFT', 'approved', 'draft'])
        .order('created_at', { ascending: false })
        .limit(20),
      // Planos de Ação do Professor Regente
      supabase.from('student_action_plans')
        .select('id, plan_type, title, summary, content_json, register_code, version_number, created_at')
        .eq('student_id', sid)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(3),
      // Planos de Ação AEE
      supabase.from('student_aee_action_plans')
        .select('id, plan_type, title, content_json, register_code, version_number, created_at')
        .eq('student_id', sid)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(3),
      // Perfil Inteligente
      supabase.from('student_intelligent_profiles')
        .select('id, version_number, profile_json, created_at')
        .eq('student_id', sid)
        .order('version_number', { ascending: false })
        .limit(3),
      // Atividades geradas — Sprint IA-6: campos expandidos para histórico e estratégias
      supabase.from('generated_activities')
        .select('id, title, discipline, grade, created_at, content, content_json, bncc_codes, difficulty_level, is_adapted, mode')
        .eq('student_id', sid)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const safe = <T>(res: PromiseSettledResult<{ data: T[] | null; error: any }>, norm: (raw: T[]) => any): any[] => {
      if (res.status === 'fulfilled' && !res.value.error) return norm(res.value.data ?? []);
      return [];
    };

    const cognitiveProfiles       = safe(profilesRes         as any, normalizeCognitiveProfiles);
    const observationForms        = safe(obsFormsRes          as any, normalizeObservationForms);
    const medicalReports          = safe(medReportsRes        as any, normalizeMedicalReports);
    const attachedDocuments       = safe(docsRes              as any, normalizeAttachedDocuments);
    const timeline                = safe(timelineRes          as any, normalizeTimeline);
    const appointments            = safe(apptRes              as any, normalizeAppointments);
    const savedDocuments          = safe(savedDocsRes         as any, normalizeSavedDocuments);
    const savedActionPlans        = safe(actionPlansRes       as any, (r: any[]) => normalizeActionPlans(r, 'regente'));
    const savedAEEActionPlans     = safe(aeeActionPlansRes    as any, (r: any[]) => normalizeActionPlans(r, 'aee'));
    const savedIntelligentProfile = (() => {
      if (intelligentProfileRes.status === 'fulfilled' && !intelligentProfileRes.value.error) {
        return normalizeIntelligentProfile(intelligentProfileRes.value.data ?? []);
      }
      return null;
    })();
    const generatedActivities     = safe(activitiesRes        as any, normalizeGeneratedActivities);
    const priorKnowledge          = student.priorKnowledge ?? null;
    const checklistEvidences      = extractChecklistEvidences(observationForms);
    const enriched                = computeEnrichment(appointments, timeline, cognitiveProfiles, medicalReports, observationForms, student);

    return {
      student, cognitiveProfiles, observationForms, medicalReports,
      attachedDocuments, priorKnowledge, timeline, appointments,
      checklistEvidences, enriched,
      savedDocuments, savedActionPlans, savedAEEActionPlans,
      savedIntelligentProfile, generatedActivities,
      loadedAt: new Date().toISOString(),
    };
  },

  hasData(ctx: CanonicalStudentContext): boolean {
    return (
      ctx.cognitiveProfiles.length      > 0 ||
      ctx.observationForms.length       > 0 ||
      ctx.medicalReports.length         > 0 ||
      ctx.timeline.length               > 0 ||
      ctx.appointments.length           > 0 ||
      ctx.checklistEvidences.length     > 0 ||
      ctx.savedDocuments.length         > 0 ||
      ctx.savedActionPlans.length       > 0 ||
      ctx.savedAEEActionPlans.length    > 0 ||
      ctx.savedIntelligentProfile !== null ||
      ctx.generatedActivities.length    > 0 ||
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
  const t = String(type).toUpperCase().replace(/\s+/g, '_').normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (t.includes('DOCUMENTO_UNIFICADO_PEI_PAEE') || (t.includes('UNIFICADO') && t.includes('PEI') && t.includes('PAEE'))) return 'documento_unificado_pei_paee';
  if (t.includes('ESTUDO'))                                   return 'estudo_de_caso';
  if (t.includes('PEI'))                                      return 'pei';
  if (t.includes('PAEE'))                                     return 'paee';
  if ((t.includes('PLANO') || t.includes('PLANO_ACAO')) && t.includes('REGENTE')) return 'plano_acao_regente';
  if (t.includes('PLANO_ACAO') || t.includes('PLANO_DE_ACAO')) return 'plano_acao_aee';
  if (t.includes('PDI'))                                      return 'pdi';
  if (t.includes('PERFIL') && t.includes('INTEL'))            return 'perfil_inteligente';
  if (t.includes('FICHA') && t.includes('COGN'))             return 'ficha_cognitiva';
  if (t.includes('FICHA'))                                    return 'ficha_aluno';
  if (t.includes('RELAT'))                                    return 'relatorio';
  if (t.includes('ATIVID'))                                   return 'atividade_adaptada';
  return 'estudo_de_caso';
}
