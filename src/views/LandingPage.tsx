import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck, FileText, ArrowRight,
  Lock, Phone,
  Zap, Star, ChevronDown, ChevronUp,
  Clock, Users,
} from 'lucide-react';
import { SiteConfig } from '../types';
import { AdminService } from '../services/adminService';
import { LandingService } from '../services/landingService';
import { PricingSection } from '../components/PricingSection';
import Hero from '../components/Hero';
import { BrandLogo } from '../components/BrandLogo';
import { BeforeAfterSlider } from '../components/BeforeAfterSlider';

interface Props {
  onLogin: () => void;
  onRegister: () => void;
  onAudit: () => void;
  onUpgradeClick?: (planCode: 'PRO' | 'MASTER') => void;
}

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.06 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

const P = {
  bg:         '#F8FAFC',
  surface:    '#FFFFFF',
  blue:       '#2563EB',
  blueDark:   '#1D4ED8',
  blueLight:  '#EFF6FF',
  gold:       '#F59E0B',
  goldLight:  '#FFFBEB',
  green:      '#22C55E',
  greenDark:  '#16A34A',
  greenLight: '#F0FDF4',
  ink:        '#0F172A',
  slate:      '#1E293B',
  muted:      '#64748B',
  border:     '#E2E8F0',
  red:        '#EF4444',
};

// ─── Activity PDF mockup ──────────────────────────────────────────────────────
const ActivityMockup: React.FC = () => (
  <svg viewBox="0 0 460 580" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto', display: 'block' }}>
    <defs>
      <filter id="am-shadow">
        <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor="#0F172A" floodOpacity="0.13"/>
      </filter>
    </defs>
    {/* Paper */}
    <rect x="10" y="6" width="440" height="568" rx="14" fill="white" filter="url(#am-shadow)"/>
    {/* Header bar */}
    <rect x="10" y="6" width="440" height="52" rx="14" fill="#1F4E5F"/>
    <rect x="10" y="32" width="440" height="26" fill="#1F4E5F"/>
    <text x="30" y="39" fill="white" fontSize="14" fontWeight="700" fontFamily="system-ui">IncluiAI</text>
    <text x="432" y="39" fill="rgba(255,255,255,0.55)" fontSize="10" fontFamily="system-ui" textAnchor="end">Atividade Adaptada · PDF</text>
    {/* Student chip */}
    <rect x="30" y="72" width="380" height="40" rx="9" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="1"/>
    <text x="46" y="88" fill="#94A3B8" fontSize="9" fontWeight="700" fontFamily="system-ui" letterSpacing="0.08em">ALUNO</text>
    <text x="46" y="103" fill="#0F172A" fontSize="13" fontWeight="600" fontFamily="system-ui">Lucas M. · 3º ano · TEA nível 1</text>
    {/* Title */}
    <text x="30" y="136" fill="#0F172A" fontSize="16" fontWeight="800" fontFamily="system-ui">Sequência Numérica com Pictogramas</text>
    <text x="30" y="153" fill="#64748B" fontSize="11" fontFamily="system-ui">Objetivo: Identificar sequências 1–10 · BNCC EF01MA01</text>
    <line x1="30" y1="166" x2="430" y2="166" stroke="#E2E8F0" strokeWidth="1"/>
    {/* Exercise 1 */}
    <rect x="30" y="178" width="14" height="14" rx="3" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5"/>
    <text x="52" y="190" fill="#1E293B" fontSize="12" fontFamily="system-ui">1. Complete a sequência:  1,  2,  ___,  4,  ___</text>
    {/* Number row */}
    {[1,2,3,4,5].map((n, i) => (
      <g key={n}>
        <rect x={30 + i * 78} y={208} width="64" height="52" rx="10"
          fill={i % 2 === 0 ? '#EFF6FF' : '#F0FDF4'}
          stroke={i % 2 === 0 ? '#BFDBFE' : '#BBF7D0'}
          strokeWidth="1.5"/>
        <text x={30 + i * 78 + 32} y={241} textAnchor="middle"
          fill={i % 2 === 0 ? '#2563EB' : '#16A34A'}
          fontSize="22" fontWeight="800" fontFamily="system-ui">{n}</text>
      </g>
    ))}
    {/* Exercise 2 */}
    <rect x="30" y="276" width="14" height="14" rx="3" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5"/>
    <text x="52" y="288" fill="#1E293B" fontSize="12" fontFamily="system-ui">2. Pinte os números pares de azul</text>
    {/* Color swatches */}
    {[2,4,6,8].map((n, i) => (
      <g key={n}>
        <rect x={30 + i * 90} y={300} width="72" height="44" rx="9" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="1.5"/>
        <text x={30 + i * 90 + 36} y={328} textAnchor="middle" fill="#2563EB" fontSize="20" fontWeight="800" fontFamily="system-ui">{n}</text>
      </g>
    ))}
    {/* Exercise 3 */}
    <rect x="30" y="358" width="14" height="14" rx="3" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5"/>
    <text x="52" y="370" fill="#1E293B" fontSize="12" fontFamily="system-ui">3. Escreva o número que vem depois:</text>
    <rect x="30" y="380" width="380" height="32" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="1"/>
    <text x="46" y="401" fill="#94A3B8" fontSize="12" fontFamily="system-ui">3 → ___   ·   7 → ___   ·   9 → ___</text>
    {/* Guidance */}
    <rect x="30" y="428" width="380" height="60" rx="10" fill="#FFFBEB" stroke="#FDE68A" strokeWidth="1.5"/>
    <text x="46" y="446" fill="#92400E" fontSize="9" fontWeight="700" fontFamily="system-ui" letterSpacing="0.08em">ORIENTAÇÕES PEDAGÓGICAS</text>
    <text x="46" y="462" fill="#78350F" fontSize="11" fontFamily="system-ui">• Use cartões visuais de apoio para facilitar a compreensão</text>
    <text x="46" y="479" fill="#78350F" fontSize="11" fontFamily="system-ui">• Permita pausas entre exercícios conforme necessário</text>
    {/* Footer */}
    <line x1="30" y1="500" x2="430" y2="500" stroke="#E2E8F0" strokeWidth="1"/>
    {/* Download button */}
    <rect x="280" y="514" width="150" height="38" rx="10" fill="#2563EB"/>
    <text x="355" y="537" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="system-ui">⬇  Baixar PDF</text>
    {/* SHA badge */}
    <rect x="30" y="516" width="188" height="34" rx="8" fill="#F0FDF4" stroke="#BBF7D0" strokeWidth="1"/>
    <text x="46" y="531" fill="#16A34A" fontSize="10" fontWeight="700" fontFamily="system-ui">✓ Assinado digitalmente</text>
    <text x="46" y="544" fill="#94A3B8" fontSize="9" fontFamily="system-ui">SHA-256 · LGPD conforme</text>
  </svg>
);

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes lp-rise {
    from { opacity:0; transform:translateY(22px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes lp-float {
    0%, 100% { transform:translateY(0px); }
    50%       { transform:translateY(-10px); }
  }
  @keyframes lp-pulse-cta {
    0%, 100% { box-shadow: 0 8px 32px rgba(34,197,94,0.35); }
    50%       { box-shadow: 0 8px 48px rgba(34,197,94,0.55); }
  }

  .reveal {
    opacity:0; transform:translateY(20px);
    transition: opacity 0.75s cubic-bezier(0.22,1,0.36,1),
                transform 0.75s cubic-bezier(0.22,1,0.36,1);
  }
  .reveal.on { opacity:1; transform:translateY(0); }
  .rd1 { transition-delay:0.05s; } .rd2 { transition-delay:0.14s; }
  .rd3 { transition-delay:0.23s; } .rd4 { transition-delay:0.32s; }

  .btn-cta {
    background: #22C55E; color: white; border: none; cursor: pointer;
    font-weight: 800; font-family: inherit; font-size: 17px;
    padding: 18px 42px; border-radius: 14px;
    display: inline-flex; align-items: center; gap: 10px;
    animation: lp-pulse-cta 2.6s ease-in-out infinite;
    transition: background 0.2s, transform 0.15s;
    letter-spacing: -0.01em; white-space: nowrap;
  }
  .btn-cta:hover { background: #16A34A; transform: translateY(-3px); }
  .btn-cta:active { transform: translateY(0); }

  .btn-cta-sm {
    background: #22C55E; color: white; border: none; cursor: pointer;
    font-weight: 700; font-family: inherit; font-size: 15px;
    padding: 14px 32px; border-radius: 12px;
    display: inline-flex; align-items: center; gap: 8px;
    transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
    box-shadow: 0 6px 24px rgba(34,197,94,0.32);
  }
  .btn-cta-sm:hover { background: #16A34A; transform: translateY(-2px); }

  .btn-ghost-white {
    background: transparent; border: 2px solid rgba(255,255,255,0.35);
    color: rgba(255,255,255,0.9); cursor: pointer; font-weight: 700;
    font-family: inherit; font-size: 16px;
    padding: 18px 34px; border-radius: 14px;
    transition: border-color 0.2s, color 0.2s, background 0.2s;
  }
  .btn-ghost-white:hover {
    border-color: white; color: white;
    background: rgba(255,255,255,0.08);
  }

  .btn-outline-blue {
    background: transparent; cursor: pointer; font-weight: 700; font-family: inherit;
    border: 2px solid #2563EB; color: #2563EB; font-size: 13px;
    padding: 8px 18px; border-radius: 8px;
    transition: background 0.2s, color 0.2s;
  }
  .btn-outline-blue:hover { background: #2563EB; color: white; }

  .btn-blue-nav {
    background: #2563EB; color: white; border: none; cursor: pointer;
    font-weight: 700; font-family: inherit; font-size: 13px;
    padding: 9px 20px; border-radius: 8px;
    transition: background 0.2s, transform 0.15s;
  }
  .btn-blue-nav:hover { background: #1D4ED8; transform: translateY(-1px); }

  .nav-link-lp {
    font-size: 14px; font-weight: 500; color: #64748B; text-decoration: none;
    transition: color 0.15s; background: none; border: none; cursor: pointer;
    font-family: inherit; display: flex; align-items: center; gap: 5px;
  }
  .nav-link-lp:hover { color: #2563EB; }

  .step-card {
    background: white; border-radius: 20px; padding: 36px 28px;
    border: 1.5px solid #E2E8F0;
    transition: transform 0.25s cubic-bezier(.22,1,.36,1), box-shadow 0.25s;
  }
  .step-card:hover { transform: translateY(-5px); box-shadow: 0 20px 56px rgba(37,99,235,0.11); border-color: #BFDBFE; }

  .diff-card {
    background: white; border-radius: 18px; padding: 30px 26px;
    border: 1.5px solid #E2E8F0;
    transition: transform 0.22s, box-shadow 0.22s;
  }
  .diff-card:hover { transform: translateY(-4px); box-shadow: 0 14px 44px rgba(0,0,0,0.08); }

  .testimonial-card {
    background: #F8FAFC; border: 1.5px solid #E2E8F0;
    border-radius: 16px; padding: 28px 24px;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .testimonial-card:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(0,0,0,0.07); }

  .mockup-float { animation: lp-float 5s ease-in-out infinite; }

  /* ── Responsive ── */
  @media (max-width: 960px) {
    .lp-nav { display: none !important; }
    .two-col { grid-template-columns: 1fr !important; gap: 48px !important; }
    .ba-grid { grid-template-columns: 1fr !important; }
    .three-col { grid-template-columns: 1fr 1fr !important; }
    .two-col-diffs { grid-template-columns: 1fr !important; }
    .three-col-proof { grid-template-columns: 1fr 1fr !important; }
  }
  @media (max-width: 640px) {
    .three-col { grid-template-columns: 1fr !important; }
    .three-col-proof { grid-template-columns: 1fr !important; }
    .cta-btns { flex-direction: column !important; align-items: stretch !important; }
    .cta-btns button, .cta-btns a { width: 100% !important; justify-content: center !important; }
  }
`;

// ─── FAQ defaults ─────────────────────────────────────────────────────────────
const FAQ_DEFAULTS = [
  { q: 'Para quem é o IncluiAI?', a: 'Para professores de AEE, psicopedagogos, fonoaudiólogos e demais profissionais de educação inclusiva que precisam de documentos rápidos, padronizados e auditáveis.' },
  { q: 'Os dados dos alunos são seguros?', a: 'Sim. Armazenamos em conformidade com a LGPD, com criptografia e auditoria SHA-256 em cada documento gerado.' },
  { q: 'Posso cancelar a qualquer momento?', a: 'No plano mensal, sim — sem multas ou taxas de cancelamento. O plano anual tem carência de 12 meses.' },
  { q: 'Qual a diferença entre os planos?', a: 'O FREE permite até 5 alunos. O PRO (R$ 59/mês no anual) expande para 30 alunos. O PREMIUM (R$ 99/mês no anual) é para escolas e clínicas — alunos ilimitados, fichas avançadas, análise de laudo com IA e relatórios para INSS.' },
];

// ─── Component ───────────────────────────────────────────────────────────────
export const LandingPage: React.FC<Props> = ({ onLogin, onRegister: _onRegister, onAudit, onUpgradeClick }) => {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [faqTitle, setFaqTitle] = useState('Perguntas frequentes');
  const [faqItems, setFaqItems] = useState(FAQ_DEFAULTS);
  const [faqOpen, setFaqOpen]   = useState<number | null>(null);

  useEffect(() => {
    AdminService.getSiteConfig().then(setConfig);
    LandingService.getActive().then(sections => {
      sections.forEach(s => {
        if (s.section_key === 'faq') {
          if (s.title) setFaqTitle(s.title);
          if (Array.isArray(s.content_json.items)) setFaqItems(s.content_json.items);
        }
      });
    }).catch(() => {});
  }, []);

  const beforeAfter = useReveal<HTMLDivElement>();
  const prova       = useReveal<HTMLDivElement>();
  const steps       = useReveal<HTMLDivElement>();
  const diffs       = useReveal<HTMLDivElement>();
  const proof       = useReveal<HTMLDivElement>();
  const cta         = useReveal<HTMLDivElement>();

  return (
    <div style={{ fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif", background: P.surface, color: P.ink, minHeight: '100vh' }}>
      <style>{CSS}</style>

      {/* ══════════════════════ NAVBAR ══════════════════════ */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: 'rgba(255,255,255,0.97)',
        borderBottom: `1px solid ${P.border}`,
        backdropFilter: 'blur(16px)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BrandLogo fontSize={17} iconSize={17} theme="light" />
          <nav className="lp-nav" style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
            <a href="#como-funciona" onClick={e => { e.preventDefault(); document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' }); }} className="nav-link-lp">Como funciona</a>
            <a href="#diferenciais"  onClick={e => { e.preventDefault(); document.getElementById('diferenciais')?.scrollIntoView({ behavior: 'smooth' }); }} className="nav-link-lp">Por que IncluiAI</a>
            <a href="#pricing"       onClick={e => { e.preventDefault(); document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }); }} className="nav-link-lp">Planos</a>
            <button onClick={onAudit} className="nav-link-lp"><ShieldCheck size={14} /> Validar Doc</button>
          </nav>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onLogin} className="btn-outline-blue">Entrar</button>
            <button onClick={_onRegister} className="btn-blue-nav">Começar Grátis</button>
          </div>
        </div>
      </header>

      <main>

        {/* ══════════════════════ HERO ══════════════════════ */}
        <Hero onRegister={_onRegister} />

        {/* ══════════════════════ ANTES x DEPOIS ══════════════════════ */}
        <section style={{ background: P.bg, padding: '96px 0' }}>
          <div ref={beforeAfter.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${beforeAfter.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 56 }}>
              <span style={{
                display: 'inline-block', fontSize: 11, fontWeight: 700, color: P.blue,
                textTransform: 'uppercase', letterSpacing: '0.12em',
                background: P.blueLight, padding: '5px 16px', borderRadius: 100, marginBottom: 18,
              }}>Antes vs Depois</span>
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, color: P.ink, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 14 }}>
                A diferença é real.
              </h2>
              <p style={{ fontSize: 17, color: P.muted, maxWidth: 480, margin: '0 auto' }}>
                Veja o que muda quando você para de lutar contra a burocracia.
              </p>
            </div>

            {/* Widget interativo Antes / Depois */}
            <div className={`reveal rd1 ${beforeAfter.visible ? 'on' : ''}`}>
              <BeforeAfterSlider imageSrc="/images/antes-depois-incluiai.jpg" />
            </div>

            {/* Mini CTA */}
            <div className={`reveal rd3 ${beforeAfter.visible ? 'on' : ''}`} style={{
              marginTop: 28, background: P.surface, border: `1.5px solid ${P.border}`,
              borderRadius: 16, padding: '24px 32px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 20,
            }}>
              <div>
                <p style={{ fontSize: 17, fontWeight: 800, color: P.slate, marginBottom: 3 }}>Chega de perder tempo.</p>
                <p style={{ fontSize: 14, color: P.muted }}>Comece hoje, grátis. Veja a diferença em minutos.</p>
              </div>
              <button onClick={_onRegister} className="btn-cta-sm">
                Começar agora <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>

        {/* ══════════════════════ PROVA VISUAL ══════════════════════ */}
        <section style={{ background: P.surface, padding: '96px 0', overflow: 'hidden' }}>
          <div ref={prova.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>
            <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'center' }}>

              {/* Copy */}
              <div className={`reveal ${prova.visible ? 'on' : ''}`}>
                <span style={{
                  display: 'inline-block', fontSize: 11, fontWeight: 700, color: P.blue,
                  textTransform: 'uppercase', letterSpacing: '0.12em',
                  background: P.blueLight, padding: '5px 16px', borderRadius: 100, marginBottom: 24,
                }}>Veja como fica na prática</span>

                <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 44px)', fontWeight: 800, color: P.ink, letterSpacing: '-0.03em', lineHeight: 1.13, marginBottom: 20 }}>
                  Atividade pronta,<br />com qualidade<br />profissional.
                </h2>
                <p style={{ fontSize: 16, color: P.muted, lineHeight: 1.78, marginBottom: 32 }}>
                  Cada atividade é gerada com objetivos pedagógicos, referência BNCC, orientações para o professor e pronta para imprimir — tudo em um PDF profissional.
                </p>

                {[
                  { icon: '🎯', title: 'Personalizado por diagnóstico', desc: 'TEA, TDAH, Dislexia, DI — cada atividade respeita o perfil real do aluno.' },
                  { icon: '📄', title: 'PDF pronto para imprimir', desc: 'Baixe e imprima na hora. Sem formatação, sem retrabalho.' },
                  { icon: '📋', title: 'Aceito em relatórios INSS', desc: 'Estrutura técnica compatível com documentação oficial.' },
                ].map(item => (
                  <div key={item.title} style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
                    <div style={{
                      width: 42, height: 42, background: P.greenLight, border: '1.5px solid #BBF7D0',
                      borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, fontSize: 20,
                    }}>
                      {item.icon}
                    </div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, color: P.ink, marginBottom: 3 }}>{item.title}</p>
                      <p style={{ fontSize: 14, color: P.muted, lineHeight: 1.62 }}>{item.desc}</p>
                    </div>
                  </div>
                ))}

                <button onClick={_onRegister} className="btn-cta" style={{ marginTop: 12, fontSize: 15, padding: '16px 36px' }}>
                  Gerar minha primeira atividade <ArrowRight size={16} />
                </button>
              </div>

              {/* Mockup */}
              <div className={`reveal rd2 ${prova.visible ? 'on' : ''} mockup-float`}>
                <div style={{
                  borderRadius: 22, overflow: 'hidden',
                  boxShadow: '0 40px 100px rgba(15,23,42,0.15)',
                  border: `1px solid ${P.border}`,
                }}>
                  <ActivityMockup />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════ COMO FUNCIONA ══════════════════════ */}
        <section id="como-funciona" style={{ background: P.bg, padding: '96px 0' }}>
          <div ref={steps.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${steps.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 64 }}>
              <span style={{
                display: 'inline-block', fontSize: 11, fontWeight: 700, color: P.blue,
                textTransform: 'uppercase', letterSpacing: '0.12em',
                background: P.blueLight, padding: '5px 16px', borderRadius: 100, marginBottom: 18,
              }}>Como funciona</span>
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, color: P.ink, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 14 }}>
                3 passos. Pronto.<br />Sem complicação.
              </h2>
              <p style={{ fontSize: 17, color: P.muted, maxWidth: 460, margin: '0 auto' }}>
                Sem treinamento, sem configuração. Você entra e já começa a gerar.
              </p>
            </div>

            <div className="three-col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
              {[
                {
                  emoji: '📝', num: '01', color: P.blue, bg: P.blueLight, border: '#BFDBFE',
                  title: 'Descreva a atividade',
                  desc: 'Informe o aluno, o objetivo e o tipo de atividade. Leva menos de 30 segundos — sem formulários complexos.',
                  delay: 'rd1',
                },
                {
                  emoji: '⚡', num: '02', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE',
                  title: 'A IA gera automaticamente',
                  desc: 'Nossa IA cria a atividade adaptada com orientações pedagógicas, picto­gramas e referência BNCC inclusa.',
                  delay: 'rd2',
                },
                {
                  emoji: '📄', num: '03', color: P.greenDark, bg: P.greenLight, border: '#BBF7D0',
                  title: 'Baixe o PDF pronto',
                  desc: 'Um clique. PDF profissional, assinado digitalmente, pronto para imprimir ou enviar para os pais.',
                  delay: 'rd3',
                },
              ].map(s => (
                <div key={s.num} className={`step-card reveal ${s.delay} ${steps.visible ? 'on' : ''}`}>
                  <div style={{
                    width: 60, height: 60, background: s.bg, border: `2px solid ${s.border}`,
                    borderRadius: 18, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 28, marginBottom: 22,
                  }}>
                    {s.emoji}
                  </div>
                  <div style={{
                    display: 'inline-block', background: s.bg, color: s.color,
                    fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                    letterSpacing: '0.10em', padding: '3px 10px', borderRadius: 6, marginBottom: 14,
                  }}>
                    Passo {s.num}
                  </div>
                  <h3 style={{ fontSize: 19, fontWeight: 800, color: P.ink, marginBottom: 12, lineHeight: 1.28 }}>{s.title}</h3>
                  <p style={{ fontSize: 14, color: P.muted, lineHeight: 1.75 }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════ DIFERENCIAIS ══════════════════════ */}
        <section id="diferenciais" style={{ background: P.surface, padding: '96px 0' }}>
          <div ref={diffs.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${diffs.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 56 }}>
              <span style={{
                display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#7C3AED',
                textTransform: 'uppercase', letterSpacing: '0.12em',
                background: '#F5F3FF', padding: '5px 16px', borderRadius: 100, marginBottom: 18,
              }}>Por que IncluiAI</span>
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, color: P.ink, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 14 }}>
                Pensado para quem faz AEE.
              </h2>
              <p style={{ fontSize: 17, color: P.muted, maxWidth: 460, margin: '0 auto' }}>
                Não é IA genérica. É específico para educação inclusiva.
              </p>
            </div>

            <div className="two-col-diffs" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
              {[
                {
                  emoji: '🎯', color: P.blue, bg: P.blueLight, border: '#BFDBFE',
                  title: 'Pensado para AEE',
                  desc: 'Cada função foi criada pensando nas necessidades reais do professor de educação especial — não em IA genérica de uso geral.',
                  delay: 'rd1',
                },
                {
                  emoji: '👦', color: P.greenDark, bg: P.greenLight, border: '#BBF7D0',
                  title: 'Adaptado para alunos reais',
                  desc: 'TEA, TDAH, Dislexia, DI, TOD — cada atividade e documento respeita o diagnóstico e o perfil cognitivo do aluno.',
                  delay: 'rd2',
                },
                {
                  emoji: '📋', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE',
                  title: 'Gera relatórios profissionais',
                  desc: 'PEI, PAEE, PDI, Estudo de Caso e relatórios para INSS — com padrão técnico, SHA-256 e assinatura digital.',
                  delay: 'rd3',
                },
                {
                  emoji: '⏰', color: '#B45309', bg: P.goldLight, border: '#FDE68A',
                  title: 'Economiza horas toda semana',
                  desc: 'Professoras relatam economizar 4 a 8 horas por semana — tempo que volta para os alunos e para a sua vida.',
                  delay: 'rd4',
                },
              ].map(item => (
                <div key={item.title} className={`diff-card reveal ${item.delay} ${diffs.visible ? 'on' : ''}`}>
                  <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 56, height: 56, background: item.bg,
                      border: `2px solid ${item.border}`, borderRadius: 16,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 26, flexShrink: 0,
                    }}>
                      {item.emoji}
                    </div>
                    <div>
                      <h3 style={{ fontSize: 17, fontWeight: 800, color: P.ink, marginBottom: 8, lineHeight: 1.3 }}>{item.title}</h3>
                      <p style={{ fontSize: 14, color: P.muted, lineHeight: 1.72 }}>{item.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Stats strip */}
            <div className={`reveal rd4 ${diffs.visible ? 'on' : ''}`} style={{
              marginTop: 48, background: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)',
              borderRadius: 20, padding: '36px 40px',
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, textAlign: 'center',
            }}>
              {[
                { val: '+1.800', label: 'Professores ativos', icon: Users },
                { val: '+12.000', label: 'Documentos gerados', icon: FileText },
                { val: '< 5 min', label: 'Para gerar um PEI', icon: Clock },
                { val: '100%', label: 'LGPD conforme', icon: ShieldCheck },
              ].map(stat => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label}>
                    <Icon size={22} color="rgba(255,255,255,0.55)" style={{ margin: '0 auto 8px', display: 'block' }} />
                    <div style={{ fontSize: 28, fontWeight: 900, color: 'white', letterSpacing: '-0.04em', lineHeight: 1 }}>{stat.val}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 6, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══════════════════════ PLANOS ══════════════════════ */}
        <PricingSection onLogin={onLogin} onRegister={_onRegister} onUpgradeClick={onUpgradeClick} />

        {/* ══════════════════════ PROVA SOCIAL ══════════════════════ */}
        <section style={{ background: P.surface, padding: '80px 0' }}>
          <div ref={proof.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${proof.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 48 }}>
              <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 40px)', fontWeight: 800, color: P.ink, letterSpacing: '-0.03em', marginBottom: 10 }}>
                Quem já usa, não volta atrás.
              </h2>
              <p style={{ fontSize: 16, color: P.muted }}>Mais de 1.800 professores de todo o Brasil usando no dia a dia.</p>
            </div>

            <div className="three-col-proof" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              {[
                {
                  text: '"Antes eu passava o domingo inteiro fazendo PEI. Agora faço em 5 minutos durante a semana. Minha vida mudou de verdade."',
                  name: 'Ana Paula S.', role: 'Professora de AEE · São Paulo', delay: 'rd1',
                },
                {
                  text: '"A escola inteira padronizou os documentos. Não tem mais aquela bagunça de cada um fazendo do seu jeito. O PREMIUM valeu cada centavo."',
                  name: 'Mariana T.', role: 'Coordenadora Inclusiva · Belo Horizonte', delay: 'rd2',
                },
                {
                  text: '"Finalmente tenho histórico real dos meus alunos. Quando chega novo professor, ele não começa do zero — começa de onde eu parei."',
                  name: 'Ricardo L.', role: 'Psicopedagogo · Curitiba', delay: 'rd3',
                },
              ].map(t => (
                <div key={t.name} className={`testimonial-card reveal ${t.delay} ${proof.visible ? 'on' : ''}`}>
                  <div style={{ display: 'flex', gap: 2, marginBottom: 14 }}>
                    {[1,2,3,4,5].map(i => <Star key={i} size={14} color={P.gold} fill={P.gold} />)}
                  </div>
                  <p style={{ fontSize: 14, color: P.slate, lineHeight: 1.75, marginBottom: 18, fontStyle: 'italic' }}>{t.text}</p>
                  <div style={{ fontSize: 14, fontWeight: 700, color: P.ink }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: P.muted, marginTop: 2 }}>{t.role}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════ CTA FINAL ══════════════════════ */}
        <section style={{
          background: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)',
          padding: '120px 0', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -80, right: -80, width: 360, height: 360, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -60, left: -60, width: 280, height: 280, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />

          <div ref={cta.ref} style={{ maxWidth: 760, margin: '0 auto', padding: '0 28px', textAlign: 'center' }}>
            <div className={`reveal ${cta.visible ? 'on' : ''}`}>

              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                padding: '7px 20px', borderRadius: 100, marginBottom: 28,
              }}>
                <Zap size={13} color={P.gold} fill={P.gold} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                  Comece grátis — sem cartão de crédito
                </span>
              </div>

              <h2 style={{ fontSize: 'clamp(30px, 5vw, 56px)', fontWeight: 900, color: 'white', letterSpacing: '-0.04em', lineHeight: 1.07, marginBottom: 18 }}>
                Comece agora e economize<br />
                <span style={{ color: P.gold }}>horas do seu tempo.</span>
              </h2>

              <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.72)', lineHeight: 1.72, maxWidth: 480, margin: '0 auto 52px' }}>
                Mais de 1.800 professores já pararam de perder tempo com papelório. Agora é a sua vez.
              </p>

              <div className="cta-btns" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
                <button onClick={_onRegister} className="btn-cta">
                  COMEÇAR AGORA <ArrowRight size={18} />
                </button>
                <button
                  onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                  className="btn-ghost-white"
                >
                  Ver planos e preços
                </button>
              </div>

              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>
                Grátis para sempre no plano básico · Sem cartão · Sem pegadinha
              </p>
            </div>
          </div>
        </section>

        {/* ══════════════════════ FAQ ══════════════════════ */}
        {faqItems.length > 0 && (
          <section style={{ background: P.bg, padding: '88px 0 80px' }}>
            <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 28px' }}>
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 38px)', fontWeight: 800, color: P.ink, letterSpacing: '-0.03em', lineHeight: 1.2 }}>
                  {faqTitle}
                </h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {faqItems.map((item, i) => (
                  <div key={i} style={{
                    background: P.surface, border: `1.5px solid ${faqOpen === i ? P.blue : P.border}`,
                    borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.2s',
                  }}>
                    <button
                      onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                      style={{
                        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '20px 24px', background: 'none', border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 700, color: P.ink, lineHeight: 1.4 }}>{item.q}</span>
                      <span style={{
                        flexShrink: 0, marginLeft: 16, width: 24, height: 24,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: faqOpen === i ? P.blue : P.bg, borderRadius: '50%', transition: 'background 0.2s',
                      }}>
                        {faqOpen === i ? <ChevronUp size={13} color="white" /> : <ChevronDown size={13} color={P.muted} />}
                      </span>
                    </button>
                    {faqOpen === i && (
                      <div style={{ padding: '0 24px 20px', fontSize: 14, color: P.muted, lineHeight: 1.75 }}>
                        {item.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

      </main>

      {/* ══════════════════════ FOOTER ══════════════════════ */}
      <footer style={{ background: P.slate, borderTop: '1px solid rgba(255,255,255,0.06)', padding: '44px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 28 }}>
            <BrandLogo fontSize={16} iconSize={16} theme="dark" />
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={onAudit} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#CBD5E1')}
                onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}>
                <ShieldCheck size={13} /> Validar Documento
              </button>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94A3B8' }}>
                <Phone size={13} /> {config?.contactPhone || '(11) 99999-9999'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94A3B8' }}>
                <Lock size={13} /> LGPD Conforme
              </span>
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <p style={{ fontSize: 12, color: '#475569' }}>© 2025 IncluiAI. Todos os direitos reservados.</p>
            <p style={{ fontSize: 12, color: '#475569' }}>Decreto nº 12.686/2025 · IA Educacional Certificada</p>
          </div>
        </div>
      </footer>

    </div>
  );
};