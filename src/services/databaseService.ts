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
  switch ((role ?? '').toUpperCase()) {
    case 'AEE':
      return UserRole.AEE;
    case 'CLINICO':
      return UserRole.CLINICIAN;
    case 'GESTOR':
      return UserRole.MANAGER;
    case 'COORDENADOR':
      return UserRole.COORDINATOR;
    case 'RESPONSAVEL_TECNICO':
      return UserRole.TECHNICAL_RESP;
    case 'CEO':
      return UserRole.CEO;
    case 'DOCENTE':
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
// INTERNAL HELPERS (missing in your file)
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
  // Prefer credits_avail (novo). Fallback para balance (legado).
  // Essa tabela pode ter RLS/colunas diferentes por ambiente.
  // Nunca deixe erro aqui derrubar o app.
  try {
    const { data, error } = await supabase
      .from('credits_wallet')
      .select('credits_avail, balance')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) return null;
    const avail = Number((data as any)?.credits_avail);
    if (Number.isFinite(avail)) return avail;
    const bal = Number((data as any)?.balance);
    if (Number.isFinite(bal)) return bal;
    return null;
  } catch {
    return null;
  }
}

async function getLandingSingleton() {
  const { data } = await supabase
    .from('landing_settings')
    .select('*')
    .eq('singleton_key', 'default')
    .maybeSingle();

  return data ?? null;
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

    // Alguns ambientes têm colunas extras (LGPD). Tentamos com elas e fazemos fallback.
    let userRow: any = null;
    {
      const attempt = await supabase
        .from('users')
        .select('id, tenant_id, nome, email, role, plan, active, lgpd_accepted, lgpd_accepted_at, lgpd_term_version')
        .eq('id', uid)
        .maybeSingle();
      if (!attempt.error) {
        userRow = attempt.data;
      } else {
        const fallback = await supabase
          .from('users')
          .select('id, tenant_id, nome, email, role, plan, active')
          .eq('id', uid)
          .single();
        if (fallback.error) throw fallback.error;
        userRow = fallback.data;
      }
    }

    if (!userRow) return null;

    // tenants pode ter school_configs; tenta e faz fallback.
    let tenantRow: any = null;
    {
      const attempt = await supabase
        .from('tenants')
        .select('id, name, type, status_assinatura, creditos_ia_restantes, school_configs')
        .eq('id', userRow.tenant_id)
        .maybeSingle();
      if (!attempt.error) {
        tenantRow = attempt.data;
      } else {
        const fallback = await supabase
          .from('tenants')
          .select('id, name, type, status_assinatura, creditos_ia_restantes')
          .eq('id', userRow.tenant_id)
          .single();
        if (fallback.error) throw fallback.error;
        tenantRow = fallback.data;
      }
    }

    const { data: subRow } = await supabase
      .from('subscriptions')
      .select('status, plan, created_at, next_billing')
      .eq('tenant_id', userRow.tenant_id)
      .in('status', ['ACTIVE', 'TRIALING', 'PENDING'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const planTier = resolvePlanTier(subRow?.plan ?? userRow.plan) as PlanTier;
    const subscriptionStatus = (subRow?.status ?? (tenantRow as any)?.status_assinatura ?? 'ACTIVE') as any;

    const profile: User = {
      id: userRow.id,
      tenant_id: userRow.tenant_id,
      name: userRow.nome,
      email: userRow.email,
      role: mapDbRoleToUi(userRow.role),
      plan: planTier,
      tenantType: mapTenantType((tenantRow as any)?.type),
      isAdmin: String(userRow.role ?? '').toUpperCase() === 'CEO',
      active: !!userRow.active,
      subscriptionStatus,
      schoolConfigs: Array.isArray((tenantRow as any)?.school_configs) ? ((tenantRow as any).school_configs as any) : [],
      aiUsage: [],
    };

    // LGPD: prioriza banco; fallback localStorage; senão, exige aceite (accepted=false).
    const dbAccepted = (userRow as any)?.lgpd_accepted;
    if (typeof dbAccepted === 'boolean') {
      (profile as any).lgpdConsent = {
        accepted: dbAccepted,
        acceptedAt: (userRow as any)?.lgpd_accepted_at ?? null,
        termVersion: (userRow as any)?.lgpd_term_version ?? null,
      };
    } else {
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
    }
    // Compat: alguns lugares usam "plan_tier".
    (profile as any).plan_tier = (profile as any).plan_tier ?? userRow.plan;
    // Credits (se você quiser mostrar na UI)
    (profile as any).aiCreditsRemaining = (tenantRow as any)?.creditos_ia_restantes ?? 0;

    return profile;
  },

  // =========================
  // STUDENTS
  // =========================
  async saveStudent(student: any) {
    const tenantId = student?.tenant_id ?? (await getTenantIdForUser());

    // ── WHITELIST — colunas REAIS confirmadas da tabela `students` ──────────────
    // Baseado no schema atual. Qualquer campo fora desta lista vai para `data` JSONB.
    // NÃO inclui: grade_level, school_name, guardian_phone, guardian_email,
    //             regent_teacher, aee_teacher — essas colunas não existem no banco.
    const REAL_COLUMNS = new Set([
      'id', 'tenant_id', 'full_name', 'birth_date',
      'guardian_name', 'diagnosis', 'support_level',
      'photo_url', 'school_history', 'tags', 'notes',
      'created_at', 'updated_at', 'data',
    ]);

    // 1. mergedData: preserva `data` existente + absorve todo campo UI-only (camelCase e snake_case)
    const mergedData: Record<string, any> = { ...(student?.data ?? {}) };
    for (const [key, val] of Object.entries(student ?? {})) {
      if (!REAL_COLUMNS.has(key) && val !== undefined) {
        mergedData[key] = val;
      }
    }

    // Campos extra com mapeamento camelCase → snake_case que devem ir para `data`
    // (não existem como colunas no banco, mas devem ser preservados)
    const extraToData: Record<string, any> = {
      grade_level:    student?.grade_level    ?? student?.gradeLevel    ?? student?.grade    ?? null,
      school_name:    student?.school_name    ?? student?.schoolName    ?? null,
      guardian_phone: student?.guardian_phone ?? student?.guardianPhone ?? null,
      guardian_email: student?.guardian_email ?? student?.guardianEmail ?? null,
      regent_teacher: student?.regent_teacher ?? student?.regentTeacher ?? null,
      aee_teacher:    student?.aee_teacher    ?? student?.aeeTeacher    ?? null,
    };
    for (const [k, v] of Object.entries(extraToData)) {
      if (v != null) mergedData[k] = v;
    }

    // 2. dbPayload: somente colunas reais
    const dbPayload: Record<string, any> = {
      tenant_id:      tenantId,
      full_name:      student?.full_name      ?? student?.name         ?? null,
      birth_date:     student?.birth_date     ?? student?.birthDate    ?? null,
      guardian_name:  student?.guardian_name  ?? student?.guardianName ?? null,
      diagnosis:      student?.diagnosis      ?? null,
      support_level:  student?.support_level  ?? student?.supportLevel ?? null,
      photo_url:      student?.photo_url      ?? student?.photoUrl     ?? null,
      school_history: student?.school_history ?? student?.schoolHistory ?? student?.history ?? '',
      tags:           student?.tags           ?? null,
      notes:          student?.notes          ?? null,
      data:           mergedData,
    };

    // Inclui `id` apenas se presente (upsert vs insert)
    if (student?.id) dbPayload.id = student.id;

    // 3. Upsert em loop: se o ambiente tiver colunas inesperadas com nome diferente,
    //    move cada coluna inválida para `data` até o upsert ter sucesso.
    const upsertWithFallback = async (p: Record<string, any>): Promise<any> => {
      for (let attempt = 0; attempt < 15; attempt++) {
        const { data, error } = await supabase.from('students').upsert(p).select().single();
        if (!error) return data;
        const m = String(error?.message ?? '').match(/Could not find the '(.+?)' column/i);
        if (m?.[1]) {
          const badCol = m[1];
          p = { ...p, data: { ...(p.data ?? {}), [badCol]: p[badCol] ?? null } };
          delete (p as any)[badCol];
          continue;
        }
        throw error;
      }
      // última tentativa — deixa o erro propagar
      const { data, error } = await supabase.from('students').upsert(p).select().single();
      if (error) throw error;
      return data;
    };

    return await upsertWithFallback(dbPayload);
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
    return (data ?? []) as any;
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
    const payload: any = {
      ...doc,
      tenant_id: tenantId,
      student_id: doc.studentId ?? doc.student_id,
      student_name: doc.studentName ?? doc.student_name,
      type: (doc.type ?? doc.documentType ?? '').toString().toUpperCase(),
      status: (doc.status ?? 'DRAFT').toString().toUpperCase(),
      source_id: doc.source_id ?? doc.sourceId ?? null,
      structured_data: doc.structuredData ?? doc.structured_data ?? { sections: [] },
      versions: doc.versions ?? [],
      signatures: doc.signatures ?? {},
      audit_code: doc.auditCode ?? doc.audit_code ?? null,
      last_edited_at: new Date().toISOString(),
      last_edited_by: doc.lastEditedBy ?? doc.last_edited_by ?? null,
      generated_by: doc.generatedBy ?? doc.generated_by ?? null,
    };

    delete payload.studentId;
    delete payload.studentName;
    delete payload.documentType;
    delete payload.structuredData;
    delete payload.auditCode;
    delete payload.lastEditedBy;
    delete payload.generatedBy;
    delete payload.sourceId;
    delete payload.userId;

    const q = payload.id ? supabase.from('documents').upsert(payload) : supabase.from('documents').insert(payload);
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
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const rows = data ?? [];
    return rows.map((r: any) => {
      const proto: Protocol = {
        id: r.id,
        tenant_id: r.tenant_id,
        studentId: r.student_id,
        studentName: r.student_name ?? '',
        type: mapDocTypeToUi(r.type),
        status: mapDocStatus(r.status) as any,
        source_id: r.source_id ?? null,
        content: r.content ?? '',
        isStructured: true,
        structuredData: r.structured_data ?? { sections: [] },
        versions: r.versions ?? [],
        lastEditedAt: r.last_edited_at ?? r.updated_at ?? r.created_at,
        lastEditedBy: r.last_edited_by ?? r.generated_by ?? '',
        createdAt: r.created_at,
        generatedBy: r.generated_by ?? '',
        auditCode: r.audit_code ?? '',
        signatures: r.signatures ?? { regent: '', coordinator: '', aee: '', manager: '' },
      };
      return proto;
    });
  },

  // =========================
  // BILLING / LIMITS
  // =========================
  async getTenantSummary(userId: string): Promise<TenantSummary> {
    const tenantId = await getTenantIdForUser(userId);

    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .select('id, name, type, status_assinatura, creditos_ia_restantes, data_renovacao_plano')
      .eq('id', tenantId)
      .single();
    if (tErr) throw tErr;

    const { count: studentsCount, error: sErr } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);
    if (sErr) throw sErr;

    const sub = await getActiveSubscriptionForTenant(tenantId);
    const planTier = resolvePlanTier((sub as any)?.plan ?? 'FREE');
    const subscriptionStatus = ((sub as any)?.status ?? (tenant as any)?.status_assinatura ?? 'ACTIVE') as any;

    // Plano efetivo (limites/recursos) vem do banco
    const planEff = await getPlanEffectiveByName(String(planTier));

    // Créditos: preferir carteira; fallback em coluna legado do tenant.
    const walletAvail = await tryGetCreditsWalletBalance(tenantId);
    const aiCreditsRemaining = walletAvail ?? (tenant as any)?.creditos_ia_restantes ?? 0;

    return {
      tenantId,
      tenantName: (tenant as any)?.name,
      subscriptionStatus,
      planTier,
      aiCreditsRemaining,
      studentLimitBase: (planEff as any)?.max_students ?? 0,
      studentLimitExtra: 0 as any,
      studentsActive: studentsCount ?? 0,
      renewalDatePlan: (tenant as any)?.data_renovacao_plano ?? undefined,
      renewalDateCredits: (sub as any)?.next_billing ?? undefined,
    };
  },

  // =========================
  // PRICING / LANDING (CEO)
  // =========================
  async getEffectivePlans(): Promise<any[]> {
    const { data, error } = await supabase
      .from('v_plans_effective')
      .select('*')
      .order('display_order', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async updatePlan(name: 'FREE' | 'PRO' | 'MASTER', patch: Partial<any>): Promise<void> {
    const normalized = String(name).toUpperCase();
    const allowed = [
      'monthly_price',
      'annual_price',
      'promo_monthly_price',
      'promo_annual_price',
      'promo_active',
      'promo_ends_at',
      'max_students',
      'monthly_credits',
      'includes_evolution',
      'is_recommended',
      'display_order',
      'tagline',
      'features',
    ] as const;

    const safe: Record<string, any> = {};
    for (const k of allowed) if (k in patch) safe[k] = (patch as any)[k];

    const { error } = await supabase.from('plans').update(safe).eq('name', normalized);
    if (error) throw error;
  },

  async getLandingSettings(): Promise<any | null> {
    return await getLandingSingleton();
  },

  async updateLandingSettings(patch: Partial<any>): Promise<void> {
    const allowed = [
      'hero_title',
      'hero_subtitle',
      'promo_banner_enabled',
      'promo_banner_text',
      'promo_badge_text',
      'promo_disclaimer',
      'faq',
      'credits_faq_text',
      'credits_rules',
      'recommended_plan',
      'updated_at',
    ] as const;

    const safe: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (k in patch) safe[k] = (patch as any)[k];

    const { error } = await supabase
      .from('landing_settings')
      .update(safe)
      .eq('singleton_key', 'default');
    if (error) throw error;
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
      // Tenta credits_wallet primeiro
      const { data: wallet } = await supabase
        .from('credits_wallet')
        .select('credits_avail, balance')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (wallet) {
        const avail = Number((wallet as any)?.credits_avail ?? (wallet as any)?.balance ?? 0);
        const next = Math.max(0, avail - cost);
        const patch: any = {};
        if ((wallet as any)?.credits_avail !== undefined) patch.credits_avail = next;
        else patch.balance = next;
        await supabase.from('credits_wallet').update(patch).eq('tenant_id', tenantId);
      } else {
        // Fallback: debitar de tenants.creditos_ia_restantes
        const { data: t } = await supabase.from('tenants').select('creditos_ia_restantes').eq('id', tenantId).maybeSingle();
        const current = Number((t as any)?.creditos_ia_restantes ?? 0);
        await supabase.from('tenants').update({ creditos_ia_restantes: Math.max(0, current - cost) }).eq('id', tenantId);
      }

      // Registrar uso (silencioso se tabela não existir)
      try {
        await supabase.from('credit_usage').insert({
          tenant_id: tenantId,
          user_id:   userId,
          action,
          cost,
          created_at: new Date().toISOString(),
        });
      } catch {}
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