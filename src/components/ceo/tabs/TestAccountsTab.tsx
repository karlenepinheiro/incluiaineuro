import React, { useState, useEffect, useCallback } from 'react';
import { TestTube, PlusCircle, RefreshCw, CreditCard, Eye, EyeOff, XCircle, AlertTriangle } from 'lucide-react';
import { AdminService } from '../../../services/adminService';
import type { AdminUser, TestAccountDetail } from '../../../types';
import { Badge } from '../shared/Badge';
import { PLAN_COLOR } from '../shared/planColors';

interface DeactivateTestAccountModalProps {
  account: TestAccountDetail;
  reason: string;
  onReasonChange: (v: string) => void;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}
const DeactivateTestAccountModal: React.FC<DeactivateTestAccountModalProps> = ({
  account, reason, onReasonChange, error, onConfirm, onClose, loading,
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
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <AlertTriangle size={20} style={{ color: '#D97706' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontWeight: 800, fontSize: 15, color: '#111827', margin: 0 }}>Desativar conta de teste?</h3>
          <p style={{ fontSize: 12, color: '#6B7280', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {account.account_name}{account.email ? ` · ${account.email}` : ''}
          </p>
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
          TESTE
        </span>
      </div>
      <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 10 }}>
        Esta ação pode interromper o uso desta conta em validações internas, demonstrações ou testes operacionais.
      </p>
      <p style={{ fontSize: 12, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', marginBottom: 18 }}>
        Confirme apenas se esta conta de teste não deve continuar ativa.
      </p>
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
          Motivo administrativo <span style={{ color: '#EF4444' }}>*</span>
        </label>
        <textarea
          value={reason}
          onChange={e => onReasonChange(e.target.value)}
          disabled={loading}
          placeholder="Descreva o motivo para desativar esta conta de teste…"
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
            background: loading || !reason.trim() ? '#9CA3AF' : '#D97706',
            color: 'white', fontWeight: 700, fontSize: 13,
            cursor: loading || !reason.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Aguarde…' : 'Sim, desativar conta'}
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

export const TestAccountsTab = ({ adminUser }: { adminUser: AdminUser }) => {
  const [accounts, setAccounts] = useState<TestAccountDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Create form
  const emptyForm = { name: '', responsibleName: '', email: '', password: '', planCode: 'PRO', credits: 200, expiresAt: '', observation: '' };
  const [form, setForm] = useState(emptyForm);

  // Inline actions
  const [actionRow, setActionRow] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState(50);
  const [extendDate, setExtendDate] = useState('');

  // Deactivate modal
  const [deactivateTarget, setDeactivateTarget] = useState<TestAccountDetail | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivateError, setDeactivateError] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    const data = await AdminService.getTestAccountDetails();
    setAccounts(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const defaultExpiry = () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  };

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) {
      alert('Preencha nome, e-mail e senha.');
      return;
    }
    setSaving(true);
    try {
      const result = await AdminService.createTestAccountFromScratch({
        accountName: form.name,
        responsibleName: form.responsibleName || form.name,
        email: form.email,
        password: form.password,
        planCode: form.planCode,
        initialCredits: form.credits,
        expiresAt: form.expiresAt || defaultExpiry(),
        observation: form.observation,
        adminUser,
      });
      setForm(emptyForm);
      await loadAccounts();
      alert(result.message);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const handleAddCredits = async (tenantId: string) => {
    try {
      await AdminService.grantCredits(tenantId, creditAmount, 'Adição manual via painel CEO', adminUser);
      setActionRow(null);
      await loadAccounts();
      alert(`+${creditAmount} créditos adicionados.`);
    } catch (e: any) { alert(e.message); }
  };

  const handleExtend = async (tenantId: string) => {
    if (!extendDate) { alert('Selecione nova data de vencimento.'); return; }
    try {
      await AdminService.extendTestAccount(tenantId, extendDate, adminUser);
      setActionRow(null);
      await loadAccounts();
      alert('Vencimento prorrogado.');
    } catch (e: any) { alert(e.message); }
  };

  const handleDeactivate = (acc: TestAccountDetail) => {
    setDeactivateTarget(acc);
    setDeactivateReason('');
    setDeactivateError('');
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    if (!deactivateReason.trim()) {
      setDeactivateError('Motivo administrativo é obrigatório.');
      return;
    }
    setDeactivating(true);
    try {
      // TODO: futura sprint — enviar deactivateReason para tabela de auditoria administrativa
      await AdminService.updateTestAccountStatus(deactivateTarget.tenant_id, 'suspended', adminUser);
      await loadAccounts();
      setDeactivateTarget(null);
      setDeactivateReason('');
      setDeactivateError('');
    } catch (e: any) {
      setDeactivateError(e?.message ?? 'Erro ao desativar conta de teste.');
    } finally {
      setDeactivating(false);
    }
  };

  const inp = 'w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none';

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1">Contas de Teste</h2>
      <p className="text-gray-400 text-sm mb-6">Crie contas internas do zero, sem pagamento real.</p>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
        {/* ── Formulário ── */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 self-start">
          <h3 className="font-bold text-sm text-gray-700 mb-4 flex items-center gap-2">
            <TestTube size={16} className="text-green-600" /> Criar Conta de Teste
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nome da conta *</label>
                <input className={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Escola Modelo" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Responsável</label>
                <input className={inp} value={form.responsibleName} onChange={e => setForm({ ...form, responsibleName: e.target.value })} placeholder="Nome do responsável" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">E-mail *</label>
              <input type="email" className={inp} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="usuario@email.com" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Senha *</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} className={inp + ' pr-9'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Plano</label>
                <select className={inp} value={form.planCode} onChange={e => setForm({ ...form, planCode: e.target.value })}>
                  <option value="FREE">FREE — Starter</option>
                  <option value="PRO">PRO — Profissional</option>
                  <option value="MASTER">PREMIUM — Clínicas/Escolas</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Créditos iniciais</label>
                <input type="number" min={0} className={inp} value={form.credits} onChange={e => setForm({ ...form, credits: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Vencimento (padrão: +30 dias)</label>
              <input type="date" className={inp} value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Observação</label>
              <input className={inp} value={form.observation} onChange={e => setForm({ ...form, observation: e.target.value })} placeholder="Ex: Demo parceiro X, teste QA" />
            </div>
            <button
              onClick={handleCreate}
              disabled={saving || !form.name || !form.email || !form.password}
              className="w-full bg-green-600 text-white py-2 rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <PlusCircle size={14} />} Criar Conta
            </button>
          </div>
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs text-amber-700 font-medium">⚠️ Cria tenant + usuário + assinatura INTERNAL_TEST do zero. Sem cobrança real.</p>
          </div>
        </div>

        {/* ── Listagem ── */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 font-bold text-sm text-gray-700 flex items-center justify-between">
              Contas de Teste
              <button onClick={loadAccounts} className="p-1 hover:bg-gray-100 rounded text-gray-400"><RefreshCw size={13} /></button>
            </div>
            {loading ? (
              <div className="p-6 text-center text-gray-400 text-sm">Carregando...</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {accounts.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">Nenhuma conta de teste.</div>
                ) : accounts.map(acc => (
                  <div key={acc.tenant_id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-900 text-sm">{acc.account_name}</span>
                          <Badge color={PLAN_COLOR[acc.plan_code] ?? 'gray'}>{acc.plan_code}</Badge>
                          <Badge color={acc.status === 'active' ? 'green' : acc.status === 'suspended' ? 'red' : 'gray'}>
                            {acc.status === 'active' ? 'Ativa' : acc.status === 'suspended' ? 'Suspensa' : 'Expirada'}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{acc.email}</p>
                        <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                          <span>Créditos: <strong className="text-gray-700">{acc.credits_remaining}/{acc.initial_credits}</strong></span>
                          {acc.expires_at && <span>Vence: <strong className="text-gray-700">{new Date(acc.expires_at).toLocaleDateString('pt-BR')}</strong></span>}
                          {acc.observation && <span className="truncate max-w-[160px]" title={acc.observation}>{acc.observation}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          title="Adicionar créditos"
                          onClick={() => { setActionRow(actionRow === acc.tenant_id + '_credits' ? null : acc.tenant_id + '_credits'); }}
                          className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition"
                        ><CreditCard size={14} /></button>
                        <button
                          title="Prorrogar"
                          onClick={() => { setActionRow(actionRow === acc.tenant_id + '_extend' ? null : acc.tenant_id + '_extend'); setExtendDate(''); }}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition"
                        ><RefreshCw size={14} /></button>
                        {acc.status === 'active' && (
                          <button
                            title="Desativar"
                            onClick={() => handleDeactivate(acc)}
                            disabled={deactivating}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition disabled:opacity-50"
                          ><XCircle size={14} /></button>
                        )}
                      </div>
                    </div>

                    {/* Painel: Adicionar créditos */}
                    {actionRow === acc.tenant_id + '_credits' && (
                      <div className="mt-3 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                        <span className="text-xs text-green-700 font-medium shrink-0">+ Créditos:</span>
                        <input type="number" min={1} className="border rounded-lg px-2 py-1 text-sm w-20" value={creditAmount} onChange={e => setCreditAmount(Number(e.target.value))} />
                        <button onClick={() => handleAddCredits(acc.tenant_id)} className="bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-green-700 transition">Adicionar</button>
                        <button onClick={() => setActionRow(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
                      </div>
                    )}

                    {/* Painel: Prorrogar */}
                    {actionRow === acc.tenant_id + '_extend' && (
                      <div className="mt-3 flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                        <span className="text-xs text-blue-700 font-medium shrink-0">Nova data:</span>
                        <input type="date" className="border rounded-lg px-2 py-1 text-sm" value={extendDate} onChange={e => setExtendDate(e.target.value)} />
                        <button onClick={() => handleExtend(acc.tenant_id)} className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-blue-700 transition">Prorrogar</button>
                        <button onClick={() => setActionRow(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {deactivateTarget && (
        <DeactivateTestAccountModal
          account={deactivateTarget}
          reason={deactivateReason}
          onReasonChange={v => { setDeactivateReason(v); if (deactivateError) setDeactivateError(''); }}
          error={deactivateError}
          onConfirm={confirmDeactivate}
          onClose={() => { setDeactivateTarget(null); setDeactivateReason(''); setDeactivateError(''); }}
          loading={deactivating}
        />
      )}
    </div>
  );
};
