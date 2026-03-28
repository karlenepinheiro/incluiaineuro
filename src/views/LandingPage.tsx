import React, { useState, useEffect, useRef } from 'react';
import {
  Brain, ShieldCheck, FileText, ArrowRight,
  CheckCircle, Lock, Phone,
  Zap, Sparkles, X, AlertTriangle, FolderX,
  BarChart3, Layers,
  BookOpen, MessageSquare, TrendingUp,
  Target, GitMerge, Clock, Trash2,
  Database, PieChart, Cpu
} from 'lucide-react';
import { motion } from 'framer-motion';
import { SiteConfig } from '../types';
import { AdminService } from '../services/adminService';
import { Spotlight } from '@/src/components/aceternity/spotlight';
import { AnimatedGradientText } from '@/src/components/magicui/animated-gradient-text';
import { ShimmerButton } from '@/src/components/magicui/shimmer-button';
import { Highlight } from '@/src/components/aceternity/hero-highlight';
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

const C = {
  blue:    '#1E3A5F',
  violet:  '#6B5CE7',
  teal:    '#0A9396',
  navy:    '#0B1929',
  bg:      '#F4F6FB',
  surface: '#FFFFFF',
  border:  '#E2E8F0',
  ink:     '#0F172A',
  muted:   '#64748B',
  subtle:  '#94A3B8',
};

// Pain palette — dark reds / warning
const PAIN = {
  bg:      '#0A0505',
  surface: '#120808',
  card:    '#160A0A',
  border:  '#7F1D1D',
  softBorder: '#3D1010',
  text:    '#FECACA',
  muted:   '#FDA4AF',
  accent:  '#EF4444',
  dim:     '#4B1010',
};

// Solution palette — fresh greens / positive
const SOL = {
  bg:      '#F0FDF4',
  card:    '#FFFFFF',
  border:  '#BBF7D0',
  accent:  '#16A34A',
  bright:  '#22C55E',
  text:    '#166534',
  muted:   '#15803D',
  ink:     '#0F172A',
};

// ─── Dashboard mockup SVG ────────────────────────────────────────────────────
const DashboardMockup: React.FC = () => (
  <svg viewBox="0 0 960 548" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto', display: 'block' }}>
    <defs>
      <clipPath id="db-clip"><rect width="960" height="548" rx="14"/></clipPath>
      <linearGradient id="db-area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6B5CE7" stopOpacity="0.22"/>
        <stop offset="100%" stopColor="#6B5CE7" stopOpacity="0"/>
      </linearGradient>
    </defs>
    <g clipPath="url(#db-clip)">
      <rect width="960" height="548" fill="#F1F5F9"/>
      <rect width="186" height="548" fill="#0B1929"/>
      <rect x="16" y="14" width="32" height="32" rx="8" fill="#1E3A5F"/>
      <circle cx="32" cy="30" r="7" fill="none" stroke="#5A8AB0" strokeWidth="1.5"/>
      <circle cx="32" cy="30" r="3" fill="#5A8AB0"/>
      <text x="58" y="33" fill="#E2E8F0" fontSize="13" fontWeight="700" fontFamily="system-ui" letterSpacing="-0.3">IncluiAI</text>
      <rect x="8" y="62" width="170" height="30" rx="7" fill="#1E3A5F"/>
      <rect x="20" y="69" width="14" height="14" rx="3" fill="#4A7A9B"/>
      <text x="42" y="80" fill="#E2E8F0" fontSize="11" fontWeight="600" fontFamily="system-ui">Dashboard</text>
      {['Triagem', 'Alunos', 'Protocolos', 'IncluiLAB', 'Relatórios', 'Copilot'].map((label, i) => (
        <g key={label}>
          <rect x="20" y={103 + i * 36} width="14" height="14" rx="3" fill="#152A40" opacity="0.9"/>
          <text x="42" y={114 + i * 36} fill="#2E5070" fontSize="11" fontFamily="system-ui">{label}</text>
        </g>
      ))}
      <line x1="16" y1="488" x2="170" y2="488" stroke="#1A2E45" strokeWidth="1"/>
      <circle cx="32" cy="510" r="12" fill="#1E3A5F"/>
      <text x="32" y="515" textAnchor="middle" fill="#7BAEC8" fontSize="9" fontWeight="700" fontFamily="system-ui">AP</text>
      <text x="52" y="507" fill="#3A5A74" fontSize="11" fontFamily="system-ui">Ana Paula</text>
      <text x="52" y="520" fill="#243A50" fontSize="9" fontFamily="system-ui">Plano Pro</text>
      <rect x="186" y="0" width="774" height="50" fill="white" opacity="0.98"/>
      <line x1="186" y1="50" x2="960" y2="50" stroke="#E8ECF2" strokeWidth="1"/>
      <text x="204" y="21" fill="#0F172A" fontSize="14" fontWeight="700" fontFamily="system-ui">Visão Geral</text>
      <text x="204" y="37" fill="#94A3B8" fontSize="10" fontFamily="system-ui">Março 2025  ·  Turma Especial A</text>
      <circle cx="934" cy="25" r="13" fill="#1E3A5F"/>
      <text x="934" y="30" textAnchor="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="system-ui">AP</text>
      <rect x="204" y="62" width="168" height="72" rx="10" fill="white"/>
      <rect x="218" y="74" width="24" height="24" rx="6" fill="#EEEBFF"/>
      <text x="218" y="109" fill="#94A3B8" fontSize="9" fontFamily="system-ui">ALUNOS ATIVOS</text>
      <text x="218" y="100" fill="#0F172A" fontSize="22" fontWeight="800" fontFamily="system-ui">24</text>
      <rect x="382" y="62" width="168" height="72" rx="10" fill="white"/>
      <rect x="396" y="74" width="24" height="24" rx="6" fill="#ECFAFA"/>
      <text x="396" y="109" fill="#94A3B8" fontSize="9" fontFamily="system-ui">CRÉDITOS IA</text>
      <text x="396" y="100" fill="#0F172A" fontSize="22" fontWeight="800" fontFamily="system-ui">47</text>
      <rect x="560" y="62" width="168" height="72" rx="10" fill="white"/>
      <rect x="574" y="74" width="24" height="24" rx="6" fill="#EFF6FF"/>
      <text x="574" y="109" fill="#94A3B8" fontSize="9" fontFamily="system-ui">DOCS GERADOS</text>
      <text x="574" y="100" fill="#0F172A" fontSize="22" fontWeight="800" fontFamily="system-ui">128</text>
      <rect x="738" y="62" width="198" height="72" rx="10" fill="white"/>
      <rect x="752" y="74" width="24" height="24" rx="6" fill="#FFF7ED"/>
      <text x="752" y="109" fill="#94A3B8" fontSize="9" fontFamily="system-ui">ATIVIDADES</text>
      <text x="752" y="100" fill="#0F172A" fontSize="22" fontWeight="800" fontFamily="system-ui">56</text>
      <rect x="204" y="146" width="408" height="224" rx="12" fill="white"/>
      <text x="222" y="167" fill="#0F172A" fontSize="13" fontWeight="700" fontFamily="system-ui">Créditos IA Utilizados</text>
      <text x="594" y="167" fill="#6B5CE7" fontSize="12" fontWeight="700" fontFamily="system-ui" textAnchor="end">847 total</text>
      {[0,1,2,3].map(i => (
        <line key={i} x1="222" y1={346 - i*44} x2="590" y2={346 - i*44} stroke="#F1F5F9" strokeWidth="1"/>
      ))}
      <path d="M 222,346 L 222,257 L 255,302 L 288,251 L 321,283 L 354,238 L 387,274 L 420,233 L 453,257 L 486,244 L 519,277 L 552,229 L 585,262 L 585,346 Z" fill="url(#db-area)"/>
      <polyline points="222,257 255,302 288,251 321,283 354,238 387,274 420,233 453,257 486,244 519,277 552,229 585,262" fill="none" stroke="#6B5CE7" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx="585" cy="262" r="4" fill="#6B5CE7"/>
      <circle cx="585" cy="262" r="7" fill="#6B5CE7" opacity="0.15"/>
      <rect x="622" y="146" width="316" height="224" rx="12" fill="white"/>
      <text x="640" y="167" fill="#0F172A" fontSize="13" fontWeight="700" fontFamily="system-ui">Alunos Recentes</text>
      {[
        { initials:'TM', name:'Tomás M.',   tag:'TEA',      tc:'#6B5CE7', tb:'#EEEBFF', y:184 },
        { initials:'LF', name:'Laura F.',   tag:'TDAH',     tc:'#0A9396', tb:'#ECFAFA', y:222 },
        { initials:'RG', name:'Rafael G.',  tag:'DI',       tc:'#1E3A5F', tb:'#EFF6FF', y:260 },
        { initials:'MC', name:'Maria C.',   tag:'Dislexia', tc:'#B45309', tb:'#FEF3C7', y:298 },
      ].map(s => (
        <g key={s.name}>
          <circle cx="654" cy={s.y+14} r="12" fill="#1E3A5F" opacity="0.10"/>
          <text x="654" y={s.y+19} textAnchor="middle" fill="#1E3A5F" fontSize="9" fontWeight="700" fontFamily="system-ui">{s.initials}</text>
          <text x="674" y={s.y+13} fill="#0F172A" fontSize="11" fontWeight="600" fontFamily="system-ui">{s.name}</text>
          <rect x={920 - s.tag.length*7 - 12} y={s.y+6} width={s.tag.length*7+12} height="16" rx="4" fill={s.tb}/>
          <text x={920 - s.tag.length*3.5} y={s.y+17} textAnchor="middle" fill={s.tc} fontSize="9" fontWeight="700" fontFamily="system-ui">{s.tag}</text>
        </g>
      ))}
      <rect x="204" y="380" width="296" height="148" rx="12" fill="white"/>
      <text x="222" y="401" fill="#0F172A" fontSize="13" fontWeight="700" fontFamily="system-ui">Protocolos</text>
      {[
        { label:'PEI — Tomás M.',    status:'Aprovado', sc:'#0A9396', sb:'#ECFAFA' },
        { label:'PAEE — Laura F.',   status:'Rascunho', sc:'#F59E0B', sb:'#FEF3C7' },
        { label:'PDI — Rafael G.',   status:'Revisão',  sc:'#6B5CE7', sb:'#EEEBFF' },
      ].map((item, i) => (
        <g key={item.label}>
          <text x="222" y={421 + i*38} fill="#374151" fontSize="11" fontFamily="system-ui">{item.label}</text>
          <rect x={472} y={409 + i*38} width={item.status.length*7+12} height="16" rx="4" fill={item.sb}/>
          <text x={472 + (item.status.length*7+12)/2} y={420 + i*38} textAnchor="middle" fill={item.sc} fontSize="9" fontWeight="700" fontFamily="system-ui">{item.status}</text>
        </g>
      ))}
      <rect x="510" y="380" width="428" height="148" rx="12" fill="#0B1929"/>
      <text x="528" y="401" fill="#E2E8F0" fontSize="13" fontWeight="700" fontFamily="system-ui">Copilot Pedagógico</text>
      <rect x="528" y="436" width="392" height="50" rx="8" fill="#121E30"/>
      <text x="542" y="455" fill="#6B8FAB" fontSize="11" fontFamily="system-ui">"Considere adaptar a atividade de leitura com pictogramas</text>
      <text x="542" y="471" fill="#6B8FAB" fontSize="11" fontFamily="system-ui">e pistas visuais para apoiar a compreensão do enunciado."</text>
      <rect x="528" y="494" width="100" height="22" rx="6" fill="#1E3A5F"/>
      <text x="578" y="509" textAnchor="middle" fill="#7BAEC8" fontSize="10" fontWeight="600" fontFamily="system-ui">Aplicar sugestão</text>
    </g>
  </svg>
);

// ─── Workflow mockup SVG ─────────────────────────────────────────────────────
const WorkflowMockup: React.FC = () => (
  <svg viewBox="0 0 720 320" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto', display: 'block' }}>
    <defs>
      <clipPath id="wf-clip"><rect width="720" height="320" rx="14"/></clipPath>
      <marker id="wf-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M 0,0 L 6,3 L 0,6 Z" fill="#1E3A5F"/>
      </marker>
    </defs>
    <g clipPath="url(#wf-clip)">
      <rect width="720" height="320" fill="#0A1422"/>
      {Array.from({length: 20}, (_, r) => Array.from({length: 36}, (_, c) => (
        <circle key={`${r}-${c}`} cx={c*20+10} cy={r*16+8} r="0.7" fill="#132035"/>
      )))}
      <line x1="152" y1="148" x2="200" y2="148" stroke="#1E3A5F" strokeWidth="2" markerEnd="url(#wf-arrow)"/>
      <line x1="326" y1="148" x2="374" y2="148" stroke="#1E3A5F" strokeWidth="2" markerEnd="url(#wf-arrow)"/>
      <line x1="500" y1="148" x2="548" y2="148" stroke="#1E3A5F" strokeWidth="2" markerEnd="url(#wf-arrow)"/>
      <line x1="626" y1="180" x2="626" y2="228" stroke="#1E3A5F" strokeWidth="2" markerEnd="url(#wf-arrow)"/>
      <rect x="20" y="116" width="132" height="64" rx="10" fill="#0F2035" stroke="#1E3A5F" strokeWidth="1.5"/>
      <text x="64" y="143" fill="#C8D8E8" fontSize="10" fontWeight="700" fontFamily="system-ui">Upload Laudo</text>
      <rect x="200" y="116" width="126" height="64" rx="10" fill="#0F0E2A" stroke="#6B5CE7" strokeWidth="1.5"/>
      <text x="244" y="143" fill="#C8C8F8" fontSize="10" fontWeight="700" fontFamily="system-ui">Analisar IA</text>
      <rect x="374" y="116" width="126" height="64" rx="10" fill="#0A1E20" stroke="#0A9396" strokeWidth="1.5"/>
      <text x="418" y="143" fill="#A0DADA" fontSize="10" fontWeight="700" fontFamily="system-ui">Gerar Docs</text>
      <rect x="548" y="116" width="156" height="64" rx="10" fill="#0E1030" stroke="#4A6ACA" strokeWidth="1.5"/>
      <text x="592" y="143" fill="#C8CAEE" fontSize="10" fontWeight="700" fontFamily="system-ui">Copilot</text>
      <rect x="548" y="228" width="156" height="64" rx="10" fill="#0A1E10" stroke="#16803A" strokeWidth="1.5"/>
      <text x="592" y="255" fill="#A0D8B0" fontSize="10" fontWeight="700" fontFamily="system-ui">Exportar PDF</text>
      <text x="592" y="268" fill="#0A6020" fontSize="9" fontFamily="system-ui">SHA-256 · LGPD</text>
      <circle cx="34" cy="297" r="3.5" fill="#22C55E"/>
      <text x="44" y="301" fill="#16803A" fontSize="9" fontFamily="system-ui">Fluxo ativo</text>
    </g>
  </svg>
);

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes lp-rise {
    from { opacity:0; transform:translateY(22px); }
    to   { opacity:1; transform:translateY(0); }
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

  .btn-primary {
    background:#1E3A5F; color:white; border:none; cursor:pointer;
    font-weight:700; font-family:inherit;
    transition:background 0.2s, transform 0.15s, box-shadow 0.2s;
  }
  .btn-primary:hover { background:#162d4a; transform:translateY(-1px); box-shadow:0 8px 24px rgba(30,58,95,0.28); }

  .btn-violet {
    background:#6B5CE7; color:white; border:none; cursor:pointer;
    font-weight:700; font-family:inherit;
    transition:background 0.2s, transform 0.15s, box-shadow 0.2s;
  }
  .btn-violet:hover { background:#5a4dd4; transform:translateY(-1px); box-shadow:0 8px 24px rgba(107,92,231,0.30); }

  .btn-outline {
    background:transparent; cursor:pointer; font-weight:600; font-family:inherit;
    border:1.5px solid #E2E8F0; color:#374151;
    transition:border-color 0.2s, color 0.2s, background 0.2s;
  }
  .btn-outline:hover { border-color:#1E3A5F; color:#1E3A5F; background:rgba(30,58,95,0.03); }

  .btn-ghost {
    background:transparent; border:1.5px solid rgba(255,255,255,0.18);
    color:rgba(255,255,255,0.72); cursor:pointer; font-weight:600; font-family:inherit;
    transition:border-color 0.2s, color 0.2s, background 0.2s;
  }
  .btn-ghost:hover { border-color:rgba(255,255,255,0.45); color:white; background:rgba(255,255,255,0.05); }

  .nav-link {
    font-size:14px; font-weight:500; color:#64748B; text-decoration:none;
    transition:color 0.15s; background:none; border:none; cursor:pointer;
    display:flex; align-items:center; gap:5px; font-family:inherit;
  }
  .nav-link:hover { color:#1E3A5F; }

  /* Pain cards */
  .pain-card {
    padding: 28px 24px;
    border-radius: 14px;
    transition: transform 0.2s, box-shadow 0.2s;
    cursor: default;
  }
  .pain-card:hover { transform: translateY(-2px); }

  /* Solution cards */
  .sol-card {
    display:flex; gap:16px; align-items:flex-start; padding:24px;
    border-radius:14px; background:white;
    transition:box-shadow 0.2s, transform 0.2s, border-color 0.2s;
  }
  .sol-card:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(22,163,74,0.12); }

  .feat-card {
    transition:box-shadow 0.25s, transform 0.25s;
    border:1px solid #E2E8F0; background:white; border-radius:14px; padding:32px 28px;
  }
  .feat-card:hover { box-shadow:0 12px 40px rgba(30,58,95,0.09); transform:translateY(-3px); }

  .cmp-row td { transition:background 0.15s; }
  .cmp-row:hover td { background:rgba(30,58,95,0.02); }

  @media (max-width:900px) {
    .hero-inner { padding-top:100px !important; padding-bottom:72px !important; }
    .two-col { grid-template-columns:1fr !important; gap:48px !important; }
    .feat-grid { grid-template-columns:1fr 1fr !important; }
    .sol-grid  { grid-template-columns:1fr 1fr !important; }
    .pain-grid { grid-template-columns:1fr 1fr !important; }
    .lp-nav { display:none !important; }
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

// ─── Component ───────────────────────────────────────────────────────────────
export const LandingPage: React.FC<Props> = ({ onLogin, onRegister: _onRegister, onAudit, onUpgradeClick }) => {
  const [config, setConfig] = useState<SiteConfig | null>(null);

  useEffect(() => { AdminService.getSiteConfig().then(setConfig); }, []);

  const scrollTo = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const pain    = useReveal<HTMLDivElement>();
  const sol     = useReveal<HTMLDivElement>();
  const lab     = useReveal<HTMLDivElement>();
  const feats   = useReveal<HTMLDivElement>();
  const compare = useReveal<HTMLDivElement>();
  const cta     = useReveal<HTMLDivElement>();

  return (
    <div style={{ fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif", background: C.surface, color: C.ink, minHeight: '100vh' }}>
      <style>{CSS}</style>

      {/* ════════════════════════ NAVBAR ════════════════════════ */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: 'rgba(255,255,255,0.96)',
        borderBottom: `1px solid ${C.border}`,
        backdropFilter: 'blur(16px)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ background: C.blue, padding: 7, borderRadius: 9 }}>
              <Brain size={17} color="white" />
            </div>
            <span style={{ fontSize: 17, fontWeight: 800, color: C.ink, letterSpacing: '-0.025em' }}>IncluiAI</span>
          </div>
          <nav className="lp-nav" style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
            <a href="#problema"     onClick={e => scrollTo(e, 'problema')}     className="nav-link">O Problema</a>
            <a href="#solucao"      onClick={e => scrollTo(e, 'solucao')}      className="nav-link">Solução</a>
            <a href="#diferenciais" onClick={e => scrollTo(e, 'diferenciais')} className="nav-link">Recursos</a>
            <a href="#pricing"      onClick={e => scrollTo(e, 'pricing')}      className="nav-link">Planos</a>
            <button onClick={onAudit} className="nav-link"><ShieldCheck size={14} /> Validar Doc</button>
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button onClick={onLogin} className="btn-outline" style={{ fontSize: 13, padding: '8px 18px', borderRadius: 8 }}>
              Entrar
            </button>
            <button onClick={onLogin} className="btn-primary" style={{ fontSize: 13, padding: '9px 20px', borderRadius: 8 }}>
              Começar Grátis
            </button>
          </div>
        </div>
      </header>

      <main>

        {/* ════════════════════════ HERO ════════════════════════ */}
        <section style={{ background: C.navy, overflow: 'hidden', position: 'relative' }}>
          <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="rgba(107,92,231,0.3)" />
          <div className="hero-inner" style={{ maxWidth: 1200, margin: '0 auto', padding: '148px 28px 80px' }}>
            <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>

              <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="lp-1"
                style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}
              >
                <AnimatedGradientText>
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.05em' }}>
                    ✦ Decreto nº 12.686/2025 · IA Educacional Certificada · +1.800 professores ativos
                  </span>
                </AnimatedGradientText>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.1 }}
                className="lp-2"
                style={{
                  fontSize: 'clamp(34px, 5.5vw, 66px)',
                  fontWeight: 800,
                  color: '#EEF2F8',
                  lineHeight: 1.07,
                  letterSpacing: '-0.035em',
                  marginBottom: 24,
                }}
              >
                Seu aluno não pode esperar<br />
                <Highlight className="text-white">4 horas pelo PEI</Highlight><br />
                que você ainda está fazendo.
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="lp-3"
                style={{
                  fontSize: 18,
                  color: '#6B8FAB',
                  lineHeight: 1.72,
                  maxWidth: 580,
                  margin: '0 auto 44px',
                }}
              >
                O IncluiAI elimina a burocracia pedagógica que consome seu tempo e cria base de dados,
                KPIs e documentos normatizados para cada aluno — em minutos, não em horas.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="lp-4 hero-ctas"
                style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 60 }}
              >
                <ShimmerButton onClick={onLogin} shimmerColor="#C69214" background="#1F4E5F" borderRadius="8px" className="text-base font-semibold">
                  Começar grátis <ArrowRight size={17} />
                </ShimmerButton>
                <a href="#problema" onClick={e => scrollTo(e, 'problema')} className="btn-ghost" style={{ fontSize: 15, padding: '14px 32px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                  Ver o problema
                </a>
              </motion.div>

              <div className="lp-5" style={{ display: 'flex', gap: 40, justifyContent: 'center', paddingTop: 36, borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                {[
                  { val: '+12.000', label: 'Documentos gerados' },
                  { val: '+1.800',  label: 'Professores ativos'  },
                  { val: '100%',    label: 'LGPD conforme'        },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#EEF2F8', letterSpacing: '-0.025em' }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: '#2E4A60', fontWeight: 600, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px 0' }}>
            <div style={{
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 16, overflow: 'hidden',
              boxShadow: '0 40px 100px rgba(0,0,0,0.5)',
              marginBottom: -80, position: 'relative', zIndex: 2,
            }}>
              <DashboardMockup />
            </div>
          </div>
        </section>

        {/* ════════════════════════ DOR ════════════════════════ */}
        <section id="problema" style={{ background: PAIN.bg, paddingTop: 140, paddingBottom: 96 }}>
          <div ref={pain.ref} style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>

            {/* Header */}
            <div className={`reveal ${pain.visible ? 'on' : ''}`} style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 64px' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#2D0808', border: `1px solid ${PAIN.border}`,
                padding: '6px 16px', borderRadius: 100, marginBottom: 22,
              }}>
                <AlertTriangle size={13} color={PAIN.accent} />
                <span style={{ fontSize: 11, fontWeight: 700, color: PAIN.accent, textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                  A realidade que ninguém fala
                </span>
              </div>

              <h2 style={{
                fontSize: 'clamp(30px, 4vw, 50px)', fontWeight: 800,
                color: '#FEF2F2', letterSpacing: '-0.03em', lineHeight: 1.10,
                marginBottom: 20,
              }}>
                Você passa mais tempo<br />
                <span style={{ color: PAIN.accent }}>fazendo documento</span><br />
                do que ensinando.
              </h2>
              <p style={{ fontSize: 16, color: '#FDA4AF', lineHeight: 1.72 }}>
                E o pior: mesmo com todo esse esforço, as informações se perdem,
                os padrões não existem e as decisões continuam sendo tomadas no achismo.
              </p>
            </div>

            {/* Pain grid */}
            <div className="pain-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                {
                  icon: FolderX,
                  title: 'Kits pedagógicos que viram arquivo morto',
                  desc: 'Você pagou R$297 num kit cheio de promessas. Ficou na pasta Downloads. Nunca foi aberto de novo. O aluno não sentiu nada.',
                  delay: 'rd1',
                },
                {
                  icon: Clock,
                  title: '4 horas fazendo um PEI que já deveria estar pronto',
                  desc: 'Toda segunda-feira você monta do zero. Sem base histórica, sem padrão. No ano seguinte, começa tudo outra vez.',
                  delay: 'rd2',
                },
                {
                  icon: AlertTriangle,
                  title: '"Pasta Alunos 2024 / cópia FINAL v3 def revisado"',
                  desc: 'Documentos espalhados em pastas aleatórias, pen drives, e-mail e armário. Na hora que precisa, ninguém encontra nada.',
                  delay: 'rd3',
                },
                {
                  icon: Trash2,
                  title: 'Relatórios escritos do zero. Sempre. Pra cada aluno.',
                  desc: 'Como se a história de cada criança não existisse. Como se o laudo de 2022 tivesse evaporado. Todo início de ano, estaca zero.',
                  delay: 'rd4',
                },
                {
                  icon: X,
                  title: 'Reuniões sem dado, decisões no achismo',
                  desc: 'Não existe KPI, não existe histórico visual, não existe base de dados. As decisões sobre o aluno saem de impressões de corredor.',
                  delay: 'rd5',
                },
                {
                  icon: FileText,
                  title: 'Cada professor tem o seu "padrão". Nenhum bate.',
                  desc: 'Cada gestão muda o formato, cada professor cria o seu modelo. Quem paga a conta é o aluno com necessidade especial que precisa de consistência.',
                  delay: 'rd6',
                },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className={`pain-card reveal ${item.delay} ${pain.visible ? 'on' : ''}`}
                    style={{
                      background: PAIN.card,
                      border: `1px solid ${PAIN.softBorder}`,
                    }}
                  >
                    <div style={{
                      width: 40, height: 40,
                      background: '#2D0808',
                      border: `1px solid ${PAIN.border}`,
                      borderRadius: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: 16,
                    }}>
                      <Icon size={18} color={PAIN.accent} />
                    </div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#FECACA', marginBottom: 10, lineHeight: 1.3 }}>
                      {item.title}
                    </h3>
                    <p style={{ fontSize: 13, color: '#6B2020', lineHeight: 1.65 }}>
                      {item.desc}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Bottom callout */}
            <div className={`reveal rd3 ${pain.visible ? 'on' : ''}`} style={{
              marginTop: 48,
              background: '#1A0808',
              border: `1px solid ${PAIN.border}`,
              borderRadius: 16,
              padding: '32px 36px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 24,
            }}>
              <div>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#FEF2F2', marginBottom: 6 }}>
                  Isso não é problema de organização pessoal.
                </p>
                <p style={{ fontSize: 15, color: '#6B2020', lineHeight: 1.65 }}>
                  É falta de um sistema que trabalhe por você. O IncluiAI foi feito para isso.
                </p>
              </div>
              <button onClick={onLogin} style={{
                background: '#EF4444', color: 'white',
                border: 'none', padding: '14px 28px', borderRadius: 10,
                fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 8,
                whiteSpace: 'nowrap',
                transition: 'background 0.2s',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = '#DC2626')}
                onMouseLeave={e => (e.currentTarget.style.background = '#EF4444')}
              >
                Quero resolver isso <ArrowRight size={16} />
              </button>
            </div>

          </div>
        </section>

        {/* ════════════════════════ SOLUÇÃO ════════════════════════ */}
        <section id="solucao" style={{ background: SOL.bg, padding: '96px 0' }}>
          <div ref={sol.ref} style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>

            {/* Header */}
            <div className={`reveal ${sol.visible ? 'on' : ''}`} style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 64px' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#DCFCE7', border: '1px solid #BBF7D0',
                padding: '6px 16px', borderRadius: 100, marginBottom: 22,
              }}>
                <CheckCircle size={13} color="#16A34A" />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                  A solução que você precisava
                </span>
              </div>

              <h2 style={{
                fontSize: 'clamp(30px, 4vw, 50px)', fontWeight: 800,
                color: SOL.ink, letterSpacing: '-0.03em', lineHeight: 1.10,
                marginBottom: 20,
              }}>
                Base de dados, KPIs e documentos<br />
                <span style={{ color: SOL.accent }}>que trabalham por você.</span>
              </h2>
              <p style={{ fontSize: 16, color: '#4B7A5A', lineHeight: 1.72 }}>
                Tudo centralizado. Tudo padronizado. Tudo acessível em segundos.
                Decisões cirúrgicas baseadas em dados reais — não em impressões de corredor.
              </p>
            </div>

            {/* Solution grid */}
            <div className="sol-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                {
                  icon: Database,
                  title: 'Base de dados centralizada por aluno',
                  desc: 'Histórico completo — laudos, atendimentos, atividades, evolução. Nada se perde. Qualquer membro da equipe acessa na hora que precisa.',
                  delay: 'rd1',
                },
                {
                  icon: PieChart,
                  title: 'KPIs pedagógicos em tempo real',
                  desc: 'Você vê o que está funcionando antes que seja tarde. Dashboard com indicadores de evolução, créditos, protocolos e muito mais.',
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
                  title: 'Decisões baseadas em dados reais',
                  desc: 'Perfil cognitivo em radar de 10 dimensões. Timeline completa do aluno. Relatórios que mostram o que mudou, não apenas o que foi feito.',
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
                    style={{ border: `1px solid ${SOL.border}` }}
                  >
                    <div style={{
                      width: 44, height: 44,
                      background: '#DCFCE7',
                      borderRadius: 11,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, marginTop: 2,
                    }}>
                      <Icon size={20} color={SOL.accent} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: SOL.ink, marginBottom: 8 }}>
                        {item.title}
                      </h3>
                      <p style={{ fontSize: 14, color: '#4B7A5A', lineHeight: 1.68 }}>{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom CTA */}
            <div className={`reveal rd4 ${sol.visible ? 'on' : ''}`} style={{
              marginTop: 48,
              background: 'white',
              border: '1px solid #BBF7D0',
              borderRadius: 16,
              padding: '32px 36px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 24,
            }}>
              <div>
                <p style={{ fontSize: 20, fontWeight: 800, color: SOL.ink, marginBottom: 6 }}>
                  Pronto pra trabalhar de forma diferente?
                </p>
                <p style={{ fontSize: 15, color: '#4B7A5A', lineHeight: 1.65 }}>
                  Comece grátis, sem cartão. Configure em menos de 5 minutos.
                </p>
              </div>
              <button onClick={onLogin} style={{
                background: SOL.accent, color: 'white',
                border: 'none', padding: '14px 28px', borderRadius: 10,
                fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                transition: 'background 0.2s',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = '#15803D')}
                onMouseLeave={e => (e.currentTarget.style.background = SOL.accent)}
              >
                Quero experimentar <ArrowRight size={16} />
              </button>
            </div>

          </div>
        </section>

        {/* ════════════════════════ INCLUIAB ════════════════════════ */}
        <section id="lab" style={{ background: C.bg, padding: '96px 0' }}>
          <div ref={lab.ref} style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>
            <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>
              <div>
                <p className={`reveal ${lab.visible ? 'on' : ''}`} style={{ fontSize: 11, fontWeight: 700, color: C.violet, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>
                  IncluiLAB
                </p>
                <h2 className={`reveal rd1 ${lab.visible ? 'on' : ''}`} style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: 18 }}>
                  O laboratório de inteligência pedagógica que trabalha enquanto você descansa.
                </h2>
                <p className={`reveal rd2 ${lab.visible ? 'on' : ''}`} style={{ fontSize: 17, color: C.muted, lineHeight: 1.72, marginBottom: 40 }}>
                  Monte fluxos de trabalho inteligentes, automatize processos e deixe a IA fazer o trabalho pesado — tudo visualmente, sem código.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                  {[
                    { icon: Zap,      name: 'AtivaIA',    desc: 'Gere atividades pedagógicas completas em segundos — objetivos BNCC, enunciados acessíveis e questões adaptadas por perfil cognitivo.', delay: 'rd3' },
                    { icon: Layers,   name: 'EduLensIA',  desc: 'Escaneie qualquer atividade e adapte automaticamente para TEA, TDAH, Dislexia ou DI. Sem reescrever do zero nunca mais.', delay: 'rd4' },
                    { icon: Sparkles, name: 'NeuroDesign', desc: 'Redesenhe textos com layout pedagógico acessível, pictogramas e organização visual estruturada para cada diagnóstico.', delay: 'rd5' },
                  ].map(m => {
                    const Icon = m.icon;
                    return (
                      <div key={m.name} className={`reveal ${m.delay} ${lab.visible ? 'on' : ''}`} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                        <div style={{ width: 40, height: 40, background: C.blue, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon size={17} color="white" />
                        </div>
                        <div>
                          <h4 style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{m.name}</h4>
                          <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65 }}>{m.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className={`reveal rd2 ${lab.visible ? 'on' : ''}`}>
                <div style={{ border: `1px solid rgba(107,92,231,0.20)`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 60px rgba(11,25,41,0.30)' }}>
                  <WorkflowMockup />
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  {[{ label: 'Nodes conectados', color: C.violet }, { label: 'IA integrada', color: C.teal }, { label: 'Templates prontos', color: C.blue }].map(tag => (
                    <div key={tag.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color, display: 'inline-block' }}/>
                      <span style={{ fontSize: 12, color: C.subtle, fontWeight: 500 }}>{tag.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════════ DIFERENCIAIS ════════════════════════ */}
        <section id="diferenciais" style={{ background: C.surface, padding: '96px 0' }}>
          <div ref={feats.ref} style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${feats.visible ? 'on' : ''}`} style={{ marginBottom: 56 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.blue, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>Diferenciais</p>
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.025em', maxWidth: 560, lineHeight: 1.15 }}>
                Muito além de um gerador de documentos.
              </h2>
              <p style={{ fontSize: 17, color: C.muted, lineHeight: 1.65, maxWidth: 480, marginTop: 14 }}>
                O IncluiAI é uma plataforma de inteligência pedagógica que organiza,
                analisa e decide com você — não só imprime.
              </p>
            </div>

            <div className="feat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { icon: Target,        title: 'Perfil Cognitivo em 10 Dimensões',   desc: 'Radar visual com evolução temporal. Analisa fichas, laudos e observações para gerar recomendações pedagógicas precisas.',      accent: C.violet, delay: 'rd1' },
                { icon: MessageSquare, title: 'Copilot Pedagógico Contextual',       desc: 'IA que sugere automaticamente os próximos passos com base no histórico real do aluno — não em templates genéricos.',             accent: C.teal,   delay: 'rd2' },
                { icon: Cpu,           title: 'Editor Visual de Fluxos de IA',       desc: 'Monte automações pedagógicas inteligentes sem código. Arrastar e soltar. Resultado em minutos.',                                  accent: C.blue,   delay: 'rd3' },
                { icon: BookOpen,      title: 'Biblioteca de Templates Prontos',     desc: 'Fluxos e documentos pré-configurados para TEA, TDAH, DI, Dislexia e outros. Adapte em segundos.',                                 accent: C.violet, delay: 'rd4' },
                { icon: TrendingUp,    title: 'Timeline Completa do Aluno',          desc: 'Toda a jornada organizada automaticamente — documentos, atendimentos, atividades e marcos. Nunca mais perde o fio.',              accent: C.teal,   delay: 'rd5' },
                { icon: ShieldCheck,   title: 'Documentos com Validade Técnica',     desc: 'Assinatura digital, código SHA-256 e rastreabilidade total. Documentos que têm valor institucional de verdade.',                  accent: C.blue,   delay: 'rd6' },
              ].map(f => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className={`feat-card reveal ${f.delay} ${feats.visible ? 'on' : ''}`}>
                    <div style={{ width: 44, height: 44, background: `${f.accent}14`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                      <Icon size={20} color={f.accent} />
                    </div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 10 }}>{f.title}</h3>
                    <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.72 }}>{f.desc}</p>
                  </div>
                );
              })}
            </div>

          </div>
        </section>

        {/* ════════════════════════ COMPARAÇÃO ════════════════════════ */}
        <section style={{ background: C.bg, padding: '96px 0' }}>
          <div ref={compare.ref} style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${compare.visible ? 'on' : ''}`} style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto 56px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.blue, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>Comparação</p>
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: 16 }}>
                IncluiAI vs. Tudo que você usou antes
              </h2>
              <p style={{ fontSize: 17, color: C.muted, lineHeight: 1.65 }}>
                Kits vendem arquivos. Excel vira bagunça. O IncluiAI entrega inteligência pedagógica que evolui.
              </p>
            </div>

            <div className={`reveal rd1 ${compare.visible ? 'on' : ''}`} style={{ maxWidth: 860, margin: '0 auto', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '14px 24px', textAlign: 'left', borderBottom: `2px solid ${C.border}`, color: C.subtle, fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Critério</th>
                    <th style={{ padding: '14px 24px', textAlign: 'center', borderBottom: `2px solid ${C.border}`, color: '#DC2626', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 160 }}>Kits / Excel / Pastas</th>
                    <th style={{ padding: '14px 24px', textAlign: 'center', borderBottom: `2px solid ${C.blue}`, color: C.blue, fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 160, background: `${C.blue}06` }}>IncluiAI</th>
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
                    <tr key={row.label} className="cmp-row" style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '16px 24px', fontWeight: 500, color: '#374151', fontSize: 15 }}>{row.label}</td>
                      <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                        {row.kit
                          ? <CheckCircle size={17} color="#CBD5E1" style={{ margin: '0 auto', display: 'block' }} />
                          : <X size={15} color="#FCA5A5" style={{ margin: '0 auto', display: 'block' }} />}
                      </td>
                      <td style={{ padding: '16px 24px', textAlign: 'center', background: `${C.blue}04` }}>
                        {row.us
                          ? <CheckCircle size={17} color={C.teal} style={{ margin: '0 auto', display: 'block' }} />
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

        {/* ════════════════════════ CTA FINAL ════════════════════════ */}
        <section style={{ background: C.navy, padding: '120px 0' }}>
          <div ref={cta.ref} style={{ maxWidth: 720, margin: '0 auto', padding: '0 28px', textAlign: 'center' }}>
            <div className={`reveal ${cta.visible ? 'on' : ''}`}>

              <p style={{ fontSize: 11, fontWeight: 700, color: C.violet, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 22 }}>
                Comece hoje
              </p>

              <h2 style={{ fontSize: 'clamp(32px, 5.5vw, 60px)', fontWeight: 800, color: '#EEF2F8', letterSpacing: '-0.035em', lineHeight: 1.08, marginBottom: 22 }}>
                Cada hora gasta com burocracia<br />
                <span style={{ color: C.violet }}>é uma hora longe do seu aluno.</span>
              </h2>

              <p style={{ fontSize: 18, color: '#3A5A74', lineHeight: 1.72, maxWidth: 480, margin: '0 auto 48px' }}>
                Mais de 1.800 professores já pararam de perder tempo com papeis,
                pastas e kits que não funcionam. Agora é a sua vez.
              </p>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={onLogin} className="btn-violet" style={{ fontSize: 15, padding: '15px 40px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  Começar grátis agora <ArrowRight size={17} />
                </button>
                <button onClick={onLogin} className="btn-ghost" style={{ fontSize: 15, padding: '15px 32px', borderRadius: 8 }}>
                  Ver uma demonstração
                </button>
              </div>

              <p style={{ fontSize: 13, color: '#1E3A55', marginTop: 20 }}>
                Grátis para sempre no plano básico. Sem cartão de crédito. Sem pegadinha.
              </p>

            </div>
          </div>
        </section>

      </main>

      {/* ════════════════════════ FOOTER ════════════════════════ */}
      <footer style={{ background: '#070E18', borderTop: '1px solid rgba(255,255,255,0.04)', padding: '44px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>
          <div className="footer-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: C.blue, padding: 6, borderRadius: 8 }}>
                <Brain size={16} color="white" />
              </div>
              <span style={{ fontWeight: 800, fontSize: 16, color: '#EEF2F8', letterSpacing: '-0.02em' }}>IncluiAI</span>
            </div>
            <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={onAudit} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#2A4A60', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#4A7A9B')}
                onMouseLeave={e => (e.currentTarget.style.color = '#2A4A60')}>
                <ShieldCheck size={13} /> Validar Documento
              </button>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#2A4A60' }}>
                <Phone size={13} /> {config?.contactPhone || '(11) 99999-9999'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#2A4A60' }}>
                <Lock size={13} /> LGPD Conforme
              </span>
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <p style={{ fontSize: 12, color: '#1A2E40' }}>© 2025 IncluiAI. Todos os direitos reservados.</p>
            <p style={{ fontSize: 12, color: '#1A2E40' }}>Decreto nº 12.686/2025 · IA Educacional Certificada</p>
          </div>
        </div>
      </footer>

    </div>
  );
};
