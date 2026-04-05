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
 * Regras de parcelamento:
 *   - subscription_monthly → sem parcelamento (recorrência mensal)
 *   - subscription_annual  → com parcelamento (pagamento único anual)
 *   - credits              → com parcelamento (pagamento único avulso)
 *
 * Configuração necessária no .env:
 *   VITE_KIWIFY_PRO_MONTHLY_URL=https://kiwify.app/SEU-LINK-PRO-MENSAL
 *   VITE_KIWIFY_PRO_ANNUAL_URL=https://kiwify.app/SEU-LINK-PRO-ANUAL
 *   VITE_KIWIFY_MASTER_MONTHLY_URL=https://kiwify.app/SEU-LINK-MASTER-MENSAL
 *   VITE_KIWIFY_MASTER_ANNUAL_URL=https://kiwify.app/SEU-LINK-MASTER-ANUAL
 *   VITE_KIWIFY_CREDITS100_URL=https://kiwify.app/SEU-LINK-CREDITS100
 *   VITE_KIWIFY_CREDITS300_URL=https://kiwify.app/SEU-LINK-CREDITS300
 *   VITE_KIWIFY_CREDITS900_URL=https://kiwify.app/SEU-LINK-CREDITS900
 *
 * Retrocompatibilidade (env legado sem distinção mensal/anual):
 *   VITE_KIWIFY_PRO_URL e VITE_KIWIFY_MASTER_URL ainda são lidos como fallback
 *   mensal quando as variáveis específicas não estiverem definidas.
 */

import { supabase } from './supabase';
import { LandingService } from './landingService';

// ── Cache interno ─────────────────────────────────────────────────────────────
let cachedProducts: KiwifyProduct[] | null = null;

/**
 * Tipo de produto Kiwify.
 *
 * - subscription_monthly : assinatura recorrente mensal → SEM parcelamento
 * - subscription_annual  : assinatura anual (pagamento único) → COM parcelamento
 * - credits              : pacote avulso de créditos → COM parcelamento
 */
export type KiwifyProductType = 'subscription_monthly' | 'subscription_annual' | 'credits';

export interface KiwifyProduct {
  kiwify_product_id: string;
  product_name: string;
  /**
   * Tipo do produto. Pode vir do banco como 'subscription' (legado) — nesse caso
   * assume-se 'subscription_monthly' para manter retrocompatibilidade.
   */
  product_type: KiwifyProductType | 'subscription';
  plan_code: string | null;
  credits_amount: number;
  price_brl: number;
  checkout_url: string;
  /** Ciclo de cobrança explícito (coluna opcional na tabela — pode ser null no banco legado). */
  billing_cycle?: 'monthly' | 'annual' | null;
}

/**
 * Retorna true se o produto deve permitir parcelamento no checkout.
 * Regra: apenas produtos de pagamento único (anual ou avulso) permitem parcelamento.
 */
export function productAllowsInstallments(product: KiwifyProduct): boolean {
  // Créditos avulsos sempre permitem parcelamento
  if (product.product_type === 'credits') return true;

  // Assinatura anual permite parcelamento
  if (product.product_type === 'subscription_annual') return true;

  // billing_cycle explícito prevalece sobre product_type legado
  if (product.billing_cycle === 'annual') return true;

  // Assinatura mensal (qualquer variante) não permite parcelamento
  return false;
}

// ── Carga de produtos ─────────────────────────────────────────────────────────

/**
 * Carrega os produtos cadastrados na tabela kiwify_products.
 * Fallback para URLs de env se o banco ainda não foi preenchido.
 */
export async function getKiwifyProducts(): Promise<KiwifyProduct[]> {
  if (cachedProducts) return cachedProducts;

  // 1. Tenta construir a partir do landing_content (editado pelo CEO)
  try {
    const landingSections = await LandingService.getActive();
    const kiwifySection = landingSections.find(s => s.section_key === 'kiwify');
    const creditosSection = landingSections.find(s => s.section_key === 'creditos');
    const planosSection = landingSections.find(s => s.section_key === 'planos');

    if (kiwifySection && kiwifySection.content_json.pro_monthly_url) {
      const links = kiwifySection.content_json;
      const creditPackages = creditosSection?.content_json.packages ?? [];
      const proPrice = planosSection?.content_json.pro_discount_price ?? 59;
      const premiumPrice = planosSection?.content_json.premium_discount_price ?? 99;

      const products: KiwifyProduct[] = [
        { kiwify_product_id: 'ceo_pro_monthly', product_name: 'Plano Pro - Mensal', product_type: 'subscription_monthly', billing_cycle: 'monthly', plan_code: 'PRO', credits_amount: 0, price_brl: proPrice, checkout_url: links.pro_monthly_url },
        { kiwify_product_id: 'ceo_pro_annual', product_name: 'Plano Pro - Anual', product_type: 'subscription_annual', billing_cycle: 'annual', plan_code: 'PRO', credits_amount: 0, price_brl: (proPrice * 12) * 0.8, checkout_url: links.pro_annual_url },
        { kiwify_product_id: 'ceo_premium_monthly', product_name: 'Plano Premium - Mensal', product_type: 'subscription_monthly', billing_cycle: 'monthly', plan_code: 'MASTER', credits_amount: 0, price_brl: premiumPrice, checkout_url: links.premium_monthly_url },
        { kiwify_product_id: 'ceo_premium_annual', product_name: 'Plano Premium - Anual', product_type: 'subscription_annual', billing_cycle: 'annual', plan_code: 'MASTER', credits_amount: 0, price_brl: (premiumPrice * 12) * 0.8, checkout_url: links.premium_annual_url },
      ];

      const creditPackageUrls: Record<string, string> = {
        '100': links.credits_100_url,
        '300': links.credits_300_url,
        '900': links.credits_900_url,
      };

      creditPackages.forEach((pkg: any) => {
        const creditsKey = String(pkg.credits);
        if (creditPackageUrls[creditsKey]) {
          products.push({
            kiwify_product_id: `ceo_credits_${pkg.credits}`,
            product_name: `+${pkg.credits} créditos IA`,
            product_type: 'credits',
            billing_cycle: null,
            plan_code: null,
            credits_amount: pkg.credits,
            price_brl: pkg.price,
            checkout_url: creditPackageUrls[creditsKey],
          });
        }
      });

      cachedProducts = products.filter(p => p.checkout_url && p.checkout_url.startsWith('http'));
      if (cachedProducts.length > 0) {
        return cachedProducts;
      }
    }
  } catch (e) {
    console.warn('[kiwifyService] Could not build products from landing_content, falling back.', e);
  }

  // 2. Fallback para tabela kiwify_products
  try {
    const { data, error } = await supabase
      .from('kiwify_products')
      .select(
        'kiwify_product_id, product_name, product_type, plan_code, credits_amount, price_brl, checkout_url, billing_cycle'
      )
      .eq('is_active', true);

    if (error) throw error;
    if (data && data.length > 0) {
      cachedProducts = data as KiwifyProduct[];
      return cachedProducts;
    }
  } catch {
    // banco não configurado — usa env fallback
  }

  // 3. Fallback final para variáveis de ambiente
  cachedProducts = buildEnvFallback();
  return cachedProducts;
}

// ── Links oficiais Kiwify (fonte única de verdade) ────────────────────────────
const OFFICIAL_LINKS = {
  pro_monthly:     'https://pay.kiwify.com.br/U0RRsel',
  pro_annual:      'https://pay.kiwify.com.br/Mqcsie2',
  master_monthly:  'https://pay.kiwify.com.br/yVg81A2',
  master_annual:   'https://pay.kiwify.com.br/Ux6O9pR',
  credits_100:     'https://pay.kiwify.com.br/TZltLsS',
  credits_300:     'https://pay.kiwify.com.br/H1eyllS',
  credits_900:     'https://pay.kiwify.com.br/NqCj3Ks',
};

function buildEnvFallback(): KiwifyProduct[] {
  const env = (import.meta as any).env ?? {};

  // Lê variáveis de ambiente (VITE_KIWIFY_CHECKOUT_*) com fallback para os links oficiais
  const proMonthlyUrl    = env.VITE_KIWIFY_CHECKOUT_PRO          ?? OFFICIAL_LINKS.pro_monthly;
  const proAnnualUrl     = env.VITE_KIWIFY_CHECKOUT_PRO_ANNUAL   ?? OFFICIAL_LINKS.pro_annual;
  const masterMonthlyUrl = env.VITE_KIWIFY_CHECKOUT_MASTER       ?? OFFICIAL_LINKS.master_monthly;
  const masterAnnualUrl  = env.VITE_KIWIFY_CHECKOUT_MASTER_ANNUAL ?? OFFICIAL_LINKS.master_annual;
  const credits100Url    = env.VITE_KIWIFY_CHECKOUT_AI100        ?? OFFICIAL_LINKS.credits_100;
  const credits300Url    = env.VITE_KIWIFY_CHECKOUT_AI300        ?? OFFICIAL_LINKS.credits_300;
  const credits900Url    = env.VITE_KIWIFY_CHECKOUT_AI900        ?? OFFICIAL_LINKS.credits_900;

  return [
    // ── Assinaturas mensais (sem parcelamento) ────────────────────────────────
    {
      kiwify_product_id: 'env_pro_monthly',
      product_name: 'Plano Pro — Mensal',
      product_type: 'subscription_monthly',
      billing_cycle: 'monthly',
      plan_code: 'PRO',
      credits_amount: 0,
      price_brl: 67.00,
      checkout_url: proMonthlyUrl,
    },
    {
      kiwify_product_id: 'env_master_monthly',
      product_name: 'Plano Premium — Mensal',
      product_type: 'subscription_monthly',
      billing_cycle: 'monthly',
      plan_code: 'MASTER',
      credits_amount: 0,
      price_brl: 147.00,
      checkout_url: masterMonthlyUrl,
    },
    // ── Assinaturas anuais (com parcelamento) ─────────────────────────────────
    {
      kiwify_product_id: 'env_pro_annual',
      product_name: 'Plano Pro — Anual',
      product_type: 'subscription_annual',
      billing_cycle: 'annual',
      plan_code: 'PRO',
      credits_amount: 0,
      price_brl: 708.00,
      checkout_url: proAnnualUrl,
    },
    {
      kiwify_product_id: 'env_master_annual',
      product_name: 'Plano Premium — Anual',
      product_type: 'subscription_annual',
      billing_cycle: 'annual',
      plan_code: 'MASTER',
      credits_amount: 0,
      price_brl: 1188.00,
      checkout_url: masterAnnualUrl,
    },
    // ── Créditos avulsos (com parcelamento) ───────────────────────────────────
    {
      kiwify_product_id: 'env_c100',
      product_name: '+100 créditos IA',
      product_type: 'credits',
      billing_cycle: null,
      plan_code: null,
      credits_amount: 100,
      price_brl: 29.90,
      checkout_url: credits100Url,
    },
    {
      kiwify_product_id: 'env_c300',
      product_name: '+300 créditos IA',
      product_type: 'credits',
      billing_cycle: null,
      plan_code: null,
      credits_amount: 300,
      price_brl: 79.90,
      checkout_url: credits300Url,
    },
    {
      kiwify_product_id: 'env_c900',
      product_name: '+900 créditos IA',
      product_type: 'credits',
      billing_cycle: null,
      plan_code: null,
      credits_amount: 900,
      price_brl: 149.90,
      checkout_url: credits900Url,
    },
    // Nota: pacotes legados (10/200 créditos) removidos — pacotes oficiais são 100/300/900
  ];
}

// ── URL helpers ───────────────────────────────────────────────────────────────

/**
 * Retorna a URL de checkout para um plano de assinatura.
 *
 * @param planCode     - 'PRO' | 'MASTER'
 * @param tenantId     - ID do tenant para rastreamento (sck)
 * @param billingCycle - 'monthly' (padrão) ou 'annual'
 *
 * Lógica de seleção:
 *   1. Tenta encontrar produto com product_type exato (subscription_monthly / subscription_annual)
 *   2. Fallback: produto legado com product_type = 'subscription' (retrocompatibilidade)
 */
export async function getSubscriptionCheckoutUrl(
  planCode: 'PRO' | 'MASTER',
  tenantId: string,
  billingCycle: 'monthly' | 'annual' = 'monthly'
): Promise<string> {
  const products = await getKiwifyProducts();

  const targetType: KiwifyProductType =
    billingCycle === 'annual' ? 'subscription_annual' : 'subscription_monthly';

  // 1. Busca produto com tipo exato
  let product = products.find(
    p => p.product_type === targetType && p.plan_code === planCode
  );

  // 2. Fallback: produto legado 'subscription' (banco ainda não migrado)
  if (!product) {
    product = products.find(
      p => p.product_type === 'subscription' && p.plan_code === planCode
    );
  }

  if (!product || product.checkout_url === '#') return '#';
  return appendTrackingParam(product.checkout_url, tenantId);
}

/**
 * Retorna a URL de checkout para um pacote de créditos.
 * Créditos sempre permitem parcelamento.
 */
export async function getCreditsCheckoutUrl(
  creditsAmount: number,
  tenantId: string
): Promise<string> {
  const products = await getKiwifyProducts();
  const product = products.find(
    p => p.product_type === 'credits' && p.credits_amount === creditsAmount
  );
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