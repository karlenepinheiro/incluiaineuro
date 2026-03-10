import React, { useEffect, useMemo, useState } from 'react';
import { Users, FileText, AlertCircle, Zap, TrendingUp, CheckCircle2, Clock, ArrowRight, Calendar, CalendarDays, ChevronLeft, ChevronRight, MapPin, User } from 'lucide-react';
import { Student, Protocol, Appointment } from '../types';

const C = {
  bg: '#F6F4EF',
  surface: '#FFFFFF',
  text: '#1F2937',
  textSec: '#667085',
  petrol: '#1F4E5F',
  dark: '#2E3A59',
  gold: '#C69214',
  goldLight: '#FDF6E3',
  border: '#E7E2D8',
  borderMid: '#C9C3B5',
};

interface DashboardViewProps {
  userName?: string;
  students: Student[];
  protocols: Protocol[];
  appointments?: Appointment[];
  planMaxStudents?: number;
  planMonthlyCredits?: number;
  creditsAvailable?: number;
  creditsResetAt?: string | null;
  onNavigate?: (view: string) => void;
}

function clamp(n: number, a = 0, b = 100) {
  return Math.max(a, Math.min(b, n));
}

function greetingByHour(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function greetingEmojiByHour(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return '☀️';
  if (h < 18) return '🌤️';
  return '🌙';
}

function fmtDateBR(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR');
}

function ArcMeter({ valuePct, danger }: { valuePct: number; danger?: boolean }) {
  const v = clamp(valuePct);
  const r = 40;
  const circumference = Math.PI * r; // half circle
  const dash = (v / 100) * circumference;
  const color = danger ? '#EF4444' : C.petrol;
  const trackColor = danger ? '#FEE2E2' : '#E7E2D8';

  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="70" viewBox="0 0 120 70">
        <defs>
          <linearGradient id={danger ? 'arcDanger' : 'arcSafe'} x1="0" y1="0" x2="120" y2="0">
            {danger ? (
              <>
                <stop offset="0%" stopColor="#EF4444" />
                <stop offset="100%" stopColor="#F43F5E" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor={C.petrol} />
                <stop offset="100%" stopColor={C.gold} />
              </>
            )}
          </linearGradient>
        </defs>
        <path
          d="M10,60 A50,50 0 0 1 110,60"
          fill="none"
          stroke={trackColor}
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M10,60 A50,50 0 0 1 110,60"
          fill="none"
          stroke={`url(#${danger ? 'arcDanger' : 'arcSafe'})`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.7s ease-out' }}
        />
        <text x="60" y="52" textAnchor="middle" fontSize="15" fontWeight="700" fill={color}>
          {Math.round(v)}%
        </text>
      </svg>
    </div>
  );
}

function LinearMeter({ valuePct, danger }: { valuePct: number; danger?: boolean }) {
  const v = clamp(valuePct);
  return (
    <div className="w-full">
      <div
        className="w-full h-3 rounded-full overflow-hidden"
        style={{ background: danger ? '#FEE2E2' : C.border }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${v}%`,
            background: danger
              ? 'linear-gradient(90deg,#EF4444,#F43F5E)'
              : `linear-gradient(90deg,${C.petrol},${C.gold})`,
            transition: 'width 0.7s ease-out',
          }}
        />
      </div>
      <div className="text-right text-xs font-bold mt-1" style={{ color: danger ? '#EF4444' : C.petrol }}>
        {Math.round(v)}%
      </div>
    </div>
  );
}

// ─── Mini Calendar ─────────────────────────────────────────────────────────

const MONTHS_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];
const DAYS_SHORT = ['D','S','T','Q','Q','S','S'];

function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDay(year: number, month: number)    { return new Date(year, month, 1).getDay(); }

function MiniCalendar({
  appointments = [],
  onViewAgenda,
}: {
  appointments: Appointment[];
  onViewAgenda?: () => void;
}) {
  const today = new Date();
  const [calYear, setCalYear]   = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const aptDays = useMemo(() => {
    const s = new Set<string>();
    appointments.forEach(a => {
      const parts = a.date.slice(0, 10).split('-').map(Number);
      const [ay, am] = parts;
      if (ay === calYear && am - 1 === calMonth) s.add(a.date.slice(8, 10));
    });
    return s;
  }, [appointments, calYear, calMonth]);

  const days      = getDaysInMonth(calYear, calMonth);
  const firstDay  = getFirstDay(calYear, calMonth);

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: C.surface, border: `1.5px solid ${C.border}`, boxShadow: '0 2px 12px rgba(31,78,95,0.06)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1 rounded-lg transition hover:bg-gray-100">
          <ChevronLeft size={14} style={{ color: C.textSec }} />
        </button>
        <div>
          <div className="text-xs font-bold text-center" style={{ color: C.dark }}>
            {MONTHS_PT[calMonth]}
          </div>
          <div className="text-[10px] text-center" style={{ color: C.textSec }}>{calYear}</div>
        </div>
        <button onClick={nextMonth} className="p-1 rounded-lg transition hover:bg-gray-100">
          <ChevronRight size={14} style={{ color: C.textSec }} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_SHORT.map((d, i) => (
          <div key={i} className="text-center text-[9px] font-bold py-0.5" style={{ color: C.textSec }}>
            {d}
          </div>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const d    = i + 1;
          const ds   = String(d).padStart(2, '0');
          const isT  = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
          const hasA = aptDays.has(ds);

          return (
            <div
              key={d}
              className="flex flex-col items-center py-1 rounded-lg"
              style={{ background: isT ? C.petrol : 'transparent' }}
            >
              <span
                className="text-[10px] font-bold leading-none"
                style={{ color: isT ? '#fff' : C.dark }}
              >
                {d}
              </span>
              {hasA && (
                <div
                  className="w-1 h-1 rounded-full mt-0.5"
                  style={{ background: isT ? 'rgba(255,255,255,0.8)' : C.gold }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Link */}
      {onViewAgenda && (
        <button
          onClick={onViewAgenda}
          className="w-full mt-3 text-[10px] font-semibold text-center py-1.5 rounded-lg transition"
          style={{ color: C.petrol, background: C.petrol + '10' }}
        >
          Ver agenda completa →
        </button>
      )}
    </div>
  );
}

// ─── Atendimentos do Dia ────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  agendado:   { bg: '#EFF9FF', color: '#0369A1' },
  realizado:  { bg: '#F0FDF4', color: '#166534' },
  cancelado:  { bg: '#FEF2F2', color: '#991B1B' },
  reagendado: { bg: '#FFFBEB', color: '#92400E' },
};

function TodayAppointments({
  appointments,
  onViewAgenda,
}: {
  appointments: Appointment[];
  onViewAgenda?: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const todayApts = useMemo(
    () => appointments
      .filter(a => a.date.slice(0, 10) === today)
      .sort((a, b) => a.time.localeCompare(b.time)),
    [appointments, today]
  );

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: C.surface, border: `1.5px solid ${C.border}`, boxShadow: '0 2px 12px rgba(31,78,95,0.06)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-bold" style={{ color: C.dark }}>
            Atendimentos Hoje
          </div>
          <div className="text-xs mt-0.5" style={{ color: C.textSec }}>
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: C.petrol + '15' }}
        >
          <CalendarDays size={16} style={{ color: C.petrol }} />
        </div>
      </div>

      {todayApts.length === 0 ? (
        <div
          className="flex flex-col items-center py-6 rounded-xl"
          style={{ background: C.bg, border: `1px dashed ${C.border}` }}
        >
          <Calendar size={24} style={{ color: C.border }} />
          <p className="text-xs mt-2" style={{ color: C.textSec }}>
            Nenhum atendimento hoje
          </p>
          {onViewAgenda && (
            <button
              onClick={onViewAgenda}
              className="mt-2 text-[10px] font-semibold"
              style={{ color: C.petrol }}
            >
              Agendar →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {todayApts.map((apt: Appointment) => {
            const sc = STATUS_COLORS[apt.status] ?? { bg: C.bg, color: C.dark };
            return (
              <div
                key={apt.id}
                className="flex items-start gap-3 rounded-xl p-3"
                style={{ background: sc.bg }}
              >
                {/* Horário */}
                <div
                  className="rounded-lg px-2 py-1 text-center shrink-0"
                  style={{ background: C.petrol, minWidth: 44 }}
                >
                  <div className="text-[10px] font-black text-white leading-none">{apt.time}</div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate" style={{ color: C.dark }}>
                    {apt.title}
                  </div>
                  {apt.studentName && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <User size={9} style={{ color: C.textSec }} />
                      <span className="text-[10px] truncate" style={{ color: C.textSec }}>
                        {apt.studentName}
                      </span>
                    </div>
                  )}
                  {apt.location && (
                    <div className="flex items-center gap-1">
                      <MapPin size={9} style={{ color: C.textSec }} />
                      <span className="text-[10px] truncate" style={{ color: C.textSec }}>
                        {apt.location}
                      </span>
                    </div>
                  )}
                </div>

                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ background: sc.color + '20', color: sc.color }}
                >
                  {apt.status}
                </span>
              </div>
            );
          })}

          {onViewAgenda && (
            <button
              onClick={onViewAgenda}
              className="w-full text-[10px] font-semibold py-1.5 rounded-lg mt-1 transition"
              style={{ color: C.petrol, background: C.petrol + '10' }}
            >
              Ver agenda completa →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type MeterMode = 'arc' | 'bar';

function MeterCard({
  title,
  subtitle,
  valuePct,
  mode,
  onToggle,
  footer,
  danger,
}: {
  title: string;
  subtitle: string;
  valuePct: number;
  mode: MeterMode;
  onToggle: () => void;
  footer?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: C.surface,
        border: `1.5px solid ${C.border}`,
        boxShadow: '0 2px 12px rgba(31,78,95,0.06)',
      }}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="text-sm font-bold" style={{ color: C.dark }}>
            {title}
          </div>
          <div className="text-xs mt-0.5" style={{ color: C.textSec }}>
            {subtitle}
          </div>
        </div>
        <button
          onClick={onToggle}
          className="text-xs px-3 py-1 rounded-full transition"
          style={{ border: `1px solid ${C.border}`, color: C.textSec, background: C.bg }}
        >
          {mode === 'arc' ? 'Arco' : 'Barra'}
        </button>
      </div>

      {mode === 'arc' ? (
        <ArcMeter valuePct={valuePct} danger={danger} />
      ) : (
        <div className="py-2">
          <LinearMeter valuePct={valuePct} danger={danger} />
        </div>
      )}

      {footer && <div className="mt-4 text-xs" style={{ color: C.textSec }}>{footer}</div>}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: C.surface,
        border: `1.5px solid ${C.border}`,
        boxShadow: '0 2px 8px rgba(31,78,95,0.05)',
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
        style={{ background: accent + '18' }}
      >
        <Icon size={20} style={{ color: accent }} />
      </div>
      <div className="text-3xl font-bold mb-1" style={{ color: C.dark }}>
        {value}
      </div>
      <div className="text-xs font-medium" style={{ color: C.textSec }}>
        {label}
      </div>
    </div>
  );
}

export function DashboardView({
  userName,
  students,
  protocols,
  appointments = [],
  planMaxStudents,
  planMonthlyCredits,
  creditsAvailable,
  creditsResetAt,
  onNavigate,
}: DashboardViewProps) {
  const [modeStudents, setModeStudents] = useState<MeterMode>('arc');
  const [modeCredits, setModeCredits] = useState<MeterMode>('bar');

  const kpis = useMemo(() => {
    const finals = protocols.filter(p => p.status === 'FINAL').length;
    const drafts = protocols.filter(p => p.status === 'DRAFT').length;
    const byType = protocols.reduce<Record<string, number>>((acc, p) => {
      acc[String(p.type)] = (acc[String(p.type)] || 0) + 1;
      return acc;
    }, {});
    return { total: protocols.length, finals, drafts, byType };
  }, [protocols]);

  const maxStudents = Number.isFinite(planMaxStudents as number) ? (planMaxStudents as number) : 0;
  const monthlyCredits = Number.isFinite(planMonthlyCredits as number) ? (planMonthlyCredits as number) : 0;
  const available = Number.isFinite(creditsAvailable as number) ? (creditsAvailable as number) : 0;

  const studentsPct = maxStudents > 0 ? (students.length / maxStudents) * 100 : 0;
  const creditsUsed = monthlyCredits > 0 ? Math.max(0, monthlyCredits - available) : 0;
  const creditsPct = monthlyCredits > 0 ? (creditsUsed / monthlyCredits) * 100 : 0;
  const creditsLow = monthlyCredits > 0 && (available <= 10 || creditsPct >= 70);

  const typeBars = useMemo(() => {
    const entries = (Object.entries(kpis.byType) as [string, number][]).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = Math.max(1, ...entries.map(([, v]) => v));
    return entries.map(([name, value]) => ({ name, value, pct: (value / max) * 100 }));
  }, [kpis.byType]);

  const resetBR = fmtDateBR(creditsResetAt);
  const greet = greetingByHour();
  const emoji = greetingEmojiByHour();
  const safeName = (userName ?? '').trim() || 'Professora';

  // Recent protocols (last 4)
  const recent = useMemo(
    () => [...protocols].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4),
    [protocols]
  );

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: C.bg }}>
      {/* Header greeting */}
      <div
        className="rounded-2xl p-7"
        style={{
          background: `linear-gradient(135deg, ${C.petrol} 0%, ${C.dark} 100%)`,
          boxShadow: '0 4px 24px rgba(31,78,95,0.18)',
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white mb-1">
              {emoji} {greet}, {safeName}!
            </h1>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Aqui está o resumo do seu trabalho hoje.
            </p>
          </div>
          <div
            className="text-right text-xs px-4 py-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }}
          >
            <div className="font-bold">{students.length} alunos</div>
            <div style={{ color: 'rgba(255,255,255,0.6)' }}>cadastrados</div>
          </div>
        </div>
      </div>

      {/* Meters */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <MeterCard
          title="Limite de alunos"
          subtitle={
            maxStudents > 0
              ? `${students.length} de ${maxStudents} alunos`
              : `${students.length} alunos ativos`
          }
          valuePct={studentsPct}
          mode={modeStudents}
          onToggle={() => setModeStudents(m => (m === 'arc' ? 'bar' : 'arc'))}
        />
        <MeterCard
          title="Créditos IA"
          subtitle={
            monthlyCredits > 0
              ? `${available} disponíveis · ${monthlyCredits}/mês`
              : 'Créditos não disponíveis neste plano'
          }
          valuePct={creditsPct}
          mode={modeCredits}
          onToggle={() => setModeCredits(m => (m === 'arc' ? 'bar' : 'arc'))}
          danger={creditsLow}
          footer={
            <div className="space-y-1">
              {resetBR && (
                <span>
                  Renova em: <strong style={{ color: C.dark }}>{resetBR}</strong>
                </span>
              )}
              {creditsLow && (
                <div className="font-semibold" style={{ color: '#EF4444' }}>
                  Créditos quase esgotados. Faça upgrade em Configurações.
                </div>
              )}
            </div>
          }
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={CheckCircle2} label="Documentos finalizados" value={kpis.finals} accent={C.petrol} />
        <KpiCard icon={Users} label="Alunos cadastrados" value={students.length} accent={C.gold} />
        <KpiCard icon={Clock} label="Rascunhos pendentes" value={kpis.drafts} accent="#F59E0B" />
        <KpiCard icon={FileText} label="Total de documentos" value={kpis.total} accent={C.dark} />
      </div>

      {/* Agenda widgets: Atendimentos Hoje + Mini Calendário */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <TodayAppointments
            appointments={appointments}
            onViewAgenda={onNavigate ? () => onNavigate('agenda') : undefined}
          />
        </div>
        <MiniCalendar
          appointments={appointments}
          onViewAgenda={onNavigate ? () => onNavigate('agenda') : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Doc type distribution */}
        <div
          className="rounded-2xl p-6"
          style={{ background: C.surface, border: `1.5px solid ${C.border}`, boxShadow: '0 2px 12px rgba(31,78,95,0.06)' }}
        >
          <div className="text-sm font-bold mb-1" style={{ color: C.dark }}>
            Distribuição por tipo
          </div>
          <div className="text-xs mb-5" style={{ color: C.textSec }}>
            Top 6 documentos gerados
          </div>

          <div className="space-y-3">
            {typeBars.length === 0 && (
              <div className="text-sm py-6 text-center" style={{ color: C.textSec }}>
                Nenhum documento ainda.
              </div>
            )}
            {typeBars.map(b => (
              <div key={b.name} className="flex items-center gap-3">
                <div className="w-40 text-xs truncate" style={{ color: C.textSec }}>
                  {b.name}
                </div>
                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: C.border }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${b.pct}%`,
                      background: `linear-gradient(90deg,${C.petrol},${C.gold})`,
                      transition: 'width 0.7s ease-out',
                    }}
                  />
                </div>
                <div className="w-8 text-xs text-right font-bold" style={{ color: C.dark }}>
                  {b.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent protocols */}
        <div
          className="rounded-2xl p-6"
          style={{ background: C.surface, border: `1.5px solid ${C.border}`, boxShadow: '0 2px 12px rgba(31,78,95,0.06)' }}
        >
          <div className="text-sm font-bold mb-1" style={{ color: C.dark }}>
            Documentos recentes
          </div>
          <div className="text-xs mb-5" style={{ color: C.textSec }}>
            Últimas atividades
          </div>

          <div className="space-y-3">
            {recent.length === 0 && (
              <div className="text-sm py-6 text-center" style={{ color: C.textSec }}>
                Nenhum documento ainda.
              </div>
            )}
            {recent.map(p => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-xl p-3 transition"
                style={{ background: C.bg, border: `1px solid ${C.border}` }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: C.petrol + '18' }}
                >
                  <FileText size={14} style={{ color: C.petrol }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate" style={{ color: C.dark }}>
                    {p.studentName}
                  </div>
                  <div className="text-xs truncate" style={{ color: C.textSec }}>
                    {p.type}
                  </div>
                </div>
                <div
                  className="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0"
                  style={
                    p.status === 'FINAL'
                      ? { background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }
                      : { background: C.goldLight, color: C.gold, border: `1px solid ${C.borderMid}` }
                  }
                >
                  {p.status === 'FINAL' ? 'Final' : 'Rascunho'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
