/**
 * paymentService.ts
 * Camada de pagamento — gateway Kiwify.
 *
 * Arquitetura:
 *   - KiwifyProvider implementa PaymentProvider
 *   - Checkouts são links estáticos pré-criados no painel Kiwify
 *     (configurados via variáveis de ambiente VITE_KIWIFY_CHECKOUT_*)
 *   - checkAccess: lógica de acesso por status da assinatura (independente do gateway)
 */

import { AddOnProduct, PaymentProvider, PlanTier, User } from '../types';

// ── Links de checkout Kiwify por plano ────────────────────────────────────────
// Configure no .env: VITE_KIWIFY_CHECKOUT_PRO, VITE_KIWIFY_CHECKOUT_MASTER, etc.
const KIWIFY_LINKS: Partial<Record<string, string>> = {
  PRO:             import.meta.env.VITE_KIWIFY_CHECKOUT_PRO             ?? '',
  PRO_ANNUAL:      import.meta.env.VITE_KIWIFY_CHECKOUT_PRO_ANNUAL      ?? '',
  MASTER:          import.meta.env.VITE_KIWIFY_CHECKOUT_MASTER          ?? '',
  MASTER_ANNUAL:   import.meta.env.VITE_KIWIFY_CHECKOUT_MASTER_ANNUAL   ?? '',
  INSTITUTIONAL:   import.meta.env.VITE_KIWIFY_CHECKOUT_INSTITUTIONAL   ?? '',
  // Add-ons de créditos (SKUs atualizados: AI10 / AI200 / AI900)
  AI10:            import.meta.env.VITE_KIWIFY_CHECKOUT_AI10            ?? '',
  AI200:           import.meta.env.VITE_KIWIFY_CHECKOUT_AI200           ?? '',
  AI900:           import.meta.env.VITE_KIWIFY_CHECKOUT_AI900           ?? '',
};

const PLAN_CODE_MAP: Partial<Record<PlanTier, string>> = {
  [PlanTier.PRO]:     'PRO',
  [PlanTier.PREMIUM]: 'MASTER',
};

// ── KiwifyProvider ────────────────────────────────────────────────────────────
class KiwifyProvider implements PaymentProvider {

  async createCheckout(plan: PlanTier, _user: Partial<User>): Promise<string> {
    if (plan === PlanTier.FREE) return '#';
    const code = PLAN_CODE_MAP[plan] ?? String(plan).toUpperCase();
    const link = KIWIFY_LINKS[code];
    if (!link) {
      console.warn('[KiwifyProvider] Link de checkout não configurado para o plano:', code);
      return '#subscription';
    }
    return link;
  }

  async createAnnualCheckout(plan: PlanTier, _user: Partial<User>): Promise<string> {
    if (plan === PlanTier.FREE) return '#';
    const code = (PLAN_CODE_MAP[plan] ?? String(plan).toUpperCase()) + '_ANNUAL';
    const link = KIWIFY_LINKS[code];
    if (!link) {
      console.warn('[KiwifyProvider] Link anual não configurado para o plano:', code);
      // Fallback para link mensal
      return this.createCheckout(plan, _user);
    }
    return link;
  }

  async createAddOnCheckout(sku: string, _user: Partial<User>): Promise<string> {
    const link = KIWIFY_LINKS[sku];
    if (!link) {
      console.warn('[KiwifyProvider] Link de checkout não configurado para SKU:', sku);
      return '#subscription';
    }
    return link;
  }

  async handleWebhook(payload: any): Promise<void> {
    // Webhooks Kiwify tratados pela Edge Function kiwify-webhook — não pelo frontend
    console.log('[KiwifyProvider] Webhook recebido (frontend não processa diretamente):', payload?.event);
  }

  async validateSubscription(_userId: string): Promise<boolean> {
    // Validação feita via Supabase (subscriptions.status) — não via chamada ao gateway
    return true;
  }

  async cancelSubscription(_subscriptionId: string): Promise<void> {
    // Cancelamento gerenciado pelo painel Kiwify ou via webhook — não há API frontend
    console.warn('[KiwifyProvider] Cancelamento deve ser feito no painel Kiwify ou via suporte.');
  }

  async generateCustomerPortal(_providerSubId: string): Promise<string> {
    // Kiwify não possui portal de autoatendimento por API — direciona para suporte
    const portalLink = import.meta.env.VITE_KIWIFY_CUSTOMER_PORTAL ?? '#subscription';
    return portalLink;
  }
}

// ── Add-ons padrão ────────────────────────────────────────────────────────────
export const DEFAULT_ADDONS: AddOnProduct[] = [
  {
    kind:        'AI_CREDITS',
    sku:         'AI10',
    title:       '+10 créditos IA',
    description: 'Ideal para relatórios rápidos e ajustes pontuais.',
    quantity:    10,
    priceCents:  990,    // R$ 9,90
  },
  {
    kind:        'AI_CREDITS',
    sku:         'AI200',
    title:       '+200 créditos IA',
    description: 'Ideal para gerar atividades, materiais pedagógicos e documentos com mais frequência.',
    quantity:    200,
    priceCents:  4990,   // R$ 49,90
    recommended: true,
  },
  {
    kind:        'AI_CREDITS',
    sku:         'AI900',
    title:       '+900 créditos IA',
    description: 'Ideal para quem precisa de escala, autonomia e uso intenso da IA.',
    quantity:    900,
    priceCents:  9990,   // R$ 99,90
  },
];

// ── Service Layer ─────────────────────────────────────────────────────────────
export const PaymentService = {
  provider: new KiwifyProvider() as PaymentProvider,

  /** @deprecated — mantido para compatibilidade de chamadas legadas */
  setProvider(_type: 'kiwify' | 'stripe') {
    this.provider = new KiwifyProvider();
  },

  async getCheckoutUrl(plan: PlanTier, user: Partial<User>): Promise<string> {
    return this.provider.createCheckout(plan, user);
  },

  async getAnnualCheckoutUrl(plan: PlanTier, user: Partial<User>): Promise<string> {
    const p = this.provider as KiwifyProvider;
    return p.createAnnualCheckout(plan, user);
  },

  async getAddOnCheckoutUrl(
    sku: string,
    user: Partial<User>,
    meta?: Record<string, string>
  ): Promise<string> {
    if (!this.provider.createAddOnCheckout) {
      throw new Error('Provider não suporta add-ons');
    }
    return this.provider.createAddOnCheckout(sku, user, meta);
  },

  async manageSubscription(providerSubId: string): Promise<string> {
    return this.provider.generateCustomerPortal(providerSubId);
  },

  /**
   * Controle de acesso por status da assinatura.
   * Independente do gateway de pagamento.
   */
  checkAccess(user: User): { allowed: boolean; reason?: string } {
    const status = user.subscriptionStatus;
    if (status === 'ACTIVE')        return { allowed: true };
    if (status === 'COURTESY')      return { allowed: true,  reason: 'courtesy' };
    if (status === 'INTERNAL_TEST') return { allowed: true,  reason: 'test_account' };
    if (status === 'TRIAL')         return { allowed: true,  reason: 'trial' };
    if (status === 'PENDING')       return { allowed: true,  reason: 'grace_period' };
    if (status === 'OVERDUE')       return { allowed: false, reason: 'payment_required' };
    if (status === 'CANCELED')      return { allowed: false, reason: 'subscription_ended' };
    return { allowed: false, reason: 'payment_required' };
  },
};
