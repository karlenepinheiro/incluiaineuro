import React, { useState } from 'react';
import { X, Copy, ExternalLink, CheckCircle, User, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  buildPendingAccountInstructions,
  reconcilePendingPurchases,
  type KiwifyPurchaseRow,
  type ReconcileResult,
} from '../../services/ceoService';
import type { AdminUser } from '../../types';

interface Props {
  open: boolean;
  purchases: KiwifyPurchaseRow[];
  onClose: () => void;
  onReconcileSuccess?: (results: ReconcileResult[]) => void;
  adminUser?: AdminUser;
}

export const PendingPurchasesDrawer: React.FC<Props> = ({
  open,
  purchases,
  onClose,
  onReconcileSuccess,
  adminUser,
}) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResults, setReconcileResults] = useState<ReconcileResult[] | null>(null);
  const [reconcileConfirm, setReconcileConfirm] = useState(false);
  const [reconcileReason, setReconcileReason] = useState('');
  const [reconcileError, setReconcileError] = useState('');

  if (!open) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };

  const handleReconcile = () => {
    setReconcileConfirm(true);
    setReconcileReason('');
    setReconcileError('');
  };

  const confirmReconcile = async () => {
    if (!reconcileReason.trim()) { setReconcileError('Motivo administrativo é obrigatório.'); return; }
    setReconcileConfirm(false);
    setReconcileReason('');
    setReconcileError('');
    setReconciling(true);
    try {
      const results = await reconcilePendingPurchases(adminUser, reconcileReason, 'pending_purchases_drawer');
      setReconcileResults(results);
      onReconcileSuccess?.(results);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setReconciling(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/25 z-40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 h-full w-full bg-white shadow-2xl z-50 flex flex-col"
        style={{ maxWidth: 480 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900 text-base">Compras Sem Conta</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {purchases.length === 0
                ? 'Nenhuma compra pendente'
                : `${purchases.length} comprador${purchases.length > 1 ? 'es' : ''} pagou${purchases.length > 1 ? 'ram' : ''} mas não criou conta`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReconcile}
              disabled={reconciling || purchases.length === 0}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition disabled:opacity-40"
            >
              {reconciling
                ? <RefreshCw size={11} className="animate-spin" />
                : <RefreshCw size={11} />}
              Reconciliar
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Reconcile results */}
        {reconcileResults !== null && (
          <div className="mx-4 mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
            <p className="font-semibold mb-1.5">Resultado da reconciliação:</p>
            {reconcileResults.length === 0 ? (
              <p className="text-blue-600">Nenhuma compra processada — as contas ainda não existem no sistema.</p>
            ) : (
              <ul className="space-y-1">
                {reconcileResults.map((r, i) => (
                  <li key={i} className="flex gap-2 items-start">
                    <span className="font-mono truncate text-blue-800">{r.purchase_email}</span>
                    <span className="text-blue-500 shrink-0">→ {r.result_action}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {purchases.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-300 gap-3">
              <CheckCircle size={36} strokeWidth={1.5} />
              <p className="text-sm font-medium text-gray-400">Nenhuma compra pendente de conta</p>
            </div>
          ) : (
            purchases.map(p => {
              const planLabel = p.plan_code
                ?? (p.credits_amount > 0 ? `+${p.credits_amount} créditos` : '—');
              const paidAt = p.paid_at
                ? new Date(p.paid_at).toLocaleDateString('pt-BR')
                : '—';
              const { whatsappUrl, text: instrText } = buildPendingAccountInstructions(p);
              return (
                <div
                  key={p.id}
                  className="rounded-2xl border border-gray-100 p-4 bg-gray-50/50 hover:border-gray-200 transition"
                >
                  {/* Identity row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                        <User size={14} className="text-gray-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-900 truncate">{p.email}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Plano <strong className="text-gray-600">{planLabel}</strong>
                          <span className="mx-1">·</span>
                          pago em {paidAt}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-md shrink-0">
                      {p.status}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                    >
                      <ExternalLink size={11} />
                      WhatsApp
                    </a>
                    <button
                      onClick={() => copyToClipboard(p.email, `email-${p.id}`)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                    >
                      {copied === `email-${p.id}` ? <CheckCircle size={11} className="text-emerald-500" /> : <Copy size={11} />}
                      {copied === `email-${p.id}` ? 'Copiado!' : 'Copiar email'}
                    </button>
                    <button
                      onClick={() => copyToClipboard(instrText, `ins-${p.id}`)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                    >
                      {copied === `ins-${p.id}` ? <CheckCircle size={11} className="text-emerald-500" /> : <Copy size={11} />}
                      {copied === `ins-${p.id}` ? 'Copiado!' : 'Copiar instruções'}
                    </button>
                  </div>

                  {/* Technical footer */}
                  {p.provider_order_id && (
                    <p className="mt-2 text-[10px] text-gray-300 font-mono">order: {p.provider_order_id}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Reconcile confirmation modal */}
      {reconcileConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 480, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <AlertTriangle size={20} color="#d97706" />
              <span style={{ fontWeight: 700, fontSize: 16, color: '#1a1a1a' }}>Reconciliar ativações pendentes?</span>
            </div>
            <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 8 }}>
              Esta ação executa uma reconciliação global das compras Kiwify aprovadas que ainda estão pendentes de ativação. Ela pode ativar outros tenants além do item visualizado, caso existam compras pendentes válidas.
            </p>
            <p style={{ fontSize: 12, color: '#92400e', fontWeight: 600, marginBottom: 16, background: '#fef3c7', padding: '8px 12px', borderRadius: 8 }}>
              Use apenas quando houver divergência real entre Kiwify, assinantes e tenants.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Motivo administrativo *
              </label>
              <input
                autoFocus
                style={{ width: '100%', border: `1px solid ${reconcileError ? '#dc2626' : '#d1d5db'}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                placeholder="Ex: Divergência detectada no painel, reconciliação solicitada pelo suporte"
                value={reconcileReason}
                onChange={e => { setReconcileReason(e.target.value); setReconcileError(''); }}
              />
              {reconcileError && (
                <p style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, marginTop: 4 }}>{reconcileError}</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setReconcileConfirm(false); setReconcileReason(''); setReconcileError(''); }}
                disabled={reconciling}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 13, cursor: 'pointer', color: '#374151', opacity: reconciling ? 0.5 : 1 }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmReconcile}
                disabled={reconciling}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#d97706', color: '#fff', fontSize: 13, fontWeight: 600, cursor: reconciling ? 'not-allowed' : 'pointer', opacity: reconciling ? 0.5 : 1 }}
              >
                {reconciling ? 'Reconciliando...' : 'Sim, reconciliar pendências'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
