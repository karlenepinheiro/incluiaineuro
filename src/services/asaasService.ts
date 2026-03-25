/**
 * asaasService.ts
 * Integração com o gateway de pagamentos Asaas.
 *
 * Colunas REAIS da tabela subscriptions (após schema_asaas.sql):
 *   id, tenant_id, plan_id (FK), status, provider, provider_sub_id,
 *   provider_customer_id, provider_payment_link, provider_update_payment_link,
 *   last_payment_status, next_due_date, current_period_start, current_period_end
 */

import { supabase } from './supabase';
import { BillingEventsService, SubscriptionService } from './billingService';
import type { SubscriptionStatus } from '../types';

// ---------------------------------------------------------------------------
// CONFIGURAÇÃO
// ---------------------------------------------------------------------------

// Sandbox:  https://sandbox.asaas.com/api/v3
// Produção: https://api.asaas.com/v3
const ASAAS_API_BASE = import.meta.env.VITE_ASAAS_API_BASE ?? 'https://sandbox.asaas.com/api/v3';
const ASAAS_API_KEY  = import.meta.env.VITE_ASAAS_API_KEY  ?? '';
const ASAAS_PROVIDER = 'asaas';

/** Detecta se o Asaas está configurado (chave presente) */
export function isAsaasConfigured(): boolean {
  return Boolean(ASAAS_API_KEY);
}

// ---------------------------------------------------------------------------
// PREÇOS DOS PLANOS (R$ / mês)
// ---------------------------------------------------------------------------
export const ASAAS_PLAN_PRICES: Record<string, number> = {
  PRO:           79.90,
  MASTER:        119.90,
  INSTITUTIONAL: 249.90,
};

// ---------------------------------------------------------------------------
// HELPER: chamada HTTP para a API Asaas
// ---------------------------------------------------------------------------

async function asaasRequest<T = any>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: Record<string, any>
): Promise<T> {
  if (!ASAAS_API_KEY) {
    throw new Error(
      'Asaas não configurado. Defina VITE_ASAAS_API_KEY no arquivo .env e reinicie o servidor.'
    );
  }

  const res = await fetch(`${ASAAS_API_BASE}${path}`, {
    method,
    headers: {
      'access_token': ASAAS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (json as any)?.errors?.[0]?.description
      || (json as any)?.errors?.[0]?.message
      || JSON.stringify(json);
    throw new Error(`[Asaas] ${method} ${path} (${res.status}): ${detail}`);
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// CLIENTES
// ---------------------------------------------------------------------------

export interface AsaasCustomerPayload {
  name: string;
  email: string;
  cpfCnpj?: string;
  phone?: string;
  mobilePhone?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  externalReference?: string; // tenant_id
}

export const AsaasCustomerService = {
  /**
   * Cria um cliente no Asaas e salva o provider_customer_id na subscription.
   * Se já existir um provider_customer_id, apenas o retorna.
   */
  async createOrGet(tenantId: string, payload: AsaasCustomerPayload): Promise<string> {
    // 1. Verifica se já existe
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('provider_customer_id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (sub?.provider_customer_id) {
      return sub.provider_customer_id;
    }

    // 2. Cria o cliente no Asaas
    const asaasCustomer = await asaasRequest<{ id: string }>('POST', '/customers', {
      ...payload,
      externalReference: tenantId,
    });

    const customerId = asaasCustomer.id;

    // 3. Salva no banco (apenas colunas reais)
    const { error } = await supabase
      .from('subscriptions')
      .upsert(
        {
          tenant_id:            tenantId,
          provider:             ASAAS_PROVIDER,
          provider_customer_id: customerId,
          status:               'PENDING',
        },
        { onConflict: 'tenant_id' }
      );

    if (error) {
      console.error('[AsaasCustomerService.createOrGet] erro ao salvar:', error);
    }

    return customerId;
  },

  /** Busca dados de um cliente no Asaas */
  async get(customerId: string): Promise<any> {
    return asaasRequest('GET', `/customers/${customerId}`);
  },

  /** Atualiza dados de um cliente no Asaas */
  async update(customerId: string, patch: Partial<AsaasCustomerPayload>): Promise<void> {
    await asaasRequest('PUT', `/customers/${customerId}`, patch);
  },
};

// ---------------------------------------------------------------------------
// ASSINATURAS
// ---------------------------------------------------------------------------

export interface AsaasSubscriptionPayload {
  customerId: string;       // provider_customer_id
  billingType: 'CREDIT_CARD' | 'BOLETO' | 'PIX';
  value: number;            // valor em reais
  nextDueDate: string;      // YYYY-MM-DD
  cycle: 'MONTHLY' | 'YEARLY';
  description?: string;
  externalReference?: string; // tenant_id
}

export const AsaasSubscriptionService = {
  /**
   * Cria uma assinatura no Asaas e persiste os IDs no Supabase.
   */
  async create(tenantId: string, planCode: string, payload: AsaasSubscriptionPayload): Promise<{
    subscriptionId: string;
    paymentLink: string;
    updatePaymentLink: string;
  }> {
    // 1. Cria no Asaas
    const asaasSub = await asaasRequest<{
      id: string;
      paymentLink?: string;
      updatePaymentLink?: string;
    }>('POST', '/subscriptions', {
      ...payload,
      externalReference: tenantId,
    });

    const subscriptionId    = asaasSub.id;
    const paymentLink       = asaasSub.paymentLink ?? `https://www.asaas.com/c/${subscriptionId}`;
    const updatePaymentLink = asaasSub.updatePaymentLink ?? `https://www.asaas.com/c/${subscriptionId}/updateCard`;

    // 2. Resolve plan_id pelo código
    const { data: planRow } = await supabase
      .from('plans')
      .select('id')
      .eq('name', planCode.toUpperCase())
      .maybeSingle();

    // 3. Persiste no Supabase (colunas reais)
    const { error } = await supabase
      .from('subscriptions')
      .upsert(
        {
          tenant_id:                    tenantId,
          provider:                     ASAAS_PROVIDER,
          plan_id:                      planRow?.id ?? null,
          provider_sub_id:              subscriptionId,
          provider_payment_link:        paymentLink,
          provider_update_payment_link: updatePaymentLink,
          status:                       'PENDING',
          next_due_date:                payload.nextDueDate,
          current_period_start:         new Date().toISOString(),
        },
        { onConflict: 'tenant_id' }
      );

    if (error) {
      console.error('[AsaasSubscriptionService.create] erro ao salvar:', error);
    }

    // 4. Espelha no tenant
    if (planRow?.id) {
      await supabase
        .from('tenants')
        .update({ plan_id: planRow.id })
        .eq('id', tenantId);
    }

    return { subscriptionId, paymentLink, updatePaymentLink };
  },

  /** Cancela uma assinatura no Asaas */
  async cancel(subscriptionId: string): Promise<void> {
    await asaasRequest('DELETE', `/subscriptions/${subscriptionId}`);
  },

  /** Obtém dados de uma assinatura no Asaas */
  async get(subscriptionId: string): Promise<any> {
    return asaasRequest('GET', `/subscriptions/${subscriptionId}`);
  },

  /**
   * Gera um novo link de atualização de cartão para o assinante.
   */
  async getUpdateCardLink(subscriptionId: string): Promise<string> {
    const data = await asaasRequest<any>('GET', `/subscriptions/${subscriptionId}`);
    const link = data.updatePaymentLink ?? `https://www.asaas.com/c/${subscriptionId}/updateCard`;

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('tenant_id')
      .eq('provider_sub_id', subscriptionId)
      .maybeSingle();

    if (sub?.tenant_id) {
      await supabase
        .from('subscriptions')
        .update({ provider_update_payment_link: link })
        .eq('provider_sub_id', subscriptionId);
    }

    return link;
  },
};

// ---------------------------------------------------------------------------
// WEBHOOK HANDLER
// ---------------------------------------------------------------------------

const ASAAS_EVENT_MAP: Record<string, string> = {
  PAYMENT_CONFIRMED:            'payment_approved',
  PAYMENT_RECEIVED:             'payment_approved',
  PAYMENT_OVERDUE:              'payment_overdue',
  PAYMENT_DELETED:              'payment_deleted',
  PAYMENT_REFUNDED:             'payment_refunded',
  PAYMENT_RESTORED:             'payment_restored',
  SUBSCRIPTION_CREATED:         'subscription_created',
  SUBSCRIPTION_UPDATED:         'subscription_updated',
  SUBSCRIPTION_DELETED:         'subscription_canceled',
  SUBSCRIPTION_PAYMENT_CREATED: 'subscription_renewal',
};

export const AsaasWebhookService = {
  async process(payload: Record<string, any>): Promise<{ handled: boolean; action: string }> {
    const eventType         = String(payload.event ?? '');
    const providerEventId   = String(payload.id ?? payload.payment?.id ?? '');
    const providerSubId     = String(payload.subscription?.id ?? payload.subscriptionId ?? '');
    const providerPaymentId = String(payload.payment?.id ?? '');

    const mappedAction = ASAAS_EVENT_MAP[eventType] ?? 'unknown';

    let eventId: string;
    try {
      eventId = await BillingEventsService.log({
        provider:               ASAAS_PROVIDER,
        eventType,
        providerEventId,
        providerPaymentId,
        providerSubscriptionId: providerSubId,
        payload,
      });
    } catch {
      return { handled: false, action: 'duplicate' };
    }

    try {
      const tenantId = await AsaasWebhookService._resolveTenantId(payload, providerSubId);

      if (!tenantId) {
        await BillingEventsService.markProcessed(eventId, false, 'tenant_id não resolvido');
        return { handled: false, action: 'no_tenant' };
      }

      await AsaasWebhookService._applyAction(mappedAction, tenantId, payload, providerSubId);
      await BillingEventsService.markProcessed(eventId, true);
      return { handled: true, action: mappedAction };

    } catch (err: any) {
      await BillingEventsService.markProcessed(eventId, false, err?.message ?? 'Erro desconhecido');
      return { handled: false, action: 'error' };
    }
  },

  async _resolveTenantId(payload: any, providerSubId: string): Promise<string | null> {
    const extRef = payload.externalReference
      ?? payload.payment?.externalReference
      ?? payload.subscription?.externalReference;
    if (extRef && extRef.length === 36) return extRef;

    if (providerSubId) {
      const { data } = await supabase
        .from('subscriptions')
        .select('tenant_id')
        .eq('provider_sub_id', providerSubId)
        .maybeSingle();
      if (data?.tenant_id) return data.tenant_id;
    }

    const customerId = payload.payment?.customer
      ?? payload.customer?.id
      ?? payload.subscription?.customer;
    if (customerId) {
      const { data } = await supabase
        .from('subscriptions')
        .select('tenant_id')
        .eq('provider_customer_id', customerId)
        .maybeSingle();
      if (data?.tenant_id) return data.tenant_id;
    }

    return null;
  },

  async _applyAction(
    action: string,
    tenantId: string,
    payload: any,
    providerSubId: string
  ): Promise<void> {
    const planCode = AsaasWebhookService._resolvePlanCode(payload);

    switch (action) {
      case 'payment_approved':
      case 'subscription_renewal': {
        const credits   = planCode === 'MASTER' ? 70 : planCode === 'PRO' ? 50 : planCode === 'INSTITUTIONAL' ? 9999 : 0;
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        await supabase.rpc('process_payment_approved', {
          p_tenant_id:                tenantId,
          p_plan_code:                planCode,
          p_credits:                  credits,
          p_period_end:               periodEnd,
          p_provider_subscription_id: providerSubId || null,
        });

        const paymentLink = payload.payment?.invoiceUrl ?? payload.invoiceUrl;
        if (paymentLink) {
          await supabase
            .from('subscriptions')
            .update({ provider_payment_link: paymentLink, last_payment_status: 'paid' })
            .eq('tenant_id', tenantId);
        }
        break;
      }

      case 'payment_overdue': {
        await supabase.rpc('process_payment_overdue', { p_tenant_id: tenantId });
        const paymentLink = payload.payment?.invoiceUrl ?? payload.bankSlipUrl;
        if (paymentLink) {
          await supabase
            .from('subscriptions')
            .update({ provider_payment_link: paymentLink })
            .eq('tenant_id', tenantId);
        }
        break;
      }

      case 'subscription_canceled':
      case 'payment_deleted': {
        await supabase.rpc('process_subscription_canceled', { p_tenant_id: tenantId });
        break;
      }

      case 'payment_refunded': {
        await SubscriptionService.updateStatus(tenantId, 'CANCELED' as SubscriptionStatus, 'Pagamento reembolsado');
        break;
      }

      case 'payment_restored': {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (sub?.status !== 'ACTIVE') {
          await SubscriptionService.updateStatus(tenantId, 'ACTIVE' as SubscriptionStatus, 'Pagamento restaurado');
        }
        break;
      }

      case 'subscription_created': {
        const subId      = payload.subscription?.id ?? providerSubId;
        const custId     = payload.subscription?.customer;
        const payLink    = payload.subscription?.paymentLink;
        const updateLink = payload.subscription?.updatePaymentLink;

        const patch: Record<string, any> = { provider: ASAAS_PROVIDER, status: 'ACTIVE' };
        if (subId)      patch.provider_sub_id               = subId;
        if (custId)     patch.provider_customer_id          = custId;
        if (payLink)    patch.provider_payment_link         = payLink;
        if (updateLink) patch.provider_update_payment_link  = updateLink;

        await supabase.from('subscriptions').update(patch).eq('tenant_id', tenantId);
        break;
      }

      default:
        console.log(`[AsaasWebhookService] evento sem ação: ${action}`);
    }
  },

  _resolvePlanCode(payload: any): string {
    const value = Number(payload.payment?.value ?? payload.value ?? 0);
    const desc  = String(
      payload.payment?.description ??
      payload.subscription?.description ??
      payload.description ?? ''
    ).toUpperCase();

    if (desc.includes('MASTER') || desc.includes('CLÍNICA') || desc.includes('ESCOLA')) return 'MASTER';
    if (desc.includes('INSTITUTIONAL') || desc.includes('INSTITUCIONAL'))               return 'INSTITUTIONAL';
    if (desc.includes('PRO') || desc.includes('PROFISSIONAL'))                          return 'PRO';

    if (value >= 240) return 'INSTITUTIONAL';
    if (value >= 110) return 'MASTER';
    if (value >= 70)  return 'PRO';

    return 'FREE';
  },
};

// ---------------------------------------------------------------------------
// PAGAMENTOS AVULSOS (créditos extras)
// ---------------------------------------------------------------------------

export const AsaasPaymentService = {
  async createExtraCreditsPayment(params: {
    customerId: string;
    tenantId: string;
    credits: number;
    pricePerCredit?: number;
    billingType?: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
    dueDate?: string;
  }): Promise<{ paymentId: string; invoiceUrl: string }> {
    const pricePerCredit = params.pricePerCredit ?? 1.99;
    const value   = Math.round(params.credits * pricePerCredit * 100) / 100;
    const dueDate = params.dueDate
      ?? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const payment = await asaasRequest<{ id: string; invoiceUrl: string }>('POST', '/payments', {
      customer:          params.customerId,
      billingType:       params.billingType ?? 'PIX',
      value,
      dueDate,
      description:       `Compra de ${params.credits} créditos extras IncluiAI`,
      externalReference: params.tenantId,
    });

    return { paymentId: payment.id, invoiceUrl: payment.invoiceUrl };
  },
};
