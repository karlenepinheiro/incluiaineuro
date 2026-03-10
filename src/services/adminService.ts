
import { AdminRole, AdminUser, AdminLog, SiteConfig, PlanTier, Subscriber } from "../types";

// MOCK STORE (In production this connects to Supabase tables defined in schema.sql)
let MOCK_SITE_CONFIG: SiteConfig = {
    headline: "Plataforma Estruturada para Documentação Educacional com Inteligência Artificial",
    subheadline: "Padronização, segurança jurídica e eficiência para escolas e clínicas.",
    pricing: {
        pro_monthly: 99.00,
        pro_annual: 78.00,
        master_monthly: 147.00,
        master_annual: 118.00,
        extra_student: 14.90,
        extra_credits_10: 19.90
    },
    contactPhone: "(11) 99999-9999",
    heroImage: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80"
};

const MOCK_ADMINS: AdminUser[] = [
    { id: 'a1', name: 'CEO Founder', email: 'ceo@incluiai.com', role: 'super_admin', active: true, createdAt: new Date().toISOString() },
    { id: 'a2', name: 'Financeiro Director', email: 'fin@incluiai.com', role: 'financeiro', active: true, createdAt: new Date().toISOString() },
    { id: 'a3', name: 'Suporte Ops', email: 'ops@incluiai.com', role: 'operacional', active: true, createdAt: new Date().toISOString() },
];

const MOCK_LOGS: AdminLog[] = [
    { id: 'l1', adminName: 'CEO Founder', action: 'SITE_UPDATE', target: 'Landing Page', details: 'Alterou headline principal', timestamp: new Date().toISOString() },
    { id: 'l2', adminName: 'Suporte Ops', action: 'GRANT_CREDITS', target: 'Escola Modelo', details: 'Liberou 50 créditos (Bonificação)', timestamp: new Date(Date.now() - 86400000).toISOString() },
];

const MOCK_SUBSCRIBERS: Subscriber[] = [
    { id: 'u1', tenant_id: 't1', name: 'Maria Silva', email: 'maria@prof.com', phone: '(11) 99999-1111', plan: PlanTier.PRO, cycle: 'MENSAL', status: 'ACTIVE', creditsUsed: 15, creditsLimit: 200, studentsActive: 12, studentsLimit: 20, nextBilling: '2024-06-15' },
    { id: 'u2', tenant_id: 't2', name: 'Clínica Aprender', email: 'contato@aprender.com', phone: '(21) 98888-2222', plan: PlanTier.PREMIUM, cycle: 'ANUAL', status: 'ACTIVE', creditsUsed: 145, creditsLimit: 400, studentsActive: 38, studentsLimit: 40, nextBilling: '2025-01-10' },
    { id: 'u3', tenant_id: 't3', name: 'João Teacher', email: 'joao@school.com', plan: PlanTier.FREE, cycle: 'MENSAL', status: 'ACTIVE', creditsUsed: 5, creditsLimit: 5, studentsActive: 1, studentsLimit: 1, nextBilling: '-' },
    { id: 'u4', tenant_id: 't4', name: 'Escola Futuro', email: 'dir@futuro.edu', plan: PlanTier.PREMIUM, cycle: 'MENSAL', status: 'OVERDUE', creditsUsed: 300, creditsLimit: 400, studentsActive: 40, studentsLimit: 40, nextBilling: '2024-05-20' },
];

export const AdminService = {
    // --- SITE CONFIG ---
    async getSiteConfig(): Promise<SiteConfig> {
        // await supabase.from('site_config').select('*').single();
        return MOCK_SITE_CONFIG;
    },

    async updateSiteConfig(newConfig: SiteConfig, adminUser: AdminUser): Promise<void> {
        // Validate Role
        if (adminUser.role !== 'super_admin' && adminUser.role !== 'operacional') {
            throw new Error("Permissão negada");
        }
        MOCK_SITE_CONFIG = newConfig;
        this.logAction(adminUser, 'SITE_UPDATE', 'Landing Page', 'Atualizou configurações do site');
    },

    // --- SUBSCRIBERS ---
    async getSubscribers(): Promise<Subscriber[]> {
        return MOCK_SUBSCRIBERS;
    },

    async updateSubscriberPlan(subId: string, newPlan: PlanTier, adminUser: AdminUser): Promise<void> {
        if (adminUser.role === 'viewer') throw new Error("Apenas visualização");
        const sub = MOCK_SUBSCRIBERS.find(s => s.id === subId);
        if (sub) {
            sub.plan = newPlan;
            this.logAction(adminUser, 'UPDATE_PLAN', sub.email, `Alterou plano para ${newPlan}`);
        }
    },

    async grantCredits(subId: string, amount: number, reason: string, adminUser: AdminUser): Promise<void> {
        if (['viewer', 'financeiro'].includes(adminUser.role)) throw new Error("Permissão negada para operação");
        const sub = MOCK_SUBSCRIBERS.find(s => s.id === subId);
        if (sub) {
            // Call Supabase RPC in real impl
            this.logAction(adminUser, 'GRANT_CREDITS', sub.email, `Liberou ${amount} créditos. Motivo: ${reason}`);
        }
    },

    // --- ADMIN MANAGEMENT (RBAC) ---
    async getAdmins(): Promise<AdminUser[]> {
        return MOCK_ADMINS;
    },

    async createAdmin(newAdmin: Omit<AdminUser, 'id' | 'createdAt'>, actor: AdminUser): Promise<void> {
        if (actor.role !== 'super_admin') throw new Error("Apenas Super Admin pode criar administradores");
        MOCK_ADMINS.push({ ...newAdmin, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
        this.logAction(actor, 'CREATE_ADMIN', newAdmin.email, `Criou novo admin com role ${newAdmin.role}`);
    },

    async updateAdminRole(targetId: string, newRole: AdminRole, actor: AdminUser): Promise<void> {
        if (actor.role !== 'super_admin') throw new Error("Permissão negada");
        const admin = MOCK_ADMINS.find(a => a.id === targetId);
        if(admin) admin.role = newRole;
        this.logAction(actor, 'UPDATE_ADMIN_ROLE', targetId, `Alterou role para ${newRole}`);
    },

    // --- LOGS ---
    async getLogs(): Promise<AdminLog[]> {
        return MOCK_LOGS.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },

    logAction(admin: AdminUser, action: string, target: string, details: string) {
        MOCK_LOGS.unshift({
            id: crypto.randomUUID(),
            adminName: admin.name,
            action,
            target,
            details,
            timestamp: new Date().toISOString()
        });
    },

    // --- KPIS & FINANCE ---
    async getFinancialStats() {
        return {
            mrr: 15400.00,
            arr: 184800.00,
            totalSubscribers: 142,
            churnRate: 2.1,
            extraRevenue: 4500.00,
            aiCosts: 1200.00
        };
    }
};
