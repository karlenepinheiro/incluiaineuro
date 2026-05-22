import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, User as UserIcon, DollarSign, TrendingUp, AlertCircle, Brain, Zap,
  PieChart, Activity, ArrowUpRight, ArrowDownRight, PlusCircle,
  Shield, CreditCard, FileText, Globe, CheckCircle, XCircle,
  Save, Search, Edit3, Trash2, Lock, RefreshCw,
  Package, TestTube, ChevronDown, ChevronUp, Eye, EyeOff,
  AlertTriangle, RotateCcw, Gift, Layers, Sun, Moon, LogOut,
  Tag, Link, Copy, Share2, ExternalLink, ToggleLeft, ToggleRight, Clock,
} from 'lucide-react';
import {
  AdminRole, AdminUser, AdminLog, SiteConfig, PlanTier,
  Subscriber, Plan, LandingSection, SubscriptionStatus,
  User, UserActivityLog
} from '../types';
import { PasswordResetModal } from '../components/ceo/PasswordResetModal';
import { BillingHealthCard } from '../components/ceo/BillingHealthCard';
import { KiwifyStatusBanner } from '../components/ceo/KiwifyStatusBanner';
import { PendingPurchasesDrawer } from '../components/ceo/PendingPurchasesDrawer';
import { SubscriberRowCard } from '../components/ceo/SubscriberRowCard';
import { supabase, DEMO_MODE } from '../services/supabase';
import { AdminService } from '../services/adminService';
import { LandingService } from '../services/landingService';
import { SubscriptionService } from '../services/billingService';
import { SubscriptionStatusBadge } from '../components/SubscriptionStatusBadge';
import {
  getCeoKpis, getCeoCreditDashboard, getCeoSubscribersPage, getKiwifyProducts, upsertKiwifyProduct,
  getCoupons, upsertCoupon, toggleCoupon, deleteCoupon, buildCouponShareLink,
  getAdminAuditLog, logAction, getKiwifyPurchases, getCeoInactiveTenants,
  setTenantInternal, reconcilePendingPurchases, buildPendingAccountInstructions,
  getCeoSubscribersContacts, adminUpdateUserContact, getCeoInternalTenants,
  getCeoHealthDiagnostics, getCeoCreditCommandCenter, getCeoPricingAiAdmin, getCeoBillingKiwifyReconciliation, getCeoUsersTenantsAdmin, getCeoAlertsIncidentCenter, computeKiwifyAlerts,
  type CeoKpis, type CeoCreditDashboard, type CeoSubscriber, type CeoSubscriberPage, type KiwifyProduct, type CeoCoupon, type AdminAuditEntry,
  type KiwifyPurchaseRow, type InactiveTenantRow, type ReconcileResult, type CeoHealthDiagnostics, type CeoHealthAlert, type CeoCreditCommandCenter,
  type CeoCreditWalletRow, type CeoPricingAiAdmin, type CeoPricingKiwifyProductRow, type CeoPricingCouponRow,
  type CeoBillingKiwifyReconciliation, type CeoBillingKiwifyPurchaseRow, type CeoUsersTenantsAdmin, type CeoUsersTenantsAccountRow,
  type CeoAlertsIncidentCenter, type CeoIncidentRow,
} from '../services/ceoService';

// ============================================================================
// TYPES
// ============================================================================

type Tab = 'overview' | 'diagnostics' | 'incident_center' | 'pricing_ai' | 'billing_kiwify' | 'accounts_admin' | 'plans' | 'subscribers' | 'monitoring' | 'credits' | 'landing' | 'kiwify' | 'coupons' | 'test_accounts' | 'admins' | 'user_logs' | 'logs';


// ============================================================================
// DARK MODE CSS (injetado via <style> quando darkMode=true)
// ============================================================================

const DARK_CSS = `
  .ceo-panel[data-dark="true"] { background: #0F172A !important; color: #F1F5F9 !important; }
  .ceo-panel[data-dark="true"] aside { background: #1E293B !important; border-color: #334155 !important; }
  .ceo-panel[data-dark="true"] main  { background: #0F172A !important; }
  .ceo-panel[data-dark="true"] .bg-white { background-color: #1E293B !important; }
  .ceo-panel[data-dark="true"] .bg-gray-50 { background-color: #0F172A !important; }
  .ceo-panel[data-dark="true"] .bg-gray-100 { background-color: #334155 !important; }
  .ceo-panel[data-dark="true"] .text-gray-900 { color: #F1F5F9 !important; }
  .ceo-panel[data-dark="true"] .text-gray-800 { color: #E2E8F0 !important; }
  .ceo-panel[data-dark="true"] .text-gray-700 { color: #CBD5E1 !important; }
  .ceo-panel[data-dark="true"] .text-gray-600 { color: #94A3B8 !important; }
  .ceo-panel[data-dark="true"] .text-gray-500 { color: #64748B !important; }
  .ceo-panel[data-dark="true"] .text-gray-400 { color: #475569 !important; }
  .ceo-panel[data-dark="true"] .border-gray-200 { border-color: #334155 !important; }
  .ceo-panel[data-dark="true"] .border-gray-100 { border-color: #1E293B !important; }
  .ceo-panel[data-dark="true"] .divide-gray-100 > * { border-color: #1E293B !important; }
  .ceo-panel[data-dark="true"] .shadow-sm { box-shadow: 0 1px 3px rgba(0,0,0,0.4) !important; }
  .ceo-panel[data-dark="true"] input,
  .ceo-panel[data-dark="true"] textarea,
  .ceo-panel[data-dark="true"] select {
    background-color: #0F172A !important;
    color: #F1F5F9 !important;
    border-color: #334155 !important;
  }
  .ceo-panel[data-dark="true"] tr:hover td { background-color: rgba(51,65,85,0.4) !important; }
  .ceo-panel[data-dark="true"] thead { background-color: #0F172A !important; }
  .ceo-panel[data-dark="true"] .hover\\:bg-gray-100:hover { background-color: #334155 !important; }
  .ceo-panel[data-dark="true"] .hover\\:bg-gray-50:hover  { background-color: #1E293B !important; }
`;

// ============================================================================
// DONUT CHART SVG
// ============================================================================

interface DonutSlice { label: string; value: number; color: string; }

const DonutChart: React.FC<{ slices: DonutSlice[]; size?: number; thickness?: number; centerLabel?: string }> = ({
  slices, size = 140, thickness = 28, centerLabel,
}) => {
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;

  let offset = 0;
  const arcs = slices.map(slice => {
    const pct   = slice.value / total;
    const dash  = pct * circumference;
    const gap   = circumference - dash;
    const start = offset;
    offset += dash;
    return { ...slice, dash, gap, start };
  });

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* background ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={thickness} opacity={0.07} />
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth={thickness}
            strokeDasharray={`${arc.dash} ${arc.gap}`}
            strokeDashoffset={-arc.start}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      {centerLabel && (
        <div style={{
          position: 'absolute', textAlign: 'center', lineHeight: 1.2,
        }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{centerLabel}</div>
          <div style={{ fontSize: 10, opacity: 0.5, fontWeight: 600 }}>total</div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// SMALL COMPONENTS
// ============================================================================

const SidebarItem = ({ icon: Icon, label, active, onClick, disabled = false }: any) => (
  <button
    onClick={onClick} disabled={disabled}
    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-xl transition-all ${
      active ? 'bg-gray-900 text-white shadow-sm'
        : disabled ? 'text-gray-300 cursor-not-allowed'
        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
    }`}
  >
    <Icon size={18} /> {label}
    {disabled && <Lock size={11} className="ml-auto opacity-40" />}
  </button>
);

const KPICard = ({ title, value, subtext, icon: Icon, trend, color, prefix = '' }: any) => (
  <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition">
    <div className="flex justify-between items-start mb-3">
      <div className={`p-2.5 rounded-xl bg-opacity-10 ${color}`}>
        <Icon size={20} className={color.replace('bg-', 'text-')} />
      </div>
      {trend !== undefined && (
        <span className={`flex items-center text-xs font-bold px-2 py-0.5 rounded-full ${trend > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {trend > 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
          {Math.abs(trend)}%
        </span>
      )}
    </div>
    <p className="text-gray-400 text-xs font-medium mb-1">{title}</p>
    <p className="text-2xl font-bold text-gray-900">{prefix}{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</p>
    {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
  </div>
);

const Badge = ({ children, color = 'gray' }: { children: React.ReactNode; color?: string }) => {
  const colors: Record<string, string> = {
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    purple: 'bg-purple-100 text-purple-700',
    gray: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${colors[color] ?? colors.gray}`}>
      {children}
    </span>
  );
};

const PLAN_COLOR: Record<string, string> = {
  FREE: 'gray', PRO: 'blue', MASTER: 'purple', INSTITUTIONAL: 'green',
};

// ============================================================================
// SUB SEARCH PICKER — busca tenant por nome/e-mail (sem UUID)
// ============================================================================

interface SubPickerResult { tenant_id: string; name: string; email: string; plan: string; }

const SubSearchPicker = ({ onSelect, placeholder = 'Buscar por nome, escola ou e-mail...' }: {
  onSelect: (r: SubPickerResult) => void;
  placeholder?: string;
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SubPickerResult[]>([]);
  const [fetching, setFetching] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setFetching(true);
      try {
        const subs = await AdminService.getSubscribers();
        const q = query.toLowerCase();
        setResults(
          subs
            .filter(s => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
            .slice(0, 8)
            .map(s => ({ tenant_id: s.tenant_id, name: s.name, email: s.email, plan: String(s.plan) }))
        );
      } catch { setResults([]); }
      finally { setFetching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
        <input
          className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-gray-300 outline-none"
          placeholder={placeholder}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
        />
        {fetching && <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" size={12} />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
          {results.map(r => (
            <button
              key={r.tenant_id}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
              onMouseDown={() => { onSelect(r); setQuery(''); setOpen(false); }}
            >
              <div>
                <p className="text-sm font-bold text-gray-900">{r.name}</p>
                <p className="text-xs text-gray-400">{r.email}</p>
              </div>
              <Badge color={PLAN_COLOR[r.plan] ?? 'gray'}>{r.plan}</Badge>
            </button>
          ))}
        </div>
      )}
      {open && query.length >= 2 && results.length === 0 && !fetching && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 px-4 py-3 text-sm text-gray-400 text-center">
          Nenhum tenant encontrado para "{query}"
        </div>
      )}
    </div>
  );
};

// ============================================================================
// TAB: OVERVIEW
// ============================================================================

const OverviewTab = ({ adminUser, darkMode }: { adminUser: AdminUser; darkMode: boolean }) => {
  const [kpis, setKpis] = useState<CeoKpis | null>(null);
  const [creditDashboard, setCreditDashboard] = useState<CeoCreditDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiStats, setAiStats] = useState<{ total: number; success: number; failed: number; copilotActed: number } | null>(null);

  useEffect(() => {
    if (DEMO_MODE) {
      setKpis({
        total_tenants: 166, active_subscribers: 142, overdue_subscribers: 8,
        trial_subscribers: 12, canceled_subscribers: 4,
        free_count: 80, pro_monthly_count: 35, pro_annual_count: 17,
        premium_monthly_count: 22, premium_annual_count: 14,
        mrr_pro_monthly: 35 * 79, mrr_pro_annual: 17 * 59,
        mrr_premium_monthly: 22 * 147, mrr_premium_annual: 14 * 99,
        mrr_estimated: 35*79 + 17*59 + 22*147 + 14*99,
        extra_revenue_mtd: 1240, low_credit_count: 18, expiring_7d_count: 7,
      });
      setAiStats({ total: 1284, success: 1201, failed: 83, copilotActed: 342 });
      setLoading(false);
      return;
    }
    Promise.all([getCeoKpis(), getCeoCreditDashboard()])
      .then(([k, credit]) => { setKpis(k); setCreditDashboard(credit); setLoading(false); })
      .catch(() => setLoading(false));
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    Promise.all([
      supabase.from('ai_requests').select('status', { count: 'exact', head: false }).gte('created_at', since),
      supabase.from('copilot_suggestions').select('id', { count: 'exact', head: false }).eq('status', 'acted').gte('created_at', since),
    ]).then(([reqRes, copilotRes]) => {
      const rows: any[] = reqRes.data ?? [];
      setAiStats({
        total: rows.length,
        success: rows.filter(r => r.status === 'success').length,
        failed: rows.filter(r => r.status === 'failed').length,
        copilotActed: (copilotRes.count ?? 0),
      });
    }).catch(() => {});
  }, []);

  if (loading) return <div className="text-gray-400 text-sm py-8">Carregando KPIs...</div>;
  if (!kpis) return null;

  const fmt = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const mrrTotal = kpis.mrr_estimated;
  const arr = mrrTotal * 12;

  const subscriptionSlices: DonutSlice[] = [
    { label: 'Ativas',     value: kpis.active_subscribers,   color: '#10B981' },
    { label: 'Em atraso',  value: kpis.overdue_subscribers,  color: '#F59E0B' },
    { label: 'Trial/Teste',value: kpis.trial_subscribers,    color: '#3B82F6' },
    { label: 'Canceladas', value: kpis.canceled_subscribers, color: '#EF4444' },
  ].filter(s => s.value > 0);

  const planBreakdown = [
    { label: 'PRO Mensal',     count: kpis.pro_monthly_count,    mrr: kpis.mrr_pro_monthly,    color: '#3B82F6' },
    { label: 'PRO Anual',      count: kpis.pro_annual_count,     mrr: kpis.mrr_pro_annual,     color: '#6366F1' },
    { label: 'PREMIUM Mensal', count: kpis.premium_monthly_count,mrr: kpis.mrr_premium_monthly,color: '#8B5CF6' },
    { label: 'PREMIUM Anual',  count: kpis.premium_annual_count, mrr: kpis.mrr_premium_annual, color: '#C69214' },
  ];
  const revenueSlices: DonutSlice[] = planBreakdown
    .filter(p => p.mrr > 0)
    .map(p => ({ label: p.label, value: p.mrr, color: p.color }));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-2xl font-bold">Visão Estratégica</h2>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          color: '#C69214', background: 'rgba(198,146,20,0.1)',
          padding: '3px 10px', borderRadius: 20,
        }}>CEO VIEW</span>
      </div>
      <p className="text-gray-400 text-sm mb-6">Resumo executivo da operação em tempo real.</p>

      {/* KPIs linha 1 — financeiro */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KPICard title="MRR Total" value={fmt(mrrTotal)} icon={DollarSign} color="bg-green-500" />
        <KPICard title="ARR (projeção)" value={fmt(arr)} icon={TrendingUp} color="bg-blue-500" subtext="MRR × 12" />
        <KPICard title="Receita Extra / mês" value={fmt(kpis.extra_revenue_mtd)} icon={Zap} color="bg-orange-500" subtext="Créditos avulsos" />
        <KPICard title="Inadimplentes" value={kpis.overdue_subscribers} icon={AlertCircle} color="bg-red-500" subtext={`${kpis.canceled_subscribers} cancelados`} />
      </div>

      {/* KPIs linha 2 — operacional */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard title="Assinantes Ativos" value={kpis.active_subscribers} icon={Users} color="bg-indigo-500" />
        <KPICard title="Total Tenants" value={kpis.total_tenants} icon={Layers} color="bg-gray-500" subtext={`${kpis.free_count} FREE`} />
        <KPICard title="Pouco Crédito" value={kpis.low_credit_count} icon={AlertTriangle} color="bg-amber-500" subtext="< 30 créditos" />
        <KPICard title="Vencendo em 7 dias" value={kpis.expiring_7d_count} icon={Activity} color="bg-yellow-500" />
      </div>

      {/* Breakdown por plano + ciclo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

        {/* Tabela de breakdown */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-sm">
            <DollarSign size={16} className="text-green-600" /> MRR por Plano &amp; Ciclo
          </h3>
          <div className="space-y-3">
            {planBreakdown.map(p => {
              const pct = mrrTotal > 0 ? Math.round((p.mrr / mrrTotal) * 100) : 0;
              return (
                <div key={p.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                      <span className="font-medium text-gray-700">{p.label}</span>
                      <Badge color="gray">{p.count}</Badge>
                    </span>
                    <span className="font-bold text-gray-900">{fmt(p.mrr)}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: p.color }} />
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between pt-3 border-t border-gray-100 text-sm font-bold text-gray-900">
              <span>Total MRR</span>
              <span>{fmt(mrrTotal)}</span>
            </div>
          </div>
        </div>

        {/* Donut: Status das Assinaturas */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-sm">
            <Activity size={16} className="text-purple-600" /> Status das Assinaturas
          </h3>
          <div className="flex items-center gap-8">
            <DonutChart slices={subscriptionSlices} size={150} thickness={30} centerLabel={String(kpis.total_tenants)} />
            <div className="space-y-2 flex-1">
              {[
                { label: 'Ativas',      count: kpis.active_subscribers,   color: '#10B981' },
                { label: 'Em atraso',   count: kpis.overdue_subscribers,  color: '#F59E0B' },
                { label: 'Trial/Teste', count: kpis.trial_subscribers,    color: '#3B82F6' },
                { label: 'Canceladas',  count: kpis.canceled_subscribers, color: '#EF4444' },
                { label: 'FREE',        count: kpis.free_count,           color: '#94A3B8' },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-sm text-gray-600">{s.label}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-900 tabular-nums">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Uso de IA */}
      {creditDashboard && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <BillingHealthCard title="Wallet vs Ledger" value={creditDashboard.wallet_ledger_divergences} icon={AlertTriangle} severity={creditDashboard.wallet_ledger_divergences > 0 ? 'critical' : 'ok'} subtext="Divergencias detectadas" />
          <BillingHealthCard title="Reservas" value={creditDashboard.pending_reservations} icon={Clock} severity={creditDashboard.pending_reservations > 0 ? 'warn' : 'ok'} subtext="Pendentes de commit/release" />
          <BillingHealthCard title="Refunds" value={creditDashboard.refunds_total} icon={RotateCcw} severity={creditDashboard.refunds_total > 0 ? 'warn' : 'neutral'} subtext="Estornos e releases" />
          <BillingHealthCard title="Falhas" value={creditDashboard.failed_operations} icon={XCircle} severity={creditDashboard.failed_operations > 0 ? 'critical' : 'ok'} subtext="Operacoes financeiras falhadas" />
          <BillingHealthCard title="Retries" value={creditDashboard.suspicious_retries} icon={RefreshCw} severity={creditDashboard.suspicious_retries > 0 ? 'warn' : 'ok'} subtext="Idempotencias reaproveitadas" />
        </div>
      )}

      {/* Uso de IA */}
      {aiStats && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Brain size={15} className="text-purple-500" />
            <h3 className="text-sm font-bold text-gray-700">Uso de IA — últimos 30 dias</h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Requisições IA', value: aiStats.total.toLocaleString('pt-BR'), sub: 'Documentos + Atividades', color: 'text-gray-900' },
              { label: 'Taxa de Sucesso', value: `${aiStats.total > 0 ? Math.round((aiStats.success / aiStats.total) * 100) : 0}%`, sub: `${aiStats.failed} com erro`, color: 'text-green-600' },
              { label: 'Copilot Acionado', value: aiStats.copilotActed.toLocaleString('pt-BR'), sub: 'Sugestões clicadas', color: 'text-indigo-700' },
              { label: 'Custo Est. IA', value: `R$ ${((aiStats.total * 0.02) + (aiStats.failed * 0.005)).toFixed(0)}`, sub: '~ R$ 0,02/req', color: 'text-purple-600' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-[11px] text-gray-400 font-medium mb-1">{c.label}</p>
                <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-[10px] text-gray-400 mt-1">{c.sub}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// TAB: DIAGNOSTICO / HEALTH CENTER
// ============================================================================

const healthStatusTone: Record<string, { label: string; cls: string; severity: 'ok' | 'warn' | 'critical' | 'neutral' }> = {
  ok: { label: 'OK', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', severity: 'ok' },
  attention: { label: 'Atenção', cls: 'bg-amber-50 text-amber-700 border-amber-200', severity: 'warn' },
  critical: { label: 'Crítico', cls: 'bg-red-50 text-red-700 border-red-200', severity: 'critical' },
  unmonitored: { label: 'Fonte não disponível', cls: 'bg-gray-50 text-gray-500 border-gray-200', severity: 'neutral' },
};

const alertSeverityTone: Record<CeoHealthAlert['severity'], { label: string; cls: string; dot: string }> = {
  critical: { label: 'Crítico', cls: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  high: { label: 'Alto', cls: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  medium: { label: 'Médio', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  low: { label: 'Baixo', cls: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-300' },
};

const alertCategoryLabel: Record<CeoHealthAlert['category'], string> = {
  billing: 'Billing',
  credits: 'Créditos',
  kiwify: 'Kiwify',
  users: 'Usuários',
  ai: 'IA',
  documents: 'Documentos',
  security: 'Segurança',
};

const healthCardIcon = (key: string) => {
  const map: Record<string, any> = {
    overall: Activity,
    financial: DollarSign,
    pending_purchases: CreditCard,
    plan_mismatch: AlertTriangle,
    credit_divergences: Zap,
    ai_failures: Brain,
    webhook_events: Link,
    internal_accounts: TestTube,
    rls_policies: Shield,
  };
  return map[key] ?? Activity;
};

const HealthCenterTab = ({ onNavigate }: { onNavigate: (tab: Tab) => void }) => {
  const [diagnostics, setDiagnostics] = useState<CeoHealthDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDiagnostics(await getCeoHealthDiagnostics());
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar diagnóstico.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const groupedAlerts = diagnostics?.alerts.reduce((acc, alert) => {
    (acc[alert.severity] ??= []).push(alert);
    return acc;
  }, {} as Record<CeoHealthAlert['severity'], CeoHealthAlert[]>) ?? {};

  const orderedSeverities: CeoHealthAlert['severity'][] = ['critical', 'high', 'medium', 'low'];
  const unavailableSources = diagnostics?.sources.filter(s => s.status === 'unavailable') ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-2xl font-bold text-gray-900">Diagnóstico</h2>
            {diagnostics && (
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${healthStatusTone[diagnostics.overallStatus === 'OK' ? 'ok' : diagnostics.overallStatus === 'Crítico' ? 'critical' : 'attention'].cls}`}>
                {diagnostics.overallStatus}
              </span>
            )}
          </div>
          <p className="text-gray-400 text-sm">
            Health Center operacional do IncluiAI. Somente leitura, sem reconciliação automática.
          </p>
          {diagnostics?.generatedAt && (
            <p className="text-[11px] text-gray-400 mt-1">
              Última atualização: {new Date(diagnostics.generatedAt).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold flex items-center gap-2 hover:bg-gray-800 disabled:opacity-60"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar diagnóstico
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !diagnostics ? (
        <div className="text-gray-400 text-sm py-8">Carregando diagnóstico operacional...</div>
      ) : diagnostics && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {diagnostics.summary.map(card => {
              const tone = healthStatusTone[card.status] ?? healthStatusTone.unmonitored;
              return (
                <div key={card.key} className="relative">
                  <BillingHealthCard
                    title={card.title}
                    value={card.value ?? 'N/D'}
                    icon={healthCardIcon(card.key)}
                    severity={tone.severity}
                    subtext={card.subtext}
                  />
                  <span className={`absolute right-3 bottom-3 text-[9px] font-bold px-2 py-0.5 rounded-full border ${tone.cls}`}>
                    {tone.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_1fr] gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900">Alertas operacionais</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Agrupados por severidade, com ação recomendada.</p>
                </div>
                <Badge color="gray">{diagnostics.alerts.length}</Badge>
              </div>

              <div className="space-y-4">
                {orderedSeverities.map(severity => {
                  const alerts = groupedAlerts[severity] ?? [];
                  if (alerts.length === 0) return null;
                  const tone = alertSeverityTone[severity];
                  return (
                    <div key={severity}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
                        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{tone.label}</span>
                      </div>
                      <div className="space-y-2">
                        {alerts.map(alert => (
                          <div key={alert.id} className="border border-gray-100 rounded-2xl p-4 hover:shadow-sm transition bg-white">
                            <div className="flex flex-wrap gap-2 items-start justify-between mb-2">
                              <div>
                                <h4 className="text-sm font-bold text-gray-900">{alert.title}</h4>
                                <p className="text-xs text-gray-500 mt-1">{alert.description}</p>
                              </div>
                              <div className="flex gap-1.5">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tone.cls}`}>{tone.label}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{alertCategoryLabel[alert.category]}</span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 items-center justify-between">
                              <p className="text-xs text-gray-400">
                                Ação recomendada: <span className="text-gray-600 font-medium">{alert.recommendedAction}</span>
                              </p>
                              {alert.ctaTab && (
                                <button
                                  onClick={() => onNavigate(alert.ctaTab as Tab)}
                                  className="text-[11px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-lg transition"
                                >
                                  Abrir área relacionada
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-bold text-gray-900 mb-3">Próximas ações recomendadas</h3>
                <div className="space-y-2">
                  {diagnostics.nextActions.map(action => (
                    <div key={action} className="flex gap-2 text-sm text-gray-600">
                      <CheckCircle size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-bold text-gray-900 mb-3">Fontes monitoradas</h3>
                <div className="space-y-2">
                  {diagnostics.sources.map(source => (
                    <div key={source.key} className="flex items-start gap-2 text-xs">
                      {source.status === 'available'
                        ? <CheckCircle size={13} className="text-emerald-500 mt-0.5 shrink-0" />
                        : <AlertCircle size={13} className="text-gray-300 mt-0.5 shrink-0" />}
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-700">{source.label}</p>
                        <p className="text-gray-400 truncate">{source.status === 'available' ? 'Disponível' : source.detail ?? 'Fonte não disponível'}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {unavailableSources.length > 0 && (
                  <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
                    Fontes indisponíveis aparecem como não monitoradas para evitar números inventados.
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================================
// TAB: PLANOS
// ============================================================================

const PlansTab = ({ adminUser }: { adminUser: AdminUser }) => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editing, setEditing] = useState<Partial<Plan> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canEdit = ['super_admin', 'financeiro'].includes(adminUser.role);

  const load = useCallback(async () => {
    setLoading(true);
    setPlans(await AdminService.getPlans());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!editing?.code) return;
    setSaving(true);
    try {
      await AdminService.upsertPlan(editing as Plan & { code: string }, adminUser);
      setEditing(null);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const handleToggle = async (plan: Plan) => {
    if (!canEdit) return;
    try {
      await AdminService.togglePlanActive(plan.id, !plan.is_active, adminUser);
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const EMPTY_PLAN: Partial<Plan> = { code: '', name: '', price_monthly: 0, price_yearly: 0, credits_monthly: 0, max_entities: 5, features_json: [], is_active: true };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Gerenciar Planos</h2>
          <p className="text-gray-400 text-sm">Cadastre e configure os planos disponíveis.</p>
        </div>
        {canEdit && (
          <button onClick={() => setEditing(EMPTY_PLAN)} className="bg-gray-900 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-gray-800 transition">
            <PlusCircle size={16} /> Novo Plano
          </button>
        )}
      </div>

      {/* Form de edição */}
      {editing && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-4">{editing.id ? `Editar: ${editing.name}` : 'Novo Plano'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Código (ex: PRO)</label>
              <input className="w-full border rounded-lg p-2 text-sm font-mono uppercase focus:ring-2 focus:ring-gray-300 outline-none" value={editing.code ?? ''} onChange={e => setEditing({ ...editing, code: e.target.value.toUpperCase() })} placeholder="FREE / PRO / MASTER" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Nome do Plano</label>
              <input className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none" value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Ex: Profissional" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Preço Mensal (R$)</label>
              <input type="number" className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none" value={editing.price_monthly ?? 0} onChange={e => setEditing({ ...editing, price_monthly: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Preço Anual (R$/mês)</label>
              <input type="number" className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none" value={editing.price_yearly ?? 0} onChange={e => setEditing({ ...editing, price_yearly: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Créditos IA / Mês</label>
              <input type="number" className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none" value={editing.credits_monthly ?? 0} onChange={e => setEditing({ ...editing, credits_monthly: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Limite de Alunos/Entidades</label>
              <input type="number" className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none" value={editing.max_entities ?? 5} onChange={e => setEditing({ ...editing, max_entities: Number(e.target.value) })} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-500 mb-1">Features (uma por linha)</label>
              <textarea
                className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none"
                rows={4}
                value={(editing.features_json ?? []).join('\n')}
                onChange={e => setEditing({ ...editing, features_json: e.target.value.split('\n').filter(Boolean) })}
                placeholder="30 alunos&#10;500 créditos IA/mês&#10;Código de auditoria"
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end mt-4">
            <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition">Cancelar</button>
            <button onClick={handleSave} disabled={saving || !editing.code} className="bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-gray-800 disabled:opacity-50 transition">
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} Salvar Plano
            </button>
          </div>
        </div>
      )}

      {/* Tabela de planos */}
      {loading ? <div className="text-gray-400 text-sm">Carregando planos...</div> : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
              <tr>
                <th className="px-5 py-3 text-left">Código / Nome</th>
                <th className="px-5 py-3 text-left">Preços</th>
                <th className="px-5 py-3 text-left">Créditos</th>
                <th className="px-5 py-3 text-left">Max Entidades</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {plans.map(plan => (
                <tr key={plan.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3">
                    <Badge color={PLAN_COLOR[plan.code] ?? 'gray'}>{plan.code}</Badge>
                    <p className="text-gray-700 font-medium mt-1">{plan.name}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    <p>Mensal: <strong>R$ {plan.price_monthly.toFixed(2)}</strong></p>
                    <p className="text-xs text-gray-400">Anual: R$ {plan.price_yearly.toFixed(2)}/mês</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-bold text-purple-700">{plan.credits_monthly === 9999 ? '∞' : plan.credits_monthly}</span>
                    <span className="text-gray-400 text-xs"> /mês</span>
                  </td>
                  <td className="px-5 py-3 font-mono text-gray-700">{plan.max_entities >= 9999 ? '∞' : plan.max_entities}</td>
                  <td className="px-5 py-3">
                    {plan.is_active
                      ? <span className="flex items-center gap-1 text-green-700 text-xs font-bold"><CheckCircle size={12} /> Ativo</span>
                      : <span className="flex items-center gap-1 text-gray-400 text-xs font-bold"><XCircle size={12} /> Inativo</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {canEdit && (
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditing(plan)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500"><Edit3 size={14} /></button>
                        <button onClick={() => handleToggle(plan)} className={`p-1.5 rounded text-xs font-bold ${plan.is_active ? 'hover:bg-red-50 text-red-500' : 'hover:bg-green-50 text-green-600'}`}>
                          {plan.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// TAB: ASSINANTES
// ============================================================================

// Dados de integridade/divergencia agora sao calculados no SQL.

/** Detecta problemas de integridade de dados a partir do que a view retorna. */
/* legacy helper removed from flow
legacy compute integrity helper removed
  const flags: IntegrityFlag[] = [];
  if (!sub.user_email || sub.user_email === '—') {
    flags.push({ kind: 'no_owner', label: 'SEM OWNER', color: 'bg-red-100 text-red-700 border border-red-200' });
  }
  // next_due_date null = tenant ativo mas sem subscription row (COALESCE escondia isso)
  if (!sub.next_due_date && sub.subscription_status !== 'ACTIVE') {
    flags.push({ kind: 'no_subscription', label: 'SEM SUBSCRIPTION', color: 'bg-orange-100 text-orange-700 border border-orange-200' });
  }
  // Plano pago mas créditos no teto do FREE (60) = wallet provavelmente nunca criada
  if (sub.plan_code !== 'FREE' && (sub.credits_remaining ?? 0) === 0 && (sub.credits_limit ?? 0) <= 60) {
    flags.push({ kind: 'wallet_mismatch', label: 'SUBSCRIPTION SEM WALLET', color: 'bg-yellow-100 text-yellow-700 border border-yellow-200' });
  }
  return flags;
}

legacy divergence color map removed {
  paid_but_free: 'bg-red-100 text-red-700 border border-red-200',
  plan_mismatch: 'bg-orange-100 text-orange-700 border border-orange-200',
};

// ── Modal CEO: editar telefone/CPF de assinante ──────────────────────────────
*/
function buildSubscriberPurchase(sub: CeoSubscriber): KiwifyPurchaseRow | null {
  if (!sub.purchase_id) return null;
  return {
    id: sub.purchase_id,
    email: sub.purchase_email ?? sub.user_email ?? '',
    product_key: sub.purchase_product_key ?? null,
    plan_code: sub.purchase_plan_code ?? null,
    credits_amount: 0,
    provider_order_id: sub.purchase_order_id ?? null,
    status: (sub.purchase_status as KiwifyPurchaseRow['status']) ?? 'APPROVED',
    activation_status: (sub.purchase_activation_status as KiwifyPurchaseRow['activation_status']) ?? null,
    paid_at: sub.purchase_paid_at ?? null,
    activated_at: sub.purchase_activated_at ?? null,
    tenant_id: sub.tenant_id,
    created_at: sub.purchase_paid_at ?? sub.tenant_created_at,
  };
}

function mapSubscriberDivergence(sub: CeoSubscriber): { kind: string; label: string } | null {
  if (!sub.divergence?.label) return null;
  return { kind: sub.divergence.kind, label: sub.divergence.label };
}

function mapSubscriberIntegrityFlags(sub: CeoSubscriber): Array<{ kind: string; label: string; color: string }> {
  const flags = Array.isArray(sub.integrity_flags) ? sub.integrity_flags : [];
  const divergenceCode = sub.divergence?.code;
  return flags
    .filter(flag => flag.code !== divergenceCode)
    .map(flag => ({
      kind: flag.kind,
      label: flag.label,
      color: flag.color,
    }));
}

function _applyPhoneMaskDash(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2)  return d.replace(/(\d{1,2})/, '($1');
  if (d.length <= 6)  return d.replace(/(\d{2})(\d+)/, '($1) $2');
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d+)/, '($1) $2-$3');
  return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}
function _applyCPFMaskDash(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3)  return d;
  if (d.length <= 6)  return d.replace(/(\d{3})(\d+)/, '$1.$2');
  if (d.length <= 9)  return d.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, '$1.$2.$3-$4');
}

interface ContactEditModalProps {
  targetEmail: string;
  targetName: string;
  initialPhone: string | null;
  initialCpf: string | null;
  adminUser: AdminUser;
  onSaved: () => void;
  onClose: () => void;
}

const ContactEditModal: React.FC<ContactEditModalProps> = ({
  targetEmail, targetName, initialPhone, initialCpf, adminUser, onSaved, onClose,
}) => {
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [cpf, setCpf]     = useState(
    initialCpf
      ? initialCpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
      : ''
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setSaving(true);
    try {
      const cpfDigits = cpf.replace(/\D/g, '');
      await adminUpdateUserContact(
        targetEmail,
        phone.trim() || null,
        cpfDigits || null,
        adminUser,
      );
      onSaved();
      onClose();
    } catch (ex: any) {
      setErr(ex?.message ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 16,
    }}>
      <div style={{
        background: 'white', borderRadius: 16, padding: 28,
        width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <h3 style={{ fontWeight: 800, fontSize: 16, color: '#111827', margin: '0 0 4px' }}>
          Editar contato
        </h3>
        <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 20px' }}>
          {targetName} · <span style={{ fontFamily: 'monospace' }}>{targetEmail}</span>
        </p>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
              Telefone / WhatsApp
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(_applyPhoneMaskDash(e.target.value))}
              placeholder="(11) 99999-9999"
              inputMode="numeric"
              style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #D1D5DB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
              CPF
            </label>
            <input
              type="text"
              value={cpf}
              onChange={e => setCpf(_applyCPFMaskDash(e.target.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
              style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #D1D5DB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          {err && (
            <p style={{ fontSize: 12, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '8px 12px', margin: 0 }}>
              {err}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="submit"
              disabled={saving}
              style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: saving ? '#9CA3AF' : '#1F4E5F', color: 'white', fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer' }}
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '10px 16px', borderRadius: 8, border: '1.5px solid #E5E7EB', background: 'white', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Modal confirmação: marcar como conta interna ─────────────────────────────
interface InternalConfirmModalProps {
  tenantName: string;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}
const InternalConfirmModal: React.FC<InternalConfirmModalProps> = ({ tenantName, onConfirm, onClose, loading }) => (
  <div style={{
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, padding: 16,
  }}>
    <div style={{
      background: 'white', borderRadius: 16, padding: 28,
      width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <TestTube size={20} style={{ color: '#6B7280' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontWeight: 800, fontSize: 15, color: '#111827', margin: 0 }}>Conta interna</h3>
          <p style={{ fontSize: 12, color: '#6B7280', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tenantName}</p>
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
          INTERNO
        </span>
      </div>
      <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 14 }}>
        Esta conta será removida dos indicadores financeiros e comerciais.
      </p>
      <ul style={{ fontSize: 12, color: '#6B7280', lineHeight: 2, marginBottom: 22, paddingLeft: 20, margin: '0 0 22px' }}>
        <li>Não entra em MRR nem ARR</li>
        <li>Não entra em contagem de churn</li>
        <li>Não entra em taxas de conversão</li>
        <li>Não aparece nos KPIs financeiros</li>
      </ul>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onConfirm}
          disabled={loading}
          style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: loading ? '#9CA3AF' : '#374151', color: 'white', fontWeight: 700, fontSize: 13, cursor: loading ? 'wait' : 'pointer' }}
        >
          {loading ? 'Aguarde…' : 'Confirmar'}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #E5E7EB', background: 'white', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  </div>
);

const SubscribersTab = ({ adminUser }: { adminUser: AdminUser }) => {
  const [subscriberPage, setSubscriberPage] = useState<CeoSubscriberPage>({
    rows: [],
    total: 0,
    page: 1,
    pageSize: 25,
  });
  const [inactiveTenants, setInactiveTenants] = useState<InactiveTenantRow[]>([]);
  const [kiwifyPurchases, setKiwifyPurchases] = useState<KiwifyPurchaseRow[]>([]);
  const [kpis, setKpis] = useState<CeoKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDivergence, setFilterDivergence] = useState(false);
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<{ email: string; name: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [contactEditTarget, setContactEditTarget] = useState<{
    email: string; name: string; phone: string | null; cpf: string | null;
  } | null>(null);
  const [internalConfirm, setInternalConfirm] = useState<{ tenantId: string; tenantName: string } | null>(null);
  const [internalConfirmLoading, setInternalConfirmLoading] = useState(false);
  const [internalTenants, setInternalTenants] = useState<InactiveTenantRow[]>([]);

  const subscribers = subscriberPage.rows;
  const totalSubscribers = subscriberPage.total;
  const totalPages = Math.max(1, Math.ceil(totalSubscribers / subscriberPage.pageSize));
  const divergenceCount = kpis?.tenants_with_findings_count ?? 0;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterStatus, filterDivergence]);

  const load = useCallback(async () => {
    setLoading(true);
    const [pageData, purchases, inactive, contactsMap, internal, nextKpis] = await Promise.all([
      getCeoSubscribersPage({
        search: debouncedSearch || undefined,
        status: filterStatus,
        onlyFindings: filterDivergence,
        page,
        pageSize: subscriberPage.pageSize,
      }).catch((e: any) => {
        console.error('[CEO Subscribers] Erro ao carregar v_ceo_subscribers:', e?.message ?? e);
        return {
          rows: [] as CeoSubscriber[],
          total: 0,
          page,
          pageSize: subscriberPage.pageSize,
        } as CeoSubscriberPage;
      }),
      getKiwifyPurchases().catch(() => [] as KiwifyPurchaseRow[]),
      getCeoInactiveTenants().catch(() => [] as InactiveTenantRow[]),
      getCeoSubscribersContacts().catch(() => new Map()),
      getCeoInternalTenants().catch(() => [] as InactiveTenantRow[]),
      getCeoKpis().catch(() => null),
    ]);

    // Mescla phone/cpf na lista de subscribers
    const subsWithContact = pageData.rows.map(s => {
      const contact = s.user_email ? contactsMap.get(s.user_email) : undefined;
      return {
        ...s,
        user_phone: contact?.phone ?? s.user_phone ?? null,
        user_cpf: contact?.cpf ?? s.user_cpf ?? null,
      };
    });

    if (inactive.length) console.warn('[CEO] Tenants INATIVOS (is_active=false, ausentes da view):', inactive.length, inactive.map(t => t.id));

    setSubscriberPage({
      ...pageData,
      rows: subsWithContact,
    });
    setKiwifyPurchases(purchases);
    setInactiveTenants(inactive);
    setInternalTenants(internal);
    setKpis(nextKpis);
    setLoading(false);
  }, [debouncedSearch, filterStatus, filterDivergence, page, subscriberPage.pageSize]);

  useEffect(() => { load(); }, [load]);

  const orphanPurchases = kiwifyPurchases.filter(
    p => !p.tenant_id && p.status === 'APPROVED' && !p.activated_at
  );

  const filtered = subscribers;

  const doAction = async (action: () => Promise<void>, tenantId: string) => {
    setActionLoading(tenantId);
    try { await action(); await load(); }
    catch (e: any) { alert(e.message); }
    finally { setActionLoading(null); }
  };

  const handleMarkInternal = (tenantId: string, tenantName: string) => {
    setInternalConfirm({ tenantId, tenantName });
  };

  const confirmMarkInternal = async () => {
    if (!internalConfirm) return;
    setInternalConfirmLoading(true);
    try {
      await setTenantInternal(internalConfirm.tenantId, true, adminUser);
      await load();
      setInternalConfirm(null);
    } catch (e: any) { alert(e.message); }
    finally { setInternalConfirmLoading(false); }
  };

  const handleFixDivergence = async (tenantId: string) => {
    await doAction(() => reconcilePendingPurchases().then(() => {}), tenantId);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Assinantes</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            {subscribers.length} tenants · {kiwifyPurchases.length} compras Kiwify
            {inactiveTenants.length > 0 && (
              <span className="ml-2 text-orange-500 font-medium">· {inactiveTenants.length} inativos</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
            <input
              className="pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-gray-200 w-52 bg-white"
              placeholder="Buscar nome ou e-mail…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200 bg-white"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="all">Todos os status</option>
            <option value="ACTIVE">Ativos</option>
            <option value="OVERDUE">Em atraso</option>
            <option value="CANCELED">Cancelados</option>
            <option value="TRIAL">Trial</option>
            <option value="NO_SUBSCRIPTION">Sem subscription</option>
          </select>
          <button
            onClick={() => setFilterDivergence(v => !v)}
            className={`px-3 py-2 text-xs font-semibold rounded-xl border transition flex items-center gap-1.5 ${filterDivergence ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-500 border-red-200 hover:bg-red-50'}`}
          >
            <AlertTriangle size={12} />
            {divergenceCount > 0 ? `${divergenceCount} alertas` : 'Alertas'}
          </button>
          <button
            onClick={load}
            className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition"
            title="Atualizar"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI strip */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <BillingHealthCard
            title="Ativos"
            value={kpis?.active_subscribers ?? 0}
            icon={CheckCircle}
            severity="ok"
            subtext="assinaturas ativas"
          />
          <BillingHealthCard
            title="Em Atraso"
            value={kpis?.overdue_subscribers ?? 0}
            icon={AlertTriangle}
            severity={(kpis?.overdue_subscribers ?? 0) > 0 ? 'warn' : 'ok'}
            subtext="pagamentos vencidos"
          />
          <BillingHealthCard
            title="Pend. Ativação"
            value={kpis?.pending_activation_count ?? 0}
            icon={Clock}
            severity={(kpis?.pending_activation_count ?? 0) > 0 ? 'warn' : 'ok'}
            subtext="compras aguardando ativação"
          />
          <BillingHealthCard
            title="Sem Conta"
            value={kpis?.orphan_purchase_count ?? 0}
            icon={UserIcon}
            severity={(kpis?.orphan_purchase_count ?? 0) > 0 ? 'critical' : 'ok'}
            subtext="pagaram sem cadastro"
            cta={(kpis?.orphan_purchase_count ?? 0) > 0 ? { label: 'Ver compras', onClick: () => setDrawerOpen(true) } : undefined}
          />
          <BillingHealthCard
            title="Divergências"
            value={divergenceCount}
            icon={AlertTriangle}
            severity={divergenceCount > 0 ? 'critical' : 'ok'}
            subtext="plano ou ativação incorretos"
            cta={divergenceCount > 0 && !filterDivergence ? { label: 'Filtrar', onClick: () => setFilterDivergence(true) } : undefined}
          />
          <BillingHealthCard
            title="Inativos"
            value={kpis?.inactive_tenants_count ?? inactiveTenants.length}
            icon={EyeOff}
            severity="neutral"
            subtext="is_active = false"
          />
        </div>
      )}

      {/* Kiwify health banner */}
      {!loading && (
        <KiwifyStatusBanner
          noAccountCount={kpis?.orphan_purchase_count ?? 0}
          notActivatedCount={kpis?.pending_activation_count ?? 0}
          unknownProductCount={kpis?.unknown_product_count ?? 0}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
      )}

      {/* Subscriber cards */}
      {loading ? (
        <div className="py-6 text-sm text-gray-400">Carregando assinantes…</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(sub => {
            const kp = buildSubscriberPurchase(sub);
            const divergence = mapSubscriberDivergence(sub);
            const integrity = mapSubscriberIntegrityFlags(sub);
            return (
              <SubscriberRowCard
                key={sub.tenant_id}
                sub={sub}
                kiwifyPurchase={kp}
                divergence={divergence}
                integrityFlags={integrity}
                actionLoading={actionLoading === sub.tenant_id}
                adminUser={adminUser}
                onGrantCredits={async (tid, amount, reason) => {
                  await doAction(() => AdminService.grantCredits(tid, amount, reason, adminUser), tid);
                }}
                onChangePlan={async (tid, plan) => {
                  await doAction(() => AdminService.updateSubscriberPlan(tid, plan, adminUser), tid);
                }}
                onGrantCourtesy={async (tid, reason) => {
                  await doAction(() => AdminService.grantCourtesy(tid, reason, adminUser), tid);
                }}
                onSuspend={async (tid) => {
                  await doAction(() => AdminService.suspendSubscriber(tid, adminUser), tid);
                }}
                onReactivate={async (tid) => {
                  await doAction(() => AdminService.reactivateSubscriber(tid, adminUser), tid);
                }}
                onResetPassword={(email, name) => setResetTarget({ email, name })}
                onMarkInternal={handleMarkInternal}
                onFixDivergence={handleFixDivergence}
                onEditContact={(email, phone, cpf, name) =>
                  setContactEditTarget({ email, name, phone, cpf })
                }
              />
            );
          })}
          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400 bg-white rounded-2xl border border-gray-100">
              Nenhum assinante encontrado.
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 px-1">
              <p className="text-xs text-gray-400">
                Pág. {subscriberPage.page} de {totalPages} · {totalSubscribers} registros
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={subscriberPage.page <= 1}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={subscriberPage.page >= totalPages}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Inactive tenants */}
      {!loading && inactiveTenants.length > 0 && (
        <div className="pt-2">
          <div className="flex items-center gap-2 mb-2">
            <EyeOff size={13} className="text-gray-400" />
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Tenants inativos — ausentes da listagem ({inactiveTenants.length})
            </h3>
          </div>
          <div className="space-y-1.5">
            {inactiveTenants.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-xl border border-gray-100 text-xs">
                <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                <span className="font-medium text-gray-700 flex-1 truncate">{t.name}</span>
                <span className="font-mono text-gray-300 text-[10px] hidden sm:block truncate max-w-[200px]">{t.id}</span>
                <span className="text-gray-400 shrink-0">{t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR') : '—'}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200 shrink-0">INATIVO</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contas internas */}
      {!loading && internalTenants.length > 0 && (
        <div className="pt-2">
          <div className="flex items-center gap-2 mb-2">
            <TestTube size={13} className="text-gray-400" />
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Contas internas — fora das métricas ({internalTenants.length})
            </h3>
          </div>
          <div className="space-y-1.5">
            {internalTenants.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-xl border border-gray-100 text-xs">
                <span className="w-2 h-2 rounded-full bg-gray-200 shrink-0" />
                <span className="font-medium text-gray-700 flex-1 truncate">{t.name}</span>
                <span className="font-mono text-gray-300 text-[10px] hidden sm:block truncate max-w-[200px]">{t.id}</span>
                <span className="text-gray-400 shrink-0">{t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR') : '—'}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200 shrink-0">INTERNO</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: confirmar conta interna */}
      {internalConfirm && (
        <InternalConfirmModal
          tenantName={internalConfirm.tenantName}
          onConfirm={confirmMarkInternal}
          onClose={() => setInternalConfirm(null)}
          loading={internalConfirmLoading}
        />
      )}

      {/* Password reset modal */}
      {resetTarget && (
        <PasswordResetModal
          targetEmail={resetTarget.email}
          targetName={resetTarget.name}
          adminUser={adminUser}
          onClose={() => setResetTarget(null)}
          onSuccess={() => setResetTarget(null)}
        />
      )}

      {/* Contact edit modal (phone/CPF) */}
      {contactEditTarget && (
        <ContactEditModal
          targetEmail={contactEditTarget.email}
          targetName={contactEditTarget.name}
          initialPhone={contactEditTarget.phone}
          initialCpf={contactEditTarget.cpf}
          adminUser={adminUser}
          onSaved={load}
          onClose={() => setContactEditTarget(null)}
        />
      )}

      {/* Pending purchases drawer */}
      <PendingPurchasesDrawer
        open={drawerOpen}
        purchases={orphanPurchases}
        onClose={() => setDrawerOpen(false)}
        onReconcileSuccess={() => load()}
      />
    </div>
  );
};

// ============================================================================
// TAB: MONITORAMENTO DE ASSINANTES
// ============================================================================

const MonitoringTab = ({ adminUser }: { adminUser: AdminUser }) => {
  const [filter, setFilter] = useState<'low_credit' | 'overdue' | 'expiring'>('low_credit');
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (filter === 'low_credit') setSubscribers(await AdminService.getLowCreditUsers(20));
      else if (filter === 'overdue') setSubscribers(await AdminService.getOverdueUsers());
      else if (filter === 'expiring') setSubscribers(await AdminService.getExpiringSoonUsers(7));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const doAction = async (subId: string, action: () => Promise<void>) => {
    setActionLoading(subId);
    try { await action(); await load(); }
    catch (e: any) { alert(e.message); }
    finally { setActionLoading(null); }
  };

  const handleCredit = (sub: Subscriber) => {
    const amt = prompt('Créditos a conceder (ex: 50):');
    if (amt && !isNaN(Number(amt))) doAction(sub.id, () => AdminService.grantCredits(sub.tenant_id, Number(amt), 'Monitoramento: Reforço manual', adminUser));
  };

  const handleExtend = (sub: Subscriber) => {
    const date = prompt('Nova data de vencimento (AAAA-MM-DD):', new Date().toISOString().slice(0, 10));
    if (date) doAction(sub.id, () => AdminService.extendSubscription(sub.tenant_id, date, adminUser));
  };

  const handleAlert = (sub: Subscriber) => {
    const msg = prompt('Mensagem de alerta persistente para o usuário:');
    if (msg) doAction(sub.id, () => AdminService.sendCustomAlert(sub.tenant_id, msg, adminUser));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold">Monitoramento de Risco</h2>
          <p className="text-gray-400 text-sm">Controle proativo de churn, uso de créditos e atrasos.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setFilter('low_credit')} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${filter === 'low_credit' ? 'bg-orange-100 text-orange-700' : 'bg-white border text-gray-500 hover:bg-gray-50'}`}>Pouco Crédito</button>
          <button onClick={() => setFilter('overdue')} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${filter === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-white border text-gray-500 hover:bg-gray-50'}`}>Vencidos</button>
          <button onClick={() => setFilter('expiring')} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${filter === 'expiring' ? 'bg-yellow-100 text-yellow-700' : 'bg-white border text-gray-500 hover:bg-gray-50'}`}>Vencendo (7 dias)</button>
          <button onClick={load} className="p-2 border rounded-xl text-gray-500 hover:bg-gray-50"><RefreshCw size={16} /></button>
        </div>
      </div>

      {loading ? <div className="text-gray-400 text-sm">Carregando dados...</div> : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
              <tr>
                <th className="px-5 py-3 text-left">Assinante</th>
                <th className="px-5 py-3 text-left">Status / Vencimento</th>
                <th className="px-5 py-3 text-left">Uso de Créditos</th>
                <th className="px-5 py-3 text-right">Ações Rápidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {subscribers.map(sub => (
                <tr key={sub.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3">
                    <p className="font-bold text-gray-900">{sub.name}</p>
                    <p className="text-xs text-gray-400">{sub.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <SubscriptionStatusBadge status={sub.status} size="sm" />
                    <p className={`text-xs mt-1 font-mono ${filter === 'overdue' ? 'text-red-500 font-bold' : 'text-gray-500'}`}>{sub.nextBilling}</p>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${sub.creditsLimit - sub.creditsUsed <= 20 ? 'bg-red-500' : 'bg-purple-500'}`} style={{ width: `${Math.min(100, (sub.creditsUsed / Math.max(1, sub.creditsLimit)) * 100)}%` }} />
                      </div>
                      <span className={`text-xs font-bold ${sub.creditsLimit - sub.creditsUsed <= 20 ? 'text-red-500' : 'text-gray-500'}`}>{sub.creditsUsed}/{sub.creditsLimit}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {actionLoading === sub.id ? <RefreshCw size={14} className="animate-spin text-gray-400 ml-auto" /> : (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => handleAlert(sub)} className="px-2 py-1 text-xs font-bold bg-orange-50 text-orange-700 rounded hover:bg-orange-100"><AlertCircle size={11} className="inline mr-0.5"/> Alerta</button>
                        <button onClick={() => handleCredit(sub)} className="px-2 py-1 text-xs font-bold bg-purple-50 text-purple-700 rounded hover:bg-purple-100"><Zap size={11} className="inline mr-0.5"/> Crédito</button>
                        <button onClick={() => handleExtend(sub)} className="px-2 py-1 text-xs font-bold bg-blue-50 text-blue-700 rounded hover:bg-blue-100"><Clock size={11} className="inline mr-0.5"/> Prazo</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {subscribers.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">Nenhum assinante nesta lista.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// TAB: CRÉDITOS
// ============================================================================

const CreditsTab = ({ adminUser }: { adminUser: AdminUser }) => {
  const [tenantId, setTenantId] = useState('');
  const [selectedSubName, setSelectedSubName] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<CreditLedgerEntry[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [grantAmount, setGrantAmount] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [globalLedger, setGlobalLedger] = useState<CreditLedgerEntry[]>([]);

  // Carregar ledger global no mount
  useEffect(() => {
    CreditLedgerService.getGlobalHistory(50)
      .then(setGlobalLedger)
      .catch(() => {});
  }, []);

  const handleSearch = async () => {
    if (!tenantId.trim()) return;
    setLoadingLedger(true);
    try {
      const [bal, hist] = await Promise.all([
        CreditWalletService.getBalance(tenantId),
        CreditLedgerService.getHistory(tenantId, 30),
      ]);
      setBalance(bal);
      setLedger(hist);
    } catch (e: any) { alert('Tenant não encontrado: ' + e.message); }
    finally { setLoadingLedger(false); }
  };

  const handleGrant = async () => {
    const amount = Number(grantAmount);
    if (!tenantId || isNaN(amount) || amount === 0 || !grantReason) {
      alert('Preencha todos os campos.');
      return;
    }
    setSaving(true);
    try {
      await AdminService.grantCredits(tenantId, amount, grantReason, adminUser);
      setGrantAmount('');
      setGrantReason('');
      await handleSearch();
      const updated = await CreditLedgerService.getGlobalHistory(50);
      setGlobalLedger(updated);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const TYPE_LABELS: Record<string, { label: string; color: string }> = {
    renewal:     { label: 'Renovação',    color: 'text-green-700 bg-green-50' },
    purchase:    { label: 'Compra',       color: 'text-blue-700 bg-blue-50' },
    bonus:       { label: 'Bônus',        color: 'text-purple-700 bg-purple-50' },
    consumption: { label: 'Consumo IA',   color: 'text-red-600 bg-red-50' },
    refund:      { label: 'Estorno',      color: 'text-orange-700 bg-orange-50' },
    adjustment:  { label: 'Ajuste',       color: 'text-gray-700 bg-gray-100' },
  };

  const renderLedgerTable = (entries: CreditLedgerEntry[], title: string) => (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 font-bold text-sm text-gray-700">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Data</th>
              <th className="px-4 py-2 text-left">Tipo</th>
              <th className="px-4 py-2 text-left">Descrição</th>
              <th className="px-4 py-2 text-right">Qtd</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Nenhuma movimentação.</td></tr>
            ) : entries.map(entry => {
              const t = TYPE_LABELS[entry.type] ?? { label: entry.type, color: 'text-gray-700 bg-gray-100' };
              return (
                <tr key={entry.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2 text-xs text-gray-400 font-mono">{new Date(entry.created_at).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-xs font-bold ${t.color}`}>{t.label}</span></td>
                  <td className="px-4 py-2 text-gray-600 text-xs max-w-xs truncate">{entry.description ?? '—'}</td>
                  <td className={`px-4 py-2 text-right font-bold text-sm ${entry.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {entry.amount > 0 ? '+' : ''}{entry.amount}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1">Gestão de Créditos</h2>
      <p className="text-gray-400 text-sm mb-6">Visualize, conceda e estorne créditos por tenant.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Busca por tenant */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-gray-200">
          <h3 className="font-bold text-sm text-gray-700 mb-3">Buscar Tenant</h3>
          <div className="mb-4">
            <SubSearchPicker onSelect={r => { setTenantId(r.tenant_id); setSelectedSubName(r.name); handleSearch(); }} />
          </div>
          {selectedSubName && tenantId && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
              <CheckCircle size={14} className="text-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">{selectedSubName}</p>
                <p className="text-xs text-gray-400 font-mono truncate">{tenantId}</p>
              </div>
              <button onClick={() => { setTenantId(''); setSelectedSubName(''); setBalance(null); setLedger([]); }} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
            </div>
          )}

          {balance !== null && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
              <p className="text-xs text-purple-600 font-bold uppercase mb-1">Saldo Atual</p>
              <p className="text-3xl font-bold text-purple-700">{balance} <span className="text-base font-normal">créditos</span></p>
            </div>
          )}

          {ledger.length > 0 && renderLedgerTable(ledger, `Histórico — ${selectedSubName || tenantId.slice(0, 8) + '...'}`)}
        </div>

        {/* Formulário de concessão */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200">
          <h3 className="font-bold text-sm text-gray-700 mb-3">Conceder / Estornar Créditos</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tenant selecionado</label>
              <div className="w-full border rounded-lg px-3 py-2 text-xs bg-gray-50 text-gray-600 min-h-[36px]">
                {selectedSubName ? <><strong>{selectedSubName}</strong><br/><span className="font-mono text-gray-400">{tenantId.slice(0,16)}…</span></> : <span className="text-gray-400">Selecione via busca ao lado</span>}
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Quantidade (negativo = estorno)</label>
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none" value={grantAmount} onChange={e => setGrantAmount(e.target.value)} placeholder="Ex: 50 ou -10" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Motivo (auditoria)</label>
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none resize-none" rows={3} value={grantReason} onChange={e => setGrantReason(e.target.value)} placeholder="Ex: Bonificação por feedback, erro de cobrança..." />
            </div>
            <button onClick={handleGrant} disabled={saving || !tenantId || !grantAmount || !grantReason} className="w-full bg-purple-600 text-white py-2 rounded-xl text-sm font-bold hover:bg-purple-700 disabled:opacity-50 transition flex items-center justify-center gap-2">
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Gift size={14} />}
              {Number(grantAmount) < 0 ? 'Estornar Créditos' : 'Conceder Créditos'}
            </button>
            <p className="text-xs text-gray-400 text-center">Toda operação é registrada no ledger para auditoria.</p>
          </div>
        </div>
      </div>

      {renderLedgerTable(globalLedger, 'Movimentações Recentes (Todos os Tenants)')}
    </div>
  );
};

// ============================================================================
// TAB: LANDING / COMERCIAL — Editor por seções (CEO_COMMERCIAL_STEP_1)
// ============================================================================

// ── Shared types & styles ────────────────────────────────────────────────────

const CreditCommandCenterTab = ({ onNavigate }: { onNavigate: (tab: Tab) => void }) => {
  const [data, setData] = useState<CeoCreditCommandCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | '7d' | '30d'>('30d');
  const [detail, setDetail] = useState<CeoCreditWalletRow | null>(null);
  const [copiedTenantId, setCopiedTenantId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setData(await getCeoCreditCommandCenter()); }
    catch (e: any) { setError(e?.message ?? 'Erro ao carregar Command Center de creditos.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cardSeverity = (status: string): 'ok' | 'warn' | 'critical' | 'neutral' =>
    status === 'critical' ? 'critical' : status === 'attention' ? 'warn' : status === 'unmonitored' ? 'neutral' : 'ok';
  const formatValue = (value: number | string | null) => typeof value === 'number' ? value.toLocaleString('pt-BR') : value ?? 'N/D';
  const sourceUnavailable = (key: string) => data?.sources.some(s => s.key === key && s.status === 'unavailable') ?? false;
  const matchesPeriod = (date?: string | null) => {
    if (periodFilter === 'all' || !date) return true;
    const days = periodFilter === '7d' ? 7 : 30;
    return new Date(date).getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
  };

  const statusTone: Record<CeoCreditWalletRow['status'], string> = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    attention: 'bg-amber-50 text-amber-700 border-amber-200',
    critical: 'bg-red-50 text-red-700 border-red-200',
    unmonitored: 'bg-gray-50 text-gray-500 border-gray-200',
  };

  const wallets = (data?.wallets ?? []).filter(row => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || row.tenant_name.toLowerCase().includes(q) || row.tenant_id.toLowerCase().includes(q) || (row.user_email ?? '').toLowerCase().includes(q);
    return matchesSearch && (statusFilter === 'all' || row.status === statusFilter) && (planFilter === 'all' || row.plan_code === planFilter);
  });
  const plans = Array.from(new Set((data?.wallets ?? []).map(row => row.plan_code).filter(Boolean))).sort();
  const reservations = (data?.reservations ?? []).filter(row => matchesPeriod(row.created_at));
  const failures = (data?.failures ?? []).filter(row => matchesPeriod(row.created_at));
  const refunds = (data?.refunds ?? []).filter(row => matchesPeriod(row.created_at));
  const duplicates = (data?.duplicates ?? []).filter(row => matchesPeriod(row.last_seen_at));

  const copyTenantId = async (tenantId: string) => {
    try {
      await navigator.clipboard?.writeText(tenantId);
      setCopiedTenantId(tenantId);
      setTimeout(() => setCopiedTenantId(null), 1400);
    } catch { setCopiedTenantId(null); }
  };

  const Section = ({ title, sourceKey, count, children }: { title: string; sourceKey: string; count: number; children: React.ReactNode }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div><h3 className="font-bold text-gray-900">{title}</h3><p className="text-xs text-gray-400 mt-0.5">{sourceUnavailable(sourceKey) ? 'Fonte nao disponivel' : `${count} registro(s)`}</p></div>
        {sourceUnavailable(sourceKey) && <Badge color="gray">nao monitorado</Badge>}
      </div>
      {sourceUnavailable(sourceKey) ? <div className="px-5 py-8 text-sm text-gray-400 text-center">Fonte nao disponivel no Supabase atual.</div> : children}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Command Center de Créditos</h2>
          <p className="text-gray-400 text-sm">Monitoramento operacional somente-leitura de wallets, ledger, reservas e falhas.</p>
          {data?.generatedAt && <p className="text-[11px] text-gray-400 mt-1">Última atualização: {new Date(data.generatedAt).toLocaleString('pt-BR')}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => onNavigate('diagnostics')} className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 text-xs font-semibold flex items-center gap-2 hover:bg-gray-50"><Activity size={13} /> Ir para Diagnóstico</button>
          <button onClick={load} disabled={loading} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold flex items-center gap-2 hover:bg-gray-800 disabled:opacity-60"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar</button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{error}</div>}
      {loading && !data ? <div className="text-gray-400 text-sm py-8">Carregando Command Center de créditos...</div> : data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {data.cards.map(card => <BillingHealthCard key={card.key} title={card.title} value={formatValue(card.value)} icon={card.key === 'credit_failures' ? XCircle : card.key === 'divergences' ? AlertTriangle : card.key === 'duplicates' ? Copy : Zap} severity={cardSeverity(card.status)} subtext={card.subtext} />)}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={14} /><input className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-gray-200" placeholder="Buscar tenant, email ou tenant_id..." value={search} onChange={e => setSearch(e.target.value)} /></div>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">Todos os status</option><option value="critical">Crítico</option><option value="attention">Atenção</option><option value="ok">OK</option><option value="unmonitored">Não monitorado</option></select>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={planFilter} onChange={e => setPlanFilter(e.target.value)}><option value="all">Todos os planos</option>{plans.map(plan => <option key={plan} value={plan}>{plan}</option>)}</select>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={periodFilter} onChange={e => setPeriodFilter(e.target.value as 'all' | '7d' | '30d')}><option value="30d">Últimos 30 dias</option><option value="7d">Últimos 7 dias</option><option value="all">Todo período carregado</option></select>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between"><div><h3 className="font-bold text-gray-900">Tenants e carteiras</h3><p className="text-xs text-gray-400 mt-0.5">{wallets.length} carteira(s) visíveis</p></div>{sourceUnavailable('v_credit_integrity') && <Badge color="gray">ledger calculado indisponível</Badge>}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase"><tr><th className="px-4 py-3 text-left">Tenant</th><th className="px-4 py-3 text-left">Plano</th><th className="px-4 py-3 text-right">Wallet</th><th className="px-4 py-3 text-right">Ledger</th><th className="px-4 py-3 text-right">Dif.</th><th className="px-4 py-3 text-right">Consumo mês</th><th className="px-4 py-3 text-left">Última operação</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-right">Ações</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {wallets.length === 0 ? <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Nenhuma carteira encontrada.</td></tr> : wallets.map(row => (
                    <tr key={row.tenant_id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3"><p className="font-semibold text-gray-800 max-w-[220px] truncate">{row.tenant_name}</p><p className="text-[11px] text-gray-400 font-mono truncate max-w-[220px]">{row.user_email ?? row.tenant_id}</p></td>
                      <td className="px-4 py-3"><Badge color={PLAN_COLOR[row.plan_code] ?? 'gray'}>{row.plan_code}</Badge></td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">{row.wallet_balance === null ? 'N/D' : row.wallet_balance.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{row.ledger_balance === null ? 'N/D' : row.ledger_balance.toLocaleString('pt-BR')}</td>
                      <td className={`px-4 py-3 text-right tabular-nums font-bold ${Math.abs(row.wallet_ledger_delta ?? 0) > 0 ? 'text-red-600' : 'text-gray-500'}`}>{row.wallet_ledger_delta === null ? 'N/D' : row.wallet_ledger_delta.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{row.consumed_month === null ? 'N/D' : row.consumed_month.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3"><p className="text-xs text-gray-600 max-w-[240px] truncate">{row.last_operation_label ?? 'Sem operação recente'}</p>{row.last_operation_at && <p className="text-[10px] text-gray-400">{new Date(row.last_operation_at).toLocaleString('pt-BR')}</p>}</td>
                      <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${statusTone[row.status]}`}>{row.status_label}</span></td>
                      <td className="px-4 py-3 text-right"><div className="flex justify-end gap-1"><button onClick={() => setDetail(row)} className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">Detalhes</button><button onClick={() => copyTenantId(row.tenant_id)} className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">{copiedTenantId === row.tenant_id ? 'Copiado' : 'Copiar ID'}</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Section title="Reservas abertas" sourceKey="v_credit_reservations" count={reservations.length}><div className="divide-y divide-gray-100">{reservations.length === 0 ? <div className="px-5 py-8 text-sm text-gray-400 text-center">Nenhuma reserva aberta.</div> : reservations.map(row => <div key={row.id} className="px-5 py-3 flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-gray-800 truncate">{row.tenant_name ?? row.tenant_id ?? 'Tenant não informado'}</p><p className="text-xs text-gray-400 truncate">{row.user_email ?? row.operation_id ?? 'Sem usuário'}</p><p className="text-[11px] text-gray-400 truncate">{row.description ?? 'Sem descrição'}</p></div><div className="text-right shrink-0"><p className="font-bold text-amber-700">{row.amount.toLocaleString('pt-BR')} cr.</p><p className={`text-[10px] font-bold ${row.stale ? 'text-red-600' : 'text-gray-400'}`}>{row.age_minutes} min</p></div></div>)}</div></Section>
            <Section title="Falhas de crédito" sourceKey="v_credit_failures" count={failures.length}><div className="divide-y divide-gray-100">{failures.length === 0 ? <div className="px-5 py-8 text-sm text-gray-400 text-center">Nenhuma falha registrada.</div> : failures.map(row => <div key={row.id} className="px-5 py-3"><div className="flex justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-gray-800 truncate">{row.tenant_name ?? row.tenant_id ?? 'Tenant não informado'}</p><p className="text-xs text-gray-400 truncate">{row.user_email ?? row.operation_id ?? 'Sem usuário'}</p></div><p className="font-bold text-red-600 shrink-0">{row.amount ?? 'N/D'} cr.</p></div><p className="text-xs text-gray-500 mt-1 truncate">{row.operation_kind ?? 'operação'} · {row.reason ?? 'motivo não informado'}</p>{row.created_at && <p className="text-[10px] text-gray-400 mt-1">{new Date(row.created_at).toLocaleString('pt-BR')}</p>}</div>)}</div></Section>
            <Section title="Refunds / releases" sourceKey="v_credit_refunds" count={refunds.length}><div className="divide-y divide-gray-100">{refunds.length === 0 ? <div className="px-5 py-8 text-sm text-gray-400 text-center">Nenhum refund/release registrado.</div> : refunds.map(row => <div key={row.id} className="px-5 py-3 flex justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-gray-800 truncate">{row.tenant_name ?? row.tenant_id ?? 'Tenant não informado'}</p><p className="text-xs text-gray-400 truncate">{row.operation_id ?? 'Operação original não informada'}</p><p className="text-[11px] text-gray-400 truncate">{row.reason ?? 'Sem motivo'}</p></div><div className="text-right shrink-0"><p className="font-bold text-emerald-600">{row.amount ?? 'N/D'} cr.</p>{row.created_at && <p className="text-[10px] text-gray-400">{new Date(row.created_at).toLocaleDateString('pt-BR')}</p>}</div></div>)}</div></Section>
            <Section title="Duplicidades / retries" sourceKey="v_credit_duplicates" count={duplicates.length}><div className="divide-y divide-gray-100">{duplicates.length === 0 ? <div className="px-5 py-8 text-sm text-gray-400 text-center">Nenhuma duplicidade detectada.</div> : duplicates.map(row => <div key={row.id} className="px-5 py-3 flex justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-gray-800 truncate">{row.tenant_name ?? row.tenant_id ?? 'Tenant não informado'}</p><p className="text-xs text-gray-400 truncate">{row.operation_id ?? 'Sem operation_id'}</p><p className="text-[11px] text-gray-400 truncate">{row.operation_kind ?? 'operação'} · {row.status ?? 'sem status'}</p></div><div className="text-right shrink-0"><p className="font-bold text-amber-700">{row.attempt_count}x</p>{row.last_seen_at && <p className="text-[10px] text-gray-400">{new Date(row.last_seen_at).toLocaleDateString('pt-BR')}</p>}</div></div>)}</div></Section>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"><h3 className="font-bold text-gray-900 mb-3">Fontes monitoradas</h3><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">{data.sources.map(source => <div key={source.key} className="flex items-start gap-2 text-xs border border-gray-100 rounded-xl p-3">{source.status === 'available' ? <CheckCircle size={13} className="text-emerald-500 mt-0.5 shrink-0" /> : <AlertCircle size={13} className="text-gray-300 mt-0.5 shrink-0" />}<div className="min-w-0"><p className="font-semibold text-gray-700">{source.label}</p><p className="text-gray-400 truncate">{source.status === 'available' ? 'Disponível' : source.detail ?? 'Fonte não disponível'}</p></div></div>)}</div></div>

          {detail && <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}><div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}><div className="flex items-start justify-between gap-3 mb-4"><div><h3 className="text-lg font-bold text-gray-900">{detail.tenant_name}</h3><p className="text-xs text-gray-400 font-mono break-all">{detail.tenant_id}</p></div><button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-700">×</button></div><div className="grid grid-cols-2 gap-3 text-sm"><div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Plano</p><p className="font-bold">{detail.plan_code}</p></div><div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Status</p><p className="font-bold">{detail.status_label}</p></div><div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Wallet</p><p className="font-bold">{detail.wallet_balance ?? 'N/D'}</p></div><div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Ledger</p><p className="font-bold">{detail.ledger_balance ?? 'N/D'}</p></div><div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Diferença</p><p className="font-bold">{detail.wallet_ledger_delta ?? 'N/D'}</p></div><div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Consumo mês</p><p className="font-bold">{detail.consumed_month ?? 'N/D'}</p></div></div><p className="text-xs text-gray-400 mt-4">Esta visualização é somente-leitura. Nenhum saldo é alterado por esta aba.</p></div></div>}
        </>
      )}
    </div>
  );
};

// ============================================================================
// TAB: PLANOS & CUSTOS / PRICING & IA
// ============================================================================

const pricingCategoryLabel: Record<string, string> = {
  plans: 'Planos',
  kiwify: 'Kiwify',
  coupons: 'Cupons',
  credits: 'Pacotes',
  ai: 'IA',
  landing: 'Landing',
};

const pricingSeverityTone: Record<string, string> = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-slate-50 text-slate-600 border-slate-200',
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  attention: 'bg-amber-50 text-amber-700 border-amber-200',
  unmonitored: 'bg-gray-50 text-gray-500 border-gray-200',
};

const PricingAiAdminTab = () => {
  const [data, setData] = useState<CeoPricingAiAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [detail, setDetail] = useState<{ title: string; rows: Array<[string, React.ReactNode]> } | null>(null);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setData(await getCeoPricingAiAdmin()); }
    catch (e: any) { setError(e?.message ?? 'Erro ao carregar Planos & Custos.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const sourceUnavailable = (key: string) => data?.sources.some(s => s.key === key && s.status === 'unavailable') ?? false;
  const money = (value: number | null | undefined) => value === null || value === undefined ? 'N/D' : `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const numberOrNd = (value: number | null | undefined) => value === null || value === undefined ? 'N/D' : value.toLocaleString('pt-BR');
  const cardSeverity = (status: string): 'ok' | 'warn' | 'critical' | 'neutral' =>
    status === 'critical' ? 'critical' : status === 'attention' ? 'warn' : status === 'unmonitored' ? 'neutral' : 'ok';

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(''), 1300);
    } catch { setCopied(''); }
  };

  const filteredProducts = (data?.kiwifyProducts ?? []).filter(product => {
    const matchesSearch = !q || [
      product.product_id,
      product.product_name,
      product.plan_code ?? '',
      product.billing_cycle ?? '',
    ].some(value => value.toLowerCase().includes(q));
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? product.is_active !== false : product.is_active === false);
    return matchesSearch && matchesStatus;
  });

  const filteredCoupons = (data?.coupons ?? []).filter(coupon => {
    const matchesSearch = !q || [
      coupon.code,
      coupon.plan_code ?? '',
      coupon.campaign_name ?? '',
    ].some(value => value.toLowerCase().includes(q));
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? coupon.is_active !== false : coupon.is_active === false);
    return matchesSearch && matchesStatus;
  });

  const filteredAiCosts = (data?.aiCosts ?? []).filter(cost => {
    const matchesSearch = !q || [cost.key, cost.friendly_name, cost.category, cost.source].some(value => value.toLowerCase().includes(q));
    const matchesCategory = categoryFilter === 'all' || cost.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const aiCategories = Array.from(new Set((data?.aiCosts ?? []).map(cost => cost.category))).sort();

  const Section = ({ title, sourceKey, count, children }: { title: string; sourceKey: string; count: number; children: React.ReactNode }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{sourceUnavailable(sourceKey) ? 'Fonte nao disponivel' : `${count} registro(s)`}</p>
        </div>
        {sourceUnavailable(sourceKey) && <Badge color="gray">nao monitorado</Badge>}
      </div>
      {sourceUnavailable(sourceKey) ? <div className="px-5 py-8 text-sm text-gray-400 text-center">Fonte nao disponivel no Supabase atual.</div> : children}
    </div>
  );

  const openProductDetail = (product: CeoPricingKiwifyProductRow) => setDetail({
    title: product.product_name || product.product_id,
    rows: [
      ['product_id', <span className="font-mono break-all">{product.product_id}</span>],
      ['plan_code', product.plan_code ?? 'N/D'],
      ['billing_cycle', product.billing_cycle ?? 'N/D'],
      ['preco Kiwify', money(product.price_brl)],
      ['preco esperado', money(product.expected_price_brl)],
      ['status', product.is_active === false ? 'Inativo' : 'Ativo'],
    ],
  });

  const openCouponDetail = (coupon: CeoPricingCouponRow) => setDetail({
    title: coupon.code,
    rows: [
      ['code', <span className="font-mono">{coupon.code}</span>],
      ['plan_code', coupon.plan_code ?? 'N/D'],
      ['billing_cycle', coupon.billing_cycle ?? 'N/D'],
      ['desconto', `${coupon.discount_value ?? 'N/D'} ${coupon.discount_type ?? ''}`.trim()],
      ['campanha', coupon.campaign_name ?? 'N/D'],
      ['status', coupon.is_active === false ? 'Inativo' : 'Ativo'],
    ],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Planos & Custos</h2>
          <p className="text-gray-400 text-sm">Auditoria somente-leitura de planos, Kiwify, cupons, pacotes e custos de IA.</p>
          {data?.generatedAt && <p className="text-[11px] text-gray-400 mt-1">Ultima atualizacao: {new Date(data.generatedAt).toLocaleString('pt-BR')}</p>}
        </div>
        <button onClick={load} disabled={loading} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold flex items-center gap-2 hover:bg-gray-800 disabled:opacity-60">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{error}</div>}
      {loading && !data ? <div className="text-gray-400 text-sm py-8">Carregando Pricing & IA...</div> : data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.cards.map(card => (
              <BillingHealthCard
                key={card.key}
                title={card.title}
                value={typeof card.value === 'number' ? card.value.toLocaleString('pt-BR') : card.value ?? 'N/D'}
                icon={card.key.includes('kiwify') ? Link : card.key.includes('coupon') ? Tag : card.key.includes('ai') ? Brain : card.key.includes('divergence') ? AlertTriangle : Package}
                severity={cardSeverity(card.status)}
                subtext={card.subtext}
              />
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
                <input className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-gray-200" placeholder="Buscar produto, cupom, plano ou custo IA..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">Todos os status</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                <option value="all">Todas categorias IA</option>
                {aiCategories.map(category => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
          </div>

          <Section title="Planos" sourceKey="ai_costs_config" count={data.plans.length}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase"><tr><th className="px-4 py-3 text-left">Plano</th><th className="px-4 py-3 text-right">Mensal</th><th className="px-4 py-3 text-right">Anual</th><th className="px-4 py-3 text-right">Creditos</th><th className="px-4 py-3 text-right">Config</th><th className="px-4 py-3 text-left">Fonte</th><th className="px-4 py-3 text-left">Status</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {data.plans.map(plan => (
                    <tr key={plan.code}>
                      <td className="px-4 py-3"><p className="font-bold text-gray-900">{plan.display_name}</p><p className="text-[11px] text-gray-400">{plan.code}</p></td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(plan.price_monthly)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(plan.price_annual)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{numberOrNd(plan.credits_monthly)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{numberOrNd(plan.config_credits_monthly)}</td>
                      <td className="px-4 py-3 text-gray-500">{plan.source}</td>
                      <td className="px-4 py-3"><Badge color={plan.is_active === false ? 'gray' : 'green'}>{plan.is_active === false ? 'inativo' : 'ativo/config'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Section title="Produtos Kiwify" sourceKey="kiwify_products" count={filteredProducts.length}>
              <div className="divide-y divide-gray-100">
                {filteredProducts.length === 0 ? <div className="px-5 py-8 text-sm text-gray-400 text-center">Nenhum produto encontrado.</div> : filteredProducts.map(product => (
                  <div key={product.id || product.product_id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{product.product_name || product.product_id}</p>
                      <p className="text-xs text-gray-400 truncate">{product.plan_code ?? 'sem plano'} · {product.billing_cycle ?? product.product_type}</p>
                      <p className="text-[11px] text-gray-400 font-mono truncate">{product.product_id}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-900">{money(product.price_brl)}</p>
                      <p className="text-[10px] text-gray-400">esperado {money(product.expected_price_brl)}</p>
                      <div className="mt-1 flex gap-1 justify-end">
                        <button onClick={() => openProductDetail(product)} className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">Detalhes</button>
                        <button onClick={() => copyText(product.product_id)} className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">{copied === product.product_id ? 'Copiado' : 'Copiar ID'}</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Cupons" sourceKey="ceo_coupons" count={filteredCoupons.length}>
              <div className="divide-y divide-gray-100">
                {filteredCoupons.length === 0 ? <div className="px-5 py-8 text-sm text-gray-400 text-center">Nenhum cupom encontrado.</div> : filteredCoupons.map(coupon => (
                  <div key={coupon.id || coupon.code} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{coupon.code}</p>
                      <p className="text-xs text-gray-400 truncate">{coupon.campaign_name ?? 'Sem campanha'} · {coupon.plan_code ?? 'sem plano'}</p>
                      {coupon.created_at && <p className="text-[11px] text-gray-400">{new Date(coupon.created_at).toLocaleDateString('pt-BR')}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-900">{coupon.discount_value ?? 'N/D'} {coupon.discount_type ?? ''}</p>
                      <div className="mt-1 flex gap-1 justify-end">
                        <button onClick={() => openCouponDetail(coupon)} className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">Detalhes</button>
                        <button onClick={() => copyText(coupon.code)} className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">{copied === coupon.code ? 'Copiado' : 'Copiar code'}</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Section title="Pacotes de Creditos" sourceKey="ai_costs_config" count={data.creditPackages.length}>
              <div className="divide-y divide-gray-100">
                {data.creditPackages.map(pkg => (
                  <div key={pkg.code} className="px-5 py-3 flex justify-between gap-3">
                    <div><p className="text-sm font-semibold text-gray-800">{pkg.code}</p><p className="text-xs text-gray-400">{pkg.label ?? pkg.source}</p></div>
                    <div className="text-right"><p className="font-bold text-gray-900">{numberOrNd(pkg.credits)} cr. · {money(pkg.price_brl)}</p><p className="text-[11px] text-gray-400">{money(pkg.cost_per_credit)} / credito</p></div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="AI_COSTS" sourceKey="ai_costs_config" count={filteredAiCosts.length}>
              <div className="max-h-[430px] overflow-y-auto divide-y divide-gray-100">
                {filteredAiCosts.map(cost => (
                  <div key={`${cost.source}-${cost.key}`} className="px-5 py-3 flex justify-between gap-3">
                    <div className="min-w-0"><p className="text-sm font-semibold text-gray-800 truncate">{cost.friendly_name}</p><p className="text-xs text-gray-400 truncate">{cost.key} · {cost.category}</p></div>
                    <div className="text-right shrink-0"><p className="font-bold text-gray-900">{cost.credits_cost} cr.</p><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${pricingSeverityTone[cost.severity]}`}>{cost.severity === 'attention' ? 'atenção' : cost.severity}</span></div>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4"><div><h3 className="font-bold text-gray-900">Divergencias</h3><p className="text-xs text-gray-400 mt-0.5">Alertas derivados apenas de fontes reais carregadas.</p></div><Badge color={data.divergences.length ? 'yellow' : 'green'}>{data.divergences.length}</Badge></div>
              <div className="space-y-2">
                {data.divergences.length === 0 ? <div className="text-sm text-gray-400 py-6 text-center">Nenhuma divergencia detectada nas fontes disponiveis.</div> : data.divergences.map(item => (
                  <div key={item.id} className="border border-gray-100 rounded-2xl p-4">
                    <div className="flex flex-wrap gap-2 items-start justify-between mb-2"><h4 className="text-sm font-bold text-gray-900">{item.title}</h4><div className="flex gap-1.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${pricingSeverityTone[item.severity]}`}>{item.severity}</span><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{pricingCategoryLabel[item.category]}</span></div></div>
                    <p className="text-xs text-gray-500">{item.description}</p>
                    <p className="text-xs text-gray-400 mt-2">Acao recomendada: <span className="text-gray-600 font-medium">{item.recommendedAction}</span></p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-bold text-gray-900 mb-3">Fontes monitoradas</h3>
              <div className="space-y-2">
                {data.sources.map(source => (
                  <div key={source.key} className="flex items-start gap-2 text-xs border border-gray-100 rounded-xl p-3">
                    {source.status === 'available' ? <CheckCircle size={13} className="text-emerald-500 mt-0.5 shrink-0" /> : <AlertCircle size={13} className="text-gray-300 mt-0.5 shrink-0" />}
                    <div className="min-w-0"><p className="font-semibold text-gray-700">{source.label}</p><p className="text-gray-400 truncate">{source.status === 'available' ? 'Disponivel' : source.detail ?? 'Fonte nao disponivel'}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {detail && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
              <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 mb-4"><h3 className="text-lg font-bold text-gray-900">{detail.title}</h3><button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-700">×</button></div>
                <div className="space-y-2">{detail.rows.map(([label, value]) => <div key={label} className="bg-gray-50 rounded-xl p-3 text-sm"><p className="text-xs text-gray-400">{label}</p><p className="font-semibold text-gray-800">{value}</p></div>)}</div>
                <p className="text-xs text-gray-400 mt-4">Esta visualizacao e somente-leitura. Nenhum preco, cupom, checkout ou custo IA e alterado por esta aba.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ============================================================================
// TAB: BILLING / KIWIFY RECONCILIATION CENTER
// ============================================================================

const billingSeverityTone: Record<CeoBillingKiwifyPurchaseRow['severity'], string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  attention: 'bg-amber-50 text-amber-700 border-amber-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

const BillingKiwifyReconciliationTab = () => {
  const [data, setData] = useState<CeoBillingKiwifyReconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [activationFilter, setActivationFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | '7d' | '30d'>('30d');
  const [detail, setDetail] = useState<CeoBillingKiwifyPurchaseRow | null>(null);
  const [copied, setCopied] = useState('');
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setData(await getCeoBillingKiwifyReconciliation()); }
    catch (e: any) { setError(e?.message ?? 'Erro ao carregar Billing & Kiwify.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const sourceUnavailable = (key: string) => data?.sources.some(s => s.key === key && s.status === 'unavailable') ?? false;
  const cardSeverity = (status: string): 'ok' | 'warn' | 'critical' | 'neutral' =>
    status === 'critical' ? 'critical' : status === 'attention' ? 'warn' : status === 'unmonitored' ? 'neutral' : 'ok';
  const money = (value: number | null | undefined) => value === null || value === undefined ? 'N/D' : `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const matchesPeriod = (date?: string | null) => {
    if (periodFilter === 'all' || !date) return true;
    const days = periodFilter === '7d' ? 7 : 30;
    return new Date(date).getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
  };

  const copyText = async (text?: string | null) => {
    if (!text) return;
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(''), 1300);
    } catch { setCopied(''); }
  };

  const handleReconcile = async () => {
    if (!confirm('Reconciliar compras pendentes agora?\n\nEsta acao usa a rotina administrativa existente e nao roda automaticamente.')) return;
    setReconciling(true);
    setReconcileResult(null);
    try {
      const result = await reconcilePendingPurchases();
      setReconcileResult(result);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao reconciliar compras pendentes.');
    } finally {
      setReconciling(false);
    }
  };

  const purchases = (data?.purchases ?? []).filter(row => {
    const matchesSearch = !q || [
      row.customer_email ?? '',
      row.customer_name ?? '',
      row.product_name ?? '',
      row.product_id ?? '',
      row.product_key ?? '',
      row.provider_order_id ?? '',
      row.tenant_id ?? '',
      row.tenant_name ?? '',
    ].some(value => value.toLowerCase().includes(q));
    return matchesSearch
      && (paymentFilter === 'all' || row.payment_status === paymentFilter)
      && (activationFilter === 'all' || (row.activation_status ?? 'NONE') === activationFilter)
      && (planFilter === 'all' || row.expected_plan_code === planFilter || row.tenant_plan_code === planFilter)
      && (severityFilter === 'all' || row.severity === severityFilter)
      && matchesPeriod(row.date);
  });

  const paymentStatuses = Array.from(new Set((data?.purchases ?? []).map(row => row.payment_status).filter(Boolean))).sort();
  const activationStatuses = Array.from(new Set((data?.purchases ?? []).map(row => row.activation_status ?? 'NONE'))).sort();
  const plans = Array.from(new Set((data?.purchases ?? []).flatMap(row => [row.expected_plan_code, row.tenant_plan_code]).filter(Boolean) as string[])).sort();
  const manualPendingCount = data?.purchases.filter(row => row.payment_status === 'APPROVED' && (!row.tenant_id || !row.activated_at)).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Billing & Kiwify</h2>
          <p className="text-gray-400 text-sm">Central de reconciliacao operacional. Leitura por padrao; reconciliacao apenas por clique manual.</p>
          {data?.generatedAt && <p className="text-[11px] text-gray-400 mt-1">Ultima atualizacao: {new Date(data.generatedAt).toLocaleString('pt-BR')}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReconcile}
            disabled={reconciling || manualPendingCount === 0}
            className="px-4 py-2 rounded-xl bg-amber-500 text-white text-xs font-semibold flex items-center gap-2 hover:bg-amber-600 disabled:opacity-50"
          >
            <RotateCcw size={13} className={reconciling ? 'animate-spin' : ''} />
            {reconciling ? 'Reconciliando...' : `Reconciliar pendentes${manualPendingCount ? ` (${manualPendingCount})` : ''}`}
          </button>
          <button onClick={load} disabled={loading} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold flex items-center gap-2 hover:bg-gray-800 disabled:opacity-60">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{error}</div>}
      {reconcileResult !== null && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-700">
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold">Reconciliação manual concluída: {reconcileResult.length} resultado(s).</p>
            <button onClick={() => setReconcileResult(null)} className="text-xs font-semibold underline">Fechar</button>
          </div>
          {reconcileResult.length > 0 && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {reconcileResult.slice(0, 12).map((result, index) => (
                <div key={`${result.purchase_email}-${index}`} className="bg-white/70 border border-blue-100 rounded-xl p-3 text-xs">
                  <p className="font-mono text-blue-900 truncate">{result.purchase_email}</p>
                  <p className="text-blue-600">{result.purchase_plan ?? 'sem plano'} · {result.result_action}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && !data ? <div className="text-gray-400 text-sm py-8">Carregando Billing & Kiwify...</div> : data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {data.cards.map(card => (
              <BillingHealthCard
                key={card.key}
                title={card.title}
                value={typeof card.value === 'number' ? card.value.toLocaleString('pt-BR') : card.value ?? 'N/D'}
                icon={card.key.includes('tenant') || card.key.includes('free') ? Users : card.key.includes('product') ? Package : card.key.includes('activation') ? CheckCircle : card.key.includes('critical') ? AlertTriangle : CreditCard}
                severity={cardSeverity(card.status)}
                subtext={card.subtext}
              />
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[230px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
                <input className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-gray-200" placeholder="Buscar email, nome, product_id, order ou tenant..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}>
                <option value="all">Todos pagamentos</option>
                {paymentStatuses.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={activationFilter} onChange={e => setActivationFilter(e.target.value)}>
                <option value="all">Todas ativações</option>
                {activationStatuses.map(status => <option key={status} value={status}>{status === 'NONE' ? 'Sem status' : status}</option>)}
              </select>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={planFilter} onChange={e => setPlanFilter(e.target.value)}>
                <option value="all">Todos planos</option>
                {plans.map(plan => <option key={plan} value={plan}>{plan}</option>)}
              </select>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
                <option value="all">Todas severidades</option>
                <option value="critical">Crítico</option>
                <option value="attention">Atenção</option>
                <option value="ok">OK</option>
              </select>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={periodFilter} onChange={e => setPeriodFilter(e.target.value as 'all' | '7d' | '30d')}>
                <option value="30d">Últimos 30 dias</option>
                <option value="7d">Últimos 7 dias</option>
                <option value="all">Todo período carregado</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div><h3 className="font-bold text-gray-900">Compras Kiwify</h3><p className="text-xs text-gray-400 mt-0.5">{sourceUnavailable('kiwify_purchases') ? 'Fonte nao disponivel' : `${purchases.length} compra(s) visiveis`}</p></div>
              {sourceUnavailable('kiwify_purchases') && <Badge color="gray">nao monitorado</Badge>}
            </div>
            {sourceUnavailable('kiwify_purchases') ? <div className="px-5 py-8 text-sm text-gray-400 text-center">Fonte nao disponivel no Supabase atual.</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Data</th>
                      <th className="px-4 py-3 text-left">Cliente</th>
                      <th className="px-4 py-3 text-left">Produto</th>
                      <th className="px-4 py-3 text-left">Plano</th>
                      <th className="px-4 py-3 text-left">Pagamento</th>
                      <th className="px-4 py-3 text-left">Ativação</th>
                      <th className="px-4 py-3 text-left">Tenant</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                      <th className="px-4 py-3 text-left">Severidade</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {purchases.length === 0 ? <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Nenhuma compra encontrada.</td></tr> : purchases.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50/60">
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{row.date ? new Date(row.date).toLocaleDateString('pt-BR') : 'N/D'}</td>
                        <td className="px-4 py-3"><p className="font-semibold text-gray-800 max-w-[200px] truncate">{row.customer_name ?? row.customer_email ?? 'Sem email'}</p><p className="text-[11px] text-gray-400 font-mono truncate max-w-[200px]">{row.customer_email ?? 'N/D'}</p></td>
                        <td className="px-4 py-3"><p className="font-semibold text-gray-800 max-w-[220px] truncate">{row.product_name ?? 'Produto N/D'}</p><p className="text-[11px] text-gray-400 font-mono truncate max-w-[220px]">{row.product_id ?? row.product_key ?? 'sem product_id'}</p></td>
                        <td className="px-4 py-3"><Badge color={PLAN_COLOR[row.expected_plan_code ?? ''] ?? 'gray'}>{row.expected_plan_code ?? 'N/D'}</Badge><p className="text-[10px] text-gray-400 mt-1">{row.billing_cycle ?? 'sem ciclo'}</p></td>
                        <td className="px-4 py-3"><Badge color={row.payment_status === 'APPROVED' ? 'green' : row.payment_status === 'PENDING' ? 'yellow' : 'gray'}>{row.payment_status}</Badge></td>
                        <td className="px-4 py-3 text-xs text-gray-500">{row.activation_status ?? 'Sem status'}</td>
                        <td className="px-4 py-3"><p className="font-semibold text-gray-800 max-w-[180px] truncate">{row.tenant_name ?? 'Sem tenant'}</p><p className="text-[11px] text-gray-400 truncate max-w-[180px]">{row.tenant_plan_code ?? 'N/D'} · {row.tenant_id ?? 'sem id'}</p></td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">{money(row.price_brl)}</td>
                        <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${billingSeverityTone[row.severity]}`}>{row.severity_label}</span></td>
                        <td className="px-4 py-3 text-right"><div className="flex gap-1 justify-end"><button onClick={() => setDetail(row)} className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">Detalhes</button><button onClick={() => copyText(row.customer_email)} className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">{copied === row.customer_email ? 'Copiado' : 'Email'}</button><button onClick={() => copyText(row.tenant_id)} disabled={!row.tenant_id} className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40">{copied === row.tenant_id ? 'Copiado' : 'Tenant'}</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4"><div><h3 className="font-bold text-gray-900">Divergências</h3><p className="text-xs text-gray-400 mt-0.5">Alertas reais derivados das compras carregadas.</p></div><Badge color={data.alerts.length ? 'yellow' : 'green'}>{data.alerts.length}</Badge></div>
              <div className="space-y-2">
                {data.alerts.length === 0 ? <div className="text-sm text-gray-400 py-6 text-center">Nenhuma divergência detectada nas fontes disponíveis.</div> : data.alerts.map(alert => (
                  <div key={alert.id} className="border border-gray-100 rounded-2xl p-4">
                    <div className="flex flex-wrap gap-2 items-start justify-between mb-2"><h4 className="text-sm font-bold text-gray-900">{alert.title}</h4><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${pricingSeverityTone[alert.severity]}`}>{alert.severity} · {alert.count}</span></div>
                    <p className="text-xs text-gray-500">{alert.description}</p>
                    <p className="text-xs text-gray-400 mt-2">Ação recomendada: <span className="text-gray-600 font-medium">{alert.recommendedAction}</span></p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-bold text-gray-900 mb-3">Próximas ações recomendadas</h3>
                <div className="space-y-2">{data.nextActions.map(action => <div key={action} className="flex gap-2 text-sm text-gray-600"><CheckCircle size={14} className="text-emerald-500 mt-0.5 shrink-0" /><span>{action}</span></div>)}</div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-bold text-gray-900 mb-3">Fontes monitoradas</h3>
                <div className="space-y-2">
                  {data.sources.map(source => (
                    <div key={source.key} className="flex items-start gap-2 text-xs border border-gray-100 rounded-xl p-3">
                      {source.status === 'available' ? <CheckCircle size={13} className="text-emerald-500 mt-0.5 shrink-0" /> : <AlertCircle size={13} className="text-gray-300 mt-0.5 shrink-0" />}
                      <div className="min-w-0"><p className="font-semibold text-gray-700">{source.label}</p><p className="text-gray-400 truncate">{source.status === 'available' ? 'Disponível' : source.detail ?? 'Fonte não disponível'}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {detail && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
              <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 mb-4"><div><h3 className="text-lg font-bold text-gray-900">{detail.product_name ?? 'Compra Kiwify'}</h3><p className="text-xs text-gray-400 font-mono break-all">{detail.provider_order_id ?? detail.id}</p></div><button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-700">×</button></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {[
                    ['Email', detail.customer_email ?? 'N/D'],
                    ['Cliente', detail.customer_name ?? 'N/D'],
                    ['Produto', detail.product_name ?? 'N/D'],
                    ['Product ID', detail.product_id ?? detail.product_key ?? 'N/D'],
                    ['Plano esperado', detail.expected_plan_code ?? 'N/D'],
                    ['Plano tenant', detail.tenant_plan_code ?? 'N/D'],
                    ['Tenant', detail.tenant_id ?? 'N/D'],
                    ['Valor', money(detail.price_brl)],
                    ['Pagamento', detail.payment_status],
                    ['Ativação', detail.activation_status ?? 'Sem status'],
                    ['Wallet', detail.wallet_balance === null ? 'N/D' : `${detail.wallet_balance} cr.`],
                    ['Mapping', detail.mapping_source],
                  ].map(([label, value]) => <div key={label} className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">{label}</p><p className="font-semibold text-gray-800 break-all">{value}</p></div>)}
                </div>
                <div className="mt-4 bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400 mb-1">Flags</p><p className="text-sm font-semibold text-gray-700">{detail.flags.length ? detail.flags.join(', ') : 'Sem divergências detectadas'}</p></div>
                <p className="text-xs text-gray-400 mt-4">Detalhes locais somente-leitura. Reconciliação só ocorre pelo botão manual da tela principal.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ============================================================================
// TAB: ALERTAS & INCIDENTES
// ============================================================================

const incidentSeverityTone: Record<CeoIncidentRow['severity'], string> = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-slate-50 text-slate-600 border-slate-200',
};

const incidentCategoryLabel: Record<CeoIncidentRow['category'], string> = {
  ai: 'IA',
  billing: 'Billing/Kiwify',
  credits: 'Creditos',
  users: 'Usuarios/Tenants',
  documents: 'Documentos',
  security: 'Seguranca/RLS',
  system: 'Sistema',
};

const incidentStatusTone: Record<CeoIncidentRow['status'], string> = {
  open: 'bg-red-50 text-red-700 border-red-200',
  monitored: 'bg-blue-50 text-blue-700 border-blue-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  no_status: 'bg-gray-50 text-gray-500 border-gray-200',
};

const incidentRelatedTabs: Partial<Record<string, { label: string; tab: Tab }>> = {
  diagnostics: { label: 'Ir para Diagnostico', tab: 'diagnostics' },
  credits: { label: 'Ir para Creditos', tab: 'credits' },
  billing_kiwify: { label: 'Ir para Billing & Kiwify', tab: 'billing_kiwify' },
  accounts_admin: { label: 'Ir para Usuarios & Tenants', tab: 'accounts_admin' },
};

const AlertsIncidentCenterTab = ({ onNavigate }: { onNavigate: (tab: Tab) => void }) => {
  const [data, setData] = useState<CeoAlertsIncidentCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | '24h' | '7d' | '30d'>('7d');
  const [statusFilter, setStatusFilter] = useState('all');
  const [detail, setDetail] = useState<CeoIncidentRow | null>(null);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setData(await getCeoAlertsIncidentCenter()); }
    catch (e: any) { setError(e?.message ?? 'Erro ao carregar Alertas & Incidentes.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const cardSeverity = (status: string): 'ok' | 'warn' | 'critical' | 'neutral' =>
    status === 'critical' ? 'critical' : status === 'attention' ? 'warn' : status === 'unmonitored' ? 'neutral' : 'ok';
  const matchesPeriod = (date?: string | null) => {
    if (periodFilter === 'all' || !date) return true;
    const hours = periodFilter === '24h' ? 24 : periodFilter === '7d' ? 24 * 7 : 24 * 30;
    return new Date(date).getTime() >= Date.now() - hours * 60 * 60 * 1000;
  };

  const copyText = async (text?: string | null) => {
    if (!text) return;
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(''), 1300);
    } catch { setCopied(''); }
  };

  const incidents = (data?.incidents ?? []).filter(row => {
    const matchesSearch = !q || [
      row.title,
      row.description,
      row.source,
      row.tenant_id ?? '',
      row.email ?? '',
      row.recommended_action,
    ].some(value => value.toLowerCase().includes(q));
    return matchesSearch
      && (severityFilter === 'all' || row.severity === severityFilter)
      && (categoryFilter === 'all' || row.category === categoryFilter)
      && (statusFilter === 'all' || row.status === statusFilter)
      && matchesPeriod(row.occurred_at);
  });

  const categories = Array.from(new Set((data?.incidents ?? []).map(row => row.category))).sort();
  const statuses = Array.from(new Set((data?.incidents ?? []).map(row => row.status))).sort();
  const groupedBySeverity = incidents.reduce((acc, row) => {
    (acc[row.severity] ??= []).push(row);
    return acc;
  }, {} as Record<CeoIncidentRow['severity'], CeoIncidentRow[]>);
  const severityOrder: CeoIncidentRow['severity'][] = ['critical', 'high', 'medium', 'low'];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Alertas & Incidentes</h2>
          <p className="text-gray-400 text-sm">Central operacional somente-leitura. Sem correcao ou reconciliacao automatica.</p>
          {data?.generatedAt && <p className="text-[11px] text-gray-400 mt-1">Ultima atualizacao: {new Date(data.generatedAt).toLocaleString('pt-BR')}</p>}
        </div>
        <button onClick={load} disabled={loading} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold flex items-center gap-2 hover:bg-gray-800 disabled:opacity-60">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{error}</div>}

      {loading && !data ? <div className="text-gray-400 text-sm py-8">Carregando incidentes operacionais...</div> : data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {data.cards.map(card => (
              <BillingHealthCard
                key={card.key}
                title={card.title}
                value={typeof card.value === 'number' ? card.value.toLocaleString('pt-BR') : card.value ?? 'N/D'}
                icon={card.key.includes('ai') ? Brain : card.key.includes('billing') ? CreditCard : card.key.includes('credit') || card.key.includes('reservation') ? Zap : card.key.includes('source') ? AlertCircle : AlertTriangle}
                severity={cardSeverity(card.status)}
                subtext={card.subtext}
              />
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
                <input className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-gray-200" placeholder="Buscar por tenant, email, fonte ou descricao..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
                <option value="all">Todas severidades</option>
                <option value="critical">Critico</option>
                <option value="high">Alto</option>
                <option value="medium">Medio</option>
                <option value="low">Baixo</option>
              </select>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                <option value="all">Todas categorias</option>
                {categories.map(category => <option key={category} value={category}>{incidentCategoryLabel[category]}</option>)}
              </select>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={periodFilter} onChange={e => setPeriodFilter(e.target.value as 'all' | '24h' | '7d' | '30d')}>
                <option value="7d">Ultimos 7 dias</option>
                <option value="24h">Ultimas 24h</option>
                <option value="30d">Ultimos 30 dias</option>
                <option value="all">Todo periodo carregado</option>
              </select>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">Todos status</option>
                {statuses.map(status => <option key={status} value={status}>{data.incidents.find(i => i.status === status)?.status_label ?? status}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_0.8fr] gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900">Lista principal de incidentes</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{incidents.length} incidente(s) visiveis</p>
                </div>
                <Badge color="gray">sem mutation</Badge>
              </div>
              <div className="divide-y divide-gray-100">
                {incidents.length === 0 ? <div className="px-5 py-10 text-sm text-gray-400 text-center">Nenhum incidente encontrado para os filtros atuais.</div> : severityOrder.map(severity => {
                  const rows = groupedBySeverity[severity] ?? [];
                  if (rows.length === 0) return null;
                  return (
                    <div key={severity} className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${incidentSeverityTone[severity]}`}>{severity}</span>
                        <span className="text-xs text-gray-400">{rows.length} item(ns)</span>
                      </div>
                      <div className="space-y-2">
                        {rows.map(row => {
                          const related = row.related_tab ? incidentRelatedTabs[row.related_tab] : undefined;
                          return (
                            <div key={row.id} className="border border-gray-100 rounded-2xl p-4 hover:shadow-sm transition">
                              <div className="flex flex-wrap gap-2 items-start justify-between mb-2">
                                <div className="min-w-0">
                                  <h4 className="text-sm font-bold text-gray-900">{row.title}</h4>
                                  <p className="text-xs text-gray-500 mt-1">{row.description}</p>
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${incidentSeverityTone[row.severity]}`}>{row.severity}</span>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{incidentCategoryLabel[row.category]}</span>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${incidentStatusTone[row.status]}`}>{row.status_label}</span>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-gray-400 mb-3">
                                <span>Fonte: <strong className="text-gray-600">{row.source}</strong></span>
                                <span>Tenant/email: <strong className="text-gray-600">{row.tenant_id ?? row.email ?? 'N/D'}</strong></span>
                                <span>Data: <strong className="text-gray-600">{row.occurred_at ? new Date(row.occurred_at).toLocaleString('pt-BR') : 'sem data'}</strong></span>
                              </div>
                              <div className="flex flex-wrap gap-2 items-center justify-between">
                                <p className="text-xs text-gray-500">Acao recomendada: <span className="font-medium text-gray-700">{row.recommended_action}</span></p>
                                <div className="flex gap-1.5">
                                  <button onClick={() => setDetail(row)} className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">Detalhes</button>
                                  <button onClick={() => copyText(row.tenant_id ?? row.email)} disabled={!row.tenant_id && !row.email} className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40">{copied === (row.tenant_id ?? row.email) ? 'Copiado' : 'Copiar'}</button>
                                  {related && <button onClick={() => onNavigate(related.tab)} className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800">{related.label}</button>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-bold text-gray-900 mb-3">Proximas acoes recomendadas</h3>
                <div className="space-y-2">{data.nextActions.map(action => <div key={action} className="flex gap-2 text-sm text-gray-600"><CheckCircle size={14} className="text-emerald-500 mt-0.5 shrink-0" /><span>{action}</span></div>)}</div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-bold text-gray-900 mb-3">Fontes monitoradas</h3>
                <div className="space-y-2">
                  {data.sources.map(source => (
                    <div key={source.key} className="flex items-start gap-2 text-xs border border-gray-100 rounded-xl p-3">
                      {source.status === 'available' ? <CheckCircle size={13} className="text-emerald-500 mt-0.5 shrink-0" /> : <AlertCircle size={13} className="text-gray-300 mt-0.5 shrink-0" />}
                      <div className="min-w-0"><p className="font-semibold text-gray-700">{source.label}</p><p className="text-gray-400 truncate">{source.status === 'available' ? 'Disponivel' : source.detail ?? 'Fonte nao disponivel'}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {detail && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
              <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{detail.title}</h3>
                    <p className="text-xs text-gray-400">{incidentCategoryLabel[detail.category]} · {detail.source}</p>
                  </div>
                  <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-700">x</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {[
                    ['Severidade', detail.severity],
                    ['Status', detail.status_label],
                    ['Tenant', detail.tenant_id ?? 'N/D'],
                    ['Email', detail.email ?? 'N/D'],
                    ['Data/hora', detail.occurred_at ? new Date(detail.occurred_at).toLocaleString('pt-BR') : 'sem data'],
                    ['Fonte', detail.source],
                  ].map(([label, value]) => <div key={label} className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">{label}</p><p className="font-semibold text-gray-800 break-all">{value}</p></div>)}
                </div>
                <div className="mt-4 bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-2">Descricao</p>
                  <p className="text-sm text-gray-700">{detail.description}</p>
                </div>
                <div className="mt-4 bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-2">Acao recomendada</p>
                  <p className="text-sm text-gray-700">{detail.recommended_action}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 justify-end">
                  <button onClick={() => copyText(detail.tenant_id)} disabled={!detail.tenant_id} className="px-3 py-2 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40">{copied === detail.tenant_id ? 'Tenant copiado' : 'Copiar tenant'}</button>
                  <button onClick={() => copyText(detail.email)} disabled={!detail.email} className="px-3 py-2 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40">{copied === detail.email ? 'Email copiado' : 'Copiar email'}</button>
                  {detail.related_tab && incidentRelatedTabs[detail.related_tab] && <button onClick={() => onNavigate(incidentRelatedTabs[detail.related_tab]!.tab)} className="px-3 py-2 text-xs font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800">{incidentRelatedTabs[detail.related_tab]!.label}</button>}
                </div>
                <p className="text-xs text-gray-400 mt-4">Detalhes locais somente-leitura. Esta tela nao executa correcao, reconciliacao ou mutation.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ============================================================================
// TAB: USUARIOS & TENANTS / ADMIN DE CONTAS
// ============================================================================

const accountSeverityTone: Record<CeoUsersTenantsAccountRow['severity'], string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  attention: 'bg-amber-50 text-amber-700 border-amber-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
  unmonitored: 'bg-gray-50 text-gray-500 border-gray-200',
};

const UsersTenantsAdminTab = ({ adminUser }: { adminUser: AdminUser }) => {
  const [data, setData] = useState<CeoUsersTenantsAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [internalFilter, setInternalFilter] = useState('all');
  const [divergenceFilter, setDivergenceFilter] = useState('all');
  const [detail, setDetail] = useState<CeoUsersTenantsAccountRow | null>(null);
  const [copied, setCopied] = useState('');
  const [resetTarget, setResetTarget] = useState<{ email: string; name: string } | null>(null);
  const [internalTarget, setInternalTarget] = useState<CeoUsersTenantsAccountRow | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setData(await getCeoUsersTenantsAdmin()); }
    catch (e: any) { setError(e?.message ?? 'Erro ao carregar Usuarios & Tenants.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const canManageInternal = ['super_admin', 'operacional'].includes(adminUser.role);
  const canResetPassword = ['super_admin', 'operacional', 'suporte'].includes(adminUser.role);
  const sourceUnavailable = (key: string) => data?.sources.some(s => s.key === key && s.status === 'unavailable') ?? false;
  const q = search.trim().toLowerCase();
  const cardSeverity = (status: string): 'ok' | 'warn' | 'critical' | 'neutral' =>
    status === 'critical' ? 'critical' : status === 'attention' ? 'warn' : status === 'unmonitored' ? 'neutral' : 'ok';

  const copyText = async (text?: string | null) => {
    if (!text) return;
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(''), 1300);
    } catch { setCopied(''); }
  };

  const confirmMarkInternal = async () => {
    if (!internalTarget) return;
    setInternalLoading(true);
    try {
      await setTenantInternal(internalTarget.tenant_id, true, adminUser);
      setInternalTarget(null);
      await load();
    } catch (e: any) {
      alert(e?.message ?? 'Erro ao marcar conta interna.');
    } finally {
      setInternalLoading(false);
    }
  };

  const handleRemoveInternal = async (row: CeoUsersTenantsAccountRow) => {
    if (!confirm(`Remover ${row.tenant_name} das contas internas?\n\nA conta voltara a entrar nas metricas do CEO se as views considerarem is_internal=false.`)) return;
    setInternalLoading(true);
    try {
      await setTenantInternal(row.tenant_id, false, adminUser);
      await load();
      if (detail?.tenant_id === row.tenant_id) setDetail(null);
    } catch (e: any) {
      alert(e?.message ?? 'Erro ao remover marcacao interna.');
    } finally {
      setInternalLoading(false);
    }
  };

  const accounts = (data?.accounts ?? []).filter(row => {
    const matchesSearch = !q || [
      row.tenant_id,
      row.tenant_name,
      row.primary_email ?? '',
      row.owner_name ?? '',
      row.linked_purchase?.email ?? '',
      row.linked_purchase?.provider_order_id ?? '',
    ].some(value => value.toLowerCase().includes(q));
    const hasDivergence = Boolean(row.divergence_label);
    return matchesSearch
      && (planFilter === 'all' || (row.plan_code ?? 'N/D') === planFilter)
      && (statusFilter === 'all' || (row.status ?? 'N/D') === statusFilter)
      && (internalFilter === 'all' || (internalFilter === 'internal' ? row.is_internal : !row.is_internal))
      && (divergenceFilter === 'all' || (divergenceFilter === 'with' ? hasDivergence : !hasDivergence));
  });

  const plans = Array.from(new Set((data?.accounts ?? []).map(row => row.plan_code ?? 'N/D'))).sort();
  const statuses = Array.from(new Set((data?.accounts ?? []).map(row => row.status ?? 'N/D'))).sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Usuarios & Tenants</h2>
          <p className="text-gray-400 text-sm">Admin de contas somente-leitura, com acoes manuais seguras ja existentes.</p>
          {data?.generatedAt && <p className="text-[11px] text-gray-400 mt-1">Ultima atualizacao: {new Date(data.generatedAt).toLocaleString('pt-BR')}</p>}
        </div>
        <button onClick={load} disabled={loading} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold flex items-center gap-2 hover:bg-gray-800 disabled:opacity-60">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{error}</div>}

      {loading && !data ? <div className="text-gray-400 text-sm py-8">Carregando usuarios, tenants e contas internas...</div> : data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.cards.map(card => (
              <BillingHealthCard
                key={card.key}
                title={card.title}
                value={typeof card.value === 'number' ? card.value.toLocaleString('pt-BR') : card.value ?? 'N/D'}
                icon={card.key.includes('user') ? UserIcon : card.key.includes('internal') ? TestTube : card.key.includes('divergence') || card.key.includes('activation') ? AlertTriangle : Users}
                severity={cardSeverity(card.status)}
                subtext={card.subtext}
              />
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
                <input className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-gray-200" placeholder="Buscar escola, email, tenant_id ou compra..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={planFilter} onChange={e => setPlanFilter(e.target.value)}>
                <option value="all">Todos planos</option>
                {plans.map(plan => <option key={plan} value={plan}>{plan}</option>)}
              </select>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">Todos status</option>
                {statuses.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={internalFilter} onChange={e => setInternalFilter(e.target.value)}>
                <option value="all">Internas e externas</option>
                <option value="internal">Somente internas</option>
                <option value="external">Somente externas</option>
              </select>
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={divergenceFilter} onChange={e => setDivergenceFilter(e.target.value)}>
                <option value="all">Com/sem divergencia</option>
                <option value="with">Com divergencia</option>
                <option value="without">Sem divergencia</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">Tabela operacional</h3>
                <p className="text-xs text-gray-400 mt-0.5">{sourceUnavailable('v_ceo_subscribers') && sourceUnavailable('tenants') ? 'Fonte nao disponivel' : `${accounts.length} conta(s) visiveis`}</p>
              </div>
              <Badge color="gray">somente leitura</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Tenant</th>
                    <th className="px-4 py-3 text-left">Responsavel</th>
                    <th className="px-4 py-3 text-left">Plano</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Origem</th>
                    <th className="px-4 py-3 text-left">Compra</th>
                    <th className="px-4 py-3 text-left">Divergencia</th>
                    <th className="px-4 py-3 text-left">Severidade</th>
                    <th className="px-4 py-3 text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {accounts.length === 0 ? <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Nenhuma conta encontrada nas fontes disponiveis.</td></tr> : accounts.map(row => (
                    <tr key={row.tenant_id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800 max-w-[220px] truncate">{row.tenant_name}</p>
                        <p className="text-[11px] text-gray-400 font-mono truncate max-w-[220px]">{row.tenant_id}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800 max-w-[190px] truncate">{row.owner_name ?? 'N/D'}</p>
                        <p className="text-[11px] text-gray-400 truncate max-w-[190px]">{row.primary_email ?? 'sem email'}</p>
                      </td>
                      <td className="px-4 py-3"><Badge color={PLAN_COLOR[row.plan_code ?? ''] ?? 'gray'}>{row.plan_code ?? 'N/D'}</Badge></td>
                      <td className="px-4 py-3"><Badge color={row.status === 'ACTIVE' ? 'green' : row.status === 'INACTIVE' ? 'gray' : 'yellow'}>{row.status ?? 'N/D'}</Badge>{row.is_internal && <span className="ml-2"><Badge color="gray">interno</Badge></span>}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px] truncate">{row.origin}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{row.linked_purchase ? <><p>{row.linked_purchase.status ?? 'N/D'} / {row.linked_purchase.activation_status ?? 'sem ativacao'}</p><p className="text-[10px] text-gray-400 font-mono truncate max-w-[160px]">{row.linked_purchase.provider_order_id ?? row.linked_purchase.id}</p></> : 'Sem compra vinculada'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">{row.divergence_label ?? 'Sem divergencia'}</td>
                      <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${accountSeverityTone[row.severity]}`}>{row.severity_label}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => setDetail(row)} className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">Detalhes</button>
                          <button onClick={() => copyText(row.tenant_id)} className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">{copied === row.tenant_id ? 'Copiado' : 'Tenant'}</button>
                          <button onClick={() => copyText(row.primary_email)} disabled={!row.primary_email} className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40">{copied === row.primary_email ? 'Copiado' : 'Email'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900">Contas internas - fora das metricas</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Fonte: tenants.is_internal / getCeoInternalTenants().</p>
                </div>
                <Badge color="gray">{data.internalAccounts.length}</Badge>
              </div>
              <div className="space-y-2">
                {data.internalAccounts.length === 0 ? <div className="text-sm text-gray-400 py-6 text-center">Nenhuma conta interna encontrada.</div> : data.internalAccounts.map(row => (
                  <div key={row.tenant_id} className="border border-gray-100 rounded-2xl p-4 flex flex-wrap gap-3 items-center justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 truncate">{row.tenant_name}</p>
                      <p className="text-xs text-gray-400 truncate">{row.primary_email ?? 'sem email'} · {row.plan_code ?? 'sem plano'}</p>
                      <p className="text-[11px] text-gray-400 mt-1">{row.marked_internal_at ? `Marcada em ${new Date(row.marked_internal_at).toLocaleString('pt-BR')}` : 'Data de marcacao nao disponivel'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setDetail(row)} className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">Detalhes</button>
                      {canManageInternal && (
                        <button onClick={() => handleRemoveInternal(row)} disabled={internalLoading} className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50">
                          Remover interna
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-bold text-gray-900 mb-3">Proximas acoes recomendadas</h3>
                <div className="space-y-2">{data.nextActions.map(action => <div key={action} className="flex gap-2 text-sm text-gray-600"><CheckCircle size={14} className="text-emerald-500 mt-0.5 shrink-0" /><span>{action}</span></div>)}</div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-bold text-gray-900 mb-3">Fontes monitoradas</h3>
                <div className="space-y-2">
                  {data.sources.map(source => (
                    <div key={source.key} className="flex items-start gap-2 text-xs border border-gray-100 rounded-xl p-3">
                      {source.status === 'available' ? <CheckCircle size={13} className="text-emerald-500 mt-0.5 shrink-0" /> : <AlertCircle size={13} className="text-gray-300 mt-0.5 shrink-0" />}
                      <div className="min-w-0"><p className="font-semibold text-gray-700">{source.label}</p><p className="text-gray-400 truncate">{source.status === 'available' ? 'Disponivel' : source.detail ?? 'Fonte nao disponivel'}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {detail && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
              <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{detail.tenant_name}</h3>
                    <p className="text-xs text-gray-400 font-mono break-all">{detail.tenant_id}</p>
                  </div>
                  <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-700">x</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {[
                    ['Email principal', detail.primary_email ?? 'N/D'],
                    ['Responsavel', detail.owner_name ?? 'N/D'],
                    ['Plano atual', detail.plan_code ?? 'N/D'],
                    ['Status', detail.status ?? 'N/D'],
                    ['Conta interna', detail.is_internal ? 'Sim' : 'Nao'],
                    ['Origem', detail.origin],
                    ['Ultima atividade', detail.last_activity_at ? new Date(detail.last_activity_at).toLocaleString('pt-BR') : detail.last_activity_source],
                    ['Divergencia', detail.divergence_label ?? 'Sem divergencia'],
                  ].map(([label, value]) => <div key={label} className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">{label}</p><p className="font-semibold text-gray-800 break-all">{value}</p></div>)}
                </div>

                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-2">Usuarios associados</p>
                    {detail.users.length === 0 ? <p className="text-sm text-gray-400">Fonte users indisponivel ou sem usuarios vinculados.</p> : detail.users.map(user => (
                      <div key={user.id ?? user.email ?? 'user'} className="text-sm border-b border-gray-100 py-2 last:border-0">
                        <p className="font-semibold text-gray-800">{user.name ?? 'Sem nome'}</p>
                        <p className="text-xs text-gray-400">{user.email ?? 'sem email'} · {user.is_active === false ? 'inativo' : 'ativo/N/D'}</p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-2">Compra vinculada</p>
                    {detail.linked_purchase ? (
                      <div className="text-sm text-gray-700 space-y-1">
                        <p><strong>Status:</strong> {detail.linked_purchase.status ?? 'N/D'} / {detail.linked_purchase.activation_status ?? 'sem ativacao'}</p>
                        <p><strong>Plano:</strong> {detail.linked_purchase.plan_code ?? 'N/D'}</p>
                        <p><strong>Produto:</strong> {detail.linked_purchase.product_key ?? 'N/D'}</p>
                        <p className="font-mono text-xs break-all">{detail.linked_purchase.provider_order_id ?? detail.linked_purchase.id}</p>
                      </div>
                    ) : <p className="text-sm text-gray-400">Sem compra vinculada nas fontes carregadas.</p>}
                  </div>
                </div>

                <div className="mt-4 bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-2">Ultimos eventos administrativos</p>
                  {detail.audit_events.length === 0 ? <p className="text-sm text-gray-400">Sem eventos disponiveis em admin_audit_log.</p> : detail.audit_events.map(event => (
                    <div key={`${event.action_type}-${event.created_at}`} className="text-sm border-b border-gray-100 py-2 last:border-0">
                      <p className="font-semibold text-gray-800">{event.action_type}</p>
                      <p className="text-xs text-gray-400">{event.description ?? 'Sem descricao'} · {event.created_at ? new Date(event.created_at).toLocaleString('pt-BR') : 'sem data'}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap gap-2 justify-end">
                  <button onClick={() => copyText(detail.tenant_id)} className="px-3 py-2 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">{copied === detail.tenant_id ? 'Tenant copiado' : 'Copiar tenant_id'}</button>
                  <button onClick={() => copyText(detail.primary_email)} disabled={!detail.primary_email} className="px-3 py-2 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40">{copied === detail.primary_email ? 'Email copiado' : 'Copiar email'}</button>
                  {canResetPassword && detail.primary_email && <button onClick={() => setResetTarget({ email: detail.primary_email!, name: detail.owner_name ?? detail.tenant_name })} className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100">Reset de senha</button>}
                  {canManageInternal && !detail.is_internal && <button onClick={() => setInternalTarget(detail)} className="px-3 py-2 text-xs font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800">Marcar interna</button>}
                  {canManageInternal && detail.is_internal && <button onClick={() => handleRemoveInternal(detail)} disabled={internalLoading} className="px-3 py-2 text-xs font-semibold rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50">Remover interna</button>}
                </div>
                <p className="text-xs text-gray-400 mt-4">Detalhes locais. Nenhuma acao de delete, plano, assinatura, credito ou Kiwify esta exposta nesta tela.</p>
              </div>
            </div>
          )}

          {internalTarget && (
            <InternalConfirmModal
              tenantName={internalTarget.tenant_name}
              onConfirm={confirmMarkInternal}
              onClose={() => setInternalTarget(null)}
              loading={internalLoading}
            />
          )}

          {resetTarget && (
            <PasswordResetModal
              targetEmail={resetTarget.email}
              targetName={resetTarget.name}
              adminUser={adminUser}
              onClose={() => setResetTarget(null)}
              onSuccess={() => setResetTarget(null)}
            />
          )}
        </>
      )}
    </div>
  );
};

type LDSectionDraft = {
  title: string;
  subtitle: string;
  content_json: Record<string, any>;
  updated_at?: string;
};
type LDDrafts = Record<string, LDSectionDraft>;
type LDEditorProps = { sectionKey: string; draft: LDSectionDraft; setJson: (patch: Record<string, any>) => void };

const LD_FIELD: React.CSSProperties = {
  width: '100%', border: '1.5px solid #E2E8F0', borderRadius: 10,
  padding: '10px 14px', fontSize: 14, color: '#0F172A', outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit', background: '#FFFFFF',
  transition: 'border-color 0.15s',
};
const LD_LABEL: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 };
const LD_SECTION_TAG: React.CSSProperties = { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94A3B8', marginBottom: 14, display: 'block' };
const LD_CARD: React.CSSProperties = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 18, padding: '24px 28px', marginBottom: 16 };
const LD_GRID2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };
const LD_ADDBUTTON = (color: string): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px',
  borderRadius: 8, border: `1px solid ${color}40`, background: `${color}10`,
  color, fontSize: 12, fontWeight: 700, cursor: 'pointer',
});
const LD_DELBTN: React.CSSProperties = {
  padding: '9px 12px', background: '#FEF2F2', border: '1px solid #FECACA',
  color: '#DC2626', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0,
};

// ── Section definitions ──────────────────────────────────────────────────────

const LD_SECTIONS = [
  { key: 'hero',      label: 'Hero',           icon: Layers,       color: '#6366F1', desc: 'Título, subtítulo e botões da página inicial' },
  { key: 'planos',    label: 'Planos',         icon: Package,      color: '#0EA5E9', desc: 'Preços, taglines e features dos planos PRO e PREMIUM' },
  { key: 'descontos', label: 'Descontos',      icon: CreditCard,   color: '#16A34A', desc: 'Cupons promocionais e textos de urgência' },
  { key: 'kiwify',    label: 'Links Kiwify',   icon: CreditCard,   color: '#16A34A', desc: 'URLs de checkout dos produtos na Kiwify' },
  { key: 'creditos',  label: 'Créditos',       icon: Zap,          color: '#D97706', desc: 'Pacotes de créditos avulsos (adicionar / editar / remover)' },
  { key: 'avisos',    label: 'Avisos',         icon: AlertCircle,  color: '#DC2626', desc: '48h, vitalício, parcelamento e selos de confiança' },
  { key: 'faq',       label: 'FAQ',            icon: FileText,     color: '#7C3AED', desc: 'Perguntas e respostas (adicionar / editar / remover)' },
];

const LD_DEFAULTS: LDDrafts = {
  hero: {
    title: 'A IA que entende a educação inclusiva',
    subtitle: 'Gere documentos, PEI, PAEE e relatórios em segundos. Devolvendo seu tempo e sua energia.',
    content_json: { cta_primary: 'Começar grátis', cta_secondary: 'Entrar' },
  },
  planos: {
    title: 'Invista onde o impacto é real.',
    subtitle: 'Chega de levar o planejamento para o domingo.',
    content_json: {
      pro_full_price: 79, pro_discount_price: 59,
      pro_tagline: 'Para professores e especialistas',
      pro_features: ['Até 30 alunos', 'PEI, PAEE, PDI e relatórios', 'Atividades com BNCC', 'Histórico do aluno', 'Suporte padrão'],
      premium_full_price: 122, premium_discount_price: 99,
      premium_tagline: 'Para escolas e clínicas',
      premium_features: ['Alunos ilimitados', 'Tudo do plano Pro', 'Análise de laudos com IA', 'Geração avançada de atividades', 'Relatórios evolutivos completos', 'Prioridade em novos recursos'],
    },
  },
  descontos: {
    title: 'Cupons e descontos ativos',
    subtitle: 'Configure os cupons exibidos na landing page.',
    content_json: {
      pro_coupon: 'INCLUIAI59', pro_coupon_active: true,
      premium_coupon: 'INCLUIAI99', premium_coupon_active: true,
      badge_label: 'Valores promocionais por tempo limitado',
      urgency_label: 'Oferta válida por 48 horas',
    },
  },
  kiwify: {
    title: 'Links de Checkout Kiwify',
    subtitle: 'Cole aqui as URLs completas dos produtos criados na Kiwify.',
    content_json: {
      pro_monthly_url: '',
      pro_annual_url: '',
      premium_monthly_url: '',
      premium_annual_url: '',
      credits_100_url: '',
      credits_300_url: '',
      credits_900_url: '',
    },
  },
  creditos: {
    title: 'Pacotes de créditos avulsos',
    subtitle: 'Configure os pacotes exibidos na landing e no app.',
    content_json: {
      packages: [
        { id: 'pkg_100', credits: 100, price: 29.90, label: 'Pacote Básico' },
        { id: 'pkg_300', credits: 300, price: 79.90, label: 'Pacote Intermediário' },
        { id: 'pkg_900', credits: 900, price: 149.90, label: 'Pacote Avançado' },
      ],
    },
  },
  avisos: {
    title: 'Avisos comerciais',
    subtitle: 'Mensagens e selos exibidos na landing page.',
    content_json: {
      urgency_badge: 'Valores promocionais por tempo limitado',
      urgency_clock: 'Oferta válida por 48 horas',
      installment_title: 'Parcelamento inteligente que facilita a aprovação',
      installment_items: ['Mais leve no limite do cartão', 'Sem necessidade de limite alto disponível', 'Parcele em até 12x'],
      lifetime_active: false,
      lifetime_text: 'Acesso vitalício disponível para fundadores',
      trust_items: ['Cancele quando quiser', 'Sem taxa de instalação', 'LGPD conforme', 'Suporte incluído'],
    },
  },
  faq: {
    title: 'Perguntas frequentes',
    subtitle: 'Tire suas dúvidas sobre o IncluiAI.',
    content_json: {
      items: [
        { q: 'Para quem é o IncluiAI?', a: 'Para professores de AEE, psicopedagogos, fonoaudiólogos e demais profissionais de educação inclusiva.' },
        { q: 'Os dados dos alunos são seguros?', a: 'Sim. Armazenamos em conformidade com a LGPD, com criptografia e auditoria SHA-256.' },
        { q: 'Posso cancelar a qualquer momento?', a: 'Sim, sem multas ou taxas de cancelamento.' },
      ],
    },
  },
};

// ── Sub-editors ──────────────────────────────────────────────────────────────

const LDHeroEditor: React.FC<LDEditorProps> = ({ sectionKey: _, draft, setJson }) => {
  const cj = draft.content_json;
  return (
    <div style={LD_CARD}>
      <span style={LD_SECTION_TAG}>Botões e CTAs</span>
      <div style={LD_GRID2}>
        {([
          { k: 'cta_primary',   label: 'Botão principal (CTA primário)' },
          { k: 'cta_secondary', label: 'Botão secundário (login / entrar)' },
        ] as const).map(({ k, label }) => (
          <div key={k}>
            <label style={LD_LABEL}>{label}</label>
            <input style={LD_FIELD} value={String(cj[k] ?? '')} onChange={e => setJson({ [k]: e.target.value })} />
          </div>
        ))}
      </div>
    </div>
  );
};

const LDPlanosEditor: React.FC<LDEditorProps> = ({ sectionKey: _, draft, setJson }) => {
  const cj = draft.content_json;
  const updateFeature = (plan: string, i: number, val: string) => {
    const arr = [...(cj[`${plan}_features`] ?? [])]; arr[i] = val;
    setJson({ [`${plan}_features`]: arr });
  };
  const addFeature = (plan: string) => setJson({ [`${plan}_features`]: [...(cj[`${plan}_features`] ?? []), 'Nova feature'] });
  const removeFeature = (plan: string, i: number) => setJson({ [`${plan}_features`]: (cj[`${plan}_features`] ?? []).filter((_: any, idx: number) => idx !== i) });

  const PlanCard = ({ plan, label, color }: { plan: string; label: string; color: string }) => (
    <div style={{ border: `1.5px solid ${color}25`, borderRadius: 16, padding: 20, background: `${color}05` }}>
      <div style={{ fontSize: 13, fontWeight: 800, color, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 7 }}>
        <Package size={14} color={color} /> Plano {label}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={LD_LABEL}>Preço De (riscado) R$</label>
          <input type="number" style={LD_FIELD} value={Number(cj[`${plan}_full_price`] ?? 0)} onChange={e => setJson({ [`${plan}_full_price`]: Number(e.target.value) })} />
        </div>
        <div>
          <label style={LD_LABEL}>Preço por (desconto) R$</label>
          <input type="number" style={LD_FIELD} value={Number(cj[`${plan}_discount_price`] ?? 0)} onChange={e => setJson({ [`${plan}_discount_price`]: Number(e.target.value) })} />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={LD_LABEL}>Tagline do plano</label>
        <input style={LD_FIELD} value={String(cj[`${plan}_tagline`] ?? '')} onChange={e => setJson({ [`${plan}_tagline`]: e.target.value })} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={{ ...LD_LABEL, marginBottom: 0 }}>Features</label>
        <button onClick={() => addFeature(plan)} style={LD_ADDBUTTON(color)}>
          <PlusCircle size={12} /> Adicionar
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(cj[`${plan}_features`] ?? []).map((f: string, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...LD_FIELD, flex: 1 }} value={f} onChange={e => updateFeature(plan, i, e.target.value)} />
            <button onClick={() => removeFeature(plan, i)} style={LD_DELBTN}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={LD_CARD}>
      <span style={LD_SECTION_TAG}>Planos PRO e PREMIUM — preços, taglines e features</span>
      <div style={LD_GRID2}>
        <PlanCard plan="pro" label="PRO" color="#1E3A5F" />
        <PlanCard plan="premium" label="PREMIUM" color="#7C3AED" />
      </div>
    </div>
  );
};

const LDDescontosEditor: React.FC<LDEditorProps> = ({ sectionKey: _, draft, setJson }) => {
  const cj = draft.content_json;
  return (
    <>
      <div style={LD_CARD}>
        <span style={LD_SECTION_TAG}>Cupons de desconto</span>
        <div style={LD_GRID2}>
          {/* PRO */}
          <div style={{ border: '1.5px solid #BBF7D0', borderRadius: 14, padding: 18, background: '#F0FDF4' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#16A34A', marginBottom: 14 }}>Cupom PRO</div>
            <label style={LD_LABEL}>Código</label>
            <input style={{ ...LD_FIELD, fontFamily: 'monospace', fontWeight: 800, fontSize: 17, letterSpacing: '0.06em', marginBottom: 12 }}
              value={String(cj.pro_coupon ?? '')}
              onChange={e => setJson({ pro_coupon: e.target.value.toUpperCase() })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 600 }}>
              <input type="checkbox" checked={Boolean(cj.pro_coupon_active ?? true)} onChange={e => setJson({ pro_coupon_active: e.target.checked })} />
              Ativo — exibir na landing
            </label>
          </div>
          {/* MASTER */}
          <div style={{ border: '1.5px solid #DDD6FE', borderRadius: 14, padding: 18, background: '#FAF5FF' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#7C3AED', marginBottom: 14 }}>Cupom PREMIUM</div>
            <label style={LD_LABEL}>Código</label>
            <input style={{ ...LD_FIELD, fontFamily: 'monospace', fontWeight: 800, fontSize: 17, letterSpacing: '0.06em', marginBottom: 12 }}
              value={String(cj.premium_coupon ?? '')}
              onChange={e => setJson({ premium_coupon: e.target.value.toUpperCase() })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 600 }}>
              <input type="checkbox" checked={Boolean(cj.master_coupon_active ?? true)} onChange={e => setJson({ master_coupon_active: e.target.checked })} />
              Ativo — exibir na landing
            </label>
          </div>
        </div>
      </div>
      <div style={LD_CARD}>
        <span style={LD_SECTION_TAG}>Textos de urgência</span>
        <div style={LD_GRID2}>
          <div>
            <label style={LD_LABEL}>Badge superior (barra chama)</label>
            <input style={LD_FIELD} value={String(cj.badge_label ?? '')} onChange={e => setJson({ badge_label: e.target.value })} />
          </div>
          <div>
            <label style={LD_LABEL}>Badge do relógio (48h etc)</label>
            <input style={LD_FIELD} value={String(cj.urgency_label ?? '')} onChange={e => setJson({ urgency_label: e.target.value })} />
          </div>
        </div>
      </div>
    </>
  );
};

const LDKiwifyEditor: React.FC<LDEditorProps> = ({ draft, setJson }) => {
  const cj = draft.content_json;
  const fields = [
      { key: 'pro_monthly_url', label: 'PRO Mensal' },
      { key: 'pro_annual_url', label: 'PRO Anual' },
      { key: 'premium_monthly_url', label: 'PREMIUM Mensal' },
      { key: 'premium_annual_url', label: 'PREMIUM Anual' },
      { key: 'credits_100_url', label: 'Créditos 100 (AI100)' },
      { key: 'credits_300_url', label: 'Créditos 300 (AI300)' },
      { key: 'credits_900_url', label: 'Créditos 900 (AI900)' },
  ] as const;

  return (
      <div style={LD_CARD}>
          <span style={LD_SECTION_TAG}>URLs de Checkout</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {fields.map(({ key, label }) => (
                  <div key={key}>
                      <label style={LD_LABEL}>{label}</label>
                      <input
                          style={LD_FIELD}
                          value={String(cj[key] ?? '')}
                          onChange={e => setJson({ [key]: e.target.value })}
                          placeholder="https://kiwify.app/..."
                      />
                  </div>
              ))}
          </div>
      </div>
  );
};

const LDCreditosEditor: React.FC<LDEditorProps> = ({ sectionKey: _, draft, setJson }) => {
  const packages: any[] = draft.content_json.packages ?? [];
  const updatePkg = (i: number, field: string, val: any) => setJson({ packages: packages.map((p, idx) => idx === i ? { ...p, [field]: val } : p) });
  const addPkg = () => setJson({ packages: [...packages, { id: `pkg_${Date.now()}`, credits: 100, price: 29.90, label: 'Novo pacote' }] });
  const removePkg = (i: number) => setJson({ packages: packages.filter((_, idx) => idx !== i) });

  return (
    <div style={LD_CARD}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <span style={{ ...LD_SECTION_TAG, marginBottom: 0 }}>Pacotes de créditos ({packages.length})</span>
        <button onClick={addPkg} style={LD_ADDBUTTON('#D97706')}>
          <PlusCircle size={13} /> Novo pacote
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {packages.map((pkg, i) => (
          <div key={i} style={{ border: '1.5px solid #FDE68A', borderRadius: 14, padding: '18px 20px', background: '#FFFBEB', display: 'grid', gridTemplateColumns: '130px 140px 1fr auto', gap: 14, alignItems: 'flex-end' }}>
            <div>
              <label style={LD_LABEL}>Créditos</label>
              <input type="number" style={LD_FIELD} value={pkg.credits} onChange={e => updatePkg(i, 'credits', Number(e.target.value))} />
            </div>
            <div>
              <label style={LD_LABEL}>Preço (R$)</label>
              <input type="number" step="0.01" style={LD_FIELD} value={pkg.price} onChange={e => updatePkg(i, 'price', Number(e.target.value))} />
            </div>
            <div>
              <label style={LD_LABEL}>Descrição do pacote</label>
              <input style={LD_FIELD} value={pkg.label ?? ''} onChange={e => updatePkg(i, 'label', e.target.value)} />
            </div>
            <button onClick={() => removePkg(i)} style={LD_DELBTN}><Trash2 size={14} /></button>
          </div>
        ))}
        {packages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '28px 0', color: '#94A3B8', fontSize: 14 }}>Nenhum pacote cadastrado.</div>
        )}
      </div>
    </div>
  );
};

const LDAvisosEditor: React.FC<LDEditorProps> = ({ sectionKey: _, draft, setJson }) => {
  const cj = draft.content_json;
  const updList = (field: string, i: number, val: string) => { const a = [...(cj[field] ?? [])]; a[i] = val; setJson({ [field]: a }); };
  const addList = (field: string) => setJson({ [field]: [...(cj[field] ?? []), 'Novo item'] });
  const rmList  = (field: string, i: number) => setJson({ [field]: (cj[field] ?? []).filter((_: any, idx: number) => idx !== i) });

  const ListEditor = ({ field, label, color }: { field: string; label: string; color: string }) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={{ ...LD_LABEL, marginBottom: 0 }}>{label}</label>
        <button onClick={() => addList(field)} style={LD_ADDBUTTON(color)}><PlusCircle size={12} /> Adicionar</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(cj[field] ?? []).map((item: string, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...LD_FIELD, flex: 1 }} value={item} onChange={e => updList(field, i, e.target.value)} />
            <button onClick={() => rmList(field, i)} style={LD_DELBTN}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div style={LD_CARD}>
        <span style={LD_SECTION_TAG}>Badges de urgência</span>
        <div style={LD_GRID2}>
          <div>
            <label style={LD_LABEL}>Badge superior (chama / Flame)</label>
            <input style={LD_FIELD} value={String(cj.urgency_badge ?? '')} onChange={e => setJson({ urgency_badge: e.target.value })} />
          </div>
          <div>
            <label style={LD_LABEL}>Badge do relógio (ex: 48 horas)</label>
            <input style={LD_FIELD} value={String(cj.urgency_clock ?? '')} onChange={e => setJson({ urgency_clock: e.target.value })} />
          </div>
        </div>
      </div>
      <div style={LD_CARD}>
        <span style={LD_SECTION_TAG}>Bloco de parcelamento inteligente</span>
        <div style={{ marginBottom: 14 }}>
          <label style={LD_LABEL}>Título do bloco</label>
          <input style={LD_FIELD} value={String(cj.installment_title ?? '')} onChange={e => setJson({ installment_title: e.target.value })} />
        </div>
        <ListEditor field="installment_items" label="Itens do parcelamento" color="#1D4ED8" />
      </div>
      <div style={LD_CARD}>
        <span style={LD_SECTION_TAG}>Aviso vitalício (opcional)</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 12 }}>
          <input type="checkbox" checked={Boolean(cj.lifetime_active ?? false)} onChange={e => setJson({ lifetime_active: e.target.checked })} />
          Exibir aviso de acesso vitalício na landing
        </label>
        <label style={LD_LABEL}>Texto do aviso</label>
        <input style={{ ...LD_FIELD, opacity: cj.lifetime_active ? 1 : 0.45 }} value={String(cj.lifetime_text ?? '')} disabled={!cj.lifetime_active} onChange={e => setJson({ lifetime_text: e.target.value })} />
      </div>
      <div style={LD_CARD}>
        <span style={LD_SECTION_TAG}>Selos de confiança (rodapé da seção de preços)</span>
        <ListEditor field="trust_items" label="Selos" color="#16A34A" />
      </div>
    </>
  );
};

const LDFaqEditor: React.FC<LDEditorProps> = ({ sectionKey: _, draft, setJson }) => {
  const items: { q: string; a: string }[] = draft.content_json.items ?? [];
  const upd = (i: number, field: 'q' | 'a', val: string) => setJson({ items: items.map((it, idx) => idx === i ? { ...it, [field]: val } : it) });
  const add = () => setJson({ items: [...items, { q: 'Nova pergunta?', a: 'Resposta aqui...' }] });
  const remove = (i: number) => setJson({ items: items.filter((_, idx) => idx !== i) });

  return (
    <div style={LD_CARD}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <span style={{ ...LD_SECTION_TAG, marginBottom: 0 }}>Perguntas e respostas ({items.length})</span>
        <button onClick={add} style={LD_ADDBUTTON('#7C3AED')}><PlusCircle size={13} /> Adicionar pergunta</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {items.map((item, i) => (
          <div key={i} style={{ border: '1.5px solid #E2E8F0', borderRadius: 14, padding: '18px 20px', background: '#FAFAFA' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#7C3AED', background: '#F5F3FF', padding: '3px 12px', borderRadius: 20 }}>#{i + 1}</span>
              <button onClick={() => remove(i)} style={{ display: 'flex', alignItems: 'center', gap: 5, ...LD_DELBTN, padding: '5px 12px', fontSize: 12, fontWeight: 600 }}>
                <Trash2 size={12} /> Remover
              </button>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={LD_LABEL}>Pergunta</label>
              <input style={LD_FIELD} value={item.q} onChange={e => upd(i, 'q', e.target.value)} />
            </div>
            <div>
              <label style={LD_LABEL}>Resposta</label>
              <textarea rows={3} style={{ ...LD_FIELD, resize: 'vertical' } as React.CSSProperties} value={item.a} onChange={e => upd(i, 'a', e.target.value)} />
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#94A3B8', fontSize: 14 }}>
            Sem perguntas cadastradas. Clique em "Adicionar pergunta" para começar.
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main LandingTab ──────────────────────────────────────────────────────────

const LandingTab = ({ adminUser }: { adminUser: AdminUser }) => {
  const [drafts, setDrafts]   = useState<LDDrafts>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [activeSection, setActiveSection] = useState<string>('hero');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    LandingService.getAll().then(sections => {
      const merged: LDDrafts = {};
      // seed with defaults
      Object.keys(LD_DEFAULTS).forEach(k => {
        merged[k] = { ...LD_DEFAULTS[k], content_json: { ...LD_DEFAULTS[k].content_json } };
      });
      // overlay DB data
      sections.forEach(s => {
        const k = s.section_key;
        merged[k] = {
          title:        s.title    ?? merged[k]?.title    ?? '',
          subtitle:     s.subtitle ?? merged[k]?.subtitle ?? '',
          content_json: { ...(merged[k]?.content_json ?? {}), ...(s.content_json ?? {}) },
          updated_at:   s.updated_at,
        };
      });
      setDrafts(merged);
      setLoading(false);
    });
  }, []);

  const setDraftField = (key: string, patch: Partial<LDSectionDraft>) =>
    setDrafts(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const setJson = (key: string, patch: Record<string, any>) =>
    setDrafts(prev => ({
      ...prev,
      [key]: { ...prev[key], content_json: { ...prev[key].content_json, ...patch } },
    }));

  const handleSaveAll = async () => {
    if (!['super_admin', 'operacional'].includes(adminUser.role)) { alert('Permissão negada'); return; }
    setSaving(true);
    try {
      await LandingService.saveAll(
        (Object.entries(drafts) as [string, LDSectionDraft][]).map(([key, d]) => ({
          sectionKey: key, title: d.title, subtitle: d.subtitle, contentJson: d.content_json,
        })),
        undefined,
        adminUser.name,
      );
      setSaveMsg('Publicado com sucesso!');
      setTimeout(() => setSaveMsg(null), 3500);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const activeMeta = LD_SECTIONS.find(s => s.key === activeSection)!;
  const draft      = drafts[activeSection] ?? { title: '', subtitle: '', content_json: {} };
  const makeSetJson = (k: string) => (patch: Record<string, any>) => setJson(k, patch);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 10, color: '#94A3B8' }}>
      <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> Carregando conteúdo...
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', marginBottom: 4 }}>Landing / Comercial</h2>
          <p style={{ fontSize: 14, color: '#64748B' }}>Edite títulos, preços, cupons e conteúdo sem precisar de deploy.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {saveMsg && (
            <span style={{ fontSize: 13, color: '#16A34A', fontWeight: 600, background: '#F0FDF4', padding: '8px 16px', borderRadius: 10, border: '1px solid #BBF7D0' }}>
              ✓ {saveMsg}
            </span>
          )}
          <button
            onClick={handleSaveAll} disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, background: '#0F172A', color: 'white',
              padding: '11px 24px', borderRadius: 12, fontSize: 14, fontWeight: 700,
              border: 'none', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
              boxShadow: '0 4px 16px rgba(15,23,42,0.18)', transition: 'opacity 0.2s',
            }}
          >
            {saving ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Globe size={14} />}
            Salvar e Publicar
          </button>
        </div>
      </div>

      {/* ── Layout: sidebar + editor ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>

        {/* Sidebar */}
        <nav style={{ width: 210, flexShrink: 0, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 18, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {LD_SECTIONS.map(s => {
            const isActive = activeSection === s.key;
            const Icon = s.icon;
            return (
              <button key={s.key} onClick={() => setActiveSection(s.key)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                borderRadius: 12, border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer',
                background: isActive ? s.color : 'transparent',
                color: isActive ? 'white' : '#64748B',
                fontSize: 14, fontWeight: isActive ? 700 : 500,
                transition: 'all 0.15s',
                boxShadow: isActive ? `0 4px 14px ${s.color}35` : 'none',
              }}>
                <Icon size={15} />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Editor panel */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Section header card */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 18, padding: '18px 24px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, background: `${activeMeta.color}15`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <activeMeta.icon size={19} color={activeMeta.color} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{activeMeta.label}</div>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>{activeMeta.desc}</div>
            </div>
            {draft.updated_at && (
              <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'right', flexShrink: 0 }}>
                Atualizado em<br />
                <strong style={{ color: '#64748B' }}>{new Date(draft.updated_at).toLocaleString('pt-BR')}</strong>
              </div>
            )}
          </div>

          {/* Title + Subtitle */}
          <div style={{ ...LD_CARD, marginBottom: 16 }}>
            <span style={LD_SECTION_TAG}>Textos principais da seção</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={LD_LABEL}>Título</label>
                <input style={LD_FIELD} value={draft.title} onChange={e => setDraftField(activeSection, { title: e.target.value })} />
              </div>
              <div>
                <label style={LD_LABEL}>Subtítulo / descrição</label>
                <textarea rows={2} style={{ ...LD_FIELD, resize: 'vertical' } as React.CSSProperties}
                  value={draft.subtitle}
                  onChange={e => setDraftField(activeSection, { subtitle: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Section-specific editor */}
          {activeSection === 'hero'      && <LDHeroEditor      sectionKey={activeSection} draft={draft} setJson={makeSetJson(activeSection)} />}
          {activeSection === 'planos'    && <LDPlanosEditor    sectionKey={activeSection} draft={draft} setJson={makeSetJson(activeSection)} />}
          {activeSection === 'descontos' && <LDDescontosEditor sectionKey={activeSection} draft={draft} setJson={makeSetJson(activeSection)} />}
          {activeSection === 'kiwify'    && <LDKiwifyEditor    sectionKey={activeSection} draft={draft} setJson={makeSetJson(activeSection)} />}
          {activeSection === 'creditos'  && <LDCreditosEditor  sectionKey={activeSection} draft={draft} setJson={makeSetJson(activeSection)} />}
          {activeSection === 'avisos'    && <LDAvisosEditor    sectionKey={activeSection} draft={draft} setJson={makeSetJson(activeSection)} />}
          {activeSection === 'faq'       && <LDFaqEditor       sectionKey={activeSection} draft={draft} setJson={makeSetJson(activeSection)} />}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// ============================================================================
// TAB: CONTAS DE TESTE
// ============================================================================

const TestAccountsTab = ({ adminUser }: { adminUser: AdminUser }) => {
  const [accounts, setAccounts] = useState<import('../types').TestAccountDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Create form
  const emptyForm = { name: '', responsibleName: '', email: '', password: '', planCode: 'PRO', credits: 200, expiresAt: '', observation: '' };
  const [form, setForm] = useState(emptyForm);

  // Inline actions
  const [actionRow, setActionRow] = useState<string | null>(null); // tenant_id being acted on
  const [creditAmount, setCreditAmount] = useState(50);
  const [extendDate, setExtendDate] = useState('');

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    const data = await AdminService.getTestAccountDetails();
    setAccounts(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const defaultExpiry = () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  };

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) {
      alert('Preencha nome, e-mail e senha.');
      return;
    }
    setSaving(true);
    try {
      const result = await AdminService.createTestAccountFromScratch({
        accountName: form.name,
        responsibleName: form.responsibleName || form.name,
        email: form.email,
        password: form.password,
        planCode: form.planCode,
        initialCredits: form.credits,
        expiresAt: form.expiresAt || defaultExpiry(),
        observation: form.observation,
        adminUser,
      });
      setForm(emptyForm);
      await loadAccounts();
      alert(result.message);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const handleAddCredits = async (tenantId: string) => {
    try {
      await AdminService.grantCredits(tenantId, creditAmount, 'Adição manual via painel CEO', adminUser);
      setActionRow(null);
      await loadAccounts();
      alert(`+${creditAmount} créditos adicionados.`);
    } catch (e: any) { alert(e.message); }
  };

  const handleExtend = async (tenantId: string) => {
    if (!extendDate) { alert('Selecione nova data de vencimento.'); return; }
    try {
      await AdminService.extendTestAccount(tenantId, extendDate, adminUser);
      setActionRow(null);
      await loadAccounts();
      alert('Vencimento prorrogado.');
    } catch (e: any) { alert(e.message); }
  };

  const handleDeactivate = async (tenantId: string) => {
    if (!confirm('Desativar esta conta de teste?')) return;
    try {
      await AdminService.updateTestAccountStatus(tenantId, 'suspended', adminUser);
      await loadAccounts();
    } catch (e: any) { alert(e.message); }
  };

  const inp = 'w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none';

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1">Contas de Teste</h2>
      <p className="text-gray-400 text-sm mb-6">Crie contas internas do zero, sem pagamento real.</p>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
        {/* ── Formulário ── */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 self-start">
          <h3 className="font-bold text-sm text-gray-700 mb-4 flex items-center gap-2">
            <TestTube size={16} className="text-green-600" /> Criar Conta de Teste
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nome da conta *</label>
                <input className={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Escola Modelo" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Responsável</label>
                <input className={inp} value={form.responsibleName} onChange={e => setForm({ ...form, responsibleName: e.target.value })} placeholder="Nome do responsável" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">E-mail *</label>
              <input type="email" className={inp} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="usuario@email.com" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Senha *</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} className={inp + ' pr-9'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Plano</label>
                <select className={inp} value={form.planCode} onChange={e => setForm({ ...form, planCode: e.target.value })}>
                  <option value="FREE">FREE — Starter</option>
                  <option value="PRO">PRO — Profissional</option>
                  <option value="MASTER">PREMIUM — Clínicas/Escolas</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Créditos iniciais</label>
                <input type="number" min={0} className={inp} value={form.credits} onChange={e => setForm({ ...form, credits: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Vencimento (padrão: +30 dias)</label>
              <input type="date" className={inp} value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Observação</label>
              <input className={inp} value={form.observation} onChange={e => setForm({ ...form, observation: e.target.value })} placeholder="Ex: Demo parceiro X, teste QA" />
            </div>
            <button
              onClick={handleCreate}
              disabled={saving || !form.name || !form.email || !form.password}
              className="w-full bg-green-600 text-white py-2 rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <PlusCircle size={14} />} Criar Conta
            </button>
          </div>
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs text-amber-700 font-medium">⚠️ Cria tenant + usuário + assinatura INTERNAL_TEST do zero. Sem cobrança real.</p>
          </div>
        </div>

        {/* ── Listagem ── */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 font-bold text-sm text-gray-700 flex items-center justify-between">
              Contas de Teste
              <button onClick={loadAccounts} className="p-1 hover:bg-gray-100 rounded text-gray-400"><RefreshCw size={13} /></button>
            </div>
            {loading ? (
              <div className="p-6 text-center text-gray-400 text-sm">Carregando...</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {accounts.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">Nenhuma conta de teste.</div>
                ) : accounts.map(acc => (
                  <div key={acc.tenant_id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-900 text-sm">{acc.account_name}</span>
                          <Badge color={PLAN_COLOR[acc.plan_code] ?? 'gray'}>{acc.plan_code}</Badge>
                          <Badge color={acc.status === 'active' ? 'green' : acc.status === 'suspended' ? 'red' : 'gray'}>
                            {acc.status === 'active' ? 'Ativa' : acc.status === 'suspended' ? 'Suspensa' : 'Expirada'}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{acc.email}</p>
                        <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                          <span>Créditos: <strong className="text-gray-700">{acc.credits_remaining}/{acc.initial_credits}</strong></span>
                          {acc.expires_at && <span>Vence: <strong className="text-gray-700">{new Date(acc.expires_at).toLocaleDateString('pt-BR')}</strong></span>}
                          {acc.observation && <span className="truncate max-w-[160px]" title={acc.observation}>{acc.observation}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          title="Adicionar créditos"
                          onClick={() => { setActionRow(actionRow === acc.tenant_id + '_credits' ? null : acc.tenant_id + '_credits'); }}
                          className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition"
                        ><CreditCard size={14} /></button>
                        <button
                          title="Prorrogar"
                          onClick={() => { setActionRow(actionRow === acc.tenant_id + '_extend' ? null : acc.tenant_id + '_extend'); setExtendDate(''); }}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition"
                        ><RefreshCw size={14} /></button>
                        {acc.status === 'active' && (
                          <button
                            title="Desativar"
                            onClick={() => handleDeactivate(acc.tenant_id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition"
                          ><XCircle size={14} /></button>
                        )}
                      </div>
                    </div>

                    {/* Painel: Adicionar créditos */}
                    {actionRow === acc.tenant_id + '_credits' && (
                      <div className="mt-3 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                        <span className="text-xs text-green-700 font-medium shrink-0">+ Créditos:</span>
                        <input type="number" min={1} className="border rounded-lg px-2 py-1 text-sm w-20" value={creditAmount} onChange={e => setCreditAmount(Number(e.target.value))} />
                        <button onClick={() => handleAddCredits(acc.tenant_id)} className="bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-green-700 transition">Adicionar</button>
                        <button onClick={() => setActionRow(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
                      </div>
                    )}

                    {/* Painel: Prorrogar */}
                    {actionRow === acc.tenant_id + '_extend' && (
                      <div className="mt-3 flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                        <span className="text-xs text-blue-700 font-medium shrink-0">Nova data:</span>
                        <input type="date" className="border rounded-lg px-2 py-1 text-sm" value={extendDate} onChange={e => setExtendDate(e.target.value)} />
                        <button onClick={() => handleExtend(acc.tenant_id)} className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-blue-700 transition">Prorrogar</button>
                        <button onClick={() => setActionRow(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// TAB: ADMINS (RBAC)
// ============================================================================

const AdminsTab = ({ adminUser, setAdminUser }: { adminUser: AdminUser; setAdminUser: (u: AdminUser) => void }) => {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'viewer' as AdminRole });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setAdmins(await AdminService.getAdmins());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name || !form.email) { alert('Preencha nome e e-mail.'); return; }
    setSaving(true);
    try {
      await AdminService.createAdmin({ ...form, active: true }, adminUser);
      setShowForm(false);
      setForm({ name: '', email: '', role: 'viewer' });
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (adm: AdminUser) => {
    try {
      await AdminService.toggleAdminActive(adm.id, !adm.active, adminUser);
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const ROLE_COLORS: Record<string, string> = {
    super_admin: 'bg-red-100 text-red-700',
    financeiro: 'bg-green-100 text-green-700',
    operacional: 'bg-blue-100 text-blue-700',
    comercial: 'bg-orange-100 text-orange-700',
    suporte: 'bg-cyan-100 text-cyan-700',
    auditoria: 'bg-yellow-100 text-yellow-700',
    viewer: 'bg-gray-100 text-gray-600',
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Gestão de Administradores</h2>
          <p className="text-gray-400 text-sm">Controle de acesso ao painel CEO (RBAC).</p>
        </div>
        {adminUser.role === 'super_admin' && (
          <button onClick={() => setShowForm(!showForm)} className="bg-gray-900 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-gray-800 transition">
            <PlusCircle size={16} /> Novo Admin
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <h3 className="font-bold text-sm mb-4 text-gray-700">Novo Administrador</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nome</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">E-mail</label>
              <input type="email" className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Perfil</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as AdminRole })}>
                <option value="super_admin">Super Admin — Acesso total</option>
                <option value="financeiro">Financeiro — Planos e KPIs</option>
                <option value="operacional">Operacional — Assinantes e créditos</option>
                <option value="comercial">Comercial — Visualização e relatórios comerciais</option>
                <option value="suporte">Suporte — Atendimento a assinantes</option>
                <option value="auditoria">Auditoria — Acesso a logs e trilha</option>
                <option value="viewer">Viewer — Somente leitura</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 justify-end mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button onClick={handleCreate} disabled={saving} className="bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-gray-800 disabled:opacity-50 transition">
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <PlusCircle size={14} />} Criar
            </button>
          </div>
        </div>
      )}

      {/* Simulador de role (demo) */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
        <AlertTriangle size={16} className="text-amber-600 shrink-0" />
        <div className="flex items-center gap-3 flex-1">
          <p className="text-sm text-amber-700 font-medium">Simular perfil:</p>
          <select
            className="border border-amber-300 rounded-lg px-2 py-1 text-xs bg-white"
            value={adminUser.role}
            onChange={e => setAdminUser({ ...adminUser, role: e.target.value as AdminRole })}
          >
            <option value="super_admin">Super Admin</option>
            <option value="financeiro">Financeiro</option>
            <option value="operacional">Operacional</option>
            <option value="comercial">Comercial</option>
            <option value="suporte">Suporte</option>
            <option value="auditoria">Auditoria</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
      </div>

      {loading ? <div className="text-gray-400 text-sm">Carregando...</div> : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
              <tr>
                <th className="px-5 py-3 text-left">Admin</th>
                <th className="px-5 py-3 text-left">Perfil</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Criado em</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {admins.map(adm => (
                <tr key={adm.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-sm">{adm.name.charAt(0)}</div>
                      <div>
                        <p className="font-bold text-gray-900">{adm.name}</p>
                        <p className="text-xs text-gray-400">{adm.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${ROLE_COLORS[adm.role]}`}>{adm.role.replace('_', ' ')}</span>
                  </td>
                  <td className="px-5 py-3">
                    {adm.active
                      ? <span className="flex items-center gap-1 text-green-600 text-xs font-bold"><CheckCircle size={12} /> Ativo</span>
                      : <span className="flex items-center gap-1 text-gray-400 text-xs font-bold"><XCircle size={12} /> Inativo</span>}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400">{new Date(adm.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td className="px-5 py-3 text-right">
                    {adminUser.role === 'super_admin' && adm.id !== adminUser.id && (
                      <button onClick={() => handleToggleActive(adm)} className={`px-2 py-1 text-xs font-bold rounded-lg transition ${adm.active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                        {adm.active ? 'Desativar' : 'Reativar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// TAB: USER LOGS (Atividade dos Usuários)
// ============================================================================

const UserLogsTab = () => {
  const [logs, setLogs] = useState<UserActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterDays, setFilterDays] = useState('30');
  const [searchUser, setSearchUser] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await AdminService.getUserActivityLogs({
        days: filterDays === 'all' ? undefined : Number(filterDays)
      });
      setLogs(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [filterDays]);

  useEffect(() => { load(); }, [load]);

  const ACTION_COLORS: Record<string, string> = {
    LOGIN: 'bg-blue-100 text-blue-700',
    AI_REQUEST: 'bg-purple-100 text-purple-700',
    DOCUMENT_GENERATED: 'bg-green-100 text-green-700',
    CREDIT_CONSUMED: 'bg-orange-100 text-orange-700',
    STUDENT_CREATED: 'bg-teal-100 text-teal-700',
  };

  const allActions = Array.from(new Set(logs.map(l => l.action))).sort();

  const filtered = logs.filter(l => {
    const matchAction = !filterAction || l.action === filterAction;
    const matchUser = !searchUser ||
      (l.user_name || '').toLowerCase().includes(searchUser.toLowerCase()) ||
      (l.user_email || '').toLowerCase().includes(searchUser.toLowerCase()) ||
      (l.tenant_id || '').toLowerCase().includes(searchUser.toLowerCase());
    return matchAction && matchUser;
  });

  const exportCSV = () => {
    const rows = [['Data/Hora', 'Usuário', 'E-mail', 'Ação', 'Recurso', 'Detalhes']];
    filtered.forEach(l => rows.push([
      new Date(l.created_at).toLocaleString('pt-BR'),
      l.user_name || '', l.user_email || '', l.action, l.resource_type || '',
      typeof l.details === 'object' && l.details !== null ? JSON.stringify(l.details) : String(l.details || '')
    ]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + csv);
    a.download = `user_activity_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Atividade dos Usuários</h2>
          <p className="text-gray-400 text-sm">Monitoramento de ações realizadas pelos assinantes no sistema.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              className="pl-9 pr-3 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-gray-300"
              placeholder="Buscar usuário..."
              value={searchUser}
              onChange={e => setSearchUser(e.target.value)}
            />
          </div>
          <select className="border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300" value={filterDays} onChange={e => setFilterDays(e.target.value)}>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="all">Todos</option>
          </select>
          <select className="border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
            <option value="">Todas as ações</option>
            {allActions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={exportCSV} className="px-3 py-2 text-sm border rounded-xl hover:bg-gray-50 flex items-center gap-1.5 text-gray-600">
            <FileText size={14} /> CSV
          </button>
          <button onClick={load} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500"><RefreshCw size={15} /></button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Carregando logs...</div>
      ) : (
        <>
          <div className="mb-2 text-xs text-gray-400">{filtered.length} registros exibidos</div>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
                <tr>
                  <th className="px-5 py-3 text-left">Data/Hora</th>
                  <th className="px-5 py-3 text-left">Usuário</th>
                  <th className="px-5 py-3 text-left">Ação</th>
                  <th className="px-5 py-3 text-left">Recurso</th>
                  <th className="px-5 py-3 text-left">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                    <td className="px-5 py-3">
                      <p className="font-bold text-gray-800 text-xs">{log.user_name || '—'}</p>
                      <p className="text-[10px] text-gray-400">{log.user_email || '—'}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-600'}`}>{log.action}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">{log.resource_type || '—'}</td>
                    <td className="px-5 py-3 text-xs text-gray-500 max-w-xs truncate" title={typeof log.details === 'object' && log.details !== null ? JSON.stringify(log.details) : String(log.details || '—')}>
                      {typeof log.details === 'object' && log.details !== null ? JSON.stringify(log.details) : String(log.details || '—')}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Nenhuma ação registrada no período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================================
// TAB: LOGS
// ============================================================================

const LogsTab = () => {
  const [logs, setLogs] = useState<AdminAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterDays, setFilterDays] = useState('30');
  const [filterAdmin, setFilterAdmin] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setLogs(await getAdminAuditLog(500)); } catch { /**/ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const ACTION_COLORS: Record<string, string> = {
    checkout_change:    'bg-blue-100 text-blue-700',
    grant_credits:      'bg-purple-100 text-purple-700',
    update_plan:        'bg-indigo-100 text-indigo-700',
    suspend:            'bg-red-100 text-red-700',
    reactivate:         'bg-green-100 text-green-700',
    grant_courtesy:     'bg-amber-100 text-amber-700',
    create_admin:       'bg-gray-100 text-gray-700',
    create_test_account:'bg-teal-100 text-teal-700',
    coupon_create:      'bg-pink-100 text-pink-700',
    coupon_edit:        'bg-orange-100 text-orange-700',
    activate_plan:      'bg-green-100 text-green-700',
    deactivate_plan:    'bg-red-100 text-red-700',
    site_update:        'bg-sky-100 text-sky-700',
  };

  const allActions = Array.from(new Set(logs.map(l => l.action_type))).sort();

  const cutoff = filterDays === 'all' ? null : new Date(Date.now() - Number(filterDays) * 86400000);
  const filtered = logs.filter(l => {
    const matchAction = !filterAction || l.action_type === filterAction;
    const matchDate = !cutoff || new Date(l.created_at) >= cutoff;
    const matchAdmin = !filterAdmin || l.admin_name.toLowerCase().includes(filterAdmin.toLowerCase());
    return matchAction && matchDate && matchAdmin;
  });

  const exportCSV = () => {
    const rows = [['Data/Hora', 'Admin', 'Role', 'Ação', 'Tipo Alvo', 'ID Alvo', 'Nome Alvo', 'Descrição']];
    filtered.forEach(l => rows.push([
      new Date(l.created_at).toLocaleString('pt-BR'),
      l.admin_name, l.admin_role ?? '', l.action_type,
      l.target_type ?? '', l.target_id ?? '', l.target_name ?? '',
      l.description ?? '',
    ]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + csv);
    a.download = `audit_log_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Auditoria Admin</h2>
          <p className="text-gray-400 text-sm">Trilha persistente de todas as ações administrativas (banco de dados).</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              className="pl-9 pr-3 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-gray-300"
              placeholder="Buscar admin..."
              value={filterAdmin}
              onChange={e => setFilterAdmin(e.target.value)}
            />
          </div>
          <select className="border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300" value={filterDays} onChange={e => setFilterDays(e.target.value)}>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="all">Todos</option>
          </select>
          <select className="border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
            <option value="">Todas as ações</option>
            {allActions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={exportCSV} className="px-3 py-2 text-sm border rounded-xl hover:bg-gray-50 flex items-center gap-1.5 text-gray-600">
            <FileText size={14} /> CSV
          </button>
          <button onClick={load} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500"><RefreshCw size={15} /></button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Carregando logs...</div>
      ) : (
        <>
          <div className="mb-2 text-xs text-gray-400">{filtered.length} registros exibidos</div>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
                <tr>
                  <th className="px-5 py-3 text-left">Data/Hora</th>
                  <th className="px-5 py-3 text-left">Admin</th>
                  <th className="px-5 py-3 text-left">Ação</th>
                  <th className="px-5 py-3 text-left">Alvo</th>
                  <th className="px-5 py-3 text-left">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                    <td className="px-5 py-3 text-xs">
                      <span className="font-bold text-gray-800">{log.admin_name}</span>
                      {log.admin_role && <span className="ml-1 text-gray-400">({log.admin_role})</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${ACTION_COLORS[log.action_type] ?? 'bg-gray-100 text-gray-600'}`}>{log.action_type}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500 truncate max-w-[140px]">
                      {log.target_name ?? log.target_id ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500 max-w-xs truncate">{log.description ?? '—'}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Nenhuma ação registrada no período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================================
// ============================================================================
// TAB: KIWIFY PRODUCTS
// ============================================================================

const KiwifyProductsTab = ({ adminUser }: { adminUser: AdminUser }) => {
  const [products, setProducts]         = useState<KiwifyProduct[]>([]);
  const [purchases, setPurchases]       = useState<KiwifyPurchaseRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [loadError, setLoadError]       = useState<string | null>(null);
  const [editing, setEditing]           = useState<Partial<KiwifyProduct> | null>(null);
  const [saving, setSaving]             = useState(false);
  const [reconciling, setReconciling]   = useState(false);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult[] | null>(null);
  const [alertExpanded, setAlertExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [prods, purcs] = await Promise.all([
        getKiwifyProducts(),
        getKiwifyPurchases(),
      ]);
      setProducts(prods);
      setPurchases(purcs);
    } catch (e: any) {
      setLoadError(e?.message ?? 'Erro ao carregar produtos Kiwify. Verifique RLS e a migration 20260510000001.');
      console.error('[CEO Kiwify] Erro ao carregar:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!editing?.kiwify_product_id) return;
    setSaving(true);
    try {
      await upsertKiwifyProduct(editing as KiwifyProduct, adminUser);
      setEditing(null);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const handleReconcile = async () => {
    if (!confirm('Reprocessar todas as compras aprovadas não ativadas?\n\nIsso ativará automaticamente os planos de usuários que já têm conta no sistema. Não pode ser desfeito.')) return;
    setReconciling(true);
    setReconcileResult(null);
    try {
      const result = await reconcilePendingPurchases();
      setReconcileResult(result);
      await load();
    } catch (e: any) {
      alert('Erro na reconciliação: ' + e.message);
    } finally {
      setReconciling(false);
    }
  };

  const alerts = computeKiwifyAlerts(purchases);
  const totalAlerts = alerts.noAccount.length + alerts.notActivated.length + alerts.unknownProduct.length;

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none';

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Produtos Kiwify</h2>
          <p className="text-gray-400 text-sm">
            Gerencie links, preços e destaques dos produtos.
            {totalAlerts > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 font-bold rounded text-xs">
                {totalAlerts} {totalAlerts === 1 ? 'alerta' : 'alertas'}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReconcile}
            disabled={reconciling || (alerts.noAccount.length === 0 && alerts.notActivated.length === 0)}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition"
          >
            <RotateCcw size={14} className={reconciling ? 'animate-spin' : ''} />
            {reconciling ? 'Reconciliando...' : 'Reconciliar compras'}
          </button>
          <button onClick={load} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500"><RefreshCw size={15} /></button>
        </div>
      </div>

      {/* Resultado da reconciliação */}
      {reconcileResult !== null && (
        <div className="mb-6 bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={16} className="text-green-600" />
            <h3 className="font-bold text-gray-800">Resultado da reconciliação ({reconcileResult.length} compras processadas)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 font-bold uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Plano</th>
                  <th className="px-4 py-2 text-left">Tenant</th>
                  <th className="px-4 py-2 text-left">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reconcileResult.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2 font-mono">{r.purchase_email}</td>
                    <td className="px-4 py-2 font-bold">{r.purchase_plan ?? '—'}</td>
                    <td className="px-4 py-2 font-mono text-[10px]">{r.found_tenant_id ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        r.result_action === 'activated'     ? 'bg-green-100 text-green-700' :
                        r.result_action === 'no_account_yet' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {r.result_action === 'activated'      ? 'ATIVADO' :
                         r.result_action === 'no_account_yet' ? 'SEM CONTA' :
                         r.result_action}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => setReconcileResult(null)} className="mt-3 text-xs text-gray-400 hover:text-gray-600 underline">Fechar resultado</button>
        </div>
      )}

      {/* Painel de Alertas de Compras */}
      {!loading && totalAlerts > 0 && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">

          {/* Alerta 1: Sem conta */}
          {alerts.noAccount.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-2xl font-black text-red-700">{alerts.noAccount.length}</p>
                  <p className="text-xs font-bold text-red-600 mt-0.5">Aprovadas sem conta</p>
                  <p className="text-[10px] text-red-500 mt-1">Pagou mas não criou conta no sistema</p>
                </div>
                <AlertTriangle size={20} className="text-red-500 shrink-0" />
              </div>
              <button
                onClick={() => setAlertExpanded(alertExpanded === 'noAccount' ? null : 'noAccount')}
                className="mt-3 text-xs text-red-600 font-bold underline"
              >
                {alertExpanded === 'noAccount' ? 'Ocultar' : 'Ver lista'}
              </button>
              {alertExpanded === 'noAccount' && (
                <div className="mt-2 space-y-1.5">
                  {alerts.noAccount.map(p => {
                    const { whatsappUrl, text, signupUrl } = buildPendingAccountInstructions(p);
                    return (
                      <div key={p.id} className="bg-white rounded-lg px-3 py-2 border border-red-100">
                        <p className="text-xs font-mono font-bold text-gray-800">{p.email}</p>
                        <p className="text-[10px] text-gray-500 mb-1.5">{p.plan_code ?? '—'} · {p.paid_at ? new Date(p.paid_at).toLocaleDateString('pt-BR') : '—'}</p>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => { navigator.clipboard.writeText(p.email); }}
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
                            title="Copiar e-mail"
                          >
                            <Copy size={10} /> Copiar e-mail
                          </button>
                          <button
                            onClick={() => { navigator.clipboard.writeText(text); }}
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 transition"
                            title="Copiar instruções"
                          >
                            <Copy size={10} /> Copiar instruções
                          </button>
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 hover:bg-green-100 text-green-700 transition"
                            title="Enviar via WhatsApp"
                          >
                            <Share2 size={10} /> WhatsApp
                          </a>
                          <a
                            href={signupUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-gray-50 hover:bg-gray-100 text-gray-600 transition"
                            title="Link de cadastro"
                          >
                            <ExternalLink size={10} /> Link cadastro
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Alerta 2: Não ativadas (tem tenant mas activated_at nulo) */}
          {alerts.notActivated.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-2xl font-black text-orange-700">{alerts.notActivated.length}</p>
                  <p className="text-xs font-bold text-orange-600 mt-0.5">Aprovadas não ativadas</p>
                  <p className="text-[10px] text-orange-500 mt-1">Webhook falhou ao ativar — use Reconciliar</p>
                </div>
                <AlertCircle size={20} className="text-orange-500 shrink-0" />
              </div>
              <button
                onClick={() => setAlertExpanded(alertExpanded === 'notActivated' ? null : 'notActivated')}
                className="mt-3 text-xs text-orange-600 font-bold underline"
              >
                {alertExpanded === 'notActivated' ? 'Ocultar' : 'Ver lista'}
              </button>
              {alertExpanded === 'notActivated' && (
                <div className="mt-2 space-y-1.5">
                  {alerts.notActivated.map(p => (
                    <div key={p.id} className="bg-white rounded-lg px-3 py-2 border border-orange-100">
                      <p className="text-xs font-mono font-bold text-gray-800">{p.email}</p>
                      <p className="text-[10px] text-gray-500">{p.plan_code ?? '—'} · {p.paid_at ? new Date(p.paid_at).toLocaleDateString('pt-BR') : '—'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Alerta 3: Produto UNKNOWN */}
          {alerts.unknownProduct.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-2xl font-black text-purple-700">{alerts.unknownProduct.length}</p>
                  <p className="text-xs font-bold text-purple-600 mt-0.5">Produto UNKNOWN</p>
                  <p className="text-[10px] text-purple-500 mt-1">product_key não reconhecido pelo webhook</p>
                </div>
                <Package size={20} className="text-purple-500 shrink-0" />
              </div>
              <button
                onClick={() => setAlertExpanded(alertExpanded === 'unknown' ? null : 'unknown')}
                className="mt-3 text-xs text-purple-600 font-bold underline"
              >
                {alertExpanded === 'unknown' ? 'Ocultar' : 'Ver lista'}
              </button>
              {alertExpanded === 'unknown' && (
                <div className="mt-2 space-y-1.5">
                  {alerts.unknownProduct.map(p => (
                    <div key={p.id} className="bg-white rounded-lg px-3 py-2 border border-purple-100">
                      <p className="text-xs font-mono font-bold text-gray-800">{p.email}</p>
                      <p className="text-[10px] text-gray-500">{p.provider_order_id ?? p.id} · {p.paid_at ? new Date(p.paid_at).toLocaleDateString('pt-BR') : '—'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}
      {!loading && totalAlerts === 0 && purchases.length > 0 && (
        <div className="mb-6 flex items-center gap-2 text-green-600 text-sm font-bold">
          <CheckCircle size={16} /> Todas as compras aprovadas estão ativadas corretamente.
        </div>
      )}

      {/* Form de edição */}
      {editing && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-4">{editing.id ? `Editar: ${editing.product_name}` : 'Novo Produto'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">ID Kiwify (único)</label>
              <input className={inp + ' font-mono'} value={editing.kiwify_product_id ?? ''} onChange={e => setEditing({ ...editing, kiwify_product_id: e.target.value })} placeholder="pro_monthly" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Nome do Produto</label>
              <input className={inp} value={editing.product_name ?? ''} onChange={e => setEditing({ ...editing, product_name: e.target.value })} placeholder="Plano PRO Mensal" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Tipo</label>
              <select className={inp} value={editing.product_type ?? 'subscription'} onChange={e => setEditing({ ...editing, product_type: e.target.value as any })}>
                <option value="subscription">Assinatura</option>
                <option value="credits">Créditos avulsos</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Plano (PRO / MASTER)</label>
              <input className={inp + ' uppercase'} value={editing.plan_code ?? ''} onChange={e => setEditing({ ...editing, plan_code: e.target.value.toUpperCase() || null })} placeholder="PRO ou MASTER" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Ciclo</label>
              <select className={inp} value={editing.billing_cycle ?? ''} onChange={e => setEditing({ ...editing, billing_cycle: (e.target.value || null) as any })}>
                <option value="">— nenhum —</option>
                <option value="monthly">Mensal</option>
                <option value="annual">Anual</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Preço (R$)</label>
              <input type="number" className={inp} value={editing.price_brl ?? 0} onChange={e => setEditing({ ...editing, price_brl: Number(e.target.value) })} />
            </div>
            {editing.product_type === 'credits' && (
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Quantidade de créditos</label>
                <input type="number" className={inp} value={editing.credits_amount ?? 0} onChange={e => setEditing({ ...editing, credits_amount: Number(e.target.value) })} />
              </div>
            )}
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-500 mb-1">URL de Checkout</label>
              <input className={inp + ' font-mono text-xs'} value={editing.checkout_url ?? ''} onChange={e => setEditing({ ...editing, checkout_url: e.target.value })} placeholder="https://pay.kiwify.com.br/..." />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Badge (ex: Mais Popular)</label>
              <input className={inp} value={editing.badge_text ?? ''} onChange={e => setEditing({ ...editing, badge_text: e.target.value || null })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Nota comercial</label>
              <input className={inp} value={editing.commercial_note ?? ''} onChange={e => setEditing({ ...editing, commercial_note: e.target.value || null })} />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-bold text-gray-600">Ativo</label>
              <input type="checkbox" checked={editing.is_active ?? true} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-bold text-gray-600">Destaque</label>
              <input type="checkbox" checked={editing.is_featured ?? false} onChange={e => setEditing({ ...editing, is_featured: e.target.checked })} className="w-4 h-4" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} disabled={saving} className="bg-gray-900 text-white px-5 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-gray-800 disabled:opacity-50">
              <Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button onClick={() => setEditing(null)} className="border border-gray-200 px-4 py-2 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loadError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <strong>Erro ao carregar produtos Kiwify:</strong> {loadError}
            <div className="mt-1 text-xs text-red-500">
              Verifique se a migration <code>20260510000001_profiles_phone_cpf.sql</code> foi aplicada (adiciona RLS de leitura para <code>kiwify_products</code>).
            </div>
          </div>
        </div>
      )}

      {loading ? <div className="text-gray-400 text-sm">Carregando produtos...</div> : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
              <tr>
                <th className="px-5 py-3 text-left">Produto</th>
                <th className="px-5 py-3 text-left">Tipo / Ciclo</th>
                <th className="px-5 py-3 text-left">Preço</th>
                <th className="px-5 py-3 text-left">URL Checkout</th>
                <th className="px-5 py-3 text-center">Ativo</th>
                <th className="px-5 py-3 text-center">Destaque</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3">
                    <p className="font-bold text-gray-900">{p.product_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{p.kiwify_product_id}</p>
                    {p.badge_text && <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">{p.badge_text}</span>}
                  </td>
                  <td className="px-5 py-3">
                    <Badge color={p.product_type === 'subscription' ? 'blue' : 'yellow'}>
                      {p.product_type === 'subscription' ? 'Assinatura' : 'Créditos'}
                    </Badge>
                    {p.billing_cycle && (
                      <p className="text-xs text-gray-400 mt-0.5">{p.billing_cycle === 'monthly' ? 'Mensal' : 'Anual'}</p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-bold text-gray-900">R$ {Number(p.price_brl).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    {p.product_type === 'credits' && p.credits_amount > 0 && (
                      <p className="text-xs text-gray-400">{p.credits_amount} créditos</p>
                    )}
                  </td>
                  <td className="px-5 py-3 max-w-xs">
                    {p.checkout_url && p.checkout_url !== '#' ? (
                      <div className="flex items-center gap-1.5">
                        <a href={p.checkout_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline font-mono truncate max-w-[180px]">
                          {p.checkout_url.replace('https://', '')}
                        </a>
                        <button onClick={() => { navigator.clipboard.writeText(p.checkout_url); }} className="text-gray-400 hover:text-gray-600 shrink-0">
                          <Copy size={12} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-red-500 font-semibold">⚠ Sem URL</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`w-2.5 h-2.5 rounded-full inline-block ${p.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </td>
                  <td className="px-5 py-3 text-center">
                    {p.is_featured && <span className="text-amber-500 font-bold text-xs">★</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => setEditing({ ...p })} className="px-3 py-1.5 text-xs font-bold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-1 ml-auto">
                      <Edit3 size={11} /> Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// TAB: CUPONS & CAMPANHAS
// ============================================================================

const EMPTY_COUPON: Partial<CeoCoupon> = {
  code: '', description: '', campaign_name: '', plan_code: undefined,
  billing_cycle: undefined, discount_type: 'percentage', discount_value: 0,
  checkout_url_override: '', valid_until: undefined, max_uses: undefined,
  is_active: true,
};

const CouponsTab = ({ adminUser }: { adminUser: AdminUser }) => {
  const [coupons, setCoupons] = useState<CeoCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<CeoCoupon> | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCoupons(await getCoupons()); } catch { /**/ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!editing?.code?.trim()) return alert('Código é obrigatório.');
    setSaving(true);
    try {
      await upsertCoupon(editing as CeoCoupon & { code: string }, adminUser);
      setEditing(null);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const handleToggle = async (c: CeoCoupon) => {
    try {
      await toggleCoupon(c.id, c.code, !c.is_active, adminUser);
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const handleDelete = async (c: CeoCoupon) => {
    if (!confirm(`Remover o cupom "${c.code}"?`)) return;
    try {
      await deleteCoupon(c.id, c.code, adminUser);
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const handleCopyLink = (c: CeoCoupon) => {
    const { link } = buildCouponShareLink(c);
    navigator.clipboard.writeText(link);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none';

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Cupons &amp; Campanhas</h2>
          <p className="text-gray-400 text-sm">Crie, ative e distribua cupons com link pronto.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing({ ...EMPTY_COUPON })} className="bg-gray-900 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-gray-800">
            <PlusCircle size={14} /> Novo Cupom
          </button>
          <button onClick={load} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500"><RefreshCw size={15} /></button>
        </div>
      </div>

      {/* Form de criação/edição */}
      {editing && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-4">{editing.id ? `Editar: ${editing.code}` : 'Novo Cupom'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Código *</label>
              <input className={inp + ' uppercase font-mono font-bold tracking-widest'} value={editing.code ?? ''} onChange={e => setEditing({ ...editing, code: e.target.value.toUpperCase() })} placeholder="INCLUIAI59" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Campanha</label>
              <input className={inp} value={editing.campaign_name ?? ''} onChange={e => setEditing({ ...editing, campaign_name: e.target.value })} placeholder="Grupo WhatsApp Abril" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Plano</label>
              <select className={inp} value={editing.plan_code ?? ''} onChange={e => setEditing({ ...editing, plan_code: e.target.value || undefined })}>
                <option value="">Qualquer plano</option>
                <option value="PRO">PRO</option>
                <option value="MASTER">PREMIUM (MASTER)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Ciclo</label>
              <select className={inp} value={editing.billing_cycle ?? ''} onChange={e => setEditing({ ...editing, billing_cycle: (e.target.value || undefined) as any })}>
                <option value="">Qualquer ciclo</option>
                <option value="monthly">Mensal</option>
                <option value="annual">Anual</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Tipo de desconto</label>
              <select className={inp} value={editing.discount_type ?? 'percentage'} onChange={e => setEditing({ ...editing, discount_type: e.target.value as any })}>
                <option value="percentage">Percentual (%)</option>
                <option value="fixed">Valor fixo (R$)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">
                {editing.discount_type === 'fixed' ? 'Valor (R$)' : 'Desconto (%)'}
              </label>
              <input type="number" className={inp} value={editing.discount_value ?? 0} onChange={e => setEditing({ ...editing, discount_value: Number(e.target.value) })} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-500 mb-1">URL de Checkout com cupom (Kiwify)</label>
              <input className={inp + ' font-mono text-xs'} value={editing.checkout_url_override ?? ''} onChange={e => setEditing({ ...editing, checkout_url_override: e.target.value || undefined })} placeholder="https://pay.kiwify.com.br/...?coupon=INCLUIAI59" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Válido até</label>
              <input type="date" className={inp} value={editing.valid_until ? editing.valid_until.slice(0, 10) : ''} onChange={e => setEditing({ ...editing, valid_until: e.target.value || undefined })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Limite de usos (vazio = ilimitado)</label>
              <input type="number" className={inp} value={editing.max_uses ?? ''} onChange={e => setEditing({ ...editing, max_uses: e.target.value ? Number(e.target.value) : undefined })} placeholder="ex: 100" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-500 mb-1">Descrição interna</label>
              <input className={inp} value={editing.description ?? ''} onChange={e => setEditing({ ...editing, description: e.target.value })} placeholder="Cupom para campanha de lançamento" />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-bold text-gray-600">Ativo</label>
              <input type="checkbox" checked={editing.is_active ?? true} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} className="w-4 h-4" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} disabled={saving} className="bg-gray-900 text-white px-5 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-gray-800 disabled:opacity-50">
              <Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button onClick={() => setEditing(null)} className="border border-gray-200 px-4 py-2 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? <div className="text-gray-400 text-sm">Carregando cupons...</div> : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
              <tr>
                <th className="px-5 py-3 text-left">Código</th>
                <th className="px-5 py-3 text-left">Plano / Ciclo</th>
                <th className="px-5 py-3 text-left">Desconto</th>
                <th className="px-5 py-3 text-left">Campanha</th>
                <th className="px-5 py-3 text-left">Validade</th>
                <th className="px-5 py-3 text-center">Usos</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {coupons.map(c => {
                const { waUrl, link } = buildCouponShareLink(c);
                const expired = c.valid_until ? new Date(c.valid_until) < new Date() : false;
                return (
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <span className="font-mono font-extrabold tracking-widest text-gray-900">{c.code}</span>
                      {c.description && <p className="text-xs text-gray-400 mt-0.5">{c.description}</p>}
                    </td>
                    <td className="px-5 py-3">
                      {c.plan_code ? <Badge color={c.plan_code === 'PRO' ? 'blue' : 'purple'}>{c.plan_code}</Badge> : <span className="text-xs text-gray-400">Qualquer</span>}
                      {c.billing_cycle && <p className="text-xs text-gray-400 mt-0.5">{c.billing_cycle === 'annual' ? 'Anual' : 'Mensal'}</p>}
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-bold text-green-700">
                        {c.discount_type === 'percentage' ? `${c.discount_value}%` : `R$ ${c.discount_value}`}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">{c.campaign_name ?? '—'}</td>
                    <td className="px-5 py-3">
                      {c.valid_until ? (
                        <span className={`text-xs font-semibold ${expired ? 'text-red-500' : 'text-gray-600'}`}>
                          {expired ? '⚠ ' : ''}{new Date(c.valid_until).toLocaleDateString('pt-BR')}
                        </span>
                      ) : <span className="text-xs text-gray-400">Sem expiração</span>}
                    </td>
                    <td className="px-5 py-3 text-center text-xs font-bold text-gray-600 tabular-nums">
                      {c.uses_count}{c.max_uses ? `/${c.max_uses}` : ''}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => handleToggle(c)} className="flex items-center gap-1 mx-auto text-xs font-bold">
                        {c.is_active
                          ? <><ToggleRight size={18} className="text-green-500" /><span className="text-green-700">Ativo</span></>
                          : <><ToggleLeft size={18} className="text-gray-400" /><span className="text-gray-500">Inativo</span></>
                        }
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setEditing({ ...c })} className="px-2 py-1 text-xs font-bold bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1">
                          <Edit3 size={10} /> Editar
                        </button>
                        <button onClick={() => handleCopyLink(c)} className={`px-2 py-1 text-xs font-bold rounded flex items-center gap-1 ${copiedId === c.id ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                          <Copy size={10} /> {copiedId === c.id ? 'Copiado!' : 'Link'}
                        </button>
                        <a href={waUrl} target="_blank" rel="noopener noreferrer" className="px-2 py-1 text-xs font-bold bg-green-50 text-green-700 rounded hover:bg-green-100 flex items-center gap-1">
                          <Share2 size={10} /> WA
                        </a>
                        <button onClick={() => handleDelete(c)} className="px-2 py-1 text-xs font-bold bg-red-50 text-red-600 rounded hover:bg-red-100 flex items-center gap-1">
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {coupons.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-400 text-sm">Nenhum cupom criado ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface AdminDashboardProps {
  user: User;
  onLogout?: () => void;
}

function resolveAdminUser(user: User): AdminUser | null {
  const isCeo = user.isAdmin || String(user.role ?? '').toUpperCase() === 'CEO';
  if (!isCeo) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: 'super_admin',
    active: true,
    createdAt: new Date().toISOString(),
  };
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const resolvedAdmin = resolveAdminUser(user);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(resolvedAdmin);
  const [darkMode, setDarkMode] = useState(true); // dark por padrão para CEO

  if (!adminUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Shield size={48} className="mx-auto mb-4 text-red-400" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Acesso Negado</h2>
          <p className="text-gray-500 text-sm">Apenas usuários com perfil CEO podem acessar este painel.</p>
        </div>
      </div>
    );
  }

  const canAccess = (required: AdminRole[]) => required.includes(adminUser.role);

  const TABS: { id: Tab; label: string; icon: any; roles: AdminRole[] }[] = [
    { id: 'overview',      label: 'Visão Geral',      icon: PieChart,    roles: ['super_admin', 'financeiro', 'operacional', 'comercial', 'suporte', 'auditoria', 'viewer'] },
    { id: 'diagnostics',   label: 'Diagnóstico',       icon: Activity,    roles: ['super_admin', 'financeiro', 'operacional', 'suporte', 'auditoria', 'viewer'] },
    { id: 'incident_center', label: 'Alertas & Incidentes', icon: AlertTriangle, roles: ['super_admin', 'financeiro', 'operacional', 'suporte', 'auditoria', 'viewer'] },
    { id: 'pricing_ai',    label: 'Planos & Custos',   icon: DollarSign,  roles: ['super_admin', 'financeiro', 'operacional', 'comercial', 'auditoria', 'viewer'] },
    { id: 'billing_kiwify', label: 'Billing & Kiwify', icon: CreditCard,  roles: ['super_admin', 'financeiro', 'operacional', 'comercial', 'suporte', 'auditoria', 'viewer'] },
    { id: 'accounts_admin', label: 'Usuarios & Tenants', icon: Users,     roles: ['super_admin', 'financeiro', 'operacional', 'suporte', 'auditoria', 'viewer'] },
    { id: 'plans',         label: 'Planos',            icon: Package,     roles: ['super_admin', 'financeiro'] },
    { id: 'subscribers',   label: 'Assinantes',        icon: Users,       roles: ['super_admin', 'financeiro', 'operacional', 'comercial', 'suporte', 'viewer'] },
    { id: 'monitoring',    label: 'Monitoramento',     icon: Activity,    roles: ['super_admin', 'operacional', 'suporte'] },
    { id: 'credits',       label: 'Créditos',          icon: Zap,         roles: ['super_admin', 'operacional', 'suporte'] },
    { id: 'landing',       label: 'Landing / Comercial', icon: Globe,     roles: ['super_admin', 'operacional', 'comercial'] },
    { id: 'kiwify',        label: 'Produtos Kiwify',   icon: Link,        roles: ['super_admin', 'operacional'] },
    { id: 'coupons',       label: 'Cupons & Campanhas', icon: Tag,        roles: ['super_admin', 'operacional', 'comercial'] },
    { id: 'test_accounts', label: 'Contas de Teste',   icon: TestTube,    roles: ['super_admin', 'operacional'] },
    { id: 'admins',        label: 'Administradores',   icon: Shield,      roles: ['super_admin'] },
    { id: 'user_logs',     label: 'Atividade de Usuários', icon: FileText, roles: ['super_admin', 'financeiro', 'operacional', 'suporte', 'auditoria', 'viewer'] },
    { id: 'logs',          label: 'Auditoria Admin',   icon: Lock,        roles: ['super_admin', 'financeiro', 'operacional', 'auditoria', 'viewer'] },
  ];

  return (
    <>
      {darkMode && <style>{DARK_CSS}</style>}
      <div
        className="ceo-panel flex font-sans text-gray-900"
        data-dark={darkMode ? 'true' : 'false'}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          zIndex: 9999,
          background: darkMode ? '#111827' : '#F9FAFB',
        }}
      >

        {/* SIDEBAR */}
        <aside className="w-60 bg-white border-r border-gray-200 flex flex-col z-20 shadow-sm shrink-0">
          <div className="h-16 flex items-center px-5 border-b border-gray-100 gap-3">
            <div style={{ background: darkMode ? '#C69214' : '#111827', padding: '6px', borderRadius: 8 }}>
              <Shield style={{ color: '#fff', width: 16, height: 16 }} />
            </div>
            <div>
              <span className="block text-sm font-bold leading-none">
                <span style={{ color: '#1F4E5F' }}>Inclui</span><span style={{ color: '#E07B2A' }}>AI</span>
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#C69214', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Painel CEO
              </span>
            </div>
          </div>

        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {TABS.map(t => (
            <SidebarItem
              key={t.id}
              icon={t.icon}
              label={t.label}
              active={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              disabled={!canAccess(t.roles)}
            />
          ))}
        </nav>

          <div className="p-4 border-t border-gray-100">
            {/* Toggle dark/light */}
            <button
              onClick={() => setDarkMode(d => !d)}
              className="w-full flex items-center justify-center gap-2 text-xs font-medium p-2 rounded-lg transition mb-2"
              style={{
                background: darkMode ? 'rgba(198,146,20,0.12)' : '#F3F4F6',
                color: darkMode ? '#C69214' : '#6B7280',
                border: darkMode ? '1px solid rgba(198,146,20,0.3)' : '1px solid transparent',
              }}
            >
              {darkMode ? <><Sun size={13} /> Modo Claro</> : <><Moon size={13} /> Modo Escuro</>}
            </button>

            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold text-sm">
                {adminUser.name.charAt(0)}
              </div>
              <div className="overflow-hidden min-w-0">
                <p className="text-xs font-bold truncate text-gray-900">{adminUser.name}</p>
                <p className="text-[10px] capitalize" style={{ color: '#C69214' }}>{adminUser.role.replace('_', ' ')}</p>
              </div>
            </div>

            {onLogout && (
              <button
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  color: '#F87171',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.18)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)';
                }}
              >
                <LogOut size={14} />
                Sair da Conta
              </button>
            )}
          </div>
        </aside>

      {/* CONTENT */}
      <main className="flex-1 overflow-y-auto p-8">
        {activeTab === 'overview'      && <OverviewTab adminUser={adminUser} darkMode={darkMode} />}
        {activeTab === 'diagnostics'   && <HealthCenterTab onNavigate={setActiveTab} />}
        {activeTab === 'incident_center' && <AlertsIncidentCenterTab onNavigate={setActiveTab} />}
        {activeTab === 'pricing_ai'    && <PricingAiAdminTab />}
        {activeTab === 'billing_kiwify' && <BillingKiwifyReconciliationTab />}
        {activeTab === 'accounts_admin' && <UsersTenantsAdminTab adminUser={adminUser} />}
        {activeTab === 'plans'         && <PlansTab adminUser={adminUser} />}
        {activeTab === 'subscribers'   && <SubscribersTab adminUser={adminUser} />}
        {activeTab === 'monitoring'    && <MonitoringTab adminUser={adminUser} />}
        {activeTab === 'credits'       && <CreditCommandCenterTab onNavigate={setActiveTab} />}
        {activeTab === 'landing'       && <LandingTab adminUser={adminUser} />}
        {activeTab === 'kiwify'        && <KiwifyProductsTab adminUser={adminUser} />}
        {activeTab === 'coupons'       && <CouponsTab adminUser={adminUser} />}
        {activeTab === 'test_accounts' && <TestAccountsTab adminUser={adminUser} />}
        {activeTab === 'admins'        && <AdminsTab adminUser={adminUser} setAdminUser={setAdminUser as (u: AdminUser) => void} />}
        {activeTab === 'user_logs'     && <UserLogsTab />}
        {activeTab === 'logs'          && <LogsTab />}
      </main>
    </div>
    </>
  );
};
