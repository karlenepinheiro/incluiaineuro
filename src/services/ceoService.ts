/**
 * ceoService.ts
 * Fonte única de verdade para queries do painel CEO.
 * Todas as operações gravam auditoria via ceo_log_action RPC.
 */

import { supabase } from './supabase';
import type { AdminUser } from '../types';

// ─── KPI Overview ────────────────────────────────────────────────────────────

export interface CeoKpis {
  total_tenants: number;
  active_subscribers: number;
  overdue_subscribers: number;
  trial_subscribers: number;
  canceled_subscribers: number;
  free_count: number;
  pro_monthly_count: number;
  pro_annual_count: number;
  premium_monthly_count: number;
  premium_annual_count: number;
  mrr_pro_monthly: number;
  mrr_pro_annual: number;
  mrr_premium_monthly: number;
  mrr_premium_annual: number;
  mrr_estimated: number;
  extra_revenue_mtd: number;
  low_credit_count: number;
  expiring_7d_count: number;
}

export async function getCeoKpis(): Promise<CeoKpis> {
  const { data, error } = await supabase.rpc('ceo_get_kpis');
  if (error) throw error;
  const d = data as any;
  return {
    total_tenants:         Number(d.total_tenants ?? 0),
    active_subscribers:    Number(d.active_subscribers ?? 0),
    overdue_subscribers:   Number(d.overdue_subscribers ?? 0),
    trial_subscribers:     Number(d.trial_subscribers ?? 0),
    canceled_subscribers:  Number(d.canceled_subscribers ?? 0),
    free_count:            Number(d.free_count ?? 0),
    pro_monthly_count:     Number(d.pro_monthly_count ?? 0),
    pro_annual_count:      Number(d.pro_annual_count ?? 0),
    premium_monthly_count: Number(d.premium_monthly_count ?? 0),
    premium_annual_count:  Number(d.premium_annual_count ?? 0),
    mrr_pro_monthly:       Number(d.mrr_pro_monthly ?? 0),
    mrr_pro_annual:        Number(d.mrr_pro_annual ?? 0),
    mrr_premium_monthly:   Number(d.mrr_premium_monthly ?? 0),
    mrr_premium_annual:    Number(d.mrr_premium_annual ?? 0),
    mrr_estimated:         Number(d.mrr_estimated ?? 0),
    extra_revenue_mtd:     Number(d.extra_revenue_mtd ?? 0),
    low_credit_count:      Number(d.low_credit_count ?? 0),
    expiring_7d_count:     Number(d.expiring_7d_count ?? 0),
  };
}

// ─── Subscribers ─────────────────────────────────────────────────────────────

export interface CeoSubscriber {
  tenant_id: string;
  tenant_name: string;
  user_name: string;
  user_email: string;
  plan_code: string;
  billing_cycle: 'monthly' | 'annual';
  subscription_status: string;
  next_due_date: string | null;
  billing_provider: string;
  activated_at: string | null;
  credits_remaining: number;
  credits_limit: number;
  credits_used_cycle: number;
  students_active: number;
  student_limit: number;
  flag_low_credits: boolean;
  flag_expiring_7d: boolean;
  tenant_created_at: string;
  // Campos de contato — populados por query separada em getCeoSubscribersContacts
  user_phone?: string | null;
  user_cpf?: string | null;
}

// ─── Contatos dos subscribers (phone/cpf) ─────────────────────────────────────

export interface SubscriberContactInfo {
  email: string;
  phone: string | null;
  cpf:   string | null;
}

/**
 * Carrega phone/cpf de todos os usuários da tabela users.
 * Retorna um Map indexado por e-mail para merge com a lista de subscribers.
 */
export async function getCeoSubscribersContacts(): Promise<Map<string, SubscriberContactInfo>> {
  const { data, error } = await supabase
    .from('users')
    .select('email, phone, cpf')
    .not('email', 'is', null);

  if (error) {
    console.warn('[CEO] getCeoSubscribersContacts error:', error.message);
    return new Map();
  }

  const map = new Map<string, SubscriberContactInfo>();
  for (const row of (data ?? [])) {
    if (row.email) {
      map.set(row.email as string, {
        email: row.email as string,
        phone: (row.phone as string | null) ?? null,
        cpf:   (row.cpf   as string | null) ?? null,
      });
    }
  }
  return map;
}

/**
 * Atualiza phone/cpf de uma usuária via RPC SECURITY DEFINER.
 * Registra auditoria automaticamente no backend.
 */
export async function adminUpdateUserContact(
  targetEmail: string,
  phone: string | null,
  cpf:   string | null,
  adminUser: AdminUser,
): Promise<void> {
  const { data, error } = await supabase.rpc('admin_update_user_contact', {
    p_target_email: targetEmail,
    p_phone:        phone || null,
    p_cpf:          cpf   || null,
  });

  if (error) throw error;

  const result = data as { success: boolean; error?: string } | null;
  if (result && !result.success) {
    throw new Error(result.error ?? 'Erro ao atualizar contato.');
  }

  // Auditoria adicional no admin_audit_log
  await logAction(
    adminUser,
    'USER_PROFILE_UPDATED_BY_ADMIN',
    'user_contact',
    targetEmail,
    targetEmail,
    undefined,
    { phone_updated: phone !== null, cpf_updated: cpf !== null },
    `Contato atualizado pelo admin: ${adminUser.name}`,
  );
}

export async function getCeoSubscribers(opts?: {
  planCode?: string;
  cycle?: string;
  status?: string;
  search?: string;
  flagLowCredits?: boolean;
  flagExpiring?: boolean;
  limit?: number;
}): Promise<CeoSubscriber[]> {
  let q = supabase.from('v_ceo_subscribers').select('*');

  if (opts?.planCode && opts.planCode !== 'all') q = q.eq('plan_code', opts.planCode);
  if (opts?.cycle    && opts.cycle !== 'all')    q = q.eq('billing_cycle', opts.cycle);
  if (opts?.status   && opts.status !== 'all')   q = q.eq('subscription_status', opts.status);
  if (opts?.flagLowCredits) q = q.eq('flag_low_credits', true);
  if (opts?.flagExpiring)   q = q.eq('flag_expiring_7d', true);
  if (opts?.search) {
    const s = `%${opts.search}%`;
    q = q.or(`tenant_name.ilike.${s},user_email.ilike.${s},user_name.ilike.${s}`);
  }

  // NOTA: tenant_created_at não existe na view — usa subscription_status (ativos primeiro) + tenant_name
  q = q.order('subscription_status', { ascending: true }).order('tenant_name', { ascending: true }).limit(opts?.limit ?? 500);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CeoSubscriber[];
}

// ─── Tenants inativos (is_active = false) ─────────────────────────────────────

export interface InactiveTenantRow {
  id: string;
  name: string;
  created_at: string;
}

/**
 * Retorna tenants com is_active = false — excluídos da view v_ceo_subscribers.
 * Contas internas (is_internal = true) são omitidas por padrão.
 */
export async function getCeoInactiveTenants(): Promise<InactiveTenantRow[]> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, created_at')
    .eq('is_active', false)
    .eq('is_internal', false)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.warn('[CEO] getCeoInactiveTenants error:', error.message);
    return [];
  }
  return (data ?? []) as InactiveTenantRow[];
}

/** Retorna tenants marcados como internos (is_internal = true). */
export async function getCeoInternalTenants(): Promise<InactiveTenantRow[]> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, created_at')
    .eq('is_internal', true)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.warn('[CEO] getCeoInternalTenants error:', error.message);
    return [];
  }
  return (data ?? []) as InactiveTenantRow[];
}

// ─── Gerenciamento de flag is_internal ────────────────────────────────────────

/**
 * Marca ou desmarca um tenant como interno.
 * Contas internas são excluídas de todas as métricas e listas do CEO.
 */
export async function setTenantInternal(
  tenantId: string,
  isInternal: boolean,
  adminUser: AdminUser,
): Promise<void> {
  const { error } = await supabase
    .from('tenants')
    .update({ is_internal: isInternal })
    .eq('id', tenantId);
  if (error) throw error;
  await logAction(
    adminUser,
    isInternal ? 'tenant_mark_internal' : 'tenant_unmark_internal',
    'tenant', tenantId, tenantId,
    undefined, { is_internal: isInternal },
    `Tenant ${isInternal ? 'marcado' : 'desmarcado'} como interno`,
  );
}

// ─── Kiwify Products ─────────────────────────────────────────────────────────

export interface KiwifyProduct {
  id: string;
  kiwify_product_id: string;
  product_name: string;
  product_type: 'subscription' | 'credits';
  plan_code: string | null;
  billing_cycle: 'monthly' | 'annual' | null;
  product_key: string | null;
  credits_amount: number;
  price_brl: number;
  checkout_url: string;
  badge_text: string | null;
  is_active: boolean;
  is_featured: boolean;
  display_order: number;
  commercial_note: string | null;
  updated_at: string;
}

export async function getKiwifyProducts(): Promise<KiwifyProduct[]> {
  const { data, error } = await supabase
    .from('kiwify_products')
    .select('*')
    .order('display_order');
  if (error) throw error;
  return (data ?? []) as KiwifyProduct[];
}

export async function upsertKiwifyProduct(
  product: Partial<KiwifyProduct> & { kiwify_product_id: string },
  adminUser: AdminUser,
): Promise<void> {
  const { error } = await supabase
    .from('kiwify_products')
    .upsert({ ...product, updated_at: new Date().toISOString() }, { onConflict: 'kiwify_product_id' });
  if (error) throw error;
  await logAction(adminUser, 'checkout_change', 'product', product.kiwify_product_id,
    product.product_name ?? product.kiwify_product_id,
    undefined,
    { checkout_url: product.checkout_url, price_brl: product.price_brl },
    `Produto atualizado: ${product.product_name}`);
}

// ─── Coupons ─────────────────────────────────────────────────────────────────

export interface CeoCoupon {
  id: string;
  code: string;
  description: string | null;
  campaign_name: string | null;
  plan_code: string | null;
  billing_cycle: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  checkout_url_override: string | null;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  uses_count: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function getCoupons(): Promise<CeoCoupon[]> {
  const { data, error } = await supabase
    .from('ceo_coupons')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CeoCoupon[];
}

export async function upsertCoupon(
  coupon: Partial<CeoCoupon> & { code: string },
  adminUser: AdminUser,
): Promise<void> {
  const payload = {
    ...coupon,
    code: coupon.code.toUpperCase().trim(),
    created_by: coupon.created_by ?? adminUser.name,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('ceo_coupons')
    .upsert(payload, { onConflict: 'code' });
  if (error) throw error;
  const isNew = !coupon.id;
  await logAction(adminUser,
    isNew ? 'coupon_create' : 'coupon_edit',
    'coupon', coupon.code, coupon.code,
    undefined,
    { discount_value: coupon.discount_value, plan_code: coupon.plan_code, is_active: coupon.is_active },
    `Cupom ${isNew ? 'criado' : 'editado'}: ${coupon.code}`);
}

export async function toggleCoupon(
  couponId: string,
  code: string,
  active: boolean,
  adminUser: AdminUser,
): Promise<void> {
  const { error } = await supabase
    .from('ceo_coupons')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', couponId);
  if (error) throw error;
  await logAction(adminUser, 'coupon_edit', 'coupon', code, code,
    { is_active: !active }, { is_active: active },
    `Cupom ${active ? 'ativado' : 'desativado'}: ${code}`);
}

export async function deleteCoupon(couponId: string, code: string, adminUser: AdminUser): Promise<void> {
  const { error } = await supabase
    .from('ceo_coupons')
    .delete()
    .eq('id', couponId);
  if (error) throw error;
  await logAction(adminUser, 'coupon_edit', 'coupon', code, code,
    undefined, undefined, `Cupom removido: ${code}`);
}

/** Gera link pronto para WhatsApp com texto e URL do checkout */
export function buildCouponShareLink(coupon: CeoCoupon, appUrl = 'https://incluiai.com'): {
  link: string;
  waText: string;
  waUrl: string;
} {
  const link = coupon.checkout_url_override ?? `${appUrl}/planos?cupom=${coupon.code}`;
  const planLabel = coupon.plan_code
    ? `plano ${coupon.plan_code}${coupon.billing_cycle === 'annual' ? ' ANUAL' : ''}`
    : 'qualquer plano';
  const discount = coupon.discount_type === 'percentage'
    ? `${coupon.discount_value}% de desconto`
    : `R$ ${coupon.discount_value.toFixed(2).replace('.', ',')} de desconto`;
  const waText = `Olá! Use o cupom *${coupon.code}* para obter ${discount} no ${planLabel} do IncluiAI.\n\nAcesse: ${link}`;
  return { link, waText, waUrl: `https://wa.me/?text=${encodeURIComponent(waText)}` };
}

// ─── Kiwify Purchases (auditoria CEO) ────────────────────────────────────────

export interface KiwifyPurchaseRow {
  id: string;
  email: string;
  product_key: string | null;
  plan_code: string | null;
  credits_amount: number;
  provider_order_id: string | null;
  status: 'APPROVED' | 'PENDING' | 'CANCELED';
  /** Coluna GERADA: PENDING_ACCOUNT | PENDING_ACTIVATION | ACTIVATED | null */
  activation_status: 'PENDING_ACCOUNT' | 'PENDING_ACTIVATION' | 'ACTIVATED' | null;
  paid_at: string | null;
  activated_at: string | null;
  tenant_id: string | null;
  created_at: string;
}

/**
 * Carrega todos os registros de kiwify_purchases para auditoria no painel CEO.
 * Ordenado por data DESC — inclui compras sem tenant vinculado.
 */
export async function getKiwifyPurchases(): Promise<KiwifyPurchaseRow[]> {
  const { data, error } = await supabase
    .from('kiwify_purchases')
    .select('id,email,product_key,plan_code,credits_amount,provider_order_id,status,activation_status,paid_at,activated_at,tenant_id,created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as KiwifyPurchaseRow[];
}

// ─── Alertas de Compras Kiwify ────────────────────────────────────────────────

export interface KiwifyPurchaseAlerts {
  /** Compras APPROVED sem tenant vinculado (usuário ainda não criou conta ou email não encontrado) */
  noAccount: KiwifyPurchaseRow[];
  /** Compras APPROVED com tenant mas activated_at IS NULL (webhook falhou na ativação) */
  notActivated: KiwifyPurchaseRow[];
  /** Compras APPROVED onde product_key = 'UNKNOWN' (produto não reconhecido pelo webhook) */
  unknownProduct: KiwifyPurchaseRow[];
}

/**
 * Deriva 3 categorias de alerta a partir de kiwify_purchases.
 * A 4ª categoria (plano divergente) é calculada no SubscribersTab via computeDivergence.
 */
export function computeKiwifyAlerts(purchases: KiwifyPurchaseRow[]): KiwifyPurchaseAlerts {
  const approved = purchases.filter(p => p.status === 'APPROVED');
  return {
    noAccount:      approved.filter(p => !p.tenant_id && !p.activated_at),
    notActivated:   approved.filter(p => p.tenant_id && !p.activated_at),
    unknownProduct: approved.filter(p => p.product_key === 'UNKNOWN'),
  };
}

/**
 * Gera texto de instrução para enviar ao comprador que ainda não criou conta.
 * Retorna o texto pronto para copiar ou enviar via WhatsApp.
 */
export function buildPendingAccountInstructions(purchase: KiwifyPurchaseRow, appUrl = 'https://app.incluiai.com'): {
  whatsappUrl: string;
  text: string;
  signupUrl: string;
} {
  const planLabel = purchase.plan_code === 'MASTER' ? 'Master' : purchase.plan_code ?? 'pago';
  const signupUrl = `${appUrl}/cadastro`;
  const text =
    `Olá! Identificamos sua compra do Plano ${planLabel} no IncluiAI.\n\n` +
    `Para ativar seu acesso, basta criar sua conta usando o mesmo e-mail da compra (${purchase.email}):\n\n` +
    `${signupUrl}\n\n` +
    `Após criar a conta, o plano será ativado automaticamente — sem precisar entrar em contato com o suporte.\n\n` +
    `Qualquer dúvida, estamos aqui!`;
  return {
    text,
    signupUrl,
    whatsappUrl: `https://wa.me/?text=${encodeURIComponent(text)}`,
  };
}

export interface ReconcileResult {
  purchase_email: string;
  purchase_plan:  string | null;
  found_tenant_id: string | null;
  result_action: string;
}

/**
 * Chama a RPC reconcile_pending_activations() para reprocessar todas as compras
 * aprovadas com activated_at = null que já têm usuário no sistema.
 * Requer papel service_role ou super_admin (a RPC tem SECURITY DEFINER).
 */
export async function reconcilePendingPurchases(): Promise<ReconcileResult[]> {
  const { data, error } = await supabase.rpc('reconcile_pending_activations');
  if (error) throw error;
  return (data ?? []) as ReconcileResult[];
}

// ─── Admin Audit Log ─────────────────────────────────────────────────────────

export interface AdminAuditEntry {
  id: string;
  admin_name: string;
  admin_email: string | null;
  admin_role: string | null;
  action_type: string;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  before_value: Record<string, any> | null;
  after_value: Record<string, any> | null;
  description: string | null;
  created_at: string;
}

export async function getAdminAuditLog(limit = 100): Promise<AdminAuditEntry[]> {
  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AdminAuditEntry[];
}

export async function logAction(
  adminUser: AdminUser,
  actionType: string,
  targetType?: string,
  targetId?: string,
  targetName?: string,
  beforeValue?: Record<string, any>,
  afterValue?: Record<string, any>,
  description?: string,
): Promise<void> {
  try {
    await supabase.rpc('ceo_log_action', {
      p_admin_name:   adminUser.name,
      p_admin_email:  adminUser.email ?? null,
      p_admin_role:   adminUser.role ?? null,
      p_action_type:  actionType,
      p_target_type:  targetType ?? null,
      p_target_id:    targetId ?? null,
      p_target_name:  targetName ?? null,
      p_before_value: beforeValue ? JSON.stringify(beforeValue) : null,
      p_after_value:  afterValue  ? JSON.stringify(afterValue)  : null,
      p_description:  description ?? null,
    });
  } catch {
    // silencioso — auditoria nunca bloqueia operação principal
  }
}
