// =====================
// PLANS / BILLING TYPES
// =====================

export enum PlanTier {
  FREE = 'Starter (Grátis)',
  PRO = 'Profissional',
  PREMIUM = 'MASTER',
}

// NOTE: In the database we store plan codes (e.g. 'FREE' | 'PRO' | 'MASTER'),
// while the UI historically used the human labels above. To avoid runtime crashes
// (e.g. PLAN_LIMITS[user.plan] === undefined), we normalize any incoming value.
export type PlanTierCode = 'FREE' | 'PRO' | 'MASTER' | 'PREMIUM';

export const PLAN_TIER_ALIASES: Record<string, PlanTier> = {
  // DB codes (string literals)
  FREE:    PlanTier.FREE,
  PRO:     PlanTier.PRO,
  MASTER:  PlanTier.PREMIUM, // código real da tabela plans (plans.name = 'MASTER')
  PREMIUM: PlanTier.PREMIUM,  // alias alternativo
  // Enum values como chaves (computed) — cobre o valor atual de cada tier
  [PlanTier.FREE]:    PlanTier.FREE,    // 'Starter (Grátis)'
  [PlanTier.PRO]:     PlanTier.PRO,     // 'Profissional'
  [PlanTier.PREMIUM]: PlanTier.PREMIUM, // 'MASTER' (valor atual do enum)
  // Alias legado — valor antigo do enum PREMIUM antes da renomeação
  'Master (Clínicas/Escolas)': PlanTier.PREMIUM,
};

export function resolvePlanTier(plan: unknown): PlanTier {
  // Local/dev override to quickly test features without touching DB.
  // Set in .env: VITE_FORCE_PLAN=MASTER (or PRO/FREE/PREMIUM/INSTITUTIONAL)
  const forced = String((import.meta as any).env?.VITE_FORCE_PLAN ?? '').trim();
  if (forced) return PLAN_TIER_ALIASES[forced] ?? PlanTier.FREE;

  const key = String(plan ?? '').trim();
  return PLAN_TIER_ALIASES[key] ?? PlanTier.FREE;
}

// Valores canônicos alinhados com a constraint do banco (fix_billing_v5.sql BLOCO 2).
// NÃO usar: 'TRIALING' (→ TRIAL), 'PAST_DUE' (→ OVERDUE), 'CANCELLED' (→ CANCELED)
export type SubscriptionStatus =
  | 'ACTIVE'
  | 'PENDING'
  | 'OVERDUE'
  | 'CANCELED'
  | 'TRIAL'
  | 'COURTESY'
  | 'INTERNAL_TEST';

// ADMIN ROLES (RBAC)
export type AdminRole = 'super_admin' | 'financeiro' | 'operacional' | 'comercial' | 'suporte' | 'auditoria' | 'viewer';

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
// - Estes valores são lidos de SUBSCRIPTION_PLANS (src/config/aiCosts.ts — fonte única de verdade):
//   FREE:    5 alunos / 60 créditos/mês
//   PRO:     30 alunos / 500 créditos/mês
//   PREMIUM: 9999 alunos (ilimitado) / 700 créditos/mês
import { SUBSCRIPTION_PLANS } from './config/aiCosts';

export const PLAN_LIMITS = {
  [PlanTier.FREE]: {
    students: SUBSCRIPTION_PLANS.FREE.students,
    ai_credits: SUBSCRIPTION_PLANS.FREE.credits,

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
    students: SUBSCRIPTION_PLANS.PRO.students,
    ai_credits: SUBSCRIPTION_PLANS.PRO.credits,

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
    // PREMIUM = MASTER (ilimitado na prática)
    students: SUBSCRIPTION_PLANS.MASTER.students,
    ai_credits: SUBSCRIPTION_PLANS.MASTER.credits,

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
  recurrence?: 'none' | 'weekly' | 'biweekly' | 'monthly';
  recurrenceEndDate?: string;
  recurrenceGroupId?: string;
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

  /** Código único do aluno — gerado automaticamente. Futuro: busca entre escolas. */
  unique_code?: string;

  name: string;
  birthDate: string;
  gender: string;

  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;

  // ── Endereço ──────────────────────────────────────────────────────────────
  zipcode?: string;      // CEP
  street?: string;       // Logradouro
  streetNumber?: string; // Número
  complement?: string;   // Complemento
  neighborhood?: string; // Bairro
  city?: string;         // Cidade
  state?: string;        // Estado (UF)

  schoolId: string;
  schoolName?: string; // resolved from schoolId for DB persistence (school_name column)
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

  // ── Importação CSV (schema_v24_import_fields.sql) ──────────────────────────
  importSource?: 'manual' | 'csv' | 'ai_converter';
  importBatchId?: string;
  /** Status do cadastro: 'complete' | 'incomplete' | 'pre_registered' */
  registrationStatus?: 'complete' | 'incomplete' | 'pre_registered';
  /** Campos essenciais que ainda estão ausentes (ex: ["Responsável","Telefone"]) */
  missingRequiredFields?: string[];
  isPreRegistered?: boolean;

  documents?: { name: string; date: string; type: 'Laudo' | 'Relatorio' | 'Outro'; url?: string; path?: string }[];
  documentAnalyses?: DocumentAnalysis[];
  collaborators?: CollaboratorInvite[];
  evolutions?: StudentEvolution[];
  fichasComplementares?: FichaComplementar[];
}

export interface ServiceDailyChecklist {
  desempenho: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;  // Desempenho na atividade (1-8)
  interacao: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;    // Interação com pares/profissional (1-8)
  comportamento: 'adequado' | 'regular' | 'necessita_suporte'; // Comportamento geral
  progressoAtividade: string;             // Descrição do progresso na atividade
  estrategiasUsadas: string;              // Estratégias que funcionaram no dia
  proximosPassos: string;                 // Próximos passos / encaminhamentos
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
  dailyChecklist?: ServiceDailyChecklist; // Ficha avaliativa diária (opcional)
  createdAt?: string; // ISO 8601 — data/hora exata em que o registro foi criado
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
  /** Saldo real da carteira (credits_wallet.balance) */
  aiCreditsRemaining: number;
  /** Créditos mensais incluídos no plano vigente */
  planCreditsMonthly: number;
  /** Créditos avulsos adquiridos (sum de purchase_extra no ledger) */
  creditsPurchased: number;
  /** Créditos consumidos no ciclo atual (sum de usage_ai no ledger) */
  creditsConsumedCycle: number;
  studentLimitBase: number;
  studentLimitExtra: number;
  studentsActive: number;
  renewalDatePlan?: string; // ISO
  renewalDateCredits?: string; // ISO
  /** Ciclo de cobrança da assinatura ativa ('monthly' | 'annual') */
  billingCycle?: 'monthly' | 'annual';
  /**
   * Nome de exibição do plano com ciclo.
   * Exemplos: "PRO MENSAL", "PREMIUM ANUAL", "FREE"
   */
  planDisplayName?: string;
}

// ── Helpers de exibição de billing ─────────────────────────────────────────────

/**
 * Converte planCode + billingCycle no nome exibível na UI.
 * "MASTER" + "annual" → "PREMIUM ANUAL"
 * "PRO"    + "monthly" → "PRO MENSAL"
 * "FREE"   + qualquer  → "FREE"
 */
export function formatPlanDisplayName(
  planCode: string,
  billingCycle?: 'monthly' | 'annual' | null
): string {
  const code  = String(planCode ?? '').toUpperCase();
  const cycle = billingCycle === 'annual' ? 'ANUAL' : 'MENSAL';
  if (code === 'MASTER' || code === 'PREMIUM') return `PREMIUM ${cycle}`;
  if (code === 'PRO') return `PRO ${cycle}`;
  return 'FREE';
}

/**
 * Converte max_students em label de exibição.
 * 9999 ou superior → "Ilimitado"
 */
export function formatStudentLimit(maxStudents: number): string {
  if (maxStudents >= 9999) return 'Ilimitado';
  return String(maxStudents);
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

// ============================================================================
// CEO DASHBOARD — BILLING, SUBSCRIPTIONS, CREDITS, LANDING (v4)
// ============================================================================

/** Plano (modelo DB) */
export interface Plan {
  id: string;
  code: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  credits_monthly: number;
  max_entities: number;
  features_json: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Assinatura (modelo DB extendido) */
export interface Subscription {
  id: string;
  tenant_id: string;
  user_id?: string;
  plan_code: string;
  status: SubscriptionStatus;
  billing_provider?: string;
  provider_customer_id?: string;
  provider_sub_id?: string;
  provider_payment_link?: string;
  provider_update_payment_link?: string;
  current_period_start?: string;
  next_billing?: string;
  next_due_date?: string;
  cancel_at_period_end: boolean;
  last_payment_status?: string;
  is_test_account: boolean;
  courtesy_reason?: string;
  created_at: string;
  updated_at?: string;
}

/** Entrada no razão de créditos */
export type CreditLedgerType =
  // Novos tipos (spec v5)
  | 'monthly_grant' | 'usage_ai' | 'bonus_manual' | 'purchase_extra' | 'courtesy'
  // Aliases legados (schema v4 — mantidos para compatibilidade)
  | 'renewal' | 'purchase' | 'bonus' | 'consumption' | 'refund' | 'adjustment';

export interface CreditLedgerEntry {
  id: string;
  tenant_id: string;
  type: CreditLedgerType;
  amount: number;
  description?: string;
  /** Origem do lançamento (ex: 'kiwify_activation', 'free_bootstrap'). */
  source?: string;
  reference_type?: string;
  reference_id?: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
}

/** Evento de cobrança (webhook log) */
export interface BillingEvent {
  id: string;
  provider: string;
  event_type: string;
  provider_event_id?: string;
  provider_payment_id?: string;
  provider_subscription_id?: string;
  /** Payload bruto do webhook (coluna: payload) */
  payload: Record<string, any>;
  /** @deprecated use payload */
  payload_json?: Record<string, any>;
  processed: boolean;
  processed_at?: string;
  success?: boolean;
  error_message?: string;
  created_at: string;
}

/** Concessão manual (CEO/admin) */
export type AdminGrantType = 'credits' | 'plan_override' | 'courtesy' | 'test_account' | 'suspension' | 'reactivation';

export interface AdminGrant {
  id: string;
  tenant_id: string;
  grant_type: AdminGrantType;
  value: string;
  reason: string;
  granted_by?: string;
  granted_by_name?: string;
  created_at: string;
}

/** Seção de conteúdo da landing page */
export interface LandingSection {
  id: string;
  section_key: string;
  title?: string;
  subtitle?: string;
  content_json: Record<string, any>;
  is_active: boolean;
  updated_by?: string;
  updated_by_name?: string;
  updated_at: string;
}

/** Log de atividade de usuário/assinante no sistema */
export interface UserActivityLog {
  id: string;
  tenant_id?: string;
  user_id?: string;
  user_email?: string;
  user_name?: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, any>;
  created_at: string;
}

/** Configuração de alerta interno (exibido para o assinante) */
export interface AlertConfig {
  id: string;
  alert_key: string;
  alert_type: 'low_credits' | 'plan_expired' | 'plan_expiring';
  threshold?: number;
  days_before?: number;
  title: string;
  message: string;
  is_active: boolean;
  updated_by_name?: string;
  updated_at: string;
}

/** Detalhe de conta de teste criada pelo CEO */
export interface TestAccountDetail {
  tenant_id: string;
  account_name: string;
  responsible_name?: string;
  email: string;
  plan_code: string;
  initial_credits: number;
  credits_remaining: number;
  expires_at?: string;
  observation?: string;
  status: 'active' | 'suspended' | 'expired';
  subscription_status: string;
  created_by_name?: string;
  created_at: string;
}

/** Registro expandido de assinante (view CEO) */
export interface CeoSubscriberRow {
  tenant_id: string;
  tenant_name: string;
  user_name?: string;
  user_email?: string;
  subscription_status: SubscriptionStatus;
  plan_code: string;
  credits_remaining: number;
  credits_limit: number;
  student_limit: number;
  students_active: number;
  next_due_date?: string;
  is_test_account: boolean;
  billing_provider?: string;
  provider_payment_link?: string;
  created_at: string;
}

/** KPIs financeiros (view CEO) */
export interface CeoFinancialKpis {
  active_subscribers: number;
  overdue_subscribers: number;
  trial_subscribers: number;
  canceled_subscribers: number;
  total_tenants: number;
  mrr_estimated: number;
}

// =====================
// AI MODEL SELECTION
// =====================

/** Tipo de saída do modelo: somente texto ou texto com imagem */
export type AIOutputType = 'text' | 'text_image';

/** Contextos onde cada modelo pode ser utilizado */
export type AIModelContext = 'reports' | 'activities' | 'incluilab' | 'protocols';

/**
 * Configuração de um modelo de IA disponível no sistema.
 * Inclui custo em créditos, tipo de saída e contextos permitidos.
 */
export interface AIModelConfig {
  id: string;
  name: string;
  provider: 'gemini' | 'openai' | 'fallback';
  output_type: AIOutputType;
  credit_cost: number;
  active: boolean;
  allowed_contexts: AIModelContext[];
  description: string;
  warning?: string;
}