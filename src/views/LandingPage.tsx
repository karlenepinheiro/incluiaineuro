import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck, FileText, ArrowRight,
  Lock, Phone, Menu, X,
  Clock, Users, CheckCircle,
  BookOpen, Shield, Award,
  ChevronDown, ChevronUp,
  GraduationCap, Brain,
  FolderOpen, RefreshCw, AlertCircle,
  ClipboardList, Target, Image,
  Package, Database, Search,
  UserPlus, Download,
  Activity, Layers,
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

// ─── Cores oficiais da marca (fonte: BrandLogo.tsx + Sidebar.tsx) ─────────────
// Azul  #1F4E5F  — institucional / confiança
// Laranja #E07B2A — destaque / CTA / conversão
// Verde  #10B981  — benefícios / resultados / positivo
// Branco #FFFFFF  — fundo principal
const T = {
  blue:     '#1F4E5F',
  blueDk:   '#17404F',
  blueLt:   '#EBF3F6',
  orange:   '#E07B2A',
  orangeDk: '#C4661E',
  orangeLt: '#FEF3E8',
  green:    '#10B981',
  greenLt:  '#D1FAE5',
  white:    '#FFFFFF',
  ink:      '#0F172A',
  textSec:  '#475569',
  border:   '#E2E8F0',
  muted:    '#94A3B8',
  surface:  '#F8FAFC',
};

// ─── FAQ defaults (sem FREE) ───────────────────────────────────────────────────
const FAQ_DEFAULTS = [
  {
    q: 'Para quem é o IncluiAI?',
    a: 'Para profissionais de educação inclusiva que precisam de documentos padronizados, técnicos e auditáveis: professores de AEE, psicopedagogos, neuropedagogos, coordenadores pedagógicos e professores de sala de aula com alunos incluídos.',
  },
  {
    q: 'O que é o Protocolo de Aprendizagem?',
    a: 'É o documento mais completo da plataforma: inclui a atividade adaptada (folha do aluno), o guia de mediação (orientações individualizadas para a professora) e a adaptação individual (baseada no diagnóstico e perfil cognitivo do aluno). Tudo em um PDF profissional, pronto para imprimir.',
  },
  {
    q: 'O que são créditos e como funcionam?',
    a: 'Créditos são a unidade de uso da IA. Cada documento ou atividade gerada consome entre 10 e 50 créditos, dependendo do tipo. Cada plano inclui uma cota mensal renovada automaticamente. Pacotes avulsos adicionais estão disponíveis quando necessário.',
  },
  {
    q: 'Os dados dos alunos são seguros?',
    a: 'Sim. Armazenamos em conformidade com a LGPD, com criptografia e auditoria SHA-256 em cada documento gerado. Você pode validar qualquer documento via o código de autenticação no próprio PDF.',
  },
  {
    q: 'Posso cancelar a qualquer momento?',
    a: 'No plano mensal, sim — sem multas ou taxas de cancelamento. O plano anual tem fidelidade de 12 meses e o valor é cobrado como pagamento único parcelável.',
  },
  {
    q: 'Qual a diferença entre os planos?',
    a: 'O PRO (R$ 79/mês ou R$ 59/mês no anual, totalizando R$ 708/ano) atende professoras e especialistas com até 30 alunos e 500 créditos/mês. O Premium (R$ 147/mês ou R$ 99/mês no anual, totalizando R$ 1.188/ano) é para escolas e clínicas — alunos ilimitados, 700 créditos/mês, fichas avançadas, análise de laudo com IA e relatórios evolutivos completos.',
  },
];

// ─── ActivityMockup SVG ────────────────────────────────────────────────────────
const ActivityMockup: React.FC = () => (
  <svg
    viewBox="0 0 460 560"
    xmlns="http://www.w3.org/2000/svg"
    style={{ width: '100%', height: 'auto', display: 'block' }}
    role="img"
    aria-label="Exemplo de Protocolo de Aprendizagem gerado pelo IncluiAI"
  >
    <defs>
      <filter id="am-sh2">
        <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="#1F4E5F" floodOpacity="0.10"/>
      </filter>
    </defs>
    <rect x="10" y="6" width="440" height="548" rx="14" fill="white" filter="url(#am-sh2)"/>
    <rect x="10" y="6" width="440" height="52" rx="14" fill={T.blue}/>
    <rect x="10" y="32" width="440" height="26" fill={T.blue}/>
    <text x="30" y="39" fill="white" fontSize="14" fontWeight="700" fontFamily="system-ui">IncluiAI</text>
    <text x="432" y="39" fill="rgba(255,255,255,0.5)" fontSize="10" fontFamily="system-ui" textAnchor="end">Protocolo de Aprendizagem · PDF</text>

    <rect x="30" y="72" width="380" height="40" rx="9" fill={T.surface} stroke={T.border} strokeWidth="1"/>
    <text x="46" y="88" fill={T.muted} fontSize="9" fontWeight="700" fontFamily="system-ui" letterSpacing="0.08em">ESTUDANTE</text>
    <text x="46" y="103" fill={T.ink} fontSize="12" fontWeight="600" fontFamily="system-ui">Estudante · 3º ano · Ensino Fundamental</text>

    <text x="30" y="136" fill={T.ink} fontSize="15" fontWeight="800" fontFamily="system-ui">Sequência Numérica com Apoio Visual</text>
    <text x="30" y="153" fill={T.textSec} fontSize="11" fontFamily="system-ui">Objetivo: Identificar sequências 1–10 · BNCC EF01MA01</text>
    <line x1="30" y1="166" x2="430" y2="166" stroke={T.border} strokeWidth="1"/>

    <rect x="30" y="178" width="14" height="14" rx="3" fill={T.blueLt} stroke={T.blue} strokeWidth="1.5"/>
    <text x="52" y="190" fill={T.ink} fontSize="12" fontFamily="system-ui">1. Complete a sequência:  1,  2,  ___,  4,  ___</text>
    {[1,2,3,4,5].map((n, i) => (
      <g key={n}>
        <rect x={30 + i * 78} y={208} width="64" height="48" rx="10"
          fill={i % 2 === 0 ? T.blueLt : T.orangeLt}
          stroke={i % 2 === 0 ? 'rgba(31,78,95,0.25)' : 'rgba(224,123,42,0.25)'}
          strokeWidth="1.5"/>
        <text x={30 + i * 78 + 32} y={238} textAnchor="middle"
          fill={i % 2 === 0 ? T.blue : T.orange}
          fontSize="22" fontWeight="800" fontFamily="system-ui">{n}</text>
      </g>
    ))}

    <rect x="30" y="270" width="14" height="14" rx="3" fill={T.blueLt} stroke={T.blue} strokeWidth="1.5"/>
    <text x="52" y="282" fill={T.ink} fontSize="12" fontFamily="system-ui">2. Circule os números pares</text>
    {[2,4,6,8].map((n, i) => (
      <g key={n}>
        <rect x={30 + i * 88} y={294} width="68" height="40" rx="9" fill={T.blueLt} stroke="rgba(31,78,95,0.2)" strokeWidth="1.5"/>
        <text x={30 + i * 88 + 34} y={319} textAnchor="middle" fill={T.blue} fontSize="20" fontWeight="800" fontFamily="system-ui">{n}</text>
      </g>
    ))}

    <rect x="30" y="348" width="14" height="14" rx="3" fill={T.blueLt} stroke={T.blue} strokeWidth="1.5"/>
    <text x="52" y="360" fill={T.ink} fontSize="12" fontFamily="system-ui">3. Escreva o número que vem depois:</text>
    <rect x="30" y="372" width="380" height="30" rx="8" fill={T.surface} stroke={T.border} strokeWidth="1"/>
    <text x="46" y="391" fill={T.muted} fontSize="12" fontFamily="system-ui">3 → ___   ·   7 → ___   ·   9 → ___</text>

    <rect x="30" y="416" width="380" height="60" rx="10" fill={T.orangeLt} stroke="rgba(224,123,42,0.25)" strokeWidth="1.5"/>
    <text x="46" y="434" fill="#92400E" fontSize="9" fontWeight="700" fontFamily="system-ui" letterSpacing="0.08em">GUIA DO PROFESSOR · ORIENTAÇÕES PEDAGÓGICAS</text>
    <text x="46" y="450" fill="#78350F" fontSize="11" fontFamily="system-ui">• Use cartões visuais de apoio para facilitar a compreensão</text>
    <text x="46" y="467" fill="#78350F" fontSize="11" fontFamily="system-ui">• Permita pausas entre exercícios conforme necessário</text>

    <line x1="30" y1="490" x2="430" y2="490" stroke={T.border} strokeWidth="1"/>
    <rect x="280" y="504" width="150" height="36" rx="10" fill={T.orange}/>
    <text x="355" y="526" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="system-ui">Baixar PDF</text>
    <rect x="30" y="506" width="188" height="32" rx="8" fill={T.blueLt} stroke="rgba(31,78,95,0.2)" strokeWidth="1"/>
    <text x="46" y="521" fill={T.blue} fontSize="10" fontWeight="700" fontFamily="system-ui">Assinado digitalmente</text>
    <text x="46" y="534" fill={T.muted} fontSize="9" fontFamily="system-ui">SHA-256 · LGPD conforme</text>
  </svg>
);

// ─── Pill label ────────────────────────────────────────────────────────────────
const Pill: React.FC<{ label: string; color?: 'blue' | 'orange' | 'green' }> = ({ label, color = 'blue' }) => {
  const styles = {
    blue:   { bg: T.blueLt,   text: T.blue,     border: 'rgba(31,78,95,0.15)' },
    orange: { bg: T.orangeLt, text: T.orangeDk, border: 'rgba(224,123,42,0.20)' },
    green:  { bg: T.greenLt,  text: '#065F46',  border: 'rgba(16,185,129,0.20)' },
  }[color];
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 700,
      color: styles.text, textTransform: 'uppercase', letterSpacing: '0.12em',
      background: styles.bg, padding: '5px 16px', borderRadius: 100, marginBottom: 18,
      border: `1px solid ${styles.border}`,
    }}>
      {label}
    </span>
  );
};

// ─── useReveal ─────────────────────────────────────────────────────────────────
function useReveal<E extends HTMLElement>() {
  const ref = useRef<E>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setVisible(true); return; }
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.06 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

// ─── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  @media (prefers-reduced-motion: reduce) {
    .lp3-reveal { transition: none !important; opacity: 1 !important; transform: none !important; }
  }
  .lp3-reveal { opacity: 0; transform: translateY(18px); transition: opacity 0.6s cubic-bezier(.22,1,.36,1), transform 0.6s cubic-bezier(.22,1,.36,1); }
  .lp3-reveal.on { opacity: 1; transform: translateY(0); }
  .lp3-rd1 { transition-delay: 0.05s; }
  .lp3-rd2 { transition-delay: 0.13s; }
  .lp3-rd3 { transition-delay: 0.21s; }
  .lp3-rd4 { transition-delay: 0.29s; }
  .lp3-rd5 { transition-delay: 0.37s; }

  /* ── Botões ── */
  .lp3-btn-orange {
    background: ${T.orange}; color: white; border: none; cursor: pointer;
    font-weight: 700; font-family: inherit; font-size: 16px;
    padding: 14px 30px; border-radius: 10px; min-height: 48px;
    display: inline-flex; align-items: center; gap: 8px;
    transition: background 0.2s, transform 0.15s;
    touch-action: manipulation; white-space: nowrap;
    box-shadow: 0 4px 16px rgba(224,123,42,0.25);
  }
  .lp3-btn-orange:hover  { background: ${T.orangeDk}; transform: translateY(-1px); }
  .lp3-btn-orange:active { transform: translateY(0); }
  .lp3-btn-orange:focus-visible { outline: 3px solid ${T.blue}; outline-offset: 2px; }

  .lp3-btn-blue {
    background: transparent; color: ${T.blue};
    border: 2px solid ${T.blue}; cursor: pointer;
    font-weight: 700; font-family: inherit; font-size: 15px;
    padding: 13px 26px; border-radius: 10px; min-height: 48px;
    display: inline-flex; align-items: center; gap: 8px;
    transition: background 0.2s, color 0.2s;
    touch-action: manipulation; white-space: nowrap;
  }
  .lp3-btn-blue:hover { background: ${T.blue}; color: white; }
  .lp3-btn-blue:focus-visible { outline: 3px solid ${T.orange}; outline-offset: 2px; }

  .lp3-btn-ghost {
    background: transparent; color: rgba(255,255,255,0.92);
    border: 1.5px solid rgba(255,255,255,0.35); cursor: pointer;
    font-weight: 700; font-family: inherit; font-size: 15px;
    padding: 13px 26px; border-radius: 10px; min-height: 48px;
    display: inline-flex; align-items: center; gap: 8px;
    transition: background 0.2s, border-color 0.2s;
    touch-action: manipulation;
  }
  .lp3-btn-ghost:hover { background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.6); }
  .lp3-btn-ghost:focus-visible { outline: 3px solid ${T.orange}; outline-offset: 2px; }

  /* ── Navbar ── */
  .lp3-nav-btn {
    font-size: 14px; font-weight: 500; color: ${T.textSec}; text-decoration: none;
    background: none; border: none; cursor: pointer; font-family: inherit;
    padding: 8px 4px; min-height: 40px; display: inline-flex; align-items: center;
    transition: color 0.15s;
  }
  .lp3-nav-btn:hover { color: ${T.blue}; }
  .lp3-nav-btn:focus-visible { outline: 2px solid ${T.blue}; outline-offset: 2px; border-radius: 4px; }

  .lp3-nav-login {
    background: transparent; color: ${T.blue}; border: 1.5px solid ${T.blue};
    cursor: pointer; font-weight: 700; font-family: inherit; font-size: 13px;
    padding: 8px 18px; border-radius: 8px; min-height: 36px;
    transition: background 0.2s, color 0.2s;
  }
  .lp3-nav-login:hover { background: ${T.blue}; color: white; }
  .lp3-nav-login:focus-visible { outline: 3px solid ${T.orange}; outline-offset: 2px; }

  .lp3-nav-cta {
    background: ${T.orange}; color: white; border: none;
    cursor: pointer; font-weight: 700; font-family: inherit; font-size: 13px;
    padding: 9px 20px; border-radius: 8px; min-height: 36px;
    transition: background 0.2s;
  }
  .lp3-nav-cta:hover { background: ${T.orangeDk}; }
  .lp3-nav-cta:focus-visible { outline: 3px solid ${T.blue}; outline-offset: 2px; }

  /* ── Cards ── */
  .lp3-card {
    background: white; border-radius: 16px; padding: 28px 24px;
    border: 1.5px solid ${T.border};
    box-shadow: 0 10px 30px rgba(15,42,61,0.07);
    transition: transform 0.22s cubic-bezier(.22,1,.36,1), box-shadow 0.22s;
  }
  .lp3-card:hover { transform: translateY(-3px); box-shadow: 0 18px 48px rgba(15,42,61,0.12); }

  .lp3-product-card {
    background: white; border-radius: 18px; padding: 32px 28px;
    border: 1.5px solid ${T.border};
    box-shadow: 0 10px 30px rgba(15,42,61,0.07);
    transition: transform 0.22s cubic-bezier(.22,1,.36,1), box-shadow 0.22s, border-color 0.22s;
  }
  .lp3-product-card:hover { transform: translateY(-4px); box-shadow: 0 20px 56px rgba(15,42,61,0.12); border-color: ${T.blue}; }
  .lp3-product-card.featured { border-color: ${T.blue}; box-shadow: 0 12px 40px rgba(31,78,95,0.12); }

  /* ── Audience grid 3+2 ── */
  .lp3-audience-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 20px;
  }
  .lp3-audience-grid > :nth-child(-n+3) { grid-column: span 2; }
  .lp3-audience-grid > :nth-child(n+4)  { grid-column: span 3; }

  /* ── Pain grid 2x2 ── */
  .lp3-pain-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }

  /* ── Responsive ── */
  @media (max-width: 1024px) {
    .lp3-audience-grid { grid-template-columns: repeat(2, 1fr); }
    .lp3-audience-grid > * { grid-column: span 1 !important; }
    .lp3-desktop-nav { display: none !important; }
    .lp3-hamburger   { display: flex !important; }
    .lp3-two-col     { grid-template-columns: 1fr !important; gap: 40px !important; }
    .lp3-three-col   { grid-template-columns: 1fr 1fr !important; }
    .lp3-four-col    { grid-template-columns: 1fr 1fr !important; }
    .lp3-stats-strip { grid-template-columns: 1fr 1fr !important; }
  }
  @media (max-width: 640px) {
    .lp3-audience-grid { grid-template-columns: 1fr; }
    .lp3-three-col  { grid-template-columns: 1fr !important; }
    .lp3-pain-grid  { grid-template-columns: 1fr !important; }
    .lp3-cta-group  { flex-direction: column !important; }
    .lp3-cta-group > * { width: 100% !important; justify-content: center !important; }
    .lp3-comp-grid  { grid-template-columns: 1fr !important; }
    .lp3-footer-row { flex-direction: column !important; align-items: flex-start !important; gap: 16px !important; }
    .lp3-footer-links { flex-direction: column !important; gap: 12px !important; }
  }

  /* ── Mobile menu ── */
  .lp3-mobile-menu {
    display: none; position: fixed; top: 64px; left: 0; right: 0;
    background: rgba(255,255,255,0.98); border-bottom: 1px solid ${T.border};
    padding: 10px 24px 20px; z-index: 48;
    flex-direction: column; gap: 0;
    backdrop-filter: blur(16px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.08);
  }
  .lp3-mobile-menu.open { display: flex; }
  .lp3-mobile-item {
    font-size: 16px; font-weight: 500; color: ${T.ink};
    padding: 14px 8px; border-bottom: 1px solid ${T.border};
    cursor: pointer; background: none; border-left: none; border-right: none; border-top: none;
    font-family: inherit; text-align: left; width: 100%;
    min-height: 48px; display: flex; align-items: center; transition: color 0.15s;
  }
  .lp3-mobile-item:hover { color: ${T.blue}; }
  .lp3-mobile-item:last-child { border-bottom: none; }
  .lp3-mobile-item:focus-visible { outline: 2px solid ${T.blue}; outline-offset: 2px; border-radius: 4px; }

  @media (prefers-reduced-motion: reduce) {
    .lp3-btn-orange, .lp3-btn-blue, .lp3-btn-ghost,
    .lp3-card, .lp3-product-card { transition: none !important; }
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────
export const LandingPage: React.FC<Props> = ({ onLogin, onRegister, onAudit, onUpgradeClick }) => {
  const [config, setConfig]     = useState<SiteConfig | null>(null);
  const [faqTitle, setFaqTitle] = useState('Perguntas frequentes');
  const [faqItems, setFaqItems] = useState(FAQ_DEFAULTS);
  const [faqOpen, setFaqOpen]   = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    AdminService.getSiteConfig().then(setConfig);
    LandingService.getActive().then(sections => {
      sections.forEach(s => {
        if (s.section_key === 'faq') {
          if (s.title) setFaqTitle(s.title);
          if (Array.isArray(s.content_json?.items)) setFaqItems(s.content_json.items);
        }
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener('scroll', close, { passive: true });
    return () => window.removeEventListener('scroll', close);
  }, []);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const quemE    = useReveal<HTMLDivElement>();
  const dor      = useReveal<HTMLDivElement>();
  const comp     = useReveal<HTMLDivElement>();
  const produto  = useReveal<HTMLDivElement>();
  const proto    = useReveal<HTMLDivElement>();
  const difer    = useReveal<HTMLDivElement>();
  const como     = useReveal<HTMLDivElement>();
  const creditos = useReveal<HTMLDivElement>();
  const cta      = useReveal<HTMLDivElement>();

  return (
    <div style={{ fontFamily: "'Inter','Helvetica Neue',system-ui,sans-serif", background: T.white, color: T.ink, minHeight: '100dvh' }}>
      <style>{CSS}</style>

      {/* Skip link */}
      <a href="#main-content" style={{ position: 'absolute', top: -48, left: 16, zIndex: 200, background: T.blue, color: 'white', padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none', transition: 'top 0.2s' }}
        onFocus={e => (e.currentTarget.style.top = '16px')}
        onBlur={e => (e.currentTarget.style.top = '-48px')}
      >
        Ir para o conteúdo
      </a>

      {/* ══════════ NAVBAR ══════════ */}
      <header role="banner" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, background: 'rgba(255,255,255,0.97)', borderBottom: `1px solid ${T.border}`, backdropFilter: 'blur(16px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BrandLogo fontSize={17} iconSize={17} theme="light" />
          <nav className="lp3-desktop-nav" style={{ display: 'flex', gap: 24, alignItems: 'center' }} aria-label="Navegação principal">
            <button onClick={() => scrollTo('quem-e')}        className="lp3-nav-btn">Para quem é</button>
            <button onClick={() => scrollTo('produto')}       className="lp3-nav-btn">O que gera</button>
            <button onClick={() => scrollTo('como-funciona')} className="lp3-nav-btn">Como funciona</button>
            <button onClick={() => scrollTo('pricing')}       className="lp3-nav-btn">Planos</button>
            <button onClick={onAudit} className="lp3-nav-btn" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <ShieldCheck size={13} aria-hidden="true" /> Validar Doc
            </button>
          </nav>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={onLogin} className="lp3-nav-login">Entrar</button>
            <button onClick={() => scrollTo('pricing')} className="lp3-nav-cta">Ver planos</button>
            <button className="lp3-hamburger" style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, color: T.ink }}
              onClick={() => setMenuOpen(v => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
        <nav className={`lp3-mobile-menu${menuOpen ? ' open' : ''}`} aria-label="Menu mobile">
          <button onClick={() => scrollTo('quem-e')}        className="lp3-mobile-item">Para quem é</button>
          <button onClick={() => scrollTo('produto')}       className="lp3-mobile-item">O que gera</button>
          <button onClick={() => scrollTo('como-funciona')} className="lp3-mobile-item">Como funciona</button>
          <button onClick={() => scrollTo('pricing')}       className="lp3-mobile-item">Ver planos</button>
          <button onClick={() => { setMenuOpen(false); onAudit(); }} className="lp3-mobile-item">Validar Documento</button>
          <button onClick={() => { setMenuOpen(false); onLogin(); }} className="lp3-mobile-item" style={{ color: T.blue, fontWeight: 700 }}>Entrar</button>
        </nav>
      </header>

      <main id="main-content">

        {/* ══════════ HERO ══════════ */}
        <Hero onRegister={onRegister} />

        {/* ══════════ PARA QUEM É ══════════ */}
        <section id="quem-e" style={{ background: T.white, padding: '88px 0' }}>
          <div ref={quemE.ref} style={{ maxWidth: 1160, margin: '0 auto', padding: '0 28px' }}>
            <div className={`lp3-reveal ${quemE.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 56 }}>
              <Pill label="Para quem é" />
              <h2 style={{ fontSize: 'clamp(26px,3.8vw,42px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 14 }}>
                Feito para quem documenta a inclusão.
              </h2>
              <p style={{ fontSize: 17, color: T.textSec, maxWidth: 540, margin: '0 auto', lineHeight: 1.72 }}>
                O IncluiAI foi construído para profissionais de educação inclusiva que precisam de documentos técnicos, padronizados e auditáveis — não para uso genérico.
              </p>
            </div>

            <div className="lp3-audience-grid">
              {[
                { icon: BookOpen, delay: 'lp3-rd1', title: 'Professor de sala de aula', color: T.blue,   colorLt: T.blueLt,
                  desc: 'Cria registros pedagógicos do aluno incluído, documenta estratégias de adaptação e mantém histórico de acompanhamento com respaldo para comunicação com AEE e coordenação.',
                  bullets: ['Registros pedagógicos estruturados', 'Estratégias e adaptações documentadas', 'Comunicação com AEE e coordenação'] },
                { icon: GraduationCap, delay: 'lp3-rd2', title: 'Professor de AEE', color: T.blue,   colorLt: T.blueLt,
                  desc: 'Gera PEI, PAEE e PDI completos com metas observáveis. Produz Estudo de Caso, plano de atendimento e mantém o histórico do aluno com linha do tempo.',
                  bullets: ['PEI, PAEE e PDI auditáveis', 'Estudo de Caso detalhado', 'Histórico com linha do tempo'] },
                { icon: Layers, delay: 'lp3-rd3', title: 'Coordenador pedagógico', color: T.green,  colorLt: T.greenLt,
                  desc: 'Acompanha a documentação da equipe, padroniza os registros de inclusão e garante a continuidade pedagógica entre professores e anos letivos.',
                  bullets: ['Visão organizada de todos os alunos', 'Padronização dos registros', 'Continuidade entre professores'] },
                { icon: Brain, delay: 'lp3-rd4', title: 'Psicopedagogo', color: T.orange, colorLt: T.orangeLt,
                  desc: 'Cria Estudos de Caso com análise pedagógica completa, registra perfil cognitivo multidimensional e documenta evoluções com planejamento de intervenções.',
                  bullets: ['Estudo de Caso com análise interpretativa', 'Perfil cognitivo multidimensional', 'Registros evolutivos com histórico real'] },
                { icon: Activity, delay: 'lp3-rd5', title: 'Neuropedagogo', color: T.orange, colorLt: T.orangeLt,
                  desc: 'Analisa múltiplas dimensões do aprendizado, gera perfil individualizado e documenta estratégias pedagógicas baseadas em evidências com acompanhamento evolutivo.',
                  bullets: ['Análise multidimensional do aprendizado', 'Perfil de aprendizagem individualizado', 'Acompanhamento evolutivo completo'] },
              ].map(card => {
                const Icon = card.icon;
                return (
                  <div key={card.title} className={`lp3-card lp3-reveal ${card.delay} ${quemE.visible ? 'on' : ''}`}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: card.colorLt, border: `1.5px solid ${card.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                      <Icon size={24} color={card.color} aria-hidden="true" />
                    </div>
                    <h3 style={{ fontSize: 17, fontWeight: 800, color: T.ink, marginBottom: 10, lineHeight: 1.3 }}>{card.title}</h3>
                    <p style={{ fontSize: 13, color: T.textSec, lineHeight: 1.72, marginBottom: 18 }}>{card.desc}</p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {card.bullets.map(b => (
                        <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.textSec }}>
                          <CheckCircle size={13} color={card.color} aria-hidden="true" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══════════ SEÇÃO DE DORES ══════════ */}
        <section style={{ background: T.surface, padding: '96px 0' }}>
          <div ref={dor.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>
            <div className={`lp3-reveal ${dor.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 56 }}>
              <Pill label="A realidade de quem faz AEE" color="orange" />
              <h2 style={{ fontSize: 'clamp(26px,4vw,46px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.04em', lineHeight: 1.08, marginBottom: 18 }}>
                Sua rotina ainda está presa<br />à papelada?
              </h2>
              <p style={{ fontSize: 16, color: T.textSec, maxWidth: 540, margin: '0 auto', lineHeight: 1.72 }}>
                Quando os documentos são feitos do zero, sem padrão e sem histórico centralizado, o trabalho pedagógico vira retrabalho.
              </p>
            </div>

            <div className="lp3-pain-grid">
              {[
                { icon: Clock, delay: 'lp3-rd1', accentColor: T.orange, accentLt: T.orangeLt,
                  title: 'Horas perdidas refazendo documentos',
                  desc: 'A cada novo atendimento, você parte do zero. Sem template, sem histórico, sem continuidade. Horas formatando PEI em Word enquanto o aluno espera.' },
                { icon: FolderOpen, delay: 'lp3-rd2', accentColor: T.blue, accentLt: T.blueLt,
                  title: 'Cada profissional trabalha de um jeito',
                  desc: 'Falta de padrão entre a equipe. Cada professora tem seu modelo, sua pasta, sua forma. Sem organização compartilhada, o acompanhamento fica fragmentado.' },
                { icon: RefreshCw, delay: 'lp3-rd3', accentColor: T.orange, accentLt: T.orangeLt,
                  title: 'O histórico do aluno se perde',
                  desc: 'Ao mudar de professor ou ano letivo, tudo recomeça. O histórico do aluno — suas conquistas, dificuldades, diagnósticos — some junto com quem saiu.' },
                { icon: AlertCircle, delay: 'lp3-rd4', accentColor: T.blue, accentLt: T.blueLt,
                  title: 'A burocracia toma o tempo do pedagógico',
                  desc: 'O tempo que deveria ir para o aluno vai para papelada. Para formulários, para registros manuais, para documentação feita sob pressão no último dia.' },
              ].map(card => {
                const Icon = card.icon;
                return (
                  <div key={card.title} className={`lp3-card lp3-reveal ${card.delay} ${dor.visible ? 'on' : ''}`}>
                    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                      <div style={{ width: 52, height: 52, borderRadius: 14, background: card.accentLt, border: `1.5px solid ${card.accentColor}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={24} color={card.accentColor} aria-hidden="true" />
                      </div>
                      <div>
                        <h3 style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 8, lineHeight: 1.35 }}>{card.title}</h3>
                        <p style={{ fontSize: 14, color: T.textSec, lineHeight: 1.72, margin: 0 }}>{card.desc}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══════════ COMPARATIVO: SEM / COM ══════════ */}
        <section style={{ background: T.white, padding: '96px 0' }}>
          <div ref={comp.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>
            <div className={`lp3-reveal ${comp.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 56 }}>
              <Pill label="Comparativo" color="blue" />
              <h2 style={{ fontSize: 'clamp(24px,3.8vw,42px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 14 }}>
                Com IncluiAI e sem IncluiAI:<br />o que muda na prática
              </h2>
              <p style={{ fontSize: 16, color: T.textSec, maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>
                Compare a rotina de quem ainda trabalha no improviso com a de quem centraliza, padroniza e acompanha seus documentos no IncluiAI.
              </p>
            </div>

            <div className="lp3-comp-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

              {/* Sem IncluiAI */}
              <div className={`lp3-reveal lp3-rd1 ${comp.visible ? 'on' : ''}`} style={{
                background: '#FFFBF7', border: `1.5px solid rgba(224,123,42,0.20)`,
                borderRadius: 20, overflow: 'hidden',
                boxShadow: '0 10px 30px rgba(224,123,42,0.06)',
              }}>
                <div style={{ background: 'rgba(224,123,42,0.10)', padding: '18px 28px', borderBottom: `1px solid rgba(224,123,42,0.15)`, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: T.orangeLt, border: `1.5px solid ${T.orange}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={16} color={T.orange} strokeWidth={2.5} aria-hidden="true" />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: T.orangeDk, margin: 0 }}>Sem IncluiAI</h3>
                </div>
                <ul style={{ padding: '24px 28px', margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    'Documentos criados do zero a cada atendimento',
                    'Informações espalhadas em pastas, e-mails e arquivos soltos',
                    'Falta de padrão — cada profissional faz do seu jeito',
                    'Histórico do aluno se perde ao mudar de professor',
                    'Retrabalho constante por falta de registro centralizado',
                    'Dificuldade de continuidade entre anos letivos',
                    'Mais tempo com burocracia do que com o aluno',
                    'Insegurança na entrega de documentos técnicos',
                  ].map(item => (
                    <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: T.orangeLt, border: `1.5px solid rgba(224,123,42,0.35)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                        <X size={10} color={T.orange} strokeWidth={2.5} aria-hidden="true" />
                      </div>
                      <span style={{ fontSize: 14, color: T.textSec, lineHeight: 1.6 }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Com IncluiAI */}
              <div className={`lp3-reveal lp3-rd2 ${comp.visible ? 'on' : ''}`} style={{
                background: '#F0FDF9', border: `1.5px solid rgba(16,185,129,0.22)`,
                borderRadius: 20, overflow: 'hidden',
                boxShadow: '0 10px 30px rgba(16,185,129,0.08)',
              }}>
                <div style={{ background: 'rgba(16,185,129,0.10)', padding: '18px 28px', borderBottom: `1px solid rgba(16,185,129,0.15)`, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: T.greenLt, border: `1.5px solid ${T.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle size={18} color={T.green} aria-hidden="true" />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: '#065F46', margin: 0 }}>Com IncluiAI</h3>
                </div>
                <ul style={{ padding: '24px 28px', margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    'Documentos estruturados gerados em minutos',
                    'Histórico centralizado e acessível por aluno',
                    'Continuidade garantida entre professores e anos',
                    'Registros padronizados e auditáveis com SHA-256',
                    'Organização completa com linha do tempo pedagógica',
                    'Conformidade LGPD e assinatura digital em todos os documentos',
                    'Mais tempo para o acompanhamento pedagógico real',
                    'Segurança na entrega: validação e autenticidade comprovada',
                  ].map(item => (
                    <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <CheckCircle size={18} color={T.green} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                      <span style={{ fontSize: 14, color: '#0F4037', lineHeight: 1.6, fontWeight: 500 }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className={`lp3-reveal lp3-rd3 ${comp.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginTop: 40 }}>
              <button onClick={() => scrollTo('pricing')} className="lp3-btn-orange">
                Escolher meu plano <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        {/* ══════════ O QUE O INCLUIAI GERA ══════════ */}
        <section id="produto" style={{ background: T.surface, padding: '96px 0' }}>
          <div ref={produto.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>
            <div className={`lp3-reveal ${produto.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 64 }}>
              <Pill label="O que o IncluiAI gera" />
              <h2 style={{ fontSize: 'clamp(26px,4vw,46px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.04em', lineHeight: 1.08, marginBottom: 14 }}>
                Documentos que levam horas.<br />Prontos em minutos.
              </h2>
              <p style={{ fontSize: 17, color: T.textSec, maxWidth: 500, margin: '0 auto' }}>
                Padrão técnico, dados do aluno, assinatura digital — em cada documento.
              </p>
            </div>

            <div className="lp3-three-col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              {[
                { icon: FileText,      delay: 'lp3-rd1', featured: true,  badgeColor: T.orange, badge: 'Documento completo',
                  title: 'Protocolo de Aprendizagem',
                  desc: 'Atividade adaptada + guia do professor + adaptação individual. O documento pedagógico mais completo da plataforma.',
                  tags: ['Folha do aluno', 'Guia pedagógico', 'Adaptação individual'] },
                { icon: ClipboardList, delay: 'lp3-rd2', featured: false, badgeColor: null, badge: null,
                  title: 'PEI · PAEE · PDI',
                  desc: 'Planos educacionais com metas SMART, critérios observáveis, histórico do aluno e assinatura digital SHA-256.',
                  tags: ['3 tipos de plano', 'Metas observáveis', 'Assinatura digital'] },
                { icon: Search,        delay: 'lp3-rd3', featured: false, badgeColor: null, badge: null,
                  title: 'Estudo de Caso',
                  desc: 'Análise pedagógica completa — histórico, diagnóstico, evolução, família e parecer técnico. Documento auditável.',
                  tags: ['Análise completa', 'Parecer técnico', 'LGPD conforme'] },
              ].map(card => {
                const Icon = card.icon;
                return (
                  <div key={card.title} className={`lp3-product-card${card.featured ? ' featured' : ''} lp3-reveal ${card.delay} ${produto.visible ? 'on' : ''}`}>
                    {card.badge && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: T.orangeLt, color: T.orangeDk, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 12px', borderRadius: 100, marginBottom: 16, border: `1px solid rgba(224,123,42,0.20)` }}>
                        {card.badge}
                      </div>
                    )}
                    <div style={{ width: 56, height: 56, background: T.blueLt, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18, border: `1.5px solid rgba(31,78,95,0.12)` }}>
                      <Icon size={26} color={T.blue} aria-hidden="true" />
                    </div>
                    <h3 style={{ fontSize: 19, fontWeight: 800, color: T.ink, marginBottom: 10, lineHeight: 1.25 }}>{card.title}</h3>
                    <p style={{ fontSize: 14, color: T.textSec, lineHeight: 1.75, marginBottom: 20 }}>{card.desc}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {card.tags.map(t => (
                        <span key={t} style={{ fontSize: 11, fontWeight: 600, color: T.blue, background: T.blueLt, border: `1px solid rgba(31,78,95,0.15)`, padding: '4px 10px', borderRadius: 100 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={`lp3-reveal lp3-rd4 ${produto.visible ? 'on' : ''}`} style={{
              marginTop: 28, background: T.white, border: `1.5px solid ${T.border}`, borderRadius: 16, padding: '24px 32px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20,
            }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 3 }}>Tudo isso, em menos de 2 minutos.</p>
                <p style={{ fontSize: 14, color: T.textSec }}>Sem instalação. Sem curva de aprendizado. Acesse hoje.</p>
              </div>
              <button onClick={() => scrollTo('pricing')} className="lp3-btn-orange" style={{ fontSize: 15 }}>
                Ver planos <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        {/* ══════════ DEMONSTRAÇÃO ══════════ */}
        <section style={{ background: T.white, padding: '96px 0', overflow: 'hidden' }}>
          <div ref={proto.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>
            <div className="lp3-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'center' }}>
              <div className={`lp3-reveal ${proto.visible ? 'on' : ''}`}>
                <Pill label="Protocolo de Aprendizagem" />
                <h2 style={{ fontSize: 'clamp(24px,3.6vw,42px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 18 }}>
                  O documento que nenhuma<br />ferramenta genérica entrega.
                </h2>
                <p style={{ fontSize: 16, color: T.textSec, lineHeight: 1.78, marginBottom: 32 }}>
                  Não é uma atividade isolada. É um pacote pedagógico completo — gerado com os dados reais do seu aluno.
                </p>
                {[
                  { icon: FileText,   title: 'Folha do aluno',       desc: 'Atividade adaptada com objetivos BNCC, linguagem acessível e exercícios individualizados. Pronta para imprimir.' },
                  { icon: BookOpen,   title: 'Guia do professor',    desc: 'Orientações pedagógicas para mediar cada exercício com esse aluno específico. Sem precisar improvisar.' },
                  { icon: Target,     title: 'Adaptação individual', desc: 'Baseada no diagnóstico, perfil cognitivo e nível de suporte necessário. Não é genérico — é desse aluno.' },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} style={{ display: 'flex', gap: 16, marginBottom: 22 }}>
                      <div style={{ width: 44, height: 44, background: T.blueLt, border: `1.5px solid rgba(31,78,95,0.15)`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={20} color={T.blue} aria-hidden="true" />
                      </div>
                      <div>
                        <p style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{item.title}</p>
                        <p style={{ fontSize: 14, color: T.textSec, lineHeight: 1.65 }}>{item.desc}</p>
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => scrollTo('pricing')} className="lp3-btn-orange" style={{ marginTop: 8 }}>
                  Ver planos <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>

              <div className={`lp3-reveal lp3-rd2 ${proto.visible ? 'on' : ''}`} style={{ borderRadius: 20, overflow: 'hidden', boxShadow: '0 32px 80px rgba(31,78,95,0.14)', border: `1px solid ${T.border}` }}>
                <ActivityMockup />
              </div>
            </div>
          </div>
        </section>

        {/* ══════════ DIFERENCIAIS ══════════ */}
        <section id="diferenciais" style={{ background: T.surface, padding: '96px 0' }}>
          <div ref={difer.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>
            <div className={`lp3-reveal ${difer.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 56 }}>
              <Pill label="Por que IncluiAI" />
              <h2 style={{ fontSize: 'clamp(26px,4vw,48px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.04em', lineHeight: 1.08, marginBottom: 16 }}>
                Não é um gerador de texto.<br />
                <span style={{ color: T.blue }}>É um sistema de inteligência pedagógica.</span>
              </h2>
              <p style={{ fontSize: 17, color: T.textSec, maxWidth: 560, margin: '0 auto', lineHeight: 1.72 }}>
                Qualquer IA gera texto. O IncluiAI entende que cada aluno tem histórico, diagnóstico, família e trajetória — e gera documentos que refletem isso.
              </p>
            </div>

            <div className="lp3-four-col" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
              {[
                { icon: BookOpen, delay: 'lp3-rd1', color: T.blue,   colorLt: T.blueLt,   title: 'Continuidade do aluno',    desc: 'O IncluiAI lembra de cada aluno. O próximo professor encontra o histórico completo — e continua de onde você parou.' },
                { icon: Database, delay: 'lp3-rd2', color: T.green,  colorLt: T.greenLt,  title: 'Dados organizados',        desc: 'Laudos, fichas, atividades e atendimentos em um só lugar. Com histórico real, pesquisável e sempre acessível.' },
                { icon: Award,    delay: 'lp3-rd3', color: T.orange, colorLt: T.orangeLt, title: 'Padrão profissional',       desc: 'SHA-256, assinatura digital, conformidade LGPD. Todos os documentos com o mesmo nível técnico, sempre.' },
                { icon: Shield,   delay: 'lp3-rd4', color: T.blue,   colorLt: T.blueLt,   title: 'Segurança pedagógica',     desc: 'Você não precisa saber gerar um PEI de cabeça. O IncluiAI garante a qualidade técnica do documento.' },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className={`lp3-card lp3-reveal ${item.delay} ${difer.visible ? 'on' : ''}`}>
                    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                      <div style={{ width: 52, height: 52, background: item.colorLt, border: `1.5px solid ${item.color}22`, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={24} color={item.color} aria-hidden="true" />
                      </div>
                      <div>
                        <h3 style={{ fontSize: 17, fontWeight: 800, color: T.ink, marginBottom: 8, lineHeight: 1.3 }}>{item.title}</h3>
                        <p style={{ fontSize: 14, color: T.textSec, lineHeight: 1.72 }}>{item.desc}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Stats strip */}
            <div className={`lp3-reveal lp3-rd4 lp3-stats-strip ${difer.visible ? 'on' : ''}`} style={{
              marginTop: 48, background: T.blue, borderRadius: 18, padding: '36px 40px',
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, textAlign: 'center',
            }}>
              {[
                { val: '+1.800', label: 'Profissionais ativos',   icon: Users },
                { val: '+12.000', label: 'Documentos gerados',    icon: FileText },
                { val: '< 2 min', label: 'Por protocolo',         icon: Clock },
                { val: '100%',    label: 'LGPD conforme',          icon: ShieldCheck },
              ].map(stat => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label}>
                    <Icon size={20} color="rgba(255,255,255,0.45)" style={{ margin: '0 auto 8px', display: 'block' }} aria-hidden="true" />
                    <div style={{ fontSize: 28, fontWeight: 900, color: 'white', letterSpacing: '-0.04em', lineHeight: 1 }}>{stat.val}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', marginTop: 6, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══════════ COMO FUNCIONA ══════════ */}
        <section id="como-funciona" style={{ background: T.white, padding: '96px 0' }}>
          <div ref={como.ref} style={{ maxWidth: 900, margin: '0 auto', padding: '0 28px' }}>
            <div className={`lp3-reveal ${como.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 64 }}>
              <Pill label="Como funciona" />
              <h2 style={{ fontSize: 'clamp(26px,3.8vw,42px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 14 }}>
                Três passos. Menos de dois minutos.
              </h2>
              <p style={{ fontSize: 17, color: T.textSec, maxWidth: 480, margin: '0 auto' }}>
                Sem curva de aprendizado. Sem instalação. Funciona no navegador.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {[
                { step: '1', icon: UserPlus, delay: 'lp3-rd1', title: 'Cadastre o aluno', desc: 'Preencha os dados do aluno: informações básicas, diagnóstico, perfil cognitivo e histórico de atendimentos. Tudo em um lugar, acessível a qualquer momento.' },
                { step: '2', icon: ClipboardList, delay: 'lp3-rd2', title: 'Escolha o documento', desc: 'Selecione o tipo de documento: PEI, PAEE, PDI, Protocolo de Aprendizagem ou Estudo de Caso. A IA usa os dados reais do aluno para gerar o documento.' },
                { step: '3', icon: Download, delay: 'lp3-rd3', title: 'Baixe o PDF pronto', desc: 'Em menos de 2 minutos, o documento está pronto — com padrão técnico, assinatura digital SHA-256, conformidade LGPD e pronto para imprimir.' },
              ].map(step => {
                const Icon = step.icon;
                return (
                  <div key={step.step} className={`lp3-reveal ${step.delay} ${como.visible ? 'on' : ''}`} style={{
                    display: 'flex', gap: 24, alignItems: 'flex-start',
                    background: T.surface, border: `1.5px solid ${T.border}`, borderRadius: 16, padding: '28px 28px',
                    boxShadow: '0 4px 16px rgba(15,42,61,0.05)',
                  }}>
                    <div style={{ width: 52, height: 52, background: T.orange, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={24} color="white" aria-hidden="true" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.10em' }}>Passo {step.step}</span>
                      </div>
                      <h3 style={{ fontSize: 18, fontWeight: 800, color: T.ink, marginBottom: 8 }}>{step.title}</h3>
                      <p style={{ fontSize: 14, color: T.textSec, lineHeight: 1.72, margin: 0 }}>{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══════════ CRÉDITOS ══════════ */}
        <section style={{ background: T.surface, padding: '88px 0' }}>
          <div ref={creditos.ref} style={{ maxWidth: 1000, margin: '0 auto', padding: '0 28px' }}>
            <div className={`lp3-reveal ${creditos.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 56 }}>
              <Pill label="Créditos de IA" color="green" />
              <h2 style={{ fontSize: 'clamp(24px,3.8vw,40px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 14 }}>
                Simples, transparente, sem surpresa.
              </h2>
              <p style={{ fontSize: 17, color: T.textSec, maxWidth: 500, margin: '0 auto', lineHeight: 1.7 }}>
                Créditos são a unidade de uso da IA. Cada plano inclui uma cota mensal renovada automaticamente.
              </p>
            </div>

            <div className="lp3-three-col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 40 }}>
              {[
                { icon: FileText, delay: 'lp3-rd1', color: T.blue,   colorLt: T.blueLt,   title: 'Documentos de texto',    desc: 'PEI, PAEE, PDI, Protocolo de Aprendizagem — entre 10 e 40 créditos por geração.' },
                { icon: Image,    delay: 'lp3-rd2', color: T.orange, colorLt: T.orangeLt, title: 'Documentos com imagem',  desc: 'Quando a atividade inclui imagem gerada por IA, o consumo é de 30 a 50 créditos.' },
                { icon: Package,  delay: 'lp3-rd3', color: T.green,  colorLt: T.greenLt,  title: 'Pacotes avulsos',        desc: 'Precisa de mais? Compre créditos adicionais a qualquer momento, sem trocar de plano.' },
              ].map(card => {
                const Icon = card.icon;
                return (
                  <div key={card.title} className={`lp3-card lp3-reveal ${card.delay} ${creditos.visible ? 'on' : ''}`} style={{ textAlign: 'center' }}>
                    <div style={{ width: 52, height: 52, background: card.colorLt, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: `1.5px solid ${card.color}22` }}>
                      <Icon size={24} color={card.color} aria-hidden="true" />
                    </div>
                    <h3 style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 8 }}>{card.title}</h3>
                    <p style={{ fontSize: 13, color: T.textSec, lineHeight: 1.65 }}>{card.desc}</p>
                  </div>
                );
              })}
            </div>

            {/* Tabela — 2 planos */}
            <div className={`lp3-reveal lp3-rd4 ${creditos.visible ? 'on' : ''}`} style={{ background: T.white, border: `1.5px solid ${T.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 10px 30px rgba(15,42,61,0.07)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: T.blue, padding: '14px 28px' }}>
                {['Plano', 'Créditos / mês', 'Alunos'].map(h => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>{h}</span>
                ))}
              </div>
              {[
                { plan: 'PRO',     credits: '500 créditos', students: 'Até 30 alunos',  color: T.orange },
                { plan: 'Premium', credits: '700 créditos', students: 'Ilimitados',      color: T.blue },
              ].map((row, i) => (
                <div key={row.plan} style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                  padding: '16px 28px',
                  background: i % 2 === 0 ? T.white : T.surface,
                  borderBottom: i < 1 ? `1px solid ${T.border}` : 'none',
                }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: row.color }}>{row.plan}</span>
                  <span style={{ fontSize: 14, color: T.ink, fontWeight: 600 }}>{row.credits}</span>
                  <span style={{ fontSize: 14, color: T.textSec }}>{row.students}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════ PLANOS ══════════ */}
        <PricingSection onLogin={onLogin} onRegister={onRegister} onUpgradeClick={onUpgradeClick} />

        {/* ══════════ FAQ ══════════ */}
        {faqItems.length > 0 && (
          <section style={{ background: T.surface, padding: '88px 0 80px' }}>
            <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 28px' }}>
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <h2 style={{ fontSize: 'clamp(22px,3.5vw,36px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 10 }}>
                  {faqTitle}
                </h2>
                <p style={{ fontSize: 16, color: T.textSec }}>Tem dúvida? A resposta provavelmente está aqui.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {faqItems.map((item, i) => (
                  <div key={i} style={{
                    background: T.white, border: `1.5px solid ${faqOpen === i ? T.blue : T.border}`,
                    borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.2s',
                    boxShadow: faqOpen === i ? `0 4px 16px rgba(31,78,95,0.08)` : 'none',
                  }}>
                    <button
                      onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                      aria-expanded={faqOpen === i}
                      style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', minHeight: 64 }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 700, color: T.ink, lineHeight: 1.4 }}>{item.q}</span>
                      <span style={{ flexShrink: 0, marginLeft: 16, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: faqOpen === i ? T.blue : T.surface, borderRadius: '50%', transition: 'background 0.2s' }} aria-hidden="true">
                        {faqOpen === i ? <ChevronUp size={14} color="white" /> : <ChevronDown size={14} color={T.textSec} />}
                      </span>
                    </button>
                    {faqOpen === i && (
                      <div style={{ padding: '0 24px 20px', fontSize: 14, color: T.textSec, lineHeight: 1.75 }}>
                        {item.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'center', marginTop: 40 }}>
                <p style={{ fontSize: 14, color: T.textSec, marginBottom: 12 }}>Ainda tem dúvida?</p>
                <button onClick={() => scrollTo('pricing')} className="lp3-btn-blue" style={{ fontSize: 14 }}>
                  Ver planos e preços
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ══════════ CTA FINAL ══════════ */}
        <section style={{ background: T.blue, padding: '104px 0', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} aria-hidden="true" />
          <div style={{ position: 'absolute', bottom: -60, left: -80, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.02)', pointerEvents: 'none' }} aria-hidden="true" />

          <div ref={cta.ref} style={{ maxWidth: 680, margin: '0 auto', padding: '0 28px', textAlign: 'center' }}>
            <div className={`lp3-reveal ${cta.visible ? 'on' : ''}`}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)', padding: '7px 20px', borderRadius: 100, marginBottom: 32 }}>
                <CheckCircle size={13} color={T.green} aria-hidden="true" />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.90)' }}>
                  Pagamento seguro · Suporte incluído · LGPD conforme
                </span>
              </div>

              <h2 style={{ fontSize: 'clamp(28px,4.5vw,52px)', fontWeight: 800, color: 'white', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 20 }}>
                Organize sua documentação<br />
                <span style={{ color: T.orange }}>pedagógica de uma vez.</span>
              </h2>

              <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.65)', lineHeight: 1.72, maxWidth: 480, margin: '0 auto 48px' }}>
                Documentação profissional gerada em minutos. Histórico centralizado. Padrão técnico garantido.
              </p>

              <div className="lp3-cta-group" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
                <button onClick={() => scrollTo('pricing')} className="lp3-btn-orange" style={{ fontSize: 17, padding: '16px 36px' }}>
                  Escolher meu plano <ArrowRight size={18} aria-hidden="true" />
                </button>
                <button onClick={() => scrollTo('como-funciona')} className="lp3-btn-ghost">
                  Ver como funciona
                </button>
              </div>

              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.40)' }}>
                Planos PRO e Premium · Sem taxa de instalação · Cancele quando quiser no mensal
              </p>
            </div>
          </div>
        </section>

      </main>

      {/* ══════════ FOOTER ══════════ */}
      <footer style={{ background: T.ink, borderTop: '1px solid rgba(255,255,255,0.06)', padding: '44px 0' }} role="contentinfo">
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>
          <div className="lp3-footer-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 28 }}>
            <BrandLogo fontSize={16} iconSize={16} theme="dark" />
            <nav className="lp3-footer-links" style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }} aria-label="Links do rodapé">
              <button onClick={onAudit} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#CBD5E1')}
                onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}
              >
                <ShieldCheck size={13} aria-hidden="true" /> Validar Documento
              </button>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94A3B8' }}>
                <Phone size={13} aria-hidden="true" /> {config?.contactPhone || '(99) 98416-7490'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94A3B8' }}>
                <Lock size={13} aria-hidden="true" /> LGPD Conforme
              </span>
            </nav>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <p style={{ fontSize: 12, color: '#475569' }}>© 2026 IncluiAI. Todos os direitos reservados.</p>
            <p style={{ fontSize: 12, color: '#475569' }}>Decreto nº 12.686/2025 · IA aplicada à Educação Inclusiva</p>
          </div>
        </div>
      </footer>

    </div>
  );
};
