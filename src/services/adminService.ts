/**
 * adminService.ts
 * Operações administrativas do painel CEO — conecta ao Supabase.
 * Mantém fallback com mock para ambiente demo/desenvolvimento.
 */

import { supabase } from './supabase';
import { DEMO_MODE } from './supabase';
import type {
  AdminRole,
  AdminUser,
  AdminLog,
  SiteConfig,
  PlanTier,
  Subscriber,
  CeoSubscriberRow,
  CeoFinancialKpis,
  Plan,
  UserActivityLog,
  AlertConfig,
  TestAccountDetail,
} from '../types';
import { BillingPlansService, SubscriptionService } from './billingService';
import { SUBSCRIPTION_PLANS } from '../config/aiCosts';
import { AdminGrantService } from './creditService';
import { LandingService } from './landingService';

// ---------------------------------------------------------------------------
// MOCK DATA (usado em DEMO_MODE ou quando Supabase não está configurado)
// ---------------------------------------------------------------------------

let MOCK_SITE_CONFIG: SiteConfig = {
  headline: 'Plataforma Estruturada para Documentação Educacional com Inteligência Artificial',
  subheadline: 'Padronização, segurança jurídica e eficiência para escolas e clínicas.',
  pricing: {
    pro_monthly: 99.00,
    pro_annual: 78.00,
    master_monthly: 147.00,
    master_annual: 118.00,
    extra_student: 14.90,
    extra_credits_10: 19.90,
  },
  contactPhone: '(11) 99999-9999',
  heroImage: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
};

const MOCK_ADMINS: AdminUser[] = [
  { id: 'a1', name: 'CEO Founder', email: 'ceo@incluiai.com', role: 'super_admin', active: true, createdAt: new Date().toISOString() },
  { id: 'a2', name: 'Financeiro Director', email: 'fin@incluiai.com', role: 'financeiro', active: true, createdAt: new Date().toISOString() },
  { id: 'a3', name: 'Suporte Ops', email: 'ops@incluiai.com', role: 'operacional', active: true, createdAt: new Date().toISOString() },
];

let MOCK_LOGS: AdminLog[] = [
  { id: 'l1', adminName: 'CEO Founder', action: 'SITE_UPDATE', target: 'Landing Page', details: 'Alterou headline principal', timestamp: new Date().toISOString() },
  { id: 'l2', adminName: 'Suporte Ops', action: 'GRANT_CREDITS', target: 'Escola Modelo', details: 'Liberou 50 créditos (Bonificação)', timestamp: new Date(Date.now() - 86400000).toISOString() },
];

const MOCK_SUBSCRIBERS: Subscriber[] = [
  { id: 'u1', tenant_id: 't1', name: 'Maria Silva', email: 'maria@prof.com', phone: '(11) 99999-1111', plan: 'PRO' as PlanTier, cycle: 'MENSAL', status: 'ACTIVE', creditsUsed: 15, creditsLimit: SUBSCRIPTION_PLANS.PRO.credits, studentsActive: 12, studentsLimit: SUBSCRIPTION_PLANS.PRO.students, nextBilling: '2024-06-15' },
  { id: 'u2', tenant_id: 't2', name: 'Clínica Aprender', email: 'contato@aprender.com', phone: '(21) 98888-2222', plan: 'MASTER' as PlanTier, cycle: 'ANUAL', status: 'ACTIVE', creditsUsed: 45, creditsLimit: SUBSCRIPTION_PLANS.MASTER.credits, studentsActive: 38, studentsLimit: SUBSCRIPTION_PLANS.MASTER.students, nextBilling: '2025-01-10' },
  { id: 'u3', tenant_id: 't3', name: 'João Teacher', email: 'joao@school.com', plan: 'FREE' as PlanTier, cycle: 'MENSAL', status: 'ACTIVE', creditsUsed: 0, creditsLimit: SUBSCRIPTION_PLANS.FREE.credits, studentsActive: 1, studentsLimit: SUBSCRIPTION_PLANS.FREE.students, nextBilling: '-' },
  { id: 'u4', tenant_id: 't4', name: 'Escola Futuro', email: 'dir@futuro.edu', plan: 'MASTER' as PlanTier, cycle: 'MENSAL', status: 'OVERDUE', creditsUsed: 55, creditsLimit: SUBSCRIPTION_PLANS.MASTER.credits, studentsActive: 40, studentsLimit: SUBSCRIPTION_PLANS.MASTER.students, nextBilling: '2024-05-20' },
];

// ---------------------------------------------------------------------------
// SERVIÇO PRINCIPAL
// ---------------------------------------------------------------------------

export const AdminService = {
  // ── SITE CONFIG ──────────────────────────────────────────────────────────

  async getSiteConfig(): Promise<SiteConfig> {
    if (DEMO_MODE) return MOCK_SITE_CONFIG;
    try {
      const sections = await LandingService.getAll();
      const hero = sections.find(s => s.section_key === 'hero');
      const pricing = sections.find(s => s.section_key === 'pricing');
      return {
        headline: hero?.title ?? MOCK_SITE_CONFIG.headline,
        subheadline: hero?.subtitle ?? MOCK_SITE_CONFIG.subheadline,
        pricing: {
          pro_monthly: pricing?.content_json?.pro_monthly ?? 99,
          pro_annual: pricing?.content_json?.pro_annual ?? 78,
          master_monthly: pricing?.content_json?.master_monthly ?? 147,
          master_annual: pricing?.content_json?.master_annual ?? 118,
          extra_student: pricing?.content_json?.extra_student ?? 14.90,
          extra_credits_10: pricing?.content_json?.extra_credits_10 ?? 19.90,
        },
        contactPhone: hero?.content_json?.phone ?? MOCK_SITE_CONFIG.contactPhone,
        heroImage: hero?.content_json?.hero_image ?? MOCK_SITE_CONFIG.heroImage,
      };
    } catch {
      return MOCK_SITE_CONFIG;
    }
  },

  async updateSiteConfig(newConfig: SiteConfig, adminUser: AdminUser): Promise<void> {
    if (adminUser.role !== 'super_admin' && adminUser.role !== 'operacional') {
      throw new Error('Permissão negada');
    }
    MOCK_SITE_CONFIG = newConfig; // mantém mock sincronizado

    if (!DEMO_MODE) {
      await LandingService.upsert({
        sectionKey: 'hero',
        title: newConfig.headline,
        subtitle: newConfig.subheadline,
        contentJson: {
          phone: newConfig.contactPhone,
          hero_image: newConfig.heroImage,
          cta_primary: 'Começar Grátis',
          cta_secondary: 'Ver Planos',
        },
        updatedByName: adminUser.name,
      });
      await LandingService.upsert({
        sectionKey: 'pricing',
        title: 'Planos e Preços',
        contentJson: { ...newConfig.pricing },
        updatedByName: adminUser.name,
      });
    }

    AdminService.logAction(adminUser, 'SITE_UPDATE', 'Landing Page', 'Atualizou configurações do site');
  },

  // ── SUBSCRIBERS ───────────────────────────────────────────────────────────

  async getSubscribers(): Promise<Subscriber[]> {
    if (DEMO_MODE) return MOCK_SUBSCRIBERS;
    try {
      const { data, error } = await supabase
        .from('v_ceo_subscribers')
        .select('*')
        .limit(200);
      if (error) throw error;
      return (data ?? []).map(mapToSubscriber);
    } catch {
      return MOCK_SUBSCRIBERS;
    }
  },

  async getCeoSubscriberRows(): Promise<CeoSubscriberRow[]> {
    const { data, error } = await supabase
      .from('v_ceo_subscribers')
      .select('*')
      .limit(200);
    if (error) throw error;
    return data ?? [];
  },

  async updateSubscriberPlan(tenantId: string, newPlanCode: string, adminUser: AdminUser): Promise<void> {
    if (adminUser.role === 'viewer') throw new Error('Apenas visualização');
    if (!DEMO_MODE) {
      await SubscriptionService.changePlan(tenantId, newPlanCode);
      await AdminGrantService.logGrant({
        tenantId,
        grantType: 'plan_override',
        value: newPlanCode,
        reason: `Alteração manual pelo admin ${adminUser.name}`,
        grantedByName: adminUser.name,
      });
    } else {
      const sub = MOCK_SUBSCRIBERS.find(s => s.tenant_id === tenantId);
      if (sub) sub.plan = newPlanCode as PlanTier;
    }
    AdminService.logAction(adminUser, 'UPDATE_PLAN', tenantId, `Alterou plano para ${newPlanCode}`);
  },

  async suspendSubscriber(tenantId: string, adminUser: AdminUser): Promise<void> {
    if (!['super_admin', 'operacional'].includes(adminUser.role)) throw new Error('Permissão negada');
    if (!DEMO_MODE) {
      await SubscriptionService.updateStatus(tenantId, 'CANCELED', `Suspenso por ${adminUser.name}`);
      await AdminGrantService.logGrant({
        tenantId,
        grantType: 'suspension',
        value: 'CANCELED',
        reason: `Suspensão manual por ${adminUser.name}`,
        grantedByName: adminUser.name,
      });
    }
    AdminService.logAction(adminUser, 'SUSPEND', tenantId, `Suspendeu assinatura`);
  },

  async reactivateSubscriber(tenantId: string, adminUser: AdminUser): Promise<void> {
    if (!['super_admin', 'operacional'].includes(adminUser.role)) throw new Error('Permissão negada');
    if (!DEMO_MODE) {
      await SubscriptionService.updateStatus(tenantId, 'ACTIVE', `Reativado por ${adminUser.name}`);
      await AdminGrantService.logGrant({
        tenantId,
        grantType: 'reactivation',
        value: 'ACTIVE',
        reason: `Reativação manual por ${adminUser.name}`,
        grantedByName: adminUser.name,
      });
    }
    AdminService.logAction(adminUser, 'REACTIVATE', tenantId, `Reativou assinatura`);
  },

  async grantCourtesy(tenantId: string, reason: string, adminUser: AdminUser): Promise<void> {
    if (!['super_admin', 'operacional'].includes(adminUser.role)) throw new Error('Permissão negada');
    if (!DEMO_MODE) {
      await SubscriptionService.updateStatus(tenantId, 'COURTESY', reason);
      await AdminGrantService.logGrant({
        tenantId,
        grantType: 'courtesy',
        value: 'COURTESY',
        reason,
        grantedByName: adminUser.name,
      });
    }
    AdminService.logAction(adminUser, 'GRANT_COURTESY', tenantId, `Concedeu cortesia: ${reason}`);
  },

  // ── CRÉDITOS ─────────────────────────────────────────────────────────────

  async grantCredits(tenantId: string, amount: number, reason: string, adminUser: AdminUser): Promise<void> {
    if (['viewer'].includes(adminUser.role)) throw new Error('Permissão negada');
    if (!DEMO_MODE) {
      await AdminGrantService.grantCredits({
        tenantId,
        amount,
        reason,
        grantedByName: adminUser.name,
      });
    }
    AdminService.logAction(adminUser, 'GRANT_CREDITS', tenantId, `${amount > 0 ? 'Liberou' : 'Estornou'} ${Math.abs(amount)} créditos. Motivo: ${reason}`);
  },

  // ── PLANOS ────────────────────────────────────────────────────────────────

  async getPlans(): Promise<Plan[]> {
    if (DEMO_MODE) {
      return [
        { id: '1', code: 'FREE', name: SUBSCRIPTION_PLANS.FREE.name, price_monthly: 0, price_yearly: 0, credits_monthly: SUBSCRIPTION_PLANS.FREE.credits, max_entities: SUBSCRIPTION_PLANS.FREE.students, features_json: [`${SUBSCRIPTION_PLANS.FREE.students} alunos`, 'Docs básicos'], is_active: true },
        { id: '2', code: 'PRO', name: SUBSCRIPTION_PLANS.PRO.name, price_monthly: 99, price_yearly: 78, credits_monthly: SUBSCRIPTION_PLANS.PRO.credits, max_entities: SUBSCRIPTION_PLANS.PRO.students, features_json: [`${SUBSCRIPTION_PLANS.PRO.students} alunos`, `${SUBSCRIPTION_PLANS.PRO.credits} créditos/mês`], is_active: true },
        { id: '3', code: 'MASTER', name: SUBSCRIPTION_PLANS.MASTER.name, price_monthly: 147, price_yearly: 118, credits_monthly: SUBSCRIPTION_PLANS.MASTER.credits, max_entities: SUBSCRIPTION_PLANS.MASTER.students, features_json: [`${SUBSCRIPTION_PLANS.MASTER.students} alunos`, `${SUBSCRIPTION_PLANS.MASTER.credits} créditos/mês`, 'Export Word'], is_active: true },
        { id: '4', code: 'INSTITUTIONAL', name: 'Institucional', price_monthly: 297, price_yearly: 247, credits_monthly: 9999, max_entities: 9999, features_json: ['Ilimitado'], is_active: true },
      ];
    }
    return BillingPlansService.getAll();
  },

  async upsertPlan(plan: Partial<Plan> & { code: string }, adminUser: AdminUser): Promise<Plan> {
    if (!['super_admin', 'financeiro'].includes(adminUser.role)) throw new Error('Permissão negada');
    const result = await BillingPlansService.upsert(plan);
    AdminService.logAction(adminUser, 'UPSERT_PLAN', plan.code, `Atualizou plano ${plan.code}`);
    return result;
  },

  async togglePlanActive(planId: string, active: boolean, adminUser: AdminUser): Promise<void> {
    if (!['super_admin', 'financeiro'].includes(adminUser.role)) throw new Error('Permissão negada');
    await BillingPlansService.setActive(planId, active);
    AdminService.logAction(adminUser, active ? 'ACTIVATE_PLAN' : 'DEACTIVATE_PLAN', planId, '');
  },

  // ── CONTAS DE TESTE ───────────────────────────────────────────────────────

  async createTestAccount(params: {
    tenantId: string;
    planCode: string;
    reason: string;
    adminUser: AdminUser;
  }): Promise<void> {
    if (!['super_admin', 'operacional'].includes(params.adminUser.role)) throw new Error('Permissão negada');
    if (!DEMO_MODE) {
      await SubscriptionService.createTestAccount({
        tenantId: params.tenantId,
        planCode: params.planCode,
        reason: params.reason,
        grantedByName: params.adminUser.name,
      });
    }
    AdminService.logAction(params.adminUser, 'CREATE_TEST_ACCOUNT', params.tenantId, `Criou conta de teste ${params.planCode}: ${params.reason}`);
  },

  // ── ADMINS (RBAC) ─────────────────────────────────────────────────────────

  async getAdmins(): Promise<AdminUser[]> {
    if (DEMO_MODE) return MOCK_ADMINS;
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapAdminUser);
    } catch {
      return MOCK_ADMINS;
    }
  },

  async createAdmin(newAdmin: Omit<AdminUser, 'id' | 'createdAt'>, actor: AdminUser): Promise<void> {
    if (actor.role !== 'super_admin') throw new Error('Apenas Super Admin pode criar administradores');
    if (!DEMO_MODE) {
      const { error } = await supabase.from('admin_users').insert({
        name: newAdmin.name,
        email: newAdmin.email,
        role: newAdmin.role,
        active: newAdmin.active ?? true,
      });
      if (error) throw error;
    } else {
      MOCK_ADMINS.push({ ...newAdmin, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    }
    AdminService.logAction(actor, 'CREATE_ADMIN', newAdmin.email, `Criou admin com role ${newAdmin.role}`);
  },

  async updateAdminRole(targetId: string, newRole: AdminRole, actor: AdminUser): Promise<void> {
    if (actor.role !== 'super_admin') throw new Error('Permissão negada');
    if (!DEMO_MODE) {
      const { error } = await supabase.from('admin_users').update({ role: newRole }).eq('id', targetId);
      if (error) throw error;
    } else {
      const adm = MOCK_ADMINS.find(a => a.id === targetId);
      if (adm) adm.role = newRole;
    }
    AdminService.logAction(actor, 'UPDATE_ADMIN_ROLE', targetId, `Alterou role para ${newRole}`);
  },

  async toggleAdminActive(targetId: string, active: boolean, actor: AdminUser): Promise<void> {
    if (actor.role !== 'super_admin') throw new Error('Permissão negada');
    if (!DEMO_MODE) {
      const { error } = await supabase.from('admin_users').update({ active }).eq('id', targetId);
      if (error) throw error;
    }
    AdminService.logAction(actor, active ? 'ACTIVATE_ADMIN' : 'DEACTIVATE_ADMIN', targetId, '');
  },

  // ── LOGS ─────────────────────────────────────────────────────────────────

  async getLogs(): Promise<AdminLog[]> {
    if (DEMO_MODE) {
      return MOCK_LOGS.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        // entity_type é a coluna real — NÃO existe coluna "type" nesta tabela
        .select('id, user_name, action, entity_type, entity_id, details, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).map(mapAuditLog);
    } catch {
      return MOCK_LOGS.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
  },

  logAction(admin: AdminUser, action: string, target: string, details: string) {
    // 1. Sempre persiste em memória para feedback imediato na UI
    MOCK_LOGS.unshift({
      id: crypto.randomUUID(),
      adminName: admin.name,
      action,
      target,
      details,
      timestamp: new Date().toISOString(),
    });
    if (MOCK_LOGS.length > 500) MOCK_LOGS = MOCK_LOGS.slice(0, 500);

    // 2. Persiste no banco em produção usando entity_type (coluna real da tabela audit_logs)
    if (!DEMO_MODE) {
      supabase.from('audit_logs').insert({
        user_name:   admin.name,
        action,
        entity_type: target,   // ← coluna correta; NÃO usar "type" — não existe na tabela
        details:     { message: details },
      }).then(({ error }) => {
        if (error) console.warn('[AdminService.logAction] erro ao persistir audit_log:', error.message);
      });
    }
  },

  // ── KPIs FINANCEIROS ──────────────────────────────────────────────────────

  async getFinancialStats(): Promise<CeoFinancialKpis & { arr: number; extraRevenue: number; aiCosts: number }> {
    if (DEMO_MODE) {
      return { mrr_estimated: 15400, arr: 184800, active_subscribers: 142, overdue_subscribers: 8, trial_subscribers: 12, canceled_subscribers: 4, total_tenants: 166, extraRevenue: 4500, aiCosts: 1200 };
    }
    try {
      const { data, error } = await supabase.from('v_ceo_financial_kpis').select('*').single();
      if (error) throw error;
      const mrr = Number(data?.mrr_estimated ?? 0);
      return {
        mrr_estimated: mrr,
        arr: mrr * 12,
        active_subscribers: Number(data?.active_subscribers ?? 0),
        overdue_subscribers: Number(data?.overdue_subscribers ?? 0),
        trial_subscribers: Number(data?.trial_subscribers ?? 0),
        canceled_subscribers: Number(data?.canceled_subscribers ?? 0),
        total_tenants: Number(data?.total_tenants ?? 0),
        extraRevenue: 0,
        aiCosts: 0,
      };
    } catch {
      return { mrr_estimated: 0, arr: 0, active_subscribers: 0, overdue_subscribers: 0, trial_subscribers: 0, canceled_subscribers: 0, total_tenants: 0, extraRevenue: 0, aiCosts: 0 };
    }
  },

  // ── ADMIN POR E-MAIL ──────────────────────────────────────────────────────

  /**
   * Carrega o AdminUser a partir do e-mail do usuário autenticado.
   * Usado pelo AdminDashboard para evitar depender do mock CURRENT_ADMIN_MOCK.
   * Retorna null se o usuário não estiver na tabela admin_users.
   */
  async getAdminByEmail(email: string): Promise<AdminUser | null> {
    if (DEMO_MODE) {
      return MOCK_ADMINS.find(a => a.email === email) ?? MOCK_ADMINS[0] ?? null;
    }
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', email)
        .eq('active', true)
        .maybeSingle();
      if (error) throw error;
      return data ? mapAdminUser(data) : null;
    } catch {
      return null;
    }
  },

  // ── LANDING CONTENT ───────────────────────────────────────────────────────
  getLandingSections: LandingService.getAll.bind(LandingService),
  saveLandingSections: LandingService.saveAll.bind(LandingService),
  saveLandingSection: LandingService.upsert.bind(LandingService),

  // ── CONTAS DE TESTE (criação do zero) ─────────────────────────────────────

  async createTestAccountFromScratch(params: {
    accountName: string;
    responsibleName: string;
    email: string;
    password?: string;
    planCode: string;
    initialCredits: number;
    expiresAt: string;
    observation: string;
    adminUser: AdminUser;
  }): Promise<{ tenantId: string; success: boolean; message: string }> {
    if (!['super_admin', 'operacional'].includes(params.adminUser.role)) {
      throw new Error('Permissão negada');
    }

    if (DEMO_MODE) {
      const mockId = crypto.randomUUID();
      AdminService.logAction(
        params.adminUser,
        'CREATE_TEST_ACCOUNT',
        params.email,
        `Conta de teste criada: ${params.accountName} (${params.planCode}) — DEMO`,
      );
      return {
        tenantId: mockId,
        success: true,
        message: `[DEMO] Conta de teste "${params.accountName}" criada com sucesso.`,
      };
    }

    // Adiciona a criação do usuário de autenticação com senha.
    if (params.password) {
      const { error: authError } = await supabase.auth.admin.createUser({
        email: params.email,
        password: params.password,
        email_confirm: true, // Auto-confirma o e-mail para facilitar o teste
      });

      if (authError) {
        // Se o usuário já existe, retorna um erro claro.
        if (authError.message.includes('already registered')) {
          throw new Error(`O e-mail ${params.email} já está em uso. Use outro e-mail.`);
        }
        throw authError;
      }
    }

    const { data, error } = await supabase.rpc('ceo_create_test_account_db', {
      p_account_name:     params.accountName,
      p_responsible_name: params.responsibleName,
      p_email:            params.email,
      p_plan_code:        params.planCode,
      p_initial_credits:  params.initialCredits,
      p_expires_at:       params.expiresAt || null,
      p_observation:      params.observation,
      p_created_by_name:  params.adminUser.name,
    });

    if (error) throw error;

    const result = data as { success: boolean; tenant_id?: string; error?: string; message?: string };

    if (!result.success) throw new Error(result.error ?? 'Erro ao criar conta de teste');

    // Altera a mensagem de sucesso se a senha foi criada.
    if (result.success && params.password) {
      return {
        tenantId: result.tenant_id ?? '',
        success: true,
        message: `Conta de teste "${params.accountName}" criada com sucesso. O usuário pode logar com a senha definida.`,
      };
    }

    AdminService.logAction(
      params.adminUser,
      'CREATE_TEST_ACCOUNT',
      params.email,
      `Conta de teste criada: ${params.accountName} (${params.planCode}) — tenant: ${result.tenant_id}`,
    );

    return {
      tenantId: result.tenant_id ?? '',
      success: true,
      message: result.message ?? 'Conta criada. Configure o login via Supabase Dashboard.',
    };
  },

  async getTestAccountDetails(): Promise<TestAccountDetail[]> {
    if (DEMO_MODE) {
      return [
        {
          tenant_id: 'demo-t1',
          account_name: 'Demo Escola A',
          responsible_name: 'Ana Souza',
          email: 'ana@escola.com',
          plan_code: 'PRO',
          initial_credits: 200,
          credits_remaining: 145,
          expires_at: new Date(Date.now() + 15 * 86400000).toISOString(),
          observation: 'Demo para parceiro',
          status: 'active',
          subscription_status: 'INTERNAL_TEST',
          created_by_name: 'CEO Founder',
          created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
        },
      ];
    }
    try {
      const { data, error } = await supabase.rpc('ceo_get_test_accounts');
      if (error) throw error;
      return (data ?? []) as TestAccountDetail[];
    } catch {
      return [];
    }
  },

  async updateTestAccountStatus(tenantId: string, status: 'active' | 'suspended' | 'expired', adminUser: AdminUser): Promise<void> {
    if (!['super_admin', 'operacional'].includes(adminUser.role)) throw new Error('Permissão negada');
    if (!DEMO_MODE) {
      await supabase.from('test_account_details').update({ status, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId);
      if (status === 'suspended') {
        await SubscriptionService.updateStatus(tenantId, 'CANCELED', `Suspensão de conta de teste por ${adminUser.name}`);
      }
    }
    AdminService.logAction(adminUser, 'UPDATE_TEST_ACCOUNT', tenantId, `Status → ${status}`);
  },

  async extendTestAccount(tenantId: string, newExpiresAt: string, adminUser: AdminUser): Promise<void> {
    if (!['super_admin', 'operacional'].includes(adminUser.role)) throw new Error('Permissão negada');
    if (!DEMO_MODE) {
      await supabase.from('test_account_details').update({ expires_at: newExpiresAt, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId);
      await supabase.from('subscriptions').update({ current_period_end: newExpiresAt }).eq('tenant_id', tenantId);
    }
    AdminService.logAction(adminUser, 'EXTEND_TEST_ACCOUNT', tenantId, `Prorrogado até ${new Date(newExpiresAt).toLocaleDateString('pt-BR')}`);
  },

  // ── LOGS DOS USUÁRIOS ─────────────────────────────────────────────────────

  async getUserActivityLogs(params?: {
    days?: number;
    tenantId?: string;
    action?: string;
    limit?: number;
  }): Promise<UserActivityLog[]> {
    const limit = params?.limit ?? 200;

    if (DEMO_MODE) {
      const mockActions = ['LOGIN', 'AI_REQUEST', 'DOCUMENT_GENERATED', 'CREDIT_CONSUMED', 'STUDENT_CREATED', 'PROTOCOL_GENERATED', 'ACTIVITY_GENERATED'];
      const mockUsers = [
        { email: 'maria@prof.com', name: 'Maria Silva', tenant_id: 't1' },
        { email: 'contato@aprender.com', name: 'Clínica Aprender', tenant_id: 't2' },
        { email: 'joao@school.com', name: 'João Teacher', tenant_id: 't3' },
      ];
      return Array.from({ length: 30 }, (_, i) => {
        const u = mockUsers[i % mockUsers.length];
        const action = mockActions[i % mockActions.length];
        return {
          id: `log-${i}`,
          tenant_id: u.tenant_id,
          user_email: u.email,
          user_name: u.name,
          action,
          resource_type: action === 'DOCUMENT_GENERATED' ? 'document' : action === 'AI_REQUEST' ? 'ai' : undefined,
          details: { source: 'demo' },
          created_at: new Date(Date.now() - i * 3600000 * 2).toISOString(),
        };
      });
    }

    try {
      const since = params?.days
        ? new Date(Date.now() - params.days * 86400000).toISOString()
        : undefined;

      // ai_requests → ações de IA
      let aiQuery = supabase
        .from('ai_requests')
        .select('id, tenant_id, user_id, request_type, model, credits_consumed, status, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (since) aiQuery = aiQuery.gte('created_at', since);
      if (params?.tenantId) aiQuery = aiQuery.eq('tenant_id', params.tenantId);

      // credits_ledger → operações manuais de crédito (não-IA)
      let ledgerQuery = supabase
        .from('credits_ledger')
        .select('id, tenant_id, user_id, type, amount, description, created_at')
        .neq('type', 'usage_ai')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (since) ledgerQuery = ledgerQuery.gte('created_at', since);
      if (params?.tenantId) ledgerQuery = ledgerQuery.eq('tenant_id', params.tenantId);

      const [aiRes, ledgerRes] = await Promise.all([aiQuery, ledgerQuery]);

      const LEDGER_ACTION: Record<string, string> = {
        bonus_manual: 'CREDIT_GRANTED',   bonus: 'CREDIT_GRANTED',
        courtesy:     'CREDIT_GRANTED',   purchase_extra: 'CREDIT_PURCHASED',
        purchase:     'CREDIT_PURCHASED', monthly_grant: 'CREDIT_MONTHLY',
        renewal:      'CREDIT_MONTHLY',   adjustment: 'CREDIT_ADJUSTED',
        refund:       'CREDIT_ADJUSTED',
      };

      const aiLogs: UserActivityLog[] = (aiRes.data ?? []).map((r: any) => ({
        id:            r.id,
        tenant_id:     r.tenant_id,
        user_id:       r.user_id,
        action:        'AI_REQUEST',
        resource_type: r.request_type ?? r.model ?? 'ai',
        details:       { request_type: r.request_type, model: r.model, credits: r.credits_consumed, status: r.status },
        created_at:    r.created_at,
      }));

      const ledgerLogs: UserActivityLog[] = (ledgerRes.data ?? []).map((r: any) => ({
        id:            r.id,
        tenant_id:     r.tenant_id,
        user_id:       r.user_id,
        action:        LEDGER_ACTION[r.type] ?? r.type.toUpperCase(),
        resource_type: 'credits',
        details:       { type: r.type, amount: r.amount, description: r.description },
        created_at:    r.created_at,
      }));

      const combined = [...aiLogs, ...ledgerLogs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, limit);

      if (params?.action) return combined.filter(l => l.action === params.action);
      return combined;
    } catch {
      return [];
    }
  },

  // ── ALERTAS ───────────────────────────────────────────────────────────────

  async getAlertConfigs(): Promise<AlertConfig[]> {
    if (DEMO_MODE) {
      return [
        { id: 'ac1', alert_key: 'low_credits_20', alert_type: 'low_credits', threshold: 20, title: 'Seus créditos estão acabando', message: 'Você tem menos de {credits} créditos restantes. Adquira um pacote agora.', is_active: true, updated_at: new Date().toISOString() },
        { id: 'ac2', alert_key: 'low_credits_10', alert_type: 'low_credits', threshold: 10, title: 'Créditos críticos — ação necessária', message: 'Atenção! Você tem apenas {credits} créditos. Renove agora.', is_active: true, updated_at: new Date().toISOString() },
        { id: 'ac3', alert_key: 'plan_expired',   alert_type: 'plan_expired', title: 'Seu plano venceu', message: 'Seu plano venceu em {date}. Renove agora para continuar acessando o IncluiAI.', is_active: true, updated_at: new Date().toISOString() },
        { id: 'ac4', alert_key: 'plan_expiring_7d', alert_type: 'plan_expiring', days_before: 7, title: 'Seu plano vence em breve', message: 'Seu plano vence em {days} dias ({date}). Renove agora para garantir continuidade.', is_active: true, updated_at: new Date().toISOString() },
      ];
    }
    try {
      const { data, error } = await supabase.from('alert_configs').select('*').order('alert_type');
      if (error) throw error;
      return (data ?? []) as AlertConfig[];
    } catch {
      return [];
    }
  },

  async saveAlertConfig(config: AlertConfig, adminUser: AdminUser): Promise<void> {
    if (!['super_admin', 'operacional'].includes(adminUser.role)) throw new Error('Permissão negada');
    if (!DEMO_MODE) {
      const { error } = await supabase
        .from('alert_configs')
        .upsert({
          id:              config.id,
          alert_key:       config.alert_key,
          alert_type:      config.alert_type,
          threshold:       config.threshold,
          days_before:     config.days_before,
          title:           config.title,
          message:         config.message,
          is_active:       config.is_active,
          updated_by_name: adminUser.name,
          updated_at:      new Date().toISOString(),
        }, { onConflict: 'alert_key' });
      if (error) throw error;
    }
    AdminService.logAction(adminUser, 'UPDATE_ALERT_CONFIG', config.alert_key, `Alerta "${config.title}" — ${config.is_active ? 'ativo' : 'inativo'}`);
  },

  async getLowCreditUsers(threshold: number = 20): Promise<Subscriber[]> {
    const all = await AdminService.getSubscribers();
    return all.filter(s => {
      const remaining = s.creditsLimit - s.creditsUsed;
      return s.status === 'ACTIVE' && remaining <= threshold && remaining >= 0;
    });
  },

  async getOverdueUsers(): Promise<Subscriber[]> {
    const all = await AdminService.getSubscribers();
    return all.filter(s => s.status === 'OVERDUE' || s.status === 'CANCELED');
  },

  async getExpiringSoonUsers(days: number = 7): Promise<Subscriber[]> {
    const all = await AdminService.getSubscribers();
    const now = new Date();
    const target = new Date();
    target.setDate(target.getDate() + days);
    return all.filter(s => {
      if (s.status !== 'ACTIVE' || !s.nextBilling || s.nextBilling === '—') return false;
      const parts = s.nextBilling.split('/');
      if (parts.length !== 3) return false;
      const billingDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      return billingDate >= now && billingDate <= target;
    });
  },

  async extendSubscription(tenantId: string, newDate: string, adminUser: AdminUser): Promise<void> {
    if (!['super_admin', 'operacional'].includes(adminUser.role)) throw new Error('Permissão negada');
    if (!DEMO_MODE) {
      const { error } = await supabase.from('subscriptions').update({ current_period_end: newDate, next_due_date: newDate, status: 'ACTIVE' }).eq('tenant_id', tenantId);
      if (error) throw error;
    }
    AdminService.logAction(adminUser, 'EXTEND_SUBSCRIPTION', tenantId, `Prorrogou vencimento para ${newDate}`);
  },

  async sendCustomAlert(tenantId: string, message: string, adminUser: AdminUser): Promise<void> {
    if (!['super_admin', 'operacional', 'suporte'].includes(adminUser.role)) throw new Error('Permissão negada');
    if (!DEMO_MODE) {
      const { error } = await supabase.from('tenant_alerts').insert({ tenant_id: tenantId, message, is_read: false, created_by: adminUser.name });
      if (error) throw error;
    }
    AdminService.logAction(adminUser, 'SEND_ALERT', tenantId, `Enviou alerta: "${message}"`);
  },
};

// ---------------------------------------------------------------------------
// MAPPERS
// ---------------------------------------------------------------------------

function mapToSubscriber(row: any): Subscriber {
  return {
    id: row.tenant_id,
    tenant_id: row.tenant_id,
    name: row.tenant_name ?? row.user_name ?? '—',
    email: row.user_email ?? '—',
    plan: (row.plan_code ?? 'FREE') as PlanTier,
    cycle: 'MENSAL',
    status: row.subscription_status ?? 'PENDING',
    creditsUsed: Math.max(0, Number(row.credits_limit ?? 0) - Number(row.credits_remaining ?? 0)),
    creditsLimit: Number(row.credits_limit ?? 0),
    studentsActive: Number(row.students_active ?? 0),
    studentsLimit: Number(row.student_limit ?? 5),
    nextBilling: row.next_due_date ? new Date(row.next_due_date).toLocaleDateString('pt-BR') : '—',
  };
}

function mapAdminUser(row: any): AdminUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as AdminRole,
    active: row.active ?? true,
    createdAt: row.created_at,
  };
}

/**
 * Mapeia linha de audit_logs → AdminLog (UI).
 * A tabela usa entity_type (não "type") — sempre ler deste campo.
 * Se a UI precisar de `log.type`, usar alias na query: entity_type as type.
 */
function mapAuditLog(row: any): AdminLog {
  return {
    id: row.id,
    adminName: row.user_name ?? '—',
    action: row.action ?? '—',
    // entity_type contém a categoria do alvo (ex: "subscription", "landing", tenant_id)
    target: row.entity_type ?? row.entity_id ?? '—',
    details: typeof row.details === 'object' && row.details !== null
      ? (row.details.message ?? JSON.stringify(row.details))
      : String(row.details ?? ''),
    timestamp: row.created_at,
  };
}
