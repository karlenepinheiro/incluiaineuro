/**
 * SubscriptionView.tsx
 * Gerenciamento de assinatura — plano atual, upgrade e créditos avulsos.
 * Pagamento via Kiwify (links de checkout estáticos + webhook).
 */

import React, { useState, useEffect } from 'react';
import {
  CreditCard, CheckCircle, AlertTriangle, XCircle, Clock,
  Zap, ArrowRight, RefreshCw, ExternalLink, Star, Shield,
} from 'lucide-react';
import type { User } from '../types';
import { getActiveSubscription, type ActiveSubscriptionInfo } from '../services/subscriptionService';
import {
  getSubscriptionCheckoutUrl,
  getCreditsCheckoutUrl,
  isKiwifyConfigured,
} from '../services/kiwifyService';

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
    code:         'PRO' as const,
    name:         'Pro',
    price:        79.90,
    credits:      50,
    maxStudents:  30,
    color:        P.petrol,
    features: [
      '30 alunos',
      '50 créditos IA/mês',
      'PEI, PAEE, PDI',
      'Documentos auditáveis SHA-256',
      'Triagem com IA',
    ],
  },
  {
    code:         'MASTER' as const,
    name:         'Master',
    price:        149.90,
    credits:      200,
    maxStudents:  999,
    color:        '#7C3AED',
    features: [
      'Alunos ilimitados',
      '200 créditos IA/mês',
      'Tudo do Pro',
      'Multiusuário',
      'Suporte prioritário',
    ],
  },
];

const CREDIT_PACKS = [
  { credits: 10,  price: 9.90,  label: '+10 créditos',  tag: null },
  { credits: 30,  price: 19.90, label: '+30 créditos',  tag: 'Melhor custo' },
  { credits: 100, price: 49.90, label: '+100 créditos', tag: 'Mais popular' },
];

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

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  user: User;
  creditsAvailable: number;
  onNavigate: (view: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const SubscriptionView: React.FC<Props> = ({ user, creditsAvailable, onNavigate }) => {
  const [sub, setSub]             = useState<ActiveSubscriptionInfo | null>(null);
  const [loading, setLoading]     = useState(true);
  const [kiwifyOk, setKiwifyOk]   = useState(false);
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      if (user.tenant_id) {
        try {
          const s = await getActiveSubscription(user.tenant_id);
          setSub(s);
        } catch { /* sem assinatura */ }
      }
      const ok = await isKiwifyConfigured();
      setKiwifyOk(ok);
      setLoading(false);
    };
    init();
  }, [user.tenant_id]);

  const planCode = sub?.planCode ?? user.plan ?? 'FREE';
  const isFree   = planCode === 'FREE';
  const isPro    = planCode === 'PRO';
  const isMaster = planCode === 'MASTER' || planCode === 'PREMIUM';

  // ── Abrir checkout de assinatura ─────────────────────────────────────────
  async function handleSubscribe(code: 'PRO' | 'MASTER') {
    if (!kiwifyOk) {
      setError('Pagamentos ainda não configurados. Entre em contato com o suporte.');
      return;
    }
    setLoadingUrl(code);
    setError(null);
    try {
      const url = await getSubscriptionCheckoutUrl(code, user.tenant_id ?? '');
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
      setError('Pacotes avulsos estão disponíveis apenas para assinantes Pro e Master.');
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
                {isMaster ? 'Master' : isPro ? 'Pro' : 'Free (Teste)'}
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
                Você está no plano gratuito de teste. Limite: 5 alunos, sem créditos IA.
                Faça upgrade para desbloquear todos os recursos.
              </div>
            )}
          </div>

          {/* Créditos */}
          <div style={{
            background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12,
            padding: '16px 20px', textAlign: 'center', minWidth: 140,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Créditos IA
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, color: '#D97706', lineHeight: 1 }}>
              {creditsAvailable}
            </div>
            <div style={{ fontSize: 11, color: '#92400E', marginTop: 4 }}>disponíveis</div>
          </div>
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
              onClick={() => handleSubscribe(planCode as 'PRO' | 'MASTER')}
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
          <h3 style={{ fontSize: 16, fontWeight: 700, color: P.dark, marginBottom: 14 }}>
            {isFree ? 'Escolha um plano' : 'Fazer upgrade'}
          </h3>
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
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 28, fontWeight: 800, color: P.dark }}>
                        R$ {plan.price.toFixed(2).replace('.', ',')}
                      </span>
                      <span style={{ fontSize: 13, color: '#94A3B8' }}>/mês</span>
                    </div>
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

      {/* ── Pacotes de créditos avulsos ──────────────────────────────────────── */}
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
          Disponíveis apenas para assinantes Pro e Master.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          {CREDIT_PACKS.map(pack => (
            <div key={pack.credits} style={{
              border: `1px solid ${P.border}`, borderRadius: 12, padding: '18px 16px',
            }}>
              {pack.tag ? (
                <div style={{
                  display: 'inline-block', fontSize: 10, fontWeight: 700,
                  background: '#FEF3C7', color: '#92400E',
                  padding: '2px 8px', borderRadius: 5, marginBottom: 10, letterSpacing: '0.04em',
                }}>
                  {pack.tag.toUpperCase()}
                </div>
              ) : <div style={{ height: 20, marginBottom: 10 }} />}

              <div style={{ fontSize: 22, fontWeight: 800, color: P.dark, marginBottom: 2 }}>{pack.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#D97706', marginBottom: 12 }}>
                R$ {pack.price.toFixed(2).replace('.', ',')}
              </div>

              <button
                onClick={() => handleBuyCreditPack(pack.credits)}
                disabled={loadingUrl === `credits_${pack.credits}` || isFree}
                style={{
                  width: '100%', padding: '9px', borderRadius: 7,
                  background: isFree ? '#F3F4F6' : '#FFFBEB',
                  color: isFree ? '#9CA3AF' : '#92400E',
                  border: `1.5px solid ${isFree ? '#E5E7EB' : '#FDE68A'}`,
                  fontSize: 13, fontWeight: 600,
                  cursor: isFree ? 'not-allowed' : (loadingUrl === `credits_${pack.credits}` ? 'wait' : 'pointer'),
                  opacity: loadingUrl === `credits_${pack.credits}` ? 0.7 : 1,
                }}
              >
                {loadingUrl === `credits_${pack.credits}`
                  ? 'Aguarde...'
                  : isFree ? 'Apenas para assinantes' : 'Comprar'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Info ─────────────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 24, fontSize: 13, color: '#64748B', lineHeight: 1.8, background: '#F8FAFC', borderRadius: 12, padding: '16px 20px' }}>
        <strong style={{ color: P.dark }}>Sobre os créditos:</strong> Gerar atividades simples custa 1 crédito.
        Analisar laudos, criar PEI/PAEE/PDI ou relatórios cognitivos custa 2–3 créditos.
        Créditos da assinatura renovam mensalmente.
        {!kiwifyOk && (
          <span style={{ display: 'block', marginTop: 8, color: '#D97706' }}>
            ⚠️ Links de pagamento em configuração. Entre em contato com o suporte.
          </span>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default SubscriptionView;
