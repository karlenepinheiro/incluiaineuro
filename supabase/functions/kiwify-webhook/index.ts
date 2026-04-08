/**
 * Edge Function: kiwify-webhook
 * Recebe eventos da Kiwify e atualiza assinatura/créditos do usuário.
 *
 * Deploy:
 *   supabase functions deploy kiwify-webhook
 *
 * Secrets necessários:
 *   KIWIFY_WEBHOOK_SECRET        — chave configurada na Kiwify
 *   SUPABASE_SERVICE_ROLE_KEY    — disponível automaticamente
 *   SUPABASE_URL                 — disponível automaticamente
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KIWIFY_SECRET        = Deno.env.get('KIWIFY_WEBHOOK_SECRET') ?? '';

// Créditos mensais por plano (fonte de verdade para ativação e renovação)
const PLAN_CREDITS: Record<string, number> = {
  PRO:     500,
  MASTER:  700,
  PREMIUM: 700, // alias de MASTER
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

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

  // tenant_id passado como sck= na URL de checkout
  const tenantId      = tracking?.sck ?? tracking?.src ?? order?.external_reference ?? null;
  const customerEmail = (customer?.email ?? '').trim().toLowerCase();

  console.log(`[kiwify-webhook] event=${event} order=${orderId} tenant=${tenantId} email=${customerEmail}`);

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Idempotência ─────────────────────────────────────────────────────────────
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

  // ── Identificar produto/plano ─────────────────────────────────────────────────
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

  // Cross-validação: nome do produto tem prioridade sobre dado errado em kiwify_products
  if (planCode && product?.name) {
    const nameLower = (product.name as string).toLowerCase();
    if ((nameLower.includes('master') || nameLower.includes('premium')) && planCode === 'PRO') {
      console.warn(
        `[kiwify-webhook] DADO INCORRETO em kiwify_products: product_id=${kiwifyProductId} ` +
        `tem plan_code=PRO mas nome "${product.name}" indica MASTER. Corrigindo.`
      );
      planCode = 'MASTER';
    }
  }

  // Fallback: inferir pelo nome quando kiwify_products não retornou resultado
  if (!planCode && creditsToGrant === 0 && product?.name) {
    const nameLower = (product.name as string).toLowerCase();
    if (nameLower.includes('master') || nameLower.includes('premium')) {
      planCode    = 'MASTER';
      productType = 'subscription';
    } else if (nameLower.includes('pro')) {
      planCode    = 'PRO';
      productType = 'subscription';
    } else if (nameLower.includes('crédito') || nameLower.includes('credito')) {
      productType = 'credits';
      const m = nameLower.match(/(\d+)\s*cr[eé]dito/);
      if (m) {
        creditsToGrant = parseInt(m[1], 10);
      } else {
        console.warn('[kiwify-webhook] Não foi possível extrair créditos do nome:', product.name);
      }
    }
  }

  // ── Status da compra ──────────────────────────────────────────────────────────
  const isApproved = ['order_approved', 'approved', 'subscription_first_charge'].includes(event);
  const isCanceled = ['subscription_canceled', 'refunded', 'chargedback'].includes(event);
  const purchaseStatus = isApproved ? 'APPROVED' : isCanceled ? 'CANCELED' : 'PENDING';

  // ── product_key + billing_cycle ───────────────────────────────────────────────
  let productKey: string;
  // billing_cycle vem do product_type ou do nome do produto
  const rawProductName = String(product?.name ?? '').toLowerCase();
  const isAnnual = rawProductName.includes('anual') || rawProductName.includes('annual') ||
    (kiwifyProductId && kiwifyProductId.toString().toLowerCase().includes('annual'));
  const billingCycle: 'monthly' | 'annual' = isAnnual ? 'annual' : 'monthly';

  if (planCode && productType === 'subscription') {
    productKey = `${planCode}_${billingCycle === 'annual' ? 'ANNUAL' : 'MONTHLY'}`;
  } else if (productType === 'credits' && creditsToGrant > 0) {
    productKey = `CREDITS_${creditsToGrant}`;
  } else {
    productKey = 'UNKNOWN';
    if (isApproved) {
      console.error(
        `[kiwify-webhook] Produto UNKNOWN — order=${orderId} product.id=${kiwifyProductId} ` +
        `product.name=${product?.name}. Compra salva mas NÃO será ativada.`
      );
    }
  }

  // ── Salva em kiwify_purchases ─────────────────────────────────────────────────
  if (customerEmail) {
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

  // ── Ativação imediata (tenant_id disponível) ───────────────────────────────────
  if (tenantId) {
    try {
      if (isApproved) {

        if (productKey === 'UNKNOWN') {
          console.error(`[kiwify-webhook] Produto UNKNOWN — ativação bloqueada tenant=${tenantId} order=${orderId}`);
          action = 'blocked:unknown_product';

        } else if (productType === 'subscription' && planCode) {
          const normalizedPlanCode = planCode === 'PREMIUM' ? 'MASTER' : planCode;

          // Resolve plan_id
          const { data: planRow, error: planErr } = await db
            .from('plans')
            .select('id')
            .eq('name', normalizedPlanCode)
            .maybeSingle();

          if (planErr || !planRow?.id) {
            const msg = `Plano "${normalizedPlanCode}" não encontrado em plans. ` +
              'Execute fix_billing_v6.sql para normalizar os nomes.';
            console.error('[kiwify-webhook]', msg);
            throw new Error(msg);
          }

          const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

          // Atualiza subscription — inclui billing_cycle
          const { data: updatedSub, error: updateSubErr } = await db
            .from('subscriptions')
            .update({
              plan_id:            planRow.id,
              status:             'ACTIVE',
              current_period_end: periodEnd,
              provider:           'kiwify',
              billing_cycle:      billingCycle,   // ← novo
            })
            .eq('tenant_id', tenantId)
            .select('id')
            .maybeSingle();

          if (updateSubErr) {
            throw new Error(`subscriptions update failed: ${updateSubErr.message}`);
          }

          if (!updatedSub) {
            const { error: insertSubErr } = await db
              .from('subscriptions')
              .insert({
                tenant_id:          tenantId,
                plan_id:            planRow.id,
                status:             'ACTIVE',
                current_period_end: periodEnd,
                provider:           'kiwify',
                billing_cycle:      billingCycle,   // ← novo
              });
            if (insertSubErr) {
              throw new Error(`subscriptions insert failed: ${insertSubErr.message}`);
            }
          }

          const credits = PLAN_CREDITS[normalizedPlanCode] ?? 0;
          // RESET: zera créditos FREE antes de aplicar os do plano pago
          await setCredits(db, tenantId, credits, `Ativação plano ${normalizedPlanCode} (${billingCycle})`, 'monthly_grant');
          action = `subscription_activated:${normalizedPlanCode}_${billingCycle}`;

          if (customerEmail) {
            await db
              .from('kiwify_purchases')
              .update({ activated_at: new Date().toISOString(), tenant_id: tenantId })
              .eq('provider_order_id', orderId);
          }

        } else if (productType === 'credits' && creditsToGrant > 0) {
          const { data: activeSub } = await db
            .from('subscriptions')
            .select('status, plans(name)')
            .eq('tenant_id', tenantId)
            .eq('status', 'ACTIVE')
            .maybeSingle();

          const subPlanName: string = ((activeSub as any)?.plans?.name ?? '').toUpperCase();
          const isEligible = ['PRO', 'MASTER', 'PREMIUM'].includes(subPlanName);

          if (isEligible) {
            // INCREMENTA: compra avulsa soma sobre o saldo existente
            await addCredits(db, tenantId, creditsToGrant, `Compra avulsa ${creditsToGrant} créditos`, 'purchase_extra');
            action = `credits_granted:${creditsToGrant}`;

            if (customerEmail) {
              await db
                .from('kiwify_purchases')
                .update({ activated_at: new Date().toISOString(), tenant_id: tenantId })
                .eq('provider_order_id', orderId);
            }
          } else {
            console.warn(
              `[kiwify-webhook] Créditos avulsos bloqueados — tenant=${tenantId} plan=${subPlanName || 'FREE/nenhum'}.`
            );
            action = `credits_blocked:plan=${subPlanName || 'FREE'}`;
          }
        }

      } else if (event === 'subscription_renewed') {
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await db
          .from('subscriptions')
          .update({ status: 'ACTIVE', current_period_end: periodEnd })
          .eq('tenant_id', tenantId);

        let effectivePlanCode = planCode;
        if (!effectivePlanCode) {
          const { data: currentSub } = await db
            .from('subscriptions')
            .select('plans(name)')
            .eq('tenant_id', tenantId)
            .eq('status', 'ACTIVE')
            .maybeSingle();
          effectivePlanCode = ((currentSub as any)?.plans?.name ?? '').toUpperCase() || null;
        }

        if (effectivePlanCode) {
          const normalized = effectivePlanCode === 'PREMIUM' ? 'MASTER' : effectivePlanCode;
          const credits = PLAN_CREDITS[normalized] ?? 0;
          if (credits > 0) {
            // RENOVAÇÃO: reseta o saldo para os créditos do plano (descarta sobras do mês anterior)
            await setCredits(db, tenantId, credits, `Renovação mensal ${normalized}`, 'monthly_grant');
          }
        } else {
          console.warn(`[kiwify-webhook] subscription_renewed sem planCode — tenant=${tenantId}. Créditos NÃO concedidos.`);
        }
        action = 'subscription_renewed';

      } else if (event === 'subscription_overdue') {
        const { error } = await db.from('subscriptions').update({ status: 'OVERDUE' }).eq('tenant_id', tenantId);
        if (error) console.error('[kiwify-webhook] Falha ao marcar OVERDUE:', error.message);
        action = 'subscription_overdue';

      } else if (isCanceled) {
        const { error } = await db.from('subscriptions').update({ status: 'CANCELED' }).eq('tenant_id', tenantId);
        if (error) console.error('[kiwify-webhook] Falha ao marcar CANCELED:', error.message);
        action = 'subscription_canceled';
      }

    } catch (err: any) {
      console.error('[kiwify-webhook] Erro ao processar evento:', err?.message);
      action = `error:${err?.message ?? 'unknown'}`;
    }

  } else {
    console.log(`[kiwify-webhook] Sem tenant_id — compra salva por e-mail: ${customerEmail} productKey=${productKey}`);
    if (isApproved && productKey !== 'UNKNOWN') action = 'purchase_approved_pending_activation';
    if (isApproved && productKey === 'UNKNOWN')  action = 'purchase_approved_unknown_product';
  }

  // ── Log ───────────────────────────────────────────────────────────────────────
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

// ── setCredits: RESETA o saldo da carteira para `amount` ──────────────────────
// Usar em ativações e renovações de plano — zera créditos FREE antes de aplicar
// os créditos do plano pago.
async function setCredits(
  db: any,
  tenantId: string,
  amount: number,
  reason: string,
  ledgerType: 'monthly_grant' | 'courtesy' | 'manual_grant' = 'monthly_grant'
) {
  if (amount <= 0) return;

  // Upsert com SET (não incrementa)
  const { error: walletErr } = await db
    .from('credits_wallet')
    .upsert(
      { tenant_id: tenantId, balance: amount, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id' }
    );

  if (walletErr) {
    console.error('[kiwify-webhook] Falha ao resetar credits_wallet:', walletErr.message);
    throw new Error(`credits_wallet set failed: ${walletErr.message}`);
  }

  const { error: ledgerErr } = await db.from('credits_ledger').insert({
    tenant_id:   tenantId,
    amount:      amount,
    type:        ledgerType,
    description: reason,
    source:      'kiwify_webhook',
  });

  if (ledgerErr) {
    console.error('[kiwify-webhook] Falha ao inserir credits_ledger (não crítico):', ledgerErr.message);
  }
}

// ── addCredits: INCREMENTA o saldo da carteira ────────────────────────────────
// Usar apenas para compras avulsas de créditos.
async function addCredits(
  db: any,
  tenantId: string,
  amount: number,
  reason: string,
  ledgerType: 'purchase_extra' | 'manual_grant' | 'courtesy' = 'purchase_extra'
) {
  if (amount <= 0) return;

  const { data: wallet } = await db
    .from('credits_wallet')
    .select('balance')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (wallet) {
    const { error } = await db
      .from('credits_wallet')
      .update({ balance: Number(wallet.balance ?? 0) + amount, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId);
    if (error) {
      console.error('[kiwify-webhook] Falha ao incrementar credits_wallet:', error.message);
      throw new Error(`credits_wallet update failed: ${error.message}`);
    }
  } else {
    const { error } = await db
      .from('credits_wallet')
      .insert({ tenant_id: tenantId, balance: amount });
    if (error) {
      console.error('[kiwify-webhook] Falha ao criar credits_wallet:', error.message);
      throw new Error(`credits_wallet insert failed: ${error.message}`);
    }
  }

  const { error: ledgerErr } = await db.from('credits_ledger').insert({
    tenant_id:   tenantId,
    amount:      amount,
    type:        ledgerType,
    description: reason,
    source:      'kiwify_webhook',
  });

  if (ledgerErr) {
    console.error('[kiwify-webhook] Falha ao inserir credits_ledger (não crítico):', ledgerErr.message);
  }
}
