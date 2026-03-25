/**
 * billingService.ts
 * Gerencia assinaturas, eventos de cobrança e integração com gateways de pagamento.
 * Arquitetura desacoplada — reutilizável em qualquer SaaS.
 */

import { supabase } from './supabase';
import type {
  Subscription,
  SubscriptionStatus,
  BillingEvent,
  Plan,
} from '../types';
import { ReferralService } from './referralService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ---------------------------------------------------------------------------
// PLANOS
// ---------------------------------------------------------------------------

export const BillingPlansService = {
  /** Lista todos os planos (ativos ou todos) */
  async getAll(onlyActive = false): Promise<Plan[]> {
    // Colunas REAIS de plans: id, name, max_students, ai_credits_per_month, price_brl, is_active
    // NÃO EXISTEM: code, price_monthly, price_yearly, credits_monthly, max_entities, features_json
    let q = supabase
      .from('plans')
      .select('id, name, max_students, ai_credits_per_month, price_brl, is_active, created_at')
      .order('price_brl', { ascending: true });
    if (onlyActive) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapPlan);
  },

  /** Obtém um plano pelo código/nome (FREE, PRO, MASTER) */
  async getByCode(code: string): Promise<Plan | null> {
    // Não existe coluna "code" — filtra por "name" (equivalente real)
    const { data, error } = await supabase
      .from('plans')
      .select('id, name, max_students, ai_credits_per_month, price_brl, is_active, created_at')
      .eq('name', code.toUpperCase())
      .maybeSingle();
    if (error) throw error;
    return data ? mapPlan(data) : null;
  },

  /** Cria ou atualiza um plano (upsert por name) */
  async upsert(plan: Partial<Plan> & { code: string }): Promise<Plan> {
    // Mapeia campos legados → colunas reais
    const payload = {
      name:                plan.code ?? plan.name,
      price_brl:           plan.price_monthly ?? 0,
      ai_credits_per_month: plan.credits_monthly ?? 0,
      max_students:        plan.max_entities ?? 5,
      is_active:           plan.is_active ?? true,
    };

    const { data, error } = await supabase
      .from('plans')
      .upsert(payload, { onConflict: 'name' })
      .select()
      .single();

    if (error) throw error;
    return mapPlan(data);
  },

  /** Ativa ou desativa um plano */
  async setActive(planId: string, active: boolean): Promise<void> {
    const { error } = await supabase
      .from('plans')
      .update({ is_active: active })
      .eq('id', planId);
    if (error) throw error;
  },
};

// ---------------------------------------------------------------------------
// ASSINATURAS
// ---------------------------------------------------------------------------

export const SubscriptionService = {
  /** Retorna a assinatura ativa de um tenant */
  async getForTenant(tenantId: string): Promise<Subscription | null> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('id, tenant_id, plan_id, status, current_period_start, current_period_end, provider, provider_sub_id, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    // Resolve planCode via plan_id
    let planCode = 'FREE';
    if (data.plan_id) {
      const { data: p } = await supabase.from('plans').select('name').eq('id', data.plan_id).maybeSingle();
      planCode = p?.name ?? 'FREE';
    }
    return mapSubscription(data, planCode);
  },

  /** Lista todas as assinaturas para o painel CEO */
  async listAll(filters?: { status?: SubscriptionStatus; is_test?: boolean }): Promise<Subscription[]> {
    // is_test_account não existe no schema real — ignora o filtro
    let q = supabase
      .from('subscriptions')
      .select('id, tenant_id, plan_id, status, current_period_start, current_period_end, provider, provider_sub_id, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (filters?.status) q = q.eq('status', filters.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((row: any) => mapSubscription(row));
  },

  /** Cria uma nova assinatura — usando apenas colunas reais do schema */
  async create(params: {
    tenantId: string;
    userId?: string;
    planCode: string;
    status?: SubscriptionStatus;
    isTestAccount?: boolean;
    billingProvider?: string;
    providerCustomerId?: string;
    providerSubscriptionId?: string;
    providerPaymentLink?: string;
    periodEnd?: string;
    courtesyReason?: string;
  }): Promise<Subscription> {
    const now = new Date().toISOString();
    const periodEnd = params.periodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Resolve plan_id a partir do planCode (nome do plano)
    const { data: planRow } = await supabase
      .from('plans')
      .select('id')
      .eq('name', params.planCode.toUpperCase())
      .maybeSingle();

    // Colunas REAIS de subscriptions:
    // id, tenant_id, plan_id (uuid FK), status,
    // current_period_start, current_period_end, provider, provider_sub_id
    const { data, error } = await supabase
      .from('subscriptions')
      .insert({
        tenant_id:            params.tenantId,
        plan_id:              planRow?.id ?? null,
        status:               params.status ?? 'ACTIVE',
        provider:             params.billingProvider ?? 'manual',
        provider_sub_id:      params.providerSubscriptionId ?? null,
        current_period_start: now,
        current_period_end:   periodEnd,
      })
      .select()
      .single();

    if (error) throw error;
    return mapSubscription(data, params.planCode);
  },

  /** Altera o status de uma assinatura (admin) */
  async updateStatus(tenantId: string, status: SubscriptionStatus, _reason?: string): Promise<void> {
    // Apenas colunas reais: status
    // NÃO EXISTEM: courtesy_reason, last_payment_status, status_assinatura (em tenants)
    const { error } = await supabase
      .from('subscriptions')
      .update({ status })
      .eq('tenant_id', tenantId);
    if (error) throw error;
  },

  /** Altera o plano de uma assinatura (admin) */
  async changePlan(tenantId: string, newPlanCode: string): Promise<void> {
    // Resolve plan_id pelo nome
    const { data: planRow } = await supabase
      .from('plans')
      .select('id')
      .eq('name', newPlanCode.toUpperCase())
      .maybeSingle();

    if (!planRow?.id) throw new Error(`Plano "${newPlanCode}" não encontrado.`);

    const { error } = await supabase
      .from('subscriptions')
      .update({ plan_id: planRow.id })
      .eq('tenant_id', tenantId);
    if (error) throw error;

    // Também atualiza tenants.plan_id
    await supabase.from('tenants').update({ plan_id: planRow.id }).eq('id', tenantId);
  },

  /** Cancela uma assinatura */
  async cancel(tenantId: string, _atPeriodEnd = true): Promise<void> {
    // cancel_at_period_end não existe — apenas atualiza status
    const { error } = await supabase
      .from('subscriptions')
      .update({ status: 'CANCELED' })
      .eq('tenant_id', tenantId);
    if (error) throw error;
  },

  /** Cria conta de teste sem pagamento */
  async createTestAccount(params: {
    tenantId: string;
    planCode: string;
    reason: string;
    grantedByName?: string;
  }): Promise<void> {
    const periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const existing = await SubscriptionService.getForTenant(params.tenantId);
    if (existing) {
      // Resolve plan_id
      const { data: planRow } = await supabase
        .from('plans')
        .select('id')
        .eq('name', params.planCode.toUpperCase())
        .maybeSingle();

      await supabase
        .from('subscriptions')
        .update({
          plan_id:            planRow?.id ?? null,
          status:             'INTERNAL_TEST',
          current_period_end: periodEnd,
        })
        .eq('tenant_id', params.tenantId);
    } else {
      await SubscriptionService.create({
        tenantId:        params.tenantId,
        planCode:        params.planCode,
        status:          'INTERNAL_TEST',
        billingProvider: 'manual',
        periodEnd,
      });
    }
    // admin_grants não existe — auditoria no-op
  },
};

// ---------------------------------------------------------------------------
// BILLING EVENTS (webhook log)
// ---------------------------------------------------------------------------

export const BillingEventsService = {
  /**
   * Registra um evento de webhook no billing_events.
   * Lança erro se provider_event_id duplicado (garante idempotência).
   */
  async log(event: {
    provider: string;
    eventType: string;
    providerEventId?: string;
    providerPaymentId?: string;
    providerSubscriptionId?: string;
    payload: Record<string, any>;
  }): Promise<string> {
    const { data, error } = await supabase
      .from('billing_events')
      .insert({
        provider:                 event.provider,
        event_type:               event.eventType,
        provider_event_id:        event.providerEventId ?? null,
        provider_payment_id:      event.providerPaymentId ?? null,
        provider_subscription_id: event.providerSubscriptionId ?? null,
        payload:                  event.payload,
        processed:                false,
      })
      .select('id')
      .single();

    if (error) {
      // Código 23505 = unique_violation (provider_event_id duplicado)
      if ((error as any).code === '23505') {
        throw new Error('duplicate_event');
      }
      throw error;
    }

    return data.id as string;
  },

  /** Atualiza o registro após processamento do webhook */
  async markProcessed(eventId: string, success: boolean, errorMessage?: string): Promise<void> {
    if (eventId.startsWith('noop-')) return; // compatibilidade legada

    const { error } = await supabase
      .from('billing_events')
      .update({
        processed:     true,
        processed_at:  new Date().toISOString(),
        success,
        error_message: errorMessage ?? null,
      })
      .eq('id', eventId);

    if (error) console.error('[BillingEventsService.markProcessed]', error);
  },

  /** Lista eventos recentes para o painel CEO */
  async list(limit = 50): Promise<BillingEvent[]> {
    const { data, error } = await supabase
      .from('billing_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[BillingEventsService.list]', error.message);
      return [];
    }

    return (data ?? []).map((row: any): BillingEvent => ({
      id:                      row.id,
      provider:                row.provider,
      event_type:              row.event_type,
      provider_event_id:       row.provider_event_id,
      provider_payment_id:     row.provider_payment_id,
      provider_subscription_id: row.provider_subscription_id,
      payload:                 row.payload,
      processed:               row.processed,
      processed_at:            row.processed_at,
      success:                 row.success,
      error_message:           row.error_message,
      created_at:              row.created_at,
    }));
  },

  async processKiwifyWebhook(payload: Record<string, any>): Promise<void> {
    try {
      const tenantId = payload.customer?.custom_id ?? payload.custom_id;
      if (!tenantId) return;

      const event = payload.event as string;

      if (event === 'order_approved' || event === 'subscription_first_charge') {
        const planCode = (payload.product?.name ?? '').toUpperCase().includes('MASTER') ? 'MASTER' : 'PRO';
        await SubscriptionService.changePlan(tenantId, planCode);
        await SubscriptionService.updateStatus(tenantId, 'ACTIVE');

        // Processa conversão de indicação (créditos ao referrer) — silencioso
        const userId = payload.customer?.user_id ?? payload.user_id ?? null;
        if (userId) {
          ReferralService.processConversion(userId, planCode).catch(() => {});
        }
      } else if (event === 'subscription_canceled' || event === 'subscription_overdue') {
        const status: SubscriptionStatus = event === 'subscription_overdue' ? 'OVERDUE' : 'CANCELED';
        await SubscriptionService.updateStatus(tenantId, status);
      }
    } catch (err: any) {
      console.warn('[BillingEventsService.processKiwifyWebhook]', err?.message);
    }
  },
};

// ---------------------------------------------------------------------------
// MAPPERS
// ---------------------------------------------------------------------------

function mapPlan(row: any): Plan {
  // Mapeia colunas reais → interface Plan (com aliases para compat)
  return {
    id: row.id,
    code: row.name ?? '',                          // plans.name é o "code"
    name: row.name,
    price_monthly: Number(row.price_brl ?? 0),    // coluna real: price_brl
    price_yearly: 0,
    credits_monthly: Number(row.ai_credits_per_month ?? 0),
    max_entities: Number(row.max_students ?? 5),  // coluna real: max_students
    features_json: [],
    is_active: row.is_active ?? true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// planCode é passado externamente pois não existe em subscriptions como texto
function mapSubscription(row: any, planCode = 'FREE'): Subscription {
  // Colunas REAIS: id, tenant_id, plan_id, status,
  //               current_period_start, current_period_end, provider, provider_sub_id
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    user_id: null,
    plan_code: planCode,
    status: row.status ?? 'PENDING',
    billing_provider: row.provider ?? null,
    provider_customer_id: null,
    provider_subscription_id: row.provider_sub_id ?? null,
    provider_payment_link: null,
    current_period_start: row.current_period_start ?? null,
    current_period_end: row.current_period_end ?? null,
    next_due_date: null,
    cancel_at_period_end: false,
    last_payment_status: null,
    is_test_account: false,
    courtesy_reason: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
