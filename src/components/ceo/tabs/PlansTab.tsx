import React, { useState, useEffect, useCallback } from 'react';
import { PlusCircle, RefreshCw, Save, Edit3, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import { AdminService } from '../../../services/adminService';
import type { AdminUser, Plan } from '../../../types';
import { Badge } from '../shared/Badge';
import { PLAN_COLOR } from '../shared/planColors';

export const PlansTab = ({ adminUser }: { adminUser: AdminUser }) => {
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
