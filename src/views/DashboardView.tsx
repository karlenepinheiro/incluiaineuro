import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, FileText, Zap, CheckCircle2, Clock, ArrowRight,
  ChevronLeft, ChevronRight, MapPin, User, Sparkles,
  BarChart3, AlertTriangle, TrendingUp, Star, ShieldCheck, Activity,
  Bell, PieChart, Brain, Sun, Moon, Leaf,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Student, Protocol, Appointment } from '../types';
import { SUBSCRIPTION_PLANS } from '../config/aiCosts';
import { PaymentService } from '../services/paymentService';
import { PlanTier } from '../types';
import { NumberTicker } from '@/src/components/magicui/number-ticker';
import { supabase } from '../services/supabase';
import { CreditBalanceBadge } from '../components/CreditBalanceBadge';

// ─── Diagnosis normalizer ────────────────────────────────────────────────────
function normalizeDiagnosis(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (!item) return '';
        if (typeof item === 'string') return item;
        if (typeof item === 'object')
          return (item as any).label ?? (item as any).name ?? (item as any).value ?? '';
        return String(item);
      })
      .filter(Boolean)
      .join(' ');
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return (obj.label ?? obj.name ?? obj.value ?? obj.text ?? '') as string;
  }
  return String(value);
}

// ─── Design tokens ──────────────────────────────────────────────────────────

const C = {
  bg:        '#F6F4EF',
  surface:   '#FFFFFF',
  text:      '#1F2937',
  textSec:   '#667085',
  petrol:    '#1F4E5F',
  dark:      '#2E3A59',
  gold:      '#C69214',
  goldLight: '#FDF6E3',
  border:    '#E7E2D8',
  borderMid: '#C9C3B5',
  emerald:   '#059669',
  violet:    '#7C3AED',
  amber:     '#D97706',
  blue:      '#0369A1',
  rose:      '#E11D48',
  indigo:    '#6366F1',
};

type MeterLevel = 'normal' | 'warning' | 'danger';

interface DashboardViewProps {
  userName?: string;
  students: Student[];
  protocols: Protocol[];
  appointments?: Appointment[];
  planMaxStudents?: number;
  planMaxStudentsLabel?: string;
  planMonthlyCredits?: number;
  creditsAvailable?: number;
  creditsPurchased?: number;
  creditsConsumedCycle?: number;
  creditsResetAt?: string | null;
  planName?: string;
  subscriptionExpiry?: string | null;
  onNavigate?: (view: string) => void;
  userId?: string;
  schoolName?: string;
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function clamp(n: number, a = 0, b = 100) { return Math.max(a, Math.min(b, n)); }

type Period = 'morning' | 'afternoon' | 'night';

interface PeriodTheme {
  period: Period;
  greeting: string;
  emoji: string;
  Icon: React.ElementType;
  gradient: string;
  glow: string;
  accent: string;
  shadow: string;
}

function getGreetingPeriod(date = new Date()): PeriodTheme {
  const h = date.getHours();
  if (h >= 5 && h < 12) return {
    period: 'morning',
    greeting: 'Bom dia',
    emoji: '☀️',
    Icon: Sun,
    gradient: 'linear-gradient(135deg, #78350F 0%, #C2410C 48%, #1C1917 100%)',
    glow: '#FCD34D',
    accent: '#F59E0B',
    shadow: 'rgba(194,65,12,0.28)',
  };
  if (h >= 12 && h < 18) return {
    period: 'afternoon',
    greeting: 'Boa tarde',
    emoji: '🌿',
    Icon: Leaf,
    gradient: 'linear-gradient(135deg, #064E3B 0%, #0D9488 48%, #1F2937 100%)',
    glow: '#6EE7B7',
    accent: '#10B981',
    shadow: 'rgba(13,148,136,0.25)',
  };
  return {
    period: 'night',
    greeting: 'Boa noite',
    emoji: '🌙',
    Icon: Moon,
    gradient: 'linear-gradient(135deg, #1F4E5F 0%, #163748 50%, #2E3A59 100%)',
    glow: '#93C5FD',
    accent: '#60A5FA',
    shadow: 'rgba(31,78,95,0.22)',
  };
}

function fmtDateBR(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR');
}

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DAYS_SHORT = ['D','S','T','Q','Q','S','S'];
function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDay(year: number, month: number)    { return new Date(year, month, 1).getDay(); }

// ─── Mini progress bar ───────────────────────────────────────────────────────

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: color + '22' }}>
      <div className="h-full rounded-full" style={{ width: `${clamp(pct)}%`, background: color, transition: 'width 0.7s ease-out' }} />
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, color, pct, badge, onClick,
}: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; color: string; pct?: number; badge?: string; onClick?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      onClick={onClick}
      className={`rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        background: `linear-gradient(135deg, ${color}14 0%, ${color}08 100%)`,
        border: `1.5px solid ${color}30`,
        boxShadow: `0 2px 12px ${color}12`,
      }}
      whileHover={onClick ? { y: -3, boxShadow: `0 8px 28px ${color}25` } : {}}
    >
      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10" style={{ background: color }} />
      <div className="flex items-center justify-between">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: color + '22', boxShadow: `0 2px 8px ${color}20` }}>
          <Icon size={21} style={{ color }} />
        </div>
        {badge && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: color + '20', color }}>
            {badge}
          </span>
        )}
      </div>
      <div>
        <div className="text-2xl font-extrabold leading-none mb-1" style={{ color }}>
          {typeof value === 'number'
            ? <NumberTicker value={value} className="text-2xl font-extrabold" />
            : value}
        </div>
        <div className="text-xs font-semibold" style={{ color: C.dark }}>{label}</div>
        {sub && <div className="text-[11px] mt-0.5 truncate" style={{ color: C.textSec }}>{sub}</div>}
      </div>
      {pct !== undefined && <MiniBar pct={pct} color={color} />}
    </motion.div>
  );
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────

function MiniCalendar({ appointments = [] }: { appointments: Appointment[] }) {
  const today = new Date();
  const [calYear, setCalYear]   = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const aptDays = useMemo(() => {
    const s = new Set<string>();
    appointments.forEach(a => {
      const [ay, am] = a.date.slice(0, 10).split('-').map(Number);
      if (ay === calYear && am - 1 === calMonth) s.add(a.date.slice(8, 10));
    });
    return s;
  }, [appointments, calYear, calMonth]);

  const days     = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDay(calYear, calMonth);
  const prevMonth = () => { if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); } else setCalMonth(m => m + 1); };

  return (
    <div className="rounded-2xl p-5 h-full" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
          <ChevronLeft size={14} style={{ color: C.textSec }} />
        </button>
        <div className="text-center">
          <div className="text-xs font-bold" style={{ color: C.dark }}>{MONTHS_PT[calMonth]}</div>
          <div className="text-[10px]" style={{ color: C.textSec }}>{calYear}</div>
        </div>
        <button onClick={nextMonth} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
          <ChevronRight size={14} style={{ color: C.textSec }} />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-2">
        {DAYS_SHORT.map((d, i) => (
          <div key={i} className="text-center text-[9px] font-bold py-0.5" style={{ color: C.textSec }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const d   = i + 1;
          const ds  = String(d).padStart(2, '0');
          const isT = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
          const hasA = aptDays.has(ds);
          return (
            <div key={d} className="flex flex-col items-center py-1 rounded-lg" style={{ background: isT ? C.petrol : 'transparent' }}>
              <span className="text-[10px] font-bold leading-none" style={{ color: isT ? '#fff' : C.dark }}>{d}</span>
              {hasA && <div className="w-1 h-1 rounded-full mt-0.5" style={{ background: isT ? 'rgba(255,255,255,0.8)' : C.gold }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Status colors ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  agendado:   { bg: '#EFF9FF', color: '#0369A1', label: 'Agendado' },
  realizado:  { bg: '#F0FDF4', color: '#166534', label: 'Realizado' },
  cancelado:  { bg: '#FEF2F2', color: '#991B1B', label: 'Cancelado' },
  reagendado: { bg: '#FFFBEB', color: '#92400E', label: 'Reagendado' },
};

// ─── Today Appointments ───────────────────────────────────────────────────────

function TodayAppointments({ appointments, onNavigate }: { appointments: Appointment[]; onNavigate?: (view: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayApts = useMemo(
    () => appointments.filter(a => a.date.slice(0, 10) === today).sort((a, b) => a.time.localeCompare(b.time)),
    [appointments, today]
  );

  return (
    <div className="rounded-2xl overflow-hidden h-full flex flex-col" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div>
          <h3 className="text-sm font-bold" style={{ color: C.dark }}>Atendimentos do Dia</h3>
          <p className="text-[11px]" style={{ color: C.textSec }}>
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button onClick={() => onNavigate?.('appointments')} className="text-[11px] font-semibold transition hover:opacity-70" style={{ color: C.petrol }}>
          Ver Agenda →
        </button>
      </div>
      <div className="flex-1 p-4 space-y-2 overflow-auto">
        {todayApts.length === 0 ? (
          <div className="flex flex-col items-center py-8 rounded-xl" style={{ background: `linear-gradient(135deg, ${C.petrol}08, ${C.dark}05)` }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2"
              style={{ background: `linear-gradient(135deg, ${C.petrol}20, ${C.dark}15)` }}>
              <Activity size={20} style={{ color: C.petrol }} />
            </div>
            <p className="text-xs font-medium mb-3" style={{ color: C.textSec }}>Nenhum atendimento agendado para hoje</p>
            <button
              onClick={() => onNavigate?.('appointments')}
              className="text-[11px] font-bold px-4 py-2 rounded-xl transition"
              style={{ background: C.petrol, color: '#fff', boxShadow: `0 2px 10px ${C.petrol}30` }}
            >
              + Agendar Atendimento
            </button>
          </div>
        ) : (
          todayApts.map((apt: Appointment) => {
            const sc = STATUS_COLORS[apt.status] ?? { bg: C.bg, color: C.dark, label: apt.status };
            return (
              <div key={apt.id} className="flex items-start gap-3 rounded-xl p-3" style={{ background: sc.bg }}>
                <div className="rounded-xl px-2.5 py-1.5 text-center shrink-0" style={{ background: C.petrol, minWidth: 46 }}>
                  <div className="text-[10px] font-black text-white leading-none">{apt.time}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate" style={{ color: C.dark }}>{apt.title}</div>
                  {apt.studentName && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <User size={9} style={{ color: C.textSec }} />
                      <span className="text-[10px] truncate" style={{ color: C.textSec }}>{apt.studentName}</span>
                    </div>
                  )}
                  {apt.location && (
                    <div className="flex items-center gap-1">
                      <MapPin size={9} style={{ color: C.textSec }} />
                      <span className="text-[10px] truncate" style={{ color: C.textSec }}>{apt.location}</span>
                    </div>
                  )}
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ background: sc.color + '20', color: sc.color }}>
                  {sc.label}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Alert Card ───────────────────────────────────────────────────────────────

function AlertCard({ icon: Icon, title, body, color, action, onAction }: {
  icon: React.ElementType; title: string; body: string;
  color: string; action?: string; onAction?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl p-4" style={{ background: color + '0f', border: `1px solid ${color}30` }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + '20' }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold mb-0.5" style={{ color: C.dark }}>{title}</div>
        <div className="text-[11px] leading-relaxed" style={{ color: C.textSec }}>{body}</div>
        {action && onAction && (
          <button onClick={onAction} className="mt-2 text-[11px] font-bold" style={{ color }}>
            {action} →
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Donut Chart (genérico) ───────────────────────────────────────────────────

function DonutChart({
  data,
  centerValue,
  centerLabel = 'total',
}: {
  data: { label: string; value: number; color: string }[];
  centerValue?: number;
  centerLabel?: string;
}) {
  const total = centerValue ?? (data.reduce((s, d) => s + d.value, 0) || 1);
  const r = 38; const cx = 54; const cy = 54; const stroke = 14;
  let cumAngle = -90;
  const arcs = data.map(d => {
    const angle = (d.value / total) * 360;
    const startAngle = cumAngle;
    cumAngle += angle;
    return { ...d, startAngle, sweepAngle: angle };
  });
  function polarToCartesian(angle: number) {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  function describeArc(start: number, sweep: number) {
    if (sweep >= 360) sweep = 359.99;
    const s = polarToCartesian(start);
    const e = polarToCartesian(start + sweep);
    const large = sweep > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={108} height={108} viewBox="0 0 108 108" style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth={stroke} />
        {arcs.map((arc, i) => arc.sweepAngle > 0.5 && (
          <path key={i} d={describeArc(arc.startAngle, arc.sweepAngle)}
            fill="none" stroke={arc.color} strokeWidth={stroke} strokeLinecap="round" />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={18} fontWeight={800} fill={C.dark}>{total}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill={C.textSec}>{centerLabel}</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {data.map(d => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: C.textSec }}>{d.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginLeft: 'auto', paddingLeft: 8 }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Horizontal Bar Chart ─────────────────────────────────────────────────────

function HBarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      {data.map(d => (
        <div key={d.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: C.textSec }}>{d.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.dark }}>{d.value}</span>
          </div>
          <div style={{ width: '100%', height: 7, borderRadius: 99, background: d.color + '22', overflow: 'hidden' }}>
            <div style={{
              width: `${(d.value / max) * 100}%`, height: '100%',
              borderRadius: 99, background: d.color,
              transition: 'width 0.7s ease-out',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const W = 180; const H = 44;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    y: H - (v / max) * (H - 8),
  }));
  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
  const area = `M${pts[0].x},${H} ` + pts.map(p => `L${p.x},${p.y}`).join(' ') + ` L${pts[pts.length-1].x},${H} Z`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.20" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pts[pts.length - 1] && (
        <circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r={3.5} fill={color} />
      )}
    </svg>
  );
}

// ─── Radar Chart ─────────────────────────────────────────────────────────────

function RadarChart({ axes }: { axes: { label: string; value: number }[] }) {
  const N = axes.length;
  const size = 210;
  const cx = size / 2; const cy = size / 2;
  const R = 72;
  const levels = 4;

  const maxVal = Math.max(...axes.map(a => a.value), 1);

  function axisPoint(i: number, r: number) {
    const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  const gridPolygons = Array.from({ length: levels }, (_, l) => {
    const r = (R * (l + 1)) / levels;
    return Array.from({ length: N }, (_, i) => {
      const p = axisPoint(i, r);
      return `${p.x},${p.y}`;
    }).join(' ');
  });

  const dataPts = axes.map((a, i) => {
    const r = (Math.min(a.value, 100) / 100) * R;
    return axisPoint(i, r);
  });
  const dataPolygon = dataPts.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible', display: 'block', margin: '0 auto' }}>
      {gridPolygons.map((pts, l) => (
        <polygon key={l} points={pts}
          fill={l === levels - 1 ? C.petrol + '06' : 'none'}
          stroke={C.border} strokeWidth={1} />
      ))}
      {axes.map((_, i) => {
        const end = axisPoint(i, R);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke={C.border} strokeWidth={1} />;
      })}
      <polygon points={dataPolygon} fill={C.petrol + '28'} stroke={C.petrol} strokeWidth={2} strokeLinejoin="round" />
      {dataPts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={C.petrol} />
      ))}
      {axes.map((a, i) => {
        const lp = axisPoint(i, R + 20);
        return (
          <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle"
            fontSize={9} fontWeight={600} fill={C.textSec}>{a.label}</text>
        );
      })}
    </svg>
  );
}

// ─── Compact Student Panel ────────────────────────────────────────────────────

function CompactStudentPanel({
  items,
  onNavigate,
}: {
  items: { label: string; value: number; color: string; nav?: string }[];
  onNavigate?: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <div className="grid grid-cols-4 sm:grid-cols-7 divide-x divide-y sm:divide-y-0" style={{ borderColor: C.border }}>
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => item.nav && onNavigate?.(item.nav)}
            className="flex flex-col items-center py-5 px-3 transition-colors"
            style={{ cursor: item.nav ? 'pointer' : 'default', background: 'transparent' }}
            onMouseEnter={e => { if (item.nav) (e.currentTarget as HTMLElement).style.background = `${item.color}08`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <span className="text-xl font-extrabold leading-none" style={{ color: item.color }}>{item.value}</span>
            <span className="text-[10px] text-center mt-1.5 leading-tight" style={{ color: C.textSec }}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function DashboardView({
  userName,
  students,
  protocols,
  appointments = [],
  planMaxStudents,
  planMaxStudentsLabel,
  planMonthlyCredits,
  creditsAvailable,
  creditsPurchased = 0,
  creditsConsumedCycle,
  creditsResetAt,
  planName,
  subscriptionExpiry,
  onNavigate,
  userId,
  schoolName,
}: DashboardViewProps) {

  // ── Access notifications ────────────────────────────────────────────────────
  type AccessNotification = { id: string; title: string; body: string; data: any; created_at: string };
  const [accessNotifs, setAccessNotifs] = useState<AccessNotification[]>([]);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('notifications')
      .select('id, title, body, data, created_at')
      .eq('user_id', userId)
      .eq('type', 'student_accessed')
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { if (data && data.length > 0) setAccessNotifs(data as AccessNotification[]); });
  }, [userId]);

  const dismissNotif = async (id: string) => {
    setAccessNotifs(prev => prev.filter(n => n.id !== id));
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  };

  const dismissAllNotifs = async () => {
    const ids = accessNotifs.map(n => n.id);
    setAccessNotifs([]);
    if (ids.length > 0) await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
  };

  // ── Credits ─────────────────────────────────────────────────────────────────
  const maxStudents     = Number.isFinite(planMaxStudents as number) ? (planMaxStudents as number) : 0;
  const monthlyCredits  = Number.isFinite(planMonthlyCredits as number) ? (planMonthlyCredits as number) : 0;
  const available       = Number.isFinite(creditsAvailable as number) ? (creditsAvailable as number) : 0;
  const creditsUsed     = Number.isFinite(creditsConsumedCycle as number) && (creditsConsumedCycle as number) >= 0
    ? (creditsConsumedCycle as number) : 0;
  const totalCreditsBase = monthlyCredits > 0 ? monthlyCredits : 0;
  const creditsPct      = totalCreditsBase > 0 ? Math.min(100, (creditsUsed / totalCreditsBase) * 100) : 0;
  const creditsLevel: MeterLevel = creditsPct >= 85 ? 'danger' : creditsPct >= 60 ? 'warning' : 'normal';
  const studentsPct     = maxStudents > 0 && maxStudents < 9999 ? (students.length / maxStudents) * 100 : 0;

  // ── Protocol KPIs ───────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const finals = protocols.filter(p => p.status === 'FINAL').length;
    const drafts = protocols.filter(p => p.status === 'DRAFT').length;
    return { total: protocols.length, finals, drafts };
  }, [protocols]);

  const docKpis = useMemo(() => {
    const byType = (t: string) => protocols.filter(p => p.type?.toUpperCase().includes(t)).length;
    return {
      pei:        byType('PEI'),
      paee:       byType('PAEE'),
      pdi:        byType('PDI'),
      estudo:     byType('ESTUDO'),
      relatorios: byType('RELAT'),
    };
  }, [protocols]);

  // ── Student KPIs ────────────────────────────────────────────────────────────
  const studentKpis = useMemo(() => {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const active   = students.filter(s => (s as any).status !== 'inativo' && (s as any).status !== 'externo').length;
    const newMonth = students.filter(s => ((s as any).createdAt ?? (s as any).created_at ?? '') >= firstOfMonth).length;
    const masc  = students.filter(s => (s as any).gender === 'M' || (s as any).genero === 'masculino').length;
    const fem   = students.filter(s => (s as any).gender === 'F' || (s as any).genero === 'feminino').length;
    const outro = students.length - masc - fem;
    return { active, newMonth, masc, fem, outro };
  }, [students]);

  // ── Student Status (mutually exclusive for donut) ────────────────────────────
  const studentStatusKpis = useMemo(() => {
    let triagem = 0, comLaudo = 0, completo = 0, incompleto = 0;
    students.forEach(s => {
      const isTriagem  = (s as any).tipo_aluno === 'em_triagem' || (s as any).status === 'triagem';
      const hasLaudo   = !!(s as any).laudo || !!(s as any).report || (s as any).tipo_aluno === 'com_laudo'
        || (s.documents ?? []).some((d: any) => d.type === 'Laudo');
      const hasDiagnosis = !!(s.diagnosis);
      if (isTriagem) triagem++;
      else if (hasLaudo) comLaudo++;
      else if (hasDiagnosis) completo++;
      else incompleto++;
    });
    const external = students.filter(s => (s as any).isExternalStudent === true || (s as any).status === 'externo').length;
    const imported  = students.filter(s =>
      !!(s as any).importSource && (
        ((s as any).missingRequiredFields?.length > 0) ||
        (s as any).registrationStatus === 'incomplete'
      )
    ).length;
    const cognitiveCount = students.filter(s =>
      s.priorKnowledge && Object.keys(s.priorKnowledge).length > 0
    ).length;
    return { triagem, comLaudo, completo, incompleto, external, imported, cognitiveCount };
  }, [students]);

  // ── Diagnosis breakdown ─────────────────────────────────────────────────────
  const diagnosisKpis = useMemo(() => {
    const buckets: { label: string; value: number; color: string }[] = [
      { label: 'TEA',               value: 0, color: C.indigo  },
      { label: 'TDAH',              value: 0, color: C.blue    },
      { label: 'Def. Intelectual',  value: 0, color: C.emerald },
      { label: 'Dislexia',          value: 0, color: C.amber   },
      { label: 'Def. Auditiva',     value: 0, color: C.violet  },
      { label: 'Paralisia Cerebral',value: 0, color: C.rose    },
      { label: 'Outros',            value: 0, color: C.textSec },
    ];
    students.forEach(s => {
      const d = normalizeDiagnosis(s.diagnosis).toLowerCase().trim();
      if (!d) return;
      if (d.includes('tea') || d.includes('autis') || d.includes('espectro'))
        buckets[0].value++;
      else if (d.includes('tdah') || d.includes('déficit') || d.includes('deficit') || d.includes('aten'))
        buckets[1].value++;
      else if (d.includes('intelectual') || d === 'di')
        buckets[2].value++;
      else if (d.includes('dislexia'))
        buckets[3].value++;
      else if (d.includes('auditiv') || d.includes('surdez'))
        buckets[4].value++;
      else if (d.includes('paralisia') || d.includes('cerebral') || d === 'pc')
        buckets[5].value++;
      else
        buckets[6].value++;
    });
    return buckets.filter(b => b.value > 0).sort((a, b) => b.value - a.value);
  }, [students]);

  // ── Monthly production (last 6 months) ──────────────────────────────────────
  const monthlyProduction = useMemo(() => {
    const now = new Date();
    const months: number[] = [];
    for (let i = 5; i >= 0; i--) {
      const m    = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      months.push(protocols.filter(p => { const d = new Date(p.createdAt); return d >= m && d < next; }).length);
    }
    return months;
  }, [protocols]);

  // ── Radar axes (normalized 0-100) ───────────────────────────────────────────
  const radarAxes = useMemo(() => {
    const n = Math.max(students.length, 1);
    const p = Math.max(protocols.length, 1);
    return [
      { label: 'Ativos',    value: Math.round((studentKpis.active / n) * 100) },
      { label: 'Com laudo', value: Math.round((studentStatusKpis.comLaudo / n) * 100) },
      { label: 'Triagem',   value: Math.round((studentStatusKpis.triagem / n) * 100) },
      { label: 'Docs',      value: Math.round((kpis.total / Math.max(n * 2, 1)) * 100) },
      { label: 'Perfis',    value: Math.round((studentStatusKpis.cognitiveCount / n) * 100) },
      { label: 'Pendências',value: Math.round((kpis.drafts / p) * 100) },
    ];
  }, [students, protocols, studentKpis, studentStatusKpis, kpis]);

  // ── Recent ──────────────────────────────────────────────────────────────────
  const recent = useMemo(
    () => [...protocols].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [protocols]
  );
  const recentStudents = useMemo(() => [...students].slice(-5).reverse(), [students]);

  // ── Derived flags ────────────────────────────────────────────────────────────
  const period         = getGreetingPeriod();
  const PeriodIcon     = period.Icon;
  const prefersReduced = useReducedMotion();
  const safeName       = (userName ?? '').trim() || 'Professora';
  const resetBR      = fmtDateBR(creditsResetAt);
  const isUnlimited  = maxStudents >= 9999;
  const isFree       = planName === 'FREE';
  const isPro        = planName?.startsWith('PRO') ?? false;

  const planBadge =
    planName === 'FREE'    ? 'FREE'    :
    planName?.startsWith('PRO')  ? 'PRO'    :
    planName?.startsWith('PREM') || planName?.startsWith('MAST') ? 'PREMIUM' : planName ?? '—';

  const planColor =
    planBadge === 'FREE'   ? C.textSec :
    planBadge === 'PRO'    ? C.blue    : C.gold;

  // ── Smart suggestions ────────────────────────────────────────────────────────
  const suggestions: { icon: React.ElementType; title: string; body: string; color: string; action?: string; nav?: string }[] = [];

  if (creditsLevel === 'danger') {
    suggestions.push({ icon: AlertTriangle, color: C.rose, title: 'Créditos quase no limite',
      body: `Você já usou ${Math.round(creditsPct)}% dos seus créditos. Considere comprar um pacote avulso.`,
      action: 'Ver pacotes', nav: 'subscription' });
  } else if (creditsLevel === 'warning') {
    suggestions.push({ icon: Zap, color: C.amber, title: 'Créditos em atenção',
      body: `${available} créditos disponíveis. Próxima renovação dos créditos: ${resetBR ?? 'breve'}.` });
  }
  if (isFree || isPro) {
    suggestions.push({ icon: Star, color: C.gold,
      title: isFree ? 'Desbloqueie recursos PRO' : 'Acesse tudo com o PREMIUM',
      body: isFree
        ? `Tenha ${SUBSCRIPTION_PLANS.PRO.credits} créditos/mês, Triagem, IncluiLab e muito mais.`
        : `Com o PREMIUM: ${SUBSCRIPTION_PLANS.MASTER.credits} créditos/mês, fichas e controle de atendimento.`,
      action: 'Ver planos', nav: 'subscription' });
  }
  if (students.length === 0) {
    suggestions.push({ icon: Users, color: C.blue, title: 'Cadastre seu primeiro aluno',
      body: 'Comece adicionando um aluno para acessar documentos e relatórios personalizados.',
      action: 'Adicionar aluno', nav: 'students' });
  }
  if (kpis.drafts > 0) {
    suggestions.push({ icon: Clock, color: C.violet,
      title: `${kpis.drafts} rascunho${kpis.drafts > 1 ? 's' : ''} pendente${kpis.drafts > 1 ? 's' : ''}`,
      body: 'Você tem documentos em rascunho aguardando finalização.',
      action: 'Ver documentos', nav: 'protocols' });
  }
  if (suggestions.length === 0) {
    suggestions.push({ icon: CheckCircle2, color: C.emerald, title: 'Tudo em ordem!',
      body: 'Sua plataforma está organizada. Continue gerando documentos de qualidade para seus alunos.' });
  }

  return (
    <div className="min-h-screen p-5 md:p-7 space-y-5" style={{ background: C.bg }}>

      {/* ── School warning ───────────────────────────────────────────────── */}
      {!schoolName?.trim() && (
        <div
          className="flex items-start gap-3 rounded-2xl px-5 py-4 cursor-pointer"
          style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A' }}
          onClick={() => onNavigate?.('settings')}
          role="button" tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && onNavigate?.('settings')}
        >
          <AlertTriangle size={18} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: '#92400E', margin: 0 }}>Finalize as informações da escola</p>
            <p className="text-xs" style={{ color: '#B45309', margin: '3px 0 0 0' }}>
              Complete o nome da escola em <span className="font-bold underline">Configurações</span> para que o cabeçalho dos documentos fique correto.
            </p>
          </div>
          <ArrowRight size={16} style={{ color: '#D97706', flexShrink: 0, marginTop: 2 }} />
        </div>
      )}

      {/* ── Welcome Hero ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="rounded-3xl p-7 md:p-8 relative overflow-hidden"
        style={{
          background: period.gradient,
          boxShadow: `0 8px 32px ${period.shadow}`,
        }}
      >
        {/* Dot pattern — subtle opacity breathe */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.9) 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
          animate={prefersReduced ? { opacity: 0.07 } : { opacity: [0.06, 0.10, 0.06] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Primary glow blob — slow float */}
        <motion.div
          className="absolute -top-24 -right-24 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: period.glow, filter: 'blur(72px)' }}
          animate={prefersReduced
            ? { opacity: 0.13 }
            : { y: [0, -18, 0], x: [0, 14, 0], opacity: [0.12, 0.20, 0.12] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Secondary accent blob — counter-float */}
        <motion.div
          className="absolute -bottom-20 -left-16 w-60 h-60 rounded-full pointer-events-none"
          style={{ background: period.accent, filter: 'blur(56px)' }}
          animate={prefersReduced
            ? { opacity: 0.08 }
            : { y: [0, 16, 0], x: [0, -12, 0], opacity: [0.07, 0.13, 0.07] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
        />

        {/* Period icon — decorative watermark */}
        <motion.div
          className="absolute top-5 right-5 pointer-events-none select-none"
          animate={prefersReduced
            ? { opacity: 0.08 }
            : { opacity: [0.07, 0.13, 0.07], rotate: [0, 6, -4, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
        >
          <PeriodIcon size={68} color="#ffffff" />
        </motion.div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold px-3 py-1 rounded-full inline-flex items-center gap-1"
                style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}>
                <span style={{ color: 'rgba(255,255,255,0.9)' }}>Inclui</span><span style={{ color: '#F5A843' }}>AI</span>
                &nbsp;— Plataforma de Educação Inclusiva
              </span>
              {planBadge && (
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
                  style={{ background: planColor + '30', color: planColor, border: `1px solid ${planColor}50` }}>
                  {planBadge}
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2 leading-tight">
              {period.greeting}, {safeName}! {period.emoji}
            </h1>
            <p className="text-sm leading-relaxed max-w-lg" style={{ color: 'rgba(255,255,255,0.68)' }}>
              Documentos com IA, planos inclusivos e gestão de alunos — tudo em um lugar só.
            </p>
            <div className="flex items-center gap-3 mt-5 flex-wrap">
              <button
                onClick={() => onNavigate?.('students')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition"
                style={{ background: period.accent, boxShadow: `0 2px 12px ${period.accent}55` }}
              >
                <Sparkles size={15} />
                Gerar documento
              </button>
              <button
                onClick={() => onNavigate?.('protocols')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition"
                style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.85)',
                  border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <FileText size={15} />
                Ver documentos
              </button>
            </div>
          </div>

          <div className="flex md:flex-col gap-3 md:gap-2 flex-wrap">
            {[
              { label: 'Alunos',      value: students.length, color: '#6EE7B7' },
              { label: 'Documentos',  value: kpis.total,      color: '#93C5FD' },
              { label: 'Finalizados', value: kpis.finals,     color: '#FCD34D' },
            ].map(s => (
              <div key={s.label} className="rounded-2xl px-4 py-3 flex items-center gap-3"
                style={{ background: 'rgba(255,255,255,0.08)', minWidth: 120 }}>
                <span className="text-xl font-extrabold" style={{ color: s.color }}>{s.value}</span>
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── 4 Stat Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={ShieldCheck} label="Plano atual" value={planBadge}
          sub={subscriptionExpiry ? `Próxima renovação do plano: ${fmtDateBR(subscriptionExpiry)}` : monthlyCredits > 0 ? `${monthlyCredits} créditos/mês` : undefined}
          color={planColor} badge={planBadge !== 'PREMIUM' ? 'Ativo' : undefined}
          onClick={() => onNavigate?.('subscription')}
        />
        <StatCard
          icon={Zap} label="Créditos IA" value={available}
          sub={resetBR ? `Próxima renovação dos créditos: ${resetBR}` : 'Saldo disponível'}
          color={creditsLevel === 'danger' ? C.rose : creditsLevel === 'warning' ? C.amber : C.petrol}
          pct={creditsPct} onClick={() => onNavigate?.('subscription')}
        />
        <StatCard
          icon={Users} label="Alunos cadastrados" value={students.length}
          sub={isUnlimited ? 'Ilimitados no seu plano' : maxStudents > 0 ? `de ${planMaxStudentsLabel ?? maxStudents} permitidos` : undefined}
          color={C.emerald} pct={!isUnlimited && maxStudents > 0 ? studentsPct : undefined}
          onClick={() => onNavigate?.('students')}
        />
        <StatCard
          icon={FileText} label="Documentos gerados" value={kpis.total}
          sub={`${kpis.finals} finalizados · ${kpis.drafts} rascunhos`}
          color={C.violet} onClick={() => onNavigate?.('protocols')}
        />
      </div>

      {/* ── ROTINA DO DIA ────────────────────────────────────────────────── */}
      <CreditBalanceBadge
        balance={available}
        planCreditsMonthly={monthlyCredits}
        consumedThisCycle={creditsUsed}
        purchasedCreditsHistory={creditsPurchased}
        resetAt={creditsResetAt}
        onClick={() => onNavigate?.('subscription')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <TodayAppointments appointments={appointments} onNavigate={onNavigate} />
        </div>
        <MiniCalendar appointments={appointments} />
      </div>

      {/* ── Painel de Alunos ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold" style={{ color: C.dark }}>Painel de Alunos</h2>
          <button onClick={() => onNavigate?.('students')} className="text-[11px] font-semibold hover:opacity-70 transition" style={{ color: C.petrol }}>
            Ver todos →
          </button>
        </div>
        <CompactStudentPanel
          onNavigate={onNavigate}
          items={[
            { label: 'Total',             value: students.length,                    color: C.dark,    nav: 'students'  },
            { label: 'Completo',          value: studentStatusKpis.completo,         color: C.emerald, nav: 'students'  },
            { label: 'Incompleto',        value: studentStatusKpis.incompleto,       color: C.amber,   nav: 'students'  },
            { label: 'Em triagem',        value: studentStatusKpis.triagem,          color: C.violet,  nav: 'triagem'   },
            { label: 'Com laudo',         value: studentStatusKpis.comLaudo,         color: C.blue,    nav: 'students'  },
            { label: 'Externos',          value: studentStatusKpis.external,         color: C.petrol                    },
            { label: 'Import. incompleto',value: studentStatusKpis.imported,         color: C.rose                      },
          ]}
        />
      </div>

      {/* ── Análise — 4 gráficos ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold mb-3" style={{ color: C.dark }}>Análise de Alunos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          {/* Donut — gênero */}
          <div className="rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-2 mb-4">
              <PieChart size={14} style={{ color: C.petrol }} />
              <h3 className="text-sm font-bold" style={{ color: C.dark }}>Distribuição por Gênero</h3>
            </div>
            <DonutChart
              centerValue={students.length}
              centerLabel="alunos"
              data={[
                { label: 'Masculino', value: studentKpis.masc,  color: C.blue   },
                { label: 'Feminino',  value: studentKpis.fem,   color: C.violet },
                { label: 'Outro / N.I.', value: Math.max(0, studentKpis.outro), color: C.gold },
              ]}
            />
          </div>

          {/* Donut — status */}
          <div className="rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-2 mb-4">
              <PieChart size={14} style={{ color: C.emerald }} />
              <h3 className="text-sm font-bold" style={{ color: C.dark }}>Status dos Alunos</h3>
            </div>
            <DonutChart
              centerValue={students.length}
              centerLabel="alunos"
              data={[
                { label: 'Cadastro completo', value: studentStatusKpis.completo,   color: C.emerald },
                { label: 'Incompleto',        value: studentStatusKpis.incompleto, color: C.amber   },
                { label: 'Em triagem',        value: studentStatusKpis.triagem,    color: C.violet  },
                { label: 'Com laudo',         value: studentStatusKpis.comLaudo,   color: C.blue    },
              ]}
            />
          </div>

          {/* Radar — visão geral operacional */}
          <div className="rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-2 mb-4">
              <Brain size={14} style={{ color: C.petrol }} />
              <h3 className="text-sm font-bold" style={{ color: C.dark }}>Visão Operacional</h3>
              <span className="text-[10px] ml-auto" style={{ color: C.textSec }}>% relativo</span>
            </div>
            {students.length === 0 ? (
              <div className="flex items-center justify-center h-40 rounded-xl" style={{ background: C.bg }}>
                <p className="text-xs" style={{ color: C.textSec }}>Adicione alunos para ver o radar</p>
              </div>
            ) : (
              <RadarChart axes={radarAxes} />
            )}
          </div>

          {/* Barras — diagnósticos */}
          <div className="rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={14} style={{ color: C.indigo }} />
              <h3 className="text-sm font-bold" style={{ color: C.dark }}>Por Diagnóstico</h3>
            </div>
            {diagnosisKpis.length === 0 ? (
              <div className="flex items-center justify-center h-40 rounded-xl" style={{ background: C.bg }}>
                <p className="text-xs" style={{ color: C.textSec }}>Nenhum diagnóstico cadastrado</p>
              </div>
            ) : (
              <HBarChart data={diagnosisKpis} />
            )}
          </div>

        </div>
      </div>

      {/* ── Documentos Gerados (compact) ─────────────────────────────────── */}
      <div className="rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-3 mb-4">
          <FileText size={14} style={{ color: C.violet }} />
          <h3 className="text-sm font-bold" style={{ color: C.dark }}>Documentos Gerados</h3>
          <span className="text-[11px]" style={{ color: C.textSec }}>{kpis.finals} finalizados · {kpis.drafts} rascunhos</span>
          <div className="flex-1" />
          <div className="hidden sm:block">
            <Sparkline values={monthlyProduction} color={C.violet} />
          </div>
          <button onClick={() => onNavigate?.('protocols')} className="text-[11px] font-semibold hover:opacity-70 transition" style={{ color: C.petrol }}>
            Ver todos →
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { label: 'PEI',            value: docKpis.pei,        color: C.violet,  nav: 'protocols'   },
            { label: 'PAEE',           value: docKpis.paee,       color: C.blue,    nav: 'paee'         },
            { label: 'PDI',            value: docKpis.pdi,        color: C.emerald, nav: 'protocols'    },
            { label: 'Estudo de Caso', value: docKpis.estudo,     color: C.gold,    nav: 'estudo_caso'  },
            { label: 'Relatórios',     value: docKpis.relatorios, color: C.petrol,  nav: 'fichas'       },
          ].map(d => (
            <button
              key={d.label}
              onClick={() => onNavigate?.(d.nav)}
              className="flex-1 rounded-xl py-3 px-3 text-center transition-colors"
              style={{ background: `${d.color}0e`, border: `1px solid ${d.color}22`, minWidth: 70 }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = `${d.color}1a`}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = `${d.color}0e`}
            >
              <div style={{ fontSize: 20, fontWeight: 800, color: d.color, lineHeight: 1 }}>{d.value}</div>
              <div style={{ fontSize: 10, color: C.textSec, marginTop: 4 }}>{d.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Recentes ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Documentos recentes */}
        <div className="rounded-2xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.border}` }}>
            <h3 className="text-sm font-bold" style={{ color: C.dark }}>Documentos recentes</h3>
            <button onClick={() => onNavigate?.('protocols')} className="text-[11px] font-semibold hover:opacity-70 transition" style={{ color: C.petrol }}>
              Ver todos →
            </button>
          </div>
          <div className="p-3 space-y-1">
            {recent.length === 0 ? (
              <div className="py-8 text-center text-sm" style={{ color: C.textSec }}>Nenhum documento ainda.</div>
            ) : recent.map(p => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-gray-50 cursor-pointer"
                onClick={() => onNavigate?.('protocols')}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: C.violet + '15' }}>
                  <FileText size={13} style={{ color: C.violet }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate" style={{ color: C.dark }}>{p.studentName}</div>
                  <div className="text-[11px] truncate" style={{ color: C.textSec }}>{p.type}</div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={p.status === 'FINAL'
                    ? { background: '#DCFCE7', color: '#166534' }
                    : { background: C.goldLight, color: C.gold }}>
                  {p.status === 'FINAL' ? 'Final' : 'Rascunho'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Alunos recentes */}
        <div className="rounded-2xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.border}` }}>
            <h3 className="text-sm font-bold" style={{ color: C.dark }}>Alunos recentes</h3>
            <button onClick={() => onNavigate?.('students')} className="text-[11px] font-semibold hover:opacity-70 transition" style={{ color: C.petrol }}>
              Ver todos →
            </button>
          </div>
          <div className="p-3 space-y-1">
            {recentStudents.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm mb-3" style={{ color: C.textSec }}>Nenhum aluno cadastrado ainda.</p>
                <button onClick={() => onNavigate?.('students')}
                  className="text-xs font-bold px-4 py-2 rounded-xl"
                  style={{ background: C.emerald + '15', color: C.emerald }}>
                  + Adicionar aluno
                </button>
              </div>
            ) : recentStudents.map(s => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-gray-50 cursor-pointer"
                onClick={() => onNavigate?.('students')}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs text-white"
                  style={{ background: `linear-gradient(135deg, ${C.petrol}, ${C.dark})` }}>
                  {(s.name ?? '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate" style={{ color: C.dark }}>{s.name}</div>
                  <div className="text-[11px] truncate" style={{ color: C.textSec }}>
                    {s.grade ?? s.schoolName ?? 'Sem turma'}
                  </div>
                </div>
                <TrendingUp size={12} style={{ color: C.emerald, opacity: 0.6 }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Alertas de acesso ────────────────────────────────────────────── */}
      {accessNotifs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bell size={15} style={{ color: C.amber }} />
              <h2 className="text-sm font-bold" style={{ color: C.dark }}>Alertas de acesso</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: C.amber + '22', color: C.amber }}>
                {accessNotifs.length}
              </span>
            </div>
            <button onClick={dismissAllNotifs} className="text-[11px] font-semibold hover:opacity-70 transition" style={{ color: C.textSec }}>
              Marcar todos como lidos
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {accessNotifs.map(n => {
              const studentName = n.data?.student_name as string | undefined;
              const protocol    = n.data?.protocol_code as string | undefined;
              const school      = n.data?.requesting_school as string | undefined;
              const dateStr     = new Date(n.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
              return (
                <motion.div key={n.id} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  className="rounded-2xl overflow-hidden"
                  style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A', boxShadow: '0 4px 16px rgba(217,119,6,0.10)', borderLeft: '4px solid #D97706' }}>
                  <div className="flex items-center justify-between px-5 pt-4 pb-2" style={{ borderBottom: '1px solid #FDE68A' }}>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#FEF3C7' }}>
                        <ShieldCheck size={15} style={{ color: '#D97706' }} />
                      </div>
                      <p className="text-sm font-bold" style={{ color: '#92400E' }}>{n.title}</p>
                    </div>
                    <span className="text-[10px]" style={{ color: '#B45309', opacity: 0.6 }}>{dateStr}</span>
                  </div>
                  <div className="px-5 py-4 flex flex-col gap-2">
                    {studentName && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#B45309' }}>Aluno</span>
                        <span className="text-sm font-bold" style={{ color: '#92400E' }}>{studentName}</span>
                      </div>
                    )}
                    {school && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#B45309' }}>Escola</span>
                        <span className="text-xs" style={{ color: '#92400E' }}>{school}</span>
                      </div>
                    )}
                    {!studentName && <p className="text-xs leading-relaxed" style={{ color: '#B45309' }}>{n.body}</p>}
                    {protocol && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#B45309' }}>Protocolo</span>
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-lg"
                          style={{ background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A' }}>
                          {protocol}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 px-5 pb-4" style={{ borderTop: '1px solid #FDE68A', paddingTop: '12px' }}>
                    <button onClick={() => onNavigate?.('students')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition hover:opacity-80"
                      style={{ background: '#D97706', color: '#fff' }}>
                      <ArrowRight size={13} /> Ver detalhes
                    </button>
                    <button onClick={() => dismissNotif(n.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition hover:opacity-80"
                      style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                      <CheckCircle2 size={13} /> OK, ciente
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Sugestões inteligentes ───────────────────────────────────────── */}
      {suggestions.length > 0 && (
        <div>
          <h2 className="text-sm font-bold mb-3" style={{ color: C.dark }}>Sugestões inteligentes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {suggestions.map((s, i) => (
              <AlertCard key={i} icon={s.icon} title={s.title} body={s.body} color={s.color}
                action={s.action} onAction={s.nav ? () => onNavigate?.(s.nav!) : undefined} />
            ))}
          </div>
        </div>
      )}

      {/* ── Upgrade CTA ─────────────────────────────────────────────────── */}
      {(isFree || isPro) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="rounded-3xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${C.petrol} 0%, ${C.dark} 100%)` }}
        >
          <div className="absolute -bottom-8 -right-8 w-40 h-40 rounded-full opacity-10"
            style={{ background: C.gold, filter: 'blur(40px)' }} />
          <div className="relative z-10">
            <p className="font-extrabold text-white text-base mb-1">
              {isFree ? '🚀 Eleve sua prática com o PRO ou PREMIUM' : `⚡ Upgrade para PREMIUM — ${SUBSCRIPTION_PLANS.MASTER.credits} créditos/mês`}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {isFree
                ? `PRO: ${SUBSCRIPTION_PLANS.PRO.credits} créditos · ${SUBSCRIPTION_PLANS.PRO.students} alunos · Triagem · IncluiLab`
                : 'Fichas complementares · Controle de atendimento · Alunos ilimitados'}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap relative z-10">
            <button
              onClick={async () => {
                const plan = isFree ? PlanTier.PRO : PlanTier.PREMIUM;
                const url = await PaymentService.getAnnualCheckoutUrl(plan, {});
                window.open(url, '_blank', 'noopener,noreferrer');
              }}
              className="px-5 py-2.5 rounded-xl font-bold text-sm text-white flex items-center gap-1.5 transition"
              style={{ background: C.gold, boxShadow: '0 2px 12px rgba(198,146,20,0.4)' }}
            >
              ★ Anual — melhor preço
            </button>
            <button
              onClick={async () => {
                const plan = isFree ? PlanTier.PRO : PlanTier.PREMIUM;
                const url = await PaymentService.getCheckoutUrl(plan, {});
                window.open(url, '_blank', 'noopener,noreferrer');
              }}
              className="px-5 py-2.5 rounded-xl font-semibold text-sm border transition"
              style={{ borderColor: 'rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.85)' }}
            >
              Mensal
            </button>
          </div>
        </motion.div>
      )}

    </div>
  );
}



