import React, { useState, useEffect } from 'react';
import { CheckCircle, ArrowRight, CreditCard, Flame, Tag, Clock, Zap } from 'lucide-react';
import { getSubscriptionCheckoutUrl } from '../services/kiwifyService';
import { LandingService } from '../services/landingService';

import type { User } from '../types';

// ─── Static plan styling (visual/structural — não vem do banco) ───────────────

const PLAN_STYLE = {
  free: {
    id: 'free',
    planCode: 'FREE' as const,
    name: 'Grátis',
    badge: null as string | null,
    accentColor: '#64748B',
    accentLight: '#F8FAFC',
    accentLabelColor: '#475569',
    borderStyle: '1.5px solid #E2E8F0',
    shadow: '0 2px 10px rgba(0,0,0,0.04)',
    shadowHover: '0 8px 24px rgba(100,116,139,0.10)',
    ctaClass: 'ps-cta-free',
    cta: 'Começar grátis',
    featured: false,
  },
  pro: {
    id: 'pro',
    planCode: 'PRO' as const,
    name: 'Pro',
    badge: null as string | null,
    accentColor: '#1E3A5F',
    accentLight: '#EFF6FF',
    accentLabelColor: '#1E3A5F',
    borderStyle: '2px solid #CBD5E1',
    shadow: '0 4px 24px rgba(0,0,0,0.07)',
    shadowHover: '0 12px 40px rgba(30,58,95,0.14)',
    ctaClass: 'ps-cta-pro',
    cta: 'Começar agora',
    featured: false,
  },
  premium: {
    id: 'premium',
    planCode: 'MASTER' as const,
    name: 'Premium',
    badge: '⭐ Mais escolhido' as string | null,
    accentColor: '#7C3AED',
    accentLight: '#F5F3FF',
    accentLabelColor: '#6D28D9',
    borderStyle: '2.5px solid #7C3AED',
    shadow: '0 8px 40px rgba(124,58,237,0.18)',
    shadowHover: '0 20px 60px rgba(124,58,237,0.28)',
    ctaClass: 'ps-cta-premium',
    cta: 'Garantir acesso completo',
    featured: true,
  },
};

// ─── Defaults (fallback quando DB ainda não foi populado) ─────────────────────

const DEFAULTS = {
  planos: {
    title: 'Invista onde o impacto é real.',
    subtitle: 'Chega de levar o planejamento para o domingo.',
    free_tagline: 'Para começar sem custo',
    free_features: ['Até 5 alunos', '60 créditos IA/mês', 'PEI e PAEE básico', 'Exportação PDF'],
    pro_full_price: 79, pro_discount_price: 79, pro_annual_price: 59,
    pro_tagline: 'Para professores e especialistas',
    pro_features: ['Até 30 alunos', 'PEI, PAEE, PDI e relatórios', 'Atividades com BNCC', 'Histórico do aluno', 'Suporte padrão'],
    premium_full_price: 147, premium_discount_price: 147, premium_annual_price: 99,
    premium_tagline: 'Para escolas e clínicas',
    premium_features: ['Alunos ilimitados', 'Tudo do plano Pro', 'Análise de laudos com IA', 'Geração avançada de atividades', 'Relatórios evolutivos completos', 'Prioridade em novos recursos'],
  },
  descontos: {
    pro_coupon: 'INCLUIAI59', pro_coupon_active: true,
    premium_coupon: 'INCLUIAI99', premium_coupon_active: true,
    badge_label: 'Valores promocionais por tempo limitado',
    urgency_label: 'Oferta válida por 48 horas',
  },
  avisos: {
    urgency_badge: 'Valores promocionais por tempo limitado',
    urgency_clock: 'Oferta válida por 48 horas',
    installment_title: 'Parcelamento inteligente que facilita a aprovação',
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
  const [planos,   setPlanos]   = useState(DEFAULTS.planos);
  const [descontos, setDescontos] = useState(DEFAULTS.descontos);
  const [avisos,   setAvisos]   = useState(DEFAULTS.avisos);

  useEffect(() => {
    LandingService.getActive().then(sections => {
      sections.forEach(s => {
        const cj = s.content_json;
        if (s.section_key === 'planos')    setPlanos(prev => ({ ...prev, title: s.title ?? prev.title, subtitle: s.subtitle ?? prev.subtitle, ...cj }));
        if (s.section_key === 'descontos') setDescontos(prev => ({ ...prev, ...cj }));
        if (s.section_key === 'avisos')    setAvisos(prev => ({ ...prev, ...cj }));
      });
    }).catch(() => { /* mantém defaults em caso de erro */ });
  }, []);

  const handlePlanClick = async (planCode: 'PRO' | 'MASTER' | 'FREE') => {
    if (planCode === 'FREE') {
      if (onRegister) onRegister();
      else onLogin();
      return;
    }
    if (!isAuthenticated || !user?.tenant_id) {
      // Planos pagos: redirecionar direto ao checkout sem criar conta antes
      setLoadingPlan(planCode);
      try {
        const url = await getSubscriptionCheckoutUrl(planCode, '', billingCycle);
        if (url && url !== '#') {
          window.location.href = url;
          return;
        }
      } catch { /* fallback para fluxo legado se URL não disponível */ }
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

  const plans = [
    {
      ...PLAN_STYLE.free,
      fullPrice:     0,
      discountPrice: 0,
      annualPrice:   0,
      credits:       60,
      tagline:       (planos as any).free_tagline ?? DEFAULTS.planos.free_tagline,
      features:      Array.isArray((planos as any).free_features) ? (planos as any).free_features : DEFAULTS.planos.free_features,
      coupon:        '',
      couponActive:  false,
    },
    {
      ...PLAN_STYLE.pro,
      fullPrice:     planos.pro_full_price,
      discountPrice: planos.pro_discount_price,
      annualPrice:   (planos as any).pro_annual_price ?? DEFAULTS.planos.pro_annual_price,
      credits:       500,
      tagline:       planos.pro_tagline,
      features:      planos.pro_features,
      coupon:        descontos.pro_coupon,
      couponActive:  descontos.pro_coupon_active,
    },
    {
      ...PLAN_STYLE.premium,
      fullPrice:     planos.premium_full_price,
      discountPrice: planos.premium_discount_price,
      annualPrice:   (planos as any).premium_annual_price ?? DEFAULTS.planos.premium_annual_price,
      credits:       700,
      tagline:       planos.premium_tagline,
      features:      planos.premium_features,
      coupon:        descontos.premium_coupon,
      couponActive:  descontos.premium_coupon_active,
    },
  ];

  const installmentItems: string[] = Array.isArray(avisos.installment_items) ? avisos.installment_items : DEFAULTS.avisos.installment_items;
  const trustItems: string[]       = Array.isArray(avisos.trust_items)       ? avisos.trust_items       : DEFAULTS.avisos.trust_items;

  return (
    <section id="pricing" style={{ background: '#F8FAFC', padding: '96px 0 80px' }}>

      <style>{`
        @keyframes ps-pulse-badge {
          0%, 100% { box-shadow: 0 4px 16px rgba(220,38,38,0.35); }
          50% { box-shadow: 0 4px 28px rgba(220,38,38,0.55); }
        }
        @keyframes ps-pulse-urgency {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.75; }
        }

        .ps-card {
          border-radius: 22px;
          padding: 40px 32px 34px;
          display: flex;
          flex-direction: column;
          transition: transform 0.28s cubic-bezier(.22,1,.36,1), box-shadow 0.28s;
          position: relative;
          background: #FFFFFF;
        }
        .ps-card:hover { transform: translateY(-6px); }

        .ps-cta-free {
          width: 100%; padding: 15px; border-radius: 12px; font-size: 15px;
          font-weight: 700; cursor: pointer; border: 1.5px solid #CBD5E1;
          background: #F8FAFC; color: #475569; font-family: inherit;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: background 0.2s, color 0.2s, transform 0.15s;
        }
        .ps-cta-free:hover { background: #E2E8F0; color: #1E293B; transform: translateY(-1px); }

        .ps-cta-pro {
          width: 100%; padding: 15px; border-radius: 12px; font-size: 15px;
          font-weight: 700; cursor: pointer; border: 2px solid #1E3A5F;
          background: transparent; color: #1E3A5F; font-family: inherit;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: background 0.2s, color 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .ps-cta-pro:hover {
          background: #1E3A5F; color: #FFFFFF;
          transform: translateY(-1px); box-shadow: 0 6px 20px rgba(30,58,95,.28);
        }
        .ps-cta-pro:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }

        .ps-cta-premium {
          width: 100%; padding: 16px; border-radius: 12px; font-size: 16px;
          font-weight: 800; cursor: pointer; border: none; font-family: inherit;
          background: linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%);
          color: white;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: filter 0.2s, transform 0.15s, box-shadow 0.2s;
          box-shadow: 0 6px 24px rgba(124,58,237,0.38);
          letter-spacing: -0.01em;
        }
        .ps-cta-premium:hover {
          filter: brightness(1.08);
          transform: translateY(-2px);
          box-shadow: 0 10px 32px rgba(124,58,237,0.48);
        }
        .ps-cta-premium:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }

        .ps-coupon-box {
          display: flex; align-items: center; gap: 8px;
          background: #F0FDF4; border: 1.5px dashed #16A34A;
          border-radius: 8px; padding: 9px 14px;
          margin-top: 14px;
        }
        .ps-coupon-box-premium {
          background: #FAF5FF; border-color: #7C3AED;
        }

        .ps-urgency {
          display: inline-flex; align-items: center; gap: 7px;
          animation: ps-pulse-urgency 2.4s ease-in-out infinite;
        }

        .ps-old-price {
          font-size: 15px; color: #9CA3AF; text-decoration: line-through;
          font-weight: 500;
        }

        .ps-installment-box {
          background: #FFFBEB; border: 1px solid #FDE68A;
          border-radius: 10px; padding: 12px 16px;
          margin-top: 12px;
        }

        .ps-feature-check { flex-shrink: 0; margin-top: 2px; }

        @media (max-width: 1060px) {
          .ps-cards-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 680px) {
          .ps-cards-grid { grid-template-columns: 1fr !important; max-width: 460px !important; }
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>

        {/* ── Header ── */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>

          {/* Promo Banner */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'linear-gradient(135deg, #DC2626, #EA580C)',
            color: '#fff', fontSize: 13, fontWeight: 700,
            padding: '8px 20px', borderRadius: 100, marginBottom: 20,
            animation: 'ps-pulse-badge 2.2s ease-in-out infinite',
          }}>
            <Flame size={14} />
            {descontos.badge_label}
          </div>

          {/* Urgency */}
          <div style={{ marginBottom: 20 }}>
            <span className="ps-urgency" style={{
              fontSize: 13, fontWeight: 700, color: '#B45309',
              background: '#FFFBEB', border: '1px solid #FDE68A',
              borderRadius: 100, padding: '5px 14px',
            }}>
              <Clock size={13} />
              {avisos.urgency_clock}
            </span>
          </div>

          <div style={{
            display: 'inline-block',
            fontSize: 11, fontWeight: 700, color: '#1E3A5F',
            textTransform: 'uppercase', letterSpacing: '0.12em',
            background: '#EFF6FF', padding: '5px 14px', borderRadius: 100, marginBottom: 18,
          }}>
            Planos & Preços
          </div>

          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800,
            color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1.12,
            marginBottom: 14,
          }}>
            {planos.title}
          </h2>
          <p style={{
            fontSize: 17, color: '#64748B', lineHeight: 1.65,
            maxWidth: 500, margin: '0 auto',
          }}>
            {planos.subtitle}
          </p>
        </div>

        {/* ── Toggle mensal / anual ── */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', background: '#E2E8F0', borderRadius: 100, padding: 3 }}>
            <button
              onClick={() => setBillingCycle('monthly')}
              style={{
                padding: '8px 22px', borderRadius: 100, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                background: billingCycle === 'monthly' ? '#FFFFFF' : 'transparent',
                color: billingCycle === 'monthly' ? '#0F172A' : '#94A3B8',
                boxShadow: billingCycle === 'monthly' ? '0 2px 6px rgba(0,0,0,.10)' : 'none',
                transition: 'all 0.2s',
              }}
            >Mensal</button>
            <button
              onClick={() => setBillingCycle('annual')}
              style={{
                padding: '8px 22px', borderRadius: 100, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                background: billingCycle === 'annual' ? '#FFFFFF' : 'transparent',
                color: billingCycle === 'annual' ? '#0F172A' : '#94A3B8',
                boxShadow: billingCycle === 'annual' ? '0 2px 6px rgba(0,0,0,.10)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              Anual&nbsp;
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: billingCycle === 'annual' ? '#DCFCE7' : '#CBD5E1',
                color: billingCycle === 'annual' ? '#15803D' : '#94A3B8',
                padding: '2px 6px', borderRadius: 5,
              }}>Parcelável</span>
            </button>
          </div>
        </div>

        {/* ── Parcelamento inteligente ── */}
        <div style={{
          maxWidth: 760, margin: '0 auto 52px',
          background: 'linear-gradient(135deg, #1E3A5F 0%, #2D5A8E 100%)',
          borderRadius: 18, padding: '26px 36px',
          textAlign: 'center',
          boxShadow: '0 8px 32px rgba(30,58,95,0.18)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
            <Zap size={18} color="#FBBF24" fill="#FBBF24" />
            <span style={{ fontSize: 16, fontWeight: 800, color: '#FBBF24', letterSpacing: '-0.01em' }}>
              {avisos.installment_title}
            </span>
            <Zap size={18} color="#FBBF24" fill="#FBBF24" />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px 32px' }}>
            {installmentItems.map(item => (
              <span key={item} style={{
                fontSize: 14, color: '#E0F2FE', fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <CheckCircle size={13} color="#4ADE80" />
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* ── Cards ── */}
        <div
          className="ps-cards-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 24,
            maxWidth: 1100,
            margin: '0 auto 64px',
            alignItems: 'start',
          }}
        >
          {plans.map(plan => (
            <div
              key={plan.id}
              className="ps-card"
              style={{ border: plan.borderStyle, boxShadow: plan.shadow }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = plan.shadowHover)}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = plan.shadow)}
            >
              {/* Badge "Mais escolhido" */}
              {plan.badge && (
                <div style={{
                  position: 'absolute', top: -15, left: '50%', transform: 'translateX(-50%)',
                  background: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
                  color: 'white', fontSize: 12, fontWeight: 800,
                  padding: '5px 20px', borderRadius: 100,
                  whiteSpace: 'nowrap', letterSpacing: '0.04em',
                  boxShadow: '0 4px 14px rgba(124,58,237,0.4)',
                }}>
                  {plan.badge}
                </div>
              )}

              {/* Plan label */}
              <div style={{ marginBottom: 22, marginTop: plan.badge ? 10 : 0 }}>
                <div style={{
                  display: 'inline-block',
                  background: plan.accentLight, color: plan.accentLabelColor,
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.10em', padding: '4px 12px', borderRadius: 6,
                  marginBottom: 16,
                }}>
                  {plan.name}
                </div>

                {/* Price anchoring */}
                {plan.id !== 'free' && billingCycle === 'annual' && (
                  <div style={{ marginBottom: 4 }}>
                    <span className="ps-old-price">De R$ {plan.discountPrice}/mês</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 4 }}>
                  {plan.id === 'free' ? (
                    <span style={{ fontSize: 38, fontWeight: 900, color: plan.accentColor, letterSpacing: '-0.04em', lineHeight: 1 }}>Grátis</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 16, fontWeight: 600, color: '#374151', paddingBottom: 8 }}>por R$</span>
                      <span style={{ fontSize: 52, fontWeight: 900, color: plan.accentColor, letterSpacing: '-0.045em', lineHeight: 1 }}>
                        {billingCycle === 'annual' ? (plan as any).annualPrice : plan.fullPrice}
                      </span>
                      <span style={{ fontSize: 14, color: '#94A3B8', paddingBottom: 8 }}>/mês</span>
                    </>
                  )}
                </div>
                {plan.id !== 'free' && billingCycle === 'annual' && (
                  <div style={{ fontSize: 11, color: '#15803D', fontWeight: 600, marginBottom: 4 }}>✓ Plano anual — pagamento único parcelável</div>
                )}
                <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{plan.tagline}</p>
              </div>

              {/* Coupon box */}
              {plan.couponActive && billingCycle === 'annual' && (
                <div className={`ps-coupon-box${plan.featured ? ' ps-coupon-box-premium' : ''}`}>
                  <Tag size={14} color={plan.featured ? '#7C3AED' : '#16A34A'} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>Cupom de desconto: </span>
                    <span style={{
                      fontFamily: 'monospace', fontSize: 14, fontWeight: 800,
                      color: plan.featured ? '#7C3AED' : '#16A34A',
                      letterSpacing: '0.06em',
                    }}>
                      {plan.coupon}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: 'white',
                    background: plan.featured ? '#7C3AED' : '#16A34A',
                    padding: '3px 8px', borderRadius: 6,
                  }}>
                    ATIVO
                  </span>
                </div>
              )}

              {/* Installment info — só no anual */}
              {billingCycle === 'annual' && plan.id !== 'free' && (
                <div className="ps-installment-box">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <CreditCard size={13} color="#92400E" />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#92400E' }}>
                      Parcelamento inteligente
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#78350F', lineHeight: 1.5 }}>
                    {installmentItems[0]} &mdash; {installmentItems[1]}
                  </div>
                </div>
              )}

              {/* Divider */}
              <div style={{ height: 1, background: '#F1F5F9', margin: '22px 0' }} />

              {/* Credits highlight */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: plan.accentLight,
                border: `1.5px solid ${plan.accentColor}22`,
                borderRadius: 10, padding: '10px 14px', marginBottom: 18,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Zap size={15} color={plan.accentColor} fill={plan.accentColor} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Créditos IA/mês</span>
                </div>
                <span style={{
                  fontSize: 22, fontWeight: 900, color: plan.accentColor,
                  letterSpacing: '-0.03em', lineHeight: 1,
                }}>
                  {(plan as any).credits}
                </span>
              </div>

              {/* Features */}
              <ul style={{
                listStyle: 'none', padding: 0, margin: '0 0 28px',
                display: 'flex', flexDirection: 'column', gap: 11, flex: 1,
              }}>
                {(Array.isArray(plan.features) ? plan.features : []).map((f: string) => (
                  <li key={f} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    fontSize: 14, color: '#374151',
                  }}>
                    <CheckCircle size={15} color={plan.accentColor} className="ps-feature-check" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                className={plan.ctaClass}
                onClick={() => handlePlanClick(plan.planCode)}
                disabled={loadingPlan === plan.planCode}
              >
                {loadingPlan === plan.planCode
                  ? 'Aguarde...'
                  : <>{isAuthenticated ? 'Ir para pagamento' : plan.cta} <ArrowRight size={16} /></>
                }
              </button>

              <p style={{
                textAlign: 'center', fontSize: 12, color: '#94A3B8',
                marginTop: 10, display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 5,
              }}>
                <CreditCard size={11} />
                Pagamento seguro via Kiwify
              </p>
              {plan.id !== 'free' && (
                <p style={{ textAlign: 'center', fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                  {billingCycle === 'annual'
                    ? '⚠ Plano anual — carência de 12 meses'
                    : '✓ Cancele quando quiser, sem fidelidade'}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* ── Trust badges ── */}
        <div style={{
          textAlign: 'center', display: 'flex', gap: 28,
          justifyContent: 'center', flexWrap: 'wrap',
        }}>
          {trustItems.map(t => (
            <span key={t} style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>✓ {t}</span>
          ))}
        </div>


      </div>
    </section>
  );
};