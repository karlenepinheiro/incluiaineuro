import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Plus,
  Clock,
  User,
  MapPin,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Trash2,
  Edit2,
} from 'lucide-react';
import { Appointment, Student, User as UserType } from '../types';
import { AudioEnhancedTextarea } from '../components/AudioEnhancedTextarea';

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

const TYPE_LABELS: Record<Appointment['type'], string> = {
  AEE: 'AEE',
  Avaliacao: 'Avaliação',
  Reuniao: 'Reunião',
  Atendimento: 'Atendimento',
  Outro: 'Outro',
};

const STATUS_CONFIG: Record<
  Appointment['status'],
  { label: string; color: string; bg: string; border: string; icon: React.ElementType }
> = {
  agendado: { label: 'Agendado', color: C.petrol, bg: '#EFF9FF', border: '#BAE6FD', icon: Clock },
  realizado: { label: 'Realizado', color: '#166534', bg: '#F0FDF4', border: '#BBF7D0', icon: CheckCircle2 },
  cancelado: { label: 'Cancelado', color: '#991B1B', bg: '#FEF2F2', border: '#FECACA', icon: XCircle },
  reagendado: { label: 'Reagendado', color: '#92400E', bg: '#FFFBEB', border: '#FDE68A', icon: RefreshCw },
};

const MONTHS_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];
const DAYS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

interface AppointmentsViewProps {
  students: Student[];
  user: UserType;
  appointments: Appointment[];
  onAddAppointment: (apt: Appointment) => void;
  onUpdateAppointment: (apt: Appointment) => void;
  onDeleteAppointment: (id: string) => void;
}

const EMPTY_FORM: Partial<Appointment> = {
  title: '',
  date: '',
  time: '08:00',
  duration: 50,
  type: 'AEE',
  professional: '',
  location: '',
  notes: '',
  status: 'agendado',
  studentId: '',
  studentName: '',
};

export const AppointmentsView: React.FC<AppointmentsViewProps> = ({
  students,
  user,
  appointments,
  onAddAppointment,
  onUpdateAppointment,
  onDeleteAppointment,
}) => {
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [showForm, setShowForm] = useState(false);
  const [editingApt, setEditingApt] = useState<Appointment | null>(null);
  const [form, setForm] = useState<Partial<Appointment>>(EMPTY_FORM);

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);

  // Group appointments by day key "YYYY-MM-DD"
  const aptsByDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    appointments.forEach(a => {
      const key = a.date.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [appointments]);

  const selectedDateStr = useMemo(() => {
    if (!selectedDay) return '';
    const m = String(calMonth + 1).padStart(2, '0');
    const d = String(selectedDay).padStart(2, '0');
    return `${calYear}-${m}-${d}`;
  }, [selectedDay, calMonth, calYear]);

  const selectedApts = useMemo(
    () => aptsByDay[selectedDateStr] ?? [],
    [aptsByDay, selectedDateStr]
  );

  const openCreate = () => {
    setEditingApt(null);
    setForm({ ...EMPTY_FORM, date: selectedDateStr, professional: user.name });
    setShowForm(true);
  };

  const openEdit = (apt: Appointment) => {
    setEditingApt(apt);
    setForm({ ...apt });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.title?.trim() || !form.date || !form.time) return;
    const apt: Appointment = {
      id: editingApt?.id ?? crypto.randomUUID(),
      title: form.title!,
      date: form.date!,
      time: form.time!,
      duration: form.duration ?? 50,
      type: form.type ?? 'AEE',
      professional: form.professional ?? user.name,
      location: form.location,
      notes: form.notes,
      status: form.status ?? 'agendado',
      studentId: form.studentId,
      studentName: form.studentName,
      createdAt: editingApt?.createdAt ?? new Date().toISOString(),
    };
    if (editingApt) onUpdateAppointment(apt);
    else onAddAppointment(apt);
    setShowForm(false);
    setEditingApt(null);
  };

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
    setSelectedDay(null);
  };

  const isToday = (d: number) =>
    d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();

  const dayKey = (d: number) => {
    const m = String(calMonth + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${calYear}-${m}-${dd}`;
  };

  return (
    <div className="min-h-screen p-6" style={{ background: C.bg }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: C.dark }}>
              Agenda
            </h1>
            <p className="text-sm mt-0.5" style={{ color: C.textSec }}>
              Gerencie atendimentos, avaliações e reuniões
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition"
            style={{ background: C.petrol, boxShadow: '0 4px 14px rgba(31,78,95,0.25)' }}
          >
            <Plus size={16} /> Novo agendamento
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div
            className="lg:col-span-2 rounded-2xl p-6"
            style={{ background: C.surface, border: `1.5px solid ${C.border}`, boxShadow: '0 2px 12px rgba(31,78,95,0.06)' }}
          >
            {/* Month nav */}
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={prevMonth}
                className="p-2 rounded-lg transition"
                style={{ border: `1px solid ${C.border}`, color: C.textSec }}
              >
                <ChevronLeft size={18} />
              </button>
              <h2 className="text-base font-bold" style={{ color: C.dark }}>
                {MONTHS_PT[calMonth]} {calYear}
              </h2>
              <button
                onClick={nextMonth}
                className="p-2 rounded-lg transition"
                style={{ border: `1px solid ${C.border}`, color: C.textSec }}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {DAYS_PT.map(d => (
                <div key={d} className="text-center text-xs font-bold py-1" style={{ color: C.textSec }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = i + 1;
                const key = dayKey(d);
                const apts = aptsByDay[key] ?? [];
                const sel = selectedDay === d;
                const tod = isToday(d);

                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDay(d)}
                    className="relative flex flex-col items-center py-2 rounded-xl transition"
                    style={{
                      background: sel
                        ? C.petrol
                        : tod
                        ? C.goldLight
                        : 'transparent',
                      border: sel
                        ? `2px solid ${C.petrol}`
                        : tod
                        ? `1.5px solid ${C.gold}`
                        : '1.5px solid transparent',
                    }}
                  >
                    <span
                      className="text-sm font-bold"
                      style={{ color: sel ? '#fff' : tod ? C.gold : C.dark }}
                    >
                      {d}
                    </span>
                    {apts.length > 0 && (
                      <div className="flex gap-0.5 mt-1 flex-wrap justify-center">
                        {apts.slice(0, 3).map((a, ai) => (
                          <div
                            key={ai}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              background: sel
                                ? 'rgba(255,255,255,0.8)'
                                : STATUS_CONFIG[a.status].color,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day detail */}
          <div
            className="rounded-2xl p-5"
            style={{ background: C.surface, border: `1.5px solid ${C.border}`, boxShadow: '0 2px 12px rgba(31,78,95,0.06)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-bold" style={{ color: C.dark }}>
                {selectedDay
                  ? `${selectedDay} de ${MONTHS_PT[calMonth]}`
                  : 'Selecione um dia'}
              </div>
              {selectedDay && (
                <button
                  onClick={openCreate}
                  className="p-1.5 rounded-lg transition"
                  style={{ background: C.petrol + '15', color: C.petrol }}
                >
                  <Plus size={14} />
                </button>
              )}
            </div>

            {selectedApts.length === 0 && selectedDay && (
              <div
                className="flex flex-col items-center py-8 rounded-xl"
                style={{ background: C.bg, border: `1px dashed ${C.borderMid}` }}
              >
                <Calendar size={28} style={{ color: C.borderMid }} />
                <p className="text-xs mt-2 text-center" style={{ color: C.textSec }}>
                  Nenhum agendamento
                </p>
              </div>
            )}

            <div className="space-y-3">
              {selectedApts
                .sort((a, b) => a.time.localeCompare(b.time))
                .map(apt => {
                  const sc = STATUS_CONFIG[apt.status];
                  const StatusIcon = sc.icon;
                  return (
                    <div
                      key={apt.id}
                      className="rounded-xl p-3"
                      style={{
                        background: sc.bg,
                        border: `1px solid ${sc.border}`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <StatusIcon size={12} style={{ color: sc.color }} />
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: sc.border, color: sc.color }}
                            >
                              {sc.label}
                            </span>
                          </div>
                          <div className="text-xs font-bold truncate" style={{ color: C.dark }}>
                            {apt.title}
                          </div>
                          <div className="flex items-center gap-1 mt-1" style={{ color: C.textSec }}>
                            <Clock size={10} />
                            <span className="text-[10px]">
                              {apt.time} · {apt.duration}min
                            </span>
                          </div>
                          {apt.studentName && (
                            <div className="flex items-center gap-1 mt-0.5" style={{ color: C.textSec }}>
                              <User size={10} />
                              <span className="text-[10px] truncate">{apt.studentName}</span>
                            </div>
                          )}
                          {apt.location && (
                            <div className="flex items-center gap-1 mt-0.5" style={{ color: C.textSec }}>
                              <MapPin size={10} />
                              <span className="text-[10px] truncate">{apt.location}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => openEdit(apt)}
                            className="p-1 rounded transition"
                            style={{ color: C.textSec }}
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => onDeleteAppointment(apt.id)}
                            className="p-1 rounded transition"
                            style={{ color: '#EF4444' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Upcoming list */}
        <div
          className="mt-6 rounded-2xl p-6"
          style={{ background: C.surface, border: `1.5px solid ${C.border}`, boxShadow: '0 2px 12px rgba(31,78,95,0.06)' }}
        >
          <div className="text-sm font-bold mb-4" style={{ color: C.dark }}>
            Próximos agendamentos
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {appointments
              .filter(a => a.status === 'agendado' && a.date >= today.toISOString().slice(0, 10))
              .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
              .slice(0, 6)
              .map(apt => {
                const sc = STATUS_CONFIG[apt.status];
                const d = new Date(apt.date + 'T12:00:00');
                return (
                  <div
                    key={apt.id}
                    className="rounded-xl p-4 flex items-center gap-3"
                    style={{ background: C.bg, border: `1px solid ${C.border}` }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 text-white text-[10px] font-bold"
                      style={{ background: C.petrol }}
                    >
                      <span className="text-base leading-none font-black">{d.getDate()}</span>
                      <span>{MONTHS_PT[d.getMonth()].slice(0, 3)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate" style={{ color: C.dark }}>
                        {apt.title}
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: C.textSec }}>
                        {apt.time} · {TYPE_LABELS[apt.type]}
                      </div>
                      {apt.studentName && (
                        <div className="text-[10px] truncate" style={{ color: C.textSec }}>
                          {apt.studentName}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            {appointments.filter(
              a => a.status === 'agendado' && a.date >= today.toISOString().slice(0, 10)
            ).length === 0 && (
              <div className="col-span-3 py-6 text-sm text-center" style={{ color: C.textSec }}>
                Nenhum agendamento futuro.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div
            className="w-full max-w-lg rounded-2xl p-7 max-h-[90vh] overflow-y-auto"
            style={{ background: C.surface, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
          >
            <h3 className="text-base font-bold mb-5" style={{ color: C.dark }}>
              {editingApt ? 'Editar agendamento' : 'Novo agendamento'}
            </h3>

            <div className="space-y-4">
              <Field label="Título*">
                <input
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{ border: `1.5px solid ${C.border}`, background: C.bg }}
                  value={form.title ?? ''}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ex: Atendimento AEE — Lucas"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Data*">
                  <input
                    type="date"
                    className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                    style={{ border: `1.5px solid ${C.border}`, background: C.bg }}
                    value={form.date ?? ''}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  />
                </Field>
                <Field label="Horário*">
                  <input
                    type="time"
                    className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                    style={{ border: `1.5px solid ${C.border}`, background: C.bg }}
                    value={form.time ?? '08:00'}
                    onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Duração (min)">
                  <input
                    type="number"
                    min={10}
                    max={240}
                    className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                    style={{ border: `1.5px solid ${C.border}`, background: C.bg }}
                    value={form.duration ?? 50}
                    onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))}
                  />
                </Field>
                <Field label="Tipo">
                  <select
                    className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                    style={{ border: `1.5px solid ${C.border}`, background: C.bg }}
                    value={form.type ?? 'AEE'}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as Appointment['type'] }))}
                  >
                    {Object.entries(TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Aluno (opcional)">
                <select
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{ border: `1.5px solid ${C.border}`, background: C.bg }}
                  value={form.studentId ?? ''}
                  onChange={e => {
                    const s = students.find(s => s.id === e.target.value);
                    setForm(f => ({ ...f, studentId: s?.id ?? '', studentName: s?.name ?? '' }));
                  }}
                >
                  <option value="">— Nenhum aluno vinculado —</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Profissional">
                <input
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{ border: `1.5px solid ${C.border}`, background: C.bg }}
                  value={form.professional ?? ''}
                  onChange={e => setForm(f => ({ ...f, professional: e.target.value }))}
                />
              </Field>

              <Field label="Local">
                <input
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{ border: `1.5px solid ${C.border}`, background: C.bg }}
                  value={form.location ?? ''}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="Sala AEE, Consultório 3..."
                />
              </Field>

              <Field label="Status">
                <select
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{ border: `1.5px solid ${C.border}`, background: C.bg }}
                  value={form.status ?? 'agendado'}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as Appointment['status'] }))}
                >
                  {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                    <option key={v} value={v}>{c.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Observações">
                <AudioEnhancedTextarea
                  fieldId="observacoes"
                  value={form.notes ?? ''}
                  onChange={v => setForm(f => ({ ...f, notes: v }))}
                  placeholder="Informações adicionais..."
                  rows={3}
                />
              </Field>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowForm(false); setEditingApt(null); }}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition"
                style={{ border: `1.5px solid ${C.border}`, color: C.textSec, background: C.bg }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition"
                style={{ background: C.petrol }}
              >
                {editingApt ? 'Salvar alterações' : 'Criar agendamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: '#2E3A59' }}>
        {label}
      </label>
      {children}
    </div>
  );
}
