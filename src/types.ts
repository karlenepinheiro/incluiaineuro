// =====================
// PLANS / BILLING TYPES
// =====================

export enum PlanTier {
  FREE = 'Starter (Grátis)',
  PRO = 'Profissional',
  PREMIUM = 'Master (Clínicas/Escolas)',
  INSTITUTIONAL = 'Institucional'
}

// NOTE: In the database we store plan codes (e.g. 'FREE' | 'PRO' | 'MASTER'),
// while the UI historically used the human labels above. To avoid runtime crashes
// (e.g. PLAN_LIMITS[user.plan] === undefined), we normalize any incoming value.
export type PlanTierCode = 'FREE' | 'PRO' | 'MASTER' | 'PREMIUM' | 'INSTITUTIONAL';

export const PLAN_TIER_ALIASES: Record<string, PlanTier> = {
  // codes (DB)
  FREE: PlanTier.FREE,
  PRO: PlanTier.PRO,
  MASTER: PlanTier.PREMIUM,
  PREMIUM: PlanTier.PREMIUM,
  INSTITUTIONAL: PlanTier.INSTITUTIONAL,
  // legacy / already-normalized labels (UI)
  [PlanTier.FREE]: PlanTier.FREE,
  [PlanTier.PRO]: PlanTier.PRO,
  [PlanTier.PREMIUM]: PlanTier.PREMIUM,
  [PlanTier.INSTITUTIONAL]: PlanTier.INSTITUTIONAL,
};

export function resolvePlanTier(plan: unknown): PlanTier {
  // Local/dev override to quickly test features without touching DB.
  // Set in .env: VITE_FORCE_PLAN=MASTER (or PRO/FREE/PREMIUM/INSTITUTIONAL)
  const forced = String((import.meta as any).env?.VITE_FORCE_PLAN ?? '').trim();
  if (forced) return PLAN_TIER_ALIASES[forced] ?? PlanTier.FREE;

  const key = String(plan ?? '').trim();
  return PLAN_TIER_ALIASES[key] ?? PlanTier.FREE;
}

export type SubscriptionStatus = 'ACTIVE' | 'PENDING' | 'OVERDUE' | 'CANCELED';

// ADMIN ROLES (RBAC)
export type AdminRole = 'super_admin' | 'financeiro' | 'operacional' | 'viewer';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  active: boolean;
  avatarUrl?: string;
  phone?: string;
  createdAt: string;
}

export interface AdminLog {
  id: string;
  adminName: string;
  action: string;
  target: string;
  details: string;
  timestamp: string;
}

export interface SiteConfig {
  headline: string;
  subheadline: string;
  pricing: {
    pro_monthly: number;
    pro_annual: number;
    master_monthly: number;
    master_annual: number;
    extra_student: number;
    extra_credits_10: number;
  };
  contactPhone: string;
  heroImage: string;
}

// =====================
// TENANT / DOCS TYPES
// =====================

export enum TenantType {
  PROFESSIONAL = 'PROFESSIONAL',
  CLINIC = 'CLINIC',
  SCHOOL = 'SCHOOL'
}

// 2. REMOVIDO: Encaminhamento e Relatório Escola
export enum DocumentType {
  ESTUDO_CASO = 'Estudo de Caso',
  PEI = 'PEI',
  PAEE = 'PAEE',
  PDI = 'PDI',
  FICHA = 'Ficha de Acompanhamento',
  ATIVIDADE = 'Atividade Adaptada',
  // External Docs
  ESTUDO_CASO_EXTERNO = 'Estudo de Caso (Externo)',
  PEI_EXTERNO = 'PEI (Externo)',
  PAEE_EXTERNO = 'PAEE (Externo)'
}

export const TENANT_PERMISSIONS = {
  [TenantType.SCHOOL]: {
    modules: ['dashboard', 'students', 'protocols', 'activities', 'reports', 'attendance']
  },
  [TenantType.CLINIC]: {
    modules: ['dashboard', 'students', 'service_control', 'reports', 'attendance']
  },
  [TenantType.PROFESSIONAL]: {
    modules: ['dashboard', 'students', 'protocols', 'activities', 'reports']
  }
};

export enum UserRole {
  TEACHER = 'Docente',
  AEE = 'Professor AEE',
  CLINICIAN = 'Clínico',
  MANAGER = 'Gestor',
  COORDINATOR = 'Coordenador',
  TECHNICAL_RESP = 'Responsável Técnico',
  CEO = 'CEO'
}

export type ProtocolType = DocumentType;

// =====================
// PLAN LIMITS (UI GATES)
// =====================
// IMPORTANT:
// - AQUI NÃO PODE TER 20/40/400.
// - Estes valores precisam bater com o que você definiu:
//   FREE: 5 alunos / 0 IA
//   PRO: 30 alunos / 50 créditos/mês
//   MASTER: 999 alunos / 70 créditos/mês
export const PLAN_LIMITS = {
  [PlanTier.FREE]: {
    students: 5,
    ai_credits: 0,

    export_word: false,
    audit_print: false,     // free sem código auditável (upsell)
    watermark: true,        // marca d'água no free
    charts: false,          // sem relatório evolutivo avançado
    uploads: false,         // sem upload laudos
    attendance_control: false, // sem controle atendimento
    support: 'Email',

    // Allowed Docs (FREE pode usar Estudo de Caso + PAEE + PEI + PDI)
    allowed_docs: [DocumentType.ESTUDO_CASO, DocumentType.PAEE, DocumentType.PEI, DocumentType.PDI],
  },

  [PlanTier.PRO]: {
    students: 30,
    ai_credits: 50,

    export_word: false,     // PRO sem Word (se quiser liberar depois, muda aqui)
    audit_print: true,      // PRO com código auditável
    watermark: false,
    charts: true,           // PRO tem relatório evolutivo
    uploads: true,          // PRO pode upload laudos
    attendance_control: false, // PRO NÃO tem controle de atendimentos (MASTER only)
    support: 'Prioritário',

    // PRO: docs completos (sem "Atividade Adaptada" inteligente)
    allowed_docs: [DocumentType.ESTUDO_CASO, DocumentType.PAEE, DocumentType.PEI, DocumentType.PDI],
  },

  [PlanTier.PREMIUM]: {
    // PREMIUM = MASTER
    students: 999,
    ai_credits: 70,

    export_word: true,
    audit_print: true,
    watermark: false,
    charts: true,
    uploads: true,
    attendance_control: true, // MASTER tem controle atendimentos
    support: 'VIP WhatsApp',

    // MASTER: acesso total
    allowed_docs: ['ALL'],
  },

  [PlanTier.INSTITUTIONAL]: {
    students: 9999,
    ai_credits: 9999,

    export_word: true,
    audit_print: true,
    watermark: false,
    charts: true,
    uploads: true,
    attendance_control: true,
    support: 'Dedicado',

    allowed_docs: ['ALL'],
  }
} as const;

export function getPlanLimits(plan: unknown) {
  return PLAN_LIMITS[resolvePlanTier(plan)];
}

// =====================
// ENTITIES
// =====================

export interface Tenant {
  id: string;
  name: string;
  type: TenantType;
  cnpj?: string;
  student_limit_base: number;
  student_limit_extra: number;
  user_limit: number;
  ai_credit_limit: number;
  creditos_ia_restantes: number;
  status_assinatura: SubscriptionStatus;
  created_at: string;
}

export interface User {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: UserRole;
  plan: PlanTier;
  tenantType: TenantType;
  isAdmin?: boolean;
  active: boolean;
  profilePhoto?: string;

  schoolConfigs: SchoolConfig[];
  subscriptionStatus: SubscriptionStatus;
  lgpdConsent?: LGPDConsent;
  aiUsage?: AIUsageLog[];
}

export interface AIUsageLog {
  id: string;
  tenant_id: string;
  user_id: string;
  document_type: string;
  credits_consumed: number;
  created_at: string;
}

export interface LGPDConsent {
  accepted: boolean;
  acceptedAt: string;
  ipAddress: string;
  termVersion: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: 'AEE' | 'Coordenador' | 'Pedagogo' | 'Gestor' | 'Professor Regente' | 'Outros';
}

export interface SchoolConfig {
  id: string;
  // ── Identidade básica ──────────────────────────────────────────────────────
  schoolName: string;
  logoUrl?: string;              // base64 data URL ou URL remota
  // ── Localização ────────────────────────────────────────────────────────────
  address?: string;              // logradouro + número
  neighborhood?: string;         // bairro
  city?: string;
  state?: string;
  zipcode?: string;              // CEP
  // ── Identificadores oficiais ────────────────────────────────────────────────
  cnpj?: string;
  inepCode?: string;             // código INEP da escola
  // ── Contato ────────────────────────────────────────────────────────────────
  email?: string;                // e-mail institucional
  instagram?: string;
  contact: string;               // telefone principal (mantido para compatibilidade)
  // ── Responsáveis ────────────────────────────────────────────────────────────
  principalName?: string;        // diretor(a)
  managerName: string;           // gestor(a)
  coordinatorName?: string;
  aeeRepresentative: string;
  aeeRepName?: string;
  // ── Equipe ──────────────────────────────────────────────────────────────────
  team?: TeamMember[];
}

export interface FichaComplementar {
  id: string;
  tipo: 'obs_regente' | 'escuta_familia' | 'analise_aee' | 'decisao_institucional' | 'acompanhamento_evolucao';
  titulo: string;
  studentId: string;
  createdAt: string;
  createdBy: string;
  auditCode: string;
  contentHash: string;
  fields: Record<string, string | number>;
  status: 'rascunho' | 'finalizado';
}

export interface StudentEvolution {
  id: string;
  date: string;
  createdAt?: string;
  createdBy?: string;
  scores: number[];
  observation: string;
  author: string;
  customFields?: DocField[];
}

export interface DocumentAnalysis {
  id: string;
  documentName: string;
  date: string;
  synthesis: string;
  pedagogicalPoints: string[];
  suggestions: string[];
  auditCode: string;
}

export interface CollaboratorInvite {
  id: string;
  studentId: string;
  documentType: DocumentType;
  documentId?: string;
  name: string;
  email?: string;
  role: string;
  permissions: string[];
  status: 'PENDING' | 'ACCEPTED' | 'COMPLETED';
  link: string;
  accessCode: string;
  createdAt: string;
  completedAt?: string;
}

// ─── TIPO DE ALUNO ────────────────────────────────────────────────────────────
export type StudentType = 'com_laudo' | 'em_triagem';

export interface Appointment {
  id: string;
  studentId?: string;
  studentName?: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  type: 'AEE' | 'Avaliacao' | 'Reuniao' | 'Atendimento' | 'Outro';
  professional: string;
  location?: string;
  notes?: string;
  status: 'agendado' | 'realizado' | 'cancelado' | 'reagendado';
  createdAt: string;
}

export interface TimelineEvent {
  id: string;
  studentId: string;
  date: string;
  type: 'protocolo' | 'evolucao' | 'laudo' | 'ficha' | 'atendimento' | 'matricula' | 'nota' | 'atividade';
  title: string;
  description?: string;
  linkedId?: string;
  icon?: string;
  author?: string;
}

export interface Student {
  id: string;
  tenant_id?: string;
  tipo_aluno?: StudentType;

  name: string;
  birthDate: string;
  gender: string;

  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;

  schoolId: string;
  grade: string;
  shift: string;
  regentTeacher: string;

  isExternalStudent?: boolean;
  externalSchoolName?: string;
  externalSchoolCity?: string;
  externalProfessional?: string;
  externalReferralSource?: string;

  aeeTeacher?: string;
  coordinator?: string;

  diagnosis: string[];
  cid: string | string[];
  supportLevel: string;
  medication: string;
  professionals: string[];

  schoolHistory: string;

  // ✅ deixe opcional para não travar salvamento quando o professor não preencher
  familyContext?: string;

  abilities: string[];
  difficulties: string[];
  strategies: string[];
  communication: string[];
  observations: string;

  history?: string;
  photoUrl?: string;
  registrationDate?: string;

  documents?: { name: string; date: string; type: 'Laudo' | 'Relatorio' | 'Outro'; url?: string; path?: string }[];
  documentAnalyses?: DocumentAnalysis[];
  collaborators?: CollaboratorInvite[];
  evolutions?: StudentEvolution[];
  fichasComplementares?: FichaComplementar[];
}

export interface ServiceRecord {
  id: string;
  studentId: string;
  studentName: string;
  date: string;
  type: 'AEE' | 'Psicologia' | 'Fonoaudiologia' | 'Terapia Ocupacional' | 'Psicopedagogia';
  professional: string;
  duration: number;
  observation: string;
  attendance: 'Presente' | 'Falta' | 'Reposição';
}

export interface DocField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'date' | 'checklist' | 'grid' | 'scale';
  value: any;
  options?: string[];
  placeholder?: string;
  columns?: string[];

  isCustom?: boolean;
  allowAudio?: 'none' | 'optional' | 'only';
  audioUrl?: string;
  audioDuration?: number;
  audioCreatedAt?: string;
  required?: boolean;
  description?: string;
  minScale?: number;
  maxScale?: number;
}

export interface DocSection {
  id: string;
  title: string;
  fields: DocField[];
}

export interface DocumentData {
  sections: DocSection[];
  externalUrl?: string;
}

export interface DocumentVersion {
  versionId: string;
  versionNumber: number;
  createdAt: string;
  editedBy: string;
  content: DocumentData;
  changeLog?: string;
}

export type ProtocolStatus = 'DRAFT' | 'FINAL';

export interface Protocol {
  id: string;
  tenant_id?: string;
  studentId: string;
  studentName: string;
  type: DocumentType;
  status: ProtocolStatus;
  source_id?: string | null;
  content: string;
  isStructured: boolean;
  structuredData: DocumentData;
  versions: DocumentVersion[];
  lastEditedAt: string;
  lastEditedBy: string;
  createdAt: string;
  generatedBy: string;
  auditCode: string;
  invites?: CollaboratorInvite[];
  signatures: {
    regent: string;
    coordinator: string;
    aee: string;
    aeeRep?: string;
    manager: string;
  };
}

// ============================================================================
// BILLING / ADD-ONS (Kiwify)
// ============================================================================

export type AddOnKind = 'AI_CREDITS' | 'STUDENT_SLOTS';

export interface AddOnProduct {
  kind: AddOnKind;
  sku: string;
  title: string;
  description: string;
  quantity: number;
  priceCents: number;
  recommended?: boolean;
}

export interface TenantSummary {
  tenantId: string;
  tenantName?: string;
  subscriptionStatus: SubscriptionStatus;
  planTier: PlanTier;
  aiCreditsRemaining: number;
  studentLimitBase: number;
  studentLimitExtra: number;
  studentsActive: number;
  renewalDatePlan?: string; // ISO
  renewalDateCredits?: string; // ISO
}

export interface PurchaseIntent {
  id: string;
  tenantId: string;
  userId: string;
  kind: AddOnKind;
  sku: string;
  quantity: number;
  priceCents: number;
  status: 'CREATED' | 'OPENED' | 'PAID' | 'CANCELED';
  createdAt: string;
}

export interface Activity {
  id: string;
  studentId?: string;
  title: string;
  content: string;
  imageUrl?: string;
  guidance?: string;
  attachments: string[];
  isAdapted: boolean;
  createdAt: string;
  tags: string[];
}

export interface Subscriber {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  phone?: string;
  plan: PlanTier;
  cycle: 'MENSAL' | 'ANUAL';
  status: SubscriptionStatus;
  creditsUsed: number;
  creditsLimit: number;
  studentsActive: number;
  studentsLimit: number;
  nextBilling: string;
}

export interface PaymentProvider {
  createCheckout(plan: PlanTier, userData: Partial<User>): Promise<string>;
  createAddOnCheckout?: (sku: string, userData: Partial<User>, meta?: Record<string, string>) => Promise<string>;
  handleWebhook(payload: any): Promise<void>;
  validateSubscription(userId: string): Promise<boolean>;
  cancelSubscription(userId: string): Promise<void>;
  generateCustomerPortal(userId: string): Promise<string>;
}