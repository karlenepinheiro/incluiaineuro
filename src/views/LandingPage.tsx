import React, { useState, useEffect, useRef } from 'react';
import {
  Brain, ShieldCheck, FileText, ArrowRight,
  CheckCircle, Lock, Phone,
  Zap, Sparkles, X, AlertTriangle, FolderX,
  BarChart3, Layers,
  BookOpen, MessageSquare, TrendingUp,
  Target, Clock, Trash2,
  Database, PieChart, Cpu, Users, Star, Award,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { SiteConfig } from '../types';
import { AdminService } from '../services/adminService';
import { LandingService } from '../services/landingService';
import { PricingSection } from '../components/PricingSection';

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

// ─── Paleta nova — light, institucional ──────────────────────────────────────
const P = {
  bg:       '#F8FAFC',
  surface:  '#FFFFFF',
  blue:     '#2563EB',
  blueDark: '#1D4ED8',
  blueLight:'#EFF6FF',
  gold:     '#F59E0B',
  goldLight:'#FFFBEB',
  green:    '#22C55E',
  greenDark:'#16A34A',
  greenLight:'#F0FDF4',
  ink:      '#0F172A',
  slate:    '#1E293B',
  muted:    '#64748B',
  subtle:   '#94A3B8',
  border:   '#E2E8F0',
  red:      '#EF4444',
  redLight: '#FEF2F2',
};

// ─── Dashboard mockup SVG ────────────────────────────────────────────────────
const DashboardMockup: React.FC = () => (
  <svg viewBox="0 0 960 548" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto', display: 'block' }}>
    <defs>
      <clipPath id="db-clip"><rect width="960" height="548" rx="14"/></clipPath>
      <linearGradient id="db-area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2563EB" stopOpacity="0.18"/>
        <stop offset="100%" stopColor="#2563EB" stopOpacity="0"/>
      </linearGradient>
    </defs>
    <g clipPath="url(#db-clip)">
      <rect width="960" height="548" fill="#F1F5F9"/>
      <rect width="186" height="548" fill="#1E293B"/>
      <rect x="16" y="14" width="32" height="32" rx="8" fill="#2563EB"/>
      <circle cx="32" cy="30" r="7" fill="none" stroke="#93C5FD" strokeWidth="1.5"/>
      <circle cx="32" cy="30" r="3" fill="#93C5FD"/>
      <text x="58" y="33" fill="#F1F5F9" fontSize="13" fontWeight="700" fontFamily="system-ui" letterSpacing="-0.3">IncluiAI</text>
      <rect x="8" y="62" width="170" height="30" rx="7" fill="#2563EB"/>
      <rect x="20" y="69" width="14" height="14" rx="3" fill="#93C5FD"/>
      <text x="42" y="80" fill="#EFF6FF" fontSize="11" fontWeight="600" fontFamily="system-ui">Dashboard</text>
      {['Triagem', 'Alunos', 'Protocolos', 'IncluiLAB', 'Relatórios', 'Copilot'].map((label, i) => (
        <g key={label}>
          <rect x="20" y={103 + i * 36} width="14" height="14" rx="3" fill="#2A3A4F" opacity="0.9"/>
          <text x="42" y={114 + i * 36} fill="#64748B" fontSize="11" fontFamily="system-ui">{label}</text>
        </g>
      ))}
      <rect x="186" y="0" width="774" height="50" fill="white" opacity="0.98"/>
      <line x1="186" y1="50" x2="960" y2="50" stroke="#E8ECF2" strokeWidth="1"/>
      <text x="204" y="21" fill="#0F172A" fontSize="14" fontWeight="700" fontFamily="system-ui">Visão Geral</text>
      <text x="204" y="37" fill="#94A3B8" fontSize="10" fontFamily="system-ui">Março 2025  ·  Turma Especial A</text>
      <circle cx="934" cy="25" r="13" fill="#2563EB"/>
      <text x="934" y="30" textAnchor="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="system-ui">AP</text>
      <rect x="204" y="62" width="168" height="72" rx="10" fill="white"/>
      <rect x="218" y="74" width="24" height="24" rx="6" fill="#EFF6FF"/>
      <text x="218" y="109" fill="#94A3B8" fontSize="9" fontFamily="system-ui">ALUNOS ATIVOS</text>
      <text x="218" y="100" fill="#0F172A" fontSize="22" fontWeight="800" fontFamily="system-ui">24</text>
      <rect x="382" y="62" width="168" height="72" rx="10" fill="white"/>
      <rect x="396" y="74" width="24" height="24" rx="6" fill="#F0FDF4"/>
      <text x="396" y="109" fill="#94A3B8" fontSize="9" fontFamily="system-ui">CRÉDITOS IA</text>
      <text x="396" y="100" fill="#0F172A" fontSize="22" fontWeight="800" fontFamily="system-ui">472</text>
      <rect x="560" y="62" width="168" height="72" rx="10" fill="white"/>
      <rect x="574" y="74" width="24" height="24" rx="6" fill="#EFF6FF"/>
      <text x="574" y="109" fill="#94A3B8" fontSize="9" fontFamily="system-ui">DOCS GERADOS</text>
      <text x="574" y="100" fill="#0F172A" fontSize="22" fontWeight="800" fontFamily="system-ui">128</text>
      <rect x="738" y="62" width="198" height="72" rx="10" fill="white"/>
      <rect x="752" y="74" width="24" height="24" rx="6" fill="#FFFBEB"/>
      <text x="752" y="109" fill="#94A3B8" fontSize="9" fontFamily="system-ui">ATIVIDADES</text>
      <text x="752" y="100" fill="#0F172A" fontSize="22" fontWeight="800" fontFamily="system-ui">56</text>
      <rect x="204" y="146" width="408" height="224" rx="12" fill="white"/>
      <text x="222" y="167" fill="#0F172A" fontSize="13" fontWeight="700" fontFamily="system-ui">Créditos IA Utilizados</text>
      <text x="594" y="167" fill="#2563EB" fontSize="12" fontWeight="700" fontFamily="system-ui" textAnchor="end">847 total</text>
      {[0,1,2,3].map(i => (
        <line key={i} x1="222" y1={346 - i*44} x2="590" y2={346 - i*44} stroke="#F1F5F9" strokeWidth="1"/>
      ))}
      <path d="M 222,346 L 222,257 L 255,302 L 288,251 L 321,283 L 354,238 L 387,274 L 420,233 L 453,257 L 486,244 L 519,277 L 552,229 L 585,262 L 585,346 Z" fill="url(#db-area)"/>
      <polyline points="222,257 255,302 288,251 321,283 354,238 387,274 420,233 453,257 486,244 519,277 552,229 585,262" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx="585" cy="262" r="4" fill="#2563EB"/>
      <circle cx="585" cy="262" r="7" fill="#2563EB" opacity="0.15"/>
      <rect x="622" y="146" width="316" height="224" rx="12" fill="white"/>
      <text x="640" y="167" fill="#0F172A" fontSize="13" fontWeight="700" fontFamily="system-ui">Alunos Recentes</text>
      {[
        { initials:'TM', name:'Tomás M.',   tag:'TEA',      tc:'#2563EB', tb:'#EFF6FF', y:184 },
        { initials:'LF', name:'Laura F.',   tag:'TDAH',     tc:'#0A9396', tb:'#ECFAFA', y:222 },
        { initials:'RG', name:'Rafael G.',  tag:'DI',       tc:'#7C3AED', tb:'#F5F3FF', y:260 },
        { initials:'MC', name:'Maria C.',   tag:'Dislexia', tc:'#B45309', tb:'#FEF3C7', y:298 },
      ].map(s => (
        <g key={s.name}>
          <circle cx="654" cy={s.y+14} r="12" fill="#EFF6FF"/>
          <text x="654" y={s.y+19} textAnchor="middle" fill="#2563EB" fontSize="9" fontWeight="700" fontFamily="system-ui">{s.initials}</text>
          <text x="674" y={s.y+13} fill="#0F172A" fontSize="11" fontWeight="600" fontFamily="system-ui">{s.name}</text>
          <rect x={920 - s.tag.length*7 - 12} y={s.y+6} width={s.tag.length*7+12} height="16" rx="4" fill={s.tb}/>
          <text x={920 - s.tag.length*3.5} y={s.y+17} textAnchor="middle" fill={s.tc} fontSize="9" fontWeight="700" fontFamily="system-ui">{s.tag}</text>
        </g>
      ))}
      <rect x="204" y="380" width="296" height="148" rx="12" fill="white"/>
      <text x="222" y="401" fill="#0F172A" fontSize="13" fontWeight="700" fontFamily="system-ui">Protocolos</text>
      {[
        { label:'PEI — Tomás M.',    status:'Aprovado', sc:'#16A34A', sb:'#F0FDF4' },
        { label:'PAEE — Laura F.',   status:'Rascunho', sc:'#F59E0B', sb:'#FEF3C7' },
        { label:'PDI — Rafael G.',   status:'Revisão',  sc:'#2563EB', sb:'#EFF6FF' },
      ].map((item, i) => (
        <g key={item.label}>
          <text x="222" y={421 + i*38} fill="#374151" fontSize="11" fontFamily="system-ui">{item.label}</text>
          <rect x={472} y={409 + i*38} width={item.status.length*7+12} height="16" rx="4" fill={item.sb}/>
          <text x={472 + (item.status.length*7+12)/2} y={420 + i*38} textAnchor="middle" fill={item.sc} fontSize="9" fontWeight="700" fontFamily="system-ui">{item.status}</text>
        </g>
      ))}
      <rect x="510" y="380" width="428" height="148" rx="12" fill="#EFF6FF"/>
      <text x="528" y="401" fill="#1D4ED8" fontSize="13" fontWeight="700" fontFamily="system-ui">Copilot Pedagógico</text>
      <rect x="528" y="436" width="392" height="50" rx="8" fill="white"/>
      <text x="542" y="455" fill="#64748B" fontSize="11" fontFamily="system-ui">"Considere adaptar a atividade de leitura com pictogramas</text>
      <text x="542" y="471" fill="#64748B" fontSize="11" fontFamily="system-ui">e pistas visuais para apoiar a compreensão do enunciado."</text>
      <rect x="528" y="494" width="100" height="22" rx="6" fill="#2563EB"/>
      <text x="578" y="509" textAnchor="middle" fill="white" fontSize="10" fontWeight="600" fontFamily="system-ui">Aplicar sugestão</text>
    </g>
  </svg>
);

// ─── Steps mockup (Como funciona) ────────────────────────────────────────────
const StepsMockup: React.FC = () => (
  <svg viewBox="0 0 720 220" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto', display: 'block' }}>
    <defs>
      <linearGradient id="step-line" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#2563EB"/>
        <stop offset="100%" stopColor="#22C55E"/>
      </linearGradient>
    </defs>
    <rect width="720" height="220" fill="#F8FAFC" rx="14"/>
    {/* Connecting line */}
    <line x1="120" y1="80" x2="600" y2="80" stroke="url(#step-line)" strokeWidth="2" strokeDasharray="6 4"/>
    {/* Step 1 */}
    <circle cx="120" cy="80" r="32" fill="#2563EB"/>
    <text x="120" y="86" textAnchor="middle" fill="white" fontSize="20" fontWeight="800" fontFamily="system-ui">1</text>
    <text x="120" y="132" textAnchor="middle" fill="#1E293B" fontSize="13" fontWeight="700" fontFamily="system-ui">Cadastre o aluno</text>
    <text x="120" y="150" textAnchor="middle" fill="#64748B" fontSize="11" fontFamily="system-ui">Dados, laudo e</text>
    <text x="120" y="165" textAnchor="middle" fill="#64748B" fontSize="11" fontFamily="system-ui">perfil cognitivo</text>
    {/* Step 2 */}
    <circle cx="360" cy="80" r="32" fill="#F59E0B"/>
    <text x="360" y="86" textAnchor="middle" fill="white" fontSize="20" fontWeight="800" fontFamily="system-ui">2</text>
    <text x="360" y="132" textAnchor="middle" fill="#1E293B" fontSize="13" fontWeight="700" fontFamily="system-ui">A IA gera tudo</text>
    <text x="360" y="150" textAnchor="middle" fill="#64748B" fontSize="11" fontFamily="system-ui">PEI, PAEE, PDI e</text>
    <text x="360" y="165" textAnchor="middle" fill="#64748B" fontSize="11" fontFamily="system-ui">atividades adaptadas</text>
    {/* Step 3 */}
    <circle cx="600" cy="80" r="32" fill="#22C55E"/>
    <text x="600" y="86" textAnchor="middle" fill="white" fontSize="20" fontWeight="800" fontFamily="system-ui">3</text>
    <text x="600" y="132" textAnchor="middle" fill="#1E293B" fontSize="13" fontWeight="700" fontFamily="system-ui">Exporte e assine</text>
    <text x="600" y="150" textAnchor="middle" fill="#64748B" fontSize="11" fontFamily="system-ui">PDF com auditoria</text>
    <text x="600" y="165" textAnchor="middle" fill="#64748B" fontSize="11" fontFamily="system-ui">SHA-256 e LGPD</text>
    {/* Arrows */}
    <path d="M 158,80 L 320,80" stroke="#CBD5E1" strokeWidth="1.5" markerEnd="url(#arr)"/>
    <path d="M 398,80 L 560,80" stroke="#CBD5E1" strokeWidth="1.5" markerEnd="url(#arr)"/>
    <defs>
      <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M 0,0 L 6,3 L 0,6 Z" fill="#CBD5E1"/>
      </marker>
    </defs>
  </svg>
);

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes lp-rise {
    from { opacity:0; transform:translateY(22px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes lp-float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-8px); }
  }
  @keyframes lp-badge-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(37,99,235,0.3); }
    50% { box-shadow: 0 0 0 8px rgba(37,99,235,0); }
  }
  @keyframes lp-urgency {
    0%, 100% { opacity:1; }
    50% { opacity:0.7; }
  }

  .lp-1 { animation: lp-rise 0.9s cubic-bezier(0.22,1,0.36,1) 0.00s both; }
  .lp-2 { animation: lp-rise 0.9s cubic-bezier(0.22,1,0.36,1) 0.12s both; }
  .lp-3 { animation: lp-rise 0.9s cubic-bezier(0.22,1,0.36,1) 0.24s both; }
  .lp-4 { animation: lp-rise 0.9s cubic-bezier(0.22,1,0.36,1) 0.38s both; }
  .lp-5 { animation: lp-rise 0.9s cubic-bezier(0.22,1,0.36,1) 0.52s both; }

  .reveal {
    opacity:0; transform:translateY(20px);
    transition: opacity 0.75s cubic-bezier(0.22,1,0.36,1), transform 0.75s cubic-bezier(0.22,1,0.36,1);
  }
  .reveal.on { opacity:1; transform:translateY(0); }
  .rd1 { transition-delay:0.05s; } .rd2 { transition-delay:0.14s; }
  .rd3 { transition-delay:0.23s; } .rd4 { transition-delay:0.32s; }
  .rd5 { transition-delay:0.41s; } .rd6 { transition-delay:0.50s; }

  .btn-blue {
    background: #2563EB; color:white; border:none; cursor:pointer;
    font-weight:700; font-family:inherit;
    transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
  }
  .btn-blue:hover { background:#1D4ED8; transform:translateY(-2px); box-shadow:0 8px 28px rgba(37,99,235,0.32); }

  .btn-green {
    background: #22C55E; color:white; border:none; cursor:pointer;
    font-weight:700; font-family:inherit;
    transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
  }
  .btn-green:hover { background:#16A34A; transform:translateY(-2px); box-shadow:0 8px 28px rgba(34,197,94,0.30); }

  .btn-outline-blue {
    background:transparent; cursor:pointer; font-weight:700; font-family:inherit;
    border:2px solid #2563EB; color:#2563EB;
    transition: background 0.2s, color 0.2s, transform 0.15s;
  }
  .btn-outline-blue:hover { background:#2563EB; color:white; transform:translateY(-1px); }

  .btn-ghost-white {
    background:transparent; border:2px solid rgba(255,255,255,0.35);
    color:rgba(255,255,255,0.9); cursor:pointer; font-weight:700; font-family:inherit;
    transition:border-color 0.2s, color 0.2s, background 0.2s;
  }
  .btn-ghost-white:hover { border-color:white; color:white; background:rgba(255,255,255,0.08); }

  .nav-link {
    font-size:14px; font-weight:500; color:#64748B; text-decoration:none;
    transition:color 0.15s; background:none; border:none; cursor:pointer;
    display:flex; align-items:center; gap:5px; font-family:inherit;
  }
  .nav-link:hover { color:#2563EB; }

  .pain-card {
    padding:28px 24px; border-radius:16px;
    transition:transform 0.2s, box-shadow 0.2s;
    background:white; cursor:default;
  }
  .pain-card:hover { transform:translateY(-3px); box-shadow:0 12px 32px rgba(239,68,68,0.10); }

  .sol-card {
    display:flex; gap:16px; align-items:flex-start; padding:24px;
    border-radius:16px; background:white;
    transition:box-shadow 0.2s, transform 0.2s;
  }
  .sol-card:hover { transform:translateY(-3px); box-shadow:0 12px 32px rgba(34,197,94,0.12); }

  .feat-card {
    transition:box-shadow 0.25s, transform 0.25s;
    border:1.5px solid #E2E8F0; background:white; border-radius:16px; padding:32px 28px;
  }
  .feat-card:hover { box-shadow:0 16px 48px rgba(37,99,235,0.10); transform:translateY(-4px); border-color:#BFDBFE; }

  .cmp-row td { transition:background 0.15s; }
  .cmp-row:hover td { background:rgba(37,99,235,0.02); }

  .hero-badge {
    animation: lp-badge-pulse 2.4s ease-in-out infinite;
  }

  .mockup-float {
    animation: lp-float 5s ease-in-out infinite;
  }

  @media (max-width:900px) {
    .hero-inner { padding-top:100px !important; padding-bottom:72px !important; }
    .two-col { grid-template-columns:1fr !important; gap:48px !important; }
    .feat-grid { grid-template-columns:1fr 1fr !important; }
    .sol-grid  { grid-template-columns:1fr 1fr !important; }
    .pain-grid { grid-template-columns:1fr 1fr !important; }
    .lp-nav { display:none !important; }
    .ba-grid { grid-template-columns:1fr !important; }
  }
  @media (max-width:600px) {
    .hero-ctas { flex-direction:column !important; width:100% !important; }
    .hero-ctas button, .hero-ctas a { width:100% !important; justify-content:center !important; }
    .feat-grid  { grid-template-columns:1fr !important; }
    .sol-grid   { grid-template-columns:1fr !important; }
    .pain-grid  { grid-template-columns:1fr !important; }
    .footer-row { flex-direction:column !important; align-items:flex-start !important; }
  }
`;

// ─── Defaults ────────────────────────────────────────────────────────────────
const FAQ_DEFAULTS: Array<{ q: string; a: string }> = [
  { q: 'Para quem é o IncluiAI?', a: 'Para professores de AEE, psicopedagogos, fonoaudiólogos e demais profissionais de educação inclusiva que precisam de documentos rápidos, padronizados e auditáveis.' },
  { q: 'Os dados dos alunos são seguros?', a: 'Sim. Armazenamos em conformidade com a LGPD, com criptografia e auditoria SHA-256 em cada documento gerado.' },
  { q: 'Posso cancelar a qualquer momento?', a: 'No plano mensal, sim — sem multas ou taxas de cancelamento. O plano anual tem carência de 12 meses.' },
  { q: 'Qual a diferença entre os planos?', a: 'O FREE permite até 5 alunos. O PRO expande para 30 alunos com mais funcionalidades. O PREMIUM é para escolas e clínicas — alunos ilimitados, fichas avançadas, análise de laudo com IA e relatórios evolutivos completos.' },
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
    }).catch(() => { /* mantém defaults */ });
  }, []);

  const scrollTo = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const pain    = useReveal<HTMLDivElement>();
  const caos    = useReveal<HTMLDivElement>();
  const sol     = useReveal<HTMLDivElement>();
  const steps   = useReveal<HTMLDivElement>();
  const compare = useReveal<HTMLDivElement>();
  const proof   = useReveal<HTMLDivElement>();
  const cta     = useReveal<HTMLDivElement>();

  return (
    <div style={{ fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif", background: P.surface, color: P.ink, minHeight: '100vh' }}>
      <style>{CSS}</style>

      {/* ════════════════════════ NAVBAR ════════════════════════ */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: 'rgba(255,255,255,0.97)',
        borderBottom: `1px solid ${P.border}`,
        backdropFilter: 'blur(16px)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ background: P.blue, padding: 7, borderRadius: 9 }}>
              <Brain size={17} color="white" />
            </div>
            <span style={{ fontSize: 17, fontWeight: 800, color: P.ink, letterSpacing: '-0.025em' }}>IncluiAI</span>
          </div>
          <nav className="lp-nav" style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
            <a href="#problema"     onClick={e => scrollTo(e, 'problema')}     className="nav-link">O Problema</a>
            <a href="#solucao"      onClick={e => scrollTo(e, 'solucao')}      className="nav-link">Solução</a>
            <a href="#como-funciona" onClick={e => scrollTo(e, 'como-funciona')} className="nav-link">Como funciona</a>
            <a href="#pricing"      onClick={e => scrollTo(e, 'pricing')}      className="nav-link">Planos</a>
            <button onClick={onAudit} className="nav-link"><ShieldCheck size={14} /> Validar Doc</button>
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button onClick={onLogin} className="btn-outline-blue" style={{ fontSize: 13, padding: '8px 18px', borderRadius: 8 }}>
              Entrar
            </button>
            <button onClick={onLogin} className="btn-blue" style={{ fontSize: 13, padding: '9px 20px', borderRadius: 8 }}>
              Começar Grátis
            </button>
          </div>
        </div>
      </header>

      <main>

        {/* ════════════════════════ HERO ════════════════════════ */}
        <section style={{
          background: 'linear-gradient(155deg, #EFF6FF 0%, #F8FAFC 45%, #F0FDF4 100%)',
          overflow: 'hidden',
          position: 'relative',
          paddingTop: 64,
        }}>
          {/* Decorative blobs */}
          <div style={{ position: 'absolute', top: 80, left: -100, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(37,99,235,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: 0, right: -60, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,197,94,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <div className="hero-inner" style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 28px 48px' }}>
            <div style={{ maxWidth: 860, margin: '0 auto', textAlign: 'center' }}>

              {/* Pain badge */}
              <div className="lp-1" style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  background: '#FEF2F2',
                  border: '1.5px solid #FECACA',
                  borderRadius: 100, padding: '8px 22px',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: P.red, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#7F1D1D', letterSpacing: '0.01em' }}>
                    fichas repetidas&nbsp; • &nbsp;documentos perdidos&nbsp; • &nbsp;retrabalho constante
                  </span>
                </div>
              </div>

              {/* Headline */}
              <h1 className="lp-2" style={{
                fontSize: 'clamp(32px, 5vw, 62px)',
                fontWeight: 900,
                color: P.ink,
                lineHeight: 1.08,
                letterSpacing: '-0.04em',
                marginBottom: 24,
              }}>
                Você não foi formada<br />
                para preencher papel.{' '}
                <span style={{ color: P.red, display: 'inline-block', position: 'relative' }}>
                  Mas é isso
                  <svg style={{ position: 'absolute', bottom: -4, left: 0, width: '100%', height: 8 }} viewBox="0 0 200 8" preserveAspectRatio="none">
                    <path d="M0 6 Q50 0 100 5 Q150 10 200 4" stroke="#EF4444" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                  </svg>
                </span>
                <br />
                que está consumindo seu dia.
              </h1>

              {/* Subheadline */}
              <p className="lp-3" style={{
                fontSize: 18,
                color: P.muted,
                lineHeight: 1.72,
                maxWidth: 600,
                margin: '0 auto 44px',
              }}>
                O IncluiAI elimina a burocracia pedagógica, organiza tudo em um só lugar
                e transforma horas de trabalho em minutos — para você voltar o foco ao que importa.
              </p>

              {/* CTAs */}
              <div className="lp-4 hero-ctas" style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 52, flexWrap: 'wrap' }}>
                <button onClick={onLogin} className="btn-blue" style={{
                  fontSize: 16, padding: '16px 36px', borderRadius: 10,
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  boxShadow: '0 8px 24px rgba(37,99,235,0.28)',
                }}>
                  Começar grátis <ArrowRight size={18} />
                </button>
                <button onClick={onLogin} className="btn-outline-blue" style={{
                  fontSize: 16, padding: '16px 32px', borderRadius: 10,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                  Quero parar de perder tempo
                </button>
              </div>

              {/* Social proof bar */}
              <div className="lp-5" style={{
                display: 'flex', gap: 40, justifyContent: 'center', flexWrap: 'wrap',
                paddingTop: 32, borderTop: `1px solid ${P.border}`,
              }}>
                {[
                  { val: '+12.000', label: 'Documentos gerados' },
                  { val: '+1.800',  label: 'Professores ativos'  },
                  { val: '< 5min',  label: 'Para gerar um PEI'   },
                  { val: '100%',    label: 'LGPD conforme'        },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: P.blue, letterSpacing: '-0.03em' }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: P.muted, fontWeight: 500, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Dashboard preview */}
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px 0' }}>
            <div className="mockup-float" style={{
              border: `1px solid ${P.border}`,
              borderRadius: 16, overflow: 'hidden',
              boxShadow: '0 32px 80px rgba(15,23,42,0.14)',
              marginBottom: -80, position: 'relative', zIndex: 2,
            }}>
              <DashboardMockup />
            </div>
          </div>
        </section>

        {/* ════════════════════════ DOR ════════════════════════ */}
        <section id="problema" style={{ background: '#FAFAFA', paddingTop: 140, paddingBottom: 96 }}>
          <div ref={pain.ref} style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${pain.visible ? 'on' : ''}`} style={{ textAlign: 'center', maxWidth: 700, margin: '0 auto 64px' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#FEF2F2', border: '1.5px solid #FECACA',
                padding: '7px 18px', borderRadius: 100, marginBottom: 22,
              }}>
                <AlertTriangle size={13} color={P.red} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                  A realidade que ninguém fala
                </span>
              </div>

              <h2 style={{
                fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800,
                color: P.ink, letterSpacing: '-0.03em', lineHeight: 1.12,
                marginBottom: 18,
              }}>
                Você passa mais tempo<br />
                <span style={{ color: P.red }}>fazendo documento</span><br />
                do que ensinando.
              </h2>
              <p style={{ fontSize: 16, color: P.muted, lineHeight: 1.72 }}>
                E o pior: mesmo com todo esse esforço, as informações se perdem,
                os padrões não existem e as decisões continuam sendo tomadas no achismo.
              </p>
            </div>

            <div className="pain-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                {
                  icon: FolderX,
                  title: 'Kits pedagógicos que viram arquivo morto',
                  desc: 'Você pagou R$297 num kit cheio de promessas. Ficou na pasta Downloads. Nunca foi aberto de novo.',
                  delay: 'rd1', color: '#FEF2F2', border: '#FECACA', iconBg: '#FEE2E2', iconColor: P.red,
                },
                {
                  icon: Clock,
                  title: '4 horas fazendo um PEI que já deveria estar pronto',
                  desc: 'Toda segunda-feira você monta do zero. Sem base histórica, sem padrão. No ano seguinte, começa tudo outra vez.',
                  delay: 'rd2', color: '#FFFBEB', border: '#FDE68A', iconBg: '#FEF3C7', iconColor: '#B45309',
                },
                {
                  icon: AlertTriangle,
                  title: '"Pasta Alunos 2024 / cópia FINAL v3 def revisado"',
                  desc: 'Documentos espalhados em pastas aleatórias, pen drive e e-mail. Na hora que precisa, ninguém encontra nada.',
                  delay: 'rd3', color: '#FEF2F2', border: '#FECACA', iconBg: '#FEE2E2', iconColor: P.red,
                },
                {
                  icon: Trash2,
                  title: 'Relatórios escritos do zero. Todo ano. Pra cada aluno.',
                  desc: 'Como se o laudo de 2022 tivesse evaporado. Todo início de ano, estaca zero. Sem continuidade.',
                  delay: 'rd4', color: '#FFFBEB', border: '#FDE68A', iconBg: '#FEF3C7', iconColor: '#B45309',
                },
                {
                  icon: X,
                  title: 'Reuniões sem dado, decisões no achismo',
                  desc: 'Não existe KPI, não existe histórico visual, não existe base de dados. Decisões sobre o aluno saem de impressões.',
                  delay: 'rd5', color: '#FEF2F2', border: '#FECACA', iconBg: '#FEE2E2', iconColor: P.red,
                },
                {
                  icon: FileText,
                  title: 'Cada professor tem o seu "padrão". Nenhum bate.',
                  desc: 'Cada gestão muda o formato, cada professor cria o seu modelo. Quem paga a conta é o aluno com necessidade especial.',
                  delay: 'rd6', color: '#FFFBEB', border: '#FDE68A', iconBg: '#FEF3C7', iconColor: '#B45309',
                },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className={`pain-card reveal ${item.delay} ${pain.visible ? 'on' : ''}`}
                    style={{ background: item.color, border: `1.5px solid ${item.border}` }}
                  >
                    <div style={{
                      width: 42, height: 42, background: item.iconBg,
                      borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: 16,
                    }}>
                      <Icon size={18} color={item.iconColor} />
                    </div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: P.slate, marginBottom: 10, lineHeight: 1.35 }}>
                      {item.title}
                    </h3>
                    <p style={{ fontSize: 13, color: P.muted, lineHeight: 1.65 }}>{item.desc}</p>
                  </div>
                );
              })}
            </div>

            <div className={`reveal rd3 ${pain.visible ? 'on' : ''}`} style={{
              marginTop: 40,
              background: 'linear-gradient(135deg, #FEF2F2 0%, #FFFBEB 100%)',
              border: '1.5px solid #FECACA',
              borderRadius: 16, padding: '28px 32px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 20,
            }}>
              <div>
                <p style={{ fontSize: 18, fontWeight: 800, color: P.slate, marginBottom: 4 }}>
                  Isso não é problema de organização pessoal.
                </p>
                <p style={{ fontSize: 14, color: P.muted }}>É falta de um sistema que trabalhe por você. O IncluiAI foi feito exatamente para isso.</p>
              </div>
              <button onClick={onLogin} className="btn-blue" style={{
                fontSize: 15, padding: '13px 26px', borderRadius: 10,
                display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
              }}>
                Quero resolver isso <ArrowRight size={16} />
              </button>
            </div>

          </div>
        </section>

        {/* ════════════════════════ CAOS ATUAL (ANTES vs DEPOIS) ════════════════════════ */}
        <section id="caos" style={{ background: P.surface, padding: '96px 0' }}>
          <div ref={caos.ref} style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${caos.visible ? 'on' : ''}`} style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 56px' }}>
              <div style={{
                display: 'inline-block', fontSize: 11, fontWeight: 700, color: P.blue,
                textTransform: 'uppercase', letterSpacing: '0.12em',
                background: P.blueLight, padding: '5px 14px', borderRadius: 100, marginBottom: 18,
              }}>
                Antes vs Depois
              </div>
              <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 44px)', fontWeight: 800, color: P.ink, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 14 }}>
                A diferença é real.<br />E ela começa hoje.
              </h2>
              <p style={{ fontSize: 16, color: P.muted, lineHeight: 1.68 }}>
                Veja o que muda quando você para de trabalhar contra a burocracia e começa a trabalhar com inteligência.
              </p>
            </div>

            <div className="ba-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              {/* Antes */}
              <div className={`reveal rd1 ${caos.visible ? 'on' : ''}`} style={{
                background: '#FEF2F2', border: '2px solid #FECACA', borderRadius: 20, padding: '32px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                  <div style={{ background: '#FEE2E2', borderRadius: 10, padding: 8 }}>
                    <X size={18} color={P.red} />
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#B91C1C' }}>Antes do IncluiAI</span>
                </div>
                {[
                  'PEI feito do zero, toda vez',
                  'Documentos perdidos em pastas',
                  'Sem histórico do aluno',
                  'Reunião sem dados concretos',
                  'Cada um usa um formato diferente',
                  'Horas gastas com burocracia',
                  'Kits que nunca foram usados',
                  'Domingo dedicado ao papelório',
                ].map(item => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#FEE2E2', border: '1.5px solid #FCA5A5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <X size={10} color={P.red} />
                    </div>
                    <span style={{ fontSize: 14, color: '#7F1D1D' }}>{item}</span>
                  </div>
                ))}
              </div>

              {/* Depois */}
              <div className={`reveal rd2 ${caos.visible ? 'on' : ''}`} style={{
                background: P.greenLight, border: '2px solid #BBF7D0', borderRadius: 20, padding: '32px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                  <div style={{ background: '#DCFCE7', borderRadius: 10, padding: 8 }}>
                    <CheckCircle size={18} color={P.greenDark} />
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 800, color: P.greenDark }}>Com o IncluiAI</span>
                </div>
                {[
                  'PEI gerado em menos de 5 minutos',
                  'Tudo centralizado e acessível',
                  'Histórico completo por aluno',
                  'KPIs e dados em tempo real',
                  'Padrão técnico unificado',
                  'Mais tempo para o que importa',
                  'Recursos que realmente funcionam',
                  'Fim de semana livre para você',
                ].map(item => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#DCFCE7', border: '1.5px solid #86EFAC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <CheckCircle size={10} color={P.greenDark} />
                    </div>
                    <span style={{ fontSize: 14, color: '#166534' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>

        {/* ════════════════════════ SOLUÇÃO ════════════════════════ */}
        <section id="solucao" style={{ background: P.bg, padding: '96px 0' }}>
          <div ref={sol.ref} style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${sol.visible ? 'on' : ''}`} style={{ textAlign: 'center', maxWidth: 700, margin: '0 auto 64px' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: P.greenLight, border: '1.5px solid #BBF7D0',
                padding: '7px 18px', borderRadius: 100, marginBottom: 22,
              }}>
                <CheckCircle size={13} color={P.greenDark} />
                <span style={{ fontSize: 11, fontWeight: 700, color: P.greenDark, textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                  A solução que você precisava
                </span>
              </div>

              <h2 style={{
                fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800,
                color: P.ink, letterSpacing: '-0.03em', lineHeight: 1.12,
                marginBottom: 18,
              }}>
                Base de dados, KPIs e documentos<br />
                <span style={{ color: P.greenDark }}>que trabalham por você.</span>
              </h2>
              <p style={{ fontSize: 16, color: P.muted, lineHeight: 1.72 }}>
                Tudo centralizado. Tudo padronizado. Tudo acessível em segundos.
                Decisões precisas baseadas em dados reais — não em impressões.
              </p>
            </div>

            <div className="sol-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                {
                  icon: Database,
                  title: 'Base de dados centralizada por aluno',
                  desc: 'Histórico completo — laudos, atendimentos, atividades, evolução. Nada se perde. Qualquer membro acessa na hora que precisa.',
                  delay: 'rd1',
                },
                {
                  icon: PieChart,
                  title: 'KPIs pedagógicos em tempo real',
                  desc: 'Dashboard com indicadores de evolução, créditos, protocolos e muito mais. Você vê o que está funcionando antes que seja tarde.',
                  delay: 'rd2',
                },
                {
                  icon: FileText,
                  title: 'Documentos em minutos, não em horas',
                  desc: 'PEI, PAEE, PDI, Estudo de Caso — gerados com padrão técnico, auditabilidade SHA-256 e assinatura digital. 3 minutos. Não 4 horas.',
                  delay: 'rd3',
                },
                {
                  icon: Target,
                  title: 'Perfil cognitivo em 10 dimensões',
                  desc: 'Radar visual que evolui com o aluno. Relatórios que mostram o que mudou, não apenas o que foi feito.',
                  delay: 'rd4',
                },
                {
                  icon: CheckCircle,
                  title: 'Padrão unificado para toda a instituição',
                  desc: 'Acabou o "cada um tem o seu formato". PEI, PAEE, PDI e todos os documentos seguem estrutura técnica e normatizada.',
                  delay: 'rd5',
                },
                {
                  icon: TrendingUp,
                  title: 'Histórico que evolui com o aluno',
                  desc: 'Nunca mais recomeça do zero. O que foi feito em 2023 alimenta o que você vai criar em 2025. Continuidade real de atendimento.',
                  delay: 'rd6',
                },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className={`sol-card reveal ${item.delay} ${sol.visible ? 'on' : ''}`}
                    style={{ border: '1.5px solid #BBF7D0' }}
                  >
                    <div style={{ width: 44, height: 44, background: '#DCFCE7', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <Icon size={20} color={P.greenDark} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: P.ink, marginBottom: 8 }}>{item.title}</h3>
                      <p style={{ fontSize: 14, color: P.muted, lineHeight: 1.68 }}>{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </section>

        {/* ════════════════════════ COMO FUNCIONA (3 PASSOS) ════════════════════════ */}
        <section id="como-funciona" style={{ background: P.surface, padding: '96px 0' }}>
          <div ref={steps.ref} style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${steps.visible ? 'on' : ''}`} style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 64px' }}>
              <div style={{
                display: 'inline-block', fontSize: 11, fontWeight: 700, color: P.blue,
                textTransform: 'uppercase', letterSpacing: '0.12em',
                background: P.blueLight, padding: '5px 14px', borderRadius: 100, marginBottom: 18,
              }}>
                Como funciona
              </div>
              <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 44px)', fontWeight: 800, color: P.ink, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 14 }}>
                3 passos. Pronto.<br />Sem complicação.
              </h2>
              <p style={{ fontSize: 16, color: P.muted, lineHeight: 1.68 }}>
                Sem treinamento técnico, sem configuração complexa. Você entra e já começa a usar.
              </p>
            </div>

            {/* Steps mockup */}
            <div className={`reveal rd1 ${steps.visible ? 'on' : ''}`} style={{ maxWidth: 800, margin: '0 auto 56px', background: '#F8FAFC', borderRadius: 20, padding: 12, border: `1px solid ${P.border}` }}>
              <StepsMockup />
            </div>

            {/* Step detail cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, maxWidth: 900, margin: '0 auto' }}>
              {[
                {
                  step: '01',
                  title: 'Cadastre o aluno em minutos',
                  desc: 'Dados pessoais, diagnóstico, laudo e perfil cognitivo. Tudo em um formulário intuitivo. O sistema já está pronto para trabalhar.',
                  color: P.blue, bg: P.blueLight, delay: 'rd1',
                },
                {
                  step: '02',
                  title: 'A IA gera os documentos',
                  desc: 'PEI, PAEE, PDI, Estudo de Caso, atividades adaptadas, fichas complementares — todos personalizados pelo perfil do aluno.',
                  color: P.gold, bg: P.goldLight, delay: 'rd2',
                },
                {
                  step: '03',
                  title: 'Exporte, assine e arquive',
                  desc: 'PDF com assinatura digital, código SHA-256 auditável e LGPD conforme. Documento com validade técnica real.',
                  color: P.green, bg: P.greenLight, delay: 'rd3',
                },
              ].map(s => (
                <div key={s.step} className={`reveal ${s.delay} ${steps.visible ? 'on' : ''}`} style={{
                  background: s.bg, border: `1.5px solid ${s.color}22`,
                  borderRadius: 16, padding: '28px 24px',
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 18,
                  }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: 'white' }}>{s.step}</span>
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: P.ink, marginBottom: 10 }}>{s.title}</h3>
                  <p style={{ fontSize: 14, color: P.muted, lineHeight: 1.68 }}>{s.desc}</p>
                </div>
              ))}
            </div>

            {/* IncluiLAB block */}
            <div className={`reveal rd2 ${steps.visible ? 'on' : ''}`} style={{
              marginTop: 56, background: `linear-gradient(135deg, ${P.blueLight} 0%, #F5F3FF 100%)`,
              border: '1.5px solid #BFDBFE', borderRadius: 20, padding: '36px 40px',
              display: 'flex', gap: 48, alignItems: 'center', flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: P.blue, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
                  IncluiLAB — Exclusivo PRO & PREMIUM
                </p>
                <h3 style={{ fontSize: 22, fontWeight: 800, color: P.ink, letterSpacing: '-0.02em', marginBottom: 12, lineHeight: 1.25 }}>
                  O laboratório de inteligência pedagógica que trabalha enquanto você descansa.
                </h3>
                <p style={{ fontSize: 15, color: P.muted, lineHeight: 1.68 }}>
                  Automatize processos, monte fluxos visuais e deixe a IA fazer o trabalho pesado — sem código.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minWidth: 220 }}>
                {[
                  { icon: Zap,      name: 'AtivaIA',     desc: 'Gere atividades pedagógicas com objetivos BNCC em segundos.' },
                  { icon: Layers,   name: 'EduLensIA',   desc: 'Adapte qualquer atividade para TEA, TDAH, Dislexia ou DI.' },
                  { icon: Sparkles, name: 'NeuroDesign',  desc: 'Redesenhe textos com layout pedagógico acessível automaticamente.' },
                ].map(m => {
                  const Icon = m.icon;
                  return (
                    <div key={m.name} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      <div style={{ width: 36, height: 36, background: P.blue, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={16} color="white" />
                      </div>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: P.ink }}>{m.name}</span>
                        <p style={{ fontSize: 13, color: P.muted, lineHeight: 1.55, marginTop: 2 }}>{m.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </section>

        {/* ════════════════════════ COMPARAÇÃO ════════════════════════ */}
        <section id="comparacao" style={{ background: P.bg, padding: '96px 0' }}>
          <div ref={compare.ref} style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${compare.visible ? 'on' : ''}`} style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 56px' }}>
              <div style={{
                display: 'inline-block', fontSize: 11, fontWeight: 700, color: P.blue,
                textTransform: 'uppercase', letterSpacing: '0.12em',
                background: P.blueLight, padding: '5px 14px', borderRadius: 100, marginBottom: 18,
              }}>
                Comparação honesta
              </div>
              <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 44px)', fontWeight: 800, color: P.ink, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 14 }}>
                IncluiAI vs. Tudo que você usou antes
              </h2>
              <p style={{ fontSize: 16, color: P.muted, lineHeight: 1.65 }}>
                Kits vendem arquivos. Excel vira bagunça. O IncluiAI entrega inteligência pedagógica que evolui com o aluno.
              </p>
            </div>

            <div className={`reveal rd1 ${compare.visible ? 'on' : ''}`} style={{ maxWidth: 860, margin: '0 auto', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, background: 'white', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
                <thead>
                  <tr style={{ background: P.bg }}>
                    <th style={{ padding: '16px 24px', textAlign: 'left', borderBottom: `1.5px solid ${P.border}`, color: P.muted, fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Critério</th>
                    <th style={{ padding: '16px 24px', textAlign: 'center', borderBottom: `1.5px solid ${P.border}`, color: P.red, fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 160 }}>Kits / Excel / Pastas</th>
                    <th style={{ padding: '16px 24px', textAlign: 'center', borderBottom: `1.5px solid ${P.blue}`, color: P.blue, fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 160, background: P.blueLight }}>IncluiAI</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Geração personalizada por aluno',    kit: false, us: true  },
                    { label: 'Adaptação com IA em segundos',       kit: false, us: true  },
                    { label: 'Análise de laudos automática',       kit: false, us: true  },
                    { label: 'Perfil cognitivo visual',            kit: false, us: true  },
                    { label: 'Histórico centralizado e seguro',    kit: false, us: true  },
                    { label: 'KPIs e dados em tempo real',         kit: false, us: true  },
                    { label: 'Padrão técnico e auditável',         kit: false, us: true  },
                    { label: 'Documentos que viram arquivo morto', kit: true,  us: false },
                    { label: 'Reescrever tudo do zero todo ano',   kit: true,  us: false },
                  ].map(row => (
                    <tr key={row.label} className="cmp-row" style={{ borderBottom: `1px solid ${P.border}` }}>
                      <td style={{ padding: '16px 24px', fontWeight: 500, color: P.slate, fontSize: 15 }}>{row.label}</td>
                      <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                        {row.kit
                          ? <CheckCircle size={17} color="#CBD5E1" style={{ margin: '0 auto', display: 'block' }} />
                          : <X size={15} color="#FCA5A5" style={{ margin: '0 auto', display: 'block' }} />}
                      </td>
                      <td style={{ padding: '16px 24px', textAlign: 'center', background: `${P.blue}04` }}>
                        {row.us
                          ? <CheckCircle size={17} color={P.greenDark} style={{ margin: '0 auto', display: 'block' }} />
                          : <X size={15} color="#FCA5A5" style={{ margin: '0 auto', display: 'block' }} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        </section>

        {/* ════════════════════════ PLANOS ════════════════════════ */}
        <PricingSection onLogin={onLogin} onRegister={_onRegister} onUpgradeClick={onUpgradeClick} />

        {/* ════════════════════════ PROVA / AUTORIDADE ════════════════════════ */}
        <section id="prova" style={{ background: P.surface, padding: '96px 0' }}>
          <div ref={proof.ref} style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${proof.visible ? 'on' : ''}`} style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 64px' }}>
              <div style={{
                display: 'inline-block', fontSize: 11, fontWeight: 700, color: P.gold,
                textTransform: 'uppercase', letterSpacing: '0.12em',
                background: P.goldLight, padding: '5px 14px', borderRadius: 100, marginBottom: 18,
              }}>
                Prova real
              </div>
              <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 44px)', fontWeight: 800, color: P.ink, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 14 }}>
                Mais de 1.800 professores<br />já pararam de perder tempo.
              </h2>
              <p style={{ fontSize: 16, color: P.muted, lineHeight: 1.68 }}>
                Profissionais da educação inclusiva de todo o Brasil usando o IncluiAI no dia a dia.
              </p>
            </div>

            {/* Numbers grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, maxWidth: 900, margin: '0 auto 64px' }}>
              {[
                { val: '+1.800', label: 'Professores ativos', icon: Users, color: P.blue, bg: P.blueLight },
                { val: '+12.000', label: 'Documentos gerados', icon: FileText, color: P.greenDark, bg: P.greenLight },
                { val: '< 5min', label: 'Para gerar um PEI', icon: Clock, color: P.gold, bg: P.goldLight },
                { val: '100%', label: 'LGPD conforme', icon: ShieldCheck, color: '#7C3AED', bg: '#F5F3FF' },
              ].map(stat => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className={`reveal rd1 ${proof.visible ? 'on' : ''}`} style={{
                    background: stat.bg, borderRadius: 16, padding: '28px 20px',
                    textAlign: 'center', border: `1.5px solid ${stat.color}22`,
                  }}>
                    <div style={{ width: 48, height: 48, background: `${stat.color}18`, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                      <Icon size={22} color={stat.color} />
                    </div>
                    <div style={{ fontSize: 32, fontWeight: 900, color: stat.color, letterSpacing: '-0.04em', lineHeight: 1 }}>{stat.val}</div>
                    <div style={{ fontSize: 12, color: P.muted, fontWeight: 500, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</div>
                  </div>
                );
              })}
            </div>

            {/* Testimonials */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              {[
                {
                  text: '"Antes eu passava o domingo inteiro fazendo PEI. Agora faço em 5 minutos durante a semana. Minha vida mudou de verdade."',
                  name: 'Ana Paula S.',
                  role: 'Professora de AEE · São Paulo',
                  delay: 'rd1',
                },
                {
                  text: '"A escola inteira padronizou os documentos. Não tem mais aquela bagunça de cada um fazendo do seu jeito. O PREMIUM valeu cada centavo."',
                  name: 'Mariana T.',
                  role: 'Coordenadora Inclusiva · Belo Horizonte',
                  delay: 'rd2',
                },
                {
                  text: '"Finalmente tenho histórico real dos meus alunos. Quando chega novo professor, ele não começa do zero — começa de onde eu parei."',
                  name: 'Ricardo L.',
                  role: 'Psicopedagogo · Curitiba',
                  delay: 'rd3',
                },
              ].map(t => (
                <div key={t.name} className={`reveal ${t.delay} ${proof.visible ? 'on' : ''}`} style={{
                  background: P.bg, border: `1.5px solid ${P.border}`,
                  borderRadius: 16, padding: '28px 24px',
                }}>
                  <div style={{ display: 'flex', gap: 2, marginBottom: 14 }}>
                    {[1,2,3,4,5].map(i => <Star key={i} size={14} color={P.gold} fill={P.gold} />)}
                  </div>
                  <p style={{ fontSize: 14, color: P.slate, lineHeight: 1.72, marginBottom: 18, fontStyle: 'italic' }}>{t.text}</p>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: P.ink }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: P.muted }}>{t.role}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Authority badges */}
            <div className={`reveal rd4 ${proof.visible ? 'on' : ''}`} style={{
              marginTop: 48, display: 'flex', gap: 28, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center',
            }}>
              {[
                { icon: ShieldCheck, text: 'LGPD Conforme' },
                { icon: Award, text: 'Decreto nº 12.686/2025' },
                { icon: Lock, text: 'SHA-256 Auditável' },
                { icon: CheckCircle, text: 'Cancele quando quiser' },
                { icon: Users, text: 'Suporte incluído' },
              ].map(b => {
                const Icon = b.icon;
                return (
                  <div key={b.text} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: P.muted, fontWeight: 500 }}>
                    <Icon size={14} color={P.blue} />
                    {b.text}
                  </div>
                );
              })}
            </div>

          </div>
        </section>

        {/* ════════════════════════ CTA FINAL ════════════════════════ */}
        <section style={{
          background: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)',
          padding: '120px 0',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Decorative circles */}
          <div style={{ position: 'absolute', top: -80, right: -80, width: 360, height: 360, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -60, left: -60, width: 280, height: 280, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />

          <div ref={cta.ref} style={{ maxWidth: 760, margin: '0 auto', padding: '0 28px', textAlign: 'center' }}>
            <div className={`reveal ${cta.visible ? 'on' : ''}`}>

              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.2)',
                padding: '7px 18px', borderRadius: 100, marginBottom: 28,
              }}>
                <Zap size={13} color={P.gold} fill={P.gold} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                  Comece grátis hoje — sem cartão de crédito
                </span>
              </div>

              <h2 style={{ fontSize: 'clamp(30px, 5vw, 58px)', fontWeight: 900, color: 'white', letterSpacing: '-0.04em', lineHeight: 1.08, marginBottom: 22 }}>
                Cada hora gasta com burocracia<br />
                <span style={{ color: P.gold }}>é uma hora longe do seu aluno.</span>
              </h2>

              <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.72)', lineHeight: 1.72, maxWidth: 500, margin: '0 auto 52px' }}>
                Mais de 1.800 professores já pararam de perder tempo com papeis e kits que não funcionam. Agora é a sua vez.
              </p>

              <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
                <button onClick={onLogin} className="btn-green" style={{
                  fontSize: 16, padding: '16px 40px', borderRadius: 10,
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  boxShadow: '0 8px 24px rgba(34,197,94,0.35)',
                }}>
                  Começar grátis agora <ArrowRight size={18} />
                </button>
                <button
                  onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                  className="btn-ghost-white"
                  style={{ fontSize: 16, padding: '16px 32px', borderRadius: 10 }}
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

        {/* ════════════════════════ FAQ ════════════════════════ */}
        {faqItems.length > 0 && (
          <section style={{ background: P.bg, padding: '88px 0 80px' }}>
            <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 28px' }}>
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <div style={{
                  display: 'inline-block', fontSize: 11, fontWeight: 700, color: P.blue,
                  textTransform: 'uppercase', letterSpacing: '0.12em',
                  background: P.blueLight, padding: '5px 14px', borderRadius: 100, marginBottom: 18,
                }}>
                  FAQ
                </div>
                <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 38px)', fontWeight: 800, color: P.ink, letterSpacing: '-0.03em', lineHeight: 1.15 }}>
                  {faqTitle}
                </h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {faqItems.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      background: P.surface, border: `1.5px solid ${faqOpen === i ? P.blue : P.border}`,
                      borderRadius: 14, overflow: 'hidden',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <button
                      onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                      style={{
                        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '20px 24px', background: 'none', border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 700, color: P.ink, lineHeight: 1.4 }}>
                        {item.q}
                      </span>
                      <span style={{
                        flexShrink: 0, marginLeft: 16, width: 24, height: 24,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: faqOpen === i ? P.blue : P.bg, borderRadius: '50%',
                        transition: 'background 0.2s',
                      }}>
                        {faqOpen === i
                          ? <ChevronUp size={13} color="white" />
                          : <ChevronDown size={13} color={P.muted} />}
                      </span>
                    </button>
                    {faqOpen === i && (
                      <div style={{ padding: '0 24px 20px', fontSize: 14, color: P.muted, lineHeight: 1.72 }}>
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

      {/* ════════════════════════ FOOTER ════════════════════════ */}
      <footer style={{ background: P.slate, borderTop: `1px solid rgba(255,255,255,0.06)`, padding: '44px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>
          <div className="footer-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: P.blue, padding: 6, borderRadius: 8 }}>
                <Brain size={16} color="white" />
              </div>
              <span style={{ fontWeight: 800, fontSize: 16, color: '#F1F5F9', letterSpacing: '-0.02em' }}>IncluiAI</span>
            </div>
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
