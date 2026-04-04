/**
 * Edge Function: kiwify-webhook
 * Recebe eventos da Kiwify e atualiza assinatura/créditos do usuário.
 *
 * Deploy:
 *   supabase functions deploy kiwify-webhook
 *
 * URL do webhook para configurar na Kiwify:
 *   https://<PROJECT_REF>.supabase.co/functions/v1/kiwify-webhook
 *
 * URL de redirecionamento pós-pagamento (configurar na Kiwify):
 *   https://<SEU_DOMINIO>/?activate=1
 *
 * Secrets necessários (supabase secrets set KEY=VALUE):
 *   KIWIFY_WEBHOOK_SECRET  — chave secreta configurada na Kiwify
 *   SUPABASE_SERVICE_ROLE_KEY — já disponível automaticamente
 *   SUPABASE_URL              — já disponível automaticamente
 *
 * Mapeamento de eventos Kiwify:
 *   order_approved          → salva kiwify_purchases + ativa assinatura OU concede créditos (se tenant_id disponível)
 *   subscription_overdue    → marca assinatura como OVERDUE
 *   subscription_canceled   → marca assinatura como CANCELED
 *   subscription_renewed    → renova período + credita créditos mensais
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KIWIFY_SECRET        = Deno.env.get('KIWIFY_WEBHOOK_SECRET') ?? '';

// Planos: quantos créditos conceder na ativação/renovação
const PLAN_CREDITS: Record<string, number> = {
  PRO:     500,
  MASTER:  700,
  PREMIUM: 700, // alias de MASTER
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Verificar assinatura Kiwify (header kiwify-signature)
  const signature = req.headers.get('kiwify-signature') ?? '';
  if (KIWIFY_SECRET && signature !== KIWIFY_SECRET) {
    console.warn('[kiwify-webhook] Assinatura inválida:', signature);
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad Request — invalid JSON', { status: 400 });
  }

  const event    = payload?.event ?? payload?.order_status ?? '';
  const order    = payload?.order ?? payload ?? {};
  const orderId  = order?.order_id ?? order?.id ?? crypto.randomUUID();
  const customer = order?.customer ?? {};
  const product  = order?.product ?? {};
  const tracking = order?.trackingParameters ?? order?.tracking_parameters ?? {};

  // tenant_id é passado como sck= na URL de checkout (opcional — pode ser null para compradores não logados)
  const tenantId = tracking?.sck ?? tracking?.src ?? order?.external_reference ?? null;

  // e-mail do comprador — fonte de verdade para ativação sem tenant_id
  const customerEmail = (customer?.email ?? '').trim().toLowerCase();

  console.log(`[kiwify-webhook] event=${event} order=${orderId} tenant=${tenantId} email=${customerEmail}`);

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Idempotência: verificar se já processamos este order ─────────────────
  const { data: existing } = await db
    .from('kiwify_webhook_logs')
    .select('id')
    .eq('kiwify_order_id', orderId)
    .maybeSingle();

  if (existing) {
    console.log('[kiwify-webhook] Evento duplicado ignorado:', orderId);
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Identificar o produto/plano ──────────────────────────────────────────
  const kiwifyProductId = product?.id ?? '';
  let planCode: string | null = null;
  let creditsToGrant = 0;
  let productType: 'subscription' | 'credits' = 'subscription';

  if (kiwifyProductId) {
    const { data: prod } = await db
      .from('kiwify_products')
      .select('plan_code, credits_amount, product_type')
      .eq('kiwify_product_id', kiwifyProductId)
      .maybeSingle();

    if (prod) {
      planCode       = prod.plan_code;
      productType    = prod.product_type;
      creditsToGrant = prod.credits_amount ?? 0;
    }
  }

  // Fallback: inferir plano pelo nome do produto
  if (!planCode && product?.name) {
    const nameLower = (product.name as string).toLowerCase();
    if (nameLower.includes('master') || nameLower.includes('premium')) planCode = 'MASTER';
    else if (nameLower.includes('pro')) planCode = 'PRO';
    else if (nameLower.includes('crédito') || nameLower.includes('credito')) productType = 'credits';
  }

  // ── Determinar status para kiwify_purchases ──────────────────────────────
  const isApproved = ['order_approved', 'approved', 'subscription_first_charge'].includes(event);
  const isCanceled = ['subscription_canceled', 'refunded', 'chargedback'].includes(event);
  const purchaseStatus = isApproved ? 'APPROVED' : isCanceled ? 'CANCELED' : 'PENDING';

  // ── Salvar em kiwify_purchases (sempre, independente de ter tenant_id) ───
  // Esta tabela é a fonte de verdade para o fluxo de ativação por e-mail.
  if (customerEmail) {
    const productKey = planCode
      ? `${planCode}_${productType === 'subscription' ? 'MONTHLY' : 'ONESHOT'}`
      : creditsToGrant > 0 ? `CREDITS_${creditsToGrant}` : 'UNKNOWN';

    await db
      .from('kiwify_purchases')
      .upsert(
        {
          email:             customerEmail,
          product_key:       productKey,
          plan_code:         planCode,
          credits_amount:    creditsToGrant,
          provider_order_id: orderId,
          status:            purchaseStatus,
          payload:           payload,
          paid_at:           isApproved ? new Date().toISOString() : null,
          tenant_id:         tenantId,
        },
        { onConflict: 'provider_order_id' }
      )
      .then(() => {})
      .catch((e: any) => console.warn('[kiwify-webhook] Falha ao salvar kiwify_purchases:', e?.message));
  }

  let action = 'purchase_logged';

  // ── Processar ativação imediata (só quando tenant_id está disponível) ────
  // Compradores não logados terão o plano ativado depois, via ActivationView.
  if (tenantId) {
    try {
      if (isApproved) {
        if (productType === 'subscription' && planCode) {
          const { data: planRow } = await db
            .from('plans')
            .select('id')
            .eq('name', planCode)
            .maybeSingle();

          const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

          await db
            .from('subscriptions')
            .upsert(
              {
                tenant_id:           tenantId,
                plan_id:             planRow?.id ?? null,
                status:              'ACTIVE',
                current_period_end:  periodEnd,
                provider:            'kiwify',
                provider_sub_id:     order?.subscription?.id ?? null,
              },
              { onConflict: 'tenant_id' }
            );

          const credits = PLAN_CREDITS[planCode] ?? 0;
          await addCredits(db, tenantId, credits, `Ativação plano ${planCode}`);
          action = `subscription_activated:${planCode}`;

        } else if (productType === 'credits' && creditsToGrant > 0) {
          await addCredits(db, tenantId, creditsToGrant, `Compra avulsa ${creditsToGrant} créditos`);
          action = `credits_granted:${creditsToGrant}`;
        }

      } else if (event === 'subscription_renewed') {
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await db
          .from('subscriptions')
          .update({ status: 'ACTIVE', current_period_end: periodEnd })
          .eq('tenant_id', tenantId);

        if (planCode) {
          const credits = PLAN_CREDITS[planCode] ?? 0;
          await addCredits(db, tenantId, credits, `Renovação mensal ${planCode}`);
        }
        action = 'subscription_renewed';

      } else if (event === 'subscription_overdue') {
        await db.from('subscriptions').update({ status: 'OVERDUE' }).eq('tenant_id', tenantId);
        action = 'subscription_overdue';

      } else if (isCanceled) {
        await db.from('subscriptions').update({ status: 'CANCELED' }).eq('tenant_id', tenantId);
        action = 'subscription_canceled';
      }

    } catch (err: any) {
      console.error('[kiwify-webhook] Erro ao processar evento:', err?.message);
      action = `error:${err?.message ?? 'unknown'}`;
    }
  } else {
    // Sem tenant_id: comprador não estava logado.
    // O plano será ativado quando o usuário fizer login/cadastro via ActivationView.
    console.log(`[kiwify-webhook] Sem tenant_id — compra salva por e-mail: ${customerEmail}`);
    if (isApproved) action = 'purchase_approved_pending_activation';
  }

  // ── Registrar no log (idempotência futura) ────────────────────────────────
  await db.from('kiwify_webhook_logs').insert({
    kiwify_order_id: orderId,
    event_type:      event,
    tenant_id:       tenantId,
    plan_code:       planCode,
    credits_granted: creditsToGrant,
    raw_payload:     payload,
  });

  console.log(`[kiwify-webhook] Concluído: ${action}`);
  return new Response(JSON.stringify({ ok: true, action }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

// ── Helper: adiciona créditos à carteira ─────────────────────────────────────
async function addCredits(db: any, tenantId: string, amount: number, reason: string) {
  const { data: wallet } = await db
    .from('credits_wallet')
    .select('balance')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (wallet) {
    await db
      .from('credits_wallet')
      .update({ balance: Number(wallet.balance ?? 0) + amount })
      .eq('tenant_id', tenantId);
  } else {
    await db
      .from('credits_wallet')
      .insert({ tenant_id: tenantId, balance: amount });
  }

  await db
    .from('credits_ledger')
    .insert({
      tenant_id:   tenantId,
      amount:      amount,
      type:        'credit',
      description: reason,
      source:      'kiwify_webhook',
    })
    .then(() => {})
    .catch(() => {}); // ledger é não-crítico
}