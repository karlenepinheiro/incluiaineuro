/**
 * paymentService.ts
 * Camada de pagamento — migrado de Kiwify → Asaas.
 *
 * Arquitetura:
 *   - AsaasProvider implementa PaymentProvider
 *   - Chamadas assíncronas ao Asaas delegadas a asaasService.ts
 *   - createCheckout retorna link de checkout gerado pelo Asaas
 *   - checkAccess: lógica de acesso por status da assinatura (independente do gateway)
 */

import { AddOnProduct, PaymentProvider, PlanTier, User } from '../types';
import {
  AsaasCustomerService,
  AsaasSubscriptionService,
  AsaasPaymentService,
  ASAAS_PLAN_PRICES,
  isAsaasConfigured,
} from './asaasService';

// ── Mapa PlanTier → código Asaas ──────────────────────────────────────────────
const PLAN_CODE_MAP: Partial<Record<PlanTier, string>> = {
  [PlanTier.PRO]:       'PRO',
  [PlanTier.PREMIUM]:   'MASTER',
};

// ── AsaasProvider ─────────────────────────────────────────────────────────────
class AsaasProvider implements PaymentProvider {

  async createCheckout(plan: PlanTier, user: Partial<User>): Promise<string> {
    if (!isAsaasConfigured()) {
      console.warn('[AsaasProvider] Asaas não configurado — redirecionando para planos');
      return '#subscription';
    }
    if (plan === PlanTier.FREE) return '#';

    const planCode = PLAN_CODE_MAP[plan];
    if (!planCode) return '#';

    try {
      const tenantId = user.tenant_id ?? user.id ?? '';
      const customerId = await AsaasCustomerService.createOrGet(tenantId, {
        name:              user.name    ?? '',
        email:             user.email   ?? '',
        externalReference: tenantId,
      });

      const nextDue = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];

      const result = await AsaasSubscriptionService.create(tenantId, planCode, {
        customerId,
        billingType: 'CREDIT_CARD',
        value:       ASAAS_PLAN_PRICES[planCode] ?? 67,
        nextDueDate: nextDue,
        cycle:       'MONTHLY',
        description: `IncluiAI ${planCode}`,
        externalReference: tenantId,
      });

      return result.paymentLink;
    } catch (err: any) {
      console.error('[AsaasProvider.createCheckout]', err?.message);
      return '#subscription';
    }
  }

  async createAddOnCheckout(
    sku: string,
    user: Partial<User>,
    meta?: Record<string, string>
  ): Promise<string> {
    if (!isAsaasConfigured()) return '#subscription';

    // Mapeia SKU → créditos
    const SKU_MAP: Record<string, { credits: number; pricePerCredit: number }> = {
      AI10:  { credits: 10,  pricePerCredit: 0.99 },
      AI30:  { credits: 30,  pricePerCredit: 0.663 },
      AI100: { credits: 100, pricePerCredit: 0.499 },
    };

    const packInfo = SKU_MAP[sku];
    if (!packInfo) {
      console.warn('[AsaasProvider] SKU desconhecido:', sku);
      return '#subscription';
    }

    try {
      const tenantId   = user.tenant_id ?? user.id ?? '';
      const customerId = await AsaasCustomerService.createOrGet(tenantId, {
        name:  user.name  ?? '',
        email: user.email ?? '',
      });

      const result = await AsaasPaymentService.createExtraCreditsPayment({
        customerId,
        tenantId,
        credits:       packInfo.credits,
        pricePerCredit: packInfo.pricePerCredit,
        billingType:   'PIX',
      });

      return result.invoiceUrl;
    } catch (err: any) {
      console.error('[AsaasProvider.createAddOnCheckout]', err?.message);
      return '#subscription';
    }
  }

  async handleWebhook(payload: any): Promise<void> {
    // Webhooks são tratados pela Edge Function asaas-webhook — não pelo frontend
    console.log('[AsaasProvider] Webhook recebido (frontend não processa diretamente):', payload?.event);
  }

  async validateSubscription(_userId: string): Promise<boolean> {
    // Validação feita via Supabase (subscriptions.status) — não via chamada ao Asaas
    return true;
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    if (!isAsaasConfigured()) return;
    try {
      const { AsaasSubscriptionService: svc } = await import('./asaasService');
      await svc.cancel(subscriptionId);
    } catch (err: any) {
      console.error('[AsaasProvider.cancelSubscription]', err?.message);
    }
  }

  async generateCustomerPortal(providerSubId: string): Promise<string> {
    if (!isAsaasConfigured() || !providerSubId) return '#subscription';
    try {
      return await AsaasSubscriptionService.getUpdateCardLink(providerSubId);
    } catch {
      return '#subscription';
    }
  }
}

// ── Add-ons padrão (preços Asaas) ─────────────────────────────────────────────
export const DEFAULT_ADDONS: AddOnProduct[] = [
  {
    kind:        'AI_CREDITS',
    sku:         'AI10',
    title:       '+10 créditos IA',
    description: 'Para gerar mais documentos e análises com IA.',
    quantity:    10,
    priceCents:  990,    // R$ 9,90
  },
  {
    kind:        'AI_CREDITS',
    sku:         'AI30',
    title:       '+30 créditos IA',
    description: 'Melhor custo-benefício para uso semanal.',
    quantity:    30,
    priceCents:  1990,   // R$ 19,90
    recommended: true,
  },
  {
    kind:        'AI_CREDITS',
    sku:         'AI100',
    title:       '+100 créditos IA',
    description: 'Pacote maior, menor custo por crédito.',
    quantity:    100,
    priceCents:  4990,   // R$ 49,90
  },
];

// ── Service Layer ─────────────────────────────────────────────────────────────
export const PaymentService = {
  provider: new AsaasProvider() as PaymentProvider,

  /** @deprecated — use AsaasProvider diretamente */
  setProvider(_type: 'asaas' | 'kiwify' | 'stripe') {
    // Sempre Asaas — mantido para compatibilidade de chamadas legadas
    this.provider = new AsaasProvider();
  },

  async getCheckoutUrl(plan: PlanTier, user: Partial<User>): Promise<string> {
    return this.provider.createCheckout(plan, user);
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
