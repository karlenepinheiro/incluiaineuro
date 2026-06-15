import React, { useState, useEffect, useCallback } from 'react';
import { PlusCircle, RefreshCw, Save, Edit3, Copy, Share2, Trash2, ToggleLeft, ToggleRight, AlertTriangle } from 'lucide-react';
import { getCoupons, upsertCoupon, toggleCoupon, deleteCoupon, buildCouponShareLink } from '../../../services/ceoService';
import type { CeoCoupon } from '../../../services/ceoService';
import type { AdminUser } from '../../../types';
import { Badge } from '../shared/Badge';

const EMPTY_COUPON: Partial<CeoCoupon> = {
  code: '', description: '', campaign_name: '', plan_code: undefined,
  billing_cycle: undefined, discount_type: 'percentage', discount_value: 0,
  checkout_url_override: '', valid_until: undefined, max_uses: undefined,
  is_active: true,
};

interface DeleteCouponModalProps {
  coupon: CeoCoupon;
  reason: string;
  onReasonChange: (v: string) => void;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}
const DeleteCouponModal: React.FC<DeleteCouponModalProps> = ({
  coupon, reason, onReasonChange, error, onConfirm, onClose, loading,
}) => (
  <div style={{
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, padding: 16,
  }}>
    <div style={{
      background: 'white', borderRadius: 16, padding: 28,
      width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <AlertTriangle size={20} style={{ color: '#DC2626' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontWeight: 800, fontSize: 15, color: '#111827', margin: 0 }}>Deletar cupom?</h3>
          <p style={{ fontSize: 12, color: '#6B7280', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {coupon.code}{coupon.campaign_name ? ` · ${coupon.campaign_name}` : ''}
          </p>
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
          CUPOM
        </span>
      </div>
      <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 10 }}>
        Esta ação removerá este cupom/campanha do painel administrativo. Links promocionais associados podem deixar de funcionar ou perder validade operacional.
      </p>
      <p style={{ fontSize: 12, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', marginBottom: 18 }}>
        Confirme apenas se o cupom não deve mais ser usado em campanhas comerciais.
      </p>
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
          Motivo administrativo <span style={{ color: '#EF4444' }}>*</span>
        </label>
        <textarea
          value={reason}
          onChange={e => onReasonChange(e.target.value)}
          disabled={loading}
          placeholder="Descreva o motivo para deletar este cupom…"
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box', borderRadius: 8,
            border: error ? '1.5px solid #EF4444' : '1.5px solid #E5E7EB',
            padding: '8px 10px', fontSize: 13, color: '#111827', resize: 'vertical',
            outline: 'none', fontFamily: 'inherit',
          }}
        />
        {error && <p style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}>{error}</p>}
      </div>
      {/* TODO: futura sprint — enviar motivo para tabela de auditoria administrativa */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onConfirm}
          disabled={loading || !reason.trim()}
          style={{
            flex: 1, padding: '10px', borderRadius: 8, border: 'none',
            background: loading || !reason.trim() ? '#9CA3AF' : '#DC2626',
            color: 'white', fontWeight: 700, fontSize: 13,
            cursor: loading || !reason.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Aguarde…' : 'Sim, deletar cupom'}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #E5E7EB', background: 'white', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  </div>
);

export const CouponsTab = ({ adminUser }: { adminUser: AdminUser }) => {
  const [coupons, setCoupons] = useState<CeoCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<CeoCoupon> | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CeoCoupon | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

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

  const handleDelete = (c: CeoCoupon) => {
    setDeleteTarget(c);
    setDeleteReason('');
    setDeleteError('');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (!deleteReason.trim()) {
      setDeleteError('Motivo administrativo é obrigatório.');
      return;
    }
    setDeleting(true);
    try {
      // TODO: futura sprint — enviar deleteReason para tabela de auditoria administrativa
      await deleteCoupon(deleteTarget.id, deleteTarget.code, adminUser);
      await load();
      setDeleteTarget(null);
      setDeleteReason('');
      setDeleteError('');
    } catch (e: any) {
      setDeleteError(e?.message ?? 'Erro ao deletar cupom.');
    } finally {
      setDeleting(false);
    }
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
                        <button onClick={() => handleDelete(c)} disabled={deleting} className="px-2 py-1 text-xs font-bold bg-red-50 text-red-600 rounded hover:bg-red-100 flex items-center gap-1 disabled:opacity-50">
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

      {deleteTarget && (
        <DeleteCouponModal
          coupon={deleteTarget}
          reason={deleteReason}
          onReasonChange={v => { setDeleteReason(v); if (deleteError) setDeleteError(''); }}
          error={deleteError}
          onConfirm={confirmDelete}
          onClose={() => { setDeleteTarget(null); setDeleteReason(''); setDeleteError(''); }}
          loading={deleting}
        />
      )}
    </div>
  );
};
