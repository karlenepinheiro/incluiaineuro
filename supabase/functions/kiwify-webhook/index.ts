/**
 * Edge Function: kiwify-webhook
 * Recebe eventos da Kiwify e atualiza assinatura/créditos do usuário.
 *
 * Deploy:
 *   supabase functions deploy kiwify-webhook --no-verify-jwt
 *
 * URL de produção:
 *   https://hvjczfncppaodebopbvd.supabase.co/functions/v1/kiwify-webhook
 *
 * Secrets necessários:
 *   KIWIFY_WEBHOOK_SECRET        — chave configurada na Kiwify (opcional)
 *   SUPABASE_SERVICE_ROLE_KEY    — disponível automaticamente
 *   SUPABASE_URL                 — disponível automaticamente
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const KIWIFY_SECRET        = Deno.env.get('KIWIFY_WEBHOOK_SECRET') ?? '';

// Créditos mensais por plano
const PLAN_CREDITS: Record<string, number> = {
  PRO:     500,
  MASTER:  700,
  PREMIUM: 700,
};

// IDs fixos dos planos — fallback quando plans.name tem case inesperado
const PLAN_IDS: Record<string, string> = {
  FREE:   'c4dd657f-9b0c-4d91-8c76-fc46c9bf5a29',
  PRO:    '4be988af-1054-4169-9d42-8be4c1633681',
  MASTER: '49fe4d61-97bd-4181-a272-1114ca7f6916',
};

// Mapeamento hardcoded de product IDs reais da Kiwify → plan_code
// Fallback crítico: garante ativação mesmo quando kiwify_products não tem o registro
const PRODUCT_ID_MAP: Record<string, { planCode: string; creditsAmount: number; productType: 'subscription' | 'credits' }> = {
  'fa763da0-2d2c-11f1-a3f6-2761766c7eda': { planCode: 'MASTER', creditsAmount: 700, productType: 'subscription' }, // PREMIUM ANUAL
  'da18e220-2d30-11f1-b691-1b4aa493422c': { planCode: 'PRO',    creditsAmount: 500, productType: 'subscription' }, // PLANO PRO ANUAL
};

// Mapeamento explícito de nomes reais da Kiwify → plan_code
// Ordem importa: padrões mais específicos primeiro
const PRODUCT_NAME_MAP: Array<[RegExp, string]> = [
  [/premium\s+anual/i,      'MASTER'],
  [/master\s+anual/i,       'MASTER'],
  [/premium\s+mensal/i,     'MASTER'],
  [/master\s+mensal/i,      'MASTER'],
  [/plano\s+pro\s+anual/i,  'PRO'],
  [/pro\s+anual/i,          'PRO'],
  [/plano\s+pro\s+mensal/i, 'PRO'],
  [/pro\s+mensal/i,         'PRO'],
  [/\bpremium\b/i,          'MASTER'],
  [/\bmaster\b/i,           'MASTER'],
  [/\bpro\b/i,              'PRO'],
];

function normalizeProductName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

function inferPlanFromName(name: string): string | null {
  const normalized = normalizeProductName(name);
  for (const [pattern, code] of PRODUCT_NAME_MAP) {
    if (pattern.test(normalized) || pattern.test(name)) return code;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const reqId    = crypto.randomUUID().slice(0, 8);
  const startMs  = Date.now();

  // ── Log inicial: método + URL ──────────────────────────────────────────────
  console.log(`[kiwify/${reqId}] ═══ REQUEST START ═══ method=${req.method} url=${req.url}`);

  // ── Log de todos os headers recebidos ─────────────────────────────────────
  const headersObj: Record<string, string> = {};
  req.headers.forEach((v, k) => { headersObj[k] = v; });
  console.log(`[kiwify/${reqId}] HEADERS: ${JSON.stringify(headersObj)}`);

  if (req.method !== 'POST') {
    console.warn(`[kiwify/${reqId}] Método rejeitado: ${req.method}`);
    return new Response('Method Not Allowed', { status: 405 });
  }

  // ── Assinatura (NÃO-BLOQUEANTE) ───────────────────────────────────────────
  const signature =
    req.headers.get('kiwify-signature') ??
    req.headers.get('x-kiwify-signature') ??
    req.headers.get('signature') ??
    '';

  if (KIWIFY_SECRET) {
    if (signature === KIWIFY_SECRET) {
      console.log(`[kiwify/${reqId}] ✅ Assinatura válida`);
    } else {
      console.warn(
        `[kiwify/${reqId}] ⚠️ ASSINATURA INVÁLIDA — secret começa com "${KIWIFY_SECRET.slice(0, 8)}..."` +
        ` header="${signature.slice(0, 30)}" — CONTINUANDO (modo auditoria)`
      );
    }
  } else {
    console.log(`[kiwify/${reqId}] ℹ️ KIWIFY_WEBHOOK_SECRET não configurado — aceitando sem validação`);
  }

  // ── Lê body como texto (para log), depois parseia JSON ────────────────────
  let bodyText = '';
  try {
    bodyText = await req.text();
  } catch (e) {
    console.error(`[kiwify/${reqId}] ❌ Falha ao ler body: ${e}`);
    return new Response('Bad Request — cannot read body', { status: 400 });
  }

  console.log(`[kiwify/${reqId}] BODY (primeiros 3000 chars): ${bodyText.slice(0, 3000)}`);

  // ── Wraps toda a lógica em try-catch para garantir HTTP 200 ───────────────
  let action = 'error:unexpected';
  try {
    action = await processWebhook(reqId, bodyText, headersObj);
  } catch (err: any) {
    console.error(
      `[kiwify/${reqId}] ❌ ERRO NÃO TRATADO: ${err?.message}` +
      `\nStack: ${err?.stack ?? 'sem stack'}`
    );
    action = `unhandled_error:${err?.message ?? 'unknown'}`;
  }

  const elapsed = Date.now() - startMs;
  console.log(`[kiwify/${reqId}] ═══ CONCLUÍDO em ${elapsed}ms: ${action} ═══`);

  return new Response(JSON.stringify({ ok: true, action, reqId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lógica principal — separada para simplificar o try-catch acima
// ─────────────────────────────────────────────────────────────────────────────
async function processWebhook(
  reqId: string,
  bodyText: string,
  headersObj: Record<string, string>
): Promise<string> {

  // ── Parseia JSON ──────────────────────────────────────────────────────────
  let payload: any;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    console.error(`[kiwify/${reqId}] ❌ JSON inválido — body não é JSON válido`);
    // Retorna sem lançar — garantimos 200 mesmo assim
    return 'error:invalid_json';
  }

  // ── Log diagnóstico completo do payload ───────────────────────────────────
  console.log('FULL PAYLOAD =', JSON.stringify(payload, null, 2));

  // ── Extração dos campos principais ────────────────────────────────────────
  // Kiwify usa tanto formato com wrapper "order" (legado) quanto payload plano com
  // chaves capitalizadas Product/Customer (formato atual observado em produção).
  // Kiwify pode enviar: event, order_status, payment_status, ou type
  const event =
    payload?.event ??
    payload?.order_status ??
    payload?.payment_status ??
    payload?.type ??
    '';
  const order = payload?.order ?? payload ?? {};

  // Customer: tenta wrapper order (legado), depois capitalized na raiz, depois lowercase na raiz
  const customer =
    order?.customer ??
    order?.Customer ??
    payload?.Customer ??
    payload?.customer ??
    {};

  // Product: tenta todos os formatos conhecidos da Kiwify (raiz capitalizada tem prioridade)
  const product =
    payload?.Product ||
    payload?.product ||
    order?.Product ||
    order?.product ||
    {};

  console.log('RAW PRODUCT =', JSON.stringify(product, null, 2));

  // order_id: tenta raiz do payload diretamente (formato real Kiwify) e dentro de order
  const orderId =
    payload?.order_id ??
    order?.order_id ??
    order?.id ??
    payload?.id ??
    crypto.randomUUID();

  // trackingParameters: alguns payloads colocam na raiz
  const tracking =
    order?.trackingParameters ??
    order?.tracking_parameters ??
    payload?.trackingParameters ??
    payload?.tracking_parameters ??
    {};

  const tenantId =
    tracking?.sck ??
    tracking?.src ??
    order?.external_reference ??
    payload?.external_reference ??
    null;

  const customerEmail = (
    customer?.email ??
    customer?.Email ??
    payload?.customer_email ??
    ''
  ).trim().toLowerCase();

  // Kiwify envia product_name (não name) e product_id (não id) no objeto Product
  const rawProductName: string =
    product?.product_name ||
    product?.name ||
    product?.Name ||
    payload?.Product?.product_name ||
    payload?.Product?.name ||
    payload?.Product?.Name ||
    payload?.product?.product_name ||
    payload?.product?.name ||
    payload?.product?.Name ||
    payload?.product_name ||
    '';

  const productName = String(rawProductName);

  console.log(
    'PRODUCT NAME DETECTED =',
    rawProductName || '(vazio — nenhum campo encontrado)'
  );

  const kiwifyProductId = String(
    product?.product_id ||
    product?.id ||
    product?.Id ||
    payload?.product_id ||
    ''
  );

  // ── Log diagnóstico completo ───────────────────────────────────────────────
  console.log(
    `[kiwify/${reqId}] ═══ CAMPOS EXTRAÍDOS ═══\n` +
    `  event          = "${event}"\n` +
    `  orderId        = "${orderId}"\n` +
    `  email          = "${customerEmail}"\n` +
    `  produto.id     = "${kiwifyProductId}"\n` +
    `  produto.name   = "${productName}"\n` +
    `  tenant_id      = "${tenantId ?? 'NULL (compra direta)'}"`
  );

  if (!customerEmail) {
    console.warn(
      `[kiwify/${reqId}] ⚠️ EMAIL VAZIO — customer=${JSON.stringify(customer)} payload_keys=${Object.keys(payload ?? {}).join(',')}`
    );
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Idempotência: verifica kiwify_webhook_logs ───────────────────────────
  const { data: existingLog, error: existingErr } = await db
    .from('kiwify_webhook_logs')
    .select('id')
    .eq('kiwify_order_id', orderId)
    .maybeSingle();

  if (existingErr) {
    console.warn(`[kiwify/${reqId}] ⚠️ Erro ao consultar kiwify_webhook_logs: ${existingErr.message}`);
  }

  if (existingLog) {
    console.log(`[kiwify/${reqId}] ⏩ Evento duplicado ignorado (já em kiwify_webhook_logs): orderId=${orderId}`);
    return 'duplicate:already_logged';
  }

  // ── Identificar produto/plano ─────────────────────────────────────────────
  let planCode: string | null = null;
  let creditsToGrant = 0;
  let productType: 'subscription' | 'credits' = 'subscription';

  // 1. Tenta tabela kiwify_products (mapeamento por product ID)
  if (kiwifyProductId) {
    const { data: prod, error: prodErr } = await db
      .from('kiwify_products')
      .select('plan_code, credits_amount, product_type')
      .eq('kiwify_product_id', kiwifyProductId)
      .maybeSingle();

    if (prodErr) {
      console.warn(`[kiwify/${reqId}] ⚠️ Erro ao consultar kiwify_products: ${prodErr.message}`);
    } else if (prod) {
      planCode       = prod.plan_code;
      productType    = prod.product_type;
      creditsToGrant = prod.credits_amount ?? 0;
      console.log(`[kiwify/${reqId}] ✅ Produto em kiwify_products: plan_code=${planCode} type=${productType}`);
    } else {
      console.log(`[kiwify/${reqId}] ℹ️ Produto ID "${kiwifyProductId}" não está em kiwify_products — usando fallback por nome`);
    }
  }

  // 2. Cross-validação: nome corrige dado errado em kiwify_products
  if (planCode && productName) {
    const nameLower = productName.toLowerCase();
    if ((nameLower.includes('master') || nameLower.includes('premium')) && planCode === 'PRO') {
      console.warn(
        `[kiwify/${reqId}] ⚠️ DADO INCORRETO em kiwify_products: product_id="${kiwifyProductId}"` +
        ` tem plan_code=PRO mas nome "${productName}" indica MASTER. Corrigindo.`
      );
      planCode = 'MASTER';
    }
  }

  // 2b. Fallback hardcoded por product_id (IDs reais da Kiwify, caso kiwify_products esteja vazio)
  if (!planCode && creditsToGrant === 0 && kiwifyProductId && PRODUCT_ID_MAP[kiwifyProductId]) {
    const mapping = PRODUCT_ID_MAP[kiwifyProductId];
    planCode       = mapping.planCode;
    productType    = mapping.productType;
    creditsToGrant = mapping.creditsAmount;
    console.log(`[kiwify/${reqId}] ✅ Produto mapeado por PRODUCT_ID_MAP hardcoded: "${kiwifyProductId}" → ${planCode} (${creditsToGrant} créditos)`);
  }

  // 3. Fallback por nome quando kiwify_products não retornou resultado
  if (!planCode && creditsToGrant === 0 && productName) {
    const inferredPlan = inferPlanFromName(productName);
    if (inferredPlan) {
      planCode    = inferredPlan;
      productType = 'subscription';
      console.log(`[kiwify/${reqId}] 🔄 Plano inferido por nome "${productName}" → ${planCode}`);
    } else if (/cr[eé]dito/i.test(productName)) {
      productType = 'credits';
      const m = productName.match(/(\d+)\s*cr[eé]dito/i);
      if (m) {
        creditsToGrant = parseInt(m[1], 10);
        console.log(`[kiwify/${reqId}] 🔄 Créditos inferidos por nome "${productName}" → ${creditsToGrant}`);
      } else {
        console.warn(`[kiwify/${reqId}] ⚠️ Não foi possível extrair créditos do nome: "${productName}"`);
      }
    } else {
      console.warn(
        `[kiwify/${reqId}] ⚠️ Produto não reconhecido: id="${kiwifyProductId}" name="${productName}"`
      );
    }
  }

  // ── Status da compra ───────────────────────────────────────────────────────
  const isApproved = [
    'order_approved',
    'approved',
    'subscription_first_charge',
    'order_paid',
    'payment_approved',
    'subscription_activated',
    'purchase_approved',
    'paid',
  ].includes(event);

  const isCanceled = [
    'subscription_canceled',
    'refunded',
    'chargedback',
    'order_refunded',
    'chargeback',
  ].includes(event);

  const purchaseStatus = isApproved ? 'APPROVED' : isCanceled ? 'CANCELED' : 'PENDING';

  console.log(
    `[kiwify/${reqId}] status extraído: event="${event}" → purchaseStatus=${purchaseStatus}` +
    ` isApproved=${isApproved} planCode=${planCode} productType=${productType} creditsToGrant=${creditsToGrant}`
  );

  // ── billing_cycle ──────────────────────────────────────────────────────────
  const isAnnual    = /anual|annual/i.test(productName) || /annual/i.test(kiwifyProductId);
  const billingCycle: 'monthly' | 'annual' = isAnnual ? 'annual' : 'monthly';

  // ── product_key ────────────────────────────────────────────────────────────
  let productKey: string;
  if (planCode && productType === 'subscription') {
    productKey = `${planCode}_${billingCycle === 'annual' ? 'ANNUAL' : 'MONTHLY'}`;
  } else if (productType === 'credits' && creditsToGrant > 0) {
    productKey = `CREDITS_${creditsToGrant}`;
  } else {
    productKey = 'UNKNOWN';
    if (isApproved) {
      console.error(
        `[kiwify/${reqId}] ❌ PRODUTO UNKNOWN em compra APROVADA` +
        ` — order="${orderId}" product.id="${kiwifyProductId}" product.name="${productName}".` +
        ` Salvo em kiwify_purchases mas NÃO ativado. Cadastre o produto em kiwify_products.`
      );
    }
  }

  console.log(`[kiwify/${reqId}] productKey=${productKey} billingCycle=${billingCycle}`);

  console.log('FINAL PRODUCT PARSE =', {
    rawProductName,
    normalizedProductName: normalizeProductName(rawProductName),
    productKey,
    planCode,
    creditsAmount: creditsToGrant,
  });

  // ── Salva em kiwify_purchases (SEMPRE, mesmo sem tenant_id) ───────────────
  if (customerEmail) {
    const purchasePayload = {
      email:             customerEmail,
      product_key:       productKey,
      plan_code:         planCode,
      credits_amount:    creditsToGrant,
      provider_order_id: orderId,
      status:            purchaseStatus,
      payload:           payload,
      paid_at:           isApproved ? new Date().toISOString() : null,
      tenant_id:         tenantId,
    };
    console.log(`[kiwify/${reqId}] Tentando upsert em kiwify_purchases: ${JSON.stringify({
      email: purchasePayload.email,
      product_key: purchasePayload.product_key,
      plan_code: purchasePayload.plan_code,
      status: purchasePayload.status,
      provider_order_id: purchasePayload.provider_order_id,
    })}`);

    const { error: upsertErr } = await db
      .from('kiwify_purchases')
      .upsert(purchasePayload, { onConflict: 'provider_order_id' });

    if (upsertErr) {
      console.error(
        `[kiwify/${reqId}] ❌ FALHA AO SALVAR kiwify_purchases` +
        ` — email=${customerEmail} error="${upsertErr.message}" code=${upsertErr.code}` +
        ` details="${upsertErr.details ?? ''}" hint="${upsertErr.hint ?? ''}"`
      );
    } else {
      console.log(
        `[kiwify/${reqId}] ✅ Salvo em kiwify_purchases` +
        ` — email=${customerEmail} status=${purchaseStatus} productKey=${productKey} tenant_id=${tenantId ?? 'NULL'}`
      );
    }
  } else {
    console.warn(
      `[kiwify/${reqId}] ⚠️ EMAIL VAZIO — NÃO salvo em kiwify_purchases. customer=${JSON.stringify(customer)}`
    );
  }

  let action = 'purchase_logged';

  // ── Resolução de tenant por email (compra sem parâmetro de rastreio) ───────
  // Se não veio tenant_id no checkout mas a compra foi aprovada, tenta localizar
  // o usuário pelo e-mail para ativar imediatamente sem esperar o próximo login.
  let effectiveTenantId = tenantId;
  if (!effectiveTenantId && customerEmail && isApproved && planCode && productKey !== 'UNKNOWN') {
    const { data: userRow, error: userLookupErr } = await db
      .from('users')
      .select('id, tenant_id')
      .eq('email', customerEmail)
      .maybeSingle();

    if (userLookupErr) {
      console.warn(`[kiwify/${reqId}] ⚠️ Erro ao buscar usuário por email: ${userLookupErr.message}`);
    } else if (userRow?.tenant_id) {
      effectiveTenantId = userRow.tenant_id;
      console.log(`[kiwify/${reqId}] 📧 Tenant resolvido via email "${customerEmail}" → ${effectiveTenantId}`);
      // Atualiza kiwify_purchases já salvo com o tenant_id resolvido
      await db
        .from('kiwify_purchases')
        .update({ tenant_id: effectiveTenantId })
        .eq('provider_order_id', orderId);
    } else {
      console.log(`[kiwify/${reqId}] 📧 Email "${customerEmail}" não encontrado em users — compra aguarda criação de conta`);
    }
  }

  // ── Ativação imediata (tenant_id disponível via checkout ou resolução por email) ─
  if (effectiveTenantId) {
    try {
      if (isApproved) {

        if (productKey === 'UNKNOWN') {
          console.error(`[kiwify/${reqId}] ❌ Produto UNKNOWN — ativação bloqueada tenant=${effectiveTenantId}`);
          action = 'blocked:unknown_product';

        } else if (productType === 'subscription' && planCode) {
          const normalizedPlanCode = planCode === 'PREMIUM' ? 'MASTER' : planCode;

          let resolvedPlanId: string | null = PLAN_IDS[normalizedPlanCode] ?? null;
          if (!resolvedPlanId) {
            const { data: planRow, error: planErr } = await db
              .from('plans')
              .select('id')
              .ilike('name', normalizedPlanCode)
              .maybeSingle();
            if (planErr) console.error(`[kiwify/${reqId}] ❌ Erro ao buscar plano: ${planErr.message}`);
            resolvedPlanId = planRow?.id ?? null;
          }

          if (!resolvedPlanId) {
            throw new Error(`Plano "${normalizedPlanCode}" não encontrado em plans nem em PLAN_IDS.`);
          }

          const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

          const { data: updatedSub, error: updateSubErr } = await db
            .from('subscriptions')
            .update({
              plan_id:            resolvedPlanId,
              status:             'ACTIVE',
              current_period_end: periodEnd,
              provider:           'kiwify',
              billing_cycle:      billingCycle,
            })
            .eq('tenant_id', effectiveTenantId)
            .select('id')
            .maybeSingle();

          if (updateSubErr) throw new Error(`subscriptions update failed: ${updateSubErr.message}`);

          if (!updatedSub) {
            const { error: insertSubErr } = await db
              .from('subscriptions')
              .insert({
                tenant_id:          effectiveTenantId,
                plan_id:            resolvedPlanId,
                status:             'ACTIVE',
                current_period_end: periodEnd,
                provider:           'kiwify',
                billing_cycle:      billingCycle,
              });
            if (insertSubErr) throw new Error(`subscriptions insert failed: ${insertSubErr.message}`);
          }

          const { data: tenantUser } = await db
            .from('users')
            .select('id')
            .eq('tenant_id', effectiveTenantId)
            .limit(1)
            .maybeSingle();

          if (tenantUser?.id) {
            const { error: profileErr } = await db
              .from('profiles')
              .update({ plan: normalizedPlanCode })
              .eq('id', tenantUser.id);
            if (profileErr) {
              console.warn(`[kiwify/${reqId}] ⚠️ profiles.plan não atualizado: ${profileErr.message}`);
            }
          }

          const credits = PLAN_CREDITS[normalizedPlanCode] ?? 0;
          await setCredits(db, effectiveTenantId, credits, `Ativação plano ${normalizedPlanCode} (${billingCycle})`, 'monthly_grant', reqId);
          action = `subscription_activated:${normalizedPlanCode}_${billingCycle}`;

          await db
            .from('kiwify_purchases')
            .update({ activated_at: new Date().toISOString(), tenant_id: effectiveTenantId })
            .eq('provider_order_id', orderId);

          console.log(`[kiwify/${reqId}] ✅ Assinatura ativada: tenant=${effectiveTenantId} plano=${normalizedPlanCode} ciclo=${billingCycle} créditos=${credits}`);

        } else if (productType === 'credits' && creditsToGrant > 0) {
          const { data: activeSub } = await db
            .from('subscriptions')
            .select('status, plans(name)')
            .eq('tenant_id', effectiveTenantId)
            .eq('status', 'ACTIVE')
            .maybeSingle();

          const subPlanName: string = ((activeSub as any)?.plans?.name ?? '').toUpperCase();
          const isEligible = ['PRO', 'MASTER', 'PREMIUM'].includes(subPlanName);

          if (isEligible) {
            await addCredits(db, effectiveTenantId, creditsToGrant, `Compra avulsa ${creditsToGrant} créditos`, 'purchase_extra', reqId);
            action = `credits_granted:${creditsToGrant}`;

            await db
              .from('kiwify_purchases')
              .update({ activated_at: new Date().toISOString(), tenant_id: effectiveTenantId })
              .eq('provider_order_id', orderId);

            console.log(`[kiwify/${reqId}] ✅ Créditos concedidos: tenant=${effectiveTenantId} amount=${creditsToGrant}`);
          } else {
            console.warn(
              `[kiwify/${reqId}] ⚠️ Créditos avulsos bloqueados — tenant=${effectiveTenantId} plan=${subPlanName || 'FREE/nenhum'}`
            );
            action = `credits_blocked:plan=${subPlanName || 'FREE'}`;
          }
        }

      } else if (event === 'subscription_renewed') {
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await db.from('subscriptions').update({ status: 'ACTIVE', current_period_end: periodEnd }).eq('tenant_id', effectiveTenantId);

        let effectivePlanCode = planCode;
        if (!effectivePlanCode) {
          const { data: currentSub } = await db
            .from('subscriptions')
            .select('plans(name)')
            .eq('tenant_id', effectiveTenantId)
            .eq('status', 'ACTIVE')
            .maybeSingle();
          effectivePlanCode = ((currentSub as any)?.plans?.name ?? '').toUpperCase() || null;
        }

        if (effectivePlanCode) {
          const normalized = effectivePlanCode === 'PREMIUM' ? 'MASTER' : effectivePlanCode;
          const credits = PLAN_CREDITS[normalized] ?? 0;
          if (credits > 0) {
            await setCredits(db, effectiveTenantId, credits, `Renovação mensal ${normalized}`, 'monthly_grant', reqId);
          }
        } else {
          console.warn(`[kiwify/${reqId}] ⚠️ subscription_renewed sem planCode — tenant=${effectiveTenantId}. Créditos NÃO concedidos.`);
        }
        action = 'subscription_renewed';

      } else if (event === 'subscription_overdue') {
        const { error } = await db.from('subscriptions').update({ status: 'OVERDUE' }).eq('tenant_id', effectiveTenantId);
        if (error) console.error(`[kiwify/${reqId}] Falha ao marcar OVERDUE: ${error.message}`);
        action = 'subscription_overdue';

      } else if (isCanceled) {
        const { error } = await db.from('subscriptions').update({ status: 'CANCELED' }).eq('tenant_id', effectiveTenantId);
        if (error) console.error(`[kiwify/${reqId}] Falha ao marcar CANCELED: ${error.message}`);
        action = 'subscription_canceled';
      }

    } catch (err: any) {
      console.error(`[kiwify/${reqId}] ❌ Erro ao processar ativação: ${err?.message}`);
      action = `error_activation:${err?.message ?? 'unknown'}`;
    }

  } else {
    // Compra sem tenant_id — registrada, ativação ocorrerá no primeiro login
    if (isApproved && productKey !== 'UNKNOWN') {
      action = 'purchase_approved_pending_activation';
      console.log(
        `[kiwify/${reqId}] ⏳ Compra aprovada aguardando conta: email=${customerEmail}` +
        ` productKey=${productKey} — usuário ainda não criou conta no sistema.`
      );
    } else if (isApproved && productKey === 'UNKNOWN') {
      action = 'purchase_approved_unknown_product';
    } else if (!isApproved && !isCanceled) {
      action = `event_logged:${event}`;
    }
  }

  // ── Grava em kiwify_webhook_logs (sempre, com processed_at) ───────────────
  const logPayload = {
    kiwify_order_id: orderId,
    event_type:      event,
    tenant_id:       effectiveTenantId,
    plan_code:       planCode,
    credits_granted: creditsToGrant,
    raw_payload:     payload,
    processed_at:    new Date().toISOString(),
  };

  console.log(`[kiwify/${reqId}] Inserindo em kiwify_webhook_logs: orderId=${orderId} event=${event}`);

  const { error: logErr } = await db.from('kiwify_webhook_logs').insert(logPayload);

  if (logErr) {
    console.error(
      `[kiwify/${reqId}] ❌ FALHA ao inserir kiwify_webhook_logs` +
      ` — error="${logErr.message}" code=${logErr.code} details="${logErr.details ?? ''}" hint="${logErr.hint ?? ''}"`
    );
  } else {
    console.log(`[kiwify/${reqId}] ✅ kiwify_webhook_logs inserido com sucesso`);
  }

  console.log(`[kiwify/${reqId}] retorno final HTTP 200: action=${action}`);
  return action;
}

// ── setCredits: RESETA o saldo da carteira para `amount` ──────────────────────
async function setCredits(
  db: any,
  tenantId: string,
  amount: number,
  reason: string,
  ledgerType: 'monthly_grant' | 'courtesy' | 'manual_grant',
  reqId: string
) {
  if (amount <= 0) return;

  const { error: walletErr } = await db
    .from('credits_wallet')
    .upsert(
      { tenant_id: tenantId, balance: amount, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id' }
    );

  if (walletErr) {
    console.error(`[kiwify/${reqId}] ❌ Falha ao resetar credits_wallet: ${walletErr.message}`);
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
    console.error(`[kiwify/${reqId}] ⚠️ Falha ao inserir credits_ledger (não crítico): ${ledgerErr.message}`);
  }
}

// ── addCredits: INCREMENTA o saldo da carteira ────────────────────────────────
async function addCredits(
  db: any,
  tenantId: string,
  amount: number,
  reason: string,
  ledgerType: 'purchase_extra' | 'manual_grant' | 'courtesy',
  reqId: string
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
      console.error(`[kiwify/${reqId}] ❌ Falha ao incrementar credits_wallet: ${error.message}`);
      throw new Error(`credits_wallet update failed: ${error.message}`);
    }
  } else {
    const { error } = await db
      .from('credits_wallet')
      .insert({ tenant_id: tenantId, balance: amount });
    if (error) {
      console.error(`[kiwify/${reqId}] ❌ Falha ao criar credits_wallet: ${error.message}`);
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
    console.error(`[kiwify/${reqId}] ⚠️ Falha ao inserir credits_ledger (não crítico): ${ledgerErr.message}`);
  }
}
