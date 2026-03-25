import { supabase } from './supabase';
import {
  DocumentType,
  PlanTier,
  TenantType,
  UserRole,
  resolvePlanTier,
  type Protocol,
  type Student,
  type TenantSummary,
  type User,
} from '../types';

type UUID = string;

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

function mapDocStatus(status: string | null | undefined) {
  const s = String(status ?? '').toUpperCase();
  return s === 'FINAL' ? 'FINAL' : 'DRAFT';
}

// ---------------------------------------------------------------------------
// INTERNAL HELPERS
// ---------------------------------------------------------------------------

async function getActiveSubscriptionForTenant(tenantId: string) {
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('status', ['ACTIVE', 'TRIALING', 'PENDING'])
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
    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .select('id, tenant_id, nome, full_name, email, role, is_super_admin, is_active')
      .eq('id', uid)
      .maybeSingle();

    if (userErr) throw userErr;
    if (!userRow) return null;

    // tenants: id, name, plan_id, is_active (sem type, status_assinatura etc.)
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('id, name, plan_id, is_active')
      .eq('id', userRow.tenant_id)
      .maybeSingle();

    // Subscription mais recente — colunas reais: plan_id (uuid FK), status, current_period_end
    const { data: subRow } = await supabase
      .from('subscriptions')
      .select('id, plan_id, status, current_period_end, provider, created_at')
      .eq('tenant_id', userRow.tenant_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

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

    if (isMissingColumn) {
      console.warn('[saveStudent] Colunas extras não encontradas — migration pendente. Salvando com schema base.', error.message);
      const EXTRA_COLUMNS = new Set([
        'student_type','skills','student_difficulties','student_strategies',
        'is_external','external_school_name','external_school_city',
        'external_professional','external_referral_source',
        'support_level','shift','aee_teacher','coordinator',
        'family_context','school_history','observations','photo_url',
        'professionals','communication',
      ]);
      const corePayload = Object.fromEntries(
        Object.entries(dbPayload).filter(([k]) => !EXTRA_COLUMNS.has(k))
      );
      const { data: data2, error: error2 } = await supabase
        .from('students').upsert(corePayload).select().single();
      if (error2) throw error2;
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

  async saveSchoolConfigs(userId: string, schools: any[]) {
    const tenantId = await getTenantIdForUser(userId);
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ school_configs: schools, updated_at: new Date().toISOString() } as any)
        .eq('id', tenantId);
      if (error) throw error;
    } catch {
      // ambiente ainda sem coluna: não quebra o app
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
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    // Normaliza colunas DB → campos esperados pelos componentes (legado)
    return (data ?? []).map((r: any) => ({
      ...r,
      // Campos de identidade
      name:             r.full_name        ?? r.name         ?? '',
      birthDate:        r.birth_date       ?? r.birthDate    ?? '',
      grade:            r.school_year      ?? r.grade        ?? '',
      schoolName:       r.school_name      ?? r.schoolName   ?? '',
      regentTeacher:    r.teacher_name     ?? r.regentTeacher?? '',
      aeeTeacher:       r.aee_teacher      ?? r.aeeTeacher   ?? '',
      guardianName:     r.guardian_name    ?? r.guardianName ?? '',
      guardianPhone:    r.guardian_phone   ?? r.guardianPhone?? '',
      guardianEmail:    r.guardian_email   ?? r.guardianEmail?? '',
      // tipo_aluno mapeado de student_type (nova coluna) ou legado
      tipo_aluno:       r.student_type     ?? r.tipo_aluno   ?? 'com_laudo',
      // Diagnóstico: re-junta primary + secondary em array legado
      diagnosis:        r.primary_diagnosis
        ? [r.primary_diagnosis, ...(r.secondary_diagnoses ?? [])]
        : (Array.isArray(r.secondary_diagnoses) ? r.secondary_diagnoses : []),
      // Habilidades / dificuldades — colunas novas ou legacy
      abilities:        Array.isArray(r.skills)                ? r.skills                : (Array.isArray(r.abilities)    ? r.abilities    : []),
      difficulties:     Array.isArray(r.student_difficulties)  ? r.student_difficulties  : (Array.isArray(r.difficulties) ? r.difficulties : []),
      strategies:       Array.isArray(r.student_strategies)    ? r.student_strategies    : (Array.isArray(r.strategies)   ? r.strategies  : []),
      documents:        Array.isArray(r.documents)             ? r.documents             : [],
      cid:              Array.isArray(r.cid_codes)             ? r.cid_codes             : (Array.isArray(r.cid) ? r.cid : (r.cid ? [r.cid] : [])),
      // Aluno externo
      isExternalStudent:    r.is_external              ?? r.isExternalStudent    ?? false,
      externalSchoolName:   r.external_school_name     ?? r.externalSchoolName   ?? '',
      externalSchoolCity:   r.external_school_city     ?? r.externalSchoolCity   ?? '',
      externalProfessional: r.external_professional    ?? r.externalProfessional ?? '',
      externalReferralSource: r.external_referral_source ?? r.externalReferralSource ?? '',
      // Campos clínicos / pedagógicos adicionais
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
    })) as any;
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

    // BUG FIX 3: normalize status — 'FINAL' → 'SIGNED', unknown → 'DRAFT'
    const rawStatus = (doc.status ?? 'DRAFT').toString().toUpperCase().trim();
    const statusMap: Record<string, string> = {
      'DRAFT': 'DRAFT', 'RASCUNHO': 'DRAFT',
      'REVIEW': 'REVIEW', 'REVISÃO': 'REVIEW', 'REVISAO': 'REVIEW',
      'APPROVED': 'APPROVED', 'APROVADO': 'APPROVED',
      'FINAL': 'SIGNED', 'SIGNED': 'SIGNED', 'ASSINADO': 'SIGNED',
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
      .is('deleted_at', null)
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

  // =========================
  // BILLING / LIMITS
  // =========================
  async getTenantSummary(userId: string): Promise<TenantSummary> {
    const tenantId = await getTenantIdForUser(userId);

    // tenants: colunas reais — id, name, plan_id, is_active
    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .select('id, name, plan_id, is_active')
      .eq('id', tenantId)
      .single();
    if (tErr) throw tErr;

    // Conta alunos ativos (is_active = true e sem soft-delete)
    const { count: studentsCount, error: sErr } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null);
    if (sErr) throw sErr;

    // Subscription mais recente
    const sub = await getActiveSubscriptionForTenant(tenantId);
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
      const planCredits = Number((planEff as any)?.monthly_credits ?? (hardcodedLimits as any)?.ai_credits ?? 0);
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

    return {
      tenantId,
      tenantName: (tenant as any)?.name,
      subscriptionStatus,
      planTier,
      aiCreditsRemaining: walletAvail,
      studentLimitBase: (planEff as any)?.max_students ?? hardcodedLimits.students,
      studentLimitExtra: 0 as any,
      studentsActive: studentsCount ?? 0,
      renewalDatePlan: undefined,
      renewalDateCredits: (sub as any)?.current_period_end ?? undefined,
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

      // Registrar no ledger de créditos (tabela real: credits_ledger)
      try {
        await supabase.from('credits_ledger').insert({
          tenant_id:   tenantId,
          user_id:     userId,
          type:        'usage',
          amount:      -cost,
          description: action,
        });
      } catch { /* silencioso */ }
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
