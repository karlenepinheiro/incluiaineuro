import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown, ChevronUp, MoreHorizontal, Zap, Package, Lock,
  Copy, ExternalLink, CheckCircle, XCircle, RefreshCw, Gift,
  TestTube, AlertTriangle, Phone, FileText, Edit3,
  Calendar, RotateCcw, Search, PlayCircle,
} from 'lucide-react';
import type { AdminUser } from '../../types';
import type {
  CeoSubscriber, KiwifyPurchaseRow,
  CycleInferResult, SubscriptionCreditGrantResult,
  CommercialEvent, CommercialStatusResult,
} from '../../services/ceoService';
import {
  adminInferSubscriptionCycle,
  adminGrantMissingCreditsForSubscription,
  computeCommercialStatus,
  getSubscriberCommercialEvents,
} from '../../services/ceoService';

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
  commercialEvents?: CommercialEvent[];
  onGrantCredits: (tenantId: string, amount: number, reason: string) => Promise<void>;
  onChangePlan: (tenantId: string, plan: string) => Promise<void>;
  onGrantCourtesy: (tenantId: string, reason: string) => Promise<void>;
  onSuspend: (tenantId: string) => Promise<void>;
  onReactivate: (tenantId: string) => Promise<void>;
  onResetPassword: (email: string, name: string) => void;
  onMarkInternal: (tenantId: string, tenantName: string) => void | Promise<void>;
  onFixDivergence?: (tenantId: string) => Promise<void>;
  onEditContact?: (email: string, phone: string | null, cpf: string | null, name: string) => void;
  onUpdateCycle?: (subscriptionId: string, cycle: 'monthly' | 'annual', periodStart: string | null, reason: string) => Promise<void>;
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

// ── BillingCyclePanel ──────────────────────────────────────────────────────

const CYCLE_LABEL: Record<string, string> = {
  monthly: 'Mensal',
  annual:  'Anual',
};

const CONFIDENCE_COLOR: Record<string, string> = {
  high:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low:    'bg-gray-100 text-gray-500 border-gray-200',
};

const GRANT_STATUS_COLOR: Record<string, string> = {
  DRY_RUN:        'bg-blue-50 text-blue-700 border-blue-100',
  GRANTED:        'bg-emerald-50 text-emerald-700 border-emerald-100',
  ALREADY_GRANTED:'bg-gray-50 text-gray-500 border-gray-100',
  BILLING_CYCLE_NULL: 'bg-orange-50 text-orange-700 border-orange-100',
  SUBSCRIPTION_EXPIRED: 'bg-red-50 text-red-700 border-red-100',
  NOT_ELIGIBLE:   'bg-gray-50 text-gray-400 border-gray-100',
  ERROR:          'bg-red-50 text-red-700 border-red-100',
};

interface BillingCyclePanelProps {
  sub: CeoSubscriber;
  adminUser: AdminUser;
  cycleConfirm: { cycle: 'monthly' | 'annual' } | null;
  cycleReason: string;
  cycleLoading: boolean;
  cycleError: string;
  inferLoading: boolean;
  inferResult: CycleInferResult | null;
  inferError: string;
  dryRunLoading: boolean;
  dryRunResult: SubscriptionCreditGrantResult | null;
  dryRunError: string;
  grantConfirm: boolean;
  grantLoading: boolean;
  onOpenCycleConfirm: (cycle: 'monthly' | 'annual') => void;
  onCloseCycleConfirm: () => void;
  onCycleReasonChange: (v: string) => void;
  onConfirmCycle: () => Promise<void>;
  onInfer: () => Promise<void>;
  onApplyInference: () => void;
  onDryRun: () => Promise<void>;
  onOpenGrantConfirm: () => void;
  onCloseGrantConfirm: () => void;
  onConfirmGrant: () => Promise<void>;
}

const BillingCyclePanel: React.FC<BillingCyclePanelProps> = ({
  sub,
  cycleConfirm,
  cycleReason,
  cycleLoading,
  cycleError,
  inferLoading,
  inferResult,
  inferError,
  dryRunLoading,
  dryRunResult,
  dryRunError,
  grantConfirm,
  grantLoading,
  onOpenCycleConfirm,
  onCloseCycleConfirm,
  onCycleReasonChange,
  onConfirmCycle,
  onInfer,
  onApplyInference,
  onDryRun,
  onOpenGrantConfirm,
  onCloseGrantConfirm,
  onConfirmGrant,
}) => {
  const cycle      = sub.billing_cycle;
  const periodStart = sub.current_period_start ? new Date(sub.current_period_start).toLocaleDateString('pt-BR') : '—';
  const periodEnd   = sub.current_period_end   ? new Date(sub.current_period_end).toLocaleDateString('pt-BR')   : '—';
  const lastGrant   = sub.last_credit_grant_at  ? new Date(sub.last_credit_grant_at).toLocaleDateString('pt-BR')  : '—';
  const nextGrant   = sub.next_credit_grant_at  ? new Date(sub.next_credit_grant_at).toLocaleDateString('pt-BR')  : '—';

  const isExpired  = sub.current_period_end ? new Date(sub.current_period_end) < new Date() : false;
  const cycleNull  = cycle == null;

  const alertColor = cycleNull ? 'border-orange-200 bg-orange-50' : isExpired ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white';

  return (
    <div className={`p-3.5 rounded-xl border ${alertColor}`}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <Calendar size={11} className={cycleNull ? 'text-orange-500' : isExpired ? 'text-red-500' : 'text-gray-400'} />
          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Ciclo de Cobrança</p>
          {cycleNull && (
            <span className="text-[8px] font-bold px-1 py-0.5 rounded border bg-orange-100 text-orange-600 border-orange-200 leading-none">
              INDEFINIDO
            </span>
          )}
          {!cycleNull && isExpired && (
            <span className="text-[8px] font-bold px-1 py-0.5 rounded border bg-red-100 text-red-600 border-red-200 leading-none">
              VENCIDO
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => onOpenCycleConfirm('monthly')}
            disabled={cycleLoading}
            className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition disabled:opacity-40"
          >
            → Mensal
          </button>
          <button
            onClick={() => onOpenCycleConfirm('annual')}
            disabled={cycleLoading}
            className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 transition disabled:opacity-40"
          >
            → Anual
          </button>
          <button
            onClick={onInfer}
            disabled={inferLoading}
            className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition flex items-center gap-1 disabled:opacity-40"
          >
            {inferLoading
              ? <RefreshCw size={9} className="animate-spin" />
              : <Search size={9} />}
            Inferir
          </button>
        </div>
      </div>

      {/* Dados atuais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mb-2.5">
        <div>
          <p className="text-[8px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Ciclo</p>
          <p className={`text-xs font-semibold ${cycleNull ? 'text-orange-600' : 'text-gray-800'}`}>
            {cycle ? CYCLE_LABEL[cycle] ?? cycle : '—'}
          </p>
        </div>
        <div>
          <p className="text-[8px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Início do período</p>
          <p className="text-xs text-gray-700">{periodStart}</p>
        </div>
        <div>
          <p className="text-[8px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Vencimento</p>
          <p className={`text-xs font-semibold ${isExpired ? 'text-red-600' : 'text-gray-700'}`}>{periodEnd}</p>
        </div>
        <div>
          <p className="text-[8px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Último grant</p>
          <p className="text-xs text-gray-700">{lastGrant}</p>
        </div>
      </div>

      {/* Próximo grant */}
      {sub.next_credit_grant_at && (
        <p className="text-[10px] text-gray-400 mb-2">
          Próximo grant previsto: <strong className="text-gray-600">{nextGrant}</strong>
        </p>
      )}

      {/* Resultado de inferência */}
      {inferError && (
        <p className="text-[11px] text-red-600 font-medium mt-1">{inferError}</p>
      )}
      {inferResult && (
        <div className="mt-2 p-3 rounded-lg border border-gray-100 bg-white space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">Inferência automática</p>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none ${CONFIDENCE_COLOR[inferResult.confidence]}`}>
              {inferResult.confidence === 'high' ? 'Alta confiança' : inferResult.confidence === 'medium' ? 'Média confiança' : 'Baixa confiança'}
            </span>
            {inferResult.inferred_billing_cycle && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-gray-800 text-white leading-none">
                {CYCLE_LABEL[inferResult.inferred_billing_cycle] ?? inferResult.inferred_billing_cycle}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-600 leading-snug">{inferResult.evidence}</p>
          <p className="text-[10px] text-gray-400 italic">{inferResult.reason}</p>
          {inferResult.should_fix && inferResult.inferred_billing_cycle && (
            <button
              onClick={onApplyInference}
              className="mt-1 flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition"
            >
              <CheckCircle size={11} />
              Aplicar sugestão ({CYCLE_LABEL[inferResult.inferred_billing_cycle]})
            </button>
          )}
        </div>
      )}

      {/* Dry run / grant */}
      <div className="flex gap-2 mt-2.5 flex-wrap">
        <button
          onClick={onDryRun}
          disabled={dryRunLoading || cycleNull}
          className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition disabled:opacity-40"
          title={cycleNull ? 'Corrija o ciclo antes de simular' : 'Simula concessão de créditos mensais sem alterar saldo'}
        >
          {dryRunLoading ? <RefreshCw size={9} className="animate-spin" /> : <RotateCcw size={9} />}
          Dry run créditos
        </button>
        {dryRunResult?.grant_status === 'DRY_RUN' && (
          <button
            onClick={onOpenGrantConfirm}
            disabled={grantLoading}
            className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-40"
          >
            <PlayCircle size={9} />
            Conceder créditos faltantes
          </button>
        )}
      </div>

      {/* Resultado dry run */}
      {dryRunError && (
        <p className="text-[11px] text-red-600 font-medium mt-1.5">{dryRunError}</p>
      )}
      {dryRunResult && (
        <div className={`mt-2 p-2.5 rounded-lg border text-[11px] ${GRANT_STATUS_COLOR[dryRunResult.grant_status] ?? 'bg-gray-50 text-gray-600 border-gray-100'}`}>
          <span className="font-bold">{dryRunResult.grant_status}</span>
          {' — '}{dryRunResult.detail}
          {dryRunResult.balance_after != null && dryRunResult.grant_status === 'DRY_RUN' && (
            <span className="ml-1 text-[10px] opacity-75">
              ({dryRunResult.balance_before} → {dryRunResult.balance_after} créditos)
            </span>
          )}
        </div>
      )}

      {/* Modal: confirmar ciclo */}
      {cycleConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 460, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Calendar size={20} color={cycleConfirm.cycle === 'annual' ? '#7c3aed' : '#2563eb'} />
              <span style={{ fontWeight: 700, fontSize: 16, color: '#1a1a1a' }}>
                Definir como {cycleConfirm.cycle === 'annual' ? 'Anual' : 'Mensal'}?
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 8, lineHeight: 1.55 }}>
              {cycleConfirm.cycle === 'annual'
                ? 'Esta ação definirá a assinatura como anual e ajustará o vencimento para 12 meses a partir da data de início. Nenhum crédito será concedido agora.'
                : 'Esta ação definirá a assinatura como mensal e ajustará o vencimento para 1 mês a partir da data de início. Nenhum crédito será concedido agora.'
              }
            </p>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
              Assinante: <strong>{sub.tenant_name ?? sub.user_email}</strong>
              {sub.current_period_start && (
                <> · Início atual: <strong>{new Date(sub.current_period_start).toLocaleDateString('pt-BR')}</strong></>
              )}
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Motivo administrativo *
              </label>
              <input
                autoFocus
                style={{ width: '100%', border: `1px solid ${cycleError ? '#dc2626' : '#d1d5db'}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                placeholder="Ex: Ciclo correto conforme compra Kiwify de 12/2025"
                value={cycleReason}
                onChange={e => onCycleReasonChange(e.target.value)}
              />
              {cycleError && (
                <p style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, marginTop: 4 }}>{cycleError}</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={onCloseCycleConfirm}
                disabled={cycleLoading}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 13, cursor: 'pointer', color: '#374151' }}
              >
                Cancelar
              </button>
              <button
                onClick={onConfirmCycle}
                disabled={cycleLoading}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: cycleConfirm.cycle === 'annual' ? '#7c3aed' : '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: cycleLoading ? 'not-allowed' : 'pointer', opacity: cycleLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {cycleLoading && <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmar concessão de créditos */}
      {grantConfirm && dryRunResult && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 460, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Zap size={20} color="#059669" />
              <span style={{ fontWeight: 700, fontSize: 16, color: '#1a1a1a' }}>Conceder créditos faltantes?</span>
            </div>
            <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 8 }}>
              Essa ação concederá <strong>+{dryRunResult.credits_to_grant} créditos</strong> ao saldo atual de <strong>{sub.tenant_name ?? sub.user_email}</strong>, sem resetar o saldo.
            </p>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
              Saldo antes: <strong>{dryRunResult.balance_before}</strong> · Saldo após: <strong>{dryRunResult.balance_after}</strong>
            </p>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>
              Esta operação é idempotente — não será duplicada se já houver grant no mês corrente.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={onCloseGrantConfirm}
                disabled={grantLoading}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 13, cursor: 'pointer', color: '#374151' }}
              >
                Cancelar
              </button>
              <button
                onClick={onConfirmGrant}
                disabled={grantLoading}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontSize: 13, fontWeight: 600, cursor: grantLoading ? 'not-allowed' : 'pointer', opacity: grantLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {grantLoading && <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                Sim, conceder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Cores e labels de status comercial ────────────────────────────────────────

const COMMERCIAL_STATUS_STYLE: Record<string, { badge: string; bar: string; icon: string }> = {
  UPGRADE_REGISTERED:   { badge: 'bg-violet-100 text-violet-700 border-violet-200', bar: 'border-violet-100 bg-violet-50/40', icon: '↑' },
  UPGRADE_SEM_REGISTRO: { badge: 'bg-amber-100 text-amber-700 border-amber-200',   bar: 'border-amber-100 bg-amber-50/40',   icon: '↑?' },
  DOWNGRADE_SEM_REGISTRO:{ badge: 'bg-red-100 text-red-700 border-red-200',        bar: 'border-red-100 bg-red-50/40',       icon: '↓?' },
  CICLO_DIVERGENTE:     { badge: 'bg-orange-100 text-orange-700 border-orange-200',bar: 'border-orange-100 bg-orange-50/40', icon: '~' },
  OK:                   { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', bar: 'border-gray-100 bg-white',      icon: '✓' },
  NO_PURCHASE:          { badge: 'bg-gray-100 text-gray-500 border-gray-200',       bar: 'border-gray-100 bg-white',        icon: '—' },
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  INITIAL_PURCHASE:   'Compra inicial',
  UPGRADE_PLAN:       'Upgrade de plano',
  DOWNGRADE_PLAN:     'Downgrade de plano',
  CYCLE_CORRECTION:   'Correção de ciclo',
  MANUAL_ADJUSTMENT:  'Ajuste manual',
  PAYMENT_DIFFERENCE: 'Pagamento de diferença',
  KIWIFY_ACTIVATION:  'Ativação Kiwify',
  ADMIN_FIX:          'Correção administrativa',
  COURTESY_UPGRADE:   'Upgrade por cortesia',
};

const SOURCE_LABEL: Record<string, string> = {
  kiwify_webhook: 'Kiwify (automático)',
  manual_ceo:     'CEO (manual)',
  admin_fix:      'Admin',
  reconciliation: 'Reconciliação',
  migration:      'Migração',
};

interface CommercialHistoryBlockProps {
  sub: CeoSubscriber;
  events: CommercialEvent[];
}

const CommercialHistoryBlock: React.FC<CommercialHistoryBlockProps> = ({ sub, events }) => {
  const cs: CommercialStatusResult = computeCommercialStatus(sub, events);

  if (cs.status === 'NO_PURCHASE') return null;

  const style   = COMMERCIAL_STATUS_STYLE[cs.status] ?? COMMERCIAL_STATUS_STYLE.OK;
  const hasEvents = events.length > 0;

  const fmtDate  = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const fmtCycle = (c: string | null) => c === 'annual' ? 'Anual' : c === 'monthly' ? 'Mensal' : c ?? '—';
  const fmtPlan  = (p: string | null) => p ?? '—';

  return (
    <div className={`p-3 rounded-xl border ${style.bar}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Histórico comercial</p>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none ${style.badge}`}>
          {style.icon}&nbsp;
          {cs.status === 'UPGRADE_REGISTERED'   && 'Upgrade registrado'}
          {cs.status === 'UPGRADE_SEM_REGISTRO' && 'Upgrade sem registro'}
          {cs.status === 'DOWNGRADE_SEM_REGISTRO' && 'Divergência — verificar'}
          {cs.status === 'CICLO_DIVERGENTE'     && 'Ciclo divergente'}
          {cs.status === 'OK'                   && 'Consistente'}
        </span>
      </div>

      {/* Produto comprado vs plano atual */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mb-2">
        <div>
          <p className="text-[8px] text-gray-400 uppercase font-semibold tracking-wide mb-0.5">Produto comprado</p>
          <p className="text-xs text-gray-700 font-medium">{cs.purchaseProductKey ?? cs.purchasePlanCode ?? '—'}</p>
        </div>
        <div>
          <p className="text-[8px] text-gray-400 uppercase font-semibold tracking-wide mb-0.5">Plano na compra</p>
          <p className="text-xs text-gray-700">{fmtPlan(cs.purchasePlanCode)}</p>
        </div>
        <div>
          <p className="text-[8px] text-gray-400 uppercase font-semibold tracking-wide mb-0.5">Plano atual</p>
          <p className={`text-xs font-semibold ${cs.isUpgrade ? 'text-violet-700' : cs.isDowngrade ? 'text-red-600' : 'text-gray-700'}`}>
            {fmtPlan(cs.currentPlanCode)}
            {cs.isUpgrade && <span className="ml-1 text-[9px]">↑</span>}
          </p>
        </div>
        <div>
          <p className="text-[8px] text-gray-400 uppercase font-semibold tracking-wide mb-0.5">Ciclo esperado / atual</p>
          <p className={`text-xs ${cs.isCycleDivergent ? 'text-orange-600 font-semibold' : 'text-gray-700'}`}>
            {fmtCycle(cs.expectedBillingCycle)} / {fmtCycle(cs.actualBillingCycle)}
          </p>
        </div>
      </div>

      {/* Detalhe do status */}
      <p className="text-[11px] text-gray-500 italic leading-snug mb-2">{cs.detail}</p>

      {/* Alerta: upgrade sem registro */}
      {cs.status === 'UPGRADE_SEM_REGISTRO' && (
        <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-100">
          <p className="text-[11px] text-amber-700 font-medium leading-snug">
            Compra original: <strong>{cs.purchasePlanCode}</strong> — plano atual: <strong>{cs.currentPlanCode}</strong>.
            Sem evento de upgrade na tabela <code className="font-mono text-[10px]">subscription_commercial_events</code>.
            Registre o evento para que essa divergência não apareça como erro.
          </p>
        </div>
      )}

      {/* Alerta: ciclo divergente */}
      {cs.status === 'CICLO_DIVERGENTE' && (
        <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-orange-50 border border-orange-100">
          <p className="text-[11px] text-orange-700 font-medium leading-snug">
            Produto comprado ({cs.purchaseProductKey}) implica ciclo <strong>{cs.expectedBillingCycle}</strong>,
            mas assinatura está como <strong>{cs.actualBillingCycle}</strong>.
            Expandir seção "Ciclo de cobrança" e clicar "→ Anual".
          </p>
        </div>
      )}

      {/* Timeline de eventos */}
      {hasEvents && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Eventos registrados</p>
          {events.map(ev => (
            <div key={ev.id} className="flex items-start gap-2 py-1.5 px-2 rounded-lg bg-white border border-gray-100">
              <div className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-violet-400 mt-1" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-semibold text-gray-800">
                    {EVENT_TYPE_LABEL[ev.event_type] ?? ev.event_type}
                  </span>
                  {ev.from_plan_code && ev.to_plan_code && (
                    <span className="text-[9px] text-gray-500">
                      {ev.from_plan_code} → {ev.to_plan_code}
                    </span>
                  )}
                  {ev.from_billing_cycle && ev.to_billing_cycle && ev.from_billing_cycle !== ev.to_billing_cycle && (
                    <span className="text-[9px] text-gray-500">
                      {fmtCycle(ev.from_billing_cycle)} → {fmtCycle(ev.to_billing_cycle)}
                    </span>
                  )}
                  {ev.amount_paid_brl != null && (
                    <span className="text-[9px] font-bold text-emerald-600">
                      R$ {Number(ev.amount_paid_brl).toFixed(2).replace('.', ',')}
                    </span>
                  )}
                </div>
                {ev.notes && (
                  <p className="text-[10px] text-gray-500 leading-snug mt-0.5">{ev.notes}</p>
                )}
                <p className="text-[9px] text-gray-300 mt-0.5">
                  {fmtDate(ev.event_date)} · {SOURCE_LABEL[ev.source] ?? ev.source}
                  {ev.performed_by_email && ` · ${ev.performed_by_email}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Estado sem eventos registrados */}
      {!hasEvents && cs.status !== 'OK' && cs.status !== 'NO_PURCHASE' && (
        <p className="text-[10px] text-gray-400 italic">
          Nenhum evento comercial registrado nesta assinatura.
        </p>
      )}
    </div>
  );
};

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
  onUpdateCycle,
  commercialEvents = [],
}) => {
  const [expanded, setExpanded] = useState(false);
  const [loadedEvents, setLoadedEvents] = useState<CommercialEvent[] | null>(null);
  const [panel, setPanel] = useState<ActionPanel | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [credits, setCredits] = useState('');
  const [reason, setReason] = useState('');
  const [plan, setPlan] = useState('PRO');
  const [emailCopied, setEmailCopied] = useState(false);
  const [highlightKiwify, setHighlightKiwify] = useState(false);
  const [orderIdCopied, setOrderIdCopied] = useState(false);
  const [suspendConfirm, setSuspendConfirm] = useState(false);
  const [reactivateConfirm, setReactivateConfirm] = useState(false);
  const [planChangeConfirm, setPlanChangeConfirm] = useState(false);
  const [planChangeReason, setPlanChangeReason] = useState('');
  const [planChangeError, setPlanChangeError] = useState('');

  // ── Ciclo de cobrança (billing cycle management) ───────────────────────────
  const [cycleConfirm, setCycleConfirm] = useState<{ cycle: 'monthly' | 'annual' } | null>(null);
  const [cycleReason, setCycleReason] = useState('');
  const [cycleLoading, setCycleLoading] = useState(false);
  const [cycleError, setCycleError] = useState('');
  const [inferLoading, setInferLoading] = useState(false);
  const [inferResult, setInferResult] = useState<CycleInferResult | null>(null);
  const [inferError, setInferError] = useState('');
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<SubscriptionCreditGrantResult | null>(null);
  const [dryRunError, setDryRunError] = useState('');
  const [grantConfirm, setGrantConfirm] = useState(false);
  const [grantLoading, setGrantLoading] = useState(false);

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

  // Carrega eventos comerciais do banco ao expandir (uma única vez por card aberto)
  useEffect(() => {
    if (!expanded || loadedEvents !== null) return;
    getSubscriberCommercialEvents(sub.tenant_id).then(setLoadedEvents);
  }, [expanded, sub.tenant_id, loadedEvents]);

  const activeEvents = loadedEvents ?? commercialEvents;

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
      setPanel(null);
      setPlanChangeReason('');
      setPlanChangeError('');
      setPlanChangeConfirm(true);
      return;
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
            {/* Ciclo indefinido — billing_cycle NULL */}
            {!sub.billing_cycle && sub.subscription_status !== 'NO_SUBSCRIPTION' && sub.plan_code !== 'FREE' && (
              <span className="text-[8px] font-bold px-1 py-0.5 rounded border leading-none bg-orange-50 text-orange-600 border-orange-200" title="billing_cycle não definido — expandir para corrigir">
                CICLO?
              </span>
            )}
            {/* Ciclo divergente com produto Kiwify */}
            {(() => {
              const cs = computeCommercialStatus(sub, activeEvents);
              if (cs.status === 'CICLO_DIVERGENTE') return (
                <span className="text-[8px] font-bold px-1 py-0.5 rounded border leading-none bg-orange-50 text-orange-600 border-orange-200" title={cs.detail}>
                  ~CICLO
                </span>
              );
              if (cs.status === 'UPGRADE_SEM_REGISTRO') return (
                <span className="text-[8px] font-bold px-1 py-0.5 rounded border leading-none bg-amber-50 text-amber-700 border-amber-200" title={cs.detail}>
                  ↑ UPGRADE?
                </span>
              );
              if (cs.status === 'UPGRADE_REGISTERED') return (
                <span className="text-[8px] font-bold px-1 py-0.5 rounded border leading-none bg-violet-50 text-violet-700 border-violet-200" title={cs.detail}>
                  ↑ UPGRADE
                </span>
              );
              return null;
            })()}
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
                        onClick={() => { setSuspendConfirm(true); setMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <XCircle size={12} />Suspender assinatura
                      </button>
                    ) : (
                      <button
                        onClick={() => { setReactivateConfirm(true); setMenuOpen(false); }}
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
              { label: 'Ciclo',      value: sub.billing_cycle ?? '—',          mono: false },
              { label: 'Ativado em', value: sub.activated_at ? new Date(sub.activated_at).toLocaleDateString('pt-BR') : '—', mono: false },
            ].map(f => (
              <div key={f.label}>
                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">{f.label}</p>
                <p className={`text-xs text-gray-700 break-all leading-snug ${f.mono ? 'font-mono text-[10px]' : ''}`}>{f.value}</p>
              </div>
            ))}
          </div>

          {/* ── Histórico comercial ───────────────────────────────────────── */}
          <CommercialHistoryBlock sub={sub} events={activeEvents} />

          {/* ── Painel de gestão de ciclo ──────────────────────────────────── */}
          {canAct && sub.subscription_id && (
            <BillingCyclePanel
              sub={sub}
              adminUser={adminUser}
              cycleConfirm={cycleConfirm}
              cycleReason={cycleReason}
              cycleLoading={cycleLoading}
              cycleError={cycleError}
              inferLoading={inferLoading}
              inferResult={inferResult}
              inferError={inferError}
              dryRunLoading={dryRunLoading}
              dryRunResult={dryRunResult}
              dryRunError={dryRunError}
              grantConfirm={grantConfirm}
              grantLoading={grantLoading}
              onOpenCycleConfirm={(cycle) => {
                setCycleConfirm({ cycle });
                setCycleReason('');
                setCycleError('');
              }}
              onCloseCycleConfirm={() => { setCycleConfirm(null); setCycleError(''); }}
              onCycleReasonChange={(v) => { setCycleReason(v); setCycleError(''); }}
              onConfirmCycle={async () => {
                if (!cycleConfirm || !sub.subscription_id) return;
                if (!cycleReason.trim()) { setCycleError('Informe o motivo da alteração.'); return; }
                setCycleLoading(true);
                setCycleError('');
                try {
                  await onUpdateCycle?.(sub.subscription_id, cycleConfirm.cycle, sub.current_period_start ?? null, cycleReason);
                  setCycleConfirm(null);
                  setCycleReason('');
                  setInferResult(null);
                } catch (e: any) {
                  setCycleError(e.message ?? 'Erro ao atualizar ciclo.');
                } finally {
                  setCycleLoading(false);
                }
              }}
              onInfer={async () => {
                if (!sub.subscription_id) return;
                setInferLoading(true);
                setInferError('');
                setInferResult(null);
                try {
                  const result = await adminInferSubscriptionCycle(sub.subscription_id);
                  setInferResult(result);
                } catch (e: any) {
                  setInferError(e.message ?? 'Erro ao inferir ciclo.');
                } finally {
                  setInferLoading(false);
                }
              }}
              onApplyInference={() => {
                if (!inferResult?.inferred_billing_cycle) return;
                setCycleConfirm({ cycle: inferResult.inferred_billing_cycle as 'monthly' | 'annual' });
                setCycleReason('Ciclo inferido automaticamente pelo sistema (confiança: ' + inferResult.confidence + ')');
                setCycleError('');
              }}
              onDryRun={async () => {
                if (!sub.subscription_id) return;
                setDryRunLoading(true);
                setDryRunError('');
                setDryRunResult(null);
                try {
                  const result = await adminGrantMissingCreditsForSubscription(sub.subscription_id, true, adminUser);
                  setDryRunResult(result);
                } catch (e: any) {
                  setDryRunError(e.message ?? 'Erro ao simular concessão.');
                } finally {
                  setDryRunLoading(false);
                }
              }}
              onOpenGrantConfirm={() => setGrantConfirm(true)}
              onCloseGrantConfirm={() => setGrantConfirm(false)}
              onConfirmGrant={async () => {
                if (!sub.subscription_id) return;
                setGrantLoading(true);
                try {
                  const result = await adminGrantMissingCreditsForSubscription(sub.subscription_id, false, adminUser);
                  setDryRunResult(result);
                  setGrantConfirm(false);
                } catch (e: any) {
                  setDryRunError(e.message ?? 'Erro ao conceder créditos.');
                  setGrantConfirm(false);
                } finally {
                  setGrantLoading(false);
                }
              }}
            />
          )}

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

      {/* Suspend confirmation modal */}
      {suspendConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 420, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <XCircle size={20} color="#dc2626" />
              <span style={{ fontWeight: 700, fontSize: 16, color: '#1a1a1a' }}>Suspender assinatura?</span>
            </div>
            <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 8 }}>
              O acesso de <strong>{sub.tenant_name ?? sub.user_email}</strong> será bloqueado imediatamente.
            </p>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>
              O assinante não conseguirá mais entrar na plataforma até que a assinatura seja reativada manualmente.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSuspendConfirm(false)}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 13, cursor: 'pointer', color: '#374151' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => { setSuspendConfirm(false); onSuspend(sub.tenant_id); }}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Sim, suspender
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan change confirmation modal */}
      {planChangeConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 460, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Package size={20} color="#2563eb" />
              <span style={{ fontWeight: 700, fontSize: 16, color: '#1a1a1a' }}>Confirmar alteração de plano?</span>
            </div>
            <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 4 }}>
              Assinante: <strong>{sub.tenant_name ?? sub.user_email}</strong>
            </p>
            <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 16 }}>
              Plano atual: <strong style={{ color: '#374151' }}>{sub.plan_code}</strong>
              {' → '}
              Novo plano: <strong style={{ color: '#2563eb' }}>{plan}</strong>
            </p>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
              A alteração é imediata. Créditos e limites de alunos serão ajustados conforme o novo plano.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Motivo administrativo *
              </label>
              <input
                autoFocus
                style={{ width: '100%', border: `1px solid ${planChangeError ? '#dc2626' : '#d1d5db'}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                placeholder="Ex: Upgrade solicitado via suporte, correção de plano, cortesia comercial"
                value={planChangeReason}
                onChange={e => { setPlanChangeReason(e.target.value); setPlanChangeError(''); }}
              />
              {planChangeError && (
                <p style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, marginTop: 4 }}>{planChangeError}</p>
              )}
              {/* TODO: future sprint — passar planChangeReason para onChangePlan quando a função aceitar motivo para auditoria */}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setPlanChangeConfirm(false); setPlanChangeReason(''); setPlanChangeError(''); }}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 13, cursor: 'pointer', color: '#374151' }}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!planChangeReason.trim()) { setPlanChangeError('Motivo administrativo é obrigatório.'); return; }
                  if (plan === sub.plan_code) { setPlanChangeError('Selecione um plano diferente do atual.'); return; }
                  setPlanChangeConfirm(false);
                  setPlanChangeReason('');
                  setPlanChangeError('');
                  await onChangePlan(sub.tenant_id, plan);
                }}
                disabled={actionLoading}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.5 : 1 }}
              >
                {actionLoading ? 'Aguarde...' : 'Confirmar alteração'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reactivate confirmation modal */}
      {reactivateConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 420, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <CheckCircle size={20} color="#059669" />
              <span style={{ fontWeight: 700, fontSize: 16, color: '#1a1a1a' }}>Reativar assinatura?</span>
            </div>
            <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 8 }}>
              O acesso de <strong>{sub.tenant_name ?? sub.user_email}</strong> será restaurado imediatamente.
            </p>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>
              O assinante voltará a ter acesso completo à plataforma conforme o plano vigente.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setReactivateConfirm(false)}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 13, cursor: 'pointer', color: '#374151' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => { setReactivateConfirm(false); onReactivate(sub.tenant_id); }}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Sim, reativar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
