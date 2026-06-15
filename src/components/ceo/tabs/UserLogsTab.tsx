import React, { useState, useEffect, useCallback } from 'react';
import { Search, FileText, RefreshCw } from 'lucide-react';
import { AdminService } from '../../../services/adminService';
import type { UserActivityLog } from '../../../types';

export const UserLogsTab = () => {
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
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('﻿' + csv);
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
