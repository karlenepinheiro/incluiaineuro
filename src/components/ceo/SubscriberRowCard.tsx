import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown, ChevronUp, MoreHorizontal, Zap, Package, Lock,
  Copy, ExternalLink, CheckCircle, XCircle, RefreshCw, Gift,
  TestTube, AlertTriangle, Phone, FileText, Edit3,
} from 'lucide-react';
import type { AdminUser } from '../../types';
import type { CeoSubscriber, KiwifyPurchaseRow } from '../../services/ceoService';

type DivergenceKind = 'paid_but_free' | 'plan_mismatch';
type IntegrityKind = 'no_owner' | 'no_subscription' | 'wallet_mismatch';

interface DivergenceInfo { kind: DivergenceKind; label: string; }
interface IntegrityFlag { kind: IntegrityKind; label: string; color: string; }

interface Props {
  sub: CeoSubscriber;
  kiwifyPurchase: KiwifyPurchaseRow | null;
  divergence: DivergenceInfo | null;
  integrityFlags: IntegrityFlag[];
  actionLoading: boolean;
  adminUser: AdminUser;
  onGrantCredits: (tenantId: string, amount: number, reason: string) => Promise<void>;
  onChangePlan: (tenantId: string, plan: string) => Promise<void>;
  onGrantCourtesy: (tenantId: string, reason: string) => Promise<void>;
  onSuspend: (tenantId: string) => Promise<void>;
  onReactivate: (tenantId: string) => Promise<void>;
  onResetPassword: (email: string, name: string) => void;
  onMarkInternal: (tenantId: string, tenantName: string) => void | Promise<void>;
  onFixDivergence?: (tenantId: string) => Promise<void>;
  onEditContact?: (email: string, phone: string | null, cpf: string | null, name: string) => void;
}

const PLAN_CHIP: Record<string, string> = {
  FREE:          'bg-gray-100 text-gray-500',
  PRO:           'bg-blue-100 text-blue-700',
  MASTER:        'bg-violet-100 text-violet-700',
  INSTITUTIONAL: 'bg-emerald-100 text-emerald-700',
};

const STATUS_DOT: Record<string, string> = {
  ACTIVE:        'bg-emerald-400',
  OVERDUE:       'bg-red-400',
  TRIAL:         'bg-blue-400',
  CANCELED:      'bg-gray-300',
  COURTESY:      'bg-amber-400',
  INTERNAL_TEST: 'bg-violet-400',
  PENDING:       'bg-yellow-400',
};

/** Mascara CPF: mostra apenas os 2 últimos dígitos verificadores */
function maskCPF(cpf: string | null | undefined): string {
  if (!cpf) return '—';
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return '***.***.***-**';
  return `***.***.***-${d.slice(9)}`;
}

/** Mascara telefone: mostra DDD + últimos 4 dígitos */
function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const d = phone.replace(/\D/g, '');
  if (d.length < 10) return phone;
  return `(${d.slice(0,2)}) *****-${d.slice(-4)}`;
}

type ActionPanel = 'credits' | 'plan' | 'courtesy';

export const SubscriberRowCard: React.FC<Props> = ({
  sub,
  kiwifyPurchase: kp,
  divergence,
  integrityFlags,
  actionLoading,
  adminUser,
  onGrantCredits,
  onChangePlan,
  onGrantCourtesy,
  onSuspend,
  onReactivate,
  onResetPassword,
  onMarkInternal,
  onFixDivergence,
  onEditContact,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [panel, setPanel] = useState<ActionPanel | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [credits, setCredits] = useState('');
  const [reason, setReason] = useState('');
  const [plan, setPlan] = useState('PRO');
  const [emailCopied, setEmailCopied] = useState(false);
  const [highlightKiwify, setHighlightKiwify] = useState(false);
  const [orderIdCopied, setOrderIdCopied] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const creditsUsed = Math.max(0, (sub.credits_limit ?? 0) - (sub.credits_remaining ?? 0));
  const credPct     = Math.min(100, (creditsUsed / Math.max(1, sub.credits_limit ?? 1)) * 100);
  const studPct     = Math.min(100, ((sub.students_active ?? 0) / Math.max(1, sub.student_limit ?? 1)) * 100);
  const nextBilling = sub.next_due_date ? new Date(sub.next_due_date).toLocaleDateString('pt-BR') : '—';

  const hasContactData = !!(sub.user_phone || sub.user_cpf);
  const hasIssue       = !!divergence || integrityFlags.length > 0;
  const dot            = STATUS_DOT[sub.subscription_status ?? ''] ?? 'bg-gray-300';
  const canAct         = ['super_admin', 'operacional'].includes(adminUser.role);

  const openPanel = (mode: ActionPanel) => {
    setExpanded(true);
    setPanel(p => (p === mode ? null : mode));
    setCredits('');
    setReason('');
    setPlan('PRO');
    setMenuOpen(false);
  };

  const confirmAction = async () => {
    if (!panel) return;
    if (panel === 'credits') {
      const amt = Number(credits);
      if (!amt || !reason.trim()) { alert('Preencha quantidade e motivo.'); return; }
      await onGrantCredits(sub.tenant_id, amt, reason);
    } else if (panel === 'plan') {
      await onChangePlan(sub.tenant_id, plan);
    } else if (panel === 'courtesy') {
      if (!reason.trim()) { alert('Informe o motivo da cortesia.'); return; }
      await onGrantCourtesy(sub.tenant_id, reason);
    }
    setPanel(null);
  };

  const copyEmail = () => {
    navigator.clipboard.writeText(sub.user_email ?? '');
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 1500);
    setMenuOpen(false);
  };

  return (
    <div
      className={`rounded-2xl border transition-all
        ${hasIssue ? 'border-red-200 bg-red-50/20' : 'border-gray-100 bg-white'}
        ${actionLoading ? 'opacity-60 pointer-events-none' : ''}`}
    >
      {/* ── Main row ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Status indicator */}
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />

        {/* Identity */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm text-gray-900 truncate leading-none">
              {sub.tenant_name || '—'}
            </span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide leading-none ${PLAN_CHIP[sub.plan_code ?? ''] ?? 'bg-gray-100 text-gray-500'}`}>
              {sub.plan_code}
            </span>
            {/* Cadastro incompleto — sem phone/cpf */}
            {!hasContactData && (
              <span className="text-[8px] font-bold px-1 py-0.5 rounded border leading-none bg-amber-50 text-amber-600 border-amber-200" title="Sem telefone e CPF cadastrados">
                INCOMPLETO
              </span>
            )}
            {/* Integrity flags */}
            {integrityFlags.map(f => (
              <span key={f.kind} className={`text-[8px] font-bold px-1 py-0.5 rounded border leading-none ${f.color}`}>
                {f.label}
              </span>
            ))}
            {divergence && (
              <span className="text-[8px] font-bold px-1 py-0.5 rounded border leading-none bg-red-50 text-red-600 border-red-200">
                {divergence.label}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 truncate mt-0.5 leading-none">
            {sub.user_email || <span className="text-red-400 font-semibold">SEM EMAIL</span>}
          </p>
          {/* Contato mascarado — só no card, não exposto em listas públicas */}
          {hasContactData && (
            <p className="text-[10px] text-gray-400 mt-0.5 leading-none font-mono">
              {sub.user_phone ? maskPhone(sub.user_phone) : '—'} · {maskCPF(sub.user_cpf)}
            </p>
          )}
        </div>

        {/* Credits minibar */}
        <div className="hidden sm:block shrink-0 w-28">
          <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
            <span
              title={sub.plan_code === 'FREE'
                ? 'Créditos gratuitos — plano FREE não é assinatura paga'
                : 'Créditos disponíveis'}
              className={sub.plan_code === 'FREE' ? 'text-gray-400 cursor-help' : ''}
            >
              {sub.plan_code === 'FREE' ? 'Créd. gratuitos' : 'Créditos'}
            </span>
            <span className="tabular-nums text-gray-500">{sub.credits_remaining ?? 0}</span>
          </div>
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${100 - credPct}%`,
                background: credPct > 80 ? '#f87171' : credPct > 50 ? '#fbbf24' : '#a78bfa',
              }}
            />
          </div>
        </div>

        {/* Students minibar */}
        <div className="hidden md:block shrink-0 w-20">
          <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
            <span>Alunos</span>
            <span className="tabular-nums text-gray-500">{sub.students_active ?? 0}/{sub.student_limit ?? 0}</span>
          </div>
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400 rounded-full transition-all"
              style={{ width: `${studPct}%` }}
            />
          </div>
        </div>

        {/* Next billing */}
        <div className="hidden lg:block text-[11px] text-gray-400 tabular-nums shrink-0 w-14 text-right">
          {nextBilling}
        </div>

        {/* Alert indicator */}
        {hasIssue && (
          <div className="hidden sm:flex shrink-0">
            <AlertTriangle size={14} className="text-red-400" />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {canAct && (
            divergence?.kind === 'paid_but_free' ? (
              <button
                onClick={() => onFixDivergence?.(sub.tenant_id)}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition"
              >
                <RefreshCw size={10} />
                Corrigir agora
              </button>
            ) : (
              <button
                onClick={() => openPanel('credits')}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition"
              >
                <Zap size={10} />
                Resolver
              </button>
            )
          )}

          {/* ··· menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
              aria-label="Mais opções"
            >
              <MoreHorizontal size={14} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl border border-gray-100 shadow-xl z-50 py-1 overflow-hidden">
                {canAct && (
                  <>
                    <button
                      onClick={() => openPanel('credits')}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Zap size={12} className="text-violet-500" />Conceder / estornar créditos
                    </button>
                    <button
                      onClick={() => openPanel('plan')}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Package size={12} className="text-blue-500" />Alterar plano
                    </button>
                    <button
                      onClick={() => openPanel('courtesy')}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Gift size={12} className="text-amber-500" />Conceder cortesia
                    </button>
                    {sub.subscription_status === 'ACTIVE' ? (
                      <button
                        onClick={() => { onSuspend(sub.tenant_id); setMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <XCircle size={12} />Suspender assinatura
                      </button>
                    ) : (
                      <button
                        onClick={() => { onReactivate(sub.tenant_id); setMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 flex items-center gap-2"
                      >
                        <CheckCircle size={12} />Reativar assinatura
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (sub.user_email) onResetPassword(sub.user_email, sub.tenant_name ?? '—');
                        setMenuOpen(false);
                      }}
                      disabled={!sub.user_email}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-40"
                    >
                      <Lock size={12} />Redefinir senha
                    </button>
                    {onEditContact && sub.user_email && (
                      <button
                        onClick={() => {
                          onEditContact(sub.user_email, sub.user_phone ?? null, sub.user_cpf ?? null, sub.tenant_name ?? sub.user_email);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Edit3 size={12} className="text-teal-500" />Editar telefone/CPF
                      </button>
                    )}
                    {adminUser.role === 'super_admin' && (
                      <button
                        onClick={() => { onMarkInternal(sub.tenant_id, sub.tenant_name ?? sub.tenant_id); setMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <TestTube size={12} />Conta interna (não entra nas métricas)
                      </button>
                    )}
                    <div className="h-px bg-gray-100 my-1" />
                  </>
                )}
                <button
                  onClick={copyEmail}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Copy size={12} />
                  {emailCopied ? 'Email copiado!' : 'Copiar email'}
                </button>
                {sub.user_email && (
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Olá! Precisamos verificar sua assinatura IncluiAI. Email: ${sub.user_email}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setMenuOpen(false)}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <ExternalLink size={12} />Contato WhatsApp
                  </a>
                )}
                <button
                  onClick={() => { setExpanded(v => !v); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {expanded ? 'Ocultar detalhes técnicos' : 'Ver detalhes técnicos'}
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1.5 text-gray-300 hover:text-gray-500 transition"
            aria-label={expanded ? 'Recolher' : 'Expandir'}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* ── Expanded panel ───────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50 rounded-b-2xl space-y-4">

          {/* Technical metadata */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
            {[
              { label: 'Tenant ID',  value: sub.tenant_id,            mono: true },
              { label: 'Provider',   value: sub.billing_provider ?? 'manual',  mono: true },
              { label: 'Ciclo',      value: sub.billing_cycle ?? 'mensal',     mono: false },
              { label: 'Ativado em', value: sub.activated_at ? new Date(sub.activated_at).toLocaleDateString('pt-BR') : '—', mono: false },
            ].map(f => (
              <div key={f.label}>
                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">{f.label}</p>
                <p className={`text-xs text-gray-700 break-all leading-snug ${f.mono ? 'font-mono text-[10px]' : ''}`}>{f.value}</p>
              </div>
            ))}
          </div>

          {/* Contato completo (apenas no painel expandido para admins) */}
          {canAct && (
            <div className="p-3 rounded-xl bg-white border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest">Contato</p>
                {onEditContact && sub.user_email && (
                  <button
                    onClick={() => onEditContact(sub.user_email, sub.user_phone ?? null, sub.user_cpf ?? null, sub.tenant_name ?? sub.user_email)}
                    className="text-[10px] font-bold text-teal-600 hover:text-teal-800 flex items-center gap-1"
                  >
                    <Edit3 size={10} /> Editar
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div>
                  <p className="text-[9px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">
                    <Phone size={8} className="inline mr-1" />Telefone
                  </p>
                  <p className="text-xs text-gray-700 font-mono">
                    {sub.user_phone ?? <span className="text-amber-500 font-semibold">Não cadastrado</span>}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">
                    <FileText size={8} className="inline mr-1" />CPF
                  </p>
                  {/* CPF completo apenas no painel expandido para super_admin */}
                  <p className="text-xs text-gray-700 font-mono">
                    {adminUser.role === 'super_admin' && sub.user_cpf
                      ? sub.user_cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
                      : sub.user_cpf
                        ? maskCPF(sub.user_cpf)
                        : <span className="text-amber-500 font-semibold">Não cadastrado</span>
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Kiwify block */}
          {kp && (
            <div className={`p-3 rounded-xl bg-white border transition-all ${highlightKiwify ? 'border-amber-400 ring-2 ring-amber-100' : 'border-gray-100'}`}>
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-2.5">Kiwify</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2.5">
                {[
                  { label: 'Email comprador', value: kp.email, mono: true },
                  { label: 'Produto',         value: kp.product_key ?? '—', mono: false },
                  { label: 'Order ID',        value: kp.provider_order_id ?? '—', mono: true },
                  { label: 'Pago em',         value: kp.paid_at ? new Date(kp.paid_at).toLocaleString('pt-BR') : '—', mono: false },
                ].map(f => (
                  <div key={f.label}>
                    <p className="text-[9px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">{f.label}</p>
                    <p className={`text-xs text-gray-700 break-all ${f.mono ? 'font-mono text-[10px]' : ''}`}>{f.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded
                  ${kp.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700'
                  : kp.status === 'CANCELED' ? 'bg-gray-100 text-gray-500'
                  : 'bg-amber-100 text-amber-700'}`}
                >
                  {kp.status}
                </span>
                {kp.activated_at
                  ? <span className="text-[10px] text-emerald-600 font-medium">✓ ativado</span>
                  : kp.status === 'APPROVED'
                  ? <span className="text-[10px] text-red-500 font-medium">✗ não ativado</span>
                  : null}
              </div>
            </div>
          )}

          {/* Billing Integrity Actions — aparece apenas para paid_but_free */}
          {divergence?.kind === 'paid_but_free' && canAct && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-100">
              <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest mb-1.5">
                Ações de integridade de faturamento
              </p>
              <p className="text-[11px] text-red-700 mb-3 leading-snug">
                Compra aprovada no Kiwify, mas o plano ainda é FREE.
                Reconcilie para ativar o plano, créditos, <code className="font-mono text-[10px]">activated_at</code> e <code className="font-mono text-[10px]">profiles.plan</code>.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onFixDivergence?.(sub.tenant_id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition"
                >
                  <RefreshCw size={11} /> Corrigir agora
                </button>
                <button
                  onClick={() => {
                    setHighlightKiwify(true);
                    setTimeout(() => setHighlightKiwify(false), 2500);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                >
                  <Package size={11} /> Ver compra
                </button>
                <a
                  href="https://app.kiwify.com.br/"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                  title={kp?.provider_order_id ? `Order ID: ${kp.provider_order_id}` : 'Abrir painel Kiwify'}
                >
                  <ExternalLink size={11} /> Abrir Kiwify
                </a>
                {kp?.provider_order_id && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(kp.provider_order_id!);
                      setOrderIdCopied(true);
                      setTimeout(() => setOrderIdCopied(false), 2000);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                    title={`Copiar Order ID para procurar nos logs de webhook: ${kp.provider_order_id}`}
                  >
                    <FileText size={11} />
                    {orderIdCopied ? 'Order ID copiado!' : 'Ver logs webhook'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Action panel */}
          {panel && (
            <div className="p-4 rounded-xl bg-white border border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
                {panel === 'credits' && `Créditos — ${sub.tenant_name}`}
                {panel === 'plan'    && `Alterar plano — ${sub.tenant_name}`}
                {panel === 'courtesy' && `Cortesia — ${sub.tenant_name}`}
              </p>

              {panel === 'credits' && (
                <div className="flex gap-3 items-end flex-wrap">
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Quantidade <span className="text-gray-300">(negativo = estorno)</span></label>
                    <input
                      type="number"
                      autoFocus
                      className="border rounded-lg px-3 py-1.5 text-sm w-28 focus:ring-2 focus:ring-violet-300 outline-none"
                      value={credits}
                      onChange={e => setCredits(e.target.value)}
                      placeholder="+50 ou -10"
                    />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-[11px] text-gray-400 mb-1">Motivo <span className="text-gray-300">(auditoria)</span></label>
                    <input
                      className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-violet-300 outline-none"
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="Ex: Bonificação por feedback"
                    />
                  </div>
                </div>
              )}

              {panel === 'plan' && (
                <div className="flex gap-4 items-end flex-wrap">
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Novo plano</label>
                    <select
                      className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 outline-none"
                      value={plan}
                      onChange={e => setPlan(e.target.value)}
                    >
                      <option value="FREE">FREE — Starter (60 créditos / 5 alunos)</option>
                      <option value="PRO">PRO — Profissional (500 créditos / 30 alunos)</option>
                      <option value="MASTER">PREMIUM — Master (700 créditos / ilimitado)</option>
                      <option value="INSTITUTIONAL">INSTITUTIONAL</option>
                    </select>
                  </div>
                  <p className="text-xs text-gray-400">
                    Atual: <strong className="text-gray-700">{sub.plan_code}</strong>
                  </p>
                </div>
              )}

              {panel === 'courtesy' && (
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Motivo <span className="text-gray-300">(obrigatório)</span></label>
                  <input
                    autoFocus
                    className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-amber-300 outline-none"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Ex: Cliente parceiro, erro de cobrança, demo comercial"
                  />
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <button
                  onClick={confirmAction}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white rounded-lg transition disabled:opacity-50"
                  style={{
                    background: panel === 'credits' ? '#7C3AED'
                      : panel === 'plan' ? '#2563EB'
                      : '#D97706',
                  }}
                >
                  {actionLoading
                    ? <RefreshCw size={12} className="animate-spin" />
                    : <CheckCircle size={12} />}
                  Confirmar
                </button>
                <button
                  onClick={() => setPanel(null)}
                  className="px-4 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
