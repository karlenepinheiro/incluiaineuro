// RelatorioViewer.tsx — Relatório Premium Visual Law • IncluiAI
// Design: capa A4, cards, gráficos SVG, QR, checklist visual, print-ready
import React, { useRef, useEffect, useState } from 'react';
import {
  CheckCircle2, AlertCircle, Download, Printer,
  User, FileText, BookOpen, Brain, ClipboardList,
  TrendingUp, Lightbulb, HeartHandshake, Building2,
  Star, Shield, ChevronRight, Zap, Award, Target,
  GraduationCap, Phone, Home, Stethoscope, Users,
} from 'lucide-react';
import type {
  RelatorioResultado, ChecklistItem,
  RelatorioSimples, RelatorioCompleto,
} from '../services/reportService';
import type { Student, SchoolConfig } from '../types';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  petrol:   '#1F4E5F',
  petrolM:  '#2E6B7A',
  petrolL:  '#E8F2F5',
  petrolXL: '#F0F7FA',
  dark:     '#1C2033',
  gold:     '#C69214',
  goldL:    '#FFF8E7',
  goldM:    '#F0C040',
  gray:     '#6B7280',
  gray2:    '#9CA3AF',
  border:   '#E4E7EC',
  bg:       '#F8FAFC',
  surface:  '#FFFFFF',
  green:    '#16A34A',
  greenL:   '#DCFCE7',
  red:      '#DC2626',
  redL:     '#FEE2E2',
  amber:    '#D97706',
  amberL:   '#FEF3C7',
  blue:     '#2563EB',
  blueL:    '#DBEAFE',
  purple:   '#7C3AED',
  purpleL:  '#EDE9FE',
  navy:     '#1E3A5F',
};

// ─── Score helpers ─────────────────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 4) return C.green;
  if (s >= 3) return C.purple;
  if (s >= 2) return C.amber;
  return C.red;
}
function scoreLabel(s: number): string {
  if (s >= 4) return 'Avançado';
  if (s >= 3) return 'Em desenvolvimento';
  if (s >= 2) return 'Em construção';
  return 'Suporte intensivo';
}
function scoreBg(s: number): string {
  if (s >= 4) return C.greenL;
  if (s >= 3) return C.purpleL;
  if (s >= 2) return C.amberL;
  return C.redL;
}

const CRITERIA_SHORT = ['Com.', 'Int.', 'Aut.', 'Autorr.', 'Aten.', 'Comp.', 'Mot.F', 'Mot.G', 'Part.', 'Ling.'];
const CRITERIA_FULL  = [
  'Comunicação Expressiva', 'Interação Social', 'Autonomia (AVD)',
  'Autorregulação', 'Atenção Sustentada', 'Compreensão',
  'Motricidade Fina', 'Motricidade Grossa', 'Participação', 'Linguagem/Leitura',
];

// ─── QR Code inline SVG (grid simples para código doc) ────────────────────────

const QRPlaceholder: React.FC<{ code: string; size?: number }> = ({ code, size = 72 }) => {
  const hash = code.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  const grid = Array.from({ length: 7 }, (_, r) =>
    Array.from({ length: 7 }, (_, c2) => (Math.abs(hash ^ (r * 13 + c2 * 7)) % 3) !== 0)
  );
  // Fixed corner finders
  const finder = (gr: boolean[][], r0: number, c0: number) => {
    for (let r = r0; r < r0 + 7 && r < 7; r++)
      for (let c = c0; c < c0 + 7 && c < 7; c++) {
        const dr = r - r0, dc = c - c0;
        gr[r][c] = (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
      }
  };
  const g = grid.map(r => [...r]);
  finder(g, 0, 0);
  const cell = size / 7;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ imageRendering: 'pixelated' }}>
      <rect width={size} height={size} fill="white" rx={4} />
      {g.flatMap((row, r) =>
        row.map((on, c2) =>
          on ? <rect key={`${r}-${c2}`} x={c2 * cell + 1} y={r * cell + 1} width={cell - 1} height={cell - 1} rx={1} fill={C.dark} /> : null
        )
      )}
    </svg>
  );
};

// ─── SVG Charts ───────────────────────────────────────────────────────────────

const BarChartSVG: React.FC<{ scores: number[] }> = ({ scores }) => {
  if (!scores.length) return null;
  const W = 520, H = 130, padX = 4, baseY = H - 18;
  const barW = (W - padX * (scores.length + 1)) / scores.length;
  return (
    <div className="w-full overflow-x-auto">
      <svg width="100%" viewBox={`0 0 ${W} ${H + 28}`} style={{ minWidth: 300 }}>
        {[1,2,3,4,5].map(v => (
          <line key={v} x1={0} y1={baseY - (v/5)*(H-18)} x2={W} y2={baseY - (v/5)*(H-18)}
            stroke={C.border} strokeWidth={0.5} strokeDasharray="3 3" />
        ))}
        {scores.map((s, i) => {
          const h = (s / 5) * (H - 18);
          const x = padX + i * (barW + padX);
          const y = baseY - h;
          const color = scoreColor(s);
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={h} rx={3} fill={color} opacity={0.82} />
              <text x={x + barW/2} y={y - 3} textAnchor="middle" fontSize={8} fill={color} fontWeight="700">
                {s}
              </text>
              <text x={x + barW/2} y={baseY + 12} textAnchor="middle" fontSize={6.5} fill={C.gray}>
                {CRITERIA_SHORT[i] ?? ''}
              </text>
            </g>
          );
        })}
        <line x1={0} y1={baseY} x2={W} y2={baseY} stroke={C.border} strokeWidth={1} />
      </svg>
    </div>
  );
};

const PieChartSVG: React.FC<{ scores: number[] }> = ({ scores }) => {
  if (!scores.length) return null;
  const buckets = [
    { label: 'Suporte intensivo (1)', count: 0, color: C.red },
    { label: 'Em construção (2)',      count: 0, color: C.amber },
    { label: 'Em desenvolvimento (3)', count: 0, color: C.purple },
    { label: 'Avançado (4–5)',         count: 0, color: C.green },
  ];
  scores.forEach(s => {
    if (s <= 1) buckets[0].count++;
    else if (s <= 2) buckets[1].count++;
    else if (s <= 3) buckets[2].count++;
    else buckets[3].count++;
  });
  const total = scores.length;
  const cx = 78, cy = 78, r = 64;
  let cumAngle = -Math.PI / 2;
  const slices = buckets.map(b => {
    const angle = (b.count / total) * 2 * Math.PI;
    const startA = cumAngle;
    cumAngle += angle;
    return { ...b, startA, angle };
  }).filter(s => s.count > 0);
  const arcPath = (startA: number, angle: number) => {
    if (angle >= 2 * Math.PI)
      return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r} Z`;
    const x1 = cx + r * Math.cos(startA), y1 = cy + r * Math.sin(startA);
    const x2 = cx + r * Math.cos(startA + angle), y2 = cy + r * Math.sin(startA + angle);
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${angle > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
  };
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg width="156" height="156" viewBox="0 0 156 156">
        {slices.map((s, i) => (
          <path key={i} d={arcPath(s.startA, s.angle)} fill={s.color} stroke="white" strokeWidth={1.5} />
        ))}
        <circle cx={cx} cy={cy} r={26} fill="white" />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={14} fontWeight="800" fill={C.dark}>{total}</text>
        <text x={cx} y={cy + 9} textAnchor="middle" fontSize={6.5} fill={C.gray}>critérios</text>
      </svg>
      <div className="flex flex-col gap-2">
        {buckets.filter(b => b.count > 0).map((b, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: b.color }} />
            <span style={{ color: C.dark }}>{b.label}</span>
            <span className="font-bold ml-1" style={{ color: b.color }}>
              {b.count} ({Math.round((b.count / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const RadarSVG: React.FC<{ scores: number[] }> = ({ scores }) => {
  if (scores.length < 3) return null;
  const n = scores.length, size = 200;
  const cx = size/2, cy = size/2, R = size*0.36;
  const angle = (i: number) => (i * 2 * Math.PI) / n - Math.PI / 2;
  const pt = (i: number, r: number) => `${cx + r*Math.cos(angle(i))},${cy + r*Math.sin(angle(i))}`;
  const polygon = scores.map((s, i) => pt(i, (s/5)*R)).join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.2,0.4,0.6,0.8,1].map(f => (
        <polygon key={f} points={Array.from({length:n},(_,i)=>pt(i,R*f)).join(' ')}
          fill="none" stroke={C.border} strokeWidth="1" />
      ))}
      {Array.from({length:n},(_,i) => (
        <line key={i} x1={cx} y1={cy} x2={cx+R*Math.cos(angle(i))} y2={cy+R*Math.sin(angle(i))}
          stroke={C.border} strokeWidth="1" />
      ))}
      <polygon points={polygon} fill={`${C.petrol}22`} stroke={C.petrol} strokeWidth="2" strokeLinejoin="round" />
      {scores.map((s, i) => {
        const rr = (s/5)*R;
        return <circle key={i} cx={cx+rr*Math.cos(angle(i))} cy={cy+rr*Math.sin(angle(i))} r={4} fill={C.petrol} />;
      })}
      {Array.from({length:n},(_,i) => {
        const labelR = R + 14;
        return (
          <text key={i} x={cx+labelR*Math.cos(angle(i))} y={cy+labelR*Math.sin(angle(i))+3}
            textAnchor="middle" fontSize={6.5} fill={C.gray}>
            {CRITERIA_SHORT[i]}
          </text>
        );
      })}
    </svg>
  );
};

// ─── Checklist visual ─────────────────────────────────────────────────────────

const ChecklistVisual: React.FC<{ items: ChecklistItem[] }> = ({ items }) => {
  const grauCfg = {
    leve:     { label:'Leve',     bg:C.amberL,  border:C.amber,   text:C.amber   },
    moderado: { label:'Moderado', bg:C.redL,    border:C.red,     text:C.red     },
    intenso:  { label:'Intenso',  bg:'#FEF2F2', border:'#B91C1C', text:'#B91C1C' },
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {items.map((item, i) => {
        const grau = item.grau ? grauCfg[item.grau] : null;
        return (
          <div key={i} className="flex items-start gap-3 p-3 rounded-xl border"
            style={{ background: item.presente ? (grau?.bg ?? C.amberL) : C.greenL,
                     borderColor: item.presente ? (grau?.border ?? C.amber) : C.green }}>
            {item.presente
              ? <AlertCircle size={15} style={{ color: grau?.text ?? C.amber, marginTop:1, flexShrink:0 }} />
              : <CheckCircle2 size={15} style={{ color: C.green, marginTop:1, flexShrink:0 }} />
            }
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold" style={{ color: C.dark }}>{item.area}</span>
                {item.presente && grau && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: grau.border, color:'white' }}>{grau.label}</span>
                )}
                {!item.presente && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: C.green, color:'white' }}>Preservado</span>
                )}
              </div>
              {item.obs && <p className="text-[10px] mt-0.5" style={{ color: C.gray }}>{item.obs}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Section primitives ───────────────────────────────────────────────────────

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; color?: string }> = ({
  icon, title, color = C.petrol,
}) => (
  <div className="flex items-center gap-3 px-4 py-2.5 rounded-t-xl"
    style={{ background: color, color:'white' }}>
    {icon}
    <span className="font-bold text-sm tracking-wide">{title.toUpperCase()}</span>
  </div>
);

const SectionCard: React.FC<{
  icon: React.ReactNode; title: string; children: React.ReactNode; color?: string; className?: string;
}> = ({ icon, title, children, color = C.petrol, className = '' }) => (
  <div className={`rounded-xl overflow-hidden mb-5 ${className}`} style={{ border:`1px solid ${C.border}` }}>
    <SectionHeader icon={icon} title={title} color={color} />
    <div className="px-5 py-4 bg-white">{children}</div>
  </div>
);

const ItemList: React.FC<{ items: string[]; color?: string }> = ({ items, color = C.petrol }) => (
  <ul className="space-y-1.5">
    {items.filter(Boolean).map((item, i) => (
      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: C.dark }}>
        <ChevronRight size={13} style={{ color, marginTop:3, flexShrink:0 }} />
        <span style={{ lineHeight:1.65 }}>{item}</span>
      </li>
    ))}
  </ul>
);

// ─── CAPA ─────────────────────────────────────────────────────────────────────

const CoverPage: React.FC<{
  student: Student;
  school?: SchoolConfig | null;
  resultado: RelatorioResultado;
  scores: number[];
  mode: 'simples' | 'completo';
}> = ({ student, school, resultado, scores, mode }) => {
  const now    = new Date(resultado.geradoEm);
  const dateStr = now.toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
  const schoolName = school?.schoolName || student.schoolName || '';
  const cityState  = [school?.city || student.city, school?.state].filter(Boolean).join(' – ');
  const avg = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
  const diagnosis = Array.isArray(student.diagnosis) ? student.diagnosis.join(' • ') : (student.diagnosis || '');

  const infoItems = [
    { icon: <GraduationCap size={13} />, label:'Série / Turno', value: [student.grade, student.shift].filter(Boolean).join(' · ') || 'A informar' },
    { icon: <Brain size={13} />, label:'Diagnóstico', value: diagnosis || 'Em avaliação multidisciplinar' },
    { icon: <Award size={13} />, label:'Nível de Suporte', value: student.supportLevel || 'A definir' },
    { icon: <Building2 size={13} />, label:'Escola', value: [schoolName, cityState].filter(Boolean).join(' — ') || 'A informar' },
    { icon: <Users size={13} />, label:'Responsável', value: student.guardianName || 'A confirmar' },
    { icon: <Phone size={13} />, label:'Contato', value: student.guardianPhone || 'A informar' },
  ];

  return (
    <div className="print-page" style={{
      minHeight: '277mm',
      background: 'white',
      display: 'flex',
      flexDirection: 'column',
      pageBreakAfter: 'always',
    }}>
      {/* Banner topo */}
      <div style={{
        background: `linear-gradient(135deg, ${C.petrol} 0%, ${C.navy} 100%)`,
        padding: '32px 40px 28px',
      }}>
        {/* Identidade IncluiAI */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div style={{
              width:38, height:38, borderRadius:10,
              background: `linear-gradient(135deg, ${C.gold}, ${C.goldM})`,
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <Shield size={20} color="white" />
            </div>
            <div>
              <span className="font-extrabold text-white text-base tracking-wide">IncluiAI</span>
              <p className="text-white/50 text-[9px] tracking-widest uppercase">Sistema de Educação Inclusiva</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-bold px-3 py-1 rounded-full"
              style={{ background: `${C.gold}30`, color: C.gold, border:`1px solid ${C.gold}50` }}>
              {mode === 'simples' ? 'RELATÓRIO SIMPLES' : 'RELATÓRIO COMPLETO'}
            </div>
            <p className="text-white/40 text-[8px] mt-1 font-mono">{resultado.codigoDoc}</p>
          </div>
        </div>

        {/* Título principal */}
        <div style={{ borderTop:`1px solid ${C.gold}40`, paddingTop:24 }}>
          <p className="text-white/50 text-[10px] tracking-widest uppercase mb-2">Documento Oficial</p>
          <h1 className="text-white font-extrabold leading-tight"
            style={{ fontSize: 26, letterSpacing:'-0.5px' }}>
            Relatório Técnico Pedagógico
          </h1>
          <p className="text-white/60 text-sm mt-1">
            Atendimento Educacional Especializado — Educação Inclusiva
          </p>
          <div className="mt-3 h-0.5 w-16 rounded-full" style={{ background: C.gold }} />
        </div>
      </div>

      {/* Corpo da capa */}
      <div style={{ flex:1, padding:'32px 40px 28px', display:'flex', flexDirection:'column', gap:24 }}>

        {/* Card do aluno */}
        <div style={{
          borderRadius:16, overflow:'hidden',
          border:`2px solid ${C.petrol}`,
          boxShadow:'0 4px 20px rgba(31,78,95,0.12)',
        }}>
          {/* Header do card */}
          <div style={{
            background: `linear-gradient(90deg, ${C.petrolL} 0%, white 100%)`,
            padding:'16px 24px', display:'flex', alignItems:'center', gap:16,
          }}>
            {/* Avatar */}
            <div style={{
              width:60, height:60, borderRadius:14,
              background:`linear-gradient(135deg, ${C.petrol}, ${C.navy})`,
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'white', fontWeight:800, fontSize:22, flexShrink:0,
              boxShadow:'0 4px 12px rgba(31,78,95,0.3)',
            }}>
              {student.name.trim().substring(0,2).toUpperCase()}
            </div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:10, color:C.gray, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>
                Identificação do Aluno
              </p>
              <h2 style={{ fontSize:20, fontWeight:800, color:C.dark, lineHeight:1.2 }}>{student.name}</h2>
              {student.birthDate && (
                <p style={{ fontSize:11, color:C.gray, marginTop:2 }}>
                  Nascimento: {student.birthDate}
                </p>
              )}
            </div>
            {/* Score badge */}
            {scores.length > 0 && (
              <div style={{
                textAlign:'center', padding:'10px 16px', borderRadius:12,
                background:`linear-gradient(135deg, ${C.petrol}, ${C.navy})`,
                color:'white', flexShrink:0,
              }}>
                <p style={{ fontSize:9, opacity:0.7, textTransform:'uppercase', letterSpacing:'0.06em' }}>Média</p>
                <p style={{ fontSize:24, fontWeight:800, lineHeight:1 }}>{avg.toFixed(1)}</p>
                <p style={{ fontSize:8, opacity:0.6 }}>de 5,0</p>
              </div>
            )}
          </div>

          {/* Grid de informações */}
          <div style={{
            display:'grid', gridTemplateColumns:'1fr 1fr',
            gap:'1px', background:C.border,
          }}>
            {infoItems.map((info, i) => (
              <div key={i} style={{ background:'white', padding:'12px 18px', display:'flex', gap:10, alignItems:'flex-start' }}>
                <div style={{
                  width:26, height:26, borderRadius:7, flexShrink:0,
                  background:C.petrolL, display:'flex', alignItems:'center', justifyContent:'center',
                  color:C.petrol, marginTop:1,
                }}>
                  {info.icon}
                </div>
                <div style={{ minWidth:0 }}>
                  <p style={{ fontSize:9, color:C.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:2 }}>
                    {info.label}
                  </p>
                  <p style={{ fontSize:11, fontWeight:600, color:C.dark, lineHeight:1.4 }}>{info.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Nível geral + barra visual */}
        {scores.length > 0 && (
          <div style={{
            borderRadius:12, border:`1px solid ${C.border}`,
            padding:'14px 20px', background:'white',
          }}>
            <div className="flex items-center justify-between mb-3">
              <p style={{ fontSize:10, color:C.gray, textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700 }}>
                Indicador Geral de Desenvolvimento
              </p>
              <span style={{ fontSize:10, fontWeight:700, color:scoreColor(avg),
                background:scoreBg(avg), padding:'2px 10px', borderRadius:20 }}>
                {scoreLabel(avg)}
              </span>
            </div>
            <div style={{ height:10, borderRadius:20, background:C.border, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(avg/5)*100}%`,
                background:`linear-gradient(90deg, ${scoreColor(avg)}, ${scoreColor(avg)}cc)`,
                borderRadius:20, transition:'width 0.5s' }} />
            </div>
            <div className="flex justify-between mt-1">
              {[1,2,3,4,5].map(v => (
                <span key={v} style={{ fontSize:9, color: C.gray2 }}>{v}</span>
              ))}
            </div>
          </div>
        )}

        {/* Rodapé da capa */}
        <div style={{ marginTop:'auto', display:'flex', alignItems:'flex-end', justifyContent:'space-between' }}>
          <div>
            <p style={{ fontSize:10, color:C.gray, marginBottom:3 }}>
              Emissão: <strong style={{ color:C.dark }}>{dateStr}</strong>
            </p>
            <p style={{ fontSize:10, color:C.gray, marginBottom:3 }}>
              Profissional: <strong style={{ color:C.dark }}>{resultado.geradoPor}</strong>
            </p>
            <div style={{
              display:'flex', alignItems:'center', gap:6, marginTop:8,
              padding:'6px 12px', borderRadius:8,
              background:C.petrolL, border:`1px solid ${C.petrol}30`,
            }}>
              <Shield size={11} color={C.petrol} />
              <span style={{ fontSize:9, fontWeight:700, color:C.petrol, fontFamily:'monospace' }}>
                {resultado.codigoDoc}
              </span>
            </div>
          </div>
          <div style={{ textAlign:'center' }}>
            <QRPlaceholder code={resultado.codigoDoc} size={80} />
            <p style={{ fontSize:8, color:C.gray2, marginTop:4 }}>Código de autenticidade</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Resumo executivo ─────────────────────────────────────────────────────────

const ExecSummary: React.FC<{ resumoExecutivo?: string; identificacao: string; conclusao: string; avg: number }> = ({
  resumoExecutivo, identificacao, conclusao, avg,
}) => {
  const text = resumoExecutivo || (identificacao.length > 260
    ? identificacao.substring(0, 257) + '...'
    : identificacao);

  return (
    <div style={{
      borderRadius:14, overflow:'hidden', marginBottom:20,
      border:`1px solid ${C.border}`,
      boxShadow:'0 2px 12px rgba(31,78,95,0.07)',
    }}>
      {/* Header dourado */}
      <div style={{
        background:`linear-gradient(90deg, ${C.gold} 0%, #E5A820 100%)`,
        padding:'10px 20px', display:'flex', alignItems:'center', gap:10,
      }}>
        <Zap size={15} color="white" />
        <span style={{ fontWeight:800, fontSize:13, color:'white', letterSpacing:'0.05em', textTransform:'uppercase' }}>
          Resumo Executivo
        </span>
        <div style={{ marginLeft:'auto',
          background:'rgba(255,255,255,0.25)', borderRadius:20,
          padding:'2px 10px', fontSize:9, color:'white', fontWeight:700 }}>
          Média {avg.toFixed(1)}/5 — {scoreLabel(avg)}
        </div>
      </div>
      <div style={{ padding:'16px 20px', background:'white' }}>
        <p style={{ fontSize:13, color:C.dark, lineHeight:1.75, marginBottom:12 }}>{text}</p>
        {conclusao && (
          <div style={{
            borderLeft:`3px solid ${C.gold}`, paddingLeft:12,
            fontSize:12, color:C.gray, lineHeight:1.7, fontStyle:'italic',
          }}>
            {conclusao.length > 200 ? conclusao.substring(0,197)+'...' : conclusao}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Recomendações em blocos (3 colunas premium) ──────────────────────────────

const RecommendationBlocks: React.FC<{
  pedagogicas: string[];
  clinicas: string[];
  familiares: string[];
  institucionais?: string[];
}> = ({ pedagogicas, clinicas, familiares, institucionais }) => {
  const groups = [
    { title:'Pedagógicas', items:pedagogicas,    icon:<BookOpen size={16}/>,      color:C.petrol,  bg:C.petrolL  },
    { title:'Clínicas',    items:clinicas,        icon:<Stethoscope size={16}/>,   color:C.purple,  bg:C.purpleL  },
    { title:'Familiares',  items:familiares,      icon:<HeartHandshake size={16}/>, color:C.green,  bg:C.greenL   },
    { title:'Institucionais', items:institucionais||[], icon:<Building2 size={16}/>, color:C.blue, bg:C.blueL    },
  ].filter(g => g.items?.length > 0);

  return (
    <div style={{ display:'grid', gridTemplateColumns: groups.length >= 3 ? '1fr 1fr' : '1fr', gap:12, marginBottom:20 }}>
      {groups.map((g, i) => (
        <div key={i} style={{
          borderRadius:12, overflow:'hidden',
          border:`1px solid ${g.color}30`,
          boxShadow:`0 2px 8px ${g.color}10`,
        }}>
          <div style={{
            background:`linear-gradient(90deg, ${g.color} 0%, ${g.color}cc 100%)`,
            padding:'9px 16px', display:'flex', alignItems:'center', gap:8,
          }}>
            {React.cloneElement(g.icon as any, { color:'white' })}
            <span style={{ fontSize:11, fontWeight:800, color:'white', textTransform:'uppercase', letterSpacing:'0.06em' }}>
              {g.title}
            </span>
          </div>
          <div style={{ padding:'12px 16px', background:'white' }}>
            {g.items.filter(Boolean).map((item, j) => (
              <div key={j} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:6 }}>
                <div style={{ width:18, height:18, borderRadius:5, background:g.bg,
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                  <Target size={10} color={g.color} />
                </div>
                <p style={{ fontSize:11, color:C.dark, lineHeight:1.6 }}>{item}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Cabeçalho corrente (páginas internas) ────────────────────────────────────

const RunningHeader: React.FC<{ studentName: string; code: string }> = ({ studentName, code }) => (
  <div style={{
    display:'flex', alignItems:'center', justifyContent:'space-between',
    paddingBottom:10, marginBottom:16,
    borderBottom:`2px solid ${C.petrolL}`,
  }} className="print:block hidden">
    <div className="flex items-center gap-2">
      <Shield size={12} color={C.petrol} />
      <span style={{ fontSize:10, color:C.petrol, fontWeight:700 }}>IncluiAI</span>
      <span style={{ fontSize:10, color:C.gray }}>/ Relatório Técnico Pedagógico</span>
    </div>
    <div className="flex items-center gap-3">
      <span style={{ fontSize:10, fontWeight:600, color:C.dark }}>{studentName}</span>
      <span style={{ fontSize:9, fontFamily:'monospace', color:C.gray2 }}>{code}</span>
    </div>
  </div>
);

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  student: Student;
  scores: number[];
  resultado: RelatorioResultado;
  school?: SchoolConfig | null;
  onExportPDF?: () => void;
  onPrint?: () => void;
  loading?: boolean;
}

export const RelatorioViewer: React.FC<Props> = ({
  student, scores, resultado, school, onExportPDF, onPrint, loading,
}) => {
  const { data } = resultado;
  const avg = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
  const now = new Date(resultado.geradoEm);
  const dateStr = now.toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin"
          style={{ borderColor:`${C.petrol}40`, borderTopColor:C.petrol }} />
        <p className="text-sm font-semibold" style={{ color:C.petrol }}>Gerando relatório técnico...</p>
        <p className="text-xs" style={{ color:C.gray }}>A IA está analisando os dados do aluno. Aguarde alguns segundos.</p>
      </div>
    );
  }

  const isComplete = data.tipo === 'completo';
  const completo   = isComplete ? (data as RelatorioCompleto) : null;
  const simples    = !isComplete ? (data as RelatorioSimples) : null;

  return (
    <div className="max-w-4xl mx-auto" style={{ fontFamily:"'Inter', system-ui, sans-serif" }}>

      {/* Barra de ações (oculta na impressão) */}
      <div className="flex items-center justify-between mb-5 p-3 rounded-xl print:hidden"
        style={{ background:C.petrolL, border:`1px solid ${C.border}` }}>
        <div className="flex items-center gap-2">
          <FileText size={15} style={{ color:C.petrol }} />
          <span className="text-sm font-bold" style={{ color:C.petrol }}>Relatório gerado com sucesso</span>
          <span className="text-xs ml-2 font-mono" style={{ color:C.gray }}>{resultado.codigoDoc}</span>
        </div>
        <div className="flex items-center gap-2">
          {onPrint && (
            <button onClick={onPrint}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background:C.surface, border:`1px solid ${C.border}`, color:C.dark }}>
              <Printer size={13}/> Imprimir
            </button>
          )}
          {onExportPDF && (
            <button onClick={onExportPDF}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold text-white"
              style={{ background:C.petrol }}>
              <Download size={13}/> Exportar PDF
            </button>
          )}
        </div>
      </div>

      {/* ── PÁGINA 1: CAPA ── */}
      <CoverPage
        student={student}
        school={school}
        resultado={resultado}
        scores={scores}
        mode={data.tipo}
      />

      {/* ── PÁGINAS INTERNAS ── */}
      <div className="space-y-2" style={{ paddingTop:24 }}>

        {/* Cabeçalho corrente */}
        <RunningHeader studentName={student.name} code={resultado.codigoDoc} />

        {/* Resumo Executivo */}
        {data.identificacao && (
          <ExecSummary
            resumoExecutivo={(data as any).resumoExecutivo}
            identificacao={data.identificacao}
            conclusao={data.conclusao || ''}
            avg={avg}
          />
        )}

        {/* Identificação completa */}
        {data.identificacao && (
          <SectionCard icon={<User size={14} color="white"/>} title="Identificação do Aluno">
            <p className="text-sm leading-relaxed" style={{ color:C.dark, lineHeight:1.8 }}>
              {data.identificacao}
            </p>
          </SectionCard>
        )}

        {/* Gráficos — modo completo */}
        {isComplete && scores.length > 0 && (
          <SectionCard icon={<Brain size={14} color="white"/>}
            title="Perfil Multidimensional — Análise Gráfica" color={C.purple}>

            {/* Médias */}
            <div className="flex items-center gap-4 mb-5 flex-wrap">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background:C.petrolL }}>
                <Star size={18} style={{ color:C.petrol }}/>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:C.gray }}>Média Geral</p>
                  <p className="text-2xl font-extrabold" style={{ color:C.petrol }}>
                    {avg.toFixed(1)}<span className="text-sm font-normal">/5</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background:scoreColor(avg)+'15', border:`1px solid ${scoreColor(avg)}40` }}>
                <TrendingUp size={18} style={{ color:scoreColor(avg) }}/>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:C.gray }}>Nível</p>
                  <p className="text-sm font-bold" style={{ color:scoreColor(avg) }}>{scoreLabel(avg)}</p>
                </div>
              </div>
            </div>

            {/* Radar + Pizza */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color:C.gray }}>
                  Mapa Cognitivo (Radar)
                </p>
                <div className="flex justify-center"><RadarSVG scores={scores}/></div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color:C.gray }}>
                  Distribuição de Dificuldades
                </p>
                <PieChartSVG scores={scores}/>
              </div>
            </div>

            {/* Barras */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color:C.gray }}>
                Nível de Suporte por Área
              </p>
              <BarChartSVG scores={scores}/>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                {[
                  { color:C.green,  label:'Avançado (80–100%)' },
                  { color:C.purple, label:'Em desenvolvimento (60–79%)' },
                  { color:C.amber,  label:'Em construção (40–59%)' },
                  { color:C.red,    label:'Suporte intensivo (< 40%)' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1.5 text-[10px]" style={{ color:C.gray }}>
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background:color }}/>
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Score por critério */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CRITERIA_FULL.map((name, i) => {
                const s = scores[i] ?? 1;
                const pct = Math.round((s/5)*100);
                const color = scoreColor(s);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-[10px] w-36 shrink-0" style={{ color:C.dark }}>{name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="h-2 rounded-full" style={{ width:`${pct}%`, background:color }}/>
                    </div>
                    <span className="text-[10px] font-bold w-6 text-right" style={{ color }}>{s}</span>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {/* Histórico (completo) */}
        {completo?.historicoRelevante && (
          <SectionCard icon={<BookOpen size={14} color="white"/>}
            title="Histórico Relevante" color="#5B6F7A">
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color:C.dark, lineHeight:1.8 }}>
              {completo.historicoRelevante}
            </p>
          </SectionCard>
        )}

        {/* Análise / Situação pedagógica */}
        {((completo as any)?.analisePedagogica || (completo as any)?.situacaoPedagogica || simples?.situacaoPedagogicaAtual) && (
          <SectionCard icon={<ClipboardList size={14} color="white"/>}
            title={isComplete ? 'Análise Pedagógica' : 'Situação Pedagógica Atual'}>
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color:C.dark, lineHeight:1.8 }}>
              {(completo as any)?.analisePedagogica || (completo as any)?.situacaoPedagogica || simples?.situacaoPedagogicaAtual}
            </p>
          </SectionCard>
        )}

        {/* Situação funcional */}
        {data.situacaoFuncional && (
          <SectionCard icon={<User size={14} color="white"/>} title="Situação Funcional" color="#2E6B7A">
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color:C.dark, lineHeight:1.8 }}>
              {data.situacaoFuncional}
            </p>
          </SectionCard>
        )}

        {/* Perfil cognitivo (completo) */}
        {completo?.perfilCognitivo && (
          <SectionCard icon={<Brain size={14} color="white"/>}
            title="Perfil Cognitivo e Funcional" color={C.purple}>
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color:C.dark, lineHeight:1.8 }}>
              {completo.perfilCognitivo}
            </p>
          </SectionCard>
        )}

        {/* Dificuldades + Potencialidades */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {data.dificuldades?.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border:`1px solid ${C.border}` }}>
              <SectionHeader icon={<AlertCircle size={14} color="white"/>}
                title="Dificuldades Observadas" color={C.red}/>
              <div className="px-5 py-4 bg-white">
                <ItemList items={data.dificuldades} color={C.red}/>
              </div>
            </div>
          )}
          {completo?.potencialidades && completo.potencialidades.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border:`1px solid ${C.border}` }}>
              <SectionHeader icon={<Star size={14} color="white"/>}
                title="Potencialidades e Habilidades" color={C.green}/>
              <div className="px-5 py-4 bg-white">
                <ItemList items={completo.potencialidades} color={C.green}/>
              </div>
            </div>
          )}
        </div>

        {/* Estratégias eficazes (completo) */}
        {completo?.estrategiasEficazes && completo.estrategiasEficazes.length > 0 && (
          <SectionCard icon={<Lightbulb size={14} color="white"/>}
            title="Estratégias com Resultados Positivos" color={C.amber}>
            <ItemList items={completo.estrategiasEficazes} color={C.amber}/>
          </SectionCard>
        )}

        {/* Checklist visual (completo) */}
        {completo?.checklist && completo.checklist.length > 0 && (
          <SectionCard icon={<ClipboardList size={14} color="white"/>}
            title="Checklist de Áreas de Desenvolvimento">
            <p className="text-[10px] text-gray-400 mb-3">
              ✅ Preservado — sem dificuldade significativa &nbsp;|&nbsp;
              ⚠️ Presente — dificuldade observada com intensidade indicada
            </p>
            <ChecklistVisual items={completo.checklist}/>
          </SectionCard>
        )}

        {/* Evolução observada (completo) */}
        {completo?.evolucaoObservada && (
          <SectionCard icon={<TrendingUp size={14} color="white"/>}
            title="Evolução Observada" color={C.green}>
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color:C.dark, lineHeight:1.8 }}>
              {completo.evolucaoObservada}
            </p>
          </SectionCard>
        )}

        {/* Observações relevantes */}
        {data.observacoesRelevantes && (
          <SectionCard icon={<FileText size={14} color="white"/>}
            title="Observações Relevantes" color="#6B7280">
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color:C.dark, lineHeight:1.8 }}>
              {data.observacoesRelevantes}
            </p>
          </SectionCard>
        )}

        {/* Conclusão técnica — destaque */}
        {data.conclusao && (
          <div className="rounded-xl p-5 mb-5"
            style={{ background:C.petrolL, border:`2px solid ${C.petrol}` }}>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={16} style={{ color:C.petrol }}/>
              <span className="font-bold text-sm uppercase tracking-wide" style={{ color:C.petrol }}>
                Conclusão e Parecer Técnico
              </span>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color:C.dark, lineHeight:1.8 }}>
              {data.conclusao}
            </p>
          </div>
        )}

        {/* Recomendações */}
        {isComplete && completo ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <HeartHandshake size={16} style={{ color:C.blue }}/>
              <span className="font-bold text-sm uppercase tracking-wider" style={{ color:C.blue }}>
                Recomendações Multidisciplinares
              </span>
            </div>
            <RecommendationBlocks
              pedagogicas={completo.recomendacoesPedagogicas || []}
              clinicas={completo.recomendacoesClinicas || []}
              familiares={completo.recomendacoesFamiliares || []}
              institucionais={completo.recomendacoesInstitucionais}
            />
          </>
        ) : (
          simples?.recomendacoes && simples.recomendacoes.length > 0 && (
            <SectionCard icon={<HeartHandshake size={14} color="white"/>}
              title="Recomendações" color={C.blue}>
              <ItemList items={simples.recomendacoes} color={C.blue}/>
            </SectionCard>
          )
        )}

        {/* Rodapé institucional */}
        <div className="rounded-xl p-4 flex items-center justify-between flex-wrap gap-3 mt-6"
          style={{ background:C.bg, border:`1px solid ${C.border}` }}>
          <div className="text-[10px]" style={{ color:C.gray }}>
            <p className="font-bold" style={{ color:C.dark }}>Documento gerado pelo IncluiAI</p>
            <p>Sistema de Educação Inclusiva — {dateStr}</p>
            <p>Emitido por: {resultado.geradoPor}</p>
          </div>
          <div className="flex items-center gap-4">
            <QRPlaceholder code={resultado.codigoDoc} size={56}/>
            <div className="text-right">
              <p className="font-mono text-[10px] font-bold" style={{ color:C.petrol }}>{resultado.codigoDoc}</p>
              <p className="text-[9px]" style={{ color:C.gray2 }}>Código de autenticidade</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
