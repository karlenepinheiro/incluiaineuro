/**
 * SubscriptionView.tsx
 * Gerenciamento de assinatura — plano atual, upgrade e créditos avulsos.
 * Pagamento via Kiwify (links de checkout estáticos + webhook).
 */

import React, { useState, useEffect } from 'react';
import {
  CreditCard, CheckCircle, AlertTriangle, XCircle, Clock,
  Zap, ArrowRight, RefreshCw, ExternalLink, Star, Shield, History,
  Sparkles, CalendarDays, Wrench, Receipt,
} from 'lucide-react';
import type { User, CreditLedgerEntry } from '../types';
import { formatPlanDisplayName, formatStudentLimit, PlanTier, resolvePlanTier } from '../types';
import { getActiveSubscription, type ActiveSubscriptionInfo } from '../services/subscriptionService';
import { SUBSCRIPTION_PLANS, CREDIT_PACKAGES as CREDIT_PACKAGES_CONFIG } from '../config/aiCosts';
import {
  getSubscriptionCheckoutUrl,
  getCreditsCheckoutUrl,
  isKiwifyConfigured,
} from '../services/kiwifyService';
import { CreditLedgerService } from '../services/creditService';

// ── Paleta ────────────────────────────────────────────────────────────────────
const P = {
  petrol:  '#1F4E5F',
  gold:    '#C69214',
  dark:    '#2E3A59',
  bg:      '#F6F4EF',
  surface: '#FFFFFF',
  border:  '#E7E2D8',
};

// ── Dados dos planos ──────────────────────────────────────────────────────────
const PLANS_INFO = [
  {
    code:             'PRO' as const,
    name:             SUBSCRIPTION_PLANS.PRO.name,
    price:            79,           // R$ 79/mês — mensal
    priceAnnual:      59,           // R$ 59/mês — no plano anual
    priceAnnualTotal: 708,          // R$ 708 cobrado anualmente
    couponAnnual:     'INCLUIAI59', // cupom oficial anual PRO
    credits:          SUBSCRIPTION_PLANS.PRO.credits,
    maxStudents:      SUBSCRIPTION_PLANS.PRO.students,
    color:            P.petrol,
    features: [
      `${SUBSCRIPTION_PLANS.PRO.students} alunos cadastrados`,
      `${SUBSCRIPTION_PLANS.PRO.credits} créditos IA/mês`,
      'Triagem com IA',
      'PEI, PAEE, PDI, Estudo de Caso completo',
      'Perfil cognitivo completo',
      'Documentos auditáveis SHA-256',
      'Exportação PDF profissional',
      'Relatórios prontos',
    ],
  },
  {
    code:             'MASTER' as const,
    name:             SUBSCRIPTION_PLANS.MASTER.name,
    price:            147,          // R$ 147/mês — mensal
    priceAnnual:      99,           // R$ 99/mês — no plano anual
    priceAnnualTotal: 1188,         // R$ 1.188 cobrado anualmente
    couponAnnual:     'INCLUIAI99', // cupom oficial anual PREMIUM
    credits:          SUBSCRIPTION_PLANS.MASTER.credits,
    maxStudents:      SUBSCRIPTION_PLANS.MASTER.students,
    color:            '#C69214',
    features: [
      'Tudo do PRO',
      'Alunos ilimitados',
      `${SUBSCRIPTION_PLANS.MASTER.credits} créditos IA/mês`,
      'Análise de laudos com IA (exclusivo)',
      'Fichas complementares',
      'Controle de atendimento',
      'Agendamento de atendimento',
      'Modelos personalizados',
      'Suporte prioritário',
    ],
  },
];

const CREDIT_PACKS = CREDIT_PACKAGES_CONFIG.map((pkg, i) => ({
  credits: pkg.credits,
  price:   pkg.price,
  sku:     `AI${pkg.credits}`,
  label:   `+${pkg.credits} créditos`,
  tag:     i === 1 ? 'Mais popular' : i === 2 ? 'Melhor custo' : null,
  desc:    pkg.label,
}));

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
    ACTIVE:        { label: 'Ativa',      bg: '#DCFCE7', color: '#15803D', icon: <CheckCircle size={13} /> },
    TRIAL:         { label: 'Teste',      bg: '#DBEAFE', color: '#1D4ED8', icon: <Clock size={13} /> },
    OVERDUE:       { label: 'Em atraso',  bg: '#FEF3C7', color: '#D97706', icon: <AlertTriangle size={13} /> },
    CANCELED:      { label: 'Cancelada',  bg: '#FEE2E2', color: '#DC2626', icon: <XCircle size={13} /> },
    PENDING:       { label: 'Pendente',   bg: '#F3F4F6', color: '#6B7280', icon: <Clock size={13} /> },
    INTERNAL_TEST: { label: 'Teste Int.', bg: '#F3E8FF', color: '#7C3AED', icon: <Star size={13} /> },
    COURTESY:      { label: 'Cortesia',   bg: '#DBEAFE', color: '#1D4ED8', icon: <Shield size={13} /> },
  };
  const c = cfg[status] ?? cfg['PENDING'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: c.bg, color: c.color,
      fontSize: 12, fontWeight: 700,
      padding: '4px 10px', borderRadius: 100,
    }}>
      {c.icon} {c.label}
    </span>
  );
}

// ── Ledger helpers ────────────────────────────────────────────────────────────
const PLAN_TYPES   = new Set(['plan_reset','monthly_grant','subscription','renewal','free_bootstrap','manual_grant','courtesy','bonus','bonus_manual']);
const PURCHASE_TYPES = new Set(['purchase','purchase_extra']);
const AI_TYPES     = new Set(['ai_debit','usage_ai','consumption']);

function getLedgerIcon(type: string): React.ReactNode {
  if (PLAN_TYPES.has(type)) return (
    <div style={{ width: 40, height: 40, borderRadius: 12, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <CalendarDays size={18} color="#1D4ED8" />
    </div>
  );
  if (PURCHASE_TYPES.has(type)) return (
    <div style={{ width: 40, height: 40, borderRadius: 12, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <CreditCard size={18} color="#15803D" />
    </div>
  );
  if (AI_TYPES.has(type)) return (
    <div style={{ width: 40, height: 40, borderRadius: 12, background: '#FAF5FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Sparkles size={18} color="#7C3AED" />
    </div>
  );
  return (
    <div style={{ width: 40, height: 40, borderRadius: 12, background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Wrench size={18} color="#64748B" />
    </div>
  );
}

function getDateGroupLabel(isoDate: string): string {
  const d   = new Date(isoDate);
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const key = (date: Date) => date.toDateString();
  if (key(d) === key(now))       return 'HOJE';
  if (key(d) === key(yesterday)) return 'ONTEM';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function groupLedgerByDate(entries: CreditLedgerEntry[]): { label: string; entries: CreditLedgerEntry[] }[] {
  const groups: { label: string; entries: CreditLedgerEntry[] }[] = [];
  const idx = new Map<string, number>();
  for (const entry of entries) {
    const label = getDateGroupLabel(entry.created_at);
    if (!idx.has(label)) { idx.set(label, groups.length); groups.push({ label, entries: [] }); }
    groups[idx.get(label)!].entries.push(entry);
  }
  return groups;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  user: User;
  creditsAvailable: number;
  /** Créditos mensais do plano vigente */
  planCreditsMonthly?: number;
  /** Créditos avulsos comprados (soma do ledger) */
  creditsPurchased?: number;
  /** Créditos consumidos no ciclo atual (soma do ledger) */
  creditsConsumed?: number;
  onNavigate: (view: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const SubscriptionView: React.FC<Props> = ({ user, creditsAvailable, planCreditsMonthly, creditsPurchased = 0, creditsConsumed = 0, onNavigate }) => {
  const [sub, setSub]             = useState<ActiveSubscriptionInfo | null>(null);
  const [loading, setLoading]     = useState(true);
  const [kiwifyOk, setKiwifyOk]   = useState(false);
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);
  /** Ciclo de cobrança selecionado pelo usuário na seção de upgrade. */
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [ledger, setLedger]         = useState<CreditLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (user.tenant_id) {
        try {
          const s = await getActiveSubscription(user.tenant_id);
          setSub(s);
        } catch { /* sem assinatura */ }

        setLedgerLoading(true);
        try {
          const entries = await CreditLedgerService.getHistory(user.tenant_id, 100);
          setLedger(entries);
        } catch (e) {
          console.error('[SubscriptionView] Erro ao carregar credits_ledger:', e);
          setLedgerError(String((e as any)?.message ?? e));
        } finally {
          setLedgerLoading(false);
        }
      }
      const ok = await isKiwifyConfigured();
      setKiwifyOk(ok);
      setLoading(false);
    };
    init();
  }, [user.tenant_id]);

  // rawCode pode ser DB code ('FREE','PRO','MASTER') ou PlanTier enum ('Starter (Grátis)', etc.)
  // quando não há subscription — resolvePlanTier normaliza ambos os formatos.
  const rawCode       = sub?.planCode ?? user.plan ?? 'FREE';
  const tier          = resolvePlanTier(rawCode);
  const isFree        = tier === PlanTier.FREE;
  const isPro         = tier === PlanTier.PRO;
  const isMaster      = tier === PlanTier.PREMIUM;
  const planShortCode = isFree ? 'FREE' : isPro ? 'PRO' : 'PREMIUM';

  // Nome de exibição com ciclo: "PRO MENSAL", "PREMIUM ANUAL", etc.
  const planDisplayName = formatPlanDisplayName(rawCode, sub?.billingCycle ?? 'monthly');

  // ── Abrir checkout de assinatura ─────────────────────────────────────────
  async function handleSubscribe(code: 'PRO' | 'MASTER', cycle?: 'monthly' | 'annual') {
    if (!kiwifyOk) {
      setError('Pagamentos ainda não configurados. Entre em contato com o suporte.');
      return;
    }
    const selectedCycle = cycle ?? billingCycle;
    setLoadingUrl(code);
    setError(null);
    try {
      const url = await getSubscriptionCheckoutUrl(code, user.tenant_id ?? '', selectedCycle);
      if (!url || url === '#') {
        setError('Link de assinatura indisponível. Entre em contato com o suporte.');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
      setSuccess('Checkout aberto! Complete o pagamento para ativar seu plano. O sistema será atualizado automaticamente.');
    } catch {
      setError('Erro ao obter link de pagamento.');
    } finally {
      setLoadingUrl(null);
    }
  }

  // ── Abrir checkout de créditos ───────────────────────────────────────────
  async function handleBuyCreditPack(credits: number) {
    if (!kiwifyOk) {
      setError('Pagamentos ainda não configurados. Entre em contato com o suporte.');
      return;
    }
    if (isFree) {
      setError('Pacotes avulsos estão disponíveis apenas para assinantes PRO e PREMIUM.');
      return;
    }
    setLoadingUrl(`credits_${credits}`);
    setError(null);
    try {
      const url = await getCreditsCheckoutUrl(credits, user.tenant_id ?? '');
      if (!url || url === '#') {
        setError('Link de compra indisponível. Entre em contato com o suporte.');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
      setSuccess(`Checkout aberto! Após o pagamento, +${credits} créditos serão adicionados automaticamente.`);
    } catch {
      setError('Erro ao obter link de pagamento.');
    } finally {
      setLoadingUrl(null);
    }
  }

  function fmtDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function fmtDateTime(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function typeLabel(type: string): string {
    const map: Record<string, string> = {
      plan_reset:    'Renovação de plano',
      monthly_grant: 'Renovação de plano',
      manual_grant:  'Concessão manual',
      purchase:      'Compra',
      purchase_extra:'Compra avulsa',
      refund:        'Estorno',
      ai_debit:      'Consumo IA',
      usage_ai:      'Consumo IA',
      consumption:   'Consumo IA',
      subscription:  'Assinatura',
      bonus:         'Bônus',
      bonus_manual:  'Bônus manual',
      free_bootstrap:'Créditos iniciais',
      courtesy:      'Cortesia',
      renewal:       'Renovação',
      adjustment:    'Ajuste',
      debit:         'Débito',
      credit:        'Crédito',
    };
    return map[type] ?? type;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <RefreshCw size={20} color={P.petrol} style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 0 40px' }}>

      {/* Alertas */}
      {error && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10,
          padding: '12px 16px', marginBottom: 20, color: '#B91C1C', fontSize: 14,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AlertTriangle size={16} /> {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C' }}>✕</button>
        </div>
      )}
      {success && (
        <div style={{
          background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10,
          padding: '12px 16px', marginBottom: 20, color: '#15803D', fontSize: 14,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <CheckCircle size={16} /> {success}
          <button onClick={() => setSuccess(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#15803D' }}>✕</button>
        </div>
      )}

      {/* ── Plano atual ─────────────────────────────────────────────────────── */}
      <div style={{
        background: P.surface, border: `1px solid ${P.border}`, borderRadius: 16,
        padding: '28px 28px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94A3B8', marginBottom: 6 }}>
              Plano atual
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: P.dark }}>
                {planDisplayName}
              </h2>
              {sub?.status && <StatusBadge status={sub.status} />}
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {sub?.currentPeriodEnd && (
                <div>
                  <p style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Período até</p>
                  <p style={{ fontSize: 14, fontWeight: 600, color: P.dark }}>{fmtDate(sub.currentPeriodEnd)}</p>
                </div>
              )}
              {sub?.nextDueDate && (
                <div>
                  <p style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Próximo vencimento</p>
                  <p style={{ fontSize: 14, fontWeight: 600, color: P.dark }}>{fmtDate(sub.nextDueDate)}</p>
                </div>
              )}
            </div>

            {/* Banner FREE */}
            {isFree && (
              <div style={{
                marginTop: 14, background: '#FFFBEB', border: '1px solid #FDE68A',
                borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400E',
              }}>
                Você está no plano gratuito. Limite: {SUBSCRIPTION_PLANS.FREE.students} alunos e {SUBSCRIPTION_PLANS.FREE.credits} créditos IA/mês.
                Faça upgrade para desbloquear todos os recursos.
              </div>
            )}
          </div>

          {/* Créditos — breakdown detalhado */}
          {(() => {
            const planInfo    = PLANS_INFO.find(p => p.code === planShortCode) ?? null;
            const monthlyPlan = planCreditsMonthly ?? planInfo?.credits ?? (isFree ? SUBSCRIPTION_PLANS.FREE.credits : 0);
            return (
              <div style={{
                background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12,
                padding: '16px 20px', minWidth: 200,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  Créditos IA
                </div>
                {/* Saldo final — destaque */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
                  <span style={{ fontSize: 38, fontWeight: 800, color: '#D97706', lineHeight: 1 }}>{creditsAvailable}</span>
                  <span style={{ fontSize: 12, color: '#92400E', fontWeight: 600 }}>disponíveis</span>
                </div>
                {/* Tabela de breakdown */}
                <div style={{ fontSize: 11, color: '#78350F', display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid #FDE68A', paddingTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                    <span>📅 Do plano ({planShortCode}):</span>
                    <strong>{monthlyPlan}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                    <span>🛒 Comprados:</span>
                    <strong style={{ color: creditsPurchased > 0 ? '#15803D' : undefined }}>+{creditsPurchased}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                    <span>⚡ Consumidos:</span>
                    <strong style={{ color: creditsConsumed > 0 ? '#B45309' : undefined }}>−{creditsConsumed}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, borderTop: '1px solid #FDE68A', paddingTop: 4, marginTop: 2 }}>
                    <span style={{ fontWeight: 700 }}>💰 Saldo atual:</span>
                    <strong style={{ color: '#D97706', fontSize: 12 }}>{creditsAvailable}</strong>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Pagamento atrasado */}
        {(sub?.status === 'OVERDUE' || sub?.status === 'PENDING') && (
          <div style={{
            marginTop: 20, background: '#FFFBEB', border: '1px solid #FDE68A',
            borderRadius: 10, padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#92400E', marginBottom: 2 }}>
                {sub?.status === 'OVERDUE' ? 'Pagamento atrasado' : 'Pagamento pendente'}
              </p>
              <p style={{ fontSize: 13, color: '#92400E' }}>
                Regularize para manter acesso às funcionalidades de IA.
              </p>
            </div>
            <button
              onClick={() => handleSubscribe(isPro ? 'PRO' : 'MASTER')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#D97706', color: 'white',
                padding: '10px 18px', borderRadius: 8,
                fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
              }}
            >
              <CreditCard size={15} /> Regularizar pagamento <ExternalLink size={13} />
            </button>
          </div>
        )}
      </div>

      {/* ── Upgrade de plano (FREE e PRO veem opções) ───────────────────────── */}
      {!isMaster && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: P.dark }}>
              {isFree ? 'Escolha um plano' : 'Fazer upgrade'}
            </h3>

            {/* Toggle mensal / anual */}
            <div style={{ display: 'inline-flex', background: '#E2E8F0', borderRadius: 100, padding: 3 }}>
              <button
                onClick={() => setBillingCycle('monthly')}
                style={{
                  padding: '7px 18px', borderRadius: 100, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                  background: billingCycle === 'monthly' ? '#FFFFFF' : 'transparent',
                  color: billingCycle === 'monthly' ? P.dark : '#94A3B8',
                  boxShadow: billingCycle === 'monthly' ? '0 2px 6px rgba(0,0,0,.10)' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                Mensal
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                style={{
                  padding: '7px 18px', borderRadius: 100, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                  background: billingCycle === 'annual' ? '#FFFFFF' : 'transparent',
                  color: billingCycle === 'annual' ? P.dark : '#94A3B8',
                  boxShadow: billingCycle === 'annual' ? '0 2px 6px rgba(0,0,0,.10)' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                Anual&nbsp;
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  background: billingCycle === 'annual' ? '#DCFCE7' : '#E2E8F0',
                  color: billingCycle === 'annual' ? '#15803D' : '#94A3B8',
                  padding: '2px 6px', borderRadius: 5,
                }}>
                  Parcelável
                </span>
              </button>
            </div>
          </div>

          {billingCycle === 'annual' && (
            <p style={{ fontSize: 12, color: '#15803D', fontWeight: 600, marginBottom: 12 }}>
              ✓ Plano anual — pagamento único com parcelamento disponível no checkout.
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {PLANS_INFO.filter(p => {
              if (isFree) return true;
              if (isPro)  return p.code === 'MASTER';
              return false;
            }).map(plan => (
              <div key={plan.code} style={{
                background: P.surface, border: `2px solid ${plan.color}20`,
                borderRadius: 14, padding: '22px 22px',
                boxShadow: `0 4px 20px ${plan.color}10`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <span style={{
                      display: 'inline-block', fontSize: 11, fontWeight: 700,
                      background: `${plan.color}15`, color: plan.color,
                      padding: '3px 10px', borderRadius: 6, textTransform: 'uppercase',
                      letterSpacing: '0.08em', marginBottom: 6,
                    }}>
                      {plan.name}
                    </span>

                    {billingCycle === 'monthly' ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                          <span style={{ fontSize: 28, fontWeight: 800, color: P.dark }}>
                            R$ {plan.price}
                          </span>
                          <span style={{ fontSize: 13, color: '#94A3B8' }}>/mês</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#22C55E', fontWeight: 600, marginTop: 2 }}>
                          ou R$ {plan.priceAnnual}/mês no plano anual
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                          <span style={{ fontSize: 28, fontWeight: 800, color: P.dark }}>
                            R$ {plan.priceAnnual}
                          </span>
                          <span style={{ fontSize: 13, color: '#94A3B8' }}>/mês</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                          Cobrado anualmente · R$ {plan.priceAnnualTotal.toLocaleString('pt-BR')}/ano
                        </div>
                        <div style={{
                          marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
                          background: '#F0FDF4', border: '1px solid #BBF7D0',
                          borderRadius: 6, padding: '4px 10px',
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#15803D', letterSpacing: '0.04em' }}>
                            🎉 Desconto aplicado automaticamente
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                  <Zap size={24} color={plan.color} />
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {plan.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
                      <CheckCircle size={13} color={plan.color} style={{ flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.code)}
                  disabled={loadingUrl === plan.code}
                  style={{
                    width: '100%', padding: '11px', borderRadius: 9,
                    background: plan.color, color: 'white',
                    fontSize: 14, fontWeight: 700, border: 'none', cursor: loadingUrl === plan.code ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    opacity: loadingUrl === plan.code ? 0.7 : 1,
                  }}
                >
                  {loadingUrl === plan.code
                    ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Aguarde...</>
                    : <>{isFree ? 'Assinar' : 'Fazer upgrade'} {plan.name} <ArrowRight size={14} /></>
                  }
                </button>

                <p style={{ fontSize: 11, textAlign: 'center', color: '#94A3B8', marginTop: 8 }}>
                  Pagamento seguro via Kiwify
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pacotes de créditos avulsos (apenas PRO/PREMIUM) ────────────────── */}
      {isFree ? (
        <div style={{
          background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 16,
          padding: '22px 24px', display: 'flex', alignItems: 'flex-start', gap: 16,
        }}>
          <div style={{ width: 36, height: 36, background: '#FEF3C7', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Zap size={18} color="#D97706" />
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>
              Pacotes de créditos avulsos
            </p>
            <p style={{ fontSize: 13, color: '#78350F', lineHeight: 1.6, marginBottom: 0 }}>
              Pacotes de créditos avulsos estão disponíveis apenas para assinantes <strong>PRO</strong> e <strong>PREMIUM</strong>.<br />
              Faça upgrade acima para desbloquear essa funcionalidade e comprar créditos extras a qualquer momento.
            </p>
          </div>
        </div>
      ) : (
        <div style={{
          background: P.surface, border: `1px solid ${P.border}`, borderRadius: 16,
          padding: '24px 24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 32, height: 32, background: '#FEF3C7', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={15} color="#D97706" />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: P.dark }}>Pacotes de créditos avulsos</h3>
          </div>
          <p style={{ fontSize: 13, color: '#64748B', marginBottom: 20, lineHeight: 1.6 }}>
            Sem créditos suficientes? Compre pacotes avulsos a qualquer momento.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            {CREDIT_PACKS.map(pack => (
              <div key={pack.credits} style={{
                border: `1px solid ${pack.tag === 'Mais popular' ? '#FDE68A' : P.border}`,
                borderRadius: 12, padding: '18px 16px',
                background: pack.tag === 'Mais popular' ? '#FFFBEB' : P.surface,
              }}>
                {pack.tag ? (
                  <div style={{
                    display: 'inline-block', fontSize: 10, fontWeight: 700,
                    background: pack.tag === 'Melhor custo' ? '#DCFCE7' : '#FEF3C7',
                    color: pack.tag === 'Melhor custo' ? '#166534' : '#92400E',
                    padding: '2px 8px', borderRadius: 5, marginBottom: 10, letterSpacing: '0.04em',
                  }}>
                    {pack.tag.toUpperCase()}
                  </div>
                ) : <div style={{ height: 20, marginBottom: 10 }} />}

                <div style={{ fontSize: 22, fontWeight: 800, color: P.dark, marginBottom: 2 }}>{pack.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#D97706', marginBottom: 6 }}>
                  R$ {pack.price.toFixed(2).replace('.', ',')}
                </div>
                <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 14, lineHeight: 1.5 }}>{pack.desc}</p>

                <button
                  onClick={() => handleBuyCreditPack(pack.credits)}
                  disabled={loadingUrl === `credits_${pack.credits}`}
                  style={{
                    width: '100%', padding: '9px', borderRadius: 7,
                    background: '#FFFBEB', color: '#92400E',
                    border: '1.5px solid #FDE68A',
                    fontSize: 13, fontWeight: 600,
                    cursor: loadingUrl === `credits_${pack.credits}` ? 'wait' : 'pointer',
                    opacity: loadingUrl === `credits_${pack.credits}` ? 0.7 : 1,
                  }}
                >
                  {loadingUrl === `credits_${pack.credits}` ? 'Aguarde...' : 'Comprar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Histórico financeiro e créditos (accordion) ────────────────────── */}
      <div style={{
        background: P.surface, border: `1px solid ${P.border}`, borderRadius: 16,
        marginTop: 20, overflow: 'hidden',
      }}>
        {/* Cabeçalho clicável */}
        <button
          onClick={() => setHistoryOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '20px 24px', background: 'none', border: 'none', cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ width: 32, height: 32, background: '#EFF6FF', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <History size={15} color="#1D4ED8" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: P.dark, marginBottom: 2 }}>
              Histórico financeiro e créditos
            </p>
            <p style={{ fontSize: 12, color: '#94A3B8' }}>
              Veja todas as movimentações de créditos da sua conta.
            </p>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: historyOpen ? P.petrol : '#EFF6FF',
            color: historyOpen ? '#fff' : '#1D4ED8',
            fontSize: 12, fontWeight: 700,
            padding: '6px 14px', borderRadius: 8,
            flexShrink: 0, transition: 'all 0.2s',
          }}>
            {historyOpen ? 'Recolher' : 'Ver histórico'}
            <ArrowRight size={12} style={{ transform: historyOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
          </div>
        </button>

        {/* Conteúdo expansível */}
        {historyOpen && (
          <div style={{ padding: '0 24px 24px', borderTop: `1px solid ${P.border}` }}>

            {/* Resumo do ciclo */}
            {!ledgerLoading && !ledgerError && ledger.length > 0 && (() => {
              const received = ledger.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
              const consumed = ledger.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);
              return (
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
                  background: '#F8FAFC', border: `1px solid ${P.border}`,
                  borderRadius: 12, padding: '16px 20px', margin: '20px 0',
                }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                      Recebidos
                    </p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: '#15803D', lineHeight: 1 }}>+{received}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                      Consumidos
                    </p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: '#DC2626', lineHeight: 1 }}>−{consumed}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                      Saldo atual
                    </p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: P.dark, lineHeight: 1 }}>{creditsAvailable}</p>
                  </div>
                </div>
              );
            })()}

            {ledgerError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', margin: '16px 0', color: '#B91C1C', fontSize: 13 }}>
                Erro ao carregar histórico: {ledgerError}
              </div>
            )}

            {ledgerLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: '#64748B', fontSize: 14 }}>
                <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando histórico...
              </div>
            ) : !ledgerError && ledger.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px', textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, background: '#F1F5F9', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Receipt size={22} color="#94A3B8" />
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, color: P.dark, marginBottom: 6 }}>Nenhuma movimentação ainda</p>
                <p style={{ fontSize: 13, color: '#94A3B8', maxWidth: 300, lineHeight: 1.6 }}>
                  Quando você gerar atividades ou receber créditos, tudo aparecerá aqui.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {groupLedgerByDate(ledger).map((group, gi) => (
                  <div key={group.label}>
                    <div style={{
                      fontSize: 11, fontWeight: 700, color: '#94A3B8',
                      textTransform: 'uppercase', letterSpacing: '0.12em',
                      marginBottom: 10, paddingLeft: 4,
                    }}>
                      {group.label}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {group.entries.map((entry, idx) => (
                        <div
                          key={entry.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 14,
                            padding: '14px 16px', borderRadius: 12,
                            background: P.surface, border: `1px solid ${P.border}`,
                            cursor: 'default', transition: 'background 0.15s, box-shadow 0.15s',
                            animation: 'fadeInUp 0.25s ease both',
                            animationDelay: `${(gi * 8 + idx) * 35}ms`,
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLDivElement).style.background = '#FAFAFA';
                            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 10px rgba(0,0,0,0.06)';
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLDivElement).style.background = P.surface;
                            (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                          }}
                        >
                          {getLedgerIcon(entry.type)}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 14, fontWeight: 600, color: P.dark, marginBottom: 5,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {entry.description || typeLabel(entry.type)}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#475569', background: '#F1F5F9', padding: '2px 8px', borderRadius: 5 }}>
                                {typeLabel(entry.type)}
                              </span>
                              {entry.source && (
                                <span style={{ fontSize: 11, color: '#94A3B8', background: '#F8FAFC', padding: '2px 8px', borderRadius: 5 }}>
                                  {entry.source}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{
                              fontSize: 18, fontWeight: 800, lineHeight: 1, marginBottom: 4,
                              color: entry.amount >= 0 ? '#15803D' : '#DC2626',
                            }}>
                              {entry.amount >= 0 ? '+' : ''}{entry.amount}
                            </div>
                            <div style={{ fontSize: 11, color: '#94A3B8' }}>
                              {new Date(entry.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Info ─────────────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 24, fontSize: 13, color: '#64748B', lineHeight: 1.9, background: '#F8FAFC', borderRadius: 12, padding: '16px 20px' }}>
        <strong style={{ color: P.dark }}>Sobre os créditos:</strong>
        <ul style={{ marginTop: 6, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <li><strong>Relatórios e pareceres</strong>: 1–3 créditos (modelo Econômico a Premium)</li>
          <li><strong>Atividades (texto)</strong>: 1 crédito (Texto apenas)</li>
          <li><strong>Atividades com imagem</strong>: 30–50 créditos (Nano Banana Pro ou ChatGPT Imagem)</li>
          <li><strong>PEI / PAEE / PDI / Estudo de Caso</strong>: 3–5 créditos</li>
          <li><strong>Análise de laudos</strong>: 5 créditos</li>
          <li>Créditos do plano renovam mensalmente. Créditos comprados acumulam sem expirar.</li>
        </ul>
        {!kiwifyOk && (
          <span style={{ display: 'block', marginTop: 8, color: '#D97706' }}>
            ⚠️ Links de pagamento em configuração. Entre em contato com o suporte.
          </span>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default SubscriptionView;
