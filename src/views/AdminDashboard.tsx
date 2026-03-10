
import React, { useState, useEffect } from 'react';
import { 
  Users, DollarSign, TrendingUp, AlertCircle, Download, Brain, Zap, 
  PieChart, Activity, ArrowUpRight, ArrowDownRight, Building, PlusCircle,
  Settings, Monitor, Lock, LogOut, Search, Edit3, Trash2, Shield, CreditCard,
  FileText, Globe, CheckCircle, XCircle, Save, User as UserIcon
} from 'lucide-react';
import { AdminRole, AdminUser, AdminLog, Subscriber, PlanTier, SiteConfig } from '../types';
import { AdminService } from '../services/adminService';

// --- MOCK CURRENT ADMIN (In real app, comes from Auth Context) ---
const CURRENT_ADMIN: AdminUser = {
    id: 'admin_curr',
    name: 'Super Admin (Você)',
    email: 'ceo@incluiai.com',
    role: 'super_admin',
    active: true,
    createdAt: new Date().toISOString()
};

// --- COMPONENTS ---

const SidebarItem = ({ icon: Icon, label, active, onClick, disabled = false }: any) => (
    <button 
        onClick={onClick}
        disabled={disabled}
        className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
            active 
            ? 'bg-gray-900 text-white shadow-lg shadow-gray-200' 
            : disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
        }`}
    >
        <Icon size={20} className={active ? 'text-brand-400' : ''} />
        {label}
        {disabled && <Lock size={12} className="ml-auto opacity-50"/>}
    </button>
);

const KPICard = ({ title, value, subtext, icon: Icon, trend, color, prefix = '' }: any) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition duration-300">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl ${color} bg-opacity-10 text-opacity-100`}>
        <Icon size={24} className={color.replace('bg-', 'text-')} />
      </div>
      {trend && (
        <span className={`flex items-center text-xs font-bold px-2 py-1 rounded-full ${trend > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {trend > 0 ? <ArrowUpRight size={12} className="mr-1"/> : <ArrowDownRight size={12} className="mr-1"/>}
          {Math.abs(trend)}%
        </span>
      )}
    </div>
    <h3 className="text-gray-500 text-sm font-medium mb-1">{title}</h3>
    <p className="text-3xl font-bold text-gray-900 tracking-tight">{prefix}{value}</p>
    {subtext && <p className="text-xs text-gray-400 mt-2 font-medium">{subtext}</p>}
  </div>
);

// --- MAIN DASHBOARD ---

export const AdminDashboard: React.FC<{ subscribers: any[], onUpdatePlan: any }> = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [adminUser, setAdminUser] = useState<AdminUser>(CURRENT_ADMIN); // Mocked context
  
  // Data State
  const [stats, setStats] = useState<any>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);

  // Search/Filters
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
      fetchData();
  }, []);

  const fetchData = async () => {
      setLoading(true);
      try {
          const [kpis, subs, admList, logList, config] = await Promise.all([
              AdminService.getFinancialStats(),
              AdminService.getSubscribers(),
              AdminService.getAdmins(),
              AdminService.getLogs(),
              AdminService.getSiteConfig()
          ]);
          setStats(kpis);
          setSubscribers(subs);
          setAdmins(admList);
          setLogs(logList);
          setSiteConfig(config);
      } catch (e) {
          console.error(e);
      } finally {
          setLoading(false);
      }
  };

  const handleGrantCredits = async (subId: string) => {
      const amount = prompt("Quantidade de créditos a liberar:");
      if(!amount) return;
      const reason = prompt("Motivo da liberação (para auditoria):");
      if(!reason) return;
      
      try {
          await AdminService.grantCredits(subId, parseInt(amount), reason, adminUser);
          alert("Créditos liberados!");
          fetchData(); // Refresh logs/stats
      } catch (e: any) {
          alert(e.message);
      }
  };

  const handleSaveConfig = async () => {
      if(!siteConfig) return;
      try {
          await AdminService.updateSiteConfig(siteConfig, adminUser);
          alert("Configurações do site atualizadas!");
      } catch (e: any) {
          alert(e.message);
      }
  };

  // RBAC Helper
  const canAccess = (required: AdminRole[]) => required.includes(adminUser.role);

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900 overflow-hidden">
        
        {/* SIDEBAR */}
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col z-20 shadow-sm">
            <div className="h-20 flex items-center px-6 border-b border-gray-100">
                <div className="bg-gray-900 p-1.5 rounded-lg mr-3"><Shield className="text-white h-5 w-5" /></div>
                <div>
                    <span className="block text-lg font-bold text-gray-900 leading-none">INCLUIAI</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Painel Administrativo</span>
                </div>
            </div>

            <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
                <SidebarItem icon={PieChart} label="Visão Geral" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
                <SidebarItem icon={Users} label="Assinantes" active={activeTab === 'subscribers'} onClick={() => setActiveTab('subscribers')} />
                <SidebarItem icon={DollarSign} label="Financeiro" active={activeTab === 'financial'} onClick={() => setActiveTab('financial')} disabled={!canAccess(['super_admin', 'financeiro'])} />
                <SidebarItem icon={CreditCard} label="Produtos & Pacotes" active={activeTab === 'products'} onClick={() => setActiveTab('products')} disabled={!canAccess(['super_admin', 'financeiro'])} />
                <SidebarItem icon={Globe} label="Configuração do Site" active={activeTab === 'site'} onClick={() => setActiveTab('site')} disabled={!canAccess(['super_admin', 'operacional'])} />
                <SidebarItem icon={Lock} label="Administração (RBAC)" active={activeTab === 'admins'} onClick={() => setActiveTab('admins')} disabled={!canAccess(['super_admin'])} />
                <SidebarItem icon={Activity} label="Logs de Auditoria" active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} />
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold">
                        {adminUser.name.charAt(0)}
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-sm font-bold truncate">{adminUser.name}</p>
                        <p className="text-xs text-gray-500 truncate capitalize">{adminUser.role.replace('_', ' ')}</p>
                    </div>
                </div>
                {/* ROLE SWITCHER FOR DEMO */}
                <select 
                    className="w-full text-xs border rounded mb-2 p-1 bg-white"
                    value={adminUser.role}
                    onChange={(e) => setAdminUser({...adminUser, role: e.target.value as AdminRole})}
                >
                    <option value="super_admin">Simular Super Admin</option>
                    <option value="financeiro">Simular Financeiro</option>
                    <option value="operacional">Simular Operacional</option>
                    <option value="viewer">Simular Viewer</option>
                </select>
                <button className="w-full flex items-center justify-center gap-2 text-red-600 text-xs font-bold hover:bg-red-50 p-2 rounded transition">
                    <LogOut size={14}/> Sair do Painel
                </button>
            </div>
        </aside>

        {/* CONTENT AREA */}
        <main className="flex-1 overflow-y-auto p-8 relative">
            {loading && <div className="absolute top-4 right-4 text-xs font-bold text-brand-600 animate-pulse bg-white px-2 py-1 rounded shadow">Atualizando dados...</div>}

            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && stats && (
                <div className="animate-fade-in-up">
                    <h2 className="text-3xl font-bold mb-2">Visão Estratégica</h2>
                    <p className="text-gray-500 mb-8">Resumo executivo da operação.</p>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                        <KPICard title="MRR (Receita Recorrente)" value={stats.mrr.toLocaleString('pt-BR', {minimumFractionDigits: 2})} prefix="R$ " icon={DollarSign} color="bg-green-500" trend={8.5} />
                        <KPICard title="ARR (Anualizado)" value={stats.arr.toLocaleString('pt-BR', {minimumFractionDigits: 2})} prefix="R$ " icon={TrendingUp} color="bg-blue-500" subtext="Projeção baseada no mês atual" />
                        <KPICard title="Total Assinantes" value={stats.totalSubscribers} icon={Users} color="bg-brand-500" trend={2.1} />
                        <KPICard title="Churn Rate" value={stats.churnRate} prefix="" icon={AlertCircle} color="bg-red-500" trend={-0.5} subtext="Média dos últimos 30 dias" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <h3 className="font-bold mb-6 flex items-center gap-2"><DollarSign size={20} className="text-green-600"/> Composição de Receita</h3>
                            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                <p className="text-gray-400 font-medium">Gráfico de Receita (Mock)</p>
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <h3 className="font-bold mb-6 flex items-center gap-2"><Brain size={20} className="text-purple-600"/> Consumo de IA vs Custo</h3>
                            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                <p className="text-gray-400 font-medium">Gráfico de Tokens (Mock)</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* SUBSCRIBERS TAB */}
            {activeTab === 'subscribers' && (
                <div className="animate-fade-in-up">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-2xl font-bold">Gerenciar Assinantes</h2>
                            <p className="text-gray-500 text-sm">Base total de usuários ativos e inativos.</p>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                            <input 
                                className="pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-brand-500 outline-none w-64" 
                                placeholder="Buscar por nome ou email..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 uppercase font-bold text-xs">
                                <tr>
                                    <th className="px-6 py-4">Assinante</th>
                                    <th className="px-6 py-4">Plano / Ciclo</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Uso (IA / Alunos)</th>
                                    <th className="px-6 py-4">Próx. Cobrança</th>
                                    <th className="px-6 py-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {subscribers.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).map(sub => (
                                    <tr key={sub.id} className="hover:bg-gray-50/50">
                                        <td className="px-6 py-4">
                                            <p className="font-bold text-gray-900">{sub.name}</p>
                                            <p className="text-xs text-gray-500">{sub.email}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${sub.plan === PlanTier.PREMIUM ? 'bg-purple-100 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>{sub.plan}</span>
                                            <p className="text-xs text-gray-400 mt-1">{sub.cycle}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                                sub.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 
                                                sub.status === 'OVERDUE' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                                            }`}>
                                                {sub.status === 'ACTIVE' ? 'Ativo' : sub.status === 'OVERDUE' ? 'Atrasado' : sub.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Brain size={12} className="text-purple-500"/> 
                                                <div className="w-16 bg-gray-200 h-1.5 rounded-full overflow-hidden">
                                                    <div className="bg-purple-500 h-full" style={{width: `${(sub.creditsUsed/sub.creditsLimit)*100}%`}}></div>
                                                </div>
                                                <span className="text-xs">{sub.creditsUsed}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Users size={12} className="text-brand-500"/> 
                                                <div className="w-16 bg-gray-200 h-1.5 rounded-full overflow-hidden">
                                                    <div className="bg-brand-500 h-full" style={{width: `${(sub.studentsActive/sub.studentsLimit)*100}%`}}></div>
                                                </div>
                                                <span className="text-xs">{sub.studentsActive}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs text-gray-500">{sub.nextBilling}</td>
                                        <td className="px-6 py-4 text-right">
                                            {canAccess(['super_admin', 'operacional']) && (
                                                <button onClick={() => handleGrantCredits(sub.id)} className="text-brand-600 hover:text-brand-800 font-bold text-xs border border-brand-200 px-3 py-1 rounded-lg hover:bg-brand-50 transition">
                                                    + Créditos
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* SITE CONFIG TAB */}
            {activeTab === 'site' && siteConfig && (
                <div className="max-w-3xl animate-fade-in-up">
                    <h2 className="text-2xl font-bold mb-6">Configuração da Landing Page</h2>
                    
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Headline Principal</label>
                            <input 
                                className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none" 
                                value={siteConfig.headline}
                                onChange={e => setSiteConfig({...siteConfig, headline: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Subheadline</label>
                            <textarea 
                                className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none" 
                                rows={2}
                                value={siteConfig.subheadline}
                                onChange={e => setSiteConfig({...siteConfig, subheadline: e.target.value})}
                            />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Preço PRO (Mensal)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">R$</span>
                                    <input 
                                        type="number" 
                                        className="w-full pl-10 border p-3 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                                        value={siteConfig.pricing.pro_monthly}
                                        onChange={e => setSiteConfig({...siteConfig, pricing: {...siteConfig.pricing, pro_monthly: Number(e.target.value)}})}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Preço MASTER (Mensal)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">R$</span>
                                    <input 
                                        type="number" 
                                        className="w-full pl-10 border p-3 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                                        value={siteConfig.pricing.master_monthly}
                                        onChange={e => setSiteConfig({...siteConfig, pricing: {...siteConfig.pricing, master_monthly: Number(e.target.value)}})}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 flex justify-end">
                            <button onClick={handleSaveConfig} className="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-800 transition shadow-lg">
                                <Save size={18}/> Salvar Alterações e Publicar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ADMINS TAB (RBAC) */}
            {activeTab === 'admins' && (
                <div className="animate-fade-in-up">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold">Gestão de Administradores</h2>
                        <button className="bg-brand-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2">
                            <PlusCircle size={18}/> Novo Admin
                        </button>
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500 uppercase font-bold text-xs">
                                <tr>
                                    <th className="px-6 py-4">Nome / Email</th>
                                    <th className="px-6 py-4">Role</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {admins.map(adm => (
                                    <tr key={adm.id} className="border-b border-gray-100 last:border-0">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-xs">{adm.name.charAt(0)}</div>
                                                <div>
                                                    <p className="font-bold text-gray-900">{adm.name}</p>
                                                    <p className="text-xs text-gray-500">{adm.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-bold uppercase">{adm.role.replace('_', ' ')}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-green-600 font-bold text-xs flex items-center gap-1"><CheckCircle size={12}/> Ativo</span>
                                        </td>
                                        <td className="px-6 py-4 text-right flex justify-end gap-2">
                                            <button className="p-2 hover:bg-gray-100 rounded text-gray-500"><Edit3 size={16}/></button>
                                            <button className="p-2 hover:bg-red-50 rounded text-red-500"><Trash2 size={16}/></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* LOGS TAB */}
            {activeTab === 'logs' && (
                <div className="animate-fade-in-up">
                    <h2 className="text-2xl font-bold mb-6">Auditoria e Logs</h2>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500 uppercase font-bold text-xs">
                                <tr>
                                    <th className="px-6 py-4">Data/Hora</th>
                                    <th className="px-6 py-4">Admin</th>
                                    <th className="px-6 py-4">Ação</th>
                                    <th className="px-6 py-4">Alvo</th>
                                    <th className="px-6 py-4">Detalhes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => (
                                    <tr key={log.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                                        <td className="px-6 py-4 font-mono text-xs text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                                        <td className="px-6 py-4 font-bold text-gray-900">{log.adminName}</td>
                                        <td className="px-6 py-4"><span className="bg-gray-100 px-2 py-1 rounded text-xs font-bold">{log.action}</span></td>
                                        <td className="px-6 py-4 text-gray-600">{log.target}</td>
                                        <td className="px-6 py-4 text-gray-500 italic">{log.details}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* PLACEHOLDERS FOR OTHER TABS */}
            {(activeTab === 'financial' || activeTab === 'products') && (
                <div className="flex flex-col items-center justify-center h-96 text-center animate-fade-in-up">
                    <Lock className="text-gray-200 h-24 w-24 mb-4"/>
                    <h2 className="text-2xl font-bold text-gray-400">Módulo em Desenvolvimento</h2>
                    <p className="text-gray-400">Esta seção estará disponível na próxima sprint.</p>
                </div>
            )}

        </main>
    </div>
  );
};
