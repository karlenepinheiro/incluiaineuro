/**
 * asaas-webhook/index.ts
 * Edge Function — Receptor de webhooks do Asaas.
 *
 * O que faz:
 *   1. Valida o token de autenticação do Asaas (header asaas-access-token)
 *   2. Persiste o evento em billing_events (idempotência por provider_event_id)
 *   3. Processa via stored procedures (process_payment_approved, etc.)
 *   4. Retorna 200 rapidamente (Asaas espera resposta em < 5s)
 *
 * Configure no Asaas:
 *   Painel Asaas → Configurações → Notificações → Webhook
 *   URL: https://SEU_PROJECT.supabase.co/functions/v1/asaas-webhook
 *   Token: mesmo valor de ASAAS_WEBHOOK_SECRET
 *   Eventos: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE,
 *             PAYMENT_DELETED, PAYMENT_REFUNDED, PAYMENT_RESTORED,
 *             SUBSCRIPTION_CREATED, SUBSCRIPTION_UPDATED, SUBSCRIPTION_DELETED,
 *             SUBSCRIPTION_PAYMENT_CREATED
 *
 * Deploy:
 *   supabase functions deploy asaas-webhook --no-verify-jwt
 *   supabase secrets set ASAAS_WEBHOOK_SECRET=seu_token_secreto
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Secrets ──────────────────────────────────────────────────────────────────
const ASAAS_WEBHOOK_SECRET = Deno.env.get('ASAAS_WEBHOOK_SECRET')      ?? '';
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')              ?? '';
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ── Mapa de eventos Asaas → ações internas ───────────────────────────────────
const EVENT_ACTION_MAP: Record<string, string> = {
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

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // ── 1. Validar token do Asaas ─────────────────────────────────────────────
  if (ASAAS_WEBHOOK_SECRET) {
    const receivedToken = req.headers.get('asaas-access-token') ?? '';
    if (receivedToken !== ASAAS_WEBHOOK_SECRET) {
      console.warn('[asaas-webhook] Token inválido recebido');
      return new Response('Unauthorized', { status: 401 });
    }
  }

  // ── 2. Ler payload ────────────────────────────────────────────────────────
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const eventType         = String(payload['event']                      ?? '');
  const providerEventId   = String(payload['id']                         ?? (payload['payment'] as any)?.id ?? '');
  const providerSubId     = String((payload['subscription'] as any)?.id  ?? payload['subscriptionId'] ?? '');
  const providerPaymentId = String((payload['payment'] as any)?.id       ?? '');
  const mappedAction      = EVENT_ACTION_MAP[eventType]                  ?? 'unknown';

  console.log(`[asaas-webhook] ${eventType} → ${mappedAction} | sub: ${providerSubId}`);

  // ── 3. Supabase com service_role ──────────────────────────────────────────
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // ── 4. Persistir em billing_events (idempotência) ─────────────────────────
  const { data: eventRow, error: insertError } = await supabase
    .from('billing_events')
    .insert({
      provider:                 'asaas',
      event_type:               eventType,
      provider_event_id:        providerEventId   || null,
      provider_payment_id:      providerPaymentId || null,
      provider_subscription_id: providerSubId     || null,
      payload,
      processed:                false,
    })
    .select('id')
    .single();

  if (insertError) {
    if ((insertError as any).code === '23505') {
      console.log('[asaas-webhook] Evento duplicado, ignorado:', providerEventId);
      return jsonOk({ duplicate: true });
    }
    console.error('[asaas-webhook] Erro ao persistir:', insertError.message);
    return new Response('Database error', { status: 500 });
  }

  const eventId = eventRow?.id as string;

  // ── 5. Resolver tenant_id ─────────────────────────────────────────────────
  const tenantId = await resolveTenantId(supabase, payload, providerSubId);

  if (!tenantId) {
    await markProcessed(supabase, eventId, false, 'tenant_id não resolvido');
    console.warn('[asaas-webhook] tenant_id não encontrado, evento:', eventType);
    return jsonOk({ warning: 'no_tenant' });
  }

  // ── 6. Aplicar ação ───────────────────────────────────────────────────────
  try {
    await applyAction(supabase, mappedAction, tenantId, payload, providerSubId);
    await markProcessed(supabase, eventId, true);
    return jsonOk({ action: mappedAction, tenant: tenantId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await markProcessed(supabase, eventId, false, msg);
    console.error('[asaas-webhook] Erro ao processar ação:', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

type Supa = ReturnType<typeof createClient>;

async function resolveTenantId(
  supabase: Supa,
  payload: Record<string, unknown>,
  providerSubId: string
): Promise<string | null> {
  const extRef = (payload['externalReference']
    ?? (payload['payment'] as any)?.externalReference
    ?? (payload['subscription'] as any)?.externalReference) as string | undefined;
  if (extRef && extRef.length >= 32) return extRef;

  if (providerSubId) {
    const { data } = await supabase
      .from('subscriptions').select('tenant_id')
      .eq('provider_sub_id', providerSubId).maybeSingle();
    if (data?.tenant_id) return data.tenant_id as string;
  }

  const customerId = (payload['payment'] as any)?.customer
    ?? (payload['customer'] as any)?.id
    ?? (payload['subscription'] as any)?.customer;
  if (customerId) {
    const { data } = await supabase
      .from('subscriptions').select('tenant_id')
      .eq('provider_customer_id', customerId).maybeSingle();
    if (data?.tenant_id) return data.tenant_id as string;
  }
  return null;
}

async function applyAction(
  supabase: Supa,
  action: string,
  tenantId: string,
  payload: Record<string, unknown>,
  providerSubId: string
): Promise<void> {
  const planCode = resolvePlanCode(payload);

  switch (action) {
    case 'payment_approved':
    case 'subscription_renewal': {
      const CREDITS: Record<string, number> = { PRO: 50, MASTER: 70, INSTITUTIONAL: 9999, FREE: 0 };
      const credits   = CREDITS[planCode] ?? 0;
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.rpc('process_payment_approved', {
        p_tenant_id: tenantId, p_plan_code: planCode,
        p_credits: credits, p_period_end: periodEnd,
        p_provider_subscription_id: providerSubId || null,
      });
      if (error) throw error;
      const payLink = (payload['payment'] as any)?.invoiceUrl ?? payload['invoiceUrl'];
      if (payLink) await supabase.from('subscriptions')
        .update({ provider_payment_link: payLink, last_payment_status: 'paid' })
        .eq('tenant_id', tenantId);
      break;
    }
    case 'payment_overdue': {
      const { error } = await supabase.rpc('process_payment_overdue', { p_tenant_id: tenantId });
      if (error) throw error;
      const payLink = (payload['payment'] as any)?.invoiceUrl ?? payload['bankSlipUrl'];
      if (payLink) await supabase.from('subscriptions')
        .update({ provider_payment_link: payLink }).eq('tenant_id', tenantId);
      break;
    }
    case 'subscription_canceled':
    case 'payment_deleted': {
      const { error } = await supabase.rpc('process_subscription_canceled', { p_tenant_id: tenantId });
      if (error) throw error;
      break;
    }
    case 'payment_refunded':
      await supabase.from('subscriptions')
        .update({ status: 'CANCELED', last_payment_status: 'refunded' })
        .eq('tenant_id', tenantId);
      break;
    case 'payment_restored': {
      const { data: sub } = await supabase.from('subscriptions').select('status')
        .eq('tenant_id', tenantId).maybeSingle();
      if (sub?.status !== 'ACTIVE') await supabase.from('subscriptions')
        .update({ status: 'ACTIVE', last_payment_status: 'paid' }).eq('tenant_id', tenantId);
      break;
    }
    case 'subscription_created': {
      const sub = payload['subscription'] as any;
      const patch: Record<string, unknown> = { provider: 'asaas', status: 'ACTIVE' };
      if (sub?.id)                patch.provider_sub_id              = sub.id;
      if (sub?.customer)          patch.provider_customer_id         = sub.customer;
      if (sub?.paymentLink)       patch.provider_payment_link        = sub.paymentLink;
      if (sub?.updatePaymentLink) patch.provider_update_payment_link = sub.updatePaymentLink;
      await supabase.from('subscriptions').update(patch).eq('tenant_id', tenantId);
      break;
    }
    case 'subscription_updated': {
      const newStatus = (payload['subscription'] as any)?.status;
      if (newStatus) await supabase.from('subscriptions')
        .update({ status: String(newStatus).toUpperCase() }).eq('tenant_id', tenantId);
      break;
    }
    default:
      console.log(`[asaas-webhook] Evento sem ação: ${action}`);
  }
}

function resolvePlanCode(payload: Record<string, unknown>): string {
  const value = Number((payload['payment'] as any)?.value ?? payload['value'] ?? 0);
  const desc  = String(
    (payload['payment'] as any)?.description ??
    (payload['subscription'] as any)?.description ??
    payload['description'] ?? ''
  ).toUpperCase();
  if (desc.includes('MASTER') || desc.includes('CLÍNICA') || desc.includes('ESCOLA')) return 'MASTER';
  if (desc.includes('INSTITUTIONAL') || desc.includes('INSTITUCIONAL'))               return 'INSTITUTIONAL';
  if (desc.includes('PRO') || desc.includes('PROFISSIONAL'))                           return 'PRO';
  if (value >= 240) return 'INSTITUTIONAL';
  if (value >= 110) return 'MASTER';
  if (value >= 70)  return 'PRO';
  return 'FREE';
}

async function markProcessed(supabase: Supa, eventId: string, success: boolean, errorMessage?: string) {
  await supabase.from('billing_events').update({
    processed: true, processed_at: new Date().toISOString(),
    success, error_message: errorMessage ?? null,
  }).eq('id', eventId);
}

function jsonOk(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
