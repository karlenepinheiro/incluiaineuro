import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, DollarSign, TrendingUp, AlertCircle, Brain, Zap,
  PieChart, Activity, ArrowUpRight, ArrowDownRight, PlusCircle,
  Shield, CreditCard, FileText, Globe, CheckCircle, XCircle,
  Save, LogOut, Search, Edit3, Trash2, Lock, RefreshCw,
  Package, TestTube, ChevronDown, ChevronUp, Eye, EyeOff,
  AlertTriangle, RotateCcw, Gift, Layers, Sun, Moon,
} from 'lucide-react';
import {
  AdminRole, AdminUser, AdminLog, SiteConfig, PlanTier,
  Subscriber, Plan, CreditLedgerEntry, LandingSection, SubscriptionStatus,
  User,
} from '../types';
import { supabase, DEMO_MODE } from '../services/supabase';
import { AdminService } from '../services/adminService';
import { CreditLedgerService, CreditWalletService } from '../services/creditService';
import { LandingService } from '../services/landingService';
import { SubscriptionService } from '../services/billingService';
import { SubscriptionStatusBadge } from '../components/SubscriptionStatusBadge';

// ============================================================================
// TYPES
// ============================================================================

type Tab = 'overview' | 'plans' | 'subscribers' | 'credits' | 'landing' | 'test_accounts' | 'admins' | 'logs';

const CURRENT_ADMIN_MOCK: AdminUser = {
  id: 'admin_curr', name: 'Super Admin', email: 'ceo@incluiai.com',
  role: 'super_admin', active: true, createdAt: new Date().toISOString(),
};

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
// TAB: OVERVIEW
// ============================================================================

const OverviewTab = ({ adminUser, darkMode }: { adminUser: AdminUser; darkMode: boolean }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [aiStats, setAiStats] = useState<{ total: number; success: number; failed: number; copilotActed: number } | null>(null);

  useEffect(() => {
    AdminService.getFinancialStats().then(s => { setStats(s); setLoading(false); });

    // Carrega métricas de IA dos últimos 30 dias
    if (!DEMO_MODE) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      Promise.all([
        supabase.from('ai_requests').select('status', { count: 'exact', head: false }).gte('created_at', since),
        supabase.from('copilot_suggestions').select('id', { count: 'exact', head: false }).eq('status', 'acted').gte('created_at', since),
      ]).then(([reqRes, copilotRes]) => {
        const rows: any[] = reqRes.data ?? [];
        setAiStats({
          total:         rows.length,
          success:       rows.filter(r => r.status === 'success').length,
          failed:        rows.filter(r => r.status === 'failed').length,
          copilotActed:  (copilotRes.count ?? 0),
        });
      }).catch(() => {});
    } else {
      setAiStats({ total: 1284, success: 1201, failed: 83, copilotActed: 342 });
    }
  }, []);

  if (loading) return <div className="text-gray-400 text-sm py-8">Carregando KPIs...</div>;
  if (!stats) return null;

  const subscriptionSlices: DonutSlice[] = [
    { label: 'Ativas',     value: stats.active_subscribers,   color: '#10B981' },
    { label: 'Em atraso',  value: stats.overdue_subscribers,  color: '#F59E0B' },
    { label: 'Trial/Teste',value: stats.trial_subscribers,    color: '#3B82F6' },
    { label: 'Canceladas', value: stats.canceled_subscribers, color: '#EF4444' },
  ].filter(s => s.value > 0);

  const revenueSlices: DonutSlice[] = [
    { label: 'PRO',          value: 52, color: '#3B82F6' },
    { label: 'MASTER',       value: 38, color: '#8B5CF6' },
    { label: 'INSTITUTIONAL',value: 10, color: '#10B981' },
  ];

  const mrrLabel = stats.mrr_estimated > 0
    ? `R$ ${(stats.mrr_estimated / 1000).toFixed(1)}k`
    : '—';

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

      {/* KPIs linha 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KPICard title="MRR" value={stats.mrr_estimated.toFixed(2)} prefix="R$ " icon={DollarSign} color="bg-green-500" trend={8.5} />
        <KPICard title="ARR (projeção)" value={stats.arr.toFixed(2)} prefix="R$ " icon={TrendingUp} color="bg-blue-500" subtext="MRR × 12" />
        <KPICard title="Assinantes Ativos" value={stats.active_subscribers} icon={Users} color="bg-indigo-500" trend={2.1} />
        <KPICard title="Inadimplentes" value={stats.overdue_subscribers} icon={AlertCircle} color="bg-red-500" subtext={`${stats.canceled_subscribers} cancelados`} />
      </div>

      {/* KPIs linha 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPICard title="Em Trial / Teste" value={stats.trial_subscribers} icon={TestTube} color="bg-yellow-500" />
        <KPICard title="Total de Tenants" value={stats.total_tenants} icon={Layers} color="bg-gray-500" />
        <KPICard title="Receita Extra" value={(stats.extraRevenue ?? 0).toFixed(2)} prefix="R$ " icon={Zap} color="bg-orange-500" subtext="Add-ons e créditos" />
        <KPICard title="Custo de IA" value={(stats.aiCosts ?? 0).toFixed(2)} prefix="R$ " icon={Brain} color="bg-purple-500" subtext="Gemini + OpenAI" />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Donut: Status das Assinaturas */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-sm">
            <Activity size={16} className="text-purple-600" /> Status das Assinaturas
          </h3>
          <div className="flex items-center gap-8">
            <DonutChart
              slices={subscriptionSlices}
              size={150}
              thickness={30}
              centerLabel={String(stats.total_tenants)}
            />
            <div className="space-y-2 flex-1">
              {[
                { label: 'Ativas',      count: stats.active_subscribers,   color: '#10B981' },
                { label: 'Em atraso',   count: stats.overdue_subscribers,  color: '#F59E0B' },
                { label: 'Trial/Teste', count: stats.trial_subscribers,    color: '#3B82F6' },
                { label: 'Canceladas',  count: stats.canceled_subscribers, color: '#EF4444' },
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

        {/* Donut: Composição de Receita por Plano */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-sm">
            <DollarSign size={16} className="text-green-600" /> Composição de Receita por Plano
          </h3>
          <div className="flex items-center gap-8">
            <DonutChart
              slices={revenueSlices}
              size={150}
              thickness={30}
              centerLabel={mrrLabel}
            />
            <div className="space-y-3 flex-1">
              {revenueSlices.map(p => (
                <div key={p.label}>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                      {p.label}
                    </span>
                    <span className="font-bold">{p.value}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full" style={{ width: `${p.value}%`, background: p.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ── Seção: Uso de IA (últimos 30 dias) ── */}
      {aiStats && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <Brain size={15} className="text-purple-500" />
            <h3 className="text-sm font-bold text-gray-700">Uso de IA — últimos 30 dias</h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-[11px] text-gray-400 font-medium mb-1">Requisições IA</p>
              <p className="text-2xl font-bold text-gray-900">{aiStats.total.toLocaleString('pt-BR')}</p>
              <p className="text-[10px] text-gray-400 mt-1">Documentos + Atividades</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-[11px] text-gray-400 font-medium mb-1">Taxa de Sucesso</p>
              <p className="text-2xl font-bold text-green-600">
                {aiStats.total > 0 ? Math.round((aiStats.success / aiStats.total) * 100) : 0}%
              </p>
              <p className="text-[10px] text-gray-400 mt-1">{aiStats.failed} com erro</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-[11px] text-gray-400 font-medium mb-1">Copilot Acionado</p>
              <p className="text-2xl font-bold" style={{ color: '#1F4E5F' }}>{aiStats.copilotActed.toLocaleString('pt-BR')}</p>
              <p className="text-[10px] text-gray-400 mt-1">Sugestões clicadas</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-[11px] text-gray-400 font-medium mb-1">Custo Est. IA</p>
              <p className="text-2xl font-bold text-purple-600">
                R$ {((aiStats.total * 0.02) + (aiStats.failed * 0.005)).toFixed(0)}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">Estimativa ~ R$ 0,02/req</p>
            </div>
          </div>

          {/* Barra de sucesso/falha */}
          {aiStats.total > 0 && (
            <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex justify-between text-xs text-gray-500 mb-2">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" />Sucesso</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" />Erro</span>
                <span className="font-bold">{aiStats.success} / {aiStats.total}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-green-500 transition-all"
                  style={{ width: `${Math.round((aiStats.success / aiStats.total) * 100)}%` }}
                />
              </div>
            </div>
          )}
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
                placeholder="30 alunos&#10;50 créditos IA/mês&#10;Código de auditoria"
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

  const doAction = async (action: () => Promise<void>, subId: string) => {
    setActionLoading(subId);
    try { await action(); await load(); }
    catch (e: any) { alert(e.message); }
    finally { setActionLoading(null); }
  };

  const handleGrantCredits = (sub: Subscriber) => {
    const amount = prompt(`Créditos para ${sub.name} (negativo = estorno):`);
    if (!amount || isNaN(Number(amount))) return;
    const reason = prompt('Motivo (para auditoria):');
    if (!reason) return;
    doAction(() => AdminService.grantCredits(sub.tenant_id, Number(amount), reason, adminUser), sub.id);
  };

  const handleChangePlan = (sub: Subscriber) => {
    const code = prompt(`Novo plano para ${sub.name} (FREE/PRO/MASTER/INSTITUTIONAL):`);
    if (!code) return;
    doAction(() => AdminService.updateSubscriberPlan(sub.tenant_id, code.toUpperCase(), adminUser), sub.id);
  };

  const handleCourtesy = (sub: Subscriber) => {
    const reason = prompt(`Motivo da cortesia para ${sub.name}:`);
    if (!reason) return;
    doAction(() => AdminService.grantCourtesy(sub.tenant_id, reason, adminUser), sub.id);
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
                return (
                  <tr key={sub.id} className="hover:bg-gray-50/50">
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
                              <button onClick={() => handleGrantCredits(sub)} title="Conceder/estornar créditos" className="px-2 py-1 text-xs font-bold bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition">
                                <Zap size={11} className="inline mr-0.5" />Créditos
                              </button>
                              <button onClick={() => handleChangePlan(sub)} title="Alterar plano" className="px-2 py-1 text-xs font-bold bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition">
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
                              <button onClick={() => handleCourtesy(sub)} className="px-2 py-1 text-xs font-bold bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition">
                                <Gift size={11} className="inline mr-0.5" />Cortesia
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
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
// TAB: CRÉDITOS
// ============================================================================

const CreditsTab = ({ adminUser }: { adminUser: AdminUser }) => {
  const [tenantId, setTenantId] = useState('');
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
          <div className="flex gap-2 mb-4">
            <input
              className="flex-1 border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none font-mono"
              placeholder="UUID do tenant..."
              value={tenantId}
              onChange={e => setTenantId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <button onClick={handleSearch} disabled={loadingLedger} className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-800 transition flex items-center gap-2 disabled:opacity-50">
              {loadingLedger ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />} Buscar
            </button>
          </div>

          {balance !== null && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
              <p className="text-xs text-purple-600 font-bold uppercase mb-1">Saldo Atual</p>
              <p className="text-3xl font-bold text-purple-700">{balance} <span className="text-base font-normal">créditos</span></p>
            </div>
          )}

          {ledger.length > 0 && renderLedgerTable(ledger, `Histórico — ${tenantId.slice(0, 8)}...`)}
        </div>

        {/* Formulário de concessão */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200">
          <h3 className="font-bold text-sm text-gray-700 mb-3">Conceder / Estornar Créditos</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tenant ID</label>
              <input className="w-full border rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-gray-300 outline-none" value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="UUID do tenant" />
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
// TAB: LANDING / COMERCIAL
// ============================================================================

const LandingTab = ({ adminUser }: { adminUser: AdminUser }) => {
  const [sections, setSections] = useState<LandingSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('hero');

  useEffect(() => {
    LandingService.getAll().then(s => { setSections(s); setLoading(false); });
  }, []);

  const updateSection = (key: string, field: 'title' | 'subtitle', value: string) => {
    setSections(prev => prev.map(s => s.section_key === key ? { ...s, [field]: value } : s));
  };

  const updateContentJson = (key: string, jsonKey: string, value: any) => {
    setSections(prev => prev.map(s => s.section_key === key
      ? { ...s, content_json: { ...s.content_json, [jsonKey]: value } }
      : s
    ));
  };

  const handleSaveAll = async () => {
    if (!['super_admin', 'operacional'].includes(adminUser.role)) {
      alert('Permissão negada');
      return;
    }
    setSaving(true);
    try {
      await LandingService.saveAll(
        sections.map(s => ({ sectionKey: s.section_key, title: s.title, subtitle: s.subtitle, contentJson: s.content_json })),
        undefined,
        adminUser.name,
      );
      alert('Landing page atualizada e publicada!');
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const current = sections.find(s => s.section_key === activeSection);

  if (loading) return <div className="text-gray-400 text-sm">Carregando conteúdo...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Landing Page / Comercial</h2>
          <p className="text-gray-400 text-sm">Edite o conteúdo público do site sem precisar de deploy.</p>
        </div>
        <button onClick={handleSaveAll} disabled={saving} className="bg-gray-900 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-gray-800 disabled:opacity-50 transition">
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Globe size={14} />} Salvar e Publicar
        </button>
      </div>

      <div className="flex gap-6">
        {/* Sidebar de seções */}
        <div className="w-44 shrink-0 space-y-1">
          {sections.map(s => (
            <button key={s.section_key} onClick={() => setActiveSection(s.section_key)}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm transition ${activeSection === s.section_key ? 'bg-gray-900 text-white font-bold' : 'text-gray-500 hover:bg-gray-100'}`}>
              {s.section_key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          ))}
        </div>

        {/* Editor da seção ativa */}
        {current ? (
          <div className="flex-1 bg-white p-6 rounded-2xl border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">Seção: <span className="text-indigo-600 font-mono">{current.section_key}</span></h3>
              <p className="text-xs text-gray-400">Última atualização: {current.updated_at ? new Date(current.updated_at).toLocaleString('pt-BR') : '—'}</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Título</label>
                <input className="w-full border rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-300 outline-none" value={current.title ?? ''} onChange={e => updateSection(current.section_key, 'title', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Subtítulo</label>
                <textarea className="w-full border rounded-xl p-3 text-sm focus:ring-2 focus:ring-gray-300 outline-none resize-none" rows={2} value={current.subtitle ?? ''} onChange={e => updateSection(current.section_key, 'subtitle', e.target.value)} />
              </div>

              {/* Campos específicos por seção */}
              {current.section_key === 'hero' && (
                <div className="border border-gray-100 rounded-xl p-4 bg-gray-50 space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase">Configurações do Hero</p>
                  {['cta_primary', 'cta_secondary', 'phone'].map(k => (
                    <div key={k}>
                      <label className="block text-xs text-gray-500 mb-1">{k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</label>
                      <input className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none" value={String(current.content_json[k] ?? '')} onChange={e => updateContentJson(current.section_key, k, e.target.value)} />
                    </div>
                  ))}
                </div>
              )}

              {current.section_key === 'pricing' && (
                <div className="border border-gray-100 rounded-xl p-4 bg-gray-50 space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase">Preços Exibidos na Landing</p>
                  {[
                    { k: 'pro_monthly', label: 'PRO Mensal (R$)' },
                    { k: 'pro_annual', label: 'PRO Anual (R$/mês)' },
                    { k: 'master_monthly', label: 'MASTER Mensal (R$)' },
                    { k: 'master_annual', label: 'MASTER Anual (R$/mês)' },
                    { k: 'extra_student', label: 'Aluno extra (R$)' },
                    { k: 'extra_credits_10', label: '+10 créditos (R$)' },
                  ].map(({ k, label }) => (
                    <div key={k}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <input type="number" className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none" value={Number(current.content_json[k] ?? 0)} onChange={e => updateContentJson(current.section_key, k, Number(e.target.value))} />
                    </div>
                  ))}
                </div>
              )}

              {current.section_key === 'faq' && (
                <div className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-2">FAQs (JSON)</p>
                  <textarea
                    className="w-full border rounded-lg p-3 text-xs font-mono focus:ring-2 focus:ring-gray-300 outline-none resize-y"
                    rows={8}
                    value={JSON.stringify(current.content_json.items ?? [], null, 2)}
                    onChange={e => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        updateContentJson(current.section_key, 'items', parsed);
                      } catch {}
                    }}
                  />
                  <p className="text-xs text-gray-400 mt-1">Formato: [{`{"q":"pergunta","a":"resposta"}`}]</p>
                </div>
              )}

              {/* JSON bruto para seções sem editor dedicado */}
              {!['hero', 'pricing', 'faq'].includes(current.section_key) && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Dados JSON</label>
                  <textarea
                    className="w-full border rounded-xl p-3 text-xs font-mono focus:ring-2 focus:ring-gray-300 outline-none resize-y"
                    rows={6}
                    value={JSON.stringify(current.content_json, null, 2)}
                    onChange={e => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        setSections(prev => prev.map(s => s.section_key === current.section_key ? { ...s, content_json: parsed } : s));
                      } catch {}
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">Selecione uma seção.</div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// TAB: CONTAS DE TESTE
// ============================================================================

const TestAccountsTab = ({ adminUser }: { adminUser: AdminUser }) => {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState('');
  const [planCode, setPlanCode] = useState('PRO');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const loadTests = useCallback(async () => {
    setLoading(true);
    const all = await AdminService.getSubscribers();
    setSubscribers(all.filter(s => s.status === 'INTERNAL_TEST'));
    setLoading(false);
  }, []);

  useEffect(() => { loadTests(); }, [loadTests]);

  const handleCreate = async () => {
    if (!tenantId || !reason) { alert('Preencha Tenant ID e motivo.'); return; }
    setSaving(true);
    try {
      await AdminService.createTestAccount({ tenantId, planCode, reason, adminUser });
      setTenantId('');
      setReason('');
      await loadTests();
      alert('Conta de teste criada!');
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1">Contas de Teste</h2>
      <p className="text-gray-400 text-sm mb-6">Crie contas internas sem cobrança para testes e demonstrações.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-gray-200">
          <h3 className="font-bold text-sm text-gray-700 mb-4 flex items-center gap-2"><TestTube size={16} className="text-green-600" /> Criar Conta de Teste</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tenant ID existente</label>
              <input className="w-full border rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-gray-300 outline-none" value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="UUID do tenant" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Plano de teste</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none" value={planCode} onChange={e => setPlanCode(e.target.value)}>
                <option value="FREE">FREE — Starter</option>
                <option value="PRO">PRO — Profissional</option>
                <option value="MASTER">MASTER — Clínicas/Escolas</option>
                <option value="INSTITUTIONAL">INSTITUTIONAL</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Motivo / Identificação</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none" value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex: Demo cliente X, teste interno QA" />
            </div>
            <button onClick={handleCreate} disabled={saving || !tenantId || !reason} className="w-full bg-green-600 text-white py-2 rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50 transition flex items-center justify-center gap-2">
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <PlusCircle size={14} />} Criar Conta de Teste
            </button>
          </div>
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs text-amber-700 font-medium">⚠️ Contas de teste não dependem de pagamento real. O status <strong>INTERNAL_TEST</strong> é diferente de ACTIVE e fica visível apenas no painel CEO.</p>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 font-bold text-sm text-gray-700 flex items-center justify-between">
              Contas de Teste Ativas
              <button onClick={loadTests} className="p-1 hover:bg-gray-100 rounded text-gray-400"><RefreshCw size={13} /></button>
            </div>
            {loading ? (
              <div className="p-6 text-center text-gray-400 text-sm">Carregando...</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Tenant</th>
                    <th className="px-4 py-2 text-left">Plano</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Vencimento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {subscribers.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Nenhuma conta de teste.</td></tr>
                  ) : subscribers.map(sub => (
                    <tr key={sub.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2">
                        <p className="font-bold text-gray-900 text-sm">{sub.name}</p>
                        <p className="text-xs text-gray-400">{sub.email}</p>
                      </td>
                      <td className="px-4 py-2"><Badge color={PLAN_COLOR[String(sub.plan)] ?? 'gray'}>{String(sub.plan)}</Badge></td>
                      <td className="px-4 py-2"><SubscriptionStatusBadge status={sub.status} size="sm" /></td>
                      <td className="px-4 py-2 text-xs text-gray-400 font-mono">{sub.nextBilling}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

  const ROLE_COLORS: Record<AdminRole, string> = {
    super_admin: 'bg-red-100 text-red-700',
    financeiro: 'bg-green-100 text-green-700',
    operacional: 'bg-blue-100 text-blue-700',
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
// TAB: LOGS
// ============================================================================

const LogsTab = () => {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AdminService.getLogs().then(l => { setLogs(l); setLoading(false); });
  }, []);

  const ACTION_COLORS: Record<string, string> = {
    SITE_UPDATE: 'bg-blue-100 text-blue-700',
    GRANT_CREDITS: 'bg-purple-100 text-purple-700',
    UPDATE_PLAN: 'bg-indigo-100 text-indigo-700',
    SUSPEND: 'bg-red-100 text-red-700',
    REACTIVATE: 'bg-green-100 text-green-700',
    GRANT_COURTESY: 'bg-amber-100 text-amber-700',
    CREATE_ADMIN: 'bg-gray-100 text-gray-700',
    CREATE_TEST_ACCOUNT: 'bg-teal-100 text-teal-700',
    UPSERT_PLAN: 'bg-pink-100 text-pink-700',
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Auditoria e Logs</h2>
          <p className="text-gray-400 text-sm">Histórico de todas as ações administrativas.</p>
        </div>
        <button onClick={() => AdminService.getLogs().then(setLogs)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500"><RefreshCw size={15} /></button>
      </div>

      {loading ? <div className="text-gray-400 text-sm">Carregando logs...</div> : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
              <tr>
                <th className="px-5 py-3 text-left">Data/Hora</th>
                <th className="px-5 py-3 text-left">Admin</th>
                <th className="px-5 py-3 text-left">Ação</th>
                <th className="px-5 py-3 text-left">Alvo</th>
                <th className="px-5 py-3 text-left">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-mono text-xs text-gray-400">{new Date(log.timestamp).toLocaleString('pt-BR')}</td>
                  <td className="px-5 py-3 font-bold text-gray-800 text-xs">{log.adminName}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-600'}`}>{log.action}</span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500 font-mono truncate max-w-[120px]">{log.target}</td>
                  <td className="px-5 py-3 text-xs text-gray-500 max-w-xs truncate">{log.details}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Nenhuma ação registrada.</td></tr>
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
  subscribers?: any[];
  onUpdatePlan?: any;
  onClose?: () => void;
  user?: User;
}

function resolveAdminUser(user?: User): AdminUser {
  if (user?.isAdmin) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: 'super_admin',
      active: true,
      createdAt: new Date().toISOString(),
    };
  }
  return CURRENT_ADMIN_MOCK;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose, user }) => {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [adminUser, setAdminUser] = useState<AdminUser>(() => resolveAdminUser(user));
  const [darkMode, setDarkMode] = useState(true); // dark por padrão para CEO

  const canAccess = (required: AdminRole[]) => required.includes(adminUser.role);

  const TABS: { id: Tab; label: string; icon: any; roles: AdminRole[] }[] = [
    { id: 'overview',      label: 'Visão Geral',      icon: PieChart,    roles: ['super_admin', 'financeiro', 'operacional', 'viewer'] },
    { id: 'plans',         label: 'Planos',            icon: Package,     roles: ['super_admin', 'financeiro'] },
    { id: 'subscribers',   label: 'Assinantes',        icon: Users,       roles: ['super_admin', 'financeiro', 'operacional', 'viewer'] },
    { id: 'credits',       label: 'Créditos',          icon: Zap,         roles: ['super_admin', 'operacional'] },
    { id: 'landing',       label: 'Landing / Comercial', icon: Globe,     roles: ['super_admin', 'operacional'] },
    { id: 'test_accounts', label: 'Contas de Teste',   icon: TestTube,    roles: ['super_admin', 'operacional'] },
    { id: 'admins',        label: 'Administradores',   icon: Shield,      roles: ['super_admin'] },
    { id: 'logs',          label: 'Logs de Auditoria', icon: Activity,    roles: ['super_admin', 'financeiro', 'operacional', 'viewer'] },
  ];

  return (
    <>
      {darkMode && <style>{DARK_CSS}</style>}
      <div
        className="ceo-panel flex h-screen bg-gray-50 font-sans text-gray-900 overflow-hidden"
        data-dark={darkMode ? 'true' : 'false'}
      >

        {/* SIDEBAR */}
        <aside className="w-60 bg-white border-r border-gray-200 flex flex-col z-20 shadow-sm shrink-0">
          <div className="h-16 flex items-center px-5 border-b border-gray-100 gap-3">
            <div style={{ background: darkMode ? '#C69214' : '#111827', padding: '6px', borderRadius: 8 }}>
              <Shield style={{ color: '#fff', width: 16, height: 16 }} />
            </div>
            <div>
              <span className="block text-sm font-bold text-gray-900 leading-none">IncluiAI</span>
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
            {onClose && (
              <button onClick={onClose} className="w-full flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition font-medium">
                <LogOut size={13} /> Voltar ao Sistema
              </button>
            )}
          </div>
        </aside>

      {/* CONTENT */}
      <main className="flex-1 overflow-y-auto p-8">
        {activeTab === 'overview'      && <OverviewTab adminUser={adminUser} darkMode={darkMode} />}
        {activeTab === 'plans'         && <PlansTab adminUser={adminUser} />}
        {activeTab === 'subscribers'   && <SubscribersTab adminUser={adminUser} />}
        {activeTab === 'credits'       && <CreditsTab adminUser={adminUser} />}
        {activeTab === 'landing'       && <LandingTab adminUser={adminUser} />}
        {activeTab === 'test_accounts' && <TestAccountsTab adminUser={adminUser} />}
        {activeTab === 'admins'        && <AdminsTab adminUser={adminUser} setAdminUser={setAdminUser} />}
        {activeTab === 'logs'          && <LogsTab />}
      </main>
    </div>
    </>
  );
};
