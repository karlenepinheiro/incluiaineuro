import React, { useState, useEffect } from 'react';
import { CheckCircle, ArrowRight, CreditCard, Info, Tag } from 'lucide-react';
import { getSubscriptionCheckoutUrl } from '../services/kiwifyService';
import { LandingService } from '../services/landingService';

import type { User } from '../types';

// ─── Design tokens (fonte: BrandLogo.tsx) ────────────────────────────────────
const T = {
  blue:     '#1F4E5F',
  petrol:   '#1F4E5F',   // alias
  petrolDk: '#17404F',
  petrolLt: '#EBF3F6',
  orange:   '#E07B2A',
  orangeDk: '#C4661E',
  orangeLt: '#FEF3E8',
  green:    '#10B981',
  ink:      '#0F172A',
  textSec:  '#475569',
  border:   '#E2E8F0',
  muted:    '#94A3B8',
  white:    '#FFFFFF',
  surface:  '#F8FAFC',
  // kept as aliases to avoid changing all references below
  gold:     '#C69214',
  goldLt:   '#FDF7E8',
  cream:    '#F8FAFC',
};

// ─── Estilos visuais por plano ────────────────────────────────────────────────
const PLAN_STYLE = {
  free: {
    id: 'free',
    planCode: 'FREE' as const,
    name: 'Grátis',
    badge: null as string | null,
    accentColor: T.textSec,
    accentLight: T.cream,
    accentLabelColor: T.textSec,
    borderStyle: `1.5px solid ${T.border}`,
    shadow: '0 2px 12px rgba(0,0,0,0.04)',
    shadowHover: '0 10px 32px rgba(31,78,95,0.08)',
    ctaClass: 'ps2-cta-free',
    cta: 'Começar grátis',
    featured: false,
  },
  pro: {
    id: 'pro',
    planCode: 'PRO' as const,
    name: 'Pro',
    badge: null as string | null,
    accentColor: T.orange,
    accentLight: T.orangeLt,
    accentLabelColor: T.orangeDk,
    borderStyle: `2px solid ${T.orange}`,
    shadow: '0 4px 24px rgba(224,123,42,0.10)',
    shadowHover: '0 14px 44px rgba(224,123,42,0.22)',
    ctaClass: 'ps2-cta-pro',
    cta: 'Assinar o PRO',
    featured: false,
  },
  premium: {
    id: 'premium',
    planCode: 'MASTER' as const,
    name: 'Premium',
    badge: 'Recomendado' as string | null,
    accentColor: T.petrol,
    accentLight: T.petrolLt,
    accentLabelColor: T.petrol,
    borderStyle: `2.5px solid ${T.petrol}`,
    shadow: '0 8px 40px rgba(31,78,95,0.14)',
    shadowHover: '0 20px 60px rgba(31,78,95,0.22)',
    ctaClass: 'ps2-cta-premium',
    cta: 'Assinar o Premium',
    featured: true,
  },
};

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULTS = {
  planos: {
    title: 'Escolha o plano certo para a sua realidade.',
    subtitle: 'Dois planos para necessidades diferentes. Escolha o que faz mais sentido para você.',
    free_tagline: 'Para começar agora, sem custo',
    free_features: ['Até 5 alunos', '60 créditos IA/mês', 'PEI e PAEE básico', 'Protocolo de Aprendizagem', 'Exportação PDF'],
    pro_full_price: 79, pro_discount_price: 79, pro_annual_price: 59,
    pro_tagline: 'Para professores e especialistas',
    pro_features: ['Até 30 alunos', '500 créditos IA/mês', 'PEI, PAEE, PDI completos', 'Protocolo de Aprendizagem', 'Estudo de Caso', 'Histórico do aluno', 'Suporte padrão'],
    premium_full_price: 147, premium_discount_price: 147, premium_annual_price: 99,
    premium_tagline: 'Para escolas e clínicas',
    premium_features: ['Alunos ilimitados', '700 créditos IA/mês', 'Tudo do plano Pro', 'Fichas complementares avançadas', 'Análise de laudos com IA', 'Relatórios evolutivos completos', 'Prioridade em novos recursos'],
  },
  descontos: {
    pro_coupon: 'INCLUIAI59', pro_coupon_active: true,
    premium_coupon: 'INCLUIAI99', premium_coupon_active: true,
    badge_label: '',
    urgency_label: '',
  },
  avisos: {
    urgency_badge: '',
    urgency_clock: '',
    installment_title: 'Plano anual disponível em parcelas',
    installment_items: ['Mais leve no limite do cartão', 'Sem necessidade de limite alto disponível', 'Parcele em até 12x'],
    trust_items: ['Cancele quando quiser', 'Sem taxa de instalação', 'LGPD conforme', 'Suporte incluído'],
  },
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  onLogin: () => void;
  onRegister?: () => void;
  onUpgradeClick?: (planCode: 'PRO' | 'MASTER') => void;
  user?: User | null;
  isAuthenticated?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────
export const PricingSection: React.FC<Props> = ({
  onLogin,
  onRegister,
  onUpgradeClick,
  user,
  isAuthenticated,
}) => {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [planos,    setPlanos]    = useState(DEFAULTS.planos);
  const [descontos, setDescontos] = useState(DEFAULTS.descontos);
  const [avisos,    setAvisos]    = useState(DEFAULTS.avisos);

  useEffect(() => {
    LandingService.getActive().then(sections => {
      sections.forEach(s => {
        const cj = s.content_json;
        if (s.section_key === 'planos')    setPlanos(prev => ({ ...prev, title: s.title ?? prev.title, subtitle: s.subtitle ?? prev.subtitle, ...cj }));
        if (s.section_key === 'descontos') setDescontos(prev => ({ ...prev, ...cj }));
        if (s.section_key === 'avisos')    setAvisos(prev => ({ ...prev, ...cj }));
      });
    }).catch(() => {});
  }, []);

  // ─── Checkout ───────────────────────────────────────────────────────────────
  const handlePlanClick = async (planCode: 'PRO' | 'MASTER' | 'FREE') => {
    if (planCode === 'FREE') {
      if (onRegister) onRegister();
      else onLogin();
      return;
    }
    if (!isAuthenticated || !user?.tenant_id) {
      setLoadingPlan(planCode);
      try {
        const url = await getSubscriptionCheckoutUrl(planCode, '', billingCycle);
        if (url && url !== '#') {
          window.location.href = url;
          return;
        }
      } catch { /* fallback */ }
      setLoadingPlan(null);
      if (onUpgradeClick) onUpgradeClick(planCode);
      else onLogin();
      return;
    }
    setLoadingPlan(planCode);
    try {
      const url = await getSubscriptionCheckoutUrl(planCode, user.tenant_id, billingCycle);
      if (url && url !== '#') window.open(url, '_blank');
      else onLogin();
    } finally {
      setLoadingPlan(null);
    }
  };

  // ─── Plans data ─────────────────────────────────────────────────────────────
  const plans = [
    {
      ...PLAN_STYLE.free,
      fullPrice: 0, discountPrice: 0, annualPrice: 0,
      credits: 60,
      tagline:  (planos as any).free_tagline  ?? DEFAULTS.planos.free_tagline,
      features: Array.isArray((planos as any).free_features) ? (planos as any).free_features : DEFAULTS.planos.free_features,
      coupon: '', couponActive: false,
      annualTotal: 0,
    },
    {
      ...PLAN_STYLE.pro,
      fullPrice:     planos.pro_full_price,
      discountPrice: planos.pro_discount_price,
      annualPrice:   (planos as any).pro_annual_price ?? DEFAULTS.planos.pro_annual_price,
      credits: 500,
      tagline:  planos.pro_tagline,
      features: planos.pro_features,
      coupon:       descontos.pro_coupon,
      couponActive: descontos.pro_coupon_active,
      annualTotal: Math.round(((planos as any).pro_annual_price ?? DEFAULTS.planos.pro_annual_price) * 12),
    },
    {
      ...PLAN_STYLE.premium,
      fullPrice:     planos.premium_full_price,
      discountPrice: planos.premium_discount_price,
      annualPrice:   (planos as any).premium_annual_price ?? DEFAULTS.planos.premium_annual_price,
      credits: 700,
      tagline:  planos.premium_tagline,
      features: planos.premium_features,
      coupon:       descontos.premium_coupon,
      couponActive: descontos.premium_coupon_active,
      annualTotal: Math.round(((planos as any).premium_annual_price ?? DEFAULTS.planos.premium_annual_price) * 12),
    },
  ];

  const trustItems: string[] = Array.isArray(avisos.trust_items) ? avisos.trust_items : DEFAULTS.avisos.trust_items;

  return (
    <section id="pricing" style={{ background: T.cream, padding: '96px 0 80px' }}>

      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .ps2-card { transition: none !important; }
        }

        .ps2-card {
          border-radius: 20px;
          padding: 36px 28px 32px;
          display: flex;
          flex-direction: column;
          transition: transform 0.25s cubic-bezier(.22,1,.36,1), box-shadow 0.25s;
          position: relative;
          background: ${T.white};
        }
        .ps2-card:hover { transform: translateY(-4px); }

        .ps2-cta-free {
          width: 100%; padding: 14px; border-radius: 10px; font-size: 15px;
          font-weight: 700; cursor: pointer;
          border: 1.5px solid ${T.border};
          background: ${T.cream}; color: ${T.textSec}; font-family: inherit;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: background 0.2s, color 0.2s;
          min-height: 48px; touch-action: manipulation;
        }
        .ps2-cta-free:hover { background: #E7E2D8; color: ${T.ink}; }
        .ps2-cta-free:focus-visible { outline: 3px solid ${T.gold}; outline-offset: 2px; }

        .ps2-cta-pro {
          width: 100%; padding: 14px; border-radius: 10px; font-size: 15px;
          font-weight: 700; cursor: pointer;
          border: none;
          background: ${T.orange}; color: white; font-family: inherit;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: background 0.2s, box-shadow 0.2s;
          min-height: 48px; touch-action: manipulation;
          box-shadow: 0 4px 16px rgba(224,123,42,0.25);
        }
        .ps2-cta-pro:hover { background: ${T.orangeDk}; box-shadow: 0 8px 28px rgba(224,123,42,0.35); }
        .ps2-cta-pro:disabled { opacity: 0.5; cursor: not-allowed; }
        .ps2-cta-pro:focus-visible { outline: 3px solid ${T.petrol}; outline-offset: 2px; }

        .ps2-cta-premium {
          width: 100%; padding: 14px; border-radius: 10px; font-size: 16px;
          font-weight: 800; cursor: pointer; border: none; font-family: inherit;
          background: ${T.petrol}; color: white;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: background 0.2s, box-shadow 0.2s;
          min-height: 48px; touch-action: manipulation;
          box-shadow: 0 6px 24px rgba(31,78,95,0.30);
        }
        .ps2-cta-premium:hover { background: ${T.petrolDk}; box-shadow: 0 10px 32px rgba(31,78,95,0.40); }
        .ps2-cta-premium:disabled { opacity: 0.5; cursor: not-allowed; }
        .ps2-cta-premium:focus-visible { outline: 3px solid ${T.gold}; outline-offset: 2px; }

        @media (max-width: 680px) {
          .ps2-cards-grid { grid-template-columns: 1fr !important; max-width: 480px !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ps2-card { transition: none !important; }
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>

        {/* ── Header ── */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{
            display: 'inline-block',
            fontSize: 11, fontWeight: 700, color: T.petrol,
            textTransform: 'uppercase', letterSpacing: '0.12em',
            background: T.petrolLt, padding: '5px 16px', borderRadius: 100, marginBottom: 20,
            border: `1px solid rgba(31,78,95,0.15)`,
          }}>
            Planos & Preços
          </div>

          <h2 style={{
            fontSize: 'clamp(26px, 3.8vw, 42px)', fontWeight: 800,
            color: T.ink, letterSpacing: '-0.03em', lineHeight: 1.12,
            marginBottom: 14,
          }}>
            {planos.title}
          </h2>
          <p style={{
            fontSize: 17, color: T.textSec, lineHeight: 1.65,
            maxWidth: 480, margin: '0 auto',
          }}>
            {planos.subtitle}
          </p>
        </div>

        {/* ── Toggle mensal / anual ── */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 40 }}>
          <div
            role="group"
            aria-label="Período de cobrança"
            style={{ display: 'inline-flex', background: '#E7E2D8', borderRadius: 100, padding: 4 }}
          >
            <button
              onClick={() => setBillingCycle('monthly')}
              aria-pressed={billingCycle === 'monthly'}
              style={{
                padding: '9px 24px', borderRadius: 100, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                background: billingCycle === 'monthly' ? T.white : 'transparent',
                color: billingCycle === 'monthly' ? T.ink : T.muted,
                boxShadow: billingCycle === 'monthly' ? '0 2px 6px rgba(0,0,0,.08)' : 'none',
                transition: 'all 0.2s',
                minHeight: 40,
              }}
            >Mensal</button>
            <button
              onClick={() => setBillingCycle('annual')}
              aria-pressed={billingCycle === 'annual'}
              style={{
                padding: '9px 24px', borderRadius: 100, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                background: billingCycle === 'annual' ? T.white : 'transparent',
                color: billingCycle === 'annual' ? T.ink : T.muted,
                boxShadow: billingCycle === 'annual' ? '0 2px 6px rgba(0,0,0,.08)' : 'none',
                transition: 'all 0.2s',
                minHeight: 40,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              Anual
              <span style={{
                fontSize: 11, fontWeight: 700,
                background: billingCycle === 'annual' ? T.petrolLt : '#E7E2D8',
                color: billingCycle === 'annual' ? T.petrol : T.muted,
                padding: '2px 8px', borderRadius: 6,
              }}>
                Parcelável
              </span>
            </button>
          </div>
        </div>

        {/* ── Cards ── */}
        <div
          className="ps2-cards-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 28,
            maxWidth: 840,
            margin: '0 auto 56px',
            alignItems: 'start',
          }}
        >
          {plans.filter(p => p.id !== 'free').map(plan => (
            <div
              key={plan.id}
              className="ps2-card"
              style={{ border: plan.borderStyle, boxShadow: plan.shadow }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = plan.shadowHover)}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = plan.shadow)}
            >
              {/* Badge */}
              {plan.badge && (
                <div style={{
                  position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                  background: T.petrol, color: 'white',
                  fontSize: 11, fontWeight: 800,
                  padding: '5px 20px', borderRadius: 100,
                  whiteSpace: 'nowrap', letterSpacing: '0.06em',
                  boxShadow: '0 4px 14px rgba(31,78,95,0.30)',
                }}>
                  {plan.badge}
                </div>
              )}

              {/* Plan label */}
              <div style={{ marginBottom: 20, marginTop: plan.badge ? 12 : 0 }}>
                <div style={{
                  display: 'inline-block',
                  background: plan.accentLight, color: plan.accentLabelColor,
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.10em', padding: '4px 12px', borderRadius: 6,
                  marginBottom: 16, border: `1px solid ${plan.accentColor}22`,
                }}>
                  {plan.name}
                </div>

                {/* Preço */}
                {plan.id !== 'free' && billingCycle === 'annual' && (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 14, color: T.muted, textDecoration: 'line-through', fontWeight: 500 }}>
                      R$ {plan.discountPrice}/mês
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 4 }}>
                  {plan.id === 'free' ? (
                    <span style={{ fontSize: 38, fontWeight: 900, color: plan.accentColor, letterSpacing: '-0.04em', lineHeight: 1 }}>
                      Grátis
                    </span>
                  ) : (
                    <>
                      <span style={{ fontSize: 15, fontWeight: 600, color: T.textSec, paddingBottom: 8 }}>R$</span>
                      <span style={{ fontSize: 50, fontWeight: 900, color: plan.accentColor, letterSpacing: '-0.045em', lineHeight: 1 }}>
                        {billingCycle === 'annual' ? (plan as any).annualPrice : plan.fullPrice}
                      </span>
                      <span style={{ fontSize: 14, color: T.muted, paddingBottom: 8 }}>/mês</span>
                    </>
                  )}
                </div>

                {/* Total anual — exibido com clareza */}
                {plan.id !== 'free' && billingCycle === 'annual' && (
                  <div style={{
                    fontSize: 13, color: T.petrol, fontWeight: 600, marginBottom: 4,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <Tag size={12} />
                    R$ {(plan as any).annualTotal}/ano — pagamento único parcelável
                  </div>
                )}

                <p style={{ fontSize: 13, color: T.textSec, marginTop: 2 }}>{plan.tagline}</p>
              </div>

              {/* Desconto automático — só no anual */}
              {plan.couponActive && billingCycle === 'annual' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: T.petrolLt, border: `1px solid rgba(31,78,95,0.18)`,
                  borderRadius: 8, padding: '9px 14px', marginBottom: 14,
                }}>
                  <CheckCircle size={14} color={T.petrol} aria-hidden="true" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.petrol }}>
                    Desconto anual aplicado automaticamente
                  </span>
                </div>
              )}

              {/* Separador */}
              <div style={{ height: 1, background: T.border, margin: '18px 0' }} />

              {/* Créditos */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: plan.accentLight,
                border: `1px solid ${plan.accentColor}20`,
                borderRadius: 10, padding: '10px 14px', marginBottom: 16,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.textSec }}>Créditos IA/mês</span>
                <span style={{
                  fontSize: 22, fontWeight: 900, color: plan.accentColor,
                  letterSpacing: '-0.03em', lineHeight: 1,
                }}>
                  {(plan as any).credits}
                </span>
              </div>

              {/* Features */}
              <ul style={{
                listStyle: 'none', padding: 0, margin: '0 0 24px',
                display: 'flex', flexDirection: 'column', gap: 10, flex: 1,
              }}>
                {(Array.isArray(plan.features) ? plan.features : []).map((f: string) => (
                  <li key={f} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    fontSize: 14, color: '#374151', lineHeight: 1.4,
                  }}>
                    <CheckCircle
                      size={15}
                      color={plan.accentColor}
                      style={{ flexShrink: 0, marginTop: 2 }}
                      aria-hidden="true"
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                className={plan.ctaClass}
                onClick={() => handlePlanClick(plan.planCode)}
                disabled={loadingPlan === plan.planCode}
                aria-busy={loadingPlan === plan.planCode}
              >
                {loadingPlan === plan.planCode
                  ? 'Aguarde...'
                  : <>{isAuthenticated ? 'Ir para pagamento' : plan.cta} <ArrowRight size={16} /></>
                }
              </button>

              {/* Informações de pagamento */}
              <p style={{
                textAlign: 'center', fontSize: 12, color: T.muted,
                marginTop: 10, display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 5,
              }}>
                <CreditCard size={11} aria-hidden="true" />
                Pagamento seguro via Kiwify
              </p>
              {plan.id !== 'free' && (
                <p style={{
                  textAlign: 'center', fontSize: 12, color: T.muted, marginTop: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}>
                  {billingCycle === 'annual' ? (
                    <>
                      <Info size={11} aria-hidden="true" />
                      Plano anual com fidelidade de 12 meses
                    </>
                  ) : (
                    <>
                      <CheckCircle size={11} color="#16A34A" aria-hidden="true" />
                      Cancele quando quiser, sem fidelidade
                    </>
                  )}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* ── Trust badges ── */}
        <div
          role="list"
          aria-label="Garantias"
          style={{
            textAlign: 'center', display: 'flex', gap: 24,
            justifyContent: 'center', flexWrap: 'wrap',
          }}
        >
          {trustItems.map(t => (
            <span
              key={t}
              role="listitem"
              style={{
                fontSize: 13, color: T.textSec, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <CheckCircle size={13} color={T.petrol} aria-hidden="true" />
              {t}
            </span>
          ))}
        </div>

      </div>
    </section>
  );
};
