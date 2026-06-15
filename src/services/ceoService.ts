/**
 * ceoService.ts
 * Fonte unica de verdade para queries do painel CEO.
 * Todas as operacoes gravam auditoria via ceo_log_action RPC.
 */

import { supabase } from './supabase';
import type { AdminUser } from '../types';
import {
  AI_CREDIT_COSTS,
  CREDIT_PACKAGES,
  INCLUILAB_ACTIVITY_COSTS,
  INCLUILAB_MODEL_COSTS,
  SUBSCRIPTION_PLANS,
} from '../config/aiCosts';

// KPI Overview

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
  integrity_finding_count: number;
  tenants_with_findings_count: number;
  tenants_with_critical_findings: number;
  wallet_divergence_count: number;
  plan_mismatch_count: number;
  subscription_mismatch_count: number;
  no_owner_count: number;
  inactive_tenants_count: number;
  orphan_purchase_count: number;
  pending_activation_count: number;
  unknown_product_count: number;
  financial_inconsistency_count: number;
}

export interface CeoCreditDashboard {
  wallet_ledger_divergences: number;
  pending_reservations: number;
  refunds_total: number;
  failed_operations: number;
  suspicious_retries: number;
}

export type CeoHealthSourceStatus = 'available' | 'unavailable';
export type CeoHealthCardStatus = 'ok' | 'attention' | 'critical' | 'unmonitored';
export type CeoHealthOverallStatus = 'OK' | 'Atenção' | 'Crítico';
export type CeoHealthAlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type CeoHealthAlertCategory = 'billing' | 'credits' | 'kiwify' | 'users' | 'ai' | 'documents' | 'security';

export interface CeoHealthSource {
  key: string;
  label: string;
  status: CeoHealthSourceStatus;
  detail?: string;
}

export interface CeoHealthCard {
  key: string;
  title: string;
  value: number | string | null;
  status: CeoHealthCardStatus;
  subtext: string;
  source: string;
}

export interface CeoHealthAlert {
  id: string;
  severity: CeoHealthAlertSeverity;
  category: CeoHealthAlertCategory;
  title: string;
  description: string;
  recommendedAction: string;
  ctaTab?: string;
  createdAt?: string | null;
}

export interface CeoHealthDiagnostics {
  generatedAt: string;
  overallStatus: CeoHealthOverallStatus;
  summary: CeoHealthCard[];
  alerts: CeoHealthAlert[];
  nextActions: string[];
  sources: CeoHealthSource[];
}

export interface CeoCreditCommandCard {
  key: string;
  title: string;
  value: number | string | null;
  status: CeoHealthCardStatus;
  subtext: string;
  source: string;
}

export interface CeoCreditWalletRow {
  tenant_id: string;
  tenant_name: string;
  user_email: string | null;
  plan_code: string;
  wallet_balance: number | null;
  ledger_balance: number | null;
  wallet_ledger_delta: number | null;
  consumed_month: number | null;
  pending_reservations: number | null;
  reserved_amount: number | null;
  last_operation_at: string | null;
  last_operation_label: string | null;
  status: 'ok' | 'attention' | 'critical' | 'unmonitored';
  status_label: string;
}

export interface CeoCreditReservationRow {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  user_email: string | null;
  operation_id: string | null;
  amount: number;
  description: string | null;
  status: string;
  expires_at: string | null;
  created_at: string;
  age_minutes: number;
  stale: boolean;
}

export interface CeoCreditFailureRow {
  id: string;
  operation_id: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  user_email: string | null;
  operation_kind: string | null;
  status: string | null;
  amount: number | null;
  reason: string | null;
  created_at: string | null;
}

export interface CeoCreditRefundRow {
  id: string;
  operation_id: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  user_email: string | null;
  amount: number | null;
  reason: string | null;
  created_at: string | null;
}

export interface CeoCreditDuplicateRow {
  id: string;
  operation_id: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  user_email: string | null;
  operation_kind: string | null;
  status: string | null;
  amount: number | null;
  attempt_count: number;
  last_seen_at: string | null;
}

export interface CeoCreditCommandCenter {
  generatedAt: string;
  cards: CeoCreditCommandCard[];
  wallets: CeoCreditWalletRow[];
  reservations: CeoCreditReservationRow[];
  failures: CeoCreditFailureRow[];
  refunds: CeoCreditRefundRow[];
  duplicates: CeoCreditDuplicateRow[];
  sources: CeoHealthSource[];
}

export interface CeoPricingCard {
  key: string;
  title: string;
  value: number | string | null;
  status: CeoHealthCardStatus;
  subtext: string;
  source: string;
}

export interface CeoPricingPlanRow {
  code: string;
  display_name: string;
  price_monthly: number | null;
  price_annual: number | null;
  credits_monthly: number | null;
  config_credits_monthly: number | null;
  landing_price_monthly: number | null;
  is_active: boolean | null;
  source: string;
}

export interface CeoPricingKiwifyProductRow {
  id: string;
  product_id: string;
  product_name: string;
  product_type: string;
  plan_code: string | null;
  billing_cycle: string | null;
  credits_amount: number | null;
  price_brl: number | null;
  expected_price_brl: number | null;
  is_active: boolean | null;
  source: string;
}

export interface CeoPricingCouponRow {
  id: string;
  code: string;
  plan_code: string | null;
  billing_cycle: string | null;
  discount_type: string | null;
  discount_value: number | null;
  campaign_name: string | null;
  is_active: boolean | null;
  created_at: string | null;
  source: string;
}

export interface CeoPricingCreditPackageRow {
  code: string;
  credits: number | null;
  price_brl: number | null;
  cost_per_credit: number | null;
  is_active: boolean | null;
  source: string;
  label?: string | null;
}

export interface CeoPricingAiCostRow {
  key: string;
  friendly_name: string;
  credits_cost: number;
  category: string;
  severity: 'ok' | 'attention' | 'critical';
  source: string;
}

export interface CeoPricingDivergence {
  id: string;
  severity: CeoHealthAlertSeverity;
  category: 'plans' | 'kiwify' | 'coupons' | 'credits' | 'ai' | 'landing';
  title: string;
  description: string;
  recommendedAction: string;
}

export interface CeoPricingAiAdmin {
  generatedAt: string;
  cards: CeoPricingCard[];
  plans: CeoPricingPlanRow[];
  kiwifyProducts: CeoPricingKiwifyProductRow[];
  coupons: CeoPricingCouponRow[];
  creditPackages: CeoPricingCreditPackageRow[];
  aiCosts: CeoPricingAiCostRow[];
  divergences: CeoPricingDivergence[];
  sources: CeoHealthSource[];
}

export interface CeoBillingKiwifyCard {
  key: string;
  title: string;
  value: number | string | null;
  status: CeoHealthCardStatus;
  subtext: string;
  source: string;
}

export interface CeoBillingKiwifyPurchaseRow {
  id: string;
  date: string | null;
  customer_email: string | null;
  customer_name: string | null;
  product_name: string | null;
  product_id: string | null;
  product_key: string | null;
  expected_plan_code: string | null;
  payment_status: string;
  activation_status: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_plan_code: string | null;
  price_brl: number | null;
  billing_cycle: string | null;
  mapping_source: string;
  severity: 'ok' | 'attention' | 'critical';
  severity_label: string;
  flags: string[];
  provider_order_id: string | null;
  paid_at: string | null;
  activated_at: string | null;
  credits_amount: number | null;
  wallet_balance: number | null;
}

export interface CeoBillingKiwifyAlert {
  id: string;
  severity: CeoHealthAlertSeverity;
  title: string;
  description: string;
  recommendedAction: string;
  count: number;
}

export interface CeoBillingKiwifyReconciliation {
  generatedAt: string;
  cards: CeoBillingKiwifyCard[];
  purchases: CeoBillingKiwifyPurchaseRow[];
  alerts: CeoBillingKiwifyAlert[];
  nextActions: string[];
  sources: CeoHealthSource[];
}

export interface CeoUsersTenantsCard {
  key: string;
  title: string;
  value: number | string | null;
  status: CeoHealthCardStatus;
  subtext: string;
  source: string;
}

export interface CeoUsersTenantsUserRow {
  id: string | null;
  email: string | null;
  name: string | null;
  is_active: boolean | null;
  created_at: string | null;
  tenant_id: string | null;
}

export interface CeoUsersTenantsPurchaseSummary {
  id: string;
  email: string | null;
  status: string | null;
  activation_status: string | null;
  plan_code: string | null;
  product_key: string | null;
  provider_order_id: string | null;
  paid_at: string | null;
  activated_at: string | null;
  tenant_id: string | null;
  created_at: string | null;
}

export interface CeoUsersTenantsAuditSummary {
  action_type: string;
  description: string | null;
  admin_name: string | null;
  created_at: string | null;
}

export interface CeoUsersTenantsAccountRow {
  tenant_id: string;
  tenant_name: string;
  primary_email: string | null;
  owner_name: string | null;
  plan_code: string | null;
  status: string | null;
  is_internal: boolean;
  origin: string;
  last_activity_at: string | null;
  last_activity_source: string;
  linked_purchase: CeoUsersTenantsPurchaseSummary | null;
  divergence_label: string | null;
  divergence_code: string | null;
  severity: 'ok' | 'attention' | 'critical' | 'unmonitored';
  severity_label: string;
  users: CeoUsersTenantsUserRow[];
  audit_events: CeoUsersTenantsAuditSummary[];
  marked_internal_at: string | null;
  internal_reason: string | null;
  tenant_created_at: string | null;
}

export interface CeoUsersTenantsAdmin {
  generatedAt: string;
  cards: CeoUsersTenantsCard[];
  accounts: CeoUsersTenantsAccountRow[];
  internalAccounts: CeoUsersTenantsAccountRow[];
  nextActions: string[];
  sources: CeoHealthSource[];
}

export type CeoIncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type CeoIncidentCategory = 'ai' | 'billing' | 'credits' | 'users' | 'documents' | 'security' | 'system';
export type CeoIncidentStatus = 'open' | 'monitored' | 'resolved' | 'no_status';

export interface CeoIncidentCard {
  key: string;
  title: string;
  value: number | string | null;
  status: CeoHealthCardStatus;
  subtext: string;
  source: string;
}

export interface CeoIncidentRow {
  id: string;
  severity: CeoIncidentSeverity;
  category: CeoIncidentCategory;
  title: string;
  description: string;
  source: string;
  tenant_id: string | null;
  email: string | null;
  occurred_at: string | null;
  recommended_action: string;
  status: CeoIncidentStatus;
  status_label: string;
  related_tab: string | null;
  details: Record<string, any> | null;
}

export interface CeoAlertsIncidentCenter {
  generatedAt: string;
  cards: CeoIncidentCard[];
  incidents: CeoIncidentRow[];
  nextActions: string[];
  sources: CeoHealthSource[];
}

export async function getCeoKpis(): Promise<CeoKpis> {
  const { data, error } = await supabase.rpc('ceo_get_kpis');
  if (error) throw error;
  const d = data as any;
  return {
    total_tenants: Number(d.total_tenants ?? 0),
    active_subscribers: Number(d.active_subscribers ?? 0),
    overdue_subscribers: Number(d.overdue_subscribers ?? 0),
    trial_subscribers: Number(d.trial_subscribers ?? 0),
    canceled_subscribers: Number(d.canceled_subscribers ?? 0),
    free_count: Number(d.free_count ?? 0),
    pro_monthly_count: Number(d.pro_monthly_count ?? 0),
    pro_annual_count: Number(d.pro_annual_count ?? 0),
    premium_monthly_count: Number(d.premium_monthly_count ?? 0),
    premium_annual_count: Number(d.premium_annual_count ?? 0),
    mrr_pro_monthly: Number(d.mrr_pro_monthly ?? 0),
    mrr_pro_annual: Number(d.mrr_pro_annual ?? 0),
    mrr_premium_monthly: Number(d.mrr_premium_monthly ?? 0),
    mrr_premium_annual: Number(d.mrr_premium_annual ?? 0),
    mrr_estimated: Number(d.mrr_estimated ?? 0),
    extra_revenue_mtd: Number(d.extra_revenue_mtd ?? 0),
    low_credit_count: Number(d.low_credit_count ?? 0),
    expiring_7d_count: Number(d.expiring_7d_count ?? 0),
    integrity_finding_count: Number(d.integrity_finding_count ?? 0),
    tenants_with_findings_count: Number(d.tenants_with_findings_count ?? 0),
    tenants_with_critical_findings: Number(d.tenants_with_critical_findings ?? 0),
    wallet_divergence_count: Number(d.wallet_divergence_count ?? 0),
    plan_mismatch_count: Number(d.plan_mismatch_count ?? 0),
    subscription_mismatch_count: Number(d.subscription_mismatch_count ?? 0),
    no_owner_count: Number(d.no_owner_count ?? 0),
    inactive_tenants_count: Number(d.inactive_tenants_count ?? 0),
    orphan_purchase_count: Number(d.orphan_purchase_count ?? 0),
    pending_activation_count: Number(d.pending_activation_count ?? 0),
    unknown_product_count: Number(d.unknown_product_count ?? 0),
    financial_inconsistency_count: Number(d.financial_inconsistency_count ?? 0),
  };
}

export async function getCeoCreditDashboard(): Promise<CeoCreditDashboard> {
  const { data, error } = await supabase
    .from('v_ceo_credit_dashboard')
    .select('*')
    .maybeSingle();

  if (error) throw error;

  return {
    wallet_ledger_divergences: Number((data as any)?.wallet_ledger_divergences ?? 0),
    pending_reservations: Number((data as any)?.pending_reservations ?? 0),
    refunds_total: Number((data as any)?.refunds_total ?? 0),
    failed_operations: Number((data as any)?.failed_operations ?? 0),
    suspicious_retries: Number((data as any)?.suspicious_retries ?? 0),
  };
}

function sourceAvailable(key: string, label: string): CeoHealthSource {
  return { key, label, status: 'available' };
}

function sourceUnavailable(key: string, label: string, error: unknown): CeoHealthSource {
  const detail = error instanceof Error ? error.message : String(error ?? 'Fonte indisponivel');
  return { key, label, status: 'unavailable', detail };
}

function pushAlert(
  alerts: CeoHealthAlert[],
  alert: CeoHealthAlert,
  enabled: boolean,
): void {
  if (enabled) alerts.push(alert);
}

/**
 * Agrega diagnostico operacional do CEO usando apenas fontes ja existentes.
 * Cada fonte falha de forma isolada para nao quebrar a tela de administracao.
 */
export async function getCeoHealthDiagnostics(): Promise<CeoHealthDiagnostics> {
  const generatedAt = new Date().toISOString();
  const sources: CeoHealthSource[] = [];
  const alerts: CeoHealthAlert[] = [];
  const summary: CeoHealthCard[] = [];

  let kpis: CeoKpis | null = null;
  let creditDashboard: CeoCreditDashboard | null = null;
  let purchases: KiwifyPurchaseRow[] | null = null;
  let findingsPage: CeoSubscriberPage | null = null;
  let internalTenants: InactiveTenantRow[] | null = null;
  let aiRows: Array<{ status: string | null; created_at?: string | null }> | null = null;
  let webhookRows: Array<{ provider?: string | null; event_type?: string | null; processed?: boolean | null; created_at?: string | null }> | null = null;

  try {
    kpis = await getCeoKpis();
    sources.push(sourceAvailable('ceo_get_kpis', 'ceo_get_kpis'));
  } catch (error) {
    sources.push(sourceUnavailable('ceo_get_kpis', 'ceo_get_kpis', error));
  }

  try {
    creditDashboard = await getCeoCreditDashboard();
    sources.push(sourceAvailable('v_ceo_credit_dashboard', 'v_ceo_credit_dashboard'));
  } catch (error) {
    sources.push(sourceUnavailable('v_ceo_credit_dashboard', 'v_ceo_credit_dashboard', error));
  }

  try {
    purchases = await getKiwifyPurchases();
    sources.push(sourceAvailable('kiwify_purchases', 'kiwify_purchases'));
  } catch (error) {
    sources.push(sourceUnavailable('kiwify_purchases', 'kiwify_purchases', error));
  }

  try {
    findingsPage = await getCeoSubscribersPage({ onlyFindings: true, page: 1, pageSize: 25 });
    sources.push(sourceAvailable('v_ceo_subscribers', 'v_ceo_subscribers'));
  } catch (error) {
    sources.push(sourceUnavailable('v_ceo_subscribers', 'v_ceo_subscribers', error));
  }

  try {
    internalTenants = await getCeoInternalTenants();
    sources.push(sourceAvailable('tenants.is_internal', 'tenants.is_internal'));
  } catch (error) {
    sources.push(sourceUnavailable('tenants.is_internal', 'tenants.is_internal', error));
  }

  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('ai_requests')
      .select('status, created_at')
      .gte('created_at', since)
      .limit(200);
    if (error) throw error;
    aiRows = (data ?? []) as Array<{ status: string | null; created_at?: string | null }>;
    sources.push(sourceAvailable('ai_requests', 'ai_requests ultimos 7 dias'));
  } catch (error) {
    sources.push(sourceUnavailable('ai_requests', 'ai_requests ultimos 7 dias', error));
  }

  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('billing_events')
      .select('provider, event_type, processed, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    webhookRows = (data ?? []) as Array<{ provider?: string | null; event_type?: string | null; processed?: boolean | null; created_at?: string | null }>;
    sources.push(sourceAvailable('billing_events', 'billing_events ultimos 7 dias'));
  } catch (error) {
    sources.push(sourceUnavailable('billing_events', 'billing_events ultimos 7 dias', error));
  }

  sources.push({
    key: 'rls_policies',
    label: 'RLS/policies',
    status: 'unavailable',
    detail: 'Sem view/RPC de auditoria de policies disponivel para leitura nesta sprint.',
  });

  // CEO-10C.2: exclui tenants internos de pendingActivation (nao sao incidentes comerciais)
  const internalIds = new Set((internalTenants ?? []).map(t => t.id));
  const orphanPurchases = purchases?.filter(p => p.status === 'APPROVED' && !p.tenant_id && !p.activated_at).length ?? null;
  const pendingActivation = purchases?.filter(p => p.status === 'APPROVED' && Boolean(p.tenant_id) && !p.activated_at && !internalIds.has(p.tenant_id as string)).length ?? null;
  const unknownProducts = purchases?.filter(p => p.status === 'APPROVED' && p.product_key === 'UNKNOWN').length ?? null;
  const pendingPurchases = orphanPurchases === null || pendingActivation === null || unknownProducts === null
    ? null
    : orphanPurchases + pendingActivation + unknownProducts;
  const aiFailures = aiRows?.filter(r => String(r.status ?? '').toLowerCase() === 'failed').length ?? null;
  const webhookUnprocessed = webhookRows?.filter(r => r.processed === false).length ?? null;
  const internalCount = internalTenants?.length ?? null;
  const planMismatch = kpis?.plan_mismatch_count ?? null;
  const creditDivergences = creditDashboard?.wallet_ledger_divergences ?? null;
  // Agrupamento: financial_inconsistency + subscription_mismatch + no_owner (nao apenas financeiro)
  const financialDivergences = kpis
    ? kpis.financial_inconsistency_count + kpis.subscription_mismatch_count + kpis.no_owner_count
    : null;

  const hasCritical = Boolean(
    (kpis?.tenants_with_critical_findings ?? 0) > 0 ||
    (orphanPurchases ?? 0) > 0 ||
    (creditDashboard?.failed_operations ?? 0) > 0
  );
  const hasAttention = Boolean(
    (financialDivergences ?? 0) > 0 ||
    (pendingPurchases ?? 0) > 0 ||
    (planMismatch ?? 0) > 0 ||
    (creditDivergences ?? 0) > 0 ||
    (aiFailures ?? 0) > 0 ||
    (webhookUnprocessed ?? 0) > 0 ||
    (kpis?.low_credit_count ?? 0) > 0
  );
  const overallStatus: CeoHealthOverallStatus = hasCritical ? 'Crítico' : hasAttention ? 'Atenção' : 'OK';

  summary.push({
    key: 'overall',
    title: 'Saude geral do sistema',
    value: overallStatus,
    status: overallStatus === 'Crítico' ? 'critical' : overallStatus === 'Atenção' ? 'attention' : 'ok',
    subtext: kpis ? `${kpis.tenants_with_findings_count} tenants com findings` : 'KPIs do CEO indisponiveis',
    source: 'ceo_get_kpis',
  });
  summary.push({
    key: 'financial',
    title: 'Inconsistencias adm. e financeiras',
    value: financialDivergences,
    status: financialDivergences === null ? 'unmonitored' : financialDivergences > 0 ? 'critical' : 'ok',
    subtext: financialDivergences === null ? 'fonte nao disponivel' : 'agrupamento: financeiro, subscription e owner',
    source: 'ceo_get_kpis',
  });
  summary.push({
    key: 'pending_purchases',
    title: 'Compras pendentes',
    value: pendingPurchases,
    status: pendingPurchases === null ? 'unmonitored' : pendingPurchases > 0 ? 'critical' : 'ok',
    subtext: pendingPurchases === null ? 'fonte nao disponivel' : `${orphanPurchases} sem conta, ${pendingActivation} sem ativacao`,
    source: 'kiwify_purchases',
  });
  summary.push({
    key: 'plan_mismatch',
    title: 'Planos inconsistentes',
    value: planMismatch,
    status: planMismatch === null ? 'unmonitored' : planMismatch > 0 ? 'critical' : 'ok',
    subtext: planMismatch === null ? 'fonte nao disponivel' : 'plan_mismatch via KPI; paid_but_free visivel em Billing',
    source: 'ceo_get_kpis',
  });
  summary.push({
    key: 'credit_divergences',
    title: 'Creditos com divergencia',
    value: creditDivergences,
    status: creditDivergences === null ? 'unmonitored' : creditDivergences > 0 ? 'critical' : 'ok',
    subtext: creditDivergences === null ? 'fonte nao disponivel' : 'wallet vs ledger',
    source: 'v_ceo_credit_dashboard',
  });
  summary.push({
    key: 'ai_failures',
    title: 'Falhas recentes de IA',
    value: aiFailures,
    status: aiFailures === null ? 'unmonitored' : aiFailures > 0 ? 'attention' : 'ok',
    subtext: aiFailures === null ? 'fonte nao disponivel' : 'ultimos 7 dias',
    source: 'ai_requests',
  });
  summary.push({
    key: 'webhook_events',
    title: 'Eventos webhook/Kiwify',
    value: webhookUnprocessed,
    status: webhookUnprocessed === null ? 'unmonitored' : webhookUnprocessed > 0 ? 'attention' : 'ok',
    subtext: webhookUnprocessed === null ? 'billing_events indisponivel' : 'eventos nao processados nos ultimos 7 dias',
    source: 'billing_events',
  });
  summary.push({
    key: 'internal_accounts',
    title: 'Contas internas fora das metricas',
    value: internalCount,
    status: internalCount === null ? 'unmonitored' : 'ok',
    subtext: internalCount === null ? 'fonte nao disponivel' : 'tenants marcados como internos',
    source: 'tenants.is_internal',
  });
  summary.push({
    key: 'rls_policies',
    title: 'Alertas de RLS/policies',
    value: 'Nao monitorado',
    status: 'unmonitored',
    subtext: 'sem fonte CEO disponivel nesta sprint',
    source: 'rls_policies',
  });

  pushAlert(alerts, {
    id: 'orphan-purchases',
    severity: 'critical',
    category: 'kiwify',
    title: 'Compras pagas sem tenant',
    description: `${orphanPurchases ?? 0} compra(s) aprovada(s) ainda sem conta vinculada.`,
    recommendedAction: 'Abrir Assinantes ou Produtos Kiwify e orientar o comprador a criar conta com o mesmo email.',
    ctaTab: 'subscribers',
  }, Boolean((orphanPurchases ?? 0) > 0));
  pushAlert(alerts, {
    id: 'pending-activation',
    severity: 'high',
    category: 'billing',
    title: 'Compras aprovadas sem ativacao',
    description: `${pendingActivation ?? 0} compra(s) com tenant identificado ainda nao ativadas.`,
    recommendedAction: 'Revisar manualmente as compras pendentes antes de executar qualquer reconciliacao.',
    ctaTab: 'subscribers',
  }, Boolean((pendingActivation ?? 0) > 0));
  pushAlert(alerts, {
    id: 'unknown-products',
    severity: 'high',
    category: 'kiwify',
    title: 'Produtos Kiwify desconhecidos',
    description: `${unknownProducts ?? 0} compra(s) aprovada(s) chegaram com product_key desconhecido.`,
    recommendedAction: 'Conferir cadastro de produtos Kiwify e URLs oficiais.',
    ctaTab: 'kiwify',
  }, Boolean((unknownProducts ?? 0) > 0));
  pushAlert(alerts, {
    id: 'plan-mismatch',
    severity: 'critical',
    category: 'billing',
    title: 'Tenants com plano inconsistente',
    description: `${planMismatch ?? 0} tenant(s) com plan_mismatch nos KPIs. Casos paid_but_free podem aparecer separadamente em Billing/Kiwify.`,
    recommendedAction: 'Filtrar alertas em Assinantes e validar cada caso manualmente.',
    ctaTab: 'subscribers',
  }, Boolean((planMismatch ?? 0) > 0));
  pushAlert(alerts, {
    id: 'credit-integrity',
    severity: 'critical',
    category: 'credits',
    title: 'Possivel divergencia de creditos',
    description: `${creditDivergences ?? 0} tenant(s) com wallet diferente do ledger.`,
    recommendedAction: 'Abrir a aba Creditos e revisar o historico antes de qualquer ajuste manual.',
    ctaTab: 'credits',
  }, Boolean((creditDivergences ?? 0) > 0));
  pushAlert(alerts, {
    id: 'credit-failures',
    severity: 'high',
    category: 'credits',
    title: 'Operacoes de credito falharam',
    description: `${creditDashboard?.failed_operations ?? 0} falha(s) registradas nas views de credito.`,
    recommendedAction: 'Revisar operacoes falhadas sem reprocessar automaticamente.',
    ctaTab: 'credits',
  }, Boolean((creditDashboard?.failed_operations ?? 0) > 0));
  pushAlert(alerts, {
    id: 'ai-failures',
    severity: 'medium',
    category: 'ai',
    title: 'Falhas recentes de IA',
    description: `${aiFailures ?? 0} requisicao(oes) de IA falharam nos ultimos 7 dias.`,
    recommendedAction: 'Verificar logs de IA disponiveis no banco antes de mexer no gateway.',
  }, Boolean((aiFailures ?? 0) > 0));
  pushAlert(alerts, {
    id: 'webhook-unprocessed',
    severity: 'medium',
    category: 'kiwify',
    title: 'Eventos de billing nao processados',
    description: `${webhookUnprocessed ?? 0} evento(s) de webhook constam como nao processados.`,
    recommendedAction: 'Conferir eventos recentes sem reenviar ou reprocessar automaticamente.',
    ctaTab: 'kiwify',
  }, Boolean((webhookUnprocessed ?? 0) > 0));
  pushAlert(alerts, {
    id: 'internal-tenants',
    severity: 'low',
    category: 'users',
    title: 'Contas internas excluidas das metricas',
    description: `${internalCount ?? 0} tenant(s) marcados como internos e excluidos das metricas comerciais (comportamento esperado).`,
    recommendedAction: 'Conferir periodicamente se a lista de contas internas continua intencional.',
    ctaTab: 'subscribers',
  }, Boolean((internalCount ?? 0) > 0));

  if (alerts.length === 0) {
    alerts.push({
      id: 'no-active-alerts',
      severity: 'low',
      category: 'security',
      title: 'Nenhum alerta operacional ativo',
      description: 'As fontes disponiveis nao retornaram divergencias neste diagnostico.',
      recommendedAction: 'Manter rotina de revisao periodica do Health Center.',
    });
  }

  const nextActions = [
    (orphanPurchases ?? 0) > 0 ? 'Corrigir compras pagas sem tenant' : null,
    (pendingActivation ?? 0) > 0 ? 'Reconciliar manualmente usuarios pagos ainda nao ativados' : null,
    (creditDivergences ?? 0) > 0 ? 'Revisar divergencias de creditos' : null,
    (aiFailures ?? 0) > 0 ? 'Verificar failures de IA' : null,
    (internalCount ?? 0) > 0 ? 'Conferir tenants internos' : null,
    (planMismatch ?? 0) > 0 ? 'Revisar tenants com plano inconsistente' : null,
  ].filter(Boolean) as string[];

  return {
    generatedAt,
    overallStatus,
    summary,
    alerts,
    nextActions: nextActions.length > 0 ? nextActions : ['Nenhuma acao imediata detectada nas fontes disponiveis.'],
    sources,
  };
}

function isCreditDebit(row: { amount?: number | null; type?: string | null; operation?: string | null }): boolean {
  const amount = Number(row.amount ?? 0);
  const type = String(row.type ?? '').toLowerCase();
  const operation = String(row.operation ?? '').toLowerCase();
  return amount < 0 || operation === 'debit' || ['usage_ai', 'ai_debit', 'debit', 'consumption'].includes(type);
}

function creditConsumption(rows: Array<{ amount?: number | null; type?: string | null; operation?: string | null }>): number {
  return rows.reduce((sum, row) => {
    if (!isCreditDebit(row)) return sum;
    return sum + Math.abs(Number(row.amount ?? 0));
  }, 0);
}

function creditRowStatus(row: {
  wallet_ledger_delta: number | null;
  pending_reservations: number | null;
  reserved_amount: number | null;
  wallet_balance: number | null;
}): CeoCreditWalletRow['status'] {
  if (row.wallet_ledger_delta === null && row.wallet_balance === null) return 'unmonitored';
  if ((row.wallet_balance ?? 0) < 0) return 'critical';
  if (Math.abs(row.wallet_ledger_delta ?? 0) > 0) return 'critical';
  if ((row.pending_reservations ?? 0) > 0 || (row.reserved_amount ?? 0) > 0) return 'attention';
  return 'ok';
}

function creditStatusLabel(status: CeoCreditWalletRow['status']): string {
  if (status === 'critical') return 'Crítico';
  if (status === 'attention') return 'Atenção';
  if (status === 'unmonitored') return 'Não monitorado';
  return 'OK';
}

/**
 * Snapshot operacional de creditos para o CEO.
 * Somente leitura: nao chama RPCs de mutation e nao altera wallet/ledger.
 */
export async function getCeoCreditCommandCenter(): Promise<CeoCreditCommandCenter> {
  const generatedAt = new Date().toISOString();
  const sources: CeoHealthSource[] = [];
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  let dashboard: CeoCreditDashboard | null = null;
  let integrityRows: any[] | null = null;
  let reservationRows: any[] | null = null;
  let failureRows: any[] | null = null;
  let duplicateRows: any[] | null = null;
  let refundRows: any[] | null = null;
  let walletRows: any[] | null = null;
  let ledgerTodayRows: any[] | null = null;
  let ledgerMonthRows: any[] | null = null;
  let ledgerRecentRows: any[] | null = null;
  let subscriberRows: CeoSubscriber[] | null = null;

  try {
    dashboard = await getCeoCreditDashboard();
    sources.push(sourceAvailable('v_ceo_credit_dashboard', 'v_ceo_credit_dashboard'));
  } catch (error) {
    sources.push(sourceUnavailable('v_ceo_credit_dashboard', 'v_ceo_credit_dashboard', error));
  }

  try {
    const { data, error } = await supabase
      .from('v_credit_integrity')
      .select('*')
      .limit(1000);
    if (error) throw error;
    integrityRows = data ?? [];
    sources.push(sourceAvailable('v_credit_integrity', 'v_credit_integrity'));
  } catch (error) {
    sources.push(sourceUnavailable('v_credit_integrity', 'v_credit_integrity', error));
  }

  try {
    const { data, error } = await supabase
      .from('v_credit_reservations')
      .select('*')
      .eq('status', 'reserved')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    reservationRows = data ?? [];
    sources.push(sourceAvailable('v_credit_reservations', 'v_credit_reservations'));
  } catch (error) {
    sources.push(sourceUnavailable('v_credit_reservations', 'v_credit_reservations', error));
  }

  try {
    const { data, error } = await supabase
      .from('v_credit_failures')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    failureRows = data ?? [];
    sources.push(sourceAvailable('v_credit_failures', 'v_credit_failures'));
  } catch (error) {
    sources.push(sourceUnavailable('v_credit_failures', 'v_credit_failures', error));
  }

  try {
    const { data, error } = await supabase
      .from('v_credit_duplicates')
      .select('*')
      .order('last_seen_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    duplicateRows = data ?? [];
    sources.push(sourceAvailable('v_credit_duplicates', 'v_credit_duplicates'));
  } catch (error) {
    sources.push(sourceUnavailable('v_credit_duplicates', 'v_credit_duplicates', error));
  }

  try {
    const { data, error } = await supabase
      .from('v_credit_refunds')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    refundRows = data ?? [];
    sources.push(sourceAvailable('v_credit_refunds', 'v_credit_refunds'));
  } catch (error) {
    sources.push(sourceUnavailable('v_credit_refunds', 'v_credit_refunds', error));
  }

  try {
    const { data, error } = await supabase
      .from('credits_wallet')
      .select('tenant_id, balance, updated_at')
      .limit(1000);
    if (error) throw error;
    walletRows = data ?? [];
    sources.push(sourceAvailable('credits_wallet', 'credits_wallet'));
  } catch (error) {
    sources.push(sourceUnavailable('credits_wallet', 'credits_wallet', error));
  }

  try {
    const { data, error } = await supabase
      .from('credits_ledger')
      .select('tenant_id, amount, type, operation, description, created_at, operation_id')
      .gte('created_at', todayStart.toISOString())
      .limit(5000);
    if (error) throw error;
    ledgerTodayRows = data ?? [];
    sources.push(sourceAvailable('credits_ledger_today', 'credits_ledger hoje'));
  } catch (error) {
    sources.push(sourceUnavailable('credits_ledger_today', 'credits_ledger hoje', error));
  }

  try {
    const { data, error } = await supabase
      .from('credits_ledger')
      .select('tenant_id, amount, type, operation, description, created_at, operation_id')
      .gte('created_at', monthStart.toISOString())
      .limit(10000);
    if (error) throw error;
    ledgerMonthRows = data ?? [];
    sources.push(sourceAvailable('credits_ledger_month', 'credits_ledger mes atual'));
  } catch (error) {
    sources.push(sourceUnavailable('credits_ledger_month', 'credits_ledger mes atual', error));
  }

  try {
    const { data, error } = await supabase
      .from('credits_ledger')
      .select('tenant_id, amount, type, operation, description, created_at, operation_id')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    ledgerRecentRows = data ?? [];
    sources.push(sourceAvailable('credits_ledger_recent', 'credits_ledger recentes'));
  } catch (error) {
    sources.push(sourceUnavailable('credits_ledger_recent', 'credits_ledger recentes', error));
  }

  try {
    const page = await getCeoSubscribersPage({ page: 1, pageSize: 500 });
    subscriberRows = page.rows;
    sources.push(sourceAvailable('v_ceo_subscribers', 'v_ceo_subscribers'));
  } catch (error) {
    sources.push(sourceUnavailable('v_ceo_subscribers', 'v_ceo_subscribers', error));
  }

  const subscriberByTenant = new Map<string, CeoSubscriber>();
  for (const sub of subscriberRows ?? []) subscriberByTenant.set(sub.tenant_id, sub);

  const monthConsumptionByTenant = new Map<string, number>();
  for (const row of ledgerMonthRows ?? []) {
    const tenantId = row.tenant_id as string | undefined;
    if (!tenantId || !isCreditDebit(row)) continue;
    monthConsumptionByTenant.set(tenantId, (monthConsumptionByTenant.get(tenantId) ?? 0) + Math.abs(Number(row.amount ?? 0)));
  }

  const lastOperationByTenant = new Map<string, any>();
  for (const row of ledgerRecentRows ?? []) {
    if (row.tenant_id && !lastOperationByTenant.has(row.tenant_id)) {
      lastOperationByTenant.set(row.tenant_id, row);
    }
  }

  const walletByTenant = new Map<string, any>();
  for (const row of walletRows ?? []) {
    if (row.tenant_id) walletByTenant.set(row.tenant_id as string, row);
  }

  const tenantIds = new Set<string>();
  for (const row of integrityRows ?? []) if (row.tenant_id) tenantIds.add(row.tenant_id as string);
  for (const row of walletRows ?? []) if (row.tenant_id) tenantIds.add(row.tenant_id as string);
  for (const row of subscriberRows ?? []) if (row.tenant_id) tenantIds.add(row.tenant_id);

  const wallets = Array.from(tenantIds).map((tenantId): CeoCreditWalletRow => {
    const integrity = (integrityRows ?? []).find(row => row.tenant_id === tenantId);
    const wallet = walletByTenant.get(tenantId);
    const sub = subscriberByTenant.get(tenantId);
    const last = lastOperationByTenant.get(tenantId);
    const base = {
      tenant_id: tenantId,
      tenant_name: sub?.tenant_name ?? 'Tenant sem nome',
      user_email: sub?.user_email ?? null,
      plan_code: sub?.plan_code ?? 'N/D',
      wallet_balance: integrity ? Number(integrity.wallet_balance ?? 0) : wallet ? Number(wallet.balance ?? 0) : null,
      ledger_balance: integrity ? Number(integrity.ledger_balance ?? 0) : null,
      wallet_ledger_delta: integrity ? Number(integrity.wallet_ledger_delta ?? 0) : null,
      consumed_month: monthConsumptionByTenant.get(tenantId) ?? null,
      pending_reservations: integrity ? Number(integrity.pending_reservations ?? 0) : null,
      reserved_amount: integrity ? Number(integrity.reserved_amount ?? 0) : null,
      last_operation_at: last?.created_at ?? null,
      last_operation_label: last?.description ?? last?.type ?? last?.operation ?? null,
    };
    const status = creditRowStatus(base);
    return { ...base, status, status_label: creditStatusLabel(status) };
  }).sort((a, b) => {
    const priority = { critical: 3, attention: 2, unmonitored: 1, ok: 0 };
    return priority[b.status] - priority[a.status] || Math.abs(b.wallet_ledger_delta ?? 0) - Math.abs(a.wallet_ledger_delta ?? 0);
  });

  const reservations = (reservationRows ?? []).map((row): CeoCreditReservationRow => {
    const createdAt = row.created_at as string;
    const ageMinutes = createdAt ? Math.max(0, Math.round((now - new Date(createdAt).getTime()) / 60000)) : 0;
    return {
      id: row.id as string,
      tenant_id: (row.tenant_id as string | null) ?? null,
      tenant_name: (row.tenant_name as string | null) ?? null,
      user_email: (row.user_email as string | null) ?? null,
      operation_id: (row.operation_id as string | null) ?? null,
      amount: Number(row.amount ?? 0),
      description: (row.description as string | null) ?? null,
      status: String(row.status ?? 'reserved'),
      expires_at: (row.expires_at as string | null) ?? null,
      created_at: createdAt,
      age_minutes: ageMinutes,
      stale: ageMinutes >= 60,
    };
  });

  const failures = (failureRows ?? []).map((row): CeoCreditFailureRow => ({
    id: row.id as string,
    operation_id: (row.operation_id as string | null) ?? null,
    tenant_id: (row.tenant_id as string | null) ?? null,
    tenant_name: (row.tenant_name as string | null) ?? null,
    user_email: (row.user_email as string | null) ?? null,
    operation_kind: (row.operation_kind as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    amount: row.amount !== null && row.amount !== undefined ? Number(row.amount) : null,
    reason: (row.error_message || row.error_code || row.description || null) as string | null,
    created_at: (row.created_at as string | null) ?? null,
  }));

  const refunds = (refundRows ?? []).map((row): CeoCreditRefundRow => ({
    id: row.id as string,
    operation_id: (row.operation_id as string | null) ?? null,
    tenant_id: (row.tenant_id as string | null) ?? null,
    tenant_name: (row.tenant_name as string | null) ?? null,
    user_email: (row.user_email as string | null) ?? null,
    amount: row.amount !== null && row.amount !== undefined ? Number(row.amount) : null,
    reason: (row.description as string | null) ?? null,
    created_at: ((row.completed_at ?? row.created_at) as string | null) ?? null,
  }));

  const duplicates = (duplicateRows ?? []).map((row): CeoCreditDuplicateRow => ({
    id: row.id as string,
    operation_id: (row.operation_id as string | null) ?? null,
    tenant_id: (row.tenant_id as string | null) ?? null,
    tenant_name: (row.tenant_name as string | null) ?? null,
    user_email: (row.user_email as string | null) ?? null,
    operation_kind: (row.operation_kind as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    amount: row.amount !== null && row.amount !== undefined ? Number(row.amount) : null,
    attempt_count: Number(row.attempt_count ?? 0),
    last_seen_at: (row.last_seen_at as string | null) ?? null,
  }));

  const totalWalletBalance = walletRows ? walletRows.reduce((sum, row) => sum + Number(row.balance ?? 0), 0) : null;
  const consumedToday = ledgerTodayRows ? creditConsumption(ledgerTodayRows) : null;
  const consumedMonth = ledgerMonthRows ? creditConsumption(ledgerMonthRows) : null;

  const cards: CeoCreditCommandCard[] = [
    {
      key: 'wallet_total',
      title: 'Saldo total em wallets',
      value: totalWalletBalance,
      status: totalWalletBalance === null ? 'unmonitored' : 'ok',
      subtext: totalWalletBalance === null ? 'fonte nao disponivel' : `${walletRows?.length ?? 0} carteiras lidas`,
      source: 'credits_wallet',
    },
    {
      key: 'consumed_today',
      title: 'Consumidos hoje',
      value: consumedToday,
      status: consumedToday === null ? 'unmonitored' : 'ok',
      subtext: 'debitos no ledger desde 00:00',
      source: 'credits_ledger hoje',
    },
    {
      key: 'consumed_month',
      title: 'Consumidos no mes',
      value: consumedMonth,
      status: consumedMonth === null ? 'unmonitored' : 'ok',
      subtext: 'debitos no ledger no mes atual',
      source: 'credits_ledger mes atual',
    },
    {
      key: 'open_reservations',
      title: 'Reservas abertas',
      value: dashboard?.pending_reservations ?? (reservationRows ? reservationRows.length : null),
      status: reservationRows === null && !dashboard ? 'unmonitored' : (reservationRows?.length ?? dashboard?.pending_reservations ?? 0) > 0 ? 'attention' : 'ok',
      subtext: 'status reserved',
      source: 'v_credit_reservations',
    },
    {
      key: 'credit_failures',
      title: 'Falhas de credito',
      value: dashboard?.failed_operations ?? (failureRows ? failureRows.length : null),
      status: failureRows === null && !dashboard ? 'unmonitored' : (failureRows?.length ?? dashboard?.failed_operations ?? 0) > 0 ? 'critical' : 'ok',
      subtext: 'operacoes falhadas',
      source: 'v_credit_failures',
    },
    {
      key: 'divergences',
      title: 'Divergencias detectadas',
      value: dashboard?.wallet_ledger_divergences ?? (integrityRows ? integrityRows.filter(r => r.integrity_status !== 'ok').length : null),
      status: integrityRows === null && !dashboard ? 'unmonitored' : (dashboard?.wallet_ledger_divergences ?? integrityRows?.filter(r => r.integrity_status !== 'ok').length ?? 0) > 0 ? 'critical' : 'ok',
      subtext: dashboard ? 'wallet vs ledger (v_ceo_credit_dashboard)' : 'wallet vs ledger (fallback: v_credit_integrity)',
      source: dashboard ? 'v_ceo_credit_dashboard' : 'v_credit_integrity',
    },
    {
      key: 'refunds',
      title: 'Refunds/releases',
      value: dashboard?.refunds_total ?? (refundRows ? refundRows.length : null),
      status: refundRows === null && !dashboard ? 'unmonitored' : (refundRows?.length ?? dashboard?.refunds_total ?? 0) > 0 ? 'attention' : 'ok',
      subtext: 'reembolsos e releases',
      source: 'v_credit_refunds',
    },
    {
      key: 'duplicates',
      title: 'Operacoes duplicadas',
      value: dashboard?.suspicious_retries ?? (duplicateRows ? duplicateRows.length : null),
      status: duplicateRows === null && !dashboard ? 'unmonitored' : (duplicateRows?.length ?? dashboard?.suspicious_retries ?? 0) > 0 ? 'attention' : 'ok',
      subtext: 'attempt_count > 1',
      source: 'v_credit_duplicates',
    },
  ];

  return {
    generatedAt,
    cards,
    wallets,
    reservations,
    failures,
    refunds,
    duplicates,
    sources,
  };
}

function normalizePricingPlanCode(value: unknown): string | null {
  const code = String(value ?? '').trim().toUpperCase();
  if (!code) return null;
  if (code === 'PREMIUM') return 'MASTER';
  return code;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function moneyDelta(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return Math.abs(a - b);
}

function friendlyAiCostName(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function categorizeAiCost(key: string): string {
  if (key.includes('IMAGEM') || key.includes('IMAGE') || key.includes('GPT_IMAGE') || key.includes('NANO_BANANA')) return 'imagem';
  if (key.includes('OCR')) return 'OCR';
  if (key.includes('DOCUMENTO') || key.includes('RELATORIO') || key.includes('PEI') || key.includes('PAEE') || key.includes('PDI') || key.includes('ESTUDO')) return 'relatorio/documento';
  if (key.includes('IMPORT') || key.includes('UPLOAD') || key.includes('TEMPLATE')) return 'importacao';
  if (key.includes('INCLUILAB') || key.includes('A4_') || key.includes('ADAPTAR_')) return 'IncluiLAB';
  if (key.includes('TEXTO') || key.includes('TEXT') || key.includes('ATIVIDADE') || key.includes('ADAPTAR')) return 'texto/atividade';
  return 'sem categoria';
}

function aiCostSeverity(cost: number, category: string): CeoPricingAiCostRow['severity'] {
  if (category === 'sem categoria' || cost <= 0 || cost > 20) return 'critical';
  if (cost >= 15) return 'attention';
  return 'ok';
}

function expectedProductPrice(
  product: KiwifyProduct,
  planMap: Map<string, CeoPricingPlanRow>,
  packageRows: CeoPricingCreditPackageRow[],
): number | null {
  if (product.product_type === 'credits') {
    const match = packageRows.find(pkg => pkg.credits !== null && pkg.credits === Number(product.credits_amount ?? 0));
    return match?.price_brl ?? null;
  }
  const planCode = normalizePricingPlanCode(product.plan_code);
  if (!planCode) return null;
  const plan = planMap.get(planCode);
  if (!plan) return null;
  return product.billing_cycle === 'annual' ? plan.price_annual : plan.price_monthly ?? plan.landing_price_monthly;
}

/**
 * Admin read-only de planos, precos, Kiwify, cupons, pacotes e custos de IA.
 * Nao executa mutations, nao altera checkout, creditos, cobranca ou gateway.
 */
export async function getCeoPricingAiAdmin(): Promise<CeoPricingAiAdmin> {
  const generatedAt = new Date().toISOString();
  const sources: CeoHealthSource[] = [];
  const divergences: CeoPricingDivergence[] = [];

  let plansRows: any[] | null = null;
  let productRows: KiwifyProduct[] | null = null;
  let couponRows: CeoCoupon[] | null = null;
  let landingRows: any[] | null = null;

  try {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    plansRows = data ?? [];
    sources.push(sourceAvailable('plans', 'plans'));
  } catch (error) {
    sources.push(sourceUnavailable('plans', 'plans', error));
  }

  try {
    productRows = await getKiwifyProducts();
    sources.push(sourceAvailable('kiwify_products', 'kiwify_products'));
  } catch (error) {
    sources.push(sourceUnavailable('kiwify_products', 'kiwify_products', error));
  }

  try {
    couponRows = await getCoupons();
    sources.push(sourceAvailable('ceo_coupons', 'ceo_coupons'));
  } catch (error) {
    sources.push(sourceUnavailable('ceo_coupons', 'ceo_coupons', error));
  }

  try {
    const { data, error } = await supabase
      .from('landing_content')
      .select('section_key,title,content_json,is_active,updated_at')
      .in('section_key', ['planos', 'kiwify', 'creditos', 'descontos'])
      .order('section_key', { ascending: true });
    if (error) throw error;
    landingRows = data ?? [];
    sources.push(sourceAvailable('landing_content', 'landing_content'));
  } catch (error) {
    sources.push(sourceUnavailable('landing_content', 'landing_content', error));
  }

  sources.push(sourceAvailable('ai_costs_config', 'src/config/aiCosts.ts'));
  const envKeys = [
    'VITE_KIWIFY_CHECKOUT_PRO',
    'VITE_KIWIFY_CHECKOUT_PRO_ANNUAL',
    'VITE_KIWIFY_CHECKOUT_MASTER',
    'VITE_KIWIFY_CHECKOUT_MASTER_ANNUAL',
    'VITE_KIWIFY_CHECKOUT_AI100',
    'VITE_KIWIFY_CHECKOUT_AI300',
    'VITE_KIWIFY_CHECKOUT_AI900',
  ];
  const envAvailable = envKeys.some(key => Boolean((import.meta as any).env?.[key]));
  sources.push(envAvailable
    ? sourceAvailable('kiwify_env', 'VITE_KIWIFY_CHECKOUT_*')
    : { key: 'kiwify_env', label: 'VITE_KIWIFY_CHECKOUT_*', status: 'unavailable', detail: 'Nenhuma variavel VITE_KIWIFY_CHECKOUT_* exposta no frontend.' });

  const landingByKey = new Map<string, any>();
  for (const row of landingRows ?? []) landingByKey.set(String(row.section_key), row.content_json ?? {});
  const landingPlans = landingByKey.get('planos') ?? {};
  const landingCredits = landingByKey.get('creditos') ?? {};

  const configPlanEntries = Object.entries(SUBSCRIPTION_PLANS).map(([code, plan]) => ({
    code: normalizePricingPlanCode(code) ?? code,
    name: plan.name,
    credits: Number(plan.credits ?? 0),
  }));
  const configPlanCodes = new Set(configPlanEntries.map(plan => plan.code));

  const planMap = new Map<string, CeoPricingPlanRow>();
  for (const configPlan of configPlanEntries) {
    const landingPrice = configPlan.code === 'PRO'
      ? toNumberOrNull(landingPlans.pro_discount_price ?? landingPlans.pro_full_price)
      : configPlan.code === 'MASTER'
        ? toNumberOrNull(landingPlans.premium_discount_price ?? landingPlans.premium_full_price)
        : null;
    planMap.set(configPlan.code, {
      code: configPlan.code,
      display_name: configPlan.name,
      price_monthly: null,
      price_annual: null,
      credits_monthly: configPlan.credits,
      config_credits_monthly: configPlan.credits,
      landing_price_monthly: landingPrice,
      is_active: null,
      source: 'config',
    });
  }

  for (const row of plansRows ?? []) {
    const code = normalizePricingPlanCode(row.code ?? row.id ?? row.plan_code ?? row.name);
    if (!code) continue;
    const current = planMap.get(code);
    const credits = toNumberOrNull(row.credits_monthly ?? row.ai_credits_per_month ?? row.monthly_credits);
    const mapped: CeoPricingPlanRow = {
      code,
      display_name: String(row.name ?? current?.display_name ?? code),
      price_monthly: toNumberOrNull(row.price_monthly ?? row.price_brl ?? row.monthly_price),
      price_annual: toNumberOrNull(row.price_yearly ?? row.price_annual ?? row.annual_price),
      credits_monthly: credits ?? current?.credits_monthly ?? null,
      config_credits_monthly: current?.config_credits_monthly ?? null,
      landing_price_monthly: current?.landing_price_monthly ?? null,
      is_active: row.is_active ?? true,
      source: current ? 'banco + config' : 'banco',
    };
    planMap.set(code, mapped);
  }

  const plans = Array.from(planMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  for (const plan of plans) {
    if (plan.config_credits_monthly !== null && plan.credits_monthly !== null && plan.config_credits_monthly !== plan.credits_monthly) {
      divergences.push({
        id: `plan-credits-${plan.code}`,
        severity: 'high',
        category: 'plans',
        title: `Creditos divergentes no plano ${plan.code}`,
        description: `Banco/UI indica ${plan.credits_monthly} creditos, configuracao oficial indica ${plan.config_credits_monthly}.`,
        recommendedAction: 'Revisar plans versus src/config/aiCosts.ts antes de qualquer mudanca comercial.',
      });
    }
    if (moneyDelta(plan.price_monthly, plan.landing_price_monthly) !== null && (moneyDelta(plan.price_monthly, plan.landing_price_monthly) ?? 0) >= 0.01) {
      divergences.push({
        id: `landing-price-${plan.code}`,
        severity: 'medium',
        category: 'landing',
        title: `Landing/pricing divergente em ${plan.code}`,
        description: `Plano no banco esta R$ ${plan.price_monthly}; landing mostra R$ ${plan.landing_price_monthly}.`,
        recommendedAction: 'Conferir copy comercial e produto de checkout antes de publicar campanhas.',
      });
    }
  }

  const packageFromLanding = Array.isArray(landingCredits.packages) ? landingCredits.packages : [];
  const creditPackages: CeoPricingCreditPackageRow[] = CREDIT_PACKAGES.map(pkg => {
    const landingPkg = packageFromLanding.find((item: any) =>
      String(item.id ?? item.code ?? '') === pkg.id || Number(item.credits ?? 0) === Number(pkg.credits ?? 0)
    );
    const price = toNumberOrNull(landingPkg?.price ?? landingPkg?.price_brl) ?? Number(pkg.price);
    const credits = toNumberOrNull(landingPkg?.credits) ?? Number(pkg.credits);
    return {
      code: String(pkg.id),
      credits,
      price_brl: price,
      cost_per_credit: credits > 0 ? price / credits : null,
      is_active: landingPkg?.is_active ?? true,
      source: landingPkg ? 'landing + config' : 'config',
      label: landingPkg?.label ?? pkg.label ?? null,
    };
  });

  for (const pkg of creditPackages) {
    if ((pkg.credits ?? 0) <= 0 || (pkg.price_brl ?? 0) <= 0 || (pkg.cost_per_credit ?? 0) <= 0) {
      divergences.push({
        id: `package-invalid-${pkg.code}`,
        severity: 'high',
        category: 'credits',
        title: `Pacote de creditos incoerente: ${pkg.code}`,
        description: `Creditos, preco ou custo por credito esta vazio/zerado.`,
        recommendedAction: 'Revisar pacote na configuracao comercial antes de divulgar.',
      });
    }
  }

  const kiwifyProducts = (productRows ?? []).map((product): CeoPricingKiwifyProductRow => {
    const expected = expectedProductPrice(product, planMap, creditPackages);
    const planCode = normalizePricingPlanCode(product.plan_code);
    if (product.product_type === 'subscription' && !planCode) {
      divergences.push({
        id: `product-plan-missing-${product.id ?? product.kiwify_product_id}`,
        severity: 'high',
        category: 'kiwify',
        title: `Produto Kiwify sem plan_code`,
        description: `${product.product_name || product.kiwify_product_id} nao esta ligado a um plano.`,
        recommendedAction: 'Associar produto ao plan_code correto antes de usar em campanhas.',
      });
    }
    if (product.product_type === 'subscription' && planCode && !configPlanCodes.has(planCode)) {
      divergences.push({
        id: `product-plan-unknown-${product.id ?? product.kiwify_product_id}`,
        severity: 'high',
        category: 'kiwify',
        title: `Produto Kiwify aponta para plano inexistente`,
        description: `${product.product_name || product.kiwify_product_id} usa plan_code ${planCode}, que nao existe na config oficial.`,
        recommendedAction: 'Revisar cadastro do produto Kiwify.',
      });
    }
    if (expected !== null && toNumberOrNull(product.price_brl) !== null && (moneyDelta(Number(product.price_brl), expected) ?? 0) >= 0.01) {
      divergences.push({
        id: `product-price-${product.id ?? product.kiwify_product_id}`,
        severity: 'medium',
        category: 'kiwify',
        title: `Preco divergente no produto Kiwify`,
        description: `${product.product_name || product.kiwify_product_id}: Kiwify R$ ${product.price_brl}, esperado R$ ${expected}.`,
        recommendedAction: 'Conferir preco do produto contra planos/pacotes antes de trafego pago.',
      });
    }
    return {
      id: product.id,
      product_id: product.kiwify_product_id,
      product_name: product.product_name,
      product_type: product.product_type,
      plan_code: planCode,
      billing_cycle: product.billing_cycle,
      credits_amount: toNumberOrNull(product.credits_amount),
      price_brl: toNumberOrNull(product.price_brl),
      expected_price_brl: expected,
      is_active: product.is_active,
      source: 'kiwify_products',
    };
  });

  const coupons = (couponRows ?? []).map((coupon): CeoPricingCouponRow => {
    const planCode = normalizePricingPlanCode(coupon.plan_code);
    if (coupon.is_active && planCode && !configPlanCodes.has(planCode)) {
      divergences.push({
        id: `coupon-plan-${coupon.id ?? coupon.code}`,
        severity: 'medium',
        category: 'coupons',
        title: `Cupom ativo para plano inexistente`,
        description: `${coupon.code} aponta para ${planCode}, que nao existe na configuracao oficial.`,
        recommendedAction: 'Revisar campanha antes de compartilhar o link.',
      });
    }
    return {
      id: coupon.id,
      code: coupon.code,
      plan_code: planCode,
      billing_cycle: coupon.billing_cycle,
      discount_type: coupon.discount_type,
      discount_value: toNumberOrNull(coupon.discount_value),
      campaign_name: coupon.campaign_name,
      is_active: coupon.is_active,
      created_at: coupon.created_at,
      source: 'ceo_coupons',
    };
  });

  const aiCostSources: Array<[string, Record<string, number>]> = [
    ['AI_CREDIT_COSTS', AI_CREDIT_COSTS as Record<string, number>],
    ['INCLUILAB_MODEL_COSTS', INCLUILAB_MODEL_COSTS as Record<string, number>],
    ['INCLUILAB_ACTIVITY_COSTS', INCLUILAB_ACTIVITY_COSTS as Record<string, number>],
  ];
  const aiCosts: CeoPricingAiCostRow[] = aiCostSources.flatMap(([source, costs]) =>
    Object.entries(costs).map(([key, value]) => {
      const category = categorizeAiCost(key);
      const severity = aiCostSeverity(Number(value), category);
      if (category === 'sem categoria') {
        divergences.push({
          id: `ai-category-${source}-${key}`,
          severity: 'low',
          category: 'ai',
          title: `Custo IA sem categoria`,
          description: `${key} nao foi classificado automaticamente.`,
          recommendedAction: 'Adicionar convencao de categoria antes de criar editor de custos.',
        });
      }
      return {
        key,
        friendly_name: friendlyAiCostName(key),
        credits_cost: Number(value),
        category,
        severity,
        source,
      };
    })
  ).sort((a, b) => b.credits_cost - a.credits_cost || a.key.localeCompare(b.key));

  const mostExpensiveAiCost = aiCosts[0] ?? null;
  const cards: CeoPricingCard[] = [
    {
      key: 'active_plans',
      title: 'Planos ativos',
      value: plansRows === null ? null : plans.filter(plan => plan.is_active !== false).length,
      status: plansRows === null ? 'unmonitored' : 'ok',
      subtext: plansRows === null ? 'fonte nao disponivel' : 'plans + config oficial',
      source: 'plans',
    },
    {
      key: 'active_kiwify_products',
      title: 'Produtos Kiwify ativos',
      value: productRows === null ? null : kiwifyProducts.filter(product => product.is_active !== false).length,
      status: productRows === null ? 'unmonitored' : 'ok',
      subtext: productRows === null ? 'fonte nao disponivel' : 'kiwify_products',
      source: 'kiwify_products',
    },
    {
      key: 'active_coupons',
      title: 'Cupons ativos',
      value: couponRows === null ? null : coupons.filter(coupon => coupon.is_active !== false).length,
      status: couponRows === null ? 'unmonitored' : 'ok',
      subtext: couponRows === null ? 'fonte nao disponivel' : 'ceo_coupons',
      source: 'ceo_coupons',
    },
    {
      key: 'active_credit_packages',
      title: 'Pacotes extras ativos',
      value: creditPackages.filter(pkg => pkg.is_active !== false).length,
      status: 'ok',
      subtext: 'config + landing quando disponivel',
      source: 'src/config/aiCosts.ts',
    },
    {
      key: 'most_expensive_ai_cost',
      title: 'Custo IA mais caro',
      value: mostExpensiveAiCost ? `${mostExpensiveAiCost.credits_cost} cr.` : null,
      status: mostExpensiveAiCost ? mostExpensiveAiCost.severity : 'unmonitored',
      subtext: mostExpensiveAiCost ? mostExpensiveAiCost.key : 'sem custos configurados',
      source: 'src/config/aiCosts.ts',
    },
    {
      key: 'pricing_divergences',
      title: 'Possiveis divergencias',
      value: divergences.length,
      status: divergences.some(d => d.severity === 'critical' || d.severity === 'high') ? 'critical' : divergences.length > 0 ? 'attention' : 'ok',
      subtext: 'comparacoes somente leitura',
      source: 'agregador CEO',
    },
  ];

  return {
    generatedAt,
    cards,
    plans,
    kiwifyProducts,
    coupons,
    creditPackages,
    aiCosts,
    divergences,
    sources,
  };
}

function lowerTrim(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeBillingPlanCode(value: unknown): string | null {
  const code = String(value ?? '').trim().toUpperCase();
  if (!code) return null;
  if (code === 'PREMIUM') return 'MASTER';
  return code;
}

function payloadValue(payload: any, paths: string[][]): unknown {
  for (const path of paths) {
    let current = payload;
    for (const key of path) {
      if (current === null || current === undefined) break;
      current = current[key];
    }
    if (current !== null && current !== undefined && current !== '') return current;
  }
  return null;
}

function billingSeverityLabel(severity: CeoBillingKiwifyPurchaseRow['severity']): string {
  if (severity === 'critical') return 'Critico';
  if (severity === 'attention') return 'Atencao';
  return 'OK';
}

function addBillingAlert(
  alerts: CeoBillingKiwifyAlert[],
  id: string,
  severity: CeoHealthAlertSeverity,
  title: string,
  description: string,
  recommendedAction: string,
  count: number,
): void {
  if (count <= 0) return;
  alerts.push({ id, severity, title, description, recommendedAction, count });
}

/**
 * Central read-only de Billing/Kiwify/Reconciliation.
 * Nao altera webhook, checkout, produtos, creditos ou banco. Reconciliacao fica fora
 * deste agregador e so deve ser chamada por acao manual explicita na UI.
 */
export async function getCeoBillingKiwifyReconciliation(): Promise<CeoBillingKiwifyReconciliation> {
  const generatedAt = new Date().toISOString();
  const sources: CeoHealthSource[] = [];

  let purchaseRows: any[] | null = null;
  let productRows: KiwifyProduct[] | null = null;
  let subscriberRows: CeoSubscriber[] | null = null;
  let kpis: CeoKpis | null = null;
  let internalRows: InactiveTenantRow[] | null = null;
  let walletRows: any[] | null = null;

  try {
    const { data, error } = await supabase
      .from('kiwify_purchases')
      .select('id,email,product_key,plan_code,credits_amount,provider_order_id,status,activation_status,paid_at,activated_at,tenant_id,created_at,price_brl,payload')
      .order('created_at', { ascending: false })
      .limit(800);
    if (error) throw error;
    purchaseRows = data ?? [];
    sources.push(sourceAvailable('kiwify_purchases', 'kiwify_purchases'));
  } catch (error) {
    try {
      purchaseRows = await getKiwifyPurchases();
      sources.push(sourceAvailable('kiwify_purchases', 'kiwify_purchases (fallback sem payload/preco)'));
    } catch (fallbackError) {
      sources.push(sourceUnavailable('kiwify_purchases', 'kiwify_purchases', fallbackError || error));
    }
  }

  try {
    productRows = await getKiwifyProducts();
    sources.push(sourceAvailable('kiwify_products', 'kiwify_products'));
  } catch (error) {
    sources.push(sourceUnavailable('kiwify_products', 'kiwify_products', error));
  }

  try {
    const page = await getCeoSubscribersPage({ page: 1, pageSize: 800 });
    subscriberRows = page.rows;
    sources.push(sourceAvailable('v_ceo_subscribers', 'v_ceo_subscribers'));
  } catch (error) {
    sources.push(sourceUnavailable('v_ceo_subscribers', 'v_ceo_subscribers', error));
  }

  try {
    kpis = await getCeoKpis();
    sources.push(sourceAvailable('ceo_get_kpis', 'ceo_get_kpis'));
  } catch (error) {
    sources.push(sourceUnavailable('ceo_get_kpis', 'ceo_get_kpis', error));
  }

  try {
    internalRows = await getCeoInternalTenants();
    sources.push(sourceAvailable('tenants.is_internal', 'tenants.is_internal'));
  } catch (error) {
    sources.push(sourceUnavailable('tenants.is_internal', 'tenants.is_internal', error));
  }

  try {
    const { data, error } = await supabase
      .from('credits_wallet')
      .select('tenant_id,balance,updated_at')
      .limit(1000);
    if (error) throw error;
    walletRows = data ?? [];
    sources.push(sourceAvailable('credits_wallet', 'credits_wallet leitura minima'));
  } catch (error) {
    sources.push(sourceUnavailable('credits_wallet', 'credits_wallet leitura minima', error));
  }

  const productByKey = new Map<string, KiwifyProduct>();
  const productById = new Map<string, KiwifyProduct>();
  for (const product of productRows ?? []) {
    if (product.product_key) productByKey.set(lowerTrim(product.product_key), product);
    if (product.kiwify_product_id) productById.set(lowerTrim(product.kiwify_product_id), product);
  }

  const subscriberByTenant = new Map<string, CeoSubscriber>();
  const subscriberByEmail = new Map<string, CeoSubscriber>();
  for (const sub of subscriberRows ?? []) {
    if (sub.tenant_id) subscriberByTenant.set(sub.tenant_id, sub);
    if (sub.user_email) subscriberByEmail.set(lowerTrim(sub.user_email), sub);
  }

  const internalTenantIds = new Set((internalRows ?? []).map(row => row.id));
  const walletByTenant = new Map<string, any>();
  for (const row of walletRows ?? []) if (row.tenant_id) walletByTenant.set(row.tenant_id as string, row);

  const purchaseDupKeyCounts = new Map<string, number>();
  for (const row of purchaseRows ?? []) {
    const duplicateKey = lowerTrim(row.provider_order_id) || `${lowerTrim(row.email)}|${lowerTrim(row.product_key)}|${String(row.paid_at ?? row.created_at ?? '').slice(0, 10)}`;
    if (!duplicateKey) continue;
    purchaseDupKeyCounts.set(duplicateKey, (purchaseDupKeyCounts.get(duplicateKey) ?? 0) + 1);
  }

  const configPlanCodes = new Set(Object.keys(SUBSCRIPTION_PLANS).map(code => normalizeBillingPlanCode(code)).filter(Boolean) as string[]);

  const purchases = (purchaseRows ?? []).map((row): CeoBillingKiwifyPurchaseRow => {
    const payload = row.payload ?? {};
    const payloadProductId = payloadValue(payload, [
      ['order', 'product', 'id'],
      ['order', 'product_id'],
      ['product', 'id'],
      ['product_id'],
    ]);
    const payloadProductName = payloadValue(payload, [
      ['order', 'product', 'name'],
      ['order', 'product_name'],
      ['product', 'name'],
      ['product_name'],
    ]);
    const customerName = payloadValue(payload, [
      ['customer', 'name'],
      ['order', 'customer', 'name'],
      ['Customer', 'full_name'],
      ['customer_name'],
      ['name'],
    ]);
    const productKey = String(row.product_key ?? '').trim();
    const productId = String(payloadProductId ?? row.product_key ?? '').trim() || null;
    const mappedProduct = productByKey.get(lowerTrim(productKey)) || (productId ? productById.get(lowerTrim(productId)) : undefined);
    const expectedPlan = normalizeBillingPlanCode(row.plan_code ?? mappedProduct?.plan_code);
    const tenantId = (row.tenant_id as string | null) ?? null;
    const subscriber = tenantId ? subscriberByTenant.get(tenantId) : subscriberByEmail.get(lowerTrim(row.email));
    const tenantPlan = normalizeBillingPlanCode(subscriber?.plan_code);
    const wallet = tenantId ? walletByTenant.get(tenantId) : null;
    const paymentStatus = String(row.status ?? 'N/D').toUpperCase();
    const isApproved = paymentStatus === 'APPROVED';
    const isSubscriptionPurchase = Boolean(expectedPlan);
    const duplicateKey = lowerTrim(row.provider_order_id) || `${lowerTrim(row.email)}|${lowerTrim(row.product_key)}|${String(row.paid_at ?? row.created_at ?? '').slice(0, 10)}`;
    const flags: string[] = [];

    if (!row.email) flags.push('purchase_sem_email');
    if (isApproved && !tenantId && !row.activated_at) flags.push('aprovada_sem_tenant');
    if (isApproved && tenantId && isSubscriptionPurchase && (!tenantPlan || tenantPlan === 'FREE')) flags.push('paga_plano_free');
    if (isApproved && productKey === 'UNKNOWN') flags.push('produto_unknown');
    if (mappedProduct?.product_type === 'subscription' && !mappedProduct.plan_code) flags.push('produto_sem_plan_code');
    if (expectedPlan && !configPlanCodes.has(expectedPlan)) flags.push('plan_code_inexistente');
    if (isApproved && isSubscriptionPurchase && walletRows !== null && tenantId && wallet && Number(wallet.balance ?? 0) <= 0) flags.push('pagamento_sem_creditos_visiveis');
    if (duplicateKey && (purchaseDupKeyCounts.get(duplicateKey) ?? 0) > 1) flags.push('duplicidade_suspeita');
    if (isApproved && tenantId && internalTenantIds.has(tenantId)) flags.push('tenant_interno_pago');
    if (isApproved && tenantId && !row.activated_at) flags.push('aprovada_sem_ativacao');

    const severity: CeoBillingKiwifyPurchaseRow['severity'] = flags.some(flag => [
      'purchase_sem_email',
      'aprovada_sem_tenant',
      'paga_plano_free',
      'produto_unknown',
      'plan_code_inexistente',
    ].includes(flag)) ? 'critical' : flags.length > 0 || paymentStatus === 'PENDING' ? 'attention' : 'ok';

    return {
      id: row.id as string,
      date: ((row.paid_at ?? row.created_at) as string | null) ?? null,
      customer_email: (row.email as string | null) ?? null,
      customer_name: (customerName as string | null) ?? null,
      product_name: (payloadProductName as string | null) ?? mappedProduct?.product_name ?? (productKey || null),
      product_id: productId,
      product_key: productKey || null,
      expected_plan_code: expectedPlan,
      payment_status: paymentStatus,
      activation_status: (row.activation_status as string | null) ?? (row.activated_at ? 'ACTIVATED' : null),
      tenant_id: tenantId,
      tenant_name: subscriber?.tenant_name ?? null,
      tenant_plan_code: tenantPlan,
      price_brl: toNumberOrNull(row.price_brl ?? payloadValue(payload, [['order', 'total'], ['order', 'amount'], ['amount'], ['price_brl']])),
      billing_cycle: (mappedProduct?.billing_cycle ?? subscriber?.purchase_billing_cycle ?? subscriber?.billing_cycle ?? null) as string | null,
      mapping_source: mappedProduct ? 'kiwify_products' : productKey ? 'purchase.product_key' : 'sem mapping',
      severity,
      severity_label: billingSeverityLabel(severity),
      flags,
      provider_order_id: (row.provider_order_id as string | null) ?? null,
      paid_at: (row.paid_at as string | null) ?? null,
      activated_at: (row.activated_at as string | null) ?? null,
      credits_amount: toNumberOrNull(row.credits_amount),
      wallet_balance: wallet ? toNumberOrNull(wallet.balance) : null,
    };
  }).sort((a, b) => {
    const priority = { critical: 3, attention: 2, ok: 1 };
    return priority[b.severity] - priority[a.severity] || new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime();
  });

  const totalPurchases = purchaseRows?.length ?? null;
  const approvedPurchases = purchaseRows ? purchases.filter(row => row.payment_status === 'APPROVED').length : null;
  const pendingPurchases = purchaseRows ? purchases.filter(row => row.payment_status === 'PENDING').length : null;
  const noTenant = purchaseRows ? purchases.filter(row => row.flags.includes('aprovada_sem_tenant')).length : null;
  const paidFree = purchaseRows ? purchases.filter(row => row.flags.includes('paga_plano_free')).length : null;
  const unmappedProduct = purchaseRows ? purchases.filter(row => row.flags.includes('produto_unknown') || row.flags.includes('produto_sem_plan_code')).length : null;
  const activated = purchaseRows ? purchases.filter(row => row.activated_at || row.activation_status === 'ACTIVATED').length : null;
  const criticalDivergences = purchaseRows ? purchases.filter(row => row.severity === 'critical').length : null;

  const alerts: CeoBillingKiwifyAlert[] = [];
  addBillingAlert(alerts, 'approved_no_tenant', 'critical', 'Compra aprovada sem tenant', 'Pagamento aprovado ainda nao esta vinculado a uma conta/tenant.', 'Contatar comprador ou orientar cadastro com o mesmo e-mail da compra.', purchases.filter(row => row.flags.includes('aprovada_sem_tenant')).length);
  addBillingAlert(alerts, 'paid_free', 'critical', 'Compra aprovada com tenant em FREE', 'Existe tenant vinculado, mas o plano atual continua FREE ou ausente.', 'Rodar reconciliacao manual se aplicavel e conferir assinatura.', purchases.filter(row => row.flags.includes('paga_plano_free')).length);
  addBillingAlert(alerts, 'product_mapping', 'high', 'Produto Kiwify sem mapeamento', 'Produto UNKNOWN ou assinatura sem plan_code confiavel.', 'Corrigir cadastro/mapeamento do produto antes de novas vendas.', purchases.filter(row => row.flags.includes('produto_unknown') || row.flags.includes('produto_sem_plan_code')).length);
  addBillingAlert(alerts, 'unknown_plan', 'high', 'plan_code inexistente', 'Compra aponta para plano fora da configuracao oficial.', 'Revisar plan_code no produto Kiwify e no registro da compra.', purchases.filter(row => row.flags.includes('plan_code_inexistente')).length);
  addBillingAlert(alerts, 'approved_no_credits', 'medium', 'Pagamento aprovado sem creditos visiveis', 'Wallet lida com saldo zerado/negativo para compra aprovada de assinatura.', 'Conferir wallet e ledger antes de qualquer ajuste manual.', purchases.filter(row => row.flags.includes('pagamento_sem_creditos_visiveis')).length);
  addBillingAlert(alerts, 'duplicates', 'medium', 'Compra duplicada suspeita', 'Mais de uma purchase compartilha order/email/produto/data.', 'Conferir idempotencia e provider_order_id antes de reconciliar.', purchases.filter(row => row.flags.includes('duplicidade_suspeita')).length);
  addBillingAlert(alerts, 'missing_email', 'critical', 'Purchase sem email', 'Registro de compra nao possui e-mail do comprador.', 'Investigar payload original da Kiwify.', purchases.filter(row => row.flags.includes('purchase_sem_email')).length);
  // CEO-10C.2: internal_paid e visibilidade administrativa — nao e incidente financeiro, severidade low
  addBillingAlert(alerts, 'internal_paid', 'low', 'Tenant interno com compra vinculada (visibilidade)', 'Compra aprovada vinculada a tenant interno. Nao e problema financeiro — registro administrativo esperado.', 'Verificar periodicamente se o tenant deve permanecer como interno ou retornar para metricas comerciais.', purchases.filter(row => row.flags.includes('tenant_interno_pago')).length);

  const cards: CeoBillingKiwifyCard[] = [
    { key: 'total_purchases', title: 'Compras totais', value: totalPurchases, status: totalPurchases === null ? 'unmonitored' : 'ok', subtext: 'kiwify_purchases', source: 'kiwify_purchases' },
    { key: 'approved_purchases', title: 'Compras aprovadas', value: approvedPurchases, status: approvedPurchases === null ? 'unmonitored' : 'ok', subtext: 'status APPROVED', source: 'kiwify_purchases' },
    { key: 'pending_purchases', title: 'Compras pendentes', value: pendingPurchases, status: pendingPurchases === null ? 'unmonitored' : pendingPurchases > 0 ? 'attention' : 'ok', subtext: 'status PENDING', source: 'kiwify_purchases' },
    { key: 'no_tenant', title: 'Compras sem tenant', value: kpis?.orphan_purchase_count ?? noTenant, status: noTenant === null && !kpis ? 'unmonitored' : (kpis?.orphan_purchase_count ?? noTenant ?? 0) > 0 ? 'critical' : 'ok', subtext: 'aprovadas sem conta vinculada', source: 'kiwify_purchases + ceo_get_kpis' },
    { key: 'paid_free', title: 'Pagas mas plano FREE', value: paidFree, status: paidFree === null ? 'unmonitored' : paidFree > 0 ? 'critical' : 'ok', subtext: 'tenant vinculado sem plano pago', source: 'v_ceo_subscribers' },
    { key: 'unmapped_product', title: 'Produto sem mapeamento', value: unmappedProduct ?? kpis?.unknown_product_count, status: unmappedProduct === null && !kpis ? 'unmonitored' : (unmappedProduct ?? kpis?.unknown_product_count ?? 0) > 0 ? 'critical' : 'ok', subtext: 'UNKNOWN + sem plan_code', source: 'kiwify_products + v_ceo_subscribers' },
    { key: 'activated', title: 'Ativacoes realizadas', value: activated, status: activated === null ? 'unmonitored' : 'ok', subtext: 'activated_at preenchido', source: 'kiwify_purchases' },
    { key: 'critical_divergences', title: 'Divergencias criticas', value: criticalDivergences, status: criticalDivergences === null ? 'unmonitored' : criticalDivergences > 0 ? 'critical' : 'ok', subtext: 'alertas operacionais', source: 'agregador CEO' },
  ];

  const nextActions = alerts.length === 0
    ? ['Manter rotina de monitoramento e validar novas compras apos campanhas.']
    : alerts.slice(0, 5).map(alert => alert.recommendedAction);

  return {
    generatedAt,
    cards,
    purchases,
    alerts,
    nextActions,
    sources,
  };
}

function accountSeverityLabel(severity: CeoUsersTenantsAccountRow['severity']): string {
  if (severity === 'critical') return 'Critico';
  if (severity === 'attention') return 'Atencao';
  if (severity === 'unmonitored') return 'Nao monitorado';
  return 'OK';
}

function accountCard(
  key: string,
  title: string,
  value: number | string | null,
  status: CeoHealthCardStatus,
  subtext: string,
  source: string,
): CeoUsersTenantsCard {
  return { key, title, value, status, subtext, source };
}

/**
 * Admin read-only de usuarios, tenants e contas internas.
 * Este agregador nao altera tenants/users, assinaturas, creditos ou Kiwify.
 * Acoes manuais ficam fora daqui e devem reutilizar fluxos ja auditados.
 */
export async function getCeoUsersTenantsAdmin(): Promise<CeoUsersTenantsAdmin> {
  const generatedAt = new Date().toISOString();
  const sources: CeoHealthSource[] = [];

  let subscriberRows: CeoSubscriber[] | null = null;
  let userRows: any[] | null = null;
  let tenantRows: any[] | null = null;
  let purchaseRows: KiwifyPurchaseRow[] | null = null;
  let auditRows: AdminAuditEntry[] | null = null;
  let kpis: CeoKpis | null = null;
  let internalTenantRows: InactiveTenantRow[] | null = null;

  try {
    const page = await getCeoSubscribersPage({ page: 1, pageSize: 800 });
    subscriberRows = page.rows;
    sources.push(sourceAvailable('v_ceo_subscribers', 'v_ceo_subscribers'));
  } catch (error) {
    sources.push(sourceUnavailable('v_ceo_subscribers', 'v_ceo_subscribers', error));
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id,email,tenant_id,full_name,nome,is_active,created_at')
      .limit(1200);
    if (error) throw error;
    userRows = data ?? [];
    sources.push(sourceAvailable('users', 'users'));
  } catch (error) {
    sources.push(sourceUnavailable('users', 'users', error));
  }

  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('id,name,plan_id,is_active,is_internal,created_at')
      .limit(1200);
    if (error) throw error;
    tenantRows = data ?? [];
    sources.push(sourceAvailable('tenants', 'tenants'));
  } catch (error) {
    sources.push(sourceUnavailable('tenants', 'tenants', error));
  }

  try {
    purchaseRows = await getKiwifyPurchases();
    sources.push(sourceAvailable('kiwify_purchases', 'kiwify_purchases'));
  } catch (error) {
    sources.push(sourceUnavailable('kiwify_purchases', 'kiwify_purchases', error));
  }

  try {
    auditRows = await getAdminAuditLog(150);
    sources.push(sourceAvailable('admin_audit_log', 'admin_audit_log'));
  } catch (error) {
    sources.push(sourceUnavailable('admin_audit_log', 'admin_audit_log', error));
  }

  try {
    kpis = await getCeoKpis();
    sources.push(sourceAvailable('ceo_get_kpis', 'ceo_get_kpis'));
  } catch (error) {
    sources.push(sourceUnavailable('ceo_get_kpis', 'ceo_get_kpis', error));
  }

  try {
    internalTenantRows = await getCeoInternalTenants();
    sources.push(sourceAvailable('getCeoInternalTenants', 'getCeoInternalTenants()'));
  } catch (error) {
    sources.push(sourceUnavailable('getCeoInternalTenants', 'getCeoInternalTenants()', error));
  }

  const usersByTenant = new Map<string, CeoUsersTenantsUserRow[]>();
  const usersByEmail = new Map<string, CeoUsersTenantsUserRow>();
  for (const row of userRows ?? []) {
    const user: CeoUsersTenantsUserRow = {
      id: (row.id as string | null) ?? null,
      email: (row.email as string | null) ?? null,
      name: ((row.full_name ?? row.nome) as string | null) ?? null,
      is_active: row.is_active === null || row.is_active === undefined ? null : Boolean(row.is_active),
      created_at: (row.created_at as string | null) ?? null,
      tenant_id: (row.tenant_id as string | null) ?? null,
    };
    if (user.tenant_id) {
      const list = usersByTenant.get(user.tenant_id) ?? [];
      list.push(user);
      usersByTenant.set(user.tenant_id, list);
    }
    if (user.email) usersByEmail.set(lowerTrim(user.email), user);
  }

  const tenantsById = new Map<string, any>();
  for (const row of tenantRows ?? []) if (row.id) tenantsById.set(row.id as string, row);
  for (const row of internalTenantRows ?? []) {
    if (!tenantsById.has(row.id)) {
      tenantsById.set(row.id, { id: row.id, name: row.name, is_internal: true, created_at: row.created_at });
    }
  }

  const purchaseByTenant = new Map<string, KiwifyPurchaseRow>();
  const purchaseByEmail = new Map<string, KiwifyPurchaseRow>();
  for (const purchase of purchaseRows ?? []) {
    if (purchase.tenant_id && !purchaseByTenant.has(purchase.tenant_id)) purchaseByTenant.set(purchase.tenant_id, purchase);
    if (purchase.email && !purchaseByEmail.has(lowerTrim(purchase.email))) purchaseByEmail.set(lowerTrim(purchase.email), purchase);
  }

  const auditByTenant = new Map<string, CeoUsersTenantsAuditSummary[]>();
  for (const entry of auditRows ?? []) {
    const targetId = entry.target_id;
    if (!targetId) continue;
    const list = auditByTenant.get(targetId) ?? [];
    list.push({
      action_type: entry.action_type,
      description: entry.description,
      admin_name: entry.admin_name,
      created_at: entry.created_at,
    });
    auditByTenant.set(targetId, list);
  }

  const internalIds = new Set<string>();
  for (const row of tenantRows ?? []) if (row.id && row.is_internal === true) internalIds.add(row.id as string);
  for (const row of internalTenantRows ?? []) internalIds.add(row.id);

  const rowsByTenant = new Map<string, CeoUsersTenantsAccountRow>();
  const addRow = (row: CeoUsersTenantsAccountRow) => rowsByTenant.set(row.tenant_id, row);

  for (const sub of subscriberRows ?? []) {
    const tenant = tenantsById.get(sub.tenant_id);
    const users = usersByTenant.get(sub.tenant_id) ?? [];
    const primaryEmail = sub.user_email || users[0]?.email || null;
    const purchase = sub.purchase_id ? buildUsersTenantsPurchase({
      id: sub.purchase_id,
      email: sub.purchase_email ?? sub.user_email ?? null,
      product_key: sub.purchase_product_key ?? null,
      plan_code: sub.purchase_plan_code ?? null,
      provider_order_id: sub.purchase_order_id ?? null,
      status: sub.purchase_status ?? null,
      activation_status: sub.purchase_activation_status ?? null,
      paid_at: sub.purchase_paid_at ?? null,
      activated_at: sub.purchase_activated_at ?? null,
      tenant_id: sub.tenant_id,
      created_at: sub.purchase_paid_at ?? sub.tenant_created_at ?? null,
    }) : (purchaseByTenant.get(sub.tenant_id) || (primaryEmail ? purchaseByEmail.get(lowerTrim(primaryEmail)) : null));
    const audit = auditByTenant.get(sub.tenant_id) ?? [];
    const divergence = sub.divergence?.label
      ?? (sub.paid_but_free ? 'Compra paga com tenant em FREE' : null)
      ?? (sub.plan_mismatch ? 'Divergencia de plano' : null)
      ?? (sub.wallet_mismatch ? 'Divergencia de wallet' : null)
      ?? (sub.financial_inconsistency ? 'Inconsistencia financeira' : null);
    const severity: CeoUsersTenantsAccountRow['severity'] = sub.critical_finding_count && sub.critical_finding_count > 0
      ? 'critical'
      : sub.has_any_finding || sub.finding_count
        ? 'attention'
        : 'ok';

    addRow({
      tenant_id: sub.tenant_id,
      tenant_name: sub.tenant_name,
      primary_email: primaryEmail,
      owner_name: sub.user_name || users[0]?.name || null,
      plan_code: normalizeBillingPlanCode(sub.plan_code) ?? sub.plan_code ?? null,
      status: sub.subscription_status ?? (tenant?.is_active === false ? 'INACTIVE' : 'ACTIVE'),
      is_internal: internalIds.has(sub.tenant_id),
      origin: purchase ? 'v_ceo_subscribers + kiwify_purchases' : 'v_ceo_subscribers',
      last_activity_at: null,
      last_activity_source: 'nao monitorado',
      linked_purchase: purchase ? buildUsersTenantsPurchase(purchase) : null,
      divergence_label: divergence,
      divergence_code: sub.divergence?.code ?? (sub.paid_but_free ? 'paid_but_free' : sub.plan_mismatch ? 'plan_mismatch' : null),
      severity,
      severity_label: accountSeverityLabel(severity),
      users,
      audit_events: audit.slice(0, 5),
      marked_internal_at: audit.find(e => e.action_type === 'tenant_mark_internal')?.created_at ?? null,
      internal_reason: audit.find(e => e.action_type === 'tenant_mark_internal')?.description ?? null,
      tenant_created_at: sub.tenant_created_at ?? tenant?.created_at ?? null,
    });
  }

  for (const tenant of tenantsById.values()) {
    const tenantId = tenant.id as string | undefined;
    if (!tenantId || rowsByTenant.has(tenantId)) continue;
    const users = usersByTenant.get(tenantId) ?? [];
    const primary = users[0] ?? null;
    const purchase = purchaseByTenant.get(tenantId) || (primary?.email ? purchaseByEmail.get(lowerTrim(primary.email)) : null);
    const audit = auditByTenant.get(tenantId) ?? [];
    const isInternal = internalIds.has(tenantId) || tenant.is_internal === true;
    const plan = normalizeBillingPlanCode(tenant.plan_id) ?? (tenant.plan_id ? String(tenant.plan_id) : null);
    const isActive = tenant.is_active === null || tenant.is_active === undefined ? null : Boolean(tenant.is_active);
    const approvedPurchaseNoActivation = purchase?.status === 'APPROVED' && !purchase.activated_at;
    const divergence = approvedPurchaseNoActivation ? 'Compra aprovada sem ativacao visivel' : null;
    const severity: CeoUsersTenantsAccountRow['severity'] = approvedPurchaseNoActivation ? 'attention' : 'ok';

    addRow({
      tenant_id: tenantId,
      tenant_name: (tenant.name as string | null) ?? tenantId,
      primary_email: primary?.email ?? purchase?.email ?? null,
      owner_name: primary?.name ?? null,
      plan_code: plan ?? (purchase?.plan_code ? normalizeBillingPlanCode(purchase.plan_code) : null),
      status: isActive === false ? 'INACTIVE' : isActive === true ? 'ACTIVE' : 'N/D',
      is_internal: isInternal,
      origin: isInternal ? 'tenants.is_internal' : 'tenants',
      last_activity_at: null,
      last_activity_source: 'nao monitorado',
      linked_purchase: purchase ? buildUsersTenantsPurchase(purchase) : null,
      divergence_label: divergence,
      divergence_code: approvedPurchaseNoActivation ? 'approved_purchase_no_activation' : null,
      severity,
      severity_label: accountSeverityLabel(severity),
      users,
      audit_events: audit.slice(0, 5),
      marked_internal_at: audit.find(e => e.action_type === 'tenant_mark_internal')?.created_at ?? null,
      internal_reason: audit.find(e => e.action_type === 'tenant_mark_internal')?.description ?? null,
      tenant_created_at: (tenant.created_at as string | null) ?? null,
    });
  }

  const accounts = Array.from(rowsByTenant.values()).sort((a, b) => {
    const priority = { critical: 4, attention: 3, unmonitored: 2, ok: 1 };
    return priority[b.severity] - priority[a.severity] || a.tenant_name.localeCompare(b.tenant_name);
  });
  const internalAccounts = accounts.filter(row => row.is_internal);

  const totalTenants = tenantRows ? tenantRows.length : kpis?.total_tenants ?? null;
  const activeTenants = tenantRows ? tenantRows.filter(row => row.is_active !== false).length : null;
  const totalUsers = userRows ? userRows.length : null;
  const activeUsers = userRows ? userRows.filter(row => row.is_active !== false).length : null;
  const paidTenants = kpis
    ? kpis.active_subscribers
    : accounts.filter(row => row.plan_code && row.plan_code !== 'FREE' && row.status !== 'INACTIVE').length;
  const freeTenants = kpis ? kpis.free_count : accounts.filter(row => !row.plan_code || row.plan_code === 'FREE').length;
  // CEO-10C.1: com KPIs usa plan_mismatch_count (RPC); no fallback local soma plan_mismatch + paid_but_free.
  // Assimetria intencional ate existir paid_but_free_count separado na RPC.
  const planDivergences = kpis?.plan_mismatch_count ?? accounts.filter(row => row.divergence_code === 'plan_mismatch' || row.divergence_code === 'paid_but_free').length;
  const purchaseWithoutActivation = kpis?.pending_activation_count ?? (purchaseRows ? purchaseRows.filter(p => p.status === 'APPROVED' && !p.activated_at && !(p.tenant_id && internalIds.has(p.tenant_id))).length : null);

  const cards: CeoUsersTenantsCard[] = [
    accountCard('total_tenants', 'Total de tenants', totalTenants, totalTenants === null ? 'unmonitored' : 'ok', 'tenants cadastrados', 'tenants / ceo_get_kpis'),
    accountCard('active_tenants', 'Tenants ativos', activeTenants, activeTenants === null ? 'unmonitored' : 'ok', 'is_active != false', 'tenants'),
    accountCard('total_users', 'Usuarios totais', totalUsers, totalUsers === null ? 'unmonitored' : 'ok', 'usuarios cadastrados', 'users'),
    accountCard('active_users', 'Usuarios ativos', activeUsers, activeUsers === null ? 'unmonitored' : 'ok', 'is_active != false', 'users'),
    accountCard('internal_accounts', 'Contas internas', internalAccounts.length, 'ok', 'fora das metricas', 'tenants.is_internal'),
    accountCard('paid_tenants', 'Tenants pagos', paidTenants, paidTenants === null ? 'unmonitored' : 'ok', 'assinaturas ativas pagas', 'ceo_get_kpis / v_ceo_subscribers'),
    accountCard('free_tenants', 'Tenants FREE', freeTenants, freeTenants === null ? 'unmonitored' : 'ok', 'plano gratuito', 'ceo_get_kpis / v_ceo_subscribers'),
    accountCard('plan_divergences', 'Divergencias de plano', planDivergences, planDivergences === null ? 'unmonitored' : planDivergences > 0 ? 'critical' : 'ok', 'paid_but_free / plan_mismatch', 'v_ceo_subscribers'),
    accountCard('purchase_without_activation', 'Compra sem ativacao', purchaseWithoutActivation, purchaseWithoutActivation === null ? 'unmonitored' : purchaseWithoutActivation > 0 ? 'attention' : 'ok', 'compra aprovada pendente', 'kiwify_purchases / ceo_get_kpis'),
  ];

  const nextActions = [
    planDivergences && planDivergences > 0 ? 'Revisar tenants com paid_but_free ou plan_mismatch antes de qualquer ajuste manual.' : null,
    purchaseWithoutActivation && purchaseWithoutActivation > 0 ? 'Conferir compras aprovadas sem ativacao no Billing & Kiwify.' : null,
    internalAccounts.length > 0 ? 'Validar periodicamente se contas internas continuam fora das metricas pagas.' : null,
    sources.some(source => source.status === 'unavailable') ? 'Fontes indisponiveis foram marcadas como nao monitoradas; conferir permissoes/views no Supabase.' : null,
  ].filter(Boolean) as string[];

  if (nextActions.length === 0) nextActions.push('Manter rotina de auditoria de usuarios, tenants e contas internas.');

  return {
    generatedAt,
    cards,
    accounts,
    internalAccounts,
    nextActions,
    sources,
  };
}

function buildUsersTenantsPurchase(row: Partial<KiwifyPurchaseRow> & { id?: string | null }): CeoUsersTenantsPurchaseSummary {
  return {
    id: row.id ?? '',
    email: row.email ?? null,
    status: row.status ?? null,
    activation_status: row.activation_status ?? null,
    plan_code: normalizeBillingPlanCode(row.plan_code) ?? row.plan_code ?? null,
    product_key: row.product_key ?? null,
    provider_order_id: row.provider_order_id ?? null,
    paid_at: row.paid_at ?? null,
    activated_at: row.activated_at ?? null,
    tenant_id: row.tenant_id ?? null,
    created_at: row.created_at ?? null,
  };
}

function incidentStatusLabel(status: CeoIncidentStatus): string {
  if (status === 'open') return 'Aberto';
  if (status === 'resolved') return 'Resolvido';
  if (status === 'no_status') return 'Sem status';
  return 'Monitorado';
}

function incidentCard(
  key: string,
  title: string,
  value: number | string | null,
  status: CeoHealthCardStatus,
  subtext: string,
  source: string,
): CeoIncidentCard {
  return { key, title, value, status, subtext, source };
}

function addIncident(incidents: CeoIncidentRow[], incident: Omit<CeoIncidentRow, 'status_label'>): void {
  incidents.push({ ...incident, status_label: incidentStatusLabel(incident.status) });
}

function incidentSeverityRank(severity: CeoIncidentSeverity): number {
  return severity === 'critical' ? 4 : severity === 'high' ? 3 : severity === 'medium' ? 2 : 1;
}

/**
 * Central read-only de alertas e incidentes operacionais.
 * Nao corrige, nao reconcilia e nao executa mutation: apenas consolida fontes.
 */
export async function getCeoAlertsIncidentCenter(): Promise<CeoAlertsIncidentCenter> {
  const generatedAt = new Date().toISOString();
  const sources: CeoHealthSource[] = [];
  const incidents: CeoIncidentRow[] = [];
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  let aiRows: any[] | null = null;
  let billingRows: any[] | null = null;
  let purchaseRows: KiwifyPurchaseRow[] | null = null;
  let creditFailureRows: any[] | null = null;
  let creditReservationRows: any[] | null = null;
  let creditIntegrityRows: any[] | null = null;
  let auditRows: AdminAuditEntry[] | null = null;
  let kpis: CeoKpis | null = null;
  let creditDashboard: CeoCreditDashboard | null = null;
  // CEO-10C.2: tenants internos carregados para evitar incidentes financeiros falsos
  let internalIncidentTenants: InactiveTenantRow[] | null = null;

  try {
    const { data, error } = await supabase
      .from('ai_requests')
      .select('id,tenant_id,user_id,request_type,model,status,credits_consumed,latency_ms,created_at,completed_at')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(250);
    if (error) throw error;
    aiRows = data ?? [];
    sources.push(sourceAvailable('ai_requests', 'ai_requests ultimos 7 dias'));
  } catch (error) {
    sources.push(sourceUnavailable('ai_requests', 'ai_requests ultimos 7 dias', error));
  }

  try {
    const { data, error } = await supabase
      .from('billing_events')
      .select('id,provider,event_type,provider_event_id,provider_payment_id,provider_subscription_id,processed,processed_at,success,error_message,created_at')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(250);
    if (error) throw error;
    billingRows = data ?? [];
    sources.push(sourceAvailable('billing_events', 'billing_events ultimos 7 dias'));
  } catch (error) {
    sources.push(sourceUnavailable('billing_events', 'billing_events ultimos 7 dias', error));
  }

  try {
    purchaseRows = await getKiwifyPurchases();
    sources.push(sourceAvailable('kiwify_purchases', 'kiwify_purchases'));
  } catch (error) {
    sources.push(sourceUnavailable('kiwify_purchases', 'kiwify_purchases', error));
  }

  try {
    const { data, error } = await supabase
      .from('v_credit_failures')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    creditFailureRows = data ?? [];
    sources.push(sourceAvailable('v_credit_failures', 'v_credit_failures'));
  } catch (error) {
    sources.push(sourceUnavailable('v_credit_failures', 'v_credit_failures', error));
  }

  try {
    const { data, error } = await supabase
      .from('v_credit_reservations')
      .select('*')
      .eq('status', 'reserved')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    creditReservationRows = data ?? [];
    sources.push(sourceAvailable('v_credit_reservations', 'v_credit_reservations'));
  } catch (error) {
    sources.push(sourceUnavailable('v_credit_reservations', 'v_credit_reservations', error));
  }

  try {
    const { data, error } = await supabase
      .from('v_credit_integrity')
      .select('*')
      .limit(400);
    if (error) throw error;
    creditIntegrityRows = data ?? [];
    sources.push(sourceAvailable('v_credit_integrity', 'v_credit_integrity'));
  } catch (error) {
    sources.push(sourceUnavailable('v_credit_integrity', 'v_credit_integrity', error));
  }

  try {
    auditRows = await getAdminAuditLog(150);
    sources.push(sourceAvailable('admin_audit_log', 'admin_audit_log'));
  } catch (error) {
    sources.push(sourceUnavailable('admin_audit_log', 'admin_audit_log', error));
  }

  try {
    kpis = await getCeoKpis();
    sources.push(sourceAvailable('ceo_get_kpis', 'ceo_get_kpis'));
  } catch (error) {
    sources.push(sourceUnavailable('ceo_get_kpis', 'ceo_get_kpis', error));
  }

  try {
    creditDashboard = await getCeoCreditDashboard();
    sources.push(sourceAvailable('v_ceo_credit_dashboard', 'v_ceo_credit_dashboard'));
  } catch (error) {
    sources.push(sourceUnavailable('v_ceo_credit_dashboard', 'v_ceo_credit_dashboard', error));
  }

  try {
    internalIncidentTenants = await getCeoInternalTenants();
    // nao expoe como source visivel — e dado auxiliar interno, nao monitorado como fonte de incidentes
  } catch (_) {
    internalIncidentTenants = null;
  }

  sources.push({
    key: 'documents_operational_incidents',
    label: 'Documentos',
    status: 'unavailable',
    detail: 'Sem fonte operacional clara de incidentes de documentos nesta sprint.',
  });
  sources.push({
    key: 'rls_policies',
    label: 'Seguranca/RLS',
    status: 'unavailable',
    detail: 'Sem view/RPC especifica de auditoria de RLS/policies disponivel.',
  });

  for (const row of aiRows ?? []) {
    const status = String(row.status ?? '').toLowerCase();
    const isFailed = status === 'failed' || status === 'error';
    const isStuck = status === 'pending' && row.created_at && new Date(row.created_at).getTime() < now - 60 * 60 * 1000;
    if (!isFailed && !isStuck) continue;
    addIncident(incidents, {
      id: `ai-${row.id ?? row.created_at}`,
      severity: isFailed ? 'high' : 'medium',
      category: 'ai',
      title: isFailed ? 'Falha recente de IA' : 'Requisicao de IA pendente ha mais de 1h',
      description: `${row.request_type ?? 'request'} em ${row.model ?? 'modelo N/D'} retornou status ${row.status ?? 'N/D'}.`,
      source: 'ai_requests',
      tenant_id: row.tenant_id ?? null,
      email: null,
      occurred_at: row.created_at ?? null,
      recommended_action: 'Verificar ai_requests e logs da camada de IA antes de repetir a operacao.',
      status: 'open',
      related_tab: 'diagnostics',
      details: row,
    });
  }

  for (const row of billingRows ?? []) {
    const failed = row.success === false || Boolean(row.error_message);
    const unprocessed = row.processed === false;
    if (!failed && !unprocessed) continue;
    addIncident(incidents, {
      id: `billing-${row.id ?? row.provider_event_id ?? row.created_at}`,
      severity: failed ? 'high' : 'medium',
      category: 'billing',
      title: failed ? 'Falha billing/webhook registrada' : 'Evento billing/webhook nao processado',
      description: `${row.provider ?? 'gateway'} / ${row.event_type ?? 'evento'} ${row.error_message ? `- ${row.error_message}` : 'aguarda processamento.'}`,
      source: 'billing_events',
      tenant_id: null,
      email: null,
      occurred_at: row.created_at ?? null,
      recommended_action: 'Abrir Billing & Kiwify e conferir evento antes de qualquer reconciliacao manual.',
      status: failed || unprocessed ? 'open' : 'monitored',
      related_tab: 'billing_kiwify',
      details: row,
    });
  }

  // CEO-10C.2: set de ids internos para rebaixar incidentes de tenants administrativos
  const internalIncidentIds = new Set((internalIncidentTenants ?? []).map(t => t.id));

  for (const row of purchaseRows ?? []) {
    const approved = row.status === 'APPROVED';
    if (approved && !row.tenant_id && !row.activated_at) {
      addIncident(incidents, {
        id: `kiwify-no-tenant-${row.id}`,
        severity: 'critical',
        category: 'billing',
        title: 'Compra aprovada sem tenant',
        description: `Compra ${row.provider_order_id ?? row.id} aprovada para ${row.email ?? 'email N/D'} ainda nao tem tenant vinculado.`,
        source: 'kiwify_purchases',
        tenant_id: null,
        email: row.email ?? null,
        occurred_at: row.paid_at ?? row.created_at ?? null,
        recommended_action: 'Abrir Billing & Kiwify e orientar criacao de conta com o mesmo e-mail.',
        status: 'open',
        related_tab: 'billing_kiwify',
        details: row,
      });
    } else if (approved && row.tenant_id && !row.activated_at) {
      const isInternal = internalIncidentIds.has(row.tenant_id);
      addIncident(incidents, {
        id: `kiwify-not-activated-${row.id}`,
        severity: isInternal ? 'low' : 'high',
        category: 'billing',
        title: isInternal ? 'Compra sem ativacao (tenant interno)' : 'Compra aprovada sem ativacao visivel',
        description: isInternal
          ? `Tenant interno ${row.tenant_id} tem compra aprovada sem activated_at — visibilidade administrativa, nao incidente comercial.`
          : `Tenant ${row.tenant_id} tem compra aprovada, mas activated_at esta vazio.`,
        source: 'kiwify_purchases',
        tenant_id: row.tenant_id,
        email: row.email ?? null,
        occurred_at: row.paid_at ?? row.created_at ?? null,
        recommended_action: isInternal
          ? 'Verificar se o tenant interno precisa de ativacao manual ou se pode permanecer sem activated_at.'
          : 'Conferir assinatura/tenant em Billing & Kiwify antes de acao manual.',
        status: isInternal ? 'monitored' : 'open',
        related_tab: 'billing_kiwify',
        details: row,
      });
    } else if (approved && row.product_key === 'UNKNOWN') {
      addIncident(incidents, {
        id: `kiwify-unknown-${row.id}`,
        severity: 'high',
        category: 'billing',
        title: 'Produto Kiwify sem mapeamento',
        description: `Compra aprovada usa product_key UNKNOWN para ${row.email ?? 'email N/D'}.`,
        source: 'kiwify_purchases',
        tenant_id: row.tenant_id ?? null,
        email: row.email ?? null,
        occurred_at: row.paid_at ?? row.created_at ?? null,
        recommended_action: 'Abrir Billing & Kiwify ou Planos & Custos e revisar o mapeamento do produto.',
        status: 'open',
        related_tab: 'billing_kiwify',
        details: row,
      });
    }
  }

  for (const row of creditFailureRows ?? []) {
    addIncident(incidents, {
      id: `credit-failure-${row.id ?? row.operation_id}`,
      severity: 'high',
      category: 'credits',
      title: 'Falha de credito registrada',
      description: `${row.operation_kind ?? 'operacao'} falhou: ${row.error_message ?? row.reason ?? row.description ?? 'motivo nao informado'}.`,
      source: 'v_credit_failures',
      tenant_id: row.tenant_id ?? null,
      email: row.user_email ?? null,
      occurred_at: row.created_at ?? null,
      recommended_action: 'Abrir Creditos e conferir wallet/ledger antes de qualquer ajuste manual.',
      status: 'open',
      related_tab: 'credits',
      details: row,
    });
  }

  for (const row of creditReservationRows ?? []) {
    const createdAt = row.created_at ? new Date(row.created_at).getTime() : now;
    const ageMinutes = Math.max(0, Math.round((now - createdAt) / 60000));
    const stale = ageMinutes >= 60;
    addIncident(incidents, {
      id: `credit-reservation-${row.id}`,
      severity: stale ? 'high' : 'medium',
      category: 'credits',
      title: stale ? 'Reserva de credito antiga/travada' : 'Reserva de credito aberta',
      description: `${row.amount ?? 'N/D'} creditos reservados ha ${ageMinutes} min para ${row.user_email ?? row.tenant_name ?? row.tenant_id ?? 'tenant N/D'}.`,
      source: 'v_credit_reservations',
      tenant_id: row.tenant_id ?? null,
      email: row.user_email ?? null,
      occurred_at: row.created_at ?? null,
      recommended_action: 'Abrir Creditos e verificar se a operacao foi concluida ou liberada corretamente.',
      status: stale ? 'open' : 'monitored',
      related_tab: 'credits',
      details: { ...row, age_minutes: ageMinutes },
    });
  }

  for (const row of creditIntegrityRows ?? []) {
    if (row.integrity_status === 'ok') continue;
    addIncident(incidents, {
      id: `credit-integrity-${row.tenant_id}`,
      severity: 'critical',
      category: 'credits',
      title: 'Divergencia de integridade de creditos',
      description: `${row.integrity_status ?? 'integridade N/D'}: wallet ${row.wallet_balance ?? 'N/D'} vs ledger ${row.ledger_balance ?? 'N/D'}.`,
      source: 'v_credit_integrity',
      tenant_id: row.tenant_id ?? null,
      email: null,
      occurred_at: null,
      recommended_action: 'Abrir Creditos e auditar wallet, ledger e reservas sem alterar saldo automaticamente.',
      status: 'open',
      related_tab: 'credits',
      details: row,
    });
  }

  if (kpis) {
    const kpiIncidents: Array<[string, number, CeoIncidentSeverity, string, string, string]> = [
      ['plan_mismatch', kpis.plan_mismatch_count, 'critical', 'Divergencias de plano', 'Tenants com plan_mismatch detectado nos KPIs. Casos paid_but_free podem aparecer separadamente em Billing/Kiwify conforme fonte disponivel.', 'accounts_admin'],
      ['orphan_purchase', kpis.orphan_purchase_count, 'critical', 'Compras pagas sem conta', 'Compras aprovadas sem tenant vinculado.', 'billing_kiwify'],
      ['financial_inconsistency', kpis.financial_inconsistency_count, 'high', 'Inconsistencias financeiras', 'KPIs indicam divergencia financeira operacional.', 'diagnostics'],
      ['wallet_divergence', creditDashboard?.wallet_ledger_divergences ?? kpis.wallet_divergence_count, 'high', 'Divergencias de wallet', creditDashboard ? 'Tenants com wallet divergente do ledger (v_ceo_credit_dashboard).' : 'KPIs indicam wallet divergente (fallback: ceo_get_kpis).', 'credits'],
    ];
    for (const [key, count, severity, title, description, tab] of kpiIncidents) {
      if (count <= 0) continue;
      addIncident(incidents, {
        id: `kpi-${key}`,
        severity,
        category: key.includes('wallet') ? 'credits' : key.includes('purchase') || key.includes('financial') ? 'billing' : 'users',
        title,
        description: `${description} Total: ${count}.`,
        source: 'ceo_get_kpis',
        tenant_id: null,
        email: null,
        occurred_at: generatedAt,
        recommended_action: 'Abrir a aba relacionada e investigar os registros detalhados.',
        status: 'monitored',
        related_tab: tab,
        details: { key, count },
      });
    }
  }

  for (const entry of auditRows ?? []) {
    const action = String(entry.action_type ?? '').toLowerCase();
    const isSensitive = /delete|remove|suspend|reactivate|plan|credit|internal|password|coupon|checkout/.test(action);
    if (!isSensitive) continue;
    addIncident(incidents, {
      id: `audit-${entry.id}`,
      severity: action.includes('delete') || action.includes('credit') || action.includes('plan') ? 'medium' : 'low',
      category: action.includes('credit') ? 'credits' : action.includes('plan') || action.includes('internal') || action.includes('password') ? 'users' : 'system',
      title: 'Acao administrativa sensivel registrada',
      description: `${entry.action_type} em ${entry.target_name ?? entry.target_id ?? entry.target_type ?? 'alvo N/D'}.`,
      source: 'admin_audit_log',
      tenant_id: entry.target_type === 'tenant' ? entry.target_id : null,
      email: entry.admin_email ?? null,
      occurred_at: entry.created_at,
      recommended_action: 'Conferir auditoria administrativa se a acao nao for esperada.',
      status: 'monitored',
      related_tab: 'logs',
      details: entry,
    });
  }

  for (const source of sources.filter(source => source.status === 'unavailable')) {
    addIncident(incidents, {
      id: `source-${source.key}`,
      severity: 'low', // fontes nao monitoradas sao informativas — sem dados reais para gerar incidente
      category: source.key === 'rls_policies' ? 'security' : source.key.includes('documents') ? 'documents' : 'system',
      title: 'Fonte nao monitorada',
      description: `${source.label}: ${source.detail ?? 'Fonte nao disponivel'}`,
      source: source.key,
      tenant_id: null,
      email: null,
      occurred_at: generatedAt,
      recommended_action: source.key === 'rls_policies'
        ? 'Criar view/RPC de auditoria RLS em sprint futura, se necessario.'
        : 'Validar se a fonte existe e se o CEO tem permissao de leitura.',
      status: 'no_status',
      related_tab: source.key === 'rls_policies' ? 'diagnostics' : null,
      details: source,
    });
  }

  incidents.sort((a, b) => {
    const dateA = a.occurred_at ? new Date(a.occurred_at).getTime() : 0;
    const dateB = b.occurred_at ? new Date(b.occurred_at).getTime() : 0;
    return incidentSeverityRank(b.severity) - incidentSeverityRank(a.severity) || dateB - dateA;
  });

  const critical = incidents.filter(item => item.severity === 'critical').length;
  const high = incidents.filter(item => item.severity === 'high').length;
  const medium = incidents.filter(item => item.severity === 'medium').length;
  const aiFailures = incidents.filter(item => item.category === 'ai' && item.status === 'open').length;
  const billingFailures = incidents.filter(item => item.category === 'billing' && item.status === 'open').length;
  const creditFailures = incidents.filter(item => item.category === 'credits' && item.title.toLowerCase().includes('falha')).length;
  const staleReservations = incidents.filter(item => item.category === 'credits' && item.title.toLowerCase().includes('antiga')).length;
  const unavailable = sources.filter(source => source.status === 'unavailable').length;

  const cards: CeoIncidentCard[] = [
    incidentCard('critical', 'Incidentes criticos', critical, critical > 0 ? 'critical' : 'ok', 'severidade critica', 'agregador CEO'),
    incidentCard('high', 'Incidentes altos', high, high > 0 ? 'attention' : 'ok', 'severidade alta', 'agregador CEO'),
    incidentCard('medium', 'Incidentes medios', medium, medium > 0 ? 'attention' : 'ok', 'severidade media', 'agregador CEO'),
    incidentCard('ai_failures', 'Falhas IA recentes', aiFailures, aiRows === null ? 'unmonitored' : aiFailures > 0 ? 'attention' : 'ok', 'ultimos 7 dias', 'ai_requests'),
    incidentCard('billing_failures', 'Falhas billing/webhook', billingFailures, billingRows === null ? 'unmonitored' : billingFailures > 0 ? 'attention' : 'ok', 'eventos abertos', 'billing_events + kiwify_purchases'),
    incidentCard('credit_failures', 'Falhas de credito', creditFailures, creditFailureRows === null ? 'unmonitored' : creditFailures > 0 ? 'attention' : 'ok', 'v_credit_failures', 'v_credit_failures'),
    incidentCard('stale_reservations', 'Reservas antigas/travadas', staleReservations, creditReservationRows === null ? 'unmonitored' : staleReservations > 0 ? 'attention' : 'ok', 'reservas >= 60 min', 'v_credit_reservations'),
    incidentCard('unavailable_sources', 'Fontes indisponiveis', unavailable, unavailable > 0 ? 'attention' : 'ok', 'observabilidade incompleta', 'sources'),
  ];

  const nextActions = [
    critical > 0 ? 'Priorizar incidentes criticos antes de qualquer rotina operacional.' : null,
    billingFailures > 0 ? 'Abrir Billing & Kiwify para compras/eventos sem processamento ou ativacao.' : null,
    creditFailures > 0 || staleReservations > 0 ? 'Abrir Creditos para auditar falhas, reservas e integridade sem alterar saldo automaticamente.' : null,
    aiFailures > 0 ? 'Conferir ai_requests e logs antes de reexecutar operacoes de IA.' : null,
    unavailable > 0 ? 'Tratar fontes indisponiveis como lacunas de observabilidade, nao como numeros reais.' : null,
  ].filter(Boolean) as string[];

  if (nextActions.length === 0) nextActions.push('Manter monitoramento e revisar incidentes apos picos de uso ou campanhas.');

  return {
    generatedAt,
    cards,
    incidents,
    nextActions,
    sources,
  };
}

// Subscribers

export interface SubscriberIntegrityFlag {
  kind: string;
  code: string;
  group: string;
  label: string;
  severity: 'critical' | 'warn' | 'info';
  color: string;
}

export interface SubscriberDivergence {
  kind: string;
  code: string;
  label: string;
  severity: 'critical' | 'warn' | 'info';
}

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
  provider_sub_id?: string | null;
  purchase_id?: string | null;
  purchase_status?: string | null;
  purchase_email?: string | null;
  purchase_plan_code?: string | null;
  purchase_billing_cycle?: 'monthly' | 'annual' | null;
  purchase_product_key?: string | null;
  purchase_order_id?: string | null;
  purchase_price_brl?: number | null;
  purchase_paid_at?: string | null;
  purchase_activated_at?: string | null;
  purchase_activation_status?: string | null;
  owner_missing?: boolean;
  subscription_missing?: boolean;
  wallet_mismatch?: boolean;
  subscription_mismatch?: boolean;
  plan_mismatch?: boolean;
  inactive_subscriber?: boolean;
  financial_inconsistency?: boolean;
  paid_but_free?: boolean;
  finding_count?: number;
  critical_finding_count?: number;
  warn_finding_count?: number;
  has_owner_issue?: boolean;
  has_wallet_issue?: boolean;
  has_subscription_issue?: boolean;
  has_plan_issue?: boolean;
  has_financial_issue?: boolean;
  has_any_finding?: boolean;
  health_severity?: 'critical' | 'warn' | 'ok';
  health_priority?: number;
  integrity_flags?: SubscriberIntegrityFlag[];
  divergence?: SubscriberDivergence | null;
  user_phone?: string | null;
  user_cpf?: string | null;
}

export interface CeoSubscriberQueryOptions {
  planCode?: string;
  cycle?: string;
  status?: string;
  search?: string;
  flagLowCredits?: boolean;
  flagExpiring?: boolean;
  onlyFindings?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CeoSubscriberPage {
  rows: CeoSubscriber[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SubscriberContactInfo {
  email: string;
  phone: string | null;
  cpf: string | null;
}

/**
 * Carrega phone/cpf de todos os usuarios da tabela users.
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
  for (const row of data ?? []) {
    if (row.email) {
      map.set(row.email as string, {
        email: row.email as string,
        phone: (row.phone as string | null) ?? null,
        cpf: (row.cpf as string | null) ?? null,
      });
    }
  }
  return map;
}

/**
 * Atualiza phone/cpf de uma usuaria via RPC SECURITY DEFINER.
 * Registra auditoria automaticamente no backend.
 */
export async function adminUpdateUserContact(
  targetEmail: string,
  phone: string | null,
  cpf: string | null,
  adminUser: AdminUser,
): Promise<void> {
  const { data, error } = await supabase.rpc('admin_update_user_contact', {
    p_target_email: targetEmail,
    p_phone: phone || null,
    p_cpf: cpf || null,
  });

  if (error) throw error;

  const result = data as { success: boolean; error?: string } | null;
  if (result && !result.success) {
    throw new Error(result.error ?? 'Erro ao atualizar contato.');
  }

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

function normalizeSubscriberRow(row: any): CeoSubscriber {
  return {
    ...(row as CeoSubscriber),
    credits_remaining: Number(row.credits_remaining ?? 0),
    credits_limit: Number(row.credits_limit ?? 0),
    credits_used_cycle: Number(row.credits_used_cycle ?? 0),
    students_active: Number(row.students_active ?? 0),
    student_limit: Number(row.student_limit ?? 0),
    finding_count: Number(row.finding_count ?? 0),
    critical_finding_count: Number(row.critical_finding_count ?? 0),
    warn_finding_count: Number(row.warn_finding_count ?? 0),
    health_priority: Number(row.health_priority ?? 0),
    purchase_price_brl: row.purchase_price_brl !== null && row.purchase_price_brl !== undefined
      ? Number(row.purchase_price_brl)
      : null,
    integrity_flags: Array.isArray(row.integrity_flags) ? row.integrity_flags : [],
    divergence: row.divergence ?? null,
  };
}

export async function getCeoSubscribersPage(opts?: CeoSubscriberQueryOptions): Promise<CeoSubscriberPage> {
  const page = Math.max(1, opts?.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, opts?.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from('v_ceo_subscribers')
    .select('*', { count: 'exact' });

  if (opts?.planCode && opts.planCode !== 'all') q = q.eq('plan_code', opts.planCode);
  if (opts?.cycle && opts.cycle !== 'all') q = q.eq('billing_cycle', opts.cycle);
  if (opts?.status && opts.status !== 'all') q = q.eq('subscription_status', opts.status);
  if (opts?.flagLowCredits) q = q.eq('flag_low_credits', true);
  if (opts?.flagExpiring) q = q.eq('flag_expiring_7d', true);
  if (opts?.onlyFindings) q = q.eq('has_any_finding', true);
  if (opts?.search) {
    const s = `%${opts.search}%`;
    q = q.or(`tenant_name.ilike.${s},user_email.ilike.${s},user_name.ilike.${s}`);
  }

  q = q
    .order('health_priority', { ascending: false })
    .order('flag_expiring_7d', { ascending: false })
    .order('tenant_name', { ascending: true })
    .range(from, to);

  const { data, error, count } = await q;
  if (error) throw error;

  return {
    rows: (data ?? []).map(normalizeSubscriberRow),
    total: Number(count ?? 0),
    page,
    pageSize,
  };
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
  const page = await getCeoSubscribersPage({
    ...opts,
    page: 1,
    pageSize: opts?.limit ?? 500,
  });
  return page.rows;
}

// Tenants inativos (is_active = false)

export interface InactiveTenantRow {
  id: string;
  name: string;
  created_at: string;
}

/**
 * Retorna tenants com is_active = false usando a view analitica.
 * Contas internas ja sao excluidas no SQL.
 */
export async function getCeoInactiveTenants(): Promise<InactiveTenantRow[]> {
  const { data, error } = await supabase
    .from('v_ceo_subscriber_health')
    .select('tenant_id, tenant_name, tenant_created_at')
    .eq('inactive_subscriber', true)
    .order('tenant_created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.warn('[CEO] getCeoInactiveTenants error:', error.message);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.tenant_id as string,
    name: row.tenant_name as string,
    created_at: row.tenant_created_at as string,
  }));
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

// Gerenciamento de flag is_internal

/**
 * Marca ou desmarca um tenant como interno.
 * Contas internas sao excluidas de todas as metricas e listas do CEO.
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
    'tenant',
    tenantId,
    tenantId,
    undefined,
    { is_internal: isInternal },
    `Tenant ${isInternal ? 'marcado' : 'desmarcado'} como interno`,
  );
}

// Kiwify Products

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
  await logAction(
    adminUser,
    'checkout_change',
    'product',
    product.kiwify_product_id,
    product.product_name ?? product.kiwify_product_id,
    undefined,
    { checkout_url: product.checkout_url, price_brl: product.price_brl },
    `Produto atualizado: ${product.product_name}`,
  );
}

// Coupons

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
  await logAction(
    adminUser,
    isNew ? 'coupon_create' : 'coupon_edit',
    'coupon',
    coupon.code,
    coupon.code,
    undefined,
    { discount_value: coupon.discount_value, plan_code: coupon.plan_code, is_active: coupon.is_active },
    `Cupom ${isNew ? 'criado' : 'editado'}: ${coupon.code}`,
  );
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
  await logAction(
    adminUser,
    'coupon_edit',
    'coupon',
    code,
    code,
    { is_active: !active },
    { is_active: active },
    `Cupom ${active ? 'ativado' : 'desativado'}: ${code}`,
  );
}

export async function deleteCoupon(couponId: string, code: string, adminUser: AdminUser): Promise<void> {
  const { error } = await supabase
    .from('ceo_coupons')
    .delete()
    .eq('id', couponId);
  if (error) throw error;
  await logAction(
    adminUser,
    'coupon_edit',
    'coupon',
    code,
    code,
    undefined,
    undefined,
    `Cupom removido: ${code}`,
  );
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
  const waText = `Ola! Use o cupom *${coupon.code}* para obter ${discount} no ${planLabel} do IncluiAI.\n\nAcesse: ${link}`;
  return { link, waText, waUrl: `https://wa.me/?text=${encodeURIComponent(waText)}` };
}

// Kiwify Purchases (auditoria CEO)

export interface KiwifyPurchaseRow {
  id: string;
  email: string;
  product_key: string | null;
  plan_code: string | null;
  credits_amount: number;
  provider_order_id: string | null;
  status: 'APPROVED' | 'PENDING' | 'CANCELED';
  activation_status: 'PENDING_ACCOUNT' | 'PENDING_ACTIVATION' | 'ACTIVATED' | null;
  paid_at: string | null;
  activated_at: string | null;
  tenant_id: string | null;
  created_at: string;
}

/**
 * Carrega todos os registros de kiwify_purchases para auditoria no painel CEO.
 * Ordenado por data DESC e inclui compras sem tenant vinculado.
 */
export async function getKiwifyPurchases(): Promise<KiwifyPurchaseRow[]> {
  const { data, error } = await supabase
    .from('kiwify_purchases')
    .select('id,email,product_key,plan_code,credits_amount,provider_order_id,status,activation_status,paid_at,activated_at,tenant_id,created_at')
    .order('created_at', { ascending: false })
    .limit(800);
  if (error) throw error;
  return (data ?? []) as KiwifyPurchaseRow[];
}

export interface KiwifyPurchaseAlerts {
  noAccount: KiwifyPurchaseRow[];
  notActivated: KiwifyPurchaseRow[];
  unknownProduct: KiwifyPurchaseRow[];
}

export function computeKiwifyAlerts(purchases: KiwifyPurchaseRow[]): KiwifyPurchaseAlerts {
  const approved = purchases.filter(p => p.status === 'APPROVED');
  return {
    noAccount: approved.filter(p => !p.tenant_id && !p.activated_at),
    notActivated: approved.filter(p => p.tenant_id && !p.activated_at),
    unknownProduct: approved.filter(p => p.product_key === 'UNKNOWN'),
  };
}

/**
 * Gera texto de instrucao para enviar ao comprador que ainda nao criou conta.
 */
export function buildPendingAccountInstructions(purchase: KiwifyPurchaseRow, appUrl = 'https://app.incluiai.com'): {
  whatsappUrl: string;
  text: string;
  signupUrl: string;
} {
  const planLabel = purchase.plan_code === 'MASTER' ? 'Master' : purchase.plan_code ?? 'pago';
  const signupUrl = `${appUrl}/cadastro`;
  const text =
    `Ola! Identificamos sua compra do Plano ${planLabel} no IncluiAI.\n\n` +
    `Para ativar seu acesso, basta criar sua conta usando o mesmo e-mail da compra (${purchase.email}):\n\n` +
    `${signupUrl}\n\n` +
    `Apos criar a conta, o plano sera ativado automaticamente - sem precisar entrar em contato com o suporte.\n\n` +
    `Qualquer duvida, estamos aqui!`;
  return {
    text,
    signupUrl,
    whatsappUrl: `https://wa.me/?text=${encodeURIComponent(text)}`,
  };
}

export interface ReconcileResult {
  purchase_email: string;
  purchase_plan: string | null;
  found_tenant_id: string | null;
  result_action: string;
}

export async function reconcilePendingPurchases(
  adminUser?: AdminUser | null,
  reason?: string,
  source?: string,
): Promise<ReconcileResult[]> {
  const { data, error } = await supabase.rpc('reconcile_pending_activations');
  if (error) throw error;
  const results = (data ?? []) as ReconcileResult[];

  // CEO-11A: log administrativo — acao sensivia que antes nao tinha rastro algum.
  const byAction: Record<string, number> = {};
  for (const r of results) byAction[r.result_action] = (byAction[r.result_action] ?? 0) + 1;
  const effectiveAdmin: AdminUser = adminUser ?? { id: 'system', name: 'sistema', email: '', role: 'operacional', active: true, createdAt: new Date().toISOString() };
  await logAction(
    effectiveAdmin,
    'reconcile_pending_activations',
    'purchase',
    undefined,
    undefined,
    undefined,
    { total: results.length, source: source ?? 'manual', reason: reason ?? null, by_action: byAction },
    `Reconciliacao de ativacoes pendentes — ${results.length} registro(s)${reason ? ` — motivo: ${reason}` : ''}`,
  );

  return results;
}

// Admin Audit Log

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
      p_admin_name: adminUser.name,
      p_admin_email: adminUser.email ?? null,
      p_admin_role: adminUser.role ?? null,
      p_action_type: actionType,
      p_target_type: targetType ?? null,
      p_target_id: targetId ?? null,
      p_target_name: targetName ?? null,
      p_before_value: beforeValue ? JSON.stringify(beforeValue) : null,
      p_after_value: afterValue ? JSON.stringify(afterValue) : null,
      p_description: description ?? null,
    });
  } catch {
    // silencioso - auditoria nunca bloqueia operacao principal
  }
}
