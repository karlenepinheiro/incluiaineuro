import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, XCircle, PlusCircle, RefreshCw } from 'lucide-react';
import { AdminService } from '../../../services/adminService';
import type { AdminUser, AdminRole } from '../../../types';

export const AdminsTab = ({ adminUser, setAdminUser }: { adminUser: AdminUser; setAdminUser: (u: AdminUser) => void }) => {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'viewer' as AdminRole });
  const [saving, setSaving] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<AdminUser | null>(null);
  const [toggleReason, setToggleReason] = useState('');
  const [toggleError, setToggleError] = useState('');
  const [toggleLoading, setToggleLoading] = useState(false);

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

  const handleToggleActive = (adm: AdminUser) => {
    setToggleTarget(adm);
    setToggleReason('');
    setToggleError('');
  };

  const confirmToggle = async () => {
    if (!toggleTarget) return;
    if (!toggleReason.trim()) { setToggleError('Motivo administrativo é obrigatório.'); return; }
    setToggleLoading(true);
    try {
      // TODO: future sprint — passar toggleReason para toggleAdminActive quando a função aceitar motivo para auditoria
      await AdminService.toggleAdminActive(toggleTarget.id, !toggleTarget.active, adminUser);
      setToggleTarget(null);
      setToggleReason('');
      setToggleError('');
      await load();
    } catch (e: any) { setToggleError(e.message); }
    finally { setToggleLoading(false); }
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
      {/* Toggle admin confirmation modal */}
      {toggleTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 440, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {toggleTarget.active
                ? <XCircle size={20} color="#dc2626" />
                : <CheckCircle size={20} color="#059669" />}
              <span style={{ fontWeight: 700, fontSize: 16, color: '#1a1a1a' }}>
                {toggleTarget.active ? 'Desativar administrador?' : 'Reativar administrador?'}
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 4 }}>
              Admin: <strong>{toggleTarget.name}</strong> ({toggleTarget.email})
            </p>
            <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 8 }}>
              Perfil: <strong>{toggleTarget.role.replace('_', ' ')}</strong>
            </p>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
              {toggleTarget.active
                ? 'Esta ação pode remover o acesso administrativo deste usuário ao painel de gestão. Confirme apenas se você tem certeza.'
                : 'Esta ação pode restaurar o acesso administrativo deste usuário ao painel de gestão. Confirme apenas se você tem certeza.'}
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Motivo administrativo *
              </label>
              <input
                autoFocus
                style={{ width: '100%', border: `1px solid ${toggleError ? '#dc2626' : '#d1d5db'}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                placeholder="Ex: Saída da equipe, revisão de acessos, reintegração aprovada"
                value={toggleReason}
                onChange={e => { setToggleReason(e.target.value); setToggleError(''); }}
              />
              {toggleError && (
                <p style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, marginTop: 4 }}>{toggleError}</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setToggleTarget(null); setToggleReason(''); setToggleError(''); }}
                disabled={toggleLoading}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 13, cursor: 'pointer', color: '#374151', opacity: toggleLoading ? 0.5 : 1 }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmToggle}
                disabled={toggleLoading}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: toggleTarget.active ? '#dc2626' : '#059669', color: '#fff', fontSize: 13, fontWeight: 600, cursor: toggleLoading ? 'not-allowed' : 'pointer', opacity: toggleLoading ? 0.5 : 1 }}
              >
                {toggleLoading
                  ? 'Aguarde...'
                  : toggleTarget.active ? 'Sim, desativar' : 'Sim, reativar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
