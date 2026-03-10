import { AddOnProduct, PaymentProvider, PlanTier, User, SubscriptionStatus } from "../types";

// ============================================================================
// PAYMENT ADAPTER PATTERN
// ============================================================================

class KiwifyProvider implements PaymentProvider {
    private apiKey: string;
    private baseUrl = "https://pay.kiwify.com.br";

    constructor() {
        this.apiKey = process.env.KIWIFY_API_KEY || 'mock_key';
    }

    async createCheckout(plan: PlanTier, userData: Partial<User>): Promise<string> {
        console.log(`[Kiwify] Generating Checkout for ${plan}`);
        
        // Mock IDs based on Plan Tier
        const planIds = {
            [PlanTier.PRO]: 'k-pro-monthly-v2',
            [PlanTier.PREMIUM]: 'k-master-annual-v2',
            [PlanTier.FREE]: 'k-free-tier'
        };

        const planId = planIds[plan as keyof typeof planIds];
        if (!planId) return "#";

        // Construct URL with UTM and User Params for tracking
        const params = new URLSearchParams({
            email: userData.email || '',
            name: userData.name || '',
            custom_id: userData.id || '',
            src: 'incluiai_platform'
        });

        return `${this.baseUrl}/${planId}?${params.toString()}`;
    }

    async createAddOnCheckout(sku: string, userData: Partial<User>, meta?: Record<string, string>): Promise<string> {
        // @ts-expect-error - Vite env
        const fromEnv = (import.meta?.env?.[`VITE_KIWIFY_ADDON_${sku}`] as string | undefined) || '';
        const base = fromEnv || `${this.baseUrl}/checkout/${sku}`;

        const params = new URLSearchParams({
            email: userData.email || '',
            name: userData.name || '',
            custom_id: userData.id || '',
            tenant: userData.tenant_id || '',
            src: 'incluiai_addon'
        });
        if (meta) Object.entries(meta).forEach(([k, v]) => params.set(k, String(v)));

        return `${base}?${params.toString()}`;
    }

    async handleWebhook(payload: any): Promise<void> {
        console.log("[Kiwify] Webhook Processed", payload);
        // In a real backend, this would update the User record in DB
        // Status: paid, refunded, chargeback, subscription_canceled
    }

    async validateSubscription(userId: string): Promise<boolean> {
        // Call Kiwify API to check status
        return true; 
    }

    async cancelSubscription(userId: string): Promise<void> {
        console.log(`[Kiwify] Cancel request for user ${userId}`);
    }

    async generateCustomerPortal(userId: string): Promise<string> {
        return "https://dashboard.kiwify.com.br/minhas-compras";
    }
}

// Placeholder for future implementation
class StripeProvider implements PaymentProvider {
    async createCheckout(plan: PlanTier, user: Partial<User>) { return "stripe_checkout_url"; }
    async createAddOnCheckout(sku: string, user: Partial<User>) { return "stripe_addon_checkout_url"; }
    async handleWebhook(payload: any) { }
    async validateSubscription(userId: string) { return true; }
    async cancelSubscription(userId: string) { }
    async generateCustomerPortal(userId: string) { return "stripe_portal_url"; }
}

// Defaults used by Settings UI (you can change prices + SKUs later)
export const DEFAULT_ADDONS: AddOnProduct[] = [
    {
        kind: 'AI_CREDITS',
        sku: 'AI10',
        title: '+10 créditos IA',
        description: 'Para gerar mais documentos e análises com IA.',
        quantity: 10,
        priceCents: 1990,
    },
    {
        kind: 'AI_CREDITS',
        sku: 'AI30',
        title: '+30 créditos IA',
        description: 'Melhor custo-benefício para uso semanal.',
        quantity: 30,
        priceCents: 4990,
        recommended: true,
    },
    {
        kind: 'STUDENT_SLOTS',
        sku: 'ALUNOS10',
        title: '+10 alunos',
        description: 'Aumenta o limite de alunos ativos na assinatura.',
        quantity: 10,
        priceCents: 2990,
    },
];

// ============================================================================
// SERVICE LAYER (SINGLETON)
// ============================================================================

export const PaymentService = {
    // Default to Kiwify, but easily swappable
    provider: new KiwifyProvider() as PaymentProvider,

    setProvider(type: 'kiwify' | 'stripe') {
        if (type === 'stripe') this.provider = new StripeProvider();
        else this.provider = new KiwifyProvider();
    },

    async getCheckoutUrl(plan: PlanTier, user: Partial<User>) {
        return this.provider.createCheckout(plan, user);
    },

    async getAddOnCheckoutUrl(sku: string, user: Partial<User>, meta?: Record<string, string>) {
        if (!this.provider.createAddOnCheckout) {
            throw new Error('Payment provider does not support add-ons');
        }
        return this.provider.createAddOnCheckout(sku, user, meta);
    },

    async manageSubscription(userId: string) {
        return this.provider.generateCustomerPortal(userId);
    },

    // Business Logic for Access Control
    checkAccess(user: User): { allowed: boolean; reason?: string } {
        if (user.subscriptionStatus === 'ACTIVE') return { allowed: true };
        
        if (user.subscriptionStatus === 'PENDING') {
            // Grace period logic could go here
            return { allowed: true, reason: 'grace_period' };
        }
        
        if (user.subscriptionStatus === 'OVERDUE') {
            return { allowed: false, reason: 'payment_required' };
        }

        if (user.subscriptionStatus === 'CANCELED') {
             return { allowed: false, reason: 'subscription_ended' };
        }

        return { allowed: false };
    }
};
