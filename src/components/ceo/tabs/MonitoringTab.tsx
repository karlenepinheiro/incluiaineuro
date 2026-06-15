import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle, Zap, Clock } from 'lucide-react';
import { AdminService } from '../../../services/adminService';
import { SubscriptionStatusBadge } from '../../SubscriptionStatusBadge';
import type { AdminUser, Subscriber } from '../../../types';

type PanelMode = 'credit' | 'extend' | 'alert';
type ActivePanel = { subId: string; mode: PanelMode } | null;

export const MonitoringTab = ({ adminUser }: { adminUser: AdminUser }) => {
  const [filter, setFilter] = useState<'low_credit' | 'overdue' | 'expiring'>('low_credit');
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [panelCredits, setPanelCredits] = useState('');
  const [panelReason, setPanelReason] = useState('');
  const [panelDate, setPanelDate] = useState('');
  const [panelMsg, setPanelMsg] = useState('');
  const [panelError, setPanelError] = useState('');

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

  const openPanel = (subId: string, mode: PanelMode) => {
    if (activePanel?.subId === subId && activePanel.mode === mode) {
      setActivePanel(null);
      return;
    }
    setActivePanel({ subId, mode });
    setPanelCredits('');
    setPanelReason('');
    setPanelDate(new Date().toISOString().slice(0, 10));
    setPanelMsg('');
    setPanelError('');
  };

  const closePanel = () => setActivePanel(null);

  const submitCredit = (sub: Subscriber) => {
    const amt = Number(panelCredits);
    if (!panelCredits || isNaN(amt) || amt <= 0) {
      setPanelError('Informe uma quantidade válida (número maior que zero).');
      return;
    }
    if (!panelReason.trim()) {
      setPanelError('Motivo administrativo é obrigatório.');
      return;
    }
    closePanel();
    doAction(sub.id, () => AdminService.grantCredits(sub.tenant_id, amt, panelReason.trim(), adminUser));
  };

  const submitExtend = (sub: Subscriber) => {
    if (!panelDate) {
      setPanelError('Data de vencimento é obrigatória.');
      return;
    }
    if (!panelReason.trim()) {
      setPanelError('Motivo administrativo é obrigatório.');
      return;
    }
    closePanel();
    // TODO: future sprint — incluir panelReason no audit trail (AdminService.extendSubscription não aceita reason atualmente)
    doAction(sub.id, () => AdminService.extendSubscription(sub.tenant_id, panelDate, adminUser));
  };

  const submitAlert = (sub: Subscriber) => {
    if (!panelMsg.trim()) {
      setPanelError('Mensagem de alerta é obrigatória.');
      return;
    }
    closePanel();
    doAction(sub.id, () => AdminService.sendCustomAlert(sub.tenant_id, panelMsg.trim(), adminUser));
  };

  const inp = 'border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-gray-300 outline-none bg-white';

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
                <React.Fragment key={sub.id}>
                  <tr className="hover:bg-gray-50/50">
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
                          <button
                            onClick={() => openPanel(sub.id, 'alert')}
                            className={`px-2 py-1 text-xs font-bold rounded transition ${activePanel?.subId === sub.id && activePanel.mode === 'alert' ? 'bg-orange-200 text-orange-800' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'}`}
                          ><AlertCircle size={11} className="inline mr-0.5" /> Alerta</button>
                          <button
                            onClick={() => openPanel(sub.id, 'credit')}
                            className={`px-2 py-1 text-xs font-bold rounded transition ${activePanel?.subId === sub.id && activePanel.mode === 'credit' ? 'bg-purple-200 text-purple-800' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}
                          ><Zap size={11} className="inline mr-0.5" /> Crédito</button>
                          <button
                            onClick={() => openPanel(sub.id, 'extend')}
                            className={`px-2 py-1 text-xs font-bold rounded transition ${activePanel?.subId === sub.id && activePanel.mode === 'extend' ? 'bg-blue-200 text-blue-800' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                          ><Clock size={11} className="inline mr-0.5" /> Prazo</button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* ── Painel inline de ação ──────────────────────────────────── */}
                  {activePanel?.subId === sub.id && (
                    <tr>
                      <td colSpan={4} className="px-5 pb-4 pt-0">

                        {/* Créditos */}
                        {activePanel.mode === 'credit' && (
                          <div className="flex flex-wrap items-end gap-3 p-3 bg-purple-50 border border-purple-200 rounded-xl mt-1">
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-bold text-purple-800">Quantidade de créditos *</label>
                              <input
                                type="number"
                                min={1}
                                className={`${inp} w-28`}
                                placeholder="ex: 50"
                                value={panelCredits}
                                onChange={e => { setPanelCredits(e.target.value); setPanelError(''); }}
                              />
                            </div>
                            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                              <label className="text-xs font-bold text-purple-800">Motivo administrativo *</label>
                              <input
                                className={`${inp} w-full`}
                                placeholder="Ex: Compensação por instabilidade reportada"
                                value={panelReason}
                                onChange={e => { setPanelReason(e.target.value); setPanelError(''); }}
                              />
                            </div>
                            {panelError && <p className="w-full text-xs text-red-600 font-semibold">{panelError}</p>}
                            <div className="flex gap-2 shrink-0 items-center">
                              <button onClick={() => submitCredit(sub)} className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-purple-700 transition">Conceder créditos</button>
                              <button onClick={closePanel} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
                            </div>
                          </div>
                        )}

                        {/* Prorrogar prazo */}
                        {activePanel.mode === 'extend' && (
                          <div className="flex flex-wrap items-end gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl mt-1">
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-bold text-blue-800">Nova data de vencimento *</label>
                              <input
                                type="date"
                                className={`${inp} w-40`}
                                value={panelDate}
                                onChange={e => { setPanelDate(e.target.value); setPanelError(''); }}
                              />
                            </div>
                            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                              <label className="text-xs font-bold text-blue-800">Motivo administrativo *</label>
                              <input
                                className={`${inp} w-full`}
                                placeholder="Ex: Cortesia aprovada — ticket #1234"
                                value={panelReason}
                                onChange={e => { setPanelReason(e.target.value); setPanelError(''); }}
                              />
                            </div>
                            {panelError && <p className="w-full text-xs text-red-600 font-semibold">{panelError}</p>}
                            <div className="flex gap-2 shrink-0 items-center">
                              <button onClick={() => submitExtend(sub)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 transition">Prorrogar</button>
                              <button onClick={closePanel} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
                            </div>
                          </div>
                        )}

                        {/* Alerta ao usuário */}
                        {activePanel.mode === 'alert' && (
                          <div className="flex flex-wrap items-end gap-3 p-3 bg-orange-50 border border-orange-200 rounded-xl mt-1">
                            <div className="flex flex-col gap-1 flex-1 min-w-[260px]">
                              <label className="text-xs font-bold text-orange-800">Mensagem de alerta para o usuário *</label>
                              <input
                                className={`${inp} w-full`}
                                placeholder="Ex: Seu plano está próximo do limite de créditos"
                                value={panelMsg}
                                onChange={e => { setPanelMsg(e.target.value); setPanelError(''); }}
                              />
                            </div>
                            {panelError && <p className="w-full text-xs text-red-600 font-semibold">{panelError}</p>}
                            <div className="flex gap-2 shrink-0 items-center">
                              <button onClick={() => submitAlert(sub)} className="bg-orange-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-700 transition">Enviar alerta</button>
                              <button onClick={closePanel} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
                            </div>
                          </div>
                        )}

                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {subscribers.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">Nenhum assinante nesta lista.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
