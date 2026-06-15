import React, { useState, useEffect, useCallback } from 'react';
import { Search, FileText, RefreshCw } from 'lucide-react';
import { getAdminAuditLog } from '../../../services/ceoService';
import type { AdminAuditEntry } from '../../../services/ceoService';

export const LogsTab = () => {
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
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('﻿' + csv);
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
