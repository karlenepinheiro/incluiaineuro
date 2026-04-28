import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck, FileText, ArrowRight,
  Lock, Phone,
  Zap, Star, ChevronDown, ChevronUp,
  Clock, Users, CreditCard,
} from 'lucide-react';
import { SiteConfig } from '../types';
import { AdminService } from '../services/adminService';
import { LandingService } from '../services/landingService';
import { PricingSection } from '../components/PricingSection';
import Hero from '../components/Hero';
import { BrandLogo } from '../components/BrandLogo';

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
    <rect x="10" y="6" width="440" height="568" rx="14" fill="white" filter="url(#am-shadow)"/>
    <rect x="10" y="6" width="440" height="52" rx="14" fill="#1F4E5F"/>
    <rect x="10" y="32" width="440" height="26" fill="#1F4E5F"/>
    <text x="30" y="39" fill="white" fontSize="14" fontWeight="700" fontFamily="system-ui">IncluiAI</text>
    <text x="432" y="39" fill="rgba(255,255,255,0.55)" fontSize="10" fontFamily="system-ui" textAnchor="end">Protocolo de Aprendizagem · PDF</text>
    <rect x="30" y="72" width="380" height="40" rx="9" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="1"/>
    <text x="46" y="88" fill="#94A3B8" fontSize="9" fontWeight="700" fontFamily="system-ui" letterSpacing="0.08em">ALUNO</text>
    <text x="46" y="103" fill="#0F172A" fontSize="13" fontWeight="600" fontFamily="system-ui">Lucas M. · 3º ano · TEA nível 1</text>
    <text x="30" y="136" fill="#0F172A" fontSize="16" fontWeight="800" fontFamily="system-ui">Sequência Numérica com Pictogramas</text>
    <text x="30" y="153" fill="#64748B" fontSize="11" fontFamily="system-ui">Objetivo: Identificar sequências 1–10 · BNCC EF01MA01</text>
    <line x1="30" y1="166" x2="430" y2="166" stroke="#E2E8F0" strokeWidth="1"/>
    <rect x="30" y="178" width="14" height="14" rx="3" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5"/>
    <text x="52" y="190" fill="#1E293B" fontSize="12" fontFamily="system-ui">1. Complete a sequência:  1,  2,  ___,  4,  ___</text>
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
    <rect x="30" y="276" width="14" height="14" rx="3" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5"/>
    <text x="52" y="288" fill="#1E293B" fontSize="12" fontFamily="system-ui">2. Pinte os números pares de azul</text>
    {[2,4,6,8].map((n, i) => (
      <g key={n}>
        <rect x={30 + i * 90} y={300} width="72" height="44" rx="9" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="1.5"/>
        <text x={30 + i * 90 + 36} y={328} textAnchor="middle" fill="#2563EB" fontSize="20" fontWeight="800" fontFamily="system-ui">{n}</text>
      </g>
    ))}
    <rect x="30" y="358" width="14" height="14" rx="3" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5"/>
    <text x="52" y="370" fill="#1E293B" fontSize="12" fontFamily="system-ui">3. Escreva o número que vem depois:</text>
    <rect x="30" y="380" width="380" height="32" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="1"/>
    <text x="46" y="401" fill="#94A3B8" fontSize="12" fontFamily="system-ui">3 → ___   ·   7 → ___   ·   9 → ___</text>
    <rect x="30" y="428" width="380" height="60" rx="10" fill="#FFFBEB" stroke="#FDE68A" strokeWidth="1.5"/>
    <text x="46" y="446" fill="#92400E" fontSize="9" fontWeight="700" fontFamily="system-ui" letterSpacing="0.08em">GUIA DO PROFESSOR · ORIENTAÇÕES PEDAGÓGICAS</text>
    <text x="46" y="462" fill="#78350F" fontSize="11" fontFamily="system-ui">• Use cartões visuais de apoio para facilitar a compreensão</text>
    <text x="46" y="479" fill="#78350F" fontSize="11" fontFamily="system-ui">• Permita pausas entre exercícios conforme necessário</text>
    <line x1="30" y1="500" x2="430" y2="500" stroke="#E2E8F0" strokeWidth="1"/>
    <rect x="280" y="514" width="150" height="38" rx="10" fill="#2563EB"/>
    <text x="355" y="537" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="system-ui">⬇  Baixar PDF</text>
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

  .pain-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 18px;
    padding: 30px 26px;
    transition: background 0.2s, border-color 0.2s;
  }
  .pain-card:hover { background: rgba(255,255,255,0.07); border-color: rgba(255,255,255,0.14); }

  .product-card {
    background: white; border-radius: 22px; padding: 36px 32px;
    border: 2px solid #E2E8F0;
    transition: transform 0.25s cubic-bezier(.22,1,.36,1), box-shadow 0.25s, border-color 0.25s;
  }
  .product-card.featured { border-color: #2563EB; box-shadow: 0 8px 40px rgba(37,99,235,0.12); }
  .product-card:hover { transform: translateY(-5px); box-shadow: 0 20px 56px rgba(0,0,0,0.10); }

  .intel-pillar {
    background: white; border-radius: 18px; padding: 30px 26px;
    border: 1.5px solid #E2E8F0;
    transition: transform 0.22s, box-shadow 0.22s;
  }
  .intel-pillar:hover { transform: translateY(-4px); box-shadow: 0 14px 44px rgba(0,0,0,0.08); }

  .testimonial-card {
    background: #F8FAFC; border: 1.5px solid #E2E8F0;
    border-radius: 16px; padding: 28px 24px;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .testimonial-card:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(0,0,0,0.07); }

  .credits-card {
    background: white; border-radius: 16px; padding: 28px 24px;
    border: 1.5px solid #E2E8F0;
    text-align: center;
  }

  .mockup-float { animation: lp-float 5s ease-in-out infinite; }

  /* ── Responsive ── */
  @media (max-width: 960px) {
    .lp-nav { display: none !important; }
    .two-col { grid-template-columns: 1fr !important; gap: 48px !important; }
    .three-col { grid-template-columns: 1fr 1fr !important; }
    .two-col-diffs { grid-template-columns: 1fr !important; }
    .three-col-proof { grid-template-columns: 1fr 1fr !important; }
  }
  @media (max-width: 640px) {
    .three-col { grid-template-columns: 1fr !important; }
    .three-col-proof { grid-template-columns: 1fr !important; }
    .cta-btns { flex-direction: column !important; align-items: stretch !important; }
    .cta-btns button, .cta-btns a { width: 100% !important; justify-content: center !important; }
    .credits-grid { grid-template-columns: 1fr !important; }
    .credits-table { display: none !important; }
  }
`;

// ─── FAQ defaults ─────────────────────────────────────────────────────────────
const FAQ_DEFAULTS = [
  { q: 'Para quem é o IncluiAI?', a: 'Para professores de AEE, psicopedagogos, fonoaudiólogos e demais profissionais de educação inclusiva que precisam de documentos padronizados, profissionais e auditáveis — sem passar horas na burocracia.' },
  { q: 'O que é o Protocolo de Aprendizagem?', a: 'É o nosso documento mais completo: inclui a atividade adaptada (folha do aluno), o guia de mediação (orientações individualizadas para o professor) e a adaptação individual (baseada no diagnóstico e perfil cognitivo do aluno). Tudo em um PDF profissional, pronto para imprimir.' },
  { q: 'O que são créditos e como funcionam?', a: 'Créditos são a unidade de uso da IA. Cada documento ou atividade gerada consome uma quantidade de créditos (entre 10 e 50, dependendo do tipo). Atividades com imagem consomem mais. Cada plano inclui uma cota mensal — e você pode comprar pacotes avulsos a qualquer momento.' },
  { q: 'Os dados dos alunos são seguros?', a: 'Sim. Armazenamos em conformidade com a LGPD, com criptografia e auditoria SHA-256 em cada documento gerado. Você pode validar qualquer documento via o código de autenticação no próprio PDF.' },
  { q: 'Posso cancelar a qualquer momento?', a: 'No plano mensal, sim — sem multas ou taxas de cancelamento. O plano anual tem carência de 12 meses.' },
  { q: 'Qual a diferença entre os planos?', a: 'O FREE permite até 5 alunos com 60 créditos/mês — ideal para começar. O PRO (R$79/mês) expande para 30 alunos com 500 créditos/mês. O PREMIUM (R$99/mês) é para escolas e clínicas — alunos ilimitados, fichas avançadas, análise de laudo com IA e relatórios evolutivos completos.' },
];

// ─── Pill label helper ────────────────────────────────────────────────────────
const Pill: React.FC<{ label: string; color?: string; bg?: string }> = ({
  label, color = P.blue, bg = P.blueLight,
}) => (
  <span style={{
    display: 'inline-block', fontSize: 11, fontWeight: 700,
    color, textTransform: 'uppercase', letterSpacing: '0.12em',
    background: bg, padding: '5px 16px', borderRadius: 100, marginBottom: 18,
  }}>
    {label}
  </span>
);

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

  const dor      = useReveal<HTMLDivElement>();
  const proto    = useReveal<HTMLDivElement>();
  const produto  = useReveal<HTMLDivElement>();
  const intel    = useReveal<HTMLDivElement>();
  const proof    = useReveal<HTMLDivElement>();
  const creditos = useReveal<HTMLDivElement>();
  const cta      = useReveal<HTMLDivElement>();

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
            <a href="#produto" onClick={e => { e.preventDefault(); document.getElementById('produto')?.scrollIntoView({ behavior: 'smooth' }); }} className="nav-link-lp">O que gera</a>
            <a href="#diferenciais" onClick={e => { e.preventDefault(); document.getElementById('diferenciais')?.scrollIntoView({ behavior: 'smooth' }); }} className="nav-link-lp">Por que IncluiAI</a>
            <a href="#pricing" onClick={e => { e.preventDefault(); document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }); }} className="nav-link-lp">Planos</a>
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

        {/* ══════════════════════ DOR ══════════════════════ */}
        <section style={{ background: '#0F172A', padding: '96px 0' }}>
          <div ref={dor.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${dor.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 56 }}>
              <span style={{
                display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#F87171',
                textTransform: 'uppercase', letterSpacing: '0.12em',
                background: 'rgba(248,113,113,0.12)', padding: '5px 16px', borderRadius: 100, marginBottom: 18,
              }}>
                A realidade de quem faz AEE
              </span>
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 52px)', fontWeight: 900, color: 'white', letterSpacing: '-0.04em', lineHeight: 1.08, marginBottom: 16 }}>
                Você ainda está passando por isso?
              </h2>
              <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)', maxWidth: 480, margin: '0 auto' }}>
                Nenhuma professora deveria gastar o domingo com papelada.
              </p>
            </div>

            <div className="two-col-diffs" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 48 }}>
              {[
                {
                  emoji: '😩', delay: 'rd1',
                  title: 'Domingo virou dia de trabalho',
                  desc: 'Horas formatando PEI em tabela, digitando PAEE no Word, organizando laudos em pasta. Tempo que deveria ser seu — perdido em burocracia.',
                },
                {
                  emoji: '📁', delay: 'rd2',
                  title: 'Cada um faz do seu jeito',
                  desc: 'Sem padrão, sem template, sem histórico. Cada profissional reinventa o processo a cada ano. E o aluno paga o preço.',
                },
                {
                  emoji: '🔄', delay: 'rd3',
                  title: 'Novo professor, começo do zero',
                  desc: 'O histórico do aluno desaparece no fim do ano. Quem assume não encontra nada. Recomeça do zero. Como sempre.',
                },
                {
                  emoji: '⏱️', delay: 'rd4',
                  title: 'Tempo que poderia ser do aluno',
                  desc: 'A burocracia consome as horas que deveriam ir para a sala de aula. Para o aluno que está esperando por você.',
                },
              ].map(item => (
                <div key={item.title} className={`pain-card reveal ${item.delay} ${dor.visible ? 'on' : ''}`}>
                  <div style={{ fontSize: 40, marginBottom: 18, lineHeight: 1 }}>{item.emoji}</div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: 'white', marginBottom: 10, lineHeight: 1.28 }}>{item.title}</h3>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.48)', lineHeight: 1.75 }}>{item.desc}</p>
                </div>
              ))}
            </div>

            <div className={`reveal rd4 ${dor.visible ? 'on' : ''}`} style={{ textAlign: 'center' }}>
              <div style={{
                display: 'inline-block',
                background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.28)',
                borderRadius: 18, padding: '22px 48px',
              }}>
                <p style={{ fontSize: 'clamp(16px, 2.5vw, 22px)', fontWeight: 800, color: '#4ADE80', lineHeight: 1.4, letterSpacing: '-0.02em', margin: 0 }}>
                  E se você pudesse fazer tudo isso<br />em menos de 2 minutos?
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════ PROTOCOLO DE APRENDIZAGEM ══════════════════════ */}
        <section style={{ background: P.surface, padding: '96px 0', overflow: 'hidden' }}>
          <div ref={proto.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>
            <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'center' }}>

              {/* Copy */}
              <div className={`reveal ${proto.visible ? 'on' : ''}`}>
                <Pill label="Protocolo de Aprendizagem" color={P.blue} bg={P.blueLight} />

                <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 44px)', fontWeight: 900, color: P.ink, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 18 }}>
                  O documento que nenhuma<br />ferramenta genérica entrega.
                </h2>
                <p style={{ fontSize: 16, color: P.muted, lineHeight: 1.78, marginBottom: 32 }}>
                  Não é uma atividade. É um pacote pedagógico completo — gerado com os dados reais do seu aluno.
                </p>

                {[
                  { emoji: '📄', title: 'Folha do aluno', desc: 'Atividade adaptada com objetivos BNCC, linguagem acessível e exercícios individualizados. Pronta para imprimir.' },
                  { emoji: '📋', title: 'Guia do professor', desc: 'Orientações pedagógicas para mediar cada exercício com esse aluno específico. Sem precisar improvisar.' },
                  { emoji: '🎯', title: 'Adaptação individual', desc: 'Baseada no diagnóstico, perfil cognitivo e nível de suporte necessário. Não é genérico — é desse aluno.' },
                ].map(item => (
                  <div key={item.title} style={{ display: 'flex', gap: 16, marginBottom: 22 }}>
                    <div style={{
                      width: 46, height: 46, background: P.blueLight, border: `1.5px solid #BFDBFE`,
                      borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, fontSize: 22,
                    }}>
                      {item.emoji}
                    </div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, color: P.ink, marginBottom: 4 }}>{item.title}</p>
                      <p style={{ fontSize: 14, color: P.muted, lineHeight: 1.65 }}>{item.desc}</p>
                    </div>
                  </div>
                ))}

                <button onClick={_onRegister} className="btn-cta" style={{ marginTop: 8, fontSize: 15, padding: '16px 36px' }}>
                  Gerar meu primeiro protocolo <ArrowRight size={16} />
                </button>
              </div>

              {/* Mockup */}
              <div className={`reveal rd2 ${proto.visible ? 'on' : ''} mockup-float`}>
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

        {/* ══════════════════════ O PRODUTO ══════════════════════ */}
        <section id="produto" style={{ background: P.bg, padding: '96px 0' }}>
          <div ref={produto.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${produto.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 64 }}>
              <Pill label="O que o IncluiAI gera" color={P.blue} bg={P.blueLight} />
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, color: P.ink, letterSpacing: '-0.04em', lineHeight: 1.08, marginBottom: 14 }}>
                Documentos que levam horas.<br />Prontos em minutos.
              </h2>
              <p style={{ fontSize: 17, color: P.muted, maxWidth: 500, margin: '0 auto' }}>
                Padrão técnico, dados do aluno, assinatura digital — em cada documento.
              </p>
            </div>

            <div className="three-col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              {[
                {
                  emoji: '🎯', delay: 'rd1', featured: true,
                  badge: '⭐ Principal',
                  color: P.blue, bg: P.blueLight, border: '#BFDBFE',
                  title: 'Protocolo de Aprendizagem',
                  desc: 'Atividade adaptada + guia do professor + adaptação individual. O documento completo que nenhuma outra ferramenta entrega.',
                  tags: ['Folha do aluno', 'Guia pedagógico', 'Adaptação individual'],
                },
                {
                  emoji: '📋', delay: 'rd2', featured: false,
                  badge: null,
                  color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE',
                  title: 'PEI · PAEE · PDI',
                  desc: 'Planos educacionais com metas SMART, critérios observáveis, histórico do aluno e assinatura digital SHA-256.',
                  tags: ['3 tipos de plano', 'Metas observáveis', 'Assinatura digital'],
                },
                {
                  emoji: '🔍', delay: 'rd3', featured: false,
                  badge: null,
                  color: P.greenDark, bg: P.greenLight, border: '#BBF7D0',
                  title: 'Estudo de Caso',
                  desc: 'Análise pedagógica completa — histórico, diagnóstico, evolução, família e parecer técnico. Aceito em relatórios INSS.',
                  tags: ['Análise completa', 'Parecer técnico', 'INSS'],
                },
              ].map(card => (
                <div
                  key={card.title}
                  className={`product-card${card.featured ? ' featured' : ''} reveal ${card.delay} ${produto.visible ? 'on' : ''}`}
                >
                  {card.badge && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: P.blueLight, color: P.blue,
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.08em', padding: '4px 12px', borderRadius: 100,
                      marginBottom: 20,
                    }}>
                      {card.badge}
                    </div>
                  )}
                  <div style={{
                    width: 64, height: 64, background: card.bg, border: `2px solid ${card.border}`,
                    borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 30, marginBottom: 20, marginTop: card.badge ? 0 : 0,
                  }}>
                    {card.emoji}
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: P.ink, marginBottom: 12, lineHeight: 1.25 }}>{card.title}</h3>
                  <p style={{ fontSize: 14, color: P.muted, lineHeight: 1.75, marginBottom: 22 }}>{card.desc}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {card.tags.map(t => (
                      <span key={t} style={{
                        fontSize: 11, fontWeight: 600, color: card.color,
                        background: card.bg, border: `1px solid ${card.border}`,
                        padding: '4px 10px', borderRadius: 100,
                      }}>{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Mini CTA */}
            <div className={`reveal rd4 ${produto.visible ? 'on' : ''}`} style={{
              marginTop: 28, background: P.surface, border: `1.5px solid ${P.border}`,
              borderRadius: 16, padding: '24px 32px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 20,
            }}>
              <div>
                <p style={{ fontSize: 17, fontWeight: 800, color: P.slate, marginBottom: 3 }}>Tudo isso, em menos de 2 minutos.</p>
                <p style={{ fontSize: 14, color: P.muted }}>Sem instalação. Sem curva de aprendizado. Começa hoje, de graça.</p>
              </div>
              <button onClick={_onRegister} className="btn-cta-sm">
                Começar grátis <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>

        {/* ══════════════════════ SISTEMA DE INTELIGÊNCIA ══════════════════════ */}
        <section id="diferenciais" style={{ background: P.surface, padding: '96px 0' }}>
          <div ref={intel.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${intel.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 56 }}>
              <Pill label="Por que IncluiAI" color="#7C3AED" bg="#F5F3FF" />
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 52px)', fontWeight: 900, color: P.ink, letterSpacing: '-0.04em', lineHeight: 1.08, marginBottom: 16 }}>
                Não é um gerador.<br />
                <span style={{ color: '#7C3AED' }}>É um sistema de inteligência pedagógica.</span>
              </h2>
              <p style={{ fontSize: 17, color: P.muted, maxWidth: 560, margin: '0 auto', lineHeight: 1.72 }}>
                Qualquer IA gera texto. O IncluiAI entende que cada aluno tem histórico, diagnóstico, família e trajetória — e gera documentos que refletem isso.
              </p>
            </div>

            <div className="two-col-diffs" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
              {[
                {
                  emoji: '🕐', delay: 'rd1',
                  color: P.blue, bg: P.blueLight, border: '#BFDBFE',
                  title: 'Continuidade do aluno',
                  desc: 'O IncluiAI lembra de cada aluno. O próximo professor encontra o histórico completo — e continua de onde você parou.',
                },
                {
                  emoji: '📊', delay: 'rd2',
                  color: P.greenDark, bg: P.greenLight, border: '#BBF7D0',
                  title: 'Dados organizados',
                  desc: 'Laudos, fichas, atividades e atendimentos em um só lugar. Com histórico real, pesquisável e sempre acessível.',
                },
                {
                  emoji: '🏛', delay: 'rd3',
                  color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE',
                  title: 'Padrão profissional',
                  desc: 'SHA-256, assinatura digital, conformidade LGPD. Todos os documentos com o mesmo nível técnico, sempre.',
                },
                {
                  emoji: '🔒', delay: 'rd4',
                  color: '#B45309', bg: P.goldLight, border: '#FDE68A',
                  title: 'Segurança pedagógica',
                  desc: 'Você não precisa saber gerar um PEI de cabeça. O IncluiAI garante a qualidade técnica do documento.',
                },
              ].map(item => (
                <div key={item.title} className={`intel-pillar reveal ${item.delay} ${intel.visible ? 'on' : ''}`}>
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
            <div className={`reveal rd4 ${intel.visible ? 'on' : ''}`} style={{
              marginTop: 48, background: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)',
              borderRadius: 20, padding: '36px 40px',
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, textAlign: 'center',
            }}>
              {[
                { val: '+1.800', label: 'Professores ativos', icon: Users },
                { val: '+12.000', label: 'Documentos gerados', icon: FileText },
                { val: '< 2 min', label: 'Para gerar um protocolo', icon: Clock },
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

        {/* ══════════════════════ PROVA SOCIAL ══════════════════════ */}
        <section style={{ background: P.bg, padding: '80px 0' }}>
          <div ref={proof.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${proof.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 48 }}>
              <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 40px)', fontWeight: 900, color: P.ink, letterSpacing: '-0.03em', marginBottom: 10 }}>
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
                  text: '"A escola inteira padronizou os documentos. Não tem mais aquela bagunça de cada um fazendo do seu jeito. Valeu cada centavo."',
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

        {/* ══════════════════════ PLANOS ══════════════════════ */}
        <PricingSection onLogin={onLogin} onRegister={_onRegister} onUpgradeClick={onUpgradeClick} />

        {/* ══════════════════════ CRÉDITOS ══════════════════════ */}
        <section style={{ background: P.surface, padding: '88px 0' }}>
          <div ref={creditos.ref} style={{ maxWidth: 1000, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${creditos.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 56 }}>
              <Pill label="Créditos de IA" color="#7C3AED" bg="#F5F3FF" />
              <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 42px)', fontWeight: 900, color: P.ink, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 14 }}>
                Simples, transparente, sem surpresa.
              </h2>
              <p style={{ fontSize: 17, color: P.muted, maxWidth: 500, margin: '0 auto', lineHeight: 1.7 }}>
                Créditos são a moeda de uso da IA. Cada plano inclui uma cota mensal. Você usa conforme a necessidade.
              </p>
            </div>

            {/* 3 info cards */}
            <div className="three-col credits-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 48 }}>
              {[
                {
                  emoji: '💬', delay: 'rd1',
                  title: 'Documentos de texto',
                  desc: 'PEI, PAEE, PDI, Protocolo de Aprendizagem — entre 10 e 40 créditos por geração.',
                },
                {
                  emoji: '🖼', delay: 'rd2',
                  title: 'Atividades com imagem',
                  desc: 'Quando a atividade inclui imagem ilustrativa gerada por IA, o consumo é maior — entre 30 e 50 créditos.',
                },
                {
                  emoji: '🛍', delay: 'rd3',
                  title: 'Pacotes avulsos',
                  desc: 'Acabou? Sem problema. Compre créditos adicionais a qualquer momento, sem precisar trocar de plano.',
                },
              ].map(card => (
                <div key={card.title} className={`credits-card reveal ${card.delay} ${creditos.visible ? 'on' : ''}`}>
                  <div style={{ fontSize: 36, marginBottom: 14 }}>{card.emoji}</div>
                  <h3 style={{ fontSize: 15, fontWeight: 800, color: P.ink, marginBottom: 8 }}>{card.title}</h3>
                  <p style={{ fontSize: 13, color: P.muted, lineHeight: 1.65 }}>{card.desc}</p>
                </div>
              ))}
            </div>

            {/* Table */}
            <div className={`reveal rd4 ${creditos.visible ? 'on' : ''} credits-table`} style={{
              background: P.bg, border: `1.5px solid ${P.border}`, borderRadius: 18, overflow: 'hidden',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: P.ink, padding: '14px 28px' }}>
                {['Plano', 'Créditos / mês', 'Alunos'].map(h => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>{h}</span>
                ))}
              </div>
              {[
                { plan: 'FREE', credits: '60 créditos', students: 'Até 5 alunos', accent: P.muted },
                { plan: 'PRO', credits: '500 créditos', students: 'Até 30 alunos', accent: P.blue },
                { plan: 'PREMIUM', credits: '700 créditos', students: 'Ilimitados', accent: '#7C3AED' },
              ].map((row, i) => (
                <div key={row.plan} style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                  padding: '16px 28px',
                  background: i % 2 === 0 ? P.surface : P.bg,
                  borderBottom: i < 2 ? `1px solid ${P.border}` : 'none',
                }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: row.accent }}>{row.plan}</span>
                  <span style={{ fontSize: 14, color: P.slate, fontWeight: 600 }}>{row.credits}</span>
                  <span style={{ fontSize: 14, color: P.muted }}>{row.students}</span>
                </div>
              ))}
            </div>

          </div>
        </section>

        {/* ══════════════════════ CTA FINAL ══════════════════════ */}
        <section style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #2563EB 100%)',
          padding: '120px 0', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -80, right: -80, width: 400, height: 400, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -60, left: -60, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.02)', pointerEvents: 'none' }} />

          <div ref={cta.ref} style={{ maxWidth: 760, margin: '0 auto', padding: '0 28px', textAlign: 'center' }}>
            <div className={`reveal ${cta.visible ? 'on' : ''}`}>

              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)',
                padding: '7px 20px', borderRadius: 100, marginBottom: 32,
              }}>
                <Zap size={13} color={P.gold} fill={P.gold} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                  Comece grátis — sem cartão de crédito
                </span>
              </div>

              <h2 style={{ fontSize: 'clamp(30px, 5vw, 58px)', fontWeight: 900, color: 'white', letterSpacing: '-0.045em', lineHeight: 1.05, marginBottom: 20 }}>
                Cada semana que passa,<br />
                <span style={{ color: P.gold }}>é mais um domingo perdido.</span>
              </h2>

              <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.65)', lineHeight: 1.72, maxWidth: 500, margin: '0 auto 52px' }}>
                Mais de 1.800 professoras pararam de levar trabalho para casa. Agora é a sua vez.
              </p>

              <div className="cta-btns" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
                <button onClick={_onRegister} className="btn-cta">
                  CRIAR MINHA CONTA GRÁTIS <ArrowRight size={18} />
                </button>
                <button
                  onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                  className="btn-ghost-white"
                >
                  Ver planos e preços
                </button>
              </div>

              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
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
