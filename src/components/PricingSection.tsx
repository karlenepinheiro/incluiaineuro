import React, { useState } from 'react';
import { CheckCircle, Zap, ArrowRight, CreditCard, Flame } from 'lucide-react';
import { getSubscriptionCheckoutUrl, getCreditsCheckoutUrl } from '../services/kiwifyService';
import type { User } from '../types';

// ─── Plan data ───────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Para dar o primeiro passo',
    color: '#6B7280',
    border: '#E5E7EB',
    bg: '#FFFFFF',
    labelBg: '#F3F4F6',
    labelColor: '#4B5563',
    badge: null,
    monthly: 0,
    annual: 0,
    features: [
      '5 alunos cadastrados',
      '60 créditos IA',
      'Perfil cognitivo básico',
      'Triagem manual',
      'Visualização de documentos',
      'Acesso limitado às ferramentas',
    ],
    cta: 'Testar Grátis',
    ctaPrimary: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Para professores e especialistas',
    color: '#1E3A5F',
    border: '#1E3A5F',
    bg: '#FFFFFF',
    labelBg: '#EFF6FF',
    labelColor: '#1E3A5F',
    badge: '⭐ Mais Escolhido',
    monthly: 67,
    annual: 59,
    features: [
      '30 alunos',
      '500 créditos IA/mês',
      'Triagem com IA',
      'Geração automática de documentos',
      'Estudo de Caso completo',
      'PAEE, PEI e PDI',
      'Análise de laudos com IA',
      'Perfil cognitivo completo',
      'Documentos auditáveis SHA-256',
      'Exportação profissional PDF',
      'Relatórios prontos',
      'Atualizações contínuas',
    ],
    cta: 'Começar Agora',
    ctaPrimary: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    tagline: 'Para escolas e clínicas',
    color: '#7C3AED',
    border: '#7C3AED',
    bg: '#FFFFFF',
    labelBg: '#F5F3FF',
    labelColor: '#6D28D9',
    badge: '🏫 Para Gestores',
    monthly: 147,
    annual: 99,
    features: [
      'Tudo do Pro',
      'Alunos ilimitados',
      '700 créditos IA/mês',
      'Gestão completa de turmas',
      'Multiusuário (equipe)',
      'Relatórios avançados com filtros',
      'Dashboard gerencial com KPIs',
      'Suporte prioritário',
    ],
    cta: 'Assinar Premium',
    ctaPrimary: false,
    ctaPurple: true,
  },
];

const CREDIT_PACKS = [
  { credits: 10,  price: 9.90,  label: '+10 créditos',  tag: null },
  { credits: 30,  price: 19.90, label: '+30 créditos',  tag: 'Melhor custo' },
  { credits: 100, price: 49.90, label: '+100 créditos', tag: 'Mais popular' },
];


interface Props {
  onLogin: () => void;
  onRegister?: () => void;
  /** Chamado quando usuário não autenticado clica em Pro/Premium */
  onUpgradeClick?: (planCode: 'PRO' | 'MASTER') => void;
  /** Usuário autenticado (opcional — vindo do App após login) */
  user?: User | null;
  isAuthenticated?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const PricingSection: React.FC<Props> = ({ onLogin, onRegister, onUpgradeClick, user, isAuthenticated }) => {
  const [annual, setAnnual] = useState(true); // padrão: anual (mais vantajoso)
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const fmt = (v: number) =>
    v === 0 ? 'Grátis' : `R$ ${v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

  /** Abre checkout Kiwify para plano de assinatura */
  const handlePlanClick = async (planCode: 'PRO' | 'MASTER') => {
    if (!isAuthenticated || !user?.tenant_id) {
      // Não logado → salva intenção e manda para cadastro
      if (onUpgradeClick) onUpgradeClick(planCode);
      else onLogin();
      return;
    }
    setLoadingPlan(planCode);
    try {
      const url = await getSubscriptionCheckoutUrl(planCode, user.tenant_id);
      if (url && url !== '#') window.open(url, '_blank');
      else onLogin(); // fallback: sem URL configurada
    } finally {
      setLoadingPlan(null);
    }
  };

  /** Abre checkout Kiwify para pacote de créditos */
  const handleCreditsClick = async (credits: number) => {
    if (!isAuthenticated || !user?.tenant_id) {
      onLogin();
      return;
    }
    setLoadingPlan(`credits_${credits}`);
    try {
      const url = await getCreditsCheckoutUrl(credits, user.tenant_id);
      if (url && url !== '#') window.open(url, '_blank');
      else onLogin();
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <section id="pricing" style={{ background: '#F8FAFC', padding: '100px 0 80px' }}>

      <style>{`
        .ps-card {
          border-radius: 20px;
          padding: 36px 30px 32px;
          display: flex;
          flex-direction: column;
          transition: transform 0.25s cubic-bezier(.22,1,.36,1), box-shadow 0.25s;
        }
        .ps-card:hover { transform: translateY(-5px); }

        .ps-card-pro {
          box-shadow: 0 8px 40px rgba(30,58,95,0.16);
        }
        .ps-card-pro:hover {
          box-shadow: 0 20px 60px rgba(30,58,95,0.22);
        }

        .ps-toggle { display: inline-flex; background: #E2E8F0; border-radius: 100px; padding: 4px; }
        .ps-tbtn {
          padding: 9px 26px; border-radius: 100px; font-size: 14px; font-weight: 600;
          cursor: pointer; border: none; font-family: inherit;
          transition: all 0.2s ease;
        }
        .ps-tbtn-on  { background: #FFFFFF; color: #1E3A5F; box-shadow: 0 2px 8px rgba(0,0,0,.12); }
        .ps-tbtn-off { background: transparent; color: #94A3B8; }

        .ps-cta-primary {
          width: 100%; padding: 13px; border-radius: 10px; font-size: 15px;
          font-weight: 700; cursor: pointer; border: none; font-family: inherit;
          background: #1E3A5F; color: white;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .ps-cta-primary:hover { background: #162D49; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(30,58,95,.3); }

        .ps-cta-outline {
          width: 100%; padding: 13px; border-radius: 10px; font-size: 15px;
          font-weight: 600; cursor: pointer; border: 1.5px solid #CBD5E1;
          background: transparent; color: #374151; font-family: inherit;
          transition: border-color 0.2s, color 0.2s;
        }
        .ps-cta-outline:hover { border-color: #1E3A5F; color: #1E3A5F; }

        .ps-cta-purple {
          width: 100%; padding: 13px; border-radius: 10px; font-size: 15px;
          font-weight: 700; cursor: pointer; border: none; font-family: inherit;
          background: #7C3AED; color: white;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .ps-cta-purple:hover { background: #6D28D9; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(124,58,237,.3); }

        .ps-pack-card {
          background: white; border-radius: 14px; padding: 22px 20px;
          border: 1px solid #E2E8F0;
          transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
        }
        .ps-pack-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,.08); transform: translateY(-2px); border-color: #CBD5E1; }

        @media (max-width: 900px) {
          .ps-grid { grid-template-columns: 1fr !important; max-width: 440px !important; }
          .ps-packs { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 580px) {
          .ps-packs { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 24px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          {/* Promo Banner */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'linear-gradient(135deg, #DC2626, #EA580C)',
            color: '#fff', fontSize: 13, fontWeight: 700,
            padding: '8px 20px', borderRadius: 100, marginBottom: 18,
            boxShadow: '0 4px 16px rgba(220,38,38,0.35)',
            animation: 'pulse 2s infinite',
          }}>
            <Flame size={15} />
            🔥 Valores promocionais por tempo limitado
          </div>
          <br />
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
            Invista onde o impacto é real.
          </h2>
          <p style={{ fontSize: 17, color: '#64748B', lineHeight: 1.65, maxWidth: 500, margin: '0 auto 32px' }}>
            Sem mensalidade cara de software que ninguém usa. Você paga pelo que precisa,
            e a plataforma trabalha por você todos os dias.
          </p>

          {/* Toggle */}
          <div className="ps-toggle">
            <button
              className={`ps-tbtn ${!annual ? 'ps-tbtn-on' : 'ps-tbtn-off'}`}
              onClick={() => setAnnual(false)}
            >
              Mensal
            </button>
            <button
              className={`ps-tbtn ${annual ? 'ps-tbtn-on' : 'ps-tbtn-off'}`}
              onClick={() => setAnnual(true)}
            >
              Anual ⭐&nbsp;
              <span style={{
                fontSize: 11, fontWeight: 700,
                background: annual ? '#DCFCE7' : '#E2E8F0',
                color: annual ? '#15803D' : '#94A3B8',
                padding: '2px 7px', borderRadius: 6, marginLeft: 2,
              }}>
                Economize até 33%
              </span>
            </button>
          </div>

          {annual ? (
            <p style={{ fontSize: 12, color: '#15803D', fontWeight: 600, marginTop: 10 }}>
              ✓ Melhor custo-benefício — plano anual com cobrança mensal recorrente.
            </p>
          ) : (
            <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 10 }}>
              💡 Escolha o plano anual e economize até R$ 576/ano.
            </p>
          )}
        </div>

        {/* Impact phrase */}
        <div style={{
          maxWidth: 780, margin: '0 auto 48px',
          background: 'linear-gradient(135deg, #1E3A5F 0%, #2D5A8E 100%)',
          borderRadius: 18, padding: '28px 36px',
          textAlign: 'center',
          boxShadow: '0 8px 32px rgba(30,58,95,0.18)',
        }}>
          <p style={{
            fontSize: 'clamp(15px, 2.2vw, 19px)', fontWeight: 600,
            color: '#FFFFFF', lineHeight: 1.6, margin: 0,
            letterSpacing: '-0.01em',
          }}>
            "Chega de levar o planejamento para o domingo. O Incluiai escreve seus documentos e ilustra suas atividades em segundos, devolvendo o seu tempo e o brilho nos olhos dos seus alunos."
          </p>
        </div>

        {/* Cards */}
        <div className="ps-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 18,
          maxWidth: 1020,
          margin: '0 auto 64px',
        }}>
          {PLANS.map(plan => {
            const price = annual ? plan.annual : plan.monthly;
            const isPro = plan.id === 'pro';

            return (
              <div
                key={plan.id}
                className={`ps-card ${isPro ? 'ps-card-pro' : ''}`}
                style={{
                  border: isPro ? `2px solid ${plan.border}` : `1px solid ${plan.border}`,
                  background: plan.bg,
                  position: 'relative',
                }}
              >
                {/* Badge */}
                {plan.badge && (
                  <div style={{
                    position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                    background: plan.color, color: 'white',
                    fontSize: 11, fontWeight: 700,
                    padding: '4px 16px', borderRadius: 100,
                    whiteSpace: 'nowrap', letterSpacing: '0.04em',
                  }}>
                    {plan.badge}
                  </div>
                )}

                {/* Name */}
                <div style={{ marginBottom: 24, marginTop: plan.badge ? 8 : 0 }}>
                  <div style={{
                    display: 'inline-block',
                    background: plan.labelBg, color: plan.labelColor,
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.10em', padding: '4px 12px', borderRadius: 6,
                    marginBottom: 14,
                  }}>
                    {plan.name}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 6 }}>
                    {price === 0 ? (
                      <span style={{ fontSize: 40, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.035em' }}>
                        Grátis
                      </span>
                    ) : (
                      <>
                        <span style={{ fontSize: 15, fontWeight: 600, color: '#64748B', paddingBottom: 8 }}>R$</span>
                        <span style={{ fontSize: 46, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.04em', lineHeight: 1 }}>
                          {price}
                        </span>
                        <span style={{ fontSize: 14, color: '#94A3B8', paddingBottom: 7 }}>/mês</span>
                      </>
                    )}
                  </div>

                  {annual && price > 0 && (
                    <p style={{ fontSize: 13, color: '#16A34A', fontWeight: 600 }}>
                      ✓ Economize R${((plan.monthly - plan.annual) * 12).toFixed(0)} no ano
                    </p>
                  )}
                  {!annual && price > 0 && (
                    <p style={{ fontSize: 13, color: '#94A3B8' }}>
                      ou R${plan.annual}/mês no plano anual
                    </p>
                  )}

                  <p style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>{plan.tagline}</p>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: '#F1F5F9', margin: '0 0 20px' }} />

                {/* Features */}
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  {plan.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: '#374151' }}>
                      <CheckCircle size={15} color={plan.color} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {plan.id === 'free' ? (
                  <button onClick={onRegister ?? onLogin} className="ps-cta-outline">
                    Criar conta grátis
                  </button>
                ) : plan.ctaPrimary ? (
                  <button
                    onClick={() => handlePlanClick(plan.id === 'pro' ? 'PRO' : 'MASTER')}
                    disabled={loadingPlan === (plan.id === 'pro' ? 'PRO' : 'MASTER')}
                    className="ps-cta-primary"
                  >
                    {loadingPlan === (plan.id === 'pro' ? 'PRO' : 'MASTER')
                      ? 'Aguarde...'
                      : <>{isAuthenticated ? 'Ir para pagamento' : 'Começar agora'} <ArrowRight size={16} /></>
                    }
                  </button>
                ) : (plan as any).ctaPurple ? (
                  <button
                    onClick={() => handlePlanClick('MASTER')}
                    disabled={loadingPlan === 'MASTER'}
                    className="ps-cta-purple"
                  >
                    {loadingPlan === 'MASTER'
                      ? 'Aguarde...'
                      : <>{isAuthenticated ? 'Ir para pagamento' : 'Assinar Premium'} <ArrowRight size={16} /></>
                    }
                  </button>
                ) : (
                  <button
                    onClick={() => handlePlanClick(plan.id === 'pro' ? 'PRO' : 'MASTER')}
                    className="ps-cta-outline"
                  >
                    Ir para pagamento <ArrowRight size={16} />
                  </button>
                )}

                {plan.id === 'free' && (
                  <p style={{ textAlign: 'center', fontSize: 12, color: '#16A34A', fontWeight: 500, marginTop: 10 }}>
                    ✓ Sem necessidade de cartão de crédito
                  </p>
                )}
                {(plan.id === 'pro' || plan.id === 'premium') && (
                  <p style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <CreditCard size={12} />
                    Pagamento seguro via Kiwify
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Credit Packs */}
        <div style={{
          background: '#FFFFFF', borderRadius: 20,
          border: '1px solid #E2E8F0',
          padding: '40px 36px',
          maxWidth: 1020, margin: '0 auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20, marginBottom: 32 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 36, height: 36, background: '#FEF3C7', borderRadius: 9,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Zap size={17} color="#D97706" />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
                  Pacotes de Créditos de IA
                </h3>
              </div>
              <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.6, maxWidth: 420 }}>
                Sem créditos suficientes? Compre pacotes avulsos a qualquer momento.
                Créditos são usados para gerar documentos, análises e atividades adaptadas com IA.
              </p>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#F0FDF4', border: '1px solid #BBF7D0',
              padding: '10px 16px', borderRadius: 10,
            }}>
              <Zap size={14} color="#16A34A" />
              <span style={{ fontSize: 13, color: '#15803D', fontWeight: 500 }}>
                Créditos adicionais ao plano — disponíveis imediatamente
              </span>
            </div>
          </div>

          <div className="ps-packs" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {CREDIT_PACKS.map(pack => (
              <div key={pack.credits} className="ps-pack-card">
                {pack.tag && (
                  <div style={{
                    display: 'inline-block', fontSize: 10, fontWeight: 700,
                    background: '#FEF3C7', color: '#92400E',
                    padding: '3px 10px', borderRadius: 6, marginBottom: 12,
                    letterSpacing: '0.04em',
                  }}>
                    {pack.tag.toUpperCase()}
                  </div>
                )}
                {!pack.tag && <div style={{ height: 22, marginBottom: 12 }} />}

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em' }}>
                    {pack.label}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#D97706', marginTop: 2 }}>
                    R$ {pack.price.toFixed(2).replace('.', ',')}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                    Créditos adicionais ao plano
                  </div>
                </div>

                <button
                  onClick={() => handleCreditsClick(pack.credits)}
                  disabled={loadingPlan === `credits_${pack.credits}`}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 8,
                    fontSize: 13, fontWeight: 600,
                    cursor: loadingPlan === `credits_${pack.credits}` ? 'wait' : 'pointer',
                    background: '#FFFBEB', color: '#92400E',
                    border: '1.5px solid #FDE68A', fontFamily: 'inherit',
                    transition: 'background 0.15s, border-color 0.15s',
                    opacity: loadingPlan === `credits_${pack.credits}` ? 0.6 : 1,
                  }}
                  onMouseEnter={e => {
                    (e.target as HTMLElement).style.background = '#FEF3C7';
                    (e.target as HTMLElement).style.borderColor = '#FCD34D';
                  }}
                  onMouseLeave={e => {
                    (e.target as HTMLElement).style.background = '#FFFBEB';
                    (e.target as HTMLElement).style.borderColor = '#FDE68A';
                  }}
                >
                  {loadingPlan === `credits_${pack.credits}` ? 'Aguarde...' : 'Comprar créditos'}
                </button>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 20, textAlign: 'center' }}>
            Créditos expiram em 60 dias após a compra. Disponíveis imediatamente após a confirmação do pagamento.
          </p>
        </div>

        {/* FAQ Créditos */}
        <div style={{ maxWidth: 1020, margin: '48px auto 0' }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 20, textAlign: 'center' }}>
            Entendendo os créditos de IA
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {[
              {
                q: 'Como os créditos são consumidos?',
                a: 'O Incluiai tem dois motores de IA: o Motor de Texto (Gemini Flash) para PDIs, PEIs, relatórios e análises — custa 3 créditos por documento. O Motor de Imagem (IncluiLab) para ilustrações pedagógicas de alto impacto — custa 50 créditos por imagem. Atividades simples custam 1 crédito.',
              },
              {
                q: 'Quando os créditos expiram?',
                a: 'Os créditos da assinatura são renovados todo mês com o pagamento recorrente. Os créditos comprados em pacotes avulsos expiram em 60 dias a partir da data da compra.',
              },
              {
                q: 'O que acontece se eu ficar sem créditos?',
                a: 'Você continua acessando o sistema normalmente. Só não consegue usar as funções de geração com IA (documentos, atividades, análises). Você pode comprar um pacote avulso a qualquer momento, sem precisar trocar de plano.',
              },
              {
                q: 'Créditos acumulam mês a mês?',
                a: 'Os créditos mensais da assinatura não acumulam — são renovados do zero a cada ciclo para manter o sistema justo. Créditos comprados em pacotes avulsos são acumuláveis e valem por 60 dias.',
              },
            ].map(({ q, a }) => (
              <div key={q} style={{
                background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14,
                padding: '22px 22px',
              }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>{q}</p>
                <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.65 }}>{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom trust line */}
        <div style={{ textAlign: 'center', marginTop: 48, display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            '✓ Cancele quando quiser',
            '✓ Sem taxa de instalação',
            '✓ LGPD conforme',
            '✓ Suporte incluído',
          ].map(t => (
            <span key={t} style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>{t}</span>
          ))}
        </div>

      </div>
    </section>
  );
};
