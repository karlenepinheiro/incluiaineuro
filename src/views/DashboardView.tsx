import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, FileText, Zap, CheckCircle2, Clock, ArrowRight,
  ChevronLeft, ChevronRight,
  MapPin, User, BookOpen, Sparkles, FlaskConical,
  BarChart3, AlertTriangle, TrendingUp, Star, ShieldCheck, Activity,
  Bell, X as XIcon, UserCheck, UserPlus, UserX, PieChart,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Student, Protocol, Appointment } from '../types';
import { AI_CREDIT_COSTS, SUBSCRIPTION_PLANS } from '../config/aiCosts';
import { PaymentService } from '../services/paymentService';
import { PlanTier } from '../types';
import { NumberTicker } from '@/src/components/magicui/number-ticker';
import { supabase } from '../services/supabase';

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
};

// ─── Types ───────────────────────────────────────────────────────────────────

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

function greetingByHour(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
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
      <div
        className="h-full rounded-full"
        style={{ width: `${clamp(pct)}%`, background: color, transition: 'width 0.7s ease-out' }}
      />
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
      {/* Decorative circle */}
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

// ─── Quick Action Button ──────────────────────────────────────────────────────

function QuickAction({
  icon: Icon, label, sub, color, onClick,
}: {
  icon: React.ElementType; label: string; sub: string;
  color: string; bg?: string; onClick?: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl p-4 text-left w-full transition relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${color}18 0%, ${color}0a 100%)`,
        border: `1.5px solid ${color}30`,
        boxShadow: `0 2px 10px ${color}12`,
      }}
      whileHover={{ scale: 1.02, boxShadow: `0 6px 22px ${color}28` }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="absolute -right-4 -bottom-4 w-16 h-16 rounded-full opacity-10" style={{ background: color }} />
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: color, boxShadow: `0 2px 10px ${color}40` }}>
        <Icon size={20} color="#fff" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate" style={{ color: C.dark }}>{label}</div>
        <div className="text-[11px] truncate" style={{ color: C.textSec }}>{sub}</div>
      </div>
      <ArrowRight size={14} style={{ color }} />
    </motion.button>
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
        <button
          onClick={() => onNavigate?.('appointments')}
          className="text-[11px] font-semibold transition hover:opacity-70"
          style={{ color: C.petrol }}
        >
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

// ─── Alert / Suggestion Card ──────────────────────────────────────────────────

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

// ─── Donut Chart (gênero) ─────────────────────────────────────────────────────

function DonutChart({ masc, fem, outro }: { masc: number; fem: number; outro: number }) {
  const total = masc + fem + outro || 1;
  const data = [
    { label: 'Masc.', value: masc,  color: '#0369A1' },
    { label: 'Fem.',  value: fem,   color: '#7C3AED' },
    { label: 'Outro', value: outro, color: '#C69214' },
  ];
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
      <svg width={108} height={108} viewBox="0 0 108 108">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth={stroke} />
        {arcs.map((arc, i) => arc.sweepAngle > 0.5 && (
          <path key={i} d={describeArc(arc.startAngle, arc.sweepAngle)}
            fill="none" stroke={arc.color} strokeWidth={stroke} strokeLinecap="round" />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={18} fontWeight={800} fill={C.dark}>{total}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill={C.textSec}>total</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map(d => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: C.textSec }}>{d.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginLeft: 2 }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Bar Chart (documentos por tipo) ─────────────────────────────────────────

function DocBarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {data.map(d => (
        <div key={d.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: C.textSec }}>{d.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.dark }}>{d.value}</span>
          </div>
          <div style={{ width: '100%', height: 6, borderRadius: 99, background: d.color + '22', overflow: 'hidden' }}>
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

// ─── Sparkline (produção mensal) ──────────────────────────────────────────────

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const W = 200; const H = 48;
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

  const [showDocPicker, setShowDocPicker] = useState(false);

  // ── Notificações: aluno acessado por outra escola ───────────────────────────
  type AccessNotification = {
    id: string;
    title: string;
    body: string;
    data: any;
    created_at: string;
  };
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
      .then(({ data }) => {
        if (data && data.length > 0) setAccessNotifs(data as AccessNotification[]);
      });
  }, [userId]);

  const dismissNotif = async (id: string) => {
    setAccessNotifs(prev => prev.filter(n => n.id !== id));
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);
  };

  const dismissAllNotifs = async () => {
    const ids = accessNotifs.map(n => n.id);
    setAccessNotifs([]);
    if (ids.length > 0) {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', ids);
    }
  };

  // ── Derived values ──────────────────────────────────────────────────────────
  const maxStudents    = Number.isFinite(planMaxStudents as number) ? (planMaxStudents as number) : 0;
  const monthlyCredits = Number.isFinite(planMonthlyCredits as number) ? (planMonthlyCredits as number) : 0;
  const available      = Number.isFinite(creditsAvailable as number) ? (creditsAvailable as number) : 0;
  const purchased      = Number.isFinite(creditsPurchased) ? creditsPurchased : 0;
  const creditsUsed    = Number.isFinite(creditsConsumedCycle as number) && (creditsConsumedCycle as number) >= 0
    ? (creditsConsumedCycle as number)
    : monthlyCredits > 0 ? Math.max(0, monthlyCredits - available) : 0;
  const totalCreditsBase  = monthlyCredits + purchased;
  const creditsPct        = totalCreditsBase > 0 ? Math.min(100, (creditsUsed / totalCreditsBase) * 100) : 0;
  const creditsLevel: MeterLevel = creditsPct >= 85 ? 'danger' : creditsPct >= 60 ? 'warning' : 'normal';
  const studentsPct       = maxStudents > 0 && maxStudents < 9999 ? (students.length / maxStudents) * 100 : 0;

  const kpis = useMemo(() => {
    const finals = protocols.filter(p => p.status === 'FINAL').length;
    const drafts = protocols.filter(p => p.status === 'DRAFT').length;
    return { total: protocols.length, finals, drafts };
  }, [protocols]);

  // ── KPIs de alunos ──────────────────────────────────────────────────────────
  const studentKpis = useMemo(() => {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const active   = students.filter(s => (s as any).status !== 'inativo' && (s as any).status !== 'externo').length;
    const newMonth = students.filter(s => (s as any).createdAt >= firstOfMonth || (s as any).created_at >= firstOfMonth).length;
    const incomplete = students.filter(s => !s.diagnosis && !(s as any).laudo).length;
    const triagem  = students.filter(s => (s as any).status === 'triagem' || (s as any).inTriagem).length;
    const external = students.filter(s => (s as any).status === 'externo').length;
    const withReport = students.filter(s => !!(s as any).laudo || !!(s as any).report).length;

    const masc  = students.filter(s => (s as any).gender === 'M' || (s as any).genero === 'masculino').length;
    const fem   = students.filter(s => (s as any).gender === 'F' || (s as any).genero === 'feminino').length;
    const outro = students.length - masc - fem;

    // faixas etárias
    const ageGroups = { 'até 6': 0, '7–10': 0, '11–14': 0, '15–17': 0, '18+': 0 };
    students.forEach(s => {
      const age = (s as any).age ?? (s as any).idade;
      if (!age) return;
      const n = Number(age);
      if (n <= 6) ageGroups['até 6']++;
      else if (n <= 10) ageGroups['7–10']++;
      else if (n <= 14) ageGroups['11–14']++;
      else if (n <= 17) ageGroups['15–17']++;
      else ageGroups['18+']++;
    });

    return { active, newMonth, incomplete, triagem, external, withReport, masc, fem, outro, ageGroups };
  }, [students]);

  // ── KPIs de documentos por tipo ─────────────────────────────────────────────
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

  // ── Produção mensal (últimos 6 meses) ────────────────────────────────────────
  const monthlyProduction = useMemo(() => {
    const now = new Date();
    const months: number[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      months.push(protocols.filter(p => {
        const d = new Date(p.createdAt);
        return d >= m && d < next;
      }).length);
    }
    return months;
  }, [protocols]);

  const recent = useMemo(
    () => [...protocols].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [protocols]
  );

  const recentStudents = useMemo(
    () => [...students].slice(-5).reverse(),
    [students]
  );

  const greet    = greetingByHour();
  const safeName = (userName ?? '').trim() || 'Professora';
  const resetBR  = fmtDateBR(creditsResetAt);
  const isUnlimited = maxStudents >= 9999;
  const isFree   = planName === 'FREE';
  const isPro    = planName?.startsWith('PRO') ?? false;

  // ── Suggestions ─────────────────────────────────────────────────────────────
  const suggestions: { icon: React.ElementType; title: string; body: string; color: string; action?: string; nav?: string }[] = [];

  if (creditsLevel === 'danger') {
    suggestions.push({
      icon: AlertTriangle, color: C.rose,
      title: 'Créditos quase no limite',
      body: `Você já usou ${Math.round(creditsPct)}% dos seus créditos. Considere comprar um pacote avulso para não ser interrompido.`,
      action: 'Ver pacotes', nav: 'subscription',
    });
  } else if (creditsLevel === 'warning') {
    suggestions.push({
      icon: Zap, color: C.amber,
      title: 'Créditos em atenção',
      body: `${available} créditos disponíveis. Renova em ${resetBR ?? 'breve'}.`,
    });
  }

  if (isFree || isPro) {
    suggestions.push({
      icon: Star, color: C.gold,
      title: isFree ? 'Desbloqueie recursos PRO' : 'Acesse tudo com o PREMIUM',
      body: isFree
        ? `Tenha ${SUBSCRIPTION_PLANS.PRO.credits} créditos/mês, Triagem, IncluiLab e muito mais.`
        : `Com o PREMIUM: ${SUBSCRIPTION_PLANS.MASTER.credits} créditos/mês, fichas e controle de atendimento.`,
      action: 'Ver planos', nav: 'subscription',
    });
  }

  if (students.length === 0) {
    suggestions.push({
      icon: Users, color: C.blue,
      title: 'Cadastre seu primeiro aluno',
      body: 'Comece adicionando um aluno para acessar os documentos e relatórios personalizados.',
      action: 'Adicionar aluno', nav: 'students',
    });
  }

  if (kpis.drafts > 0) {
    suggestions.push({
      icon: Clock, color: C.violet,
      title: `${kpis.drafts} rascunho${kpis.drafts > 1 ? 's' : ''} pendente${kpis.drafts > 1 ? 's' : ''}`,
      body: 'Você tem documentos em rascunho aguardando finalização.',
      action: 'Ver documentos', nav: 'protocols',
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      icon: CheckCircle2, color: C.emerald,
      title: 'Tudo em ordem!',
      body: 'Sua plataforma está organizada. Continue gerando documentos de qualidade para seus alunos.',
    });
  }

  // ── Plan label ───────────────────────────────────────────────────────────────
  const planBadge =
    planName === 'FREE'     ? 'FREE'    :
    planName?.startsWith('PRO') ? 'PRO'    :
    planName?.startsWith('PREM') || planName?.startsWith('MAST') ? 'PREMIUM' : planName ?? '—';

  const planColor =
    planBadge === 'FREE'    ? C.textSec :
    planBadge === 'PRO'     ? C.blue    : C.gold;

  return (
    <div className="min-h-screen p-5 md:p-7 space-y-6" style={{ background: C.bg }}>

      {/* ── Aviso de escola incompleta ────────────────────────────────────── */}
      {!schoolName?.trim() && (
        <div
          className="flex items-start gap-3 rounded-2xl px-5 py-4 cursor-pointer"
          style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A' }}
          onClick={() => onNavigate?.('settings')}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && onNavigate?.('settings')}
        >
          <AlertTriangle size={18} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: '#92400E', margin: 0 }}>
              Finalize as informações da escola
            </p>
            <p className="text-xs" style={{ color: '#B45309', margin: '3px 0 0 0' }}>
              Complete o nome da escola, equipe e dados institucionais em{' '}
              <span className="font-bold underline">Configurações</span> para que o cabeçalho
              dos documentos e PDFs gerados fique completo.
            </p>
          </div>
          <ArrowRight size={16} style={{ color: '#D97706', flexShrink: 0, marginTop: 2 }} />
        </div>
      )}

      {/* ── Welcome Hero ──────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="rounded-3xl p-7 md:p-8 relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${C.petrol} 0%, #163748 50%, ${C.dark} 100%)`,
          boxShadow: '0 8px 32px rgba(31,78,95,0.22)',
        }}
      >
        {/* Dot pattern */}
        <div className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />

        {/* Glow */}
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full opacity-10"
          style={{ background: C.gold, filter: 'blur(60px)' }} />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-6">
          {/* Left: greeting */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold px-3 py-1 rounded-full"
                style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}>
                IncluiAI — Plataforma de Educação Inclusiva
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2 leading-tight">
              {greet}, {safeName}! 👋
            </h1>
            <p className="text-sm leading-relaxed max-w-lg" style={{ color: 'rgba(255,255,255,0.68)' }}>
              Documentos com IA, planos inclusivos e gestão de alunos — tudo em um lugar só.
            </p>
            <div className="flex items-center gap-3 mt-5 flex-wrap">
              <button
                onClick={() => onNavigate?.('students')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition"
                style={{ background: C.gold, boxShadow: '0 2px 12px rgba(198,146,20,0.35)' }}
              >
                <Sparkles size={15} />
                Gerar documento
              </button>
              <button
                onClick={() => onNavigate?.('incluilab')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition"
                style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.85)',
                  border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <FlaskConical size={15} />
                Abrir IncluiLAB
              </button>
            </div>
          </div>

          {/* Right: quick numbers */}
          <div className="flex md:flex-col gap-3 md:gap-2 flex-wrap">
            {[
              { label: 'Alunos',      value: students.length,  color: '#6EE7B7' },
              { label: 'Documentos',  value: kpis.total,        color: '#93C5FD' },
              { label: 'Finalizados', value: kpis.finals,       color: '#FCD34D' },
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

      {/* ── 4 Stat Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={ShieldCheck}
          label="Plano atual"
          value={planBadge}
          sub={subscriptionExpiry ? `Vence ${fmtDateBR(subscriptionExpiry)}` : monthlyCredits > 0 ? `${monthlyCredits} créditos/mês` : undefined}
          color={planColor}
          badge={planBadge !== 'PREMIUM' ? 'Ativo' : undefined}
          onClick={() => onNavigate?.('subscription')}
        />
        <StatCard
          icon={Zap}
          label="Créditos IA disponíveis"
          value={available}
          sub={totalCreditsBase > 0 ? `${Math.round(creditsPct)}% utilizado neste ciclo` : 'Sem créditos no plano'}
          color={creditsLevel === 'danger' ? C.rose : creditsLevel === 'warning' ? C.amber : C.petrol}
          pct={creditsPct}
          onClick={() => onNavigate?.('subscription')}
        />
        <StatCard
          icon={Users}
          label="Alunos cadastrados"
          value={students.length}
          sub={isUnlimited ? 'Ilimitados no seu plano' : maxStudents > 0 ? `de ${planMaxStudentsLabel ?? maxStudents} permitidos` : undefined}
          color={C.emerald}
          pct={!isUnlimited && maxStudents > 0 ? studentsPct : undefined}
          onClick={() => onNavigate?.('students')}
        />
        <StatCard
          icon={FileText}
          label="Documentos gerados"
          value={kpis.total}
          sub={`${kpis.finals} finalizados · ${kpis.drafts} rascunhos`}
          color={C.violet}
          onClick={() => onNavigate?.('protocols')}
        />
      </div>

      {/* ── KPIs de Alunos ───────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold mb-3" style={{ color: C.dark }}>Painel de Alunos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard icon={UserCheck}  label="Alunos ativos"       value={studentKpis.active}     color={C.emerald} onClick={() => onNavigate?.('students')} />
          <StatCard icon={UserPlus}   label="Novos este mês"      value={studentKpis.newMonth}   color={C.blue} />
          <StatCard icon={UserX}      label="Cadastro incompleto" value={studentKpis.incomplete} color={C.amber}
            sub="Sem diagnóstico ou laudo" onClick={() => onNavigate?.('students')} />
          <StatCard icon={Activity}   label="Em triagem"          value={studentKpis.triagem}    color={C.violet} onClick={() => onNavigate?.('triagem')} />
          <StatCard icon={ShieldCheck} label="Com laudo"          value={studentKpis.withReport} color={C.petrol} />
        </div>
      </div>

      {/* ── KPIs de Documentos ───────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold mb-3" style={{ color: C.dark }}>Documentos Gerados</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard icon={FileText} label="PEIs gerados"       value={docKpis.pei}        color={C.violet}  onClick={() => onNavigate?.('protocols')} />
          <StatCard icon={FileText} label="PAEEs gerados"      value={docKpis.paee}       color={C.blue}    onClick={() => onNavigate?.('paee')} />
          <StatCard icon={FileText} label="PDIs gerados"       value={docKpis.pdi}        color={C.emerald} onClick={() => onNavigate?.('protocols')} />
          <StatCard icon={FileText} label="Estudos de Caso"    value={docKpis.estudo}     color={C.gold}    onClick={() => onNavigate?.('estudo_caso')} />
          <StatCard icon={BarChart3} label="Relatórios"        value={docKpis.relatorios} color={C.petrol}  onClick={() => onNavigate?.('reports')} />
        </div>
      </div>

      {/* ── Gráficos analíticos ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Gênero */}
        <div className="rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2 mb-4">
            <PieChart size={14} style={{ color: C.petrol }} />
            <h3 className="text-sm font-bold" style={{ color: C.dark }}>Distribuição por Gênero</h3>
          </div>
          <DonutChart masc={studentKpis.masc} fem={studentKpis.fem} outro={Math.max(0, studentKpis.outro)} />
        </div>

        {/* Documentos por tipo */}
        <div className="rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={14} style={{ color: C.violet }} />
            <h3 className="text-sm font-bold" style={{ color: C.dark }}>Documentos por Tipo</h3>
          </div>
          <DocBarChart data={[
            { label: 'PEI',          value: docKpis.pei,        color: C.violet  },
            { label: 'PAEE',         value: docKpis.paee,       color: C.blue    },
            { label: 'PDI',          value: docKpis.pdi,        color: C.emerald },
            { label: 'Estudo Caso',  value: docKpis.estudo,     color: C.gold    },
            { label: 'Relatórios',   value: docKpis.relatorios, color: C.petrol  },
          ]} />
        </div>

        {/* Produção mensal */}
        <div className="rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} style={{ color: C.emerald }} />
            <h3 className="text-sm font-bold" style={{ color: C.dark }}>Produção Mensal</h3>
          </div>
          <p className="text-[11px] mb-3" style={{ color: C.textSec }}>Documentos gerados — últimos 6 meses</p>
          <Sparkline values={monthlyProduction} color={C.emerald} />
          <div className="flex justify-between mt-1">
            {['5m atrás','4m','3m','2m','1m','Atual'].map(l => (
              <span key={l} style={{ fontSize: 9, color: C.textSec }}>{l}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Quick Actions ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold mb-3" style={{ color: C.dark }}>Ações rápidas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <QuickAction
            icon={BookOpen} label="Novo Estudo de Caso" sub="1º passo da documentação"
            color={C.petrol}
            onClick={() => onNavigate?.('estudo_caso')}
          />
          {showDocPicker ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl p-4 flex flex-col gap-2"
              style={{ background: C.violet + '08', border: `1px solid ${C.violet}28` }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold" style={{ color: C.dark }}>Qual documento?</span>
                <button onClick={() => setShowDocPicker(false)} className="text-[11px]" style={{ color: C.textSec }}>✕</button>
              </div>
              <button
                onClick={() => { setShowDocPicker(false); onNavigate?.('paee'); }}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-left transition"
                style={{ background: C.violet + '15', color: C.violet }}
              >
                <FileText size={14} />
                <div>
                  <div className="text-xs font-bold">PAEE</div>
                  <div className="text-[10px] opacity-70">Plano de AEE · 2º passo</div>
                </div>
              </button>
              <button
                onClick={() => { setShowDocPicker(false); onNavigate?.('protocols'); }}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-left transition"
                style={{ background: C.violet + '15', color: C.violet }}
              >
                <FileText size={14} />
                <div>
                  <div className="text-xs font-bold">PEI</div>
                  <div className="text-[10px] opacity-70">Plano Educacional · 3º passo</div>
                </div>
              </button>
            </motion.div>
          ) : (
            <QuickAction
              icon={FileText} label="Gerar PEI / PAEE" sub="Plano educacional inclusivo"
              color={C.violet} bg={C.violet + '08'}
              onClick={() => setShowDocPicker(true)}
            />
          )}
          <QuickAction
            icon={FlaskConical} label="Abrir IncluiLab" sub="Adaptar atividades com IA"
            color={C.emerald} bg={C.emerald + '08'}
            onClick={() => onNavigate?.('incluilab')}
          />
          <QuickAction
            icon={BarChart3} label="Perfil Cognitivo" sub="Radar de habilidades"
            color={C.gold} bg={C.goldLight}
            onClick={() => onNavigate?.('reports')}
          />
        </div>
      </div>

      {/* ── Agenda + Calendar ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <TodayAppointments
            appointments={appointments}
            onNavigate={onNavigate}
          />
        </div>
        <MiniCalendar
          appointments={appointments}
        />
      </div>

      {/* ── Recent Docs + Recent Students ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Recent documents */}
        <div className="rounded-2xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.border}` }}>
            <div>
              <h3 className="text-sm font-bold" style={{ color: C.dark }}>Documentos recentes</h3>
              <p className="text-[11px]" style={{ color: C.textSec }}>Últimas atividades</p>
            </div>
            <button onClick={() => onNavigate?.('protocols')} className="text-[11px] font-semibold" style={{ color: C.petrol }}>
              Ver todos →
            </button>
          </div>
          <div className="p-4 space-y-2">
            {recent.length === 0 ? (
              <div className="py-8 text-center text-sm" style={{ color: C.textSec }}>Nenhum documento ainda.</div>
            ) : recent.map(p => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-gray-50"
                style={{ border: `1px solid ${C.border}` }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: C.violet + '15' }}>
                  <FileText size={15} style={{ color: C.violet }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate" style={{ color: C.dark }}>{p.studentName}</div>
                  <div className="text-[11px] truncate" style={{ color: C.textSec }}>{p.type}</div>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0"
                  style={p.status === 'FINAL'
                    ? { background: '#DCFCE7', color: '#166534' }
                    : { background: C.goldLight, color: C.gold }}>
                  {p.status === 'FINAL' ? 'Final' : 'Rascunho'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent students */}
        <div className="rounded-2xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.border}` }}>
            <div>
              <h3 className="text-sm font-bold" style={{ color: C.dark }}>Alunos recentes</h3>
              <p className="text-[11px]" style={{ color: C.textSec }}>Últimos cadastrados</p>
            </div>
            <button onClick={() => onNavigate?.('students')} className="text-[11px] font-semibold" style={{ color: C.petrol }}>
              Ver todos →
            </button>
          </div>
          <div className="p-4 space-y-2">
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
              <div key={s.id} className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-gray-50"
                style={{ border: `1px solid ${C.border}` }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm text-white"
                  style={{ background: `linear-gradient(135deg, ${C.petrol}, ${C.dark})` }}>
                  {(s.name ?? '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate" style={{ color: C.dark }}>{s.name}</div>
                  <div className="text-[11px] truncate" style={{ color: C.textSec }}>
                    {s.grade ?? s.school ?? 'Sem turma'}
                  </div>
                </div>
                <TrendingUp size={13} style={{ color: C.emerald, opacity: 0.7 }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Alertas: aluno acessado por outra escola ─────────────────────── */}
      {accessNotifs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bell size={15} style={{ color: C.amber }} />
              <h2 className="text-sm font-bold" style={{ color: C.dark }}>
                Alertas de acesso
              </h2>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: C.amber + '22', color: C.amber }}
              >
                {accessNotifs.length}
              </span>
            </div>
            <button
              onClick={dismissAllNotifs}
              className="text-[11px] font-semibold transition hover:opacity-70"
              style={{ color: C.textSec }}
            >
              Marcar todos como lidos
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {accessNotifs.map(n => {
              const studentName = n.data?.student_name as string | undefined;
              const protocol    = n.data?.protocol_code as string | undefined;
              const school      = n.data?.requesting_school as string | undefined;
              const dateStr     = new Date(n.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              });

              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: '#FFFBEB',
                    border: '1.5px solid #FDE68A',
                    boxShadow: '0 4px 16px rgba(217,119,6,0.10)',
                    borderLeft: '4px solid #D97706',
                  }}
                >
                  {/* Header do card */}
                  <div
                    className="flex items-center justify-between px-5 pt-4 pb-2"
                    style={{ borderBottom: '1px solid #FDE68A' }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: '#FEF3C7' }}
                      >
                        <ShieldCheck size={15} style={{ color: '#D97706' }} />
                      </div>
                      <p className="text-sm font-bold" style={{ color: '#92400E' }}>
                        {n.title}
                      </p>
                    </div>
                    <span className="text-[10px]" style={{ color: '#B45309', opacity: 0.6 }}>
                      {dateStr}
                    </span>
                  </div>

                  {/* Corpo do card */}
                  <div className="px-5 py-4 flex flex-col gap-2">
                    {/* Nome do aluno em destaque */}
                    {studentName && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#B45309' }}>
                          Aluno
                        </span>
                        <span className="text-sm font-bold" style={{ color: '#92400E' }}>
                          {studentName}
                        </span>
                      </div>
                    )}

                    {/* Escola solicitante */}
                    {school && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#B45309' }}>
                          Escola
                        </span>
                        <span className="text-xs" style={{ color: '#92400E' }}>
                          {school}
                        </span>
                      </div>
                    )}

                    {/* Mensagem */}
                    {!studentName && (
                      <p className="text-xs leading-relaxed" style={{ color: '#B45309' }}>
                        {n.body}
                      </p>
                    )}

                    {/* Protocolo */}
                    {protocol && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#B45309' }}>
                          Protocolo
                        </span>
                        <span
                          className="font-mono font-bold text-xs px-2 py-0.5 rounded-lg"
                          style={{ background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A' }}
                        >
                          {protocol}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Ações */}
                  <div
                    className="flex items-center gap-2 px-5 pb-4"
                    style={{ borderTop: '1px solid #FDE68A', paddingTop: '12px' }}
                  >
                    <button
                      onClick={() => onNavigate?.('students')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition hover:opacity-80"
                      style={{ background: '#D97706', color: '#fff' }}
                    >
                      <ArrowRight size={13} />
                      Ver detalhes
                    </button>
                    <button
                      onClick={() => dismissNotif(n.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition hover:opacity-80"
                      style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}
                    >
                      <CheckCircle2 size={13} />
                      OK, ciente
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Smart Suggestions ─────────────────────────────────────────────── */}
      {suggestions.length > 0 && (
        <div>
          <h2 className="text-sm font-bold mb-3" style={{ color: C.dark }}>Sugestões inteligentes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {suggestions.map((s, i) => (
              <AlertCard
                key={i}
                icon={s.icon}
                title={s.title}
                body={s.body}
                color={s.color}
                action={s.action}
                onAction={s.nav ? () => onNavigate?.(s.nav!) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Upgrade CTA ───────────────────────────────────────────────────── */}
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
