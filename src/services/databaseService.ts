import { supabase } from './supabase';
import {
  DocumentType,
  PlanTier,
  TenantType,
  UserRole,
  resolvePlanTier,
  formatPlanDisplayName,
  type Protocol,
  type Student,
  type TenantSummary,
  type User,
} from '../types';

type UUID = string;

// ---------------------------------------------------------------------------
// Erros estruturados — permitem tratamento inteligente no frontend
// ---------------------------------------------------------------------------

/**
 * Lançado quando o banco rejeita um unique_code duplicado (código Postgres 23505).
 * Em vez de exibir o erro técnico, o frontend deve abrir o fluxo de vínculo.
 */
export class DuplicateStudentError extends Error {
  readonly existingCode: string;
  constructor(existingCode: string, originalError?: unknown) {
    super('DUPLICATE_STUDENT_CODE');
    this.name = 'DuplicateStudentError';
    this.existingCode = existingCode;
    // Preserva o stack original para debug
    if (originalError instanceof Error && originalError.stack) {
      this.stack = originalError.stack;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireAuthUserId(): Promise<UUID> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error('Usuário não autenticado.');
  return id;
}

async function getTenantIdForUser(userId?: UUID): Promise<UUID> {
  const uid = userId ?? (await requireAuthUserId());
  const { data, error } = await supabase.from('users').select('tenant_id').eq('id', uid).single();
  if (error) throw error;
  if (!data?.tenant_id) throw new Error('Tenant não encontrado para o usuário.');
  return data.tenant_id as UUID;
}

function mapDbRoleToUi(role: string | null | undefined): UserRole {
  // Valores REAIS do constraint users_role_check:
  // TEACHER, AEE, COORDINATOR, MANAGER, ADMIN
  switch ((role ?? '').toUpperCase()) {
    case 'AEE':
      return UserRole.AEE;
    case 'COORDINATOR':
    case 'COORDENADOR':   // legado
      return UserRole.COORDINATOR;
    case 'MANAGER':
    case 'GESTOR':        // legado
      return UserRole.MANAGER;
    case 'ADMIN':
    case 'CEO':           // legado
      return UserRole.CEO;
    case 'CLINICO':
      return UserRole.CLINICIAN;
    case 'RESPONSAVEL_TECNICO':
      return UserRole.TECHNICAL_RESP;
    case 'TEACHER':
    case 'DOCENTE':       // legado
    default:
      return UserRole.TEACHER;
  }
}

function mapTenantType(type: string | null | undefined): TenantType {
  const t = (type ?? '').toUpperCase();
  if (t === 'CLINIC') return TenantType.CLINIC;
  if (t === 'SCHOOL') return TenantType.SCHOOL;
  return TenantType.PROFESSIONAL;
}

function mapDocTypeToUi(type: string): DocumentType {
  const key = String(type ?? '').toUpperCase();
  switch (key) {
    case 'ESTUDO_CASO':
    case 'ESTUDO_DE_CASO':
    case 'ESTUDO DE CASO':
      return DocumentType.ESTUDO_CASO;
    case 'PEI':
      return DocumentType.PEI;
    case 'PAEE':
      return DocumentType.PAEE;
    case 'PDI':
      return DocumentType.PDI;
    default:
      return (type as any) as DocumentType;
  }
}

function mapDocStatus(status: string | null | undefined): 'FINAL' | 'DRAFT' {
  const s = String(status ?? '').toUpperCase();
  // Reconhece todos os sinônimos de "concluído" para retrocompatibilidade
  const FINAL_VALUES = new Set(['FINAL', 'SIGNED', 'ASSINADO', 'APPROVED', 'APROVADO']);
  return FINAL_VALUES.has(s) ? 'FINAL' : 'DRAFT';
}

// ---------------------------------------------------------------------------
// INTERNAL HELPERS
// ---------------------------------------------------------------------------

async function getActiveSubscriptionForTenant(tenantId: string) {
  const { data } = await supabase
    .from('subscriptions')
    .select('id, plan_id, status, current_period_end, current_period_start, billing_cycle, provider, created_at')
    .eq('tenant_id', tenantId)
    .in('status', ['ACTIVE', 'TRIAL', 'PENDING', 'COURTESY', 'INTERNAL_TEST'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

async function getPlanEffectiveByName(planName: string) {
  const { data } = await supabase
    .from('plans')
    .select('*')
    .eq('name', String(planName).toUpperCase())
    .maybeSingle();

  return data ?? null;
}

async function tryGetCreditsWalletBalance(tenantId: string) {
  // credits_wallet.balance é a única coluna real (schema confirmado pelos CSVs).
  try {
    const { data, error } = await supabase
      .from('credits_wallet')
      .select('balance')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) return null;
    const bal = Number((data as any)?.balance);
    if (Number.isFinite(bal)) return bal;
    return null;
  } catch {
    return null;
  }
}

async function getLandingSingleton() {
  // landing_settings não existe no schema real — retorna null com segurança.
  return null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const databaseService = {
  // =========================
  // USER / PROFILE
  // =========================
  async getUserProfile(userId?: UUID): Promise<User | null> {
    const uid = userId ?? (await requireAuthUserId());

    // Colunas REAIS confirmadas pelo schema (CSVs exportados do Supabase).
    // users: id, tenant_id, nome, full_name, email, role, is_super_admin, is_active
    let { data: userRow, error: userErr } = await supabase
      .from('users')
      .select('id, tenant_id, nome, full_name, email, role, is_super_admin, is_active')
      .eq('id', uid)
      .maybeSingle();

    // Fallback: se 'nome' não existir no ambiente (código 42703 = column not found),
    // refaz a query sem ela — full_name será usado como name.
    if (userErr?.code === '42703') {
      const fallback = await supabase
        .from('users')
        .select('id, tenant_id, full_name, email, role, is_super_admin, is_active')
        .eq('id', uid)
        .maybeSingle();
      userErr = fallback.error;
      userRow = fallback.data as any;
    }

    if (userErr) throw userErr;
    if (!userRow) return null;

    // tenants: id, name, plan_id, is_active (sem type, status_assinatura etc.)
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('id, name, plan_id, is_active')
      .eq('id', userRow.tenant_id)
      .maybeSingle();

    // Subscription ativa mais recente — prioriza status ACTIVE/TRIAL/PENDING.
    // Sem filtro de status, um registro CANCELED mais novo mascararia o plano real.
    const ACTIVE_STATUSES = ['ACTIVE', 'TRIAL', 'PENDING', 'COURTESY', 'INTERNAL_TEST'];
    let { data: subRow } = await supabase
      .from('subscriptions')
      .select('id, plan_id, status, current_period_end, provider, created_at')
      .eq('tenant_id', userRow.tenant_id)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fallback: se não há subscription ativa, pega a mais recente de qualquer status
    // (exibe o estado real em vez de mostrar FREE silenciosamente)
    if (!subRow) {
      const fallback = await supabase
        .from('subscriptions')
        .select('id, plan_id, status, current_period_end, provider, created_at')
        .eq('tenant_id', userRow.tenant_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      subRow = fallback.data ?? null;
    }

    // Resolve nome do plano via plan_id (subscription tem prioridade sobre tenant)
    const effectivePlanId = subRow?.plan_id ?? (tenantRow as any)?.plan_id ?? null;
    let planName = 'FREE';
    if (effectivePlanId) {
      const { data: planRow } = await supabase
        .from('plans')
        .select('name')
        .eq('id', effectivePlanId)
        .maybeSingle();
      planName = planRow?.name ?? 'FREE';
    }

    const planTier = resolvePlanTier(planName) as PlanTier;
    const subscriptionStatus = (subRow?.status ?? 'ACTIVE') as any;

    const profile: User = {
      id: userRow.id,
      tenant_id: userRow.tenant_id,
      // nome é a coluna legado; full_name é o nome canônico — usa o que estiver preenchido
      name: userRow.nome ?? userRow.full_name ?? '',
      email: userRow.email,
      role: mapDbRoleToUi(userRow.role),
      plan: planTier,
      tenantType: TenantType.SCHOOL,
      isAdmin: !!(userRow.is_super_admin) || String(userRow.role ?? '').toUpperCase() === 'CEO',
      active: !!(userRow.is_active),
      subscriptionStatus,
      schoolConfigs: [],
      aiUsage: [],
    };

    // LGPD: sem coluna no banco → usa localStorage como fallback
    let localAccepted: any = null;
    try {
      const raw = localStorage.getItem(`lgpdAccepted:${profile.id}`);
      localAccepted = raw ? JSON.parse(raw) : null;
    } catch {}
    (profile as any).lgpdConsent = {
      accepted: !!localAccepted?.accepted,
      acceptedAt: localAccepted?.acceptedAt ?? null,
      termVersion: localAccepted?.termVersion ?? null,
    };

    // Créditos via credits_wallet.balance
    const walletBalance = await tryGetCreditsWalletBalance(userRow.tenant_id);
    (profile as any).aiCreditsRemaining = walletBalance ?? 0;
    (profile as any).providerPaymentLink = null;
    (profile as any).nextDueDate = subRow?.current_period_end ?? null;

    // Escolas do tenant (tabela `schools`)
    try {
      const { data: schoolRows, error: schoolErr } = await supabase
        .from('schools')
        .select('*')
        .eq('tenant_id', userRow.tenant_id)
        .eq('active', true)
        .order('created_at', { ascending: true });
      if (!schoolErr && schoolRows && schoolRows.length > 0) {
        profile.schoolConfigs = schoolRows.map((r: any) => ({
          id:                r.id,
          schoolName:        r.name              ?? '',
          inepCode:          r.inep_code         ?? '',
          cnpj:              r.cnpj              ?? '',
          contact:           r.phone             ?? '',
          email:             r.email             ?? '',
          instagram:         r.instagram         ?? '',
          logoUrl:           r.logo_url          ?? '',
          address:           r.address           ?? '',
          neighborhood:      r.neighborhood      ?? '',
          city:              r.city              ?? '',
          state:             r.state             ?? '',
          zipcode:           r.zipcode           ?? '',
          principalName:     r.principal_name    ?? '',
          managerName:       r.manager_name      ?? '',
          coordinatorName:   r.coordinator_name  ?? '',
          aeeRepresentative: r.aee_representative ?? '',
          aeeRepName:        r.aee_rep_name      ?? '',
          team:              [],
        }));
      }
    } catch {
      // não crítico — schoolConfigs permanece []
    }

    return profile;
  },

  // =========================
  // STUDENTS
  // =========================
  async saveStudent(student: any) {
    const uid = await requireAuthUserId();
    const tenantId = student?.tenant_id ?? (await getTenantIdForUser(uid));

    // ── WHITELIST — colunas REAIS da tabela `students` (schema confirmado) ──
    // students: id, tenant_id, created_by, full_name, birth_date, gender, cpf,
    //   school_name, school_year, class_name, teacher_name,
    //   primary_diagnosis, secondary_diagnoses, cid_codes,
    //   learning_needs, behavioral_notes, medical_notes,
    //   guardian_name, guardian_phone, guardian_email, guardian_relationship,
    //   is_active, deleted_at, created_at, updated_at
    // Columns added by schema_v_triagem.sql migration:
    //   student_type, skills, student_difficulties, student_strategies
    const REAL_COLUMNS = new Set([
      'id', 'tenant_id', 'created_by',
      'full_name', 'birth_date', 'gender', 'cpf',
      'school_name', 'school_year', 'class_name', 'teacher_name',
      'primary_diagnosis', 'secondary_diagnoses', 'cid_codes',
      'learning_needs', 'behavioral_notes', 'medical_notes',
      'guardian_name', 'guardian_phone', 'guardian_email', 'guardian_relationship',
      'is_active', 'deleted_at', 'created_at', 'updated_at',
      // from migration schema_v_triagem.sql:
      'student_type', 'skills', 'student_difficulties', 'student_strategies',
      // extended external student fields:
      'is_external', 'external_school_name', 'external_school_city',
      'external_professional', 'external_referral_source',
      // additional clinical / pedagogical fields:
      'support_level', 'medication', 'professionals', 'shift', 'aee_teacher',
      'coordinator', 'family_context', 'school_history', 'observations',
      'communication', 'photo_url',
      // unique student code + address fields:
      'unique_code', 'zipcode', 'street', 'street_number', 'complement',
      'neighborhood', 'city', 'state',
      // import tracking fields (schema_v24_import_fields.sql):
      'import_source', 'import_batch_id', 'registration_status',
      'missing_required_fields', 'is_pre_registered',
      // prior knowledge (schema_v12_prior_knowledge.sql):
      'prior_knowledge',
      // sociofamily data (schema_v_sociofamily.sql):
      'sociofamily_data',
      'primary_contact_name', 'primary_contact_phone',
      'emergency_contact_name', 'emergency_contact_phone',
    ]);

    // 2. dbPayload: mapeamento camelCase/legado → nomes reais das colunas
    const rawDiagnosis = student?.primary_diagnosis ?? student?.diagnosis ?? null;
    const dbPayload: Record<string, any> = {
      tenant_id:           tenantId,
      // full_name: aceita student.name (legado) ou student.full_name (real)
      full_name:           student?.full_name          ?? student?.name           ?? null,
      birth_date:          student?.birth_date          ?? student?.birthDate      ?? null,
      gender:              student?.gender              ?? null,
      cpf:                 student?.cpf                 ?? null,
      // school_name: text — form resolve via schoolId→schoolName antes de chamar onSave
      school_name:         student?.school_name         ?? student?.schoolName     ?? null,
      // school_year: aceita grade (legado) mapeado para ano escolar
      school_year:         student?.school_year         ?? student?.grade          ?? student?.gradeLevel ?? null,
      class_name:          student?.class_name          ?? student?.className       ?? null,
      // teacher_name: aceita regent_teacher (legado) mapeado para professor regente
      teacher_name:        student?.teacher_name        ?? student?.regent_teacher ?? student?.regentTeacher ?? null,
      // primary_diagnosis: aceita diagnosis (legado) — se for array, usa primeiro elemento
      primary_diagnosis:   Array.isArray(rawDiagnosis)
                             ? (rawDiagnosis[0] ?? null)
                             : (rawDiagnosis ?? null),
      secondary_diagnoses: Array.isArray(student?.secondary_diagnoses)
                             ? student.secondary_diagnoses
                             : Array.isArray(rawDiagnosis) && rawDiagnosis.length > 1
                               ? rawDiagnosis.slice(1)
                               : [],
      // cid_codes: aceita cid (legado, pode ser string ou array)
      cid_codes:           Array.isArray(student?.cid_codes)
                             ? student.cid_codes
                             : Array.isArray(student?.cid)
                               ? student.cid
                               : student?.cid
                                 ? [student.cid]
                                 : [],
      // learning_needs: aceita dificuldades/estratégias (legado) concatenados
      learning_needs:      student?.learning_needs      ?? student?.difficulties   ?? null,
      behavioral_notes:    student?.behavioral_notes    ?? student?.observations   ?? null,
      medical_notes:       student?.medical_notes       ?? student?.medication     ?? null,
      guardian_name:       student?.guardian_name       ?? student?.guardianName   ?? null,
      guardian_phone:      student?.guardian_phone      ?? student?.guardianPhone  ?? null,
      guardian_email:      student?.guardian_email      ?? student?.guardianEmail  ?? null,
      guardian_relationship: student?.guardian_relationship ?? null,
      is_active:           student?.is_active ?? true,
    };

    // ── Campos das colunas adicionadas pela migration schema_v_triagem.sql ──
    // student_type: 'com_laudo' | 'em_triagem'
    const studentType = student?.student_type ?? student?.tipo_aluno ?? 'com_laudo';
    dbPayload.student_type = studentType;

    // skills, difficulties, strategies como jsonb arrays
    if (student?.abilities   !== undefined) dbPayload.skills               = Array.isArray(student.abilities)   ? student.abilities   : [];
    if (student?.difficulties !== undefined) dbPayload.student_difficulties = Array.isArray(student.difficulties) ? student.difficulties : [];
    if (student?.strategies   !== undefined) dbPayload.student_strategies   = Array.isArray(student.strategies)  ? student.strategies  : [];

    // Campos de aluno externo
    // Regra: se is_external = false, todos os campos externos devem ser null.
    // Regra: external_referral_source tem constraint CHECK — só aceita valores da lista
    //        ou NULL. Nunca enviar string vazia ''.
    const VALID_REFERRAL_SOURCES = new Set(['Escola','Clínica','UBS','Família','Prefeitura','Outro']);
    const isExternal = !!(student?.isExternalStudent ?? student?.is_external ?? false);
    const rawReferral = student?.externalReferralSource ?? student?.external_referral_source ?? '';
    const safeReferral = VALID_REFERRAL_SOURCES.has(rawReferral) ? rawReferral : null;

    dbPayload.is_external              = isExternal;
    // Quando is_external = false → todos os campos externos são null
    dbPayload.external_school_name     = isExternal ? (student?.externalSchoolName   || student?.external_school_name   || null) : null;
    dbPayload.external_school_city     = isExternal ? (student?.externalSchoolCity   || student?.external_school_city   || null) : null;
    dbPayload.external_professional    = isExternal ? (student?.externalProfessional || student?.external_professional  || null) : null;
    dbPayload.external_referral_source = isExternal ? safeReferral : null;

    // Campos clínicos e pedagógicos adicionais
    dbPayload.support_level   = student?.supportLevel   ?? student?.support_level   ?? null;
    dbPayload.shift            = student?.shift           ?? null;
    dbPayload.aee_teacher      = student?.aeeTeacher      ?? student?.aee_teacher     ?? null;
    dbPayload.coordinator      = student?.coordinator     ?? null;
    dbPayload.family_context   = student?.familyContext   ?? student?.family_context  ?? null;
    dbPayload.school_history   = student?.schoolHistory   ?? student?.school_history  ?? null;
    dbPayload.observations     = student?.observations    ?? null;
    dbPayload.photo_url        = student?.photoUrl        ?? student?.photo_url       ?? null;
    dbPayload.professionals    = Array.isArray(student?.professionals) ? student.professionals : [];
    dbPayload.communication    = Array.isArray(student?.communication) ? student.communication : [];

    // Código único do aluno + campos de endereço
    if (student?.unique_code)  dbPayload.unique_code   = student.unique_code;
    if (student?.zipcode)      dbPayload.zipcode        = student.zipcode       ?? null;
    if (student?.street)       dbPayload.street         = student.street        ?? null;
    if (student?.streetNumber) dbPayload.street_number  = student.streetNumber  ?? null;
    if (student?.complement)   dbPayload.complement     = student.complement    ?? null;
    if (student?.neighborhood) dbPayload.neighborhood   = student.neighborhood  ?? null;
    if (student?.city)         dbPayload.city           = student.city          ?? null;
    if (student?.state)        dbPayload.state          = student.state         ?? null;

    // Campos de rastreamento de importação CSV (schema_v24_import_fields.sql)
    if (student?.import_source !== undefined)
      dbPayload.import_source = student.import_source;
    if (student?.import_batch_id !== undefined)
      dbPayload.import_batch_id = student.import_batch_id ?? null;
    if (student?.registration_status !== undefined)
      dbPayload.registration_status = student.registration_status;
    if (student?.missing_required_fields !== undefined)
      dbPayload.missing_required_fields = Array.isArray(student.missing_required_fields)
        ? student.missing_required_fields : [];
    if (student?.is_pre_registered !== undefined)
      dbPayload.is_pre_registered = !!student.is_pre_registered;

    // Perfil pedagógico inicial (prior knowledge — schema_v12_prior_knowledge.sql)
    if (student?.priorKnowledge !== undefined) {
      dbPayload.prior_knowledge = student.priorKnowledge ?? null;
    }

    // Dados sociofamiliares (schema_v_sociofamily.sql) — LGPD: uso interno escolar
    if (student?.sociofamilyData !== undefined) {
      dbPayload.sociofamily_data = student.sociofamilyData ?? null;
    }
    if (student?.primaryContactName  !== undefined) dbPayload.primary_contact_name   = student.primaryContactName   ?? null;
    if (student?.primaryContactPhone !== undefined) dbPayload.primary_contact_phone  = student.primaryContactPhone  ?? null;
    if (student?.emergencyContactName  !== undefined) dbPayload.emergency_contact_name  = student.emergencyContactName  ?? null;
    if (student?.emergencyContactPhone !== undefined) dbPayload.emergency_contact_phone = student.emergencyContactPhone ?? null;

    if (student?.id) dbPayload.id = student.id;
    // created_by é NOT NULL — usa o ID do usuário autenticado como fallback
    dbPayload.created_by = student?.created_by ?? uid;

    // Tentativa 1: upsert com payload completo (inclui colunas da migration)
    const { data, error } = await supabase.from('students').upsert(dbPayload).select().single();

    if (!error) return data;

    // Se o erro for "coluna não existe" (migration ainda não foi rodada),
    // tenta novamente com apenas as colunas originais do schema base.
    const isMissingColumn = String(error.message ?? '').includes('column') &&
      (String(error.message ?? '').includes('does not exist') ||
       String(error.message ?? '').includes('unknown'));

    // Código único duplicado → lança erro estruturado (não o erro SQL bruto)
    if ((error as any)?.code === '23505' &&
        String(error.message).includes('unique_code')) {
      throw new DuplicateStudentError(
        String(dbPayload.unique_code ?? student?.unique_code ?? ''),
        error,
      );
    }

    if (isMissingColumn) {
      console.warn('[saveStudent] Colunas extras não encontradas — migration pendente. Salvando com schema base.', error.message);
      const EXTRA_COLUMNS = new Set([
        'student_type','skills','student_difficulties','student_strategies',
        'is_external','external_school_name','external_school_city',
        'external_professional','external_referral_source',
        'support_level','shift','aee_teacher','coordinator',
        'family_context','school_history','observations','photo_url',
        'professionals','communication',
        // import tracking (schema_v24):
        'import_source','import_batch_id','registration_status',
        'missing_required_fields','is_pre_registered',
        // prior knowledge (schema_v12):
        'prior_knowledge',
        // sociofamily (schema_v_sociofamily):
        'sociofamily_data','primary_contact_name','primary_contact_phone',
        'emergency_contact_name','emergency_contact_phone',
      ]);
      const corePayload = Object.fromEntries(
        Object.entries(dbPayload).filter(([k]) => !EXTRA_COLUMNS.has(k))
      );
      const { data: data2, error: error2 } = await supabase
        .from('students').upsert(corePayload).select().single();
      if (error2) {
        // Também trata 23505 no fallback
        if ((error2 as any)?.code === '23505' &&
            String(error2.message).includes('unique_code')) {
          throw new DuplicateStudentError(
            String(corePayload.unique_code ?? student?.unique_code ?? ''),
            error2,
          );
        }
        throw error2;
      }
      return data2;
    }

    throw error;
  },

  // =========================
  // USER PATCHES
  // =========================
  async updateUserProfile(userId: string, patch: { name?: string; email?: string }) {
    const safe: any = {};
    if (typeof patch.name === 'string') safe.nome = patch.name;
    if (typeof patch.email === 'string') safe.email = patch.email;
    if (Object.keys(safe).length === 0) return;
    const { error } = await supabase.from('users').update(safe).eq('id', userId);
    if (error) throw error;
  },

  /**
   * Persiste as escolas do tenant na tabela `schools` (relacional).
   * Cada entrada em `schools` é um SchoolConfig do frontend.
   * Faz upsert por id (preserva registros existentes).
   */
  async saveSchoolConfigs(userId: string, schools: any[]) {
    const tenantId = await getTenantIdForUser(userId);
    if (!schools || schools.length === 0) return;

    for (const sc of schools) {
      const row: any = {
        id:                sc.id,
        tenant_id:         tenantId,
        name:              sc.schoolName || sc.name || '',
        inep_code:         sc.inepCode   || sc.inep_code   || null,
        cnpj:              sc.cnpj       || null,
        phone:             sc.contact    || sc.phone       || null,
        email:             sc.email      || null,
        instagram:         sc.instagram  || null,
        logo_url:          sc.logoUrl    || sc.logo_url    || null,
        address:           sc.address    || null,
        neighborhood:      sc.neighborhood || null,
        city:              sc.city       || null,
        state:             sc.state      || null,
        zipcode:           sc.zipcode    || null,
        principal_name:    sc.principalName || sc.principal_name || null,
        manager_name:      sc.managerName   || sc.manager_name   || null,
        coordinator_name:  sc.coordinatorName || sc.coordinator_name || null,
        aee_representative: sc.aeeRepresentative || sc.aee_representative || null,
        aee_rep_name:       sc.aeeRepName || sc.aee_rep_name || null,
        active:             true,
        updated_at:         new Date().toISOString(),
      };

      // Garante UUID válido
      if (!row.id || typeof row.id !== 'string' || row.id.length < 8) {
        row.id = crypto.randomUUID();
      }

      if (!row.name.trim()) continue; // não salva escola sem nome

      const { error } = await supabase
        .from('schools')
        .upsert(row, { onConflict: 'id' });

      if (error) {
        throw new Error(`Erro ao salvar escola "${row.name}": ${error.message}`);
      }
    }
  },

  /**
   * Carrega todas as escolas ativas do tenant, mapeadas para SchoolConfig.
   */
  async getSchoolConfigs(userId: string): Promise<any[]> {
    try {
      const tenantId = await getTenantIdForUser(userId);
      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('active', true)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id:                r.id,
        schoolName:        r.name            ?? '',
        inepCode:          r.inep_code       ?? '',
        cnpj:              r.cnpj            ?? '',
        contact:           r.phone           ?? '',
        email:             r.email           ?? '',
        instagram:         r.instagram       ?? '',
        logoUrl:           r.logo_url        ?? '',
        address:           r.address         ?? '',
        neighborhood:      r.neighborhood    ?? '',
        city:              r.city            ?? '',
        state:             r.state           ?? '',
        zipcode:           r.zipcode         ?? '',
        principalName:     r.principal_name  ?? '',
        managerName:       r.manager_name    ?? '',
        coordinatorName:   r.coordinator_name ?? '',
        aeeRepresentative: r.aee_representative ?? '',
        aeeRepName:        r.aee_rep_name    ?? '',
        team:              [],
      }));
    } catch (e) {
      console.error('[getSchoolConfigs]', e);
      return [];
    }
  },

  async acceptLGPD(userId: string, payload?: { termVersion?: string }) {
    const acceptedAt = new Date().toISOString();
    const termVersion = payload?.termVersion ?? 'v1.0';
    try {
      const { error } = await supabase
        .from('users')
        .update({ lgpd_accepted: true, lgpd_accepted_at: acceptedAt, lgpd_term_version: termVersion } as any)
        .eq('id', userId);
      if (error) throw error;
    } catch {
      try {
        localStorage.setItem(
          `lgpdAccepted:${userId}`,
          JSON.stringify({ accepted: true, acceptedAt, termVersion })
        );
      } catch {}
    }
  },

  async getStudents(userId?: UUID): Promise<Student[]> {
    const tenantId = await getTenantIdForUser(userId);

    // ── 1. Alunos próprios do tenant ────────────────────────────────────────
    const { data: ownedData, error } = await supabase
      .from('students')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    // ── 2. Alunos de outras escolas vinculados via student_tenant_access ────
    // Requer policy "students_linked_select" (schema_v26_students_linked_rls.sql).
    // Sem ela, o join retorna row.students = null por RLS e os alunos são silenciados.
    const { data: linkedData, error: linkedError } = await supabase
      .from('student_tenant_access')
      .select('student_id, access_type, granted_at, students(*)')
      .eq('tenant_id', tenantId)
      .order('granted_at', { ascending: false });

    if (linkedError) {
      console.warn('[getStudents] Erro ao buscar vínculos student_tenant_access:', linkedError.message);
    }

    // IDs dos alunos já carregados como próprios (evita duplicatas)
    const ownedIds = new Set((ownedData ?? []).map((r: any) => r.id));

    // Achata os alunos vinculados e marca acesso como externo
    // row.students será null se a policy students_linked_select não existir no banco —
    // nesse caso o array ficará vazio (sem erro, mas sem dados).
    const linkedRows: any[] = (linkedData ?? [])
      .filter((row: any) => row.students && !ownedIds.has((row.students as any).id))
      .map((row: any) => ({
        ...row.students,
        // Sobrescreve flag para a UI saber que é vínculo, não aluno próprio
        is_external: true,
        _linked_access_type: row.access_type,
        _linked_at: row.granted_at,
      }));

    if ((linkedData ?? []).length > 0 && linkedRows.length === 0) {
      console.warn(
        `[getStudents] ${linkedData!.length} vínculo(s) encontrado(s) em student_tenant_access, ` +
        'mas students(*) retornou null para todos. ' +
        'Execute schema_v26_students_linked_rls.sql no Supabase para corrigir.',
      );
    }

    // ── 3. Normaliza ambas as listas com o mesmo mapeamento legado ──────────
    const normalize = (r: any): any => ({
      ...r,
      name:             r.full_name        ?? r.name         ?? '',
      birthDate:        r.birth_date       ?? r.birthDate    ?? '',
      grade:            r.school_year      ?? r.grade        ?? '',
      schoolName:       r.school_name      ?? r.schoolName   ?? '',
      regentTeacher:    r.teacher_name     ?? r.regentTeacher?? '',
      aeeTeacher:       r.aee_teacher      ?? r.aeeTeacher   ?? '',
      guardianName:     r.guardian_name    ?? r.guardianName ?? '',
      guardianPhone:    r.guardian_phone   ?? r.guardianPhone?? '',
      guardianEmail:    r.guardian_email   ?? r.guardianEmail?? '',
      tipo_aluno:       r.student_type     ?? r.tipo_aluno   ?? 'com_laudo',
      diagnosis:        r.primary_diagnosis
        ? [r.primary_diagnosis, ...(r.secondary_diagnoses ?? [])]
        : (Array.isArray(r.secondary_diagnoses) ? r.secondary_diagnoses : []),
      abilities:        Array.isArray(r.skills)               ? r.skills               : (Array.isArray(r.abilities)    ? r.abilities    : []),
      difficulties:     Array.isArray(r.student_difficulties) ? r.student_difficulties : (Array.isArray(r.difficulties) ? r.difficulties : []),
      strategies:       Array.isArray(r.student_strategies)   ? r.student_strategies   : (Array.isArray(r.strategies)   ? r.strategies   : []),
      documents:        Array.isArray(r.documents)            ? r.documents            : [],
      cid:              Array.isArray(r.cid_codes)            ? r.cid_codes            : (Array.isArray(r.cid) ? r.cid : (r.cid ? [r.cid] : [])),
      isExternalStudent:    r.is_external              ?? r.isExternalStudent    ?? false,
      externalSchoolName:   r.external_school_name     ?? r.externalSchoolName   ?? '',
      externalSchoolCity:   r.external_school_city     ?? r.externalSchoolCity   ?? '',
      externalProfessional: r.external_professional    ?? r.externalProfessional ?? '',
      externalReferralSource: r.external_referral_source ?? r.externalReferralSource ?? '',
      supportLevel:     r.support_level   ?? r.supportLevel  ?? 'Nível 1',
      medication:       r.medical_notes   ?? r.medication    ?? '',
      professionals:    Array.isArray(r.professionals)  ? r.professionals  : [],
      communication:    Array.isArray(r.communication)  ? r.communication  : [],
      observations:     r.observations    ?? '',
      familyContext:    r.family_context  ?? r.familyContext ?? '',
      schoolHistory:    r.school_history  ?? r.schoolHistory ?? '',
      photoUrl:         r.photo_url       ?? r.photoUrl      ?? '',
      shift:            r.shift           ?? '',
      coordinator:      r.coordinator     ?? '',
      unique_code:      r.unique_code     ?? '',
      zipcode:          r.zipcode         ?? '',
      street:           r.street          ?? '',
      streetNumber:     r.street_number   ?? '',
      complement:       r.complement      ?? '',
      neighborhood:     r.neighborhood    ?? '',
      city:             r.city            ?? '',
      state:            r.state           ?? '',
      // ── campos de importação (schema_v24) ──────────────────────────────────
      // O spread ...r já inclui as colunas snake_case, mas a UI lê camelCase.
      registrationStatus:   r.registration_status    ?? r.registrationStatus,
      importSource:         r.import_source           ?? r.importSource,
      isPreRegistered:      !!(r.is_pre_registered    ?? r.isPreRegistered ?? false),
      missingRequiredFields: r.missing_required_fields ?? r.missingRequiredFields ?? [],
      priorKnowledge:         r.prior_knowledge          ?? r.priorKnowledge          ?? undefined,
      // Dados sociofamiliares (schema_v_sociofamily.sql)
      sociofamilyData:        r.sociofamily_data         ?? r.sociofamilyData         ?? undefined,
      primaryContactName:     r.primary_contact_name     ?? r.primaryContactName      ?? undefined,
      primaryContactPhone:    r.primary_contact_phone    ?? r.primaryContactPhone     ?? undefined,
      emergencyContactName:   r.emergency_contact_name   ?? r.emergencyContactName    ?? undefined,
      emergencyContactPhone:  r.emergency_contact_phone  ?? r.emergencyContactPhone   ?? undefined,
    });

    return [...(ownedData ?? []), ...linkedRows].map(normalize) as any;
  },

  async deleteStudent(studentId: string) {
    const { error } = await supabase.from('students').delete().eq('id', studentId);
    if (error) throw error;
    return true;
  },

  // =========================
  // DOCUMENTS / PROTOCOLS
  // =========================
  async saveDocument(doc: any) {
    const tenantId = doc?.tenant_id ?? (await getTenantIdForUser(doc?.userId));

    // BUG FIX 1: always resolve created_by from auth session when not provided
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const createdBy = doc?.created_by ?? doc?.generatedBy_id ?? authUser?.id ?? null;

    // BUG FIX 2: normalize doc_type — 'Estudo de Caso' → 'ESTUDO_CASO'
    const rawType = (doc.doc_type ?? doc.type ?? doc.documentType ?? '').toString().toUpperCase().trim();
    const docTypeMap: Record<string, string> = {
      'ESTUDO DE CASO': 'ESTUDO_CASO',
      'ESTUDO_DE_CASO':  'ESTUDO_CASO',
      'ESTUDO DE CASO EDUCACIONAL': 'ESTUDO_CASO',
      'PEI': 'PEI',
      'PAEE': 'PAEE',
      'PDI': 'PDI',
    };
    const docType = docTypeMap[rawType] ?? rawType;

    // Normaliza status para os valores aceitos pelo DB: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'SIGNED'
    const rawStatus = (doc.status ?? 'DRAFT').toString().toUpperCase().trim();
    const statusMap: Record<string, string> = {
      'DRAFT': 'DRAFT', 'RASCUNHO': 'DRAFT',
      'REVIEW': 'REVIEW', 'REVISÃO': 'REVIEW', 'REVISAO': 'REVIEW',
      // 'FINAL' é o conceito de UI para "concluído" → mapeia para APPROVED no banco
      'FINAL': 'APPROVED', 'APROVADO': 'APPROVED', 'APPROVED': 'APPROVED',
      'SIGNED': 'SIGNED', 'ASSINADO': 'SIGNED',
    };
    const docStatus = statusMap[rawStatus] ?? 'DRAFT';

    const payload: any = {
      tenant_id:      tenantId,
      student_id:     doc.studentId ?? doc.student_id ?? null,
      created_by:     createdBy,
      doc_type:       docType,
      title:          doc.title ?? '',
      status:         docStatus,
      source_id:      doc.source_id ?? doc.sourceId ?? null,
      structured_data: doc.structuredData ?? doc.structured_data ?? (doc.content ? { content: doc.content } : { sections: [] }),
      audit_code:     doc.auditCode ?? doc.audit_code ?? null,
    };

    if (doc?.id) payload.id = doc.id;

    const q = payload.id
      ? supabase.from('documents').upsert(payload)
      : supabase.from('documents').insert(payload);
    const { data, error } = await q.select().single();
    if (error) throw error;
    return data;
  },

  async getDocumentsByStudent(studentId: string) {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async getProtocols(userId?: UUID): Promise<Protocol[]> {
    const tenantId = await getTenantIdForUser(userId);
    const { data, error } = await supabase
      .from('documents')
      .select('id, tenant_id, student_id, created_by, doc_type, source_id, title, structured_data, status, audit_code, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const rows = data ?? [];
    return rows.map((r: any) => {
      // doc_type é a coluna real (não "type")
      const proto: Protocol = {
        id: r.id,
        tenant_id: r.tenant_id,
        studentId: r.student_id,
        studentName: '',
        type: mapDocTypeToUi(r.doc_type ?? ''),
        status: mapDocStatus(r.status) as any,
        source_id: r.source_id ?? null,
        // content vem de structured_data (não existe coluna "content")
        content: typeof r.structured_data === 'string'
          ? r.structured_data
          : (r.structured_data?.content ?? JSON.stringify(r.structured_data ?? {})),
        isStructured: true,
        structuredData: r.structured_data ?? { sections: [] },
        versions: [],
        lastEditedAt: r.updated_at ?? r.created_at,
        lastEditedBy: r.created_by ?? '',
        createdAt: r.created_at,
        generatedBy: '',
        auditCode: r.audit_code ?? '',
        signatures: { regent: '', coordinator: '', aee: '', manager: '' },
      };
      return proto;
    });
  },

  async deleteDocument(id: string): Promise<void> {
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // =========================
  // BILLING / LIMITS
  // =========================
  async getTenantSummary(userId: string): Promise<TenantSummary> {
    const tenantId = await getTenantIdForUser(userId);

    // Paraleliza as 3 queries independentes
    const [tenantResult, studentsResult, sub] = await Promise.all([
      supabase
        .from('tenants')
        .select('id, name, plan_id, is_active')
        .eq('id', tenantId)
        .single(),
      supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .is('deleted_at', null),
      getActiveSubscriptionForTenant(tenantId),
    ]);

    if (tenantResult.error) throw tenantResult.error;
    if (studentsResult.error) throw studentsResult.error;

    const tenant = tenantResult.data;
    const studentsCount = studentsResult.count;
    const subscriptionStatus = ((sub as any)?.status ?? 'ACTIVE') as any;

    // Resolve plano via plan_id (subscription → tenant)
    const effectivePlanId = (sub as any)?.plan_id ?? (tenant as any)?.plan_id ?? null;
    let planName = 'FREE';
    if (effectivePlanId) {
      const { data: planRow } = await supabase
        .from('plans')
        .select('name')
        .eq('id', effectivePlanId)
        .maybeSingle();
      planName = planRow?.name ?? 'FREE';
    }

    const planTier = resolvePlanTier(planName) as PlanTier;

    // Limites do plano: busca via código DB (FREE/PRO/MASTER), não via label UI
    // planName já é o código DB ('FREE', 'PRO', 'MASTER')
    const planEff = await getPlanEffectiveByName(planName.toUpperCase());
    // Fallback usa os limites hardcoded do PLAN_LIMITS (tipos.ts) quando o plano não está no DB
    const { getPlanLimits } = await import('../types');
    const hardcodedLimits = getPlanLimits(planTier);
    let walletAvail = await tryGetCreditsWalletBalance(tenantId);

    // Se a wallet ainda não existe (conta nova) mas o plano dá créditos mensais,
    // inicializa a wallet automaticamente para não bloquear o usuário.
    if (walletAvail === null) {
      const planCredits = Number((planEff as any)?.ai_credits_per_month ?? (hardcodedLimits as any)?.ai_credits ?? 0);
      if (planCredits > 0) {
        try {
          const { data: existingWallet } = await supabase
            .from('credits_wallet')
            .select('id')
            .eq('tenant_id', tenantId)
            .maybeSingle();

          if (!existingWallet) {
            // Cria wallet com saldo inicial do plano
            await supabase.from('credits_wallet').insert({
              tenant_id: tenantId,
              balance: planCredits,
            });
            walletAvail = planCredits;
          } else {
            walletAvail = 0; // wallet existe mas balance era null — lê como 0
          }
        } catch {
          walletAvail = planCredits; // falhou ao criar — usa créditos do plano como fallback de exibição
        }
      } else {
        walletAvail = 0;
      }
    }

    // Créditos mensais do plano (lê do banco; fallback nos limites estáticos)
    const planCreditsMonthly = Number(
      (planEff as any)?.ai_credits_per_month
      ?? (hardcodedLimits as any)?.ai_credits
      ?? 0
    );

    // ── Ledger: consumo e compras do ciclo ────────────────────────────────────
    // Período: início do ciclo atual (inicio do mês ou data da assinatura)
    const cycleStart: string = (() => {
      const periodStart = (sub as any)?.current_period_start;
      if (periodStart) return periodStart;
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    })();

    let creditsConsumedCycle = 0;
    let creditsPurchased = 0;
    try {
      // Consumo: apenas do ciclo atual
      const { data: usageRows } = await supabase
        .from('credits_ledger')
        .select('amount')
        .eq('tenant_id', tenantId)
        .eq('type', 'usage_ai')
        .gte('created_at', cycleStart);

      for (const row of usageRows ?? []) {
        const amt = Number((row as any).amount ?? 0);
        if (amt < 0) creditsConsumedCycle += Math.abs(amt);
      }

      // Créditos extras (manual_grant, compras, cortesia): ALL-TIME — não limitado ao ciclo
      // Exclui monthly_grant/renewal — esses representam o crédito do plano e já estão em planCreditsMonthly
      const ADDITIVE_TYPES = ['manual_grant', 'purchase_extra', 'bonus_manual', 'courtesy', 'refund', 'bonus', 'purchase'];
      const { data: extraRows } = await supabase
        .from('credits_ledger')
        .select('amount')
        .eq('tenant_id', tenantId)
        .in('type', ADDITIVE_TYPES);

      for (const row of extraRows ?? []) {
        const amt = Number((row as any).amount ?? 0);
        if (amt > 0) creditsPurchased += amt;
      }
    } catch {
      // ledger opcional — não bloqueia
    }

    // ── Sincroniza credits_wallet.balance com o saldo calculado via ledger ────
    // Garante que checkCredits() (que lê credits_wallet diretamente) enxergue
    // o mesmo valor que a UI exibe. Fonte de verdade = ledger.
    const computedBalance = Math.max(0, planCreditsMonthly + creditsPurchased - creditsConsumedCycle);
    try {
      if (walletAvail !== null) {
        // Wallet existe — atualiza para refletir a verdade do ledger
        await supabase
          .from('credits_wallet')
          .update({ balance: computedBalance, updated_at: new Date().toISOString() })
          .eq('tenant_id', tenantId);
      } else {
        // Wallet não existia — cria com saldo correto
        await supabase.from('credits_wallet').insert({
          tenant_id: tenantId,
          balance: computedBalance,
        });
      }
      walletAvail = computedBalance;
    } catch {
      // não crítico — próxima chamada vai corrigir
    }

    const billingCycle: 'monthly' | 'annual' =
      (sub as any)?.billing_cycle === 'annual' ? 'annual' : 'monthly';

    return {
      tenantId,
      tenantName: (tenant as any)?.name,
      subscriptionStatus,
      planTier,
      aiCreditsRemaining: walletAvail,
      planCreditsMonthly,
      creditsPurchased,
      creditsConsumedCycle,
      studentLimitBase: (planEff as any)?.max_students ?? hardcodedLimits.students,
      studentLimitExtra: 0 as any,
      studentsActive: studentsCount ?? 0,
      renewalDatePlan: (sub as any)?.current_period_end ?? undefined,
      renewalDateCredits: (sub as any)?.current_period_end ?? undefined,
      billingCycle,
      planDisplayName: formatPlanDisplayName(planName, billingCycle),
    };
  },

  // =========================
  // PRICING / LANDING (CEO)
  // =========================
  async getEffectivePlans(): Promise<any[]> {
    // v_plans_effective não existe — query direto na tabela real plans
    // Normaliza campos para compatibilidade com o código que consome esta função.
    const { data, error } = await supabase
      .from('plans')
      .select('id, name, max_students, ai_credits_per_month, price_brl, is_active, created_at')
      .eq('is_active', true)
      .order('price_brl', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((p: any) => ({
      ...p,
      // Aliases para compat com código que usa os nomes antigos
      code:             p.name,
      price_monthly:    p.price_brl ?? 0,
      annual_price:     0,
      credits_monthly:  p.ai_credits_per_month ?? 0,
      max_entities:     p.max_students ?? 5,
      display_order:    p.name === 'FREE' ? 1 : p.name === 'PRO' ? 2 : 3,
    }));
  },

  async updatePlan(name: 'FREE' | 'PRO' | 'MASTER', patch: Partial<any>): Promise<void> {
    const normalized = String(name).toUpperCase();
    // Colunas reais de plans: max_students, ai_credits_per_month, price_brl, is_active
    const allowed = ['max_students', 'ai_credits_per_month', 'price_brl', 'is_active'] as const;
    const safe: Record<string, any> = {};
    for (const k of allowed) if (k in patch) safe[k] = (patch as any)[k];
    // Aliases legado → real
    if ('max_entities' in patch) safe.max_students = (patch as any).max_entities;
    if ('monthly_price' in patch) safe.price_brl = (patch as any).monthly_price;
    if ('credits_monthly' in patch) safe.ai_credits_per_month = (patch as any).credits_monthly;
    if (Object.keys(safe).length === 0) return;
    const { error } = await supabase.from('plans').update(safe).eq('name', normalized);
    if (error) throw error;
  },

  async getLandingSettings(): Promise<any | null> {
    // landing_settings não existe no schema real
    return null;
  },

  async updateLandingSettings(_patch: Partial<any>): Promise<void> {
    // landing_settings não existe no schema real — operação no-op
    console.warn('[databaseService.updateLandingSettings] tabela landing_settings não existe no schema atual.');
  },

  // =========================
  // APPOINTMENTS
  // =========================
  async getAppointments(userId?: string): Promise<any[]> {
    const { AppointmentService } = await import('./persistenceService');
    const uid = userId ?? (await requireAuthUserId());
    return AppointmentService.getAll(uid);
  },

  async saveAppointment(apt: any, userId: string): Promise<any | null> {
    const { AppointmentService } = await import('./persistenceService');
    return AppointmentService.save(apt, userId);
  },

  async deleteAppointment(id: string): Promise<boolean> {
    const { AppointmentService } = await import('./persistenceService');
    return AppointmentService.delete(id);
  },

  // =========================
  // CREDITS (debit + refresh)
  // =========================
  async debitCredits(userId: string, cost: number, action: string): Promise<void> {
    const tenantId = await getTenantIdForUser(userId);
    try {
      // credits_wallet.balance é a única coluna real (schema confirmado)
      const { data: wallet } = await supabase
        .from('credits_wallet')
        .select('balance')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (wallet) {
        const bal = Number((wallet as any)?.balance ?? 0);
        const next = Math.max(0, bal - cost);
        await supabase
          .from('credits_wallet')
          .update({ balance: next })
          .eq('tenant_id', tenantId);
      }

      // Registrar no ledger de créditos
      const { error: ledgerErr } = await supabase.from('credits_ledger').insert({
        tenant_id:   tenantId,
        user_id:     userId,
        type:        'usage_ai',
        amount:      -cost,
        description: action,
        source:      'app',
      });
      if (ledgerErr) {
        console.warn('[databaseService.debitCredits] ledger insert falhou:', ledgerErr.message);
      }
    } catch (e) {
      console.warn('[databaseService.debitCredits] erro (não crítico):', e);
    }
  },

  async createPurchaseIntent(args: { tenantId: string; userId: string; planName: string }) {
    const plan = String(args.planName || '').toUpperCase();

    return {
      ok: true,
      provider: 'KIWIFY',
      plan,
      checkoutUrl:
        plan === 'MASTER'
          ? 'https://SEU-LINK-KIWIFY-MASTER'
          : plan === 'PRO'
          ? 'https://SEU-LINK-KIWIFY-PRO'
          : 'https://SEU-LINK-KIWIFY-FREE',
      meta: args,
    };
  },
};
