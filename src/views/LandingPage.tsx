import React, { useState, useEffect, useRef } from 'react';
import {
  Brain, ShieldCheck, FileText, ArrowRight,
  CheckCircle, Lock, Phone,
  Zap, Sparkles, X,
  BarChart3, Layers,
  BookOpen, MessageSquare, TrendingUp,
  Target, GitMerge
} from 'lucide-react';
import { PlanTier, SiteConfig } from '../types';
import { PaymentService } from '../services/paymentService';
import { AdminService } from '../services/adminService';

interface Props {
  onLogin: () => void;
  onRegister: () => void;
  onAudit: () => void;
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

// ─── Dashboard mockup SVG ────────────────────────────────────────────────────
const DashboardMockup: React.FC = () => (
  <svg viewBox="0 0 960 548" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto', display: 'block' }}>
    <defs>
      <clipPath id="db-clip"><rect width="960" height="548" rx="14"/></clipPath>
      <linearGradient id="db-area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6B5CE7" stopOpacity="0.22"/>
        <stop offset="100%" stopColor="#6B5CE7" stopOpacity="0"/>
      </linearGradient>
      <linearGradient id="db-area2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0A9396" stopOpacity="0.18"/>
        <stop offset="100%" stopColor="#0A9396" stopOpacity="0"/>
      </linearGradient>
    </defs>
    <g clipPath="url(#db-clip)">
      {/* BG */}
      <rect width="960" height="548" fill="#F1F5F9"/>

      {/* SIDEBAR */}
      <rect width="186" height="548" fill="#0B1929"/>
      {/* Logo */}
      <rect x="16" y="14" width="32" height="32" rx="8" fill="#1E3A5F"/>
      <circle cx="32" cy="30" r="7" fill="none" stroke="#5A8AB0" strokeWidth="1.5"/>
      <circle cx="32" cy="30" r="3" fill="#5A8AB0"/>
      <text x="58" y="33" fill="#E2E8F0" fontSize="13" fontWeight="700" fontFamily="system-ui" letterSpacing="-0.3">IncluiAI</text>
      {/* Nav */}
      <rect x="8" y="62" width="170" height="30" rx="7" fill="#1E3A5F"/>
      <rect x="20" y="69" width="14" height="14" rx="3" fill="#4A7A9B"/>
      <text x="42" y="80" fill="#E2E8F0" fontSize="11" fontWeight="600" fontFamily="system-ui">Dashboard</text>
      {['Alunos', 'Agenda', 'Protocolos', 'IncluiLAB', 'Relatórios', 'Copilot'].map((label, i) => (
        <g key={label}>
          <rect x="20" y={103 + i * 36} width="14" height="14" rx="3" fill="#152A40" opacity="0.9"/>
          <text x="42" y={114 + i * 36} fill="#2E5070" fontSize="11" fontFamily="system-ui">{label}</text>
        </g>
      ))}
      {/* User bottom */}
      <line x1="16" y1="488" x2="170" y2="488" stroke="#1A2E45" strokeWidth="1"/>
      <circle cx="32" cy="510" r="12" fill="#1E3A5F"/>
      <text x="32" y="515" textAnchor="middle" fill="#7BAEC8" fontSize="9" fontWeight="700" fontFamily="system-ui">AP</text>
      <text x="52" y="507" fill="#3A5A74" fontSize="11" fontFamily="system-ui">Ana Paula</text>
      <text x="52" y="520" fill="#243A50" fontSize="9" fontFamily="system-ui">Plano Pro</text>

      {/* HEADER */}
      <rect x="186" y="0" width="774" height="50" fill="white" opacity="0.98"/>
      <line x1="186" y1="50" x2="960" y2="50" stroke="#E8ECF2" strokeWidth="1"/>
      <text x="204" y="21" fill="#0F172A" fontSize="14" fontWeight="700" fontFamily="system-ui">Visão Geral</text>
      <text x="204" y="37" fill="#94A3B8" fontSize="10" fontFamily="system-ui">Março 2025  ·  Turma Especial A</text>
      <circle cx="934" cy="25" r="13" fill="#1E3A5F"/>
      <text x="934" y="30" textAnchor="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="system-ui">AP</text>
      <rect x="898" y="13" width="18" height="20" rx="5" fill="none" stroke="#CBD5E1" strokeWidth="1.2"/>
      <circle cx="919" cy="11" r="3" fill="#6B5CE7"/>

      {/* KPI CARDS */}
      {/* Card 1 */}
      <rect x="204" y="62" width="168" height="72" rx="10" fill="white"/>
      <rect x="218" y="74" width="24" height="24" rx="6" fill="#EEEBFF"/>
      <rect x="224" y="80" width="12" height="12" rx="2" fill="#6B5CE7" opacity="0.8"/>
      <text x="218" y="109" fill="#94A3B8" fontSize="9" fontFamily="system-ui">ALUNOS ATIVOS</text>
      <text x="218" y="100" fill="#0F172A" fontSize="22" fontWeight="800" fontFamily="system-ui">24</text>
      <text x="360" y="80" fill="#0A9396" fontSize="9" fontWeight="600" fontFamily="system-ui" textAnchor="end">↑ 4</text>
      {/* Card 2 */}
      <rect x="382" y="62" width="168" height="72" rx="10" fill="white"/>
      <rect x="396" y="74" width="24" height="24" rx="6" fill="#ECFAFA"/>
      <rect x="402" y="80" width="12" height="12" rx="2" fill="#0A9396" opacity="0.8"/>
      <text x="396" y="109" fill="#94A3B8" fontSize="9" fontFamily="system-ui">CRÉDITOS IA</text>
      <text x="396" y="100" fill="#0F172A" fontSize="22" fontWeight="800" fontFamily="system-ui">47</text>
      <text x="538" y="109" fill="#94A3B8" fontSize="9" fontFamily="system-ui" textAnchor="end">/800</text>
      {/* Card 3 */}
      <rect x="560" y="62" width="168" height="72" rx="10" fill="white"/>
      <rect x="574" y="74" width="24" height="24" rx="6" fill="#EFF6FF"/>
      <rect x="580" y="80" width="12" height="12" rx="2" fill="#1E3A5F" opacity="0.7"/>
      <text x="574" y="109" fill="#94A3B8" fontSize="9" fontFamily="system-ui">DOCS GERADOS</text>
      <text x="574" y="100" fill="#0F172A" fontSize="22" fontWeight="800" fontFamily="system-ui">128</text>
      {/* Card 4 */}
      <rect x="738" y="62" width="198" height="72" rx="10" fill="white"/>
      <rect x="752" y="74" width="24" height="24" rx="6" fill="#FFF7ED"/>
      <rect x="758" y="80" width="12" height="12" rx="2" fill="#F59E0B" opacity="0.8"/>
      <text x="752" y="109" fill="#94A3B8" fontSize="9" fontFamily="system-ui">ATIVIDADES</text>
      <text x="752" y="100" fill="#0F172A" fontSize="22" fontWeight="800" fontFamily="system-ui">56</text>
      <text x="924" y="109" fill="#0A9396" fontSize="9" fontWeight="600" fontFamily="system-ui" textAnchor="end">este mês</text>

      {/* CHART CARD */}
      <rect x="204" y="146" width="408" height="224" rx="12" fill="white"/>
      <text x="222" y="167" fill="#0F172A" fontSize="13" fontWeight="700" fontFamily="system-ui">Créditos IA Utilizados</text>
      <text x="222" y="181" fill="#94A3B8" fontSize="10" fontFamily="system-ui">Últimos 12 meses</text>
      <text x="594" y="167" fill="#6B5CE7" fontSize="12" fontWeight="700" fontFamily="system-ui" textAnchor="end">847 total</text>
      {/* Grid */}
      {[0,1,2,3].map(i => (
        <line key={i} x1="222" y1={346 - i*44} x2="590" y2={346 - i*44} stroke="#F1F5F9" strokeWidth="1"/>
      ))}
      {/* Area fill */}
      <path
        d="M 222,346 L 222,257 L 255,302 L 288,251 L 321,283 L 354,238 L 387,274 L 420,233 L 453,257 L 486,244 L 519,277 L 552,229 L 585,262 L 585,346 Z"
        fill="url(#db-area)"
      />
      {/* Line */}
      <polyline
        points="222,257 255,302 288,251 321,283 354,238 387,274 420,233 453,257 486,244 519,277 552,229 585,262"
        fill="none" stroke="#6B5CE7" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"
      />
      {/* Dot on last point */}
      <circle cx="585" cy="262" r="4" fill="#6B5CE7"/>
      <circle cx="585" cy="262" r="7" fill="#6B5CE7" opacity="0.15"/>
      {/* X labels */}
      {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].filter((_, i) => i % 2 === 0).map((m, i) => (
        <text key={m} x={222 + i*66} y="360" fill="#CBD5E1" fontSize="9" fontFamily="system-ui">{m}</text>
      ))}

      {/* STUDENTS CARD */}
      <rect x="622" y="146" width="316" height="224" rx="12" fill="white"/>
      <text x="640" y="167" fill="#0F172A" fontSize="13" fontWeight="700" fontFamily="system-ui">Alunos Recentes</text>
      <text x="920" y="167" fill="#6B5CE7" fontSize="10" fontWeight="600" fontFamily="system-ui" textAnchor="end">Ver todos</text>
      {[
        { initials:'TM', name:'Tomás M.',   tag:'TEA',      tc:'#6B5CE7', tb:'#EEEBFF', y:184 },
        { initials:'LF', name:'Laura F.',   tag:'TDAH',     tc:'#0A9396', tb:'#ECFAFA', y:222 },
        { initials:'RG', name:'Rafael G.',  tag:'DI',       tc:'#1E3A5F', tb:'#EFF6FF', y:260 },
        { initials:'MC', name:'Maria C.',   tag:'Dislexia', tc:'#B45309', tb:'#FEF3C7', y:298 },
      ].map(s => (
        <g key={s.name}>
          <line x1="640" y1={s.y} x2="920" y2={s.y} stroke="#F8FAFC" strokeWidth="1"/>
          <circle cx="654" cy={s.y+14} r="12" fill="#1E3A5F" opacity="0.10"/>
          <text x="654" y={s.y+19} textAnchor="middle" fill="#1E3A5F" fontSize="9" fontWeight="700" fontFamily="system-ui">{s.initials}</text>
          <text x="674" y={s.y+13} fill="#0F172A" fontSize="11" fontWeight="600" fontFamily="system-ui">{s.name}</text>
          <text x="674" y={s.y+25} fill="#94A3B8" fontSize="9" fontFamily="system-ui">Última atualização: hoje</text>
          <rect x={920 - s.tag.length*7 - 12} y={s.y+6} width={s.tag.length*7+12} height="16" rx="4" fill={s.tb}/>
          <text x={920 - s.tag.length*3.5} y={s.y+17} textAnchor="middle" fill={s.tc} fontSize="9" fontWeight="700" fontFamily="system-ui">{s.tag}</text>
        </g>
      ))}

      {/* BOTTOM LEFT: Protocolos */}
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
          {i < 2 && <line x1="222" y1={432 + i*38} x2="488" y2={432 + i*38} stroke="#F1F5F9" strokeWidth="1"/>}
        </g>
      ))}

      {/* BOTTOM RIGHT: Copilot */}
      <rect x="510" y="380" width="428" height="148" rx="12" fill="#0B1929"/>
      <text x="528" y="401" fill="#E2E8F0" fontSize="13" fontWeight="700" fontFamily="system-ui">Copilot Pedagógico</text>
      <line x1="528" y1="410" x2="920" y2="410" stroke="#152840" strokeWidth="1"/>
      <text x="528" y="428" fill="#3A5A74" fontSize="10" fontFamily="system-ui">Sugestão para Tomás M.:</text>
      <rect x="528" y="436" width="392" height="50" rx="8" fill="#121E30"/>
      <text x="542" y="455" fill="#6B8FAB" fontSize="11" fontFamily="system-ui">"Considere adaptar a atividade de leitura com pictogramas</text>
      <text x="542" y="471" fill="#6B8FAB" fontSize="11" fontFamily="system-ui">e pistas visuais para apoiar a compreensão do enunciado."</text>
      <rect x="528" y="494" width="100" height="22" rx="6" fill="#1E3A5F"/>
      <text x="578" y="509" textAnchor="middle" fill="#7BAEC8" fontSize="10" fontWeight="600" fontFamily="system-ui">Aplicar sugestão</text>
      <rect x="638" y="494" width="80" height="22" rx="6" fill="#152840"/>
      <text x="678" y="509" textAnchor="middle" fill="#2E5070" fontSize="10" fontFamily="system-ui">Ignorar</text>
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
      {/* Grid dots */}
      {Array.from({length: 20}, (_, r) => Array.from({length: 36}, (_, c) => (
        <circle key={`${r}-${c}`} cx={c*20+10} cy={r*16+8} r="0.7" fill="#132035" opacity="1"/>
      )))}

      {/* Connections */}
      <line x1="152" y1="148" x2="200" y2="148" stroke="#1E3A5F" strokeWidth="2" markerEnd="url(#wf-arrow)"/>
      <line x1="326" y1="148" x2="374" y2="148" stroke="#1E3A5F" strokeWidth="2" markerEnd="url(#wf-arrow)"/>
      <line x1="500" y1="148" x2="548" y2="148" stroke="#1E3A5F" strokeWidth="2" markerEnd="url(#wf-arrow)"/>
      <line x1="626" y1="180" x2="626" y2="228" stroke="#1E3A5F" strokeWidth="2" markerEnd="url(#wf-arrow)"/>

      {/* Node 1: Upload */}
      <rect x="20" y="116" width="132" height="64" rx="10" fill="#0F2035" stroke="#1E3A5F" strokeWidth="1.5"/>
      <rect x="34" y="128" width="22" height="22" rx="5" fill="#1A3A5A"/>
      <rect x="39" y="131" width="12" height="15" rx="1.5" fill="#4A7AAA" opacity="0.9"/>
      <text x="64" y="143" fill="#C8D8E8" fontSize="10" fontWeight="700" fontFamily="system-ui">Upload Laudo</text>
      <text x="64" y="156" fill="#2E5070" fontSize="9" fontFamily="system-ui">Trigger manual</text>
      <circle cx="148" cy="148" r="4" fill="#132035" stroke="#1E3A5F" strokeWidth="1"/>

      {/* Node 2: Analisar */}
      <rect x="200" y="116" width="126" height="64" rx="10" fill="#0F0E2A" stroke="#6B5CE7" strokeWidth="1.5"/>
      <rect x="214" y="128" width="22" height="22" rx="5" fill="#2A1E6A"/>
      <circle cx="225" cy="139" r="6" fill="none" stroke="#8A7AE7" strokeWidth="1.5"/>
      <circle cx="225" cy="139" r="2.5" fill="#8A7AE7"/>
      <text x="244" y="143" fill="#C8C8F8" fontSize="10" fontWeight="700" fontFamily="system-ui">Analisar</text>
      <text x="244" y="156" fill="#5A4AC7" fontSize="9" fontFamily="system-ui">IA · Gemini</text>
      <circle cx="322" cy="148" r="4" fill="#0F0E2A" stroke="#6B5CE7" strokeWidth="1"/>

      {/* Node 3: Gerar */}
      <rect x="374" y="116" width="126" height="64" rx="10" fill="#0A1E20" stroke="#0A9396" strokeWidth="1.5"/>
      <rect x="388" y="128" width="22" height="22" rx="5" fill="#0A3A3C"/>
      <text x="399" y="143" textAnchor="middle" fill="#0A9396" fontSize="14" fontFamily="system-ui">✦</text>
      <text x="418" y="143" fill="#A0DADA" fontSize="10" fontWeight="700" fontFamily="system-ui">Gerar</text>
      <text x="418" y="156" fill="#0A6366" fontSize="9" fontFamily="system-ui">Atividades</text>
      <circle cx="496" cy="148" r="4" fill="#0A1E20" stroke="#0A9396" strokeWidth="1"/>

      {/* Node 4: Copilot */}
      <rect x="548" y="116" width="156" height="64" rx="10" fill="#0E1030" stroke="#4A6ACA" strokeWidth="1.5"/>
      <rect x="562" y="128" width="22" height="22" rx="5" fill="#1A2060"/>
      <text x="573" y="143" textAnchor="middle" fill="#8090DF" fontSize="13" fontFamily="system-ui">⋮</text>
      <text x="592" y="143" fill="#C8CAEE" fontSize="10" fontWeight="700" fontFamily="system-ui">Copilot</text>
      <text x="592" y="156" fill="#4A5AAA" fontSize="9" fontFamily="system-ui">Revisão IA</text>
      <circle cx="626" cy="180" r="4" fill="#0E1030" stroke="#4A6ACA" strokeWidth="1"/>

      {/* Node 5: Exportar */}
      <rect x="548" y="228" width="156" height="64" rx="10" fill="#0A1E10" stroke="#16803A" strokeWidth="1.5"/>
      <rect x="562" y="240" width="22" height="22" rx="5" fill="#0A3A18"/>
      <rect x="567" y="243" width="12" height="16" rx="1.5" fill="#16803A" opacity="0.9"/>
      <text x="592" y="255" fill="#A0D8B0" fontSize="10" fontWeight="700" fontFamily="system-ui">Exportar PDF</text>
      <text x="592" y="268" fill="#0A6020" fontSize="9" fontFamily="system-ui">SHA-256 · LGPD</text>

      {/* Footer label */}
      <text x="360" y="302" textAnchor="middle" fill="#1E3A5F" fontSize="11" fontFamily="system-ui">Fluxo Pedagógico Inteligente  ·  IncluiLAB</text>
      {/* Status */}
      <rect x="20" y="286" width="110" height="22" rx="6" fill="#0A1E10" stroke="#16803A" strokeWidth="1"/>
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

  .feat-card {
    transition:box-shadow 0.25s, transform 0.25s;
    border:1px solid #E2E8F0; background:white; border-radius:14px; padding:32px 28px;
  }
  .feat-card:hover { box-shadow:0 12px 40px rgba(30,58,95,0.09); transform:translateY(-3px); }

  .plan-card { border-radius:18px; padding:40px 32px; display:flex; flex-direction:column; transition:transform 0.25s, box-shadow 0.25s; }
  .plan-card:hover { transform:translateY(-4px); }

  .sol-card {
    display:flex; gap:16px; align-items:flex-start; padding:24px;
    border:1px solid #E2E8F0; border-radius:12px; background:white;
    transition:border-color 0.2s, box-shadow 0.2s;
  }
  .sol-card:hover { border-color:#6B5CE7; box-shadow:0 4px 20px rgba(107,92,231,0.10); }

  .toggle-pill { display:inline-flex; background:#EDF0F7; border-radius:100px; padding:4px; }
  .toggle-btn {
    padding:8px 28px; border-radius:100px; font-size:14px; font-weight:600;
    cursor:pointer; border:none; font-family:inherit;
    transition:background 0.2s, color 0.2s, box-shadow 0.2s;
  }
  .toggle-btn.on { background:white; color:#1E3A5F; box-shadow:0 2px 8px rgba(0,0,0,0.10); }
  .toggle-btn.off { background:transparent; color:#94A3B8; }

  .cmp-row td { transition:background 0.15s; }
  .cmp-row:hover td { background:rgba(30,58,95,0.02); }

  @media (max-width:900px) {
    .hero-inner { padding-top:100px !important; padding-bottom:72px !important; }
    .two-col { grid-template-columns:1fr !important; gap:48px !important; }
    .feat-grid { grid-template-columns:1fr 1fr !important; }
    .sol-grid  { grid-template-columns:1fr 1fr !important; }
    .pricing-grid { grid-template-columns:1fr !important; max-width:480px !important; }
    .lp-nav { display:none !important; }
  }
  @media (max-width:600px) {
    .hero-ctas { flex-direction:column !important; width:100% !important; }
    .hero-ctas button, .hero-ctas a { width:100% !important; justify-content:center !important; }
    .feat-grid  { grid-template-columns:1fr !important; }
    .sol-grid   { grid-template-columns:1fr !important; }
    .footer-row { flex-direction:column !important; align-items:flex-start !important; }
  }
`;

// ─── Component ───────────────────────────────────────────────────────────────
export const LandingPage: React.FC<Props> = ({ onLogin, onRegister: _onRegister, onAudit }) => {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [annual, setAnnual] = useState(true);

  useEffect(() => { AdminService.getSiteConfig().then(setConfig); }, []);

  const handleCheckout = async (plan: PlanTier) => {
    const url = await PaymentService.getCheckoutUrl(plan, {});
    window.location.href = url;
  };

  const scrollTo = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const pricePro          = config?.pricing.pro_monthly    || 89.00;
  const priceProAnnual    = config?.pricing.pro_annual     || 69.00;
  const priceMaster       = config?.pricing.master_monthly || 127.00;
  const priceMasterAnnual = config?.pricing.master_annual  || 99.00;

  const pain    = useReveal<HTMLDivElement>();
  const sol     = useReveal<HTMLDivElement>();
  const lab     = useReveal<HTMLDivElement>();
  const feats   = useReveal<HTMLDivElement>();
  const compare = useReveal<HTMLDivElement>();
  const price   = useReveal<HTMLDivElement>();
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
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ background: C.blue, padding: 7, borderRadius: 9 }}>
              <Brain size={17} color="white" />
            </div>
            <span style={{ fontSize: 17, fontWeight: 800, color: C.ink, letterSpacing: '-0.025em' }}>IncluiAI</span>
          </div>
          {/* Nav */}
          <nav className="lp-nav" style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
            <a href="#solucao"      onClick={e => scrollTo(e, 'solucao')}      className="nav-link">Solução</a>
            <a href="#diferenciais" onClick={e => scrollTo(e, 'diferenciais')} className="nav-link">Recursos</a>
            <a href="#lab"          onClick={e => scrollTo(e, 'lab')}          className="nav-link">IncluiLAB</a>
            <a href="#pricing"      onClick={e => scrollTo(e, 'pricing')}      className="nav-link">Planos</a>
            <button onClick={onAudit} className="nav-link"><ShieldCheck size={14} /> Validar Doc</button>
          </nav>
          {/* Auth */}
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
        <section style={{ background: C.navy, overflow: 'hidden' }}>
          <div className="hero-inner" style={{ maxWidth: 1200, margin: '0 auto', padding: '148px 28px 80px' }}>
            <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>

              {/* Eyebrow */}
              <div className="lp-1" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid rgba(107,92,231,0.30)`, borderRadius: 100, padding: '5px 16px', marginBottom: 32 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.violet, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: C.violet, letterSpacing: '0.05em' }}>
                  Decreto nº 12.686/2025 · IA Educacional Certificada
                </span>
              </div>

              {/* Headline */}
              <h1 className="lp-2" style={{
                fontSize: 'clamp(36px, 5.5vw, 64px)',
                fontWeight: 800,
                color: '#EEF2F8',
                lineHeight: 1.07,
                letterSpacing: '-0.035em',
                marginBottom: 24,
              }}>
                A primeira plataforma de<br />
                <span style={{ color: C.violet }}>inteligência pedagógica</span><br />
                com IA para educação inclusiva.
              </h1>

              {/* Subheadline */}
              <p className="lp-3" style={{
                fontSize: 18,
                color: '#6B8FAB',
                lineHeight: 1.72,
                maxWidth: 560,
                margin: '0 auto 44px',
              }}>
                Analise laudos, adapte atividades, gere documentos pedagógicos
                e acompanhe a evolução do aluno em um só lugar.
              </p>

              {/* CTAs */}
              <div className="lp-4 hero-ctas" style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 60 }}>
                <button onClick={onLogin} className="btn-violet" style={{ fontSize: 15, padding: '14px 32px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  Começar grátis <ArrowRight size={17} />
                </button>
                <a href="#solucao" onClick={e => scrollTo(e, 'solucao')} className="btn-ghost" style={{ fontSize: 15, padding: '14px 32px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                  Ver demonstração
                </a>
              </div>

              {/* Stats */}
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

          {/* Dashboard image — overflows into next section */}
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px 0' }}>
            <div style={{
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 40px 100px rgba(0,0,0,0.5)',
              marginBottom: -80,
              position: 'relative',
              zIndex: 2,
            }}>
              <DashboardMockup />
            </div>
          </div>
        </section>

        {/* ════════════════════════ DOR ════════════════════════ */}
        <section style={{ background: C.bg, paddingTop: 120, paddingBottom: 96 }}>
          <div ref={pain.ref} style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>

            <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 96, alignItems: 'center' }}>

              {/* Declaração editorial */}
              <div className={`reveal ${pain.visible ? 'on' : ''}`}>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.violet, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20 }}>O Problema</p>
                <h2 style={{ fontSize: 'clamp(30px, 3.8vw, 48px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.03em', lineHeight: 1.10, marginBottom: 0 }}>
                  Professores não precisam<br />de mais arquivos.
                </h2>
                <p style={{ fontSize: 'clamp(30px, 3.8vw, 48px)', fontWeight: 800, color: C.violet, letterSpacing: '-0.03em', lineHeight: 1.10, marginBottom: 28 }}>
                  Precisam de tempo.
                </p>
                <p style={{ fontSize: 16, color: C.muted, lineHeight: 1.75, maxWidth: 400 }}>
                  A rotina da educação inclusiva consome horas de trabalho invisível que deveriam estar inteiramente dedicadas ao aluno.
                </p>
              </div>

              {/* Lista de dores + resolução */}
              <div className={`reveal rd2 ${pain.visible ? 'on' : ''}`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {[
                    'Laudos complexos para interpretar',
                    'Adaptação de atividades feita do zero',
                    'Fichas e relatórios manuais',
                    'Documentação pedagógica dispersa',
                  ].map((item, i) => (
                    <div key={item} style={{
                      display: 'flex', alignItems: 'center', gap: 16,
                      padding: '20px 0',
                      borderBottom: `1px solid ${C.border}`,
                      borderTop: i === 0 ? `1px solid ${C.border}` : undefined,
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.subtle, width: 24, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                      <span style={{ fontSize: 16, fontWeight: 500, color: C.ink }}>{item}</span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 32, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '24px 28px' }}>
                  <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.72, marginBottom: 12 }}>
                    <strong style={{ color: C.ink, fontWeight: 700 }}>Tudo manual.</strong>
                  </p>
                  <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.72 }}>
                    O IncluiAI organiza e automatiza esse processo — para que o professor volte a focar no que importa.
                  </p>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ════════════════════════ SOLUÇÃO ════════════════════════ */}
        <section id="solucao" style={{ background: C.surface, padding: '96px 0' }}>
          <div ref={sol.ref} style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${sol.visible ? 'on' : ''}`} style={{ maxWidth: 560, marginBottom: 56 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.teal, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>Solução</p>
              <h2 className="section-headline" style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: 16 }}>
                Tudo que um professor inclusivo precisa, em um só lugar.
              </h2>
              <p style={{ fontSize: 17, color: C.muted, lineHeight: 1.70 }}>
                O IncluiAI centraliza a inteligência pedagógica para que o professor gaste mais tempo com o aluno e menos com burocracia.
              </p>
            </div>

            <div className="sol-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { icon: FileText,     title: 'Geração de Atividades Adaptadas',    desc: 'Crie atividades personalizadas por perfil cognitivo em minutos, com objetivos BNCC e enunciados acessíveis.',              delay: 'rd1' },
                { icon: BookOpen,     title: 'Análise de Laudos',                   desc: 'Faça upload do laudo e receba uma síntese pedagógica com recomendações práticas para sala de aula.',                         delay: 'rd2' },
                { icon: BarChart3,    title: 'Perfil Cognitivo do Aluno',           desc: 'Radar de 10 dimensões com evolução temporal, gerado automaticamente a partir de fichas e observações.',                      delay: 'rd3' },
                { icon: TrendingUp,   title: 'Timeline Completa',                   desc: 'Toda a jornada do aluno organizada: documentos, laudos, atendimentos, atividades e marcos de desenvolvimento.',              delay: 'rd4' },
                { icon: FileText,     title: 'Geração de PDFs Pedagógicos',         desc: 'PEI, PAEE, PDI e Estudo de Caso com estrutura formal, assinatura digital e código de auditoria SHA-256.',                   delay: 'rd5' },
                { icon: MessageSquare, title: 'Copilot Pedagógico',                 desc: 'IA contextual que sugere os próximos passos pedagógicos com base no histórico e perfil atual do aluno.',                     delay: 'rd6' },
              ].map(f => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className={`sol-card reveal ${f.delay} ${sol.visible ? 'on' : ''}`}>
                    <div style={{ width: 42, height: 42, background: `${C.teal}16`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <Icon size={19} color={C.teal} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 8 }}>{f.title}</h3>
                      <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.68 }}>{f.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </section>

        {/* ════════════════════════ INCLUIAB ════════════════════════ */}
        <section id="lab" style={{ background: C.bg, padding: '96px 0' }}>
          <div ref={lab.ref} style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>
            <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>

              {/* Copy */}
              <div>
                <p className={`reveal ${lab.visible ? 'on' : ''}`} style={{ fontSize: 11, fontWeight: 700, color: C.violet, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>
                  IncluiLAB
                </p>
                <h2 className={`reveal rd1 ${lab.visible ? 'on' : ''}`} style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: 18 }}>
                  O laboratório de inteligência pedagógica do IncluiAI.
                </h2>
                <p className={`reveal rd2 ${lab.visible ? 'on' : ''}`} style={{ fontSize: 17, color: C.muted, lineHeight: 1.72, marginBottom: 40 }}>
                  Monte fluxos de trabalho inteligentes para gerar atividades, adaptar materiais e automatizar processos pedagógicos — visualmente, sem código.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                  {[
                    { icon: Zap,      name: 'AtivaIA',    desc: 'Gere atividades pedagógicas completas com objetivos BNCC, enunciados e questões adaptadas por perfil cognitivo.', delay: 'rd2' },
                    { icon: Layers,   name: 'EduLensIA',  desc: 'Escaneie qualquer atividade e adapte automaticamente para TEA, TDAH, Dislexia ou DI em segundos.', delay: 'rd3' },
                    { icon: Sparkles, name: 'NeuroDesign', desc: 'Redesenhe textos com layout pedagógico acessível, pictogramas e organização visual estruturada.', delay: 'rd4' },
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

              {/* Workflow visual */}
              <div className={`reveal rd2 ${lab.visible ? 'on' : ''}`}>
                <div style={{
                  border: `1px solid rgba(107,92,231,0.20)`,
                  borderRadius: 14,
                  overflow: 'hidden',
                  boxShadow: '0 20px 60px rgba(11,25,41,0.30)',
                }}>
                  <WorkflowMockup />
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  {[
                    { label: 'Nodes conectados', color: C.violet },
                    { label: 'IA integrada',     color: C.teal   },
                    { label: 'Templates prontos', color: C.blue  },
                  ].map(tag => (
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
              <h2 className="section-headline" style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.025em', maxWidth: 520, lineHeight: 1.15 }}>
                Muito além de um gerador de documentos.
              </h2>
            </div>

            <div className="feat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { icon: Target,      title: 'Perfil Cognitivo do Aluno',    desc: 'Analisa fichas, laudos e evolução para gerar recomendações pedagógicas precisas por dimensão cognitiva.',      accent: C.violet, delay: 'rd1' },
                { icon: MessageSquare, title: 'Copilot Pedagógico',          desc: 'Sugere automaticamente os próximos passos no fluxo pedagógico com base no histórico do aluno.',               accent: C.teal,   delay: 'rd2' },
                { icon: GitMerge,    title: 'Editor Visual de IA',           desc: 'Monte fluxos inteligentes para gerar atividades e documentos — sem código, com arrastar e soltar.',           accent: C.blue,   delay: 'rd3' },
                { icon: BookOpen,    title: 'Biblioteca de Fluxos',          desc: 'Templates prontos para diferentes contextos pedagógicos. Adapte, reutilize e compartilhe com a equipe.',       accent: C.violet, delay: 'rd4' },
                { icon: TrendingUp,  title: 'Timeline Completa do Aluno',    desc: 'Toda evolução organizada automaticamente. Documentos, atendimentos, atividades e marcos em um só lugar.',     accent: C.teal,   delay: 'rd5' },
                { icon: ShieldCheck, title: 'Validação de Documentos',       desc: 'Segurança e confiabilidade para documentos pedagógicos com código SHA-256 único e rastreabilidade total.',    accent: C.blue,   delay: 'rd6' },
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
              <h2 className="section-headline" style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: 16 }}>
                IncluiAI vs. Kits Pedagógicos
              </h2>
              <p style={{ fontSize: 17, color: C.muted, lineHeight: 1.65 }}>
                Kits vendem arquivos. O IncluiAI entrega inteligência pedagógica.
              </p>
            </div>

            <div className={`reveal rd1 ${compare.visible ? 'on' : ''}`} style={{ maxWidth: 840, margin: '0 auto', overflowX: 'auto' }}>
              <table className="cmp-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '14px 24px', textAlign: 'left', borderBottom: `2px solid ${C.border}`, color: C.subtle, fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Critério</th>
                    <th style={{ padding: '14px 24px', textAlign: 'center', borderBottom: `2px solid ${C.border}`, color: C.subtle, fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 160 }}>Kits Pedagógicos</th>
                    <th style={{ padding: '14px 24px', textAlign: 'center', borderBottom: `2px solid ${C.blue}`, color: C.blue, fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 160, background: `${C.blue}06`, borderRadius: '8px 8px 0 0' }}>IncluiAI</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Geração personalizada por aluno',   kit: false, us: true  },
                    { label: 'Adaptação com IA',                   kit: false, us: true  },
                    { label: 'Análise de laudos',                  kit: false, us: true  },
                    { label: 'Perfil cognitivo do aluno',         kit: false, us: true  },
                    { label: 'Timeline completa',                  kit: false, us: true  },
                    { label: 'Fluxos reutilizáveis',              kit: false, us: true  },
                    { label: 'Rastreabilidade SHA-256',            kit: false, us: true  },
                    { label: 'Arquivos estáticos genéricos',      kit: true,  us: false },
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
        <section id="pricing" style={{ background: C.surface, padding: '96px 0' }}>
          <div ref={price.ref} style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>

            <div className={`reveal ${price.visible ? 'on' : ''}`} style={{ textAlign: 'center', marginBottom: 48 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.blue, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>Planos</p>
              <h2 className="section-headline" style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.025em', marginBottom: 12 }}>
                Estrutura para cada realidade
              </h2>
              <p style={{ fontSize: 17, color: C.muted, marginBottom: 32 }}>
                Da primeira experiência à operação pedagógica completa.
              </p>

              {/* Toggle */}
              <div className="toggle-pill">
                <button className={`toggle-btn ${!annual ? 'on' : 'off'}`} onClick={() => setAnnual(false)}>Mensal</button>
                <button className={`toggle-btn ${annual ? 'on' : 'off'}`} onClick={() => setAnnual(true)}>
                  Anual <span style={{ fontSize: 11, background: `${C.teal}20`, color: C.teal, padding: '2px 7px', borderRadius: 6, marginLeft: 6, fontWeight: 700 }}>-20%</span>
                </button>
              </div>
              {annual && (
                <p style={{ fontSize: 12, color: C.subtle, marginTop: 12 }}>
                  Plano anual com desconto. Permanência mínima de 12 meses.
                </p>
              )}
            </div>

            <div className={`pricing-grid reveal rd1 ${price.visible ? 'on' : ''}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, maxWidth: 980, margin: '0 auto' }}>

              {/* FREE */}
              <div className="plan-card" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div style={{ marginBottom: 28 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: C.subtle, textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 10 }}>Free</p>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 8 }}>
                    <span style={{ fontSize: 38, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em' }}>R$ 0</span>
                  </div>
                  <p style={{ fontSize: 14, color: C.subtle }}>Para explorar a plataforma</p>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 11, flex: 1 }}>
                  {['20 créditos IA', '1 aluno cadastrado', '1 workflow ativo', 'Geração básica de atividades', 'PDF simples', 'Envio por e-mail'].map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#374151' }}>
                      <CheckCircle size={14} color={C.teal} style={{ flexShrink: 0 }} /> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={onLogin} className="btn-outline" style={{ width: '100%', padding: 13, borderRadius: 8, fontSize: 14 }}>
                  Começar Grátis
                </button>
              </div>

              {/* PRO */}
              <div className="plan-card" style={{ background: C.surface, border: `2px solid ${C.blue}`, position: 'relative' }}>
                <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: C.blue, color: 'white', fontSize: 10, fontWeight: 700, padding: '4px 14px', borderRadius: 100, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                  MAIS ESCOLHIDO
                </div>
                <div style={{ marginBottom: 28, marginTop: 8 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: C.blue, textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 10 }}>Pro</p>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 8 }}>
                    <span style={{ fontSize: 38, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em' }}>
                      R$ {(annual ? priceProAnnual : pricePro).toFixed(2).replace('.', ',')}
                    </span>
                    <span style={{ fontSize: 13, color: C.subtle, paddingBottom: 7 }}>/mês</span>
                  </div>
                  {annual && (
                    <p style={{ fontSize: 13, color: C.teal, fontWeight: 600 }}>
                      Economia de R$ {((pricePro - priceProAnnual) * 12).toFixed(0)}/ano
                    </p>
                  )}
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 11, flex: 1 }}>
                  {['400 créditos IA/mês', 'Alunos ilimitados', 'Workflows ilimitados', 'Análise de laudos', 'Perfil cognitivo do aluno', 'Copilot pedagógico', 'Suporte por e-mail'].map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#374151' }}>
                      <CheckCircle size={14} color={C.blue} style={{ flexShrink: 0 }} /> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => handleCheckout(PlanTier.PRO)} className="btn-primary" style={{ width: '100%', padding: 13, borderRadius: 8, fontSize: 14 }}>
                  Assinar Pro
                </button>
                {annual && (
                  <p style={{ textAlign: 'center', fontSize: 12, color: C.subtle, marginTop: 10 }}>
                    ou R$ {pricePro.toFixed(2).replace('.', ',')} no mensal
                  </p>
                )}
              </div>

              {/* MASTER */}
              <div className="plan-card" style={{ background: C.navy, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -60, right: -60, width: 220, height: 220, background: C.violet, borderRadius: '50%', filter: 'blur(90px)', opacity: 0.12, pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: C.violet, color: 'white', fontSize: 10, fontWeight: 700, padding: '4px 14px', borderRadius: 100, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                  MASTER
                </div>
                <div style={{ marginBottom: 28, marginTop: 8, position: 'relative' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: C.violet, textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 10 }}>Master</p>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 8 }}>
                    <span style={{ fontSize: 38, fontWeight: 800, color: '#EEF2F8', letterSpacing: '-0.03em' }}>
                      R$ {(annual ? priceMasterAnnual : priceMaster).toFixed(2).replace('.', ',')}
                    </span>
                    <span style={{ fontSize: 13, color: '#3A5570', paddingBottom: 7 }}>/mês</span>
                  </div>
                  {annual && (
                    <p style={{ fontSize: 13, color: C.violet, fontWeight: 600 }}>
                      Economia de R$ {((priceMaster - priceMasterAnnual) * 12).toFixed(0)}/ano
                    </p>
                  )}
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 11, flex: 1, position: 'relative' }}>
                  {['1.200 créditos IA/mês', 'Automação completa', 'Relatórios avançados', 'Prioridade de processamento', 'Perfil cognitivo + Timeline', 'Exportação em lote', 'Suporte prioritário'].map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#8AAAC0' }}>
                      <CheckCircle size={14} color={C.violet} style={{ flexShrink: 0 }} /> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => handleCheckout(PlanTier.PREMIUM)} className="btn-violet" style={{ width: '100%', padding: 13, borderRadius: 8, fontSize: 14, position: 'relative' }}>
                  Assinar Master
                </button>
                {annual && (
                  <p style={{ textAlign: 'center', fontSize: 12, color: '#243A50', marginTop: 10, position: 'relative' }}>
                    ou R$ {priceMaster.toFixed(2).replace('.', ',')} no mensal
                  </p>
                )}
              </div>

            </div>

            {annual && (
              <p className={`reveal rd3 ${price.visible ? 'on' : ''}`} style={{ textAlign: 'center', fontSize: 12, color: C.subtle, marginTop: 28 }}>
                * Valor no plano anual com pagamento recorrente. Compromisso mínimo de 12 meses.
              </p>
            )}

          </div>
        </section>

        {/* ════════════════════════ CTA FINAL ════════════════════════ */}
        <section style={{ background: C.navy, padding: '120px 0' }}>
          <div ref={cta.ref} style={{ maxWidth: 720, margin: '0 auto', padding: '0 28px', textAlign: 'center' }}>
            <div className={`reveal ${cta.visible ? 'on' : ''}`}>

              <p style={{ fontSize: 11, fontWeight: 700, color: C.violet, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 22 }}>
                Comece hoje
              </p>

              <h2 style={{ fontSize: 'clamp(32px, 5.5vw, 60px)', fontWeight: 800, color: '#EEF2F8', letterSpacing: '-0.035em', lineHeight: 1.08, marginBottom: 22 }}>
                Menos burocracia pedagógica.<br />
                <span style={{ color: C.violet }}>Mais tempo para ensinar.</span>
              </h2>

              <p style={{ fontSize: 18, color: '#3A5A74', lineHeight: 1.72, maxWidth: 460, margin: '0 auto 48px' }}>
                Mais de 1.800 professores já simplificaram sua rotina pedagógica com o IncluiAI.
              </p>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={onLogin} className="btn-violet" style={{ fontSize: 15, padding: '15px 40px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  Começar grátis <ArrowRight size={17} />
                </button>
                <button onClick={onLogin} className="btn-ghost" style={{ fontSize: 15, padding: '15px 32px', borderRadius: 8 }}>
                  Testar o IncluiAI
                </button>
              </div>

              <p style={{ fontSize: 13, color: '#1E3A55', marginTop: 20 }}>
                Grátis para sempre. Sem cartão de crédito.
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
