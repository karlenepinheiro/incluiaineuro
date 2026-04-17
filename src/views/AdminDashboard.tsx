import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, DollarSign, TrendingUp, AlertCircle, Brain, Zap,
  PieChart, Activity, ArrowUpRight, ArrowDownRight, PlusCircle,
  Shield, CreditCard, FileText, Globe, CheckCircle, XCircle,
  Save, Search, Edit3, Trash2, Lock, RefreshCw,
  Package, TestTube, ChevronDown, ChevronUp, Eye, EyeOff,
  AlertTriangle, RotateCcw, Gift, Layers, Sun, Moon, LogOut,
  Tag, Link, Copy, Share2, ExternalLink, ToggleLeft, ToggleRight, Clock,
} from 'lucide-react';
import {
  AdminRole, AdminUser, AdminLog, SiteConfig, PlanTier,
  Subscriber, Plan, CreditLedgerEntry, LandingSection, SubscriptionStatus,
  User, UserActivityLog
} from '../types';
import { supabase, DEMO_MODE } from '../services/supabase';
import { AdminService } from '../services/adminService';
import { CreditLedgerService, CreditWalletService } from '../services/creditService';
import { LandingService } from '../services/landingService';
import { SubscriptionService } from '../services/billingService';
import { SubscriptionStatusBadge } from '../components/SubscriptionStatusBadge';
import {
  getCeoKpis, getCeoSubscribers, getKiwifyProducts, upsertKiwifyProduct,
  getCoupons, upsertCoupon, toggleCoupon, deleteCoupon, buildCouponShareLink,
  getAdminAuditLog, logAction,
  type CeoKpis, type CeoSubscriber, type KiwifyProduct, type CeoCoupon, type AdminAuditEntry,
} from '../services/ceoService';

// ============================================================================
// TYPES
// ============================================================================

type Tab = 'overview' | 'plans' | 'subscribers' | 'monitoring' | 'credits' | 'landing' | 'kiwify' | 'coupons' | 'test_accounts' | 'admins' | 'user_logs' | 'logs';


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
    getCeoKpis().then(k => { setKpis(k); setLoading(false); }).catch(() => setLoading(false));
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

const SubscribersTab = ({ adminUser }: { adminUser: AdminUser }) => {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<'credits' | 'plan' | 'courtesy' | null>(null);
  const [actionCredits, setActionCredits] = useState('');
  const [actionPlan, setActionPlan] = useState('PRO');
  const [actionReason, setActionReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setSubscribers(await AdminService.getSubscribers());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = subscribers.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || s.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const openAction = (subId: string, mode: 'credits' | 'plan' | 'courtesy') => {
    if (expanded === subId && actionMode === mode) { setExpanded(null); setActionMode(null); return; }
    setExpanded(subId);
    setActionMode(mode);
    setActionCredits('');
    setActionPlan('PRO');
    setActionReason('');
  };

  const handleInlineAction = async (sub: Subscriber) => {
    if (!actionMode) return;
    setActionLoading(sub.id);
    try {
      if (actionMode === 'credits') {
        const amount = Number(actionCredits);
        if (!amount || !actionReason.trim()) { alert('Preencha quantidade e motivo.'); return; }
        await AdminService.grantCredits(sub.tenant_id, amount, actionReason, adminUser);
      } else if (actionMode === 'plan') {
        await AdminService.updateSubscriberPlan(sub.tenant_id, actionPlan, adminUser);
      } else if (actionMode === 'courtesy') {
        if (!actionReason.trim()) { alert('Informe o motivo da cortesia.'); return; }
        await AdminService.grantCourtesy(sub.tenant_id, actionReason, adminUser);
      }
      setExpanded(null); setActionMode(null);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(null); }
  };

  const doAction = async (action: () => Promise<void>, subId: string) => {
    setActionLoading(subId);
    try { await action(); await load(); }
    catch (e: any) { alert(e.message); }
    finally { setActionLoading(null); }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Assinantes</h2>
          <p className="text-gray-400 text-sm">{subscribers.length} tenants cadastrados</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input className="pl-9 pr-3 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-gray-300 w-56" placeholder="Buscar nome ou e-mail..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">Todos os status</option>
            <option value="ACTIVE">Ativos</option>
            <option value="OVERDUE">Em atraso</option>
            <option value="CANCELED">Cancelados</option>
            <option value="TRIAL">Trial</option>
            <option value="INTERNAL_TEST">Teste interno</option>
          </select>
          <button onClick={load} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 transition"><RefreshCw size={15} /></button>
        </div>
      </div>

      {loading ? <div className="text-gray-400 text-sm">Carregando assinantes...</div> : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
              <tr>
                <th className="px-5 py-3 text-left">Assinante</th>
                <th className="px-5 py-3 text-left">Plano</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Uso IA</th>
                <th className="px-5 py-3 text-left">Alunos</th>
                <th className="px-5 py-3 text-left">Próx. Venc.</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(sub => {
                const isLoading = actionLoading === sub.id;
                const isExpanded = expanded === sub.id;
                return (
                  <React.Fragment key={sub.id}>
                  <tr className="hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <p className="font-bold text-gray-900">{sub.name}</p>
                      <p className="text-xs text-gray-400">{sub.email}</p>
                      {sub.phone && <p className="text-xs text-gray-400">{sub.phone}</p>}
                    </td>
                    <td className="px-5 py-3">
                      <Badge color={PLAN_COLOR[String(sub.plan)] ?? 'gray'}>{String(sub.plan)}</Badge>
                      <p className="text-xs text-gray-400 mt-0.5">{sub.cycle}</p>
                    </td>
                    <td className="px-5 py-3">
                      <SubscriptionStatusBadge status={sub.status} size="sm" />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-purple-500 h-full rounded-full" style={{ width: `${Math.min(100, (sub.creditsUsed / Math.max(1, sub.creditsLimit)) * 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{sub.creditsUsed}/{sub.creditsLimit}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-blue-500 h-full rounded-full" style={{ width: `${Math.min(100, (sub.studentsActive / Math.max(1, sub.studentsLimit)) * 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{sub.studentsActive}/{sub.studentsLimit}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500 font-mono">{sub.nextBilling}</td>
                    <td className="px-5 py-3 text-right">
                      {isLoading ? (
                        <RefreshCw size={14} className="animate-spin text-gray-400 ml-auto" />
                      ) : (
                        <div className="flex gap-1 justify-end flex-wrap">
                          {['super_admin', 'operacional'].includes(adminUser.role) && (
                            <>
                              <button onClick={() => openAction(sub.id, 'credits')} title="Conceder/estornar créditos" className={`px-2 py-1 text-xs font-bold rounded-lg transition ${isExpanded && actionMode === 'credits' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}>
                                <Zap size={11} className="inline mr-0.5" />Créditos
                              </button>
                              <button onClick={() => openAction(sub.id, 'plan')} title="Alterar plano" className={`px-2 py-1 text-xs font-bold rounded-lg transition ${isExpanded && actionMode === 'plan' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                                <Package size={11} className="inline mr-0.5" />Plano
                              </button>
                              {sub.status === 'ACTIVE' ? (
                                <button onClick={() => doAction(() => AdminService.suspendSubscriber(sub.tenant_id, adminUser), sub.id)} className="px-2 py-1 text-xs font-bold bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition">
                                  <XCircle size={11} className="inline mr-0.5" />Suspender
                                </button>
                              ) : (
                                <button onClick={() => doAction(() => AdminService.reactivateSubscriber(sub.tenant_id, adminUser), sub.id)} className="px-2 py-1 text-xs font-bold bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition">
                                  <CheckCircle size={11} className="inline mr-0.5" />Reativar
                                </button>
                              )}
                              <button onClick={() => openAction(sub.id, 'courtesy')} title="Conceder cortesia" className={`px-2 py-1 text-xs font-bold rounded-lg transition ${isExpanded && actionMode === 'courtesy' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
                                <Gift size={11} className="inline mr-0.5" />Cortesia
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                  {/* Painel de ação inline — aparece abaixo da linha selecionada */}
                  {isExpanded && actionMode && (
                    <tr>
                      <td colSpan={7} style={{ background: 'rgba(249,250,251,0.98)', borderBottom: '2px solid #E5E7EB' }}>
                        <div className="px-6 py-4">
                          <div className="flex items-start gap-4 flex-wrap">
                            <div className="flex-1 min-w-[280px]">
                              <p className="text-xs font-bold text-gray-500 mb-2 uppercase">
                                {actionMode === 'credits' && `Créditos para ${sub.name}`}
                                {actionMode === 'plan' && `Alterar plano de ${sub.name}`}
                                {actionMode === 'courtesy' && `Cortesia para ${sub.name}`}
                              </p>
                              {actionMode === 'credits' && (
                                <div className="flex gap-3 items-end flex-wrap">
                                  <div>
                                    <label className="block text-xs text-gray-400 mb-1">Quantidade (negativo = estorno)</label>
                                    <input type="number" autoFocus className="border rounded-lg px-3 py-1.5 text-sm w-32 focus:ring-2 focus:ring-purple-300 outline-none" value={actionCredits} onChange={e => setActionCredits(e.target.value)} placeholder="+50 ou -10" />
                                  </div>
                                  <div className="flex-1 min-w-[180px]">
                                    <label className="block text-xs text-gray-400 mb-1">Motivo (obrigatório para auditoria)</label>
                                    <input className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-300 outline-none" value={actionReason} onChange={e => setActionReason(e.target.value)} placeholder="Ex: Bonificação por feedback" />
                                  </div>
                                </div>
                              )}
                              {actionMode === 'plan' && (
                                <div className="flex gap-3 items-end">
                                  <div>
                                    <label className="block text-xs text-gray-400 mb-1">Novo plano</label>
                                    <select className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 outline-none" value={actionPlan} onChange={e => setActionPlan(e.target.value)}>
                                      <option value="FREE">FREE — Starter (60 créditos / 5 alunos)</option>
                                      <option value="PRO">PRO — Profissional (500 créditos / 30 alunos)</option>
                                      <option value="MASTER">PREMIUM — Clínicas (700 créditos / ilimitado)</option>
                                      <option value="INSTITUTIONAL">INSTITUTIONAL</option>
                                    </select>
                                  </div>
                                  <p className="text-xs text-gray-400">Plano atual: <strong>{String(sub.plan)}</strong></p>
                                </div>
                              )}
                              {actionMode === 'courtesy' && (
                                <div>
                                  <label className="block text-xs text-gray-400 mb-1">Motivo da cortesia (obrigatório)</label>
                                  <input autoFocus className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-amber-300 outline-none" value={actionReason} onChange={e => setActionReason(e.target.value)} placeholder="Ex: Cliente parceiro, erro de cobrança, demo comercial" />
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 items-center pt-4">
                              <button
                                onClick={() => handleInlineAction(sub)}
                                disabled={actionLoading === sub.id}
                                className="px-4 py-2 text-sm font-bold text-white rounded-lg transition disabled:opacity-50 flex items-center gap-1.5"
                                style={{ background: actionMode === 'credits' ? '#7C3AED' : actionMode === 'plan' ? '#2563EB' : '#D97706' }}
                              >
                                {actionLoading === sub.id ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                                Confirmar
                              </button>
                              <button onClick={() => { setExpanded(null); setActionMode(null); }} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition">
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">Nenhum assinante encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
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
  const [products, setProducts] = useState<KiwifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<KiwifyProduct> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProducts(await getKiwifyProducts()); } catch { /**/ }
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

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none';

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Produtos Kiwify</h2>
          <p className="text-gray-400 text-sm">Gerencie links, preços e destaques dos produtos.</p>
        </div>
        <button onClick={load} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500"><RefreshCw size={15} /></button>
      </div>

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
        {activeTab === 'plans'         && <PlansTab adminUser={adminUser} />}
        {activeTab === 'subscribers'   && <SubscribersTab adminUser={adminUser} />}
        {activeTab === 'monitoring'    && <MonitoringTab adminUser={adminUser} />}
        {activeTab === 'credits'       && <CreditsTab adminUser={adminUser} />}
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
