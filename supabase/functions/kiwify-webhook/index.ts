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
 * Secrets necessários (supabase secrets set KEY=VALUE):
 *   KIWIFY_WEBHOOK_SECRET  — chave secreta configurada na Kiwify
 *   SUPABASE_SERVICE_ROLE_KEY — já disponível automaticamente
 *   SUPABASE_URL              — já disponível automaticamente
 *
 * Mapeamento de eventos Kiwify:
 *   order_approved          → ativa assinatura OU concede créditos
 *   subscription_overdue    → marca assinatura como OVERDUE
 *   subscription_canceled   → marca assinatura como CANCELED
 *   subscription_renewed    → renova período + credita créditos mensais
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KIWIFY_SECRET         = Deno.env.get('KIWIFY_WEBHOOK_SECRET') ?? '';

// Planos: quantos créditos conceder na ativação/renovação
const PLAN_CREDITS: Record<string, number> = {
  PRO:    50,
  MASTER: 200,
};

Deno.serve(async (req: Request) => {
  // Apenas POST
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

  const event     = payload?.event ?? payload?.order_status ?? '';
  const order     = payload?.order ?? payload ?? {};
  const orderId   = order?.order_id ?? order?.id ?? crypto.randomUUID();
  const customer  = order?.customer ?? {};
  const product   = order?.product ?? {};
  const tracking  = order?.trackingParameters ?? order?.tracking_parameters ?? {};

  // tenant_id é passado como sck= na URL de checkout
  const tenantId  = tracking?.sck ?? tracking?.src ?? order?.external_reference ?? null;

  console.log(`[kiwify-webhook] event=${event} order=${orderId} tenant=${tenantId}`);

  if (!tenantId) {
    console.warn('[kiwify-webhook] tenant_id ausente — não foi possível identificar o usuário');
    // Retorna 200 para Kiwify não reenviar; registra no log
    return new Response(JSON.stringify({ ok: false, reason: 'missing_tenant_id' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
      planCode     = prod.plan_code;
      productType  = prod.product_type;
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

  let action = 'noop';

  try {
    // ── Processar evento ─────────────────────────────────────────────────
    if (event === 'order_approved' || event === 'approved') {

      if (productType === 'subscription' && planCode) {
        // Ativar/atualizar assinatura
        const { data: planRow } = await db
          .from('plans')
          .select('id')
          .eq('name', planCode)
          .maybeSingle();

        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        await db
          .from('subscriptions')
          .upsert({
            tenant_id:           tenantId,
            plan_id:             planRow?.id ?? null,
            status:              'ACTIVE',
            current_period_end:  periodEnd,
            provider:            'kiwify',
            provider_sub_id:     order?.subscription?.id ?? null,
          }, { onConflict: 'tenant_id' });

        // Creditar créditos mensais do plano
        const credits = PLAN_CREDITS[planCode] ?? 50;
        await addCredits(db, tenantId, credits, `Ativação plano ${planCode}`);

        action = `subscription_activated:${planCode}`;

      } else if (productType === 'credits' && creditsToGrant > 0) {
        // Compra avulsa de créditos
        await addCredits(db, tenantId, creditsToGrant, `Compra avulsa ${creditsToGrant} créditos`);
        action = `credits_granted:${creditsToGrant}`;
      }

    } else if (event === 'subscription_renewed') {
      // Renovação mensal
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await db
        .from('subscriptions')
        .update({ status: 'ACTIVE', current_period_end: periodEnd })
        .eq('tenant_id', tenantId);

      if (planCode) {
        const credits = PLAN_CREDITS[planCode] ?? 50;
        await addCredits(db, tenantId, credits, `Renovação mensal ${planCode}`);
      }

      action = 'subscription_renewed';

    } else if (event === 'subscription_overdue') {
      await db
        .from('subscriptions')
        .update({ status: 'OVERDUE' })
        .eq('tenant_id', tenantId);
      action = 'subscription_overdue';

    } else if (event === 'subscription_canceled' || event === 'refunded' || event === 'chargedback') {
      await db
        .from('subscriptions')
        .update({ status: 'CANCELED' })
        .eq('tenant_id', tenantId);
      action = 'subscription_canceled';
    }

  } catch (err: any) {
    console.error('[kiwify-webhook] Erro ao processar evento:', err?.message);
    // Registra mesmo assim para auditoria
    action = `error:${err?.message ?? 'unknown'}`;
  }

  // ── Registrar no log (idempotência futura) ────────────────────────────
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
  // Tenta update; se não existir, cria
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

  // Ledger
  await db.from('credits_ledger').insert({
    tenant_id:   tenantId,
    amount:      amount,
    type:        'credit',
    description: reason,
    source:      'kiwify_webhook',
  }).then(() => {}).catch(() => {}); // ledger é não-crítico
}
