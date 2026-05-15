import React, { useState } from 'react';
import { X, Copy, ExternalLink, CheckCircle, User, RefreshCw } from 'lucide-react';
import {
  buildPendingAccountInstructions,
  reconcilePendingPurchases,
  type KiwifyPurchaseRow,
  type ReconcileResult,
} from '../../services/ceoService';

interface Props {
  open: boolean;
  purchases: KiwifyPurchaseRow[];
  onClose: () => void;
  onReconcileSuccess?: (results: ReconcileResult[]) => void;
}

export const PendingPurchasesDrawer: React.FC<Props> = ({
  open,
  purchases,
  onClose,
  onReconcileSuccess,
}) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResults, setReconcileResults] = useState<ReconcileResult[] | null>(null);

  if (!open) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };

  const handleReconcile = async () => {
    if (!confirm('Reconciliar todas as compras pendentes?\n\nIsso tentará ativar automaticamente as contas que já existem no sistema.')) return;
    setReconciling(true);
    try {
      const results = await reconcilePendingPurchases();
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
    </>
  );
};
