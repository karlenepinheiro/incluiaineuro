import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck, ArrowRight,
  Lock, Phone, Menu, X,
  Clock, Users, CheckCircle,
  BookOpen, Award,
  ChevronDown, ChevronUp,
  GraduationCap, Brain,
  FolderOpen, AlertCircle,
  Search, Zap, Rocket, Eye,
  HeartHandshake, Building2,
  UserPlus, ClipboardList, Download,
  Layers, MessageCircle, FileText,
} from 'lucide-react';
import { SiteConfig } from '../types';
import { AdminService } from '../services/adminService';
import { LandingService } from '../services/landingService';
import { waUrl } from '../config/contact';
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
    text-decoration: none;
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

  /* ── Mockup transparente (bloco de demonstração) ── */
  .lp3-demo-glow {
    position: absolute;
    inset: -10% -20%;
    background: radial-gradient(closest-side, rgba(31,78,95,0.10), transparent 70%);
    border-radius: 50%;
    z-index: 0;
    pointer-events: none;
  }
  .lp3-demo-img {
    position: relative;
    z-index: 1;
    display: block;
    width: 100%;
    max-width: 520px;
    object-fit: contain;
    filter: drop-shadow(0 30px 50px rgba(31,78,95,0.20));
  }
  @media (max-width: 640px) {
    .lp3-demo-img { max-width: 360px; }
  }

  /* ── Bloco de dor grid ── */
  .lp3-pain-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }

  /* ── Benefícios grid ── */
  .lp3-benef-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }

  /* ── Solução checklist grid ── */
  .lp3-solucao-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  /* ── Para quem é grid (7 itens) ── */
  .lp3-quem-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }

  /* ── Responsive ── */
  @media (max-width: 1024px) {
    .lp3-desktop-nav { display: none !important; }
    .lp3-hamburger   { display: flex !important; }
    .lp3-two-col     { grid-template-columns: 1fr !important; gap: 40px !important; }
    .lp3-benef-grid  { grid-template-columns: 1fr 1fr !important; }
    .lp3-quem-grid   { grid-template-columns: 1fr 1fr !important; }
  }
  @media (max-width: 640px) {
    .lp3-pain-grid     { grid-template-columns: 1fr !important; }
    .lp3-benef-grid    { grid-template-columns: 1fr !important; }
    .lp3-solucao-grid  { grid-template-columns: 1fr !important; }
    .lp3-quem-grid     { grid-template-columns: 1fr !important; }
    .lp3-cta-group     { flex-direction: column !important; }
    .lp3-cta-group > * { width: 100% !important; justify-content: center !important; }
    .lp3-footer-row    { flex-direction: column !important; align-items: flex-start !important; gap: 16px !important; }
    .lp3-footer-links  { flex-direction: column !important; gap: 12px !important; }
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
    .lp3-btn-orange, .lp3-btn-blue, .lp3-btn-ghost, .lp3-card { transition: none !important; }
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

  const dor      = useReveal<HTMLDivElement>();
  const solucao  = useReveal<HTMLDivElement>();
  const demo     = useReveal<HTMLDivElement>();
  const benef    = useReveal<HTMLDivElement>();
  const quemE    = useReveal<HTMLDivElement>();
  const cta      = useReveal<HTMLDivElement>();

  const painPoints = [
    { icon: Clock, delay: 'lp3-rd1', title: 'Horas perdidas refazendo documentos',
      desc: 'A cada novo atendimento, você parte do zero. Sem template, sem histórico, sem continuidade. Horas formatando PEI em Word enquanto o aluno espera.' },
    { icon: FolderOpen, delay: 'lp3-rd2', title: 'Cada profissional trabalha de um jeito',
      desc: 'Falta de padrão entre a equipe. Cada professora tem seu modelo, sua pasta, sua forma. Sem organização compartilhada, o acompanhamento fica fragmentado.' },
    { icon: AlertCircle, delay: 'lp3-rd3', title: 'A burocracia toma o tempo do pedagógico',
      desc: 'O tempo que deveria ir para o aluno vai para papelada. Para formulários, para registros manuais, para documentação feita sob pressão no último dia.' },
    { icon: FileText, delay: 'lp3-rd4', title: 'O histórico do aluno se perde',
      desc: 'Ao mudar de professor ou ano letivo, tudo recomeça. O histórico do aluno — suas conquistas, dificuldades, diagnósticos — some junto com quem saiu.' },
  ];

  const solutionBullets = [
    { icon: Zap,            text: 'Gere documentos com mais rapidez' },
    { icon: FolderOpen,     text: 'Organize informações em um único sistema' },
    { icon: Eye,            text: 'Acompanhe alunos com mais clareza' },
    { icon: ClipboardList,  text: 'Tenha apoio para PEI, PDI, estudo de caso e AEE' },
    { icon: Clock,          text: 'Reduza o tempo gasto com tarefas repetitivas' },
  ];

  const howItWorks = [
    { step: '1', icon: UserPlus,      title: 'Cadastre o aluno', desc: 'Dados básicos, diagnóstico, perfil cognitivo e histórico — tudo em um lugar só.' },
    { step: '2', icon: ClipboardList, title: 'Escolha o documento', desc: 'PEI, PAEE, PDI, Protocolo de Aprendizagem ou Estudo de Caso, gerado com os dados reais do aluno.' },
    { step: '3', icon: Download,      title: 'Baixe o PDF pronto', desc: 'Padrão técnico, assinatura digital SHA-256 e conformidade LGPD, pronto para imprimir.' },
  ];

  const benefits = [
    { icon: Zap,            color: T.orange, colorLt: T.orangeLt, title: 'Mais rapidez',           desc: 'Documentos prontos em minutos, não em horas.' },
    { icon: FolderOpen,     color: T.blue,   colorLt: T.blueLt,   title: 'Mais organização',        desc: 'Tudo centralizado, sem pastas soltas ou arquivos perdidos.' },
    { icon: Eye,            color: T.blue,   colorLt: T.blueLt,   title: 'Mais clareza',             desc: 'Histórico do aluno acessível e fácil de entender.' },
    { icon: Rocket,         color: T.orange, colorLt: T.orangeLt, title: 'Mais produtividade',       desc: 'Menos tempo na tela, mais tempo com quem importa.' },
    { icon: HeartHandshake, color: T.green,  colorLt: T.greenLt,  title: 'Mais apoio à inclusão',    desc: 'Suporte técnico para PEI, PDI, AEE e estudos de caso.' },
    { icon: Award,          color: T.green,  colorLt: T.greenLt,  title: 'Mais profissionalismo',    desc: 'Documentos padronizados, assinados digitalmente e auditáveis.' },
  ];

  const audiences = [
    { icon: BookOpen,       title: 'Professores',                desc: 'Registro e acompanhamento do aluno incluído' },
    { icon: GraduationCap,  title: 'Professores do AEE',          desc: 'PEI, PAEE, PDI e estudo de caso completos' },
    { icon: Layers,         title: 'Coordenadores pedagógicos',   desc: 'Padronização e continuidade entre professores' },
    { icon: Brain,          title: 'Psicopedagogos',              desc: 'Perfil cognitivo e análise pedagógica' },
    { icon: Building2,      title: 'Clínicas educacionais',       desc: 'Gestão de múltiplos alunos e profissionais' },
    { icon: Users,          title: 'Equipes escolares',           desc: 'Visão organizada de toda a documentação' },
    { icon: HeartHandshake, title: 'Profissionais da inclusão',   desc: 'Apoio técnico em cada etapa do processo' },
  ];

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
          <button onClick={() => scrollTo('como-funciona')} className="lp3-mobile-item">Como funciona</button>
          <button onClick={() => scrollTo('pricing')}       className="lp3-mobile-item">Ver planos</button>
          <button onClick={() => { setMenuOpen(false); onAudit(); }} className="lp3-mobile-item">Validar Documento</button>
          <button onClick={() => { setMenuOpen(false); onLogin(); }} className="lp3-mobile-item" style={{ color: T.blue, fontWeight: 700 }}>Entrar</button>
        </nav>
      </header>

      <main id="main-content">

        {/* ══════════ HERO + FAIXA EM MOVIMENTO ══════════ */}
        <Hero onRegister={onRegister} />

        {/* ══════════ BLOCO DE DOR ══════════ */}
        <section style={{ background: T.surface, padding: '96px 0' }}>
          <div ref={dor.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>
            <div className="lp3-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center', marginBottom: 64 }}>
              <div className={`lp3-reveal ${dor.visible ? 'on' : ''}`}>
                <Pill label="A realidade de quem faz AEE" color="orange" />
                <h2 style={{ fontSize: 'clamp(26px,4vw,44px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 18 }}>
                  Sua rotina já é puxada demais para continuar fazendo tudo manualmente.
                </h2>
                <p style={{ fontSize: 16, color: T.textSec, lineHeight: 1.75 }}>
                  Entre atendimentos, reuniões e turmas cheias, ainda sobra a papelada: documentos refeitos do zero,
                  retrabalho constante e informação espalhada em pastas diferentes. O resultado é menos tempo disponível
                  para o que realmente importa — o acompanhamento do aluno.
                </p>
              </div>
              <div className={`lp3-reveal lp3-rd2 ${dor.visible ? 'on' : ''}`} style={{ position: 'relative', height: 320 }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: 380, height: '100%', margin: '0 auto' }}>
                  {[
                    { label: 'PEI',              top: 6,   left: 24,  rotate: -8, color: T.blue,   icon: FileText },
                    { label: 'PAEE',             top: 74,  left: 132, rotate: 5,  color: T.orange, icon: ClipboardList },
                    { label: 'Estudo de Caso',   top: 156, left: 6,   rotate: -4, color: T.green,  icon: Search },
                  ].map(doc => {
                    const Icon = doc.icon;
                    return (
                      <div key={doc.label} style={{
                        position: 'absolute', top: doc.top, left: doc.left, width: 220,
                        background: T.white, borderRadius: 14, padding: '16px 18px',
                        border: `1.5px solid ${T.border}`, boxShadow: '0 16px 32px rgba(15,42,61,0.10)',
                        transform: `rotate(${doc.rotate}deg)`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, background: `${doc.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon size={15} color={doc.color} aria-hidden="true" />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 800, color: T.ink, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{doc.label}</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: T.border, marginBottom: 6, width: '90%' }} />
                        <div style={{ height: 6, borderRadius: 3, background: T.border, marginBottom: 6, width: '70%' }} />
                        <div style={{ height: 6, borderRadius: 3, background: T.border, width: '50%' }} />
                      </div>
                    );
                  })}
                  <div aria-hidden="true" style={{
                    position: 'absolute', top: 0, right: 6, background: T.orange, color: 'white', borderRadius: '50%',
                    width: 64, height: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 10px 26px rgba(224,123,42,0.35)',
                  }}>
                    <Clock size={20} aria-hidden="true" />
                    <span style={{ fontSize: 9, fontWeight: 800, marginTop: 2 }}>tarde</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lp3-pain-grid">
              {painPoints.map(card => {
                const Icon = card.icon;
                return (
                  <div key={card.title} className={`lp3-card lp3-reveal ${card.delay} ${dor.visible ? 'on' : ''}`}>
                    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                      <div style={{ width: 52, height: 52, borderRadius: 14, background: T.orangeLt, border: `1.5px solid ${T.orange}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={24} color={T.orange} aria-hidden="true" />
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

        {/* ══════════ BLOCO DE SOLUÇÃO ══════════ */}
        <section style={{ background: T.white, padding: '96px 0' }}>
          <div ref={solucao.ref} style={{ maxWidth: 900, margin: '0 auto', padding: '0 28px' }}>
            <div className={`lp3-reveal ${solucao.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 52 }}>
              <Pill label="A solução" color="blue" />
              <h2 style={{ fontSize: 'clamp(26px,3.8vw,42px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.04em', lineHeight: 1.15, marginBottom: 14 }}>
                O IncluiAI transforma documentação em um processo mais rápido, organizado e inteligente.
              </h2>
            </div>

            <div className="lp3-solucao-grid">
              {solutionBullets.map((b, i) => {
                const Icon = b.icon;
                const delay = ['lp3-rd1', 'lp3-rd2', 'lp3-rd3', 'lp3-rd4', 'lp3-rd5'][i % 5];
                return (
                  <div key={b.text} className={`lp3-reveal ${delay} ${solucao.visible ? 'on' : ''}`} style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    background: T.surface, border: `1.5px solid ${T.border}`, borderRadius: 14, padding: '18px 22px',
                  }}>
                    <div style={{ width: 42, height: 42, borderRadius: 11, background: T.greenLt, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={20} color={T.green} aria-hidden="true" />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: T.ink, lineHeight: 1.4 }}>{b.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══════════ BLOCO DE DEMONSTRAÇÃO + COMO FUNCIONA ══════════ */}
        <section id="como-funciona" style={{ background: T.surface, padding: '96px 0' }}>
          <div ref={demo.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>
            <div className="lp3-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
              <div className={`lp3-reveal ${demo.visible ? 'on' : ''}`}>
                <Pill label="Como funciona" />
                <h2 style={{ fontSize: 'clamp(24px,3.6vw,42px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.04em', lineHeight: 1.15, marginBottom: 16 }}>
                  Veja na prática o que o IncluiAI pode fazer por você.
                </h2>
                <p style={{ fontSize: 16, color: T.textSec, lineHeight: 1.75, marginBottom: 32 }}>
                  Do papel espalhado ao histórico centralizado: mais organização, análise e apoio pedagógico em um
                  único lugar, com documentos prontos para imprimir ou compartilhar em minutos.
                </p>

                {howItWorks.map(step => {
                  const Icon = step.icon;
                  return (
                    <div key={step.step} style={{ display: 'flex', gap: 16, marginBottom: 22 }}>
                      <div style={{ width: 44, height: 44, background: T.orange, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={20} color="white" aria-hidden="true" />
                      </div>
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Passo {step.step}</p>
                        <p style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{step.title}</p>
                        <p style={{ fontSize: 14, color: T.textSec, lineHeight: 1.6 }}>{step.desc}</p>
                      </div>
                    </div>
                  );
                })}

                <button onClick={() => scrollTo('pricing')} className="lp3-btn-orange" style={{ marginTop: 8 }}>
                  Ver planos <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>

              <div className={`lp3-reveal lp3-rd2 ${demo.visible ? 'on' : ''}`} style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <div className="lp3-demo-glow" aria-hidden="true" />
                <img
                  className="lp3-demo-img"
                  src="/images/antes-depois-incluiai.png"
                  alt="Tablet exibindo o Estudo de Caso Pedagógico do IncluiAI, com painel de desempenho e evolução do aluno"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ══════════ BLOCO DE BENEFÍCIOS ══════════ */}
        <section style={{ background: T.white, padding: '96px 0' }}>
          <div ref={benef.ref} style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>
            <div className={`lp3-reveal ${benef.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 56 }}>
              <Pill label="Benefícios" color="green" />
              <h2 style={{ fontSize: 'clamp(26px,3.8vw,42px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 14 }}>
                Resultados que você sente na rotina.
              </h2>
              <p style={{ fontSize: 16, color: T.textSec, maxWidth: 540, margin: '0 auto', lineHeight: 1.72 }}>
                Seis motivos pelos quais professores, equipes de AEE e coordenações escolhem o IncluiAI.
              </p>
            </div>

            <div className="lp3-benef-grid">
              {benefits.map((b, i) => {
                const Icon = b.icon;
                const delay = ['lp3-rd1', 'lp3-rd2', 'lp3-rd3', 'lp3-rd4', 'lp3-rd5'][i % 5];
                return (
                  <div key={b.title} className={`lp3-card lp3-reveal ${delay} ${benef.visible ? 'on' : ''}`} style={{ textAlign: 'center' }}>
                    <div style={{ width: 52, height: 52, background: b.colorLt, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: `1.5px solid ${b.color}22` }}>
                      <Icon size={24} color={b.color} aria-hidden="true" />
                    </div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 8 }}>{b.title}</h3>
                    <p style={{ fontSize: 13.5, color: T.textSec, lineHeight: 1.65 }}>{b.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══════════ PARA QUEM É ══════════ */}
        <section id="quem-e" style={{ background: T.surface, padding: '96px 0' }}>
          <div ref={quemE.ref} style={{ maxWidth: 1160, margin: '0 auto', padding: '0 28px' }}>
            <div className={`lp3-reveal ${quemE.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 52 }}>
              <Pill label="Para quem é" />
              <h2 style={{ fontSize: 'clamp(26px,3.8vw,42px)', fontWeight: 800, color: T.ink, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 14 }}>
                Feito para quem faz a inclusão acontecer.
              </h2>
              <p style={{ fontSize: 17, color: T.textSec, maxWidth: 540, margin: '0 auto', lineHeight: 1.72 }}>
                O IncluiAI foi construído para profissionais de educação inclusiva que precisam de documentos
                técnicos, padronizados e auditáveis — não para uso genérico.
              </p>
            </div>

            <div className="lp3-quem-grid">
              {audiences.map((a, i) => {
                const Icon = a.icon;
                const delay = ['lp3-rd1', 'lp3-rd2', 'lp3-rd3', 'lp3-rd4', 'lp3-rd5'][i % 5];
                return (
                  <div key={a.title} className={`lp3-card lp3-reveal ${delay} ${quemE.visible ? 'on' : ''}`} style={{ padding: '24px 20px' }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: T.blueLt, border: `1.5px solid rgba(31,78,95,0.15)`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                      <Icon size={21} color={T.blue} aria-hidden="true" />
                    </div>
                    <h3 style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, marginBottom: 6, lineHeight: 1.3 }}>{a.title}</h3>
                    <p style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.55, margin: 0 }}>{a.desc}</p>
                  </div>
                );
              })}
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

              <h2 style={{ fontSize: 'clamp(28px,4.5vw,50px)', fontWeight: 800, color: 'white', letterSpacing: '-0.04em', lineHeight: 1.15, marginBottom: 20 }}>
                Se você quer parar de perder tempo com papelada,<br />
                <span style={{ color: T.orange }}>o IncluiAI é para você.</span>
              </h2>

              <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.65)', lineHeight: 1.72, maxWidth: 480, margin: '0 auto 48px' }}>
                Transforme sua rotina com uma plataforma que ajuda você a documentar melhor, organizar melhor e
                atender melhor.
              </p>

              <div className="lp3-cta-group" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
                <button onClick={() => scrollTo('pricing')} className="lp3-btn-orange" style={{ fontSize: 17, padding: '16px 36px' }}>
                  Quero assinar agora <ArrowRight size={18} aria-hidden="true" />
                </button>
                <a
                  href={waUrl('Olá! Quero conhecer o IncluiAI.')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lp3-btn-ghost"
                >
                  <MessageCircle size={18} aria-hidden="true" /> Falar no WhatsApp
                </a>
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
              <a
                href={waUrl('Olá! Gostaria de falar com o suporte do IncluiAI.')}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94A3B8', textDecoration: 'none' }}
              >
                <Phone size={13} aria-hidden="true" /> {config?.contactPhone || '(99) 98416-7490'}
              </a>
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