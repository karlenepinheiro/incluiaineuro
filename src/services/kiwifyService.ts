/**
 * kiwifyService.ts
 * Integração com Kiwify — checkout links + helper de webhook.
 *
 * Como funciona:
 *   1. Usuário clica "Assinar" → abre checkout Kiwify com sck=TENANT_ID
 *   2. Kiwify processa pagamento
 *   3. Kiwify chama nosso webhook (Edge Function kiwify-webhook)
 *   4. Webhook atualiza plan + créditos no banco
 *
 * Configuração necessária no .env:
 *   VITE_KIWIFY_PRO_URL=https://kiwify.app/SEU-LINK-PRO
 *   VITE_KIWIFY_MASTER_URL=https://kiwify.app/SEU-LINK-MASTER
 *   VITE_KIWIFY_CREDITS10_URL=https://kiwify.app/SEU-LINK-CREDITS10
 *   VITE_KIWIFY_CREDITS30_URL=https://kiwify.app/SEU-LINK-CREDITS30
 *   VITE_KIWIFY_CREDITS100_URL=https://kiwify.app/SEU-LINK-CREDITS100
 */

import { supabase } from './supabase';

// ── Produtos cadastrados no Supabase (carregados uma vez) ─────────────────────
let cachedProducts: KiwifyProduct[] | null = null;

export interface KiwifyProduct {
  kiwify_product_id: string;
  product_name: string;
  product_type: 'subscription' | 'credits';
  plan_code: string | null;
  credits_amount: number;
  price_brl: number;
  checkout_url: string;
}

/**
 * Carrega os produtos cadastrados na tabela kiwify_products.
 * Fallback para URLs de env se o banco ainda não foi preenchido.
 */
export async function getKiwifyProducts(): Promise<KiwifyProduct[]> {
  if (cachedProducts) return cachedProducts;

  try {
    const { data, error } = await supabase
      .from('kiwify_products')
      .select('kiwify_product_id, product_name, product_type, plan_code, credits_amount, price_brl, checkout_url')
      .eq('is_active', true);

    if (error) throw error;
    if (data && data.length > 0) {
      cachedProducts = data as KiwifyProduct[];
      return cachedProducts;
    }
  } catch {
    // banco não configurado — usa env fallback
  }

  // Fallback com env vars (útil antes de rodar a migration)
  cachedProducts = buildEnvFallback();
  return cachedProducts;
}

function buildEnvFallback(): KiwifyProduct[] {
  const env = (import.meta as any).env ?? {};
  return [
    {
      kiwify_product_id: 'env_pro',
      product_name: 'Plano Pro',
      product_type: 'subscription',
      plan_code: 'PRO',
      credits_amount: 0,
      price_brl: 79.90,
      checkout_url: env.VITE_KIWIFY_PRO_URL ?? '#',
    },
    {
      kiwify_product_id: 'env_master',
      product_name: 'Plano Master',
      product_type: 'subscription',
      plan_code: 'MASTER',
      credits_amount: 0,
      price_brl: 149.90,
      checkout_url: env.VITE_KIWIFY_MASTER_URL ?? '#',
    },
    {
      kiwify_product_id: 'env_c10',
      product_name: '+10 créditos IA',
      product_type: 'credits',
      plan_code: null,
      credits_amount: 10,
      price_brl: 9.90,
      checkout_url: env.VITE_KIWIFY_CREDITS10_URL ?? '#',
    },
    {
      kiwify_product_id: 'env_c30',
      product_name: '+30 créditos IA',
      product_type: 'credits',
      plan_code: null,
      credits_amount: 30,
      price_brl: 19.90,
      checkout_url: env.VITE_KIWIFY_CREDITS30_URL ?? '#',
    },
    {
      kiwify_product_id: 'env_c100',
      product_name: '+100 créditos IA',
      product_type: 'credits',
      plan_code: null,
      credits_amount: 100,
      price_brl: 49.90,
      checkout_url: env.VITE_KIWIFY_CREDITS100_URL ?? '#',
    },
  ];
}

/**
 * Retorna a URL de checkout para um plano de assinatura.
 * Injeta sck=TENANT_ID para que o webhook identifique o usuário.
 */
export async function getSubscriptionCheckoutUrl(planCode: 'PRO' | 'MASTER', tenantId: string): Promise<string> {
  const products = await getKiwifyProducts();
  const product = products.find(p => p.product_type === 'subscription' && p.plan_code === planCode);
  if (!product || product.checkout_url === '#') return '#';
  return appendTrackingParam(product.checkout_url, tenantId);
}

/**
 * Retorna a URL de checkout para um pacote de créditos.
 * Injeta sck=TENANT_ID para que o webhook identifique o usuário.
 */
export async function getCreditsCheckoutUrl(creditsAmount: number, tenantId: string): Promise<string> {
  const products = await getKiwifyProducts();
  const product = products.find(p => p.product_type === 'credits' && p.credits_amount === creditsAmount);
  if (!product || product.checkout_url === '#') return '#';
  return appendTrackingParam(product.checkout_url, tenantId);
}

/** Injeta sck (tracking param Kiwify) = tenantId na URL */
function appendTrackingParam(url: string, tenantId: string): string {
  if (!tenantId || url === '#') return url;
  try {
    const u = new URL(url);
    u.searchParams.set('sck', tenantId);
    return u.toString();
  } catch {
    return `${url}?sck=${encodeURIComponent(tenantId)}`;
  }
}

/**
 * Retorna true se os links de Kiwify estão configurados.
 * Útil para esconder botões de pagamento quando não está configurado.
 */
export async function isKiwifyConfigured(): Promise<boolean> {
  const products = await getKiwifyProducts();
  const pro = products.find(p => p.plan_code === 'PRO');
  return !!(pro && pro.checkout_url && pro.checkout_url !== '#');
}

/**
 * Invalida o cache para forçar reload dos produtos do banco.
 */
export function clearKiwifyCache(): void {
  cachedProducts = null;
}
