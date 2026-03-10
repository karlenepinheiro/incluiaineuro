import React, { useMemo, useState } from 'react';
import { Edit, Trash2, ArrowRight, Plus, Search, Users, UserPlus, Filter } from 'lucide-react';
import { Student, PlanTier, getPlanLimits } from '../types';

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

interface StudentsListViewProps {
  students: Student[];
  planMaxStudents?: number;
  userPlan: PlanTier;
  onSelect: (s: Student) => void;
  onEdit: (s: Student) => void;
  onDelete: (id: string) => void;
  onCreateTriagem: () => void;
  onCreateComLaudo: () => void;
}

type FilterType = 'all' | 'em_triagem' | 'com_laudo' | 'externo';

export const StudentsListView: React.FC<StudentsListViewProps> = ({
  students,
  planMaxStudents,
  userPlan,
  onSelect,
  onEdit,
  onDelete,
  onCreateTriagem,
  onCreateComLaudo,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const maxStudents = planMaxStudents && planMaxStudents > 0
    ? planMaxStudents
    : getPlanLimits(userPlan).students;

  const filtered = useMemo(() => {
    return students.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.diagnosis || []).join(' ').toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      if (filter === 'em_triagem') return s.tipo_aluno === 'em_triagem';
      if (filter === 'com_laudo') return s.tipo_aluno === 'com_laudo';
      if (filter === 'externo') return s.isExternalStudent === true;
      return true;
    });
  }, [students, search, filter]);

  const counts = useMemo(() => ({
    total: students.length,
    triagem: students.filter(s => s.tipo_aluno === 'em_triagem').length,
    laudo: students.filter(s => s.tipo_aluno === 'com_laudo').length,
    externo: students.filter(s => s.isExternalStudent).length,
  }), [students]);

  const usagePct = maxStudents > 0 ? Math.min(100, (students.length / maxStudents) * 100) : 0;

  const filterTabs: { id: FilterType; label: string; count: number }[] = [
    { id: 'all', label: 'Todos', count: counts.total },
    { id: 'com_laudo', label: 'Com Laudo', count: counts.laudo },
    { id: 'em_triagem', label: 'Em Triagem', count: counts.triagem },
    { id: 'externo', label: 'Externos', count: counts.externo },
  ];

  return (
    <div className="min-h-screen p-6" style={{ background: C.bg }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: C.dark }}>Meus Alunos</h1>
            <p className="text-sm mt-0.5" style={{ color: C.textSec }}>
              {students.length} de {maxStudents} vagas utilizadas
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCreateTriagem}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition"
              style={{
                background: C.goldLight,
                color: C.gold,
                border: `1.5px solid ${C.gold}`,
              }}
            >
              <Search size={15} /> Em Triagem
            </button>
            <button
              onClick={onCreateComLaudo}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white transition"
              style={{ background: C.petrol, boxShadow: '0 4px 12px rgba(31,78,95,0.25)' }}
            >
              <Plus size={15} /> Com Laudo
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div
          className="rounded-2xl p-5 mb-6 flex items-center gap-5"
          style={{ background: C.surface, border: `1.5px solid ${C.border}` }}
        >
          <Users size={20} style={{ color: C.petrol, flexShrink: 0 }} />
          <div className="flex-1">
            <div className="flex justify-between text-xs font-semibold mb-1.5" style={{ color: C.dark }}>
              <span>Capacidade utilizada</span>
              <span>{students.length} / {maxStudents}</span>
            </div>
            <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: C.border }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${usagePct}%`,
                  background: usagePct > 80
                    ? 'linear-gradient(90deg,#EF4444,#F43F5E)'
                    : `linear-gradient(90deg,${C.petrol},${C.gold})`,
                }}
              />
            </div>
          </div>
          <span
            className="text-sm font-bold shrink-0"
            style={{ color: usagePct > 80 ? '#EF4444' : C.petrol }}
          >
            {Math.round(usagePct)}%
          </span>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div
            className="flex items-center gap-2 flex-1 rounded-xl px-4 py-2.5"
            style={{ background: C.surface, border: `1.5px solid ${C.border}` }}
          >
            <Search size={16} style={{ color: C.textSec, flexShrink: 0 }} />
            <input
              className="flex-1 text-sm outline-none bg-transparent"
              style={{ color: C.text }}
              placeholder="Buscar aluno ou diagnóstico..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div
            className="flex rounded-xl overflow-hidden"
            style={{ border: `1.5px solid ${C.border}`, background: C.surface }}
          >
            {filterTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className="px-3 py-2 text-xs font-bold transition flex items-center gap-1"
                style={
                  filter === tab.id
                    ? { background: C.petrol, color: '#fff' }
                    : { color: C.textSec }
                }
              >
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full ml-1"
                    style={
                      filter === tab.id
                        ? { background: 'rgba(255,255,255,0.2)', color: '#fff' }
                        : { background: C.border, color: C.textSec }
                    }
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div
            className="rounded-2xl p-12 flex flex-col items-center"
            style={{ background: C.surface, border: `1.5px dashed ${C.borderMid}` }}
          >
            <UserPlus size={40} style={{ color: C.borderMid }} />
            <p className="mt-3 font-semibold" style={{ color: C.textSec }}>
              {search || filter !== 'all' ? 'Nenhum aluno encontrado' : 'Nenhum aluno cadastrado ainda'}
            </p>
            <p className="text-xs mt-1" style={{ color: C.borderMid }}>
              {search ? 'Tente outros termos' : 'Clique em "+ Com Laudo" ou "Em Triagem" para começar'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(s => (
              <StudentCard
                key={s.id}
                student={s}
                onSelect={onSelect}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function StudentCard({
  student: s,
  onSelect,
  onEdit,
  onDelete,
}: {
  student: Student;
  onSelect: (s: Student) => void;
  onEdit: (s: Student) => void;
  onDelete: (id: string) => void;
}) {
  const isTriagem = s.tipo_aluno === 'em_triagem';
  const isExternal = s.isExternalStudent;

  return (
    <div
      onClick={() => onSelect(s)}
      className="rounded-2xl cursor-pointer group transition"
      style={{
        background: C.surface,
        border: `1.5px solid ${C.border}`,
        boxShadow: '0 2px 8px rgba(31,78,95,0.05)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = C.petrol;
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 6px 24px rgba(31,78,95,0.12)`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = C.border;
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(31,78,95,0.05)';
      }}
    >
      {/* Accent bar */}
      <div
        className="h-1.5 rounded-t-2xl"
        style={{
          background: isTriagem
            ? 'linear-gradient(90deg,#F59E0B,#FCD34D)'
            : `linear-gradient(90deg,${C.petrol},${C.dark})`,
        }}
      />

      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden shrink-0 text-lg font-bold text-white"
            style={{
              background: s.photoUrl
                ? undefined
                : `linear-gradient(135deg,${isTriagem ? '#F59E0B' : C.petrol},${isTriagem ? '#FCD34D' : C.dark})`,
            }}
          >
            {s.photoUrl ? (
              <img src={s.photoUrl} className="w-full h-full object-cover" alt={s.name} />
            ) : (
              s.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm truncate transition" style={{ color: C.dark }}>
              {s.name}
            </h3>
            <p className="text-xs truncate mt-0.5" style={{ color: C.textSec }}>
              {s.diagnosis?.length ? s.diagnosis.join(', ') : 'Sem diagnóstico definido'}
            </p>
            <div className="flex gap-1 mt-1 flex-wrap">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={
                  isTriagem
                    ? { background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }
                    : { background: '#EFF9FF', color: C.petrol, border: `1px solid #BAE6FD` }
                }
              >
                {isTriagem ? 'Em Triagem' : 'Com Laudo'}
              </span>
              {isExternal && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: C.goldLight, color: C.gold, border: `1px solid ${C.borderMid}` }}
                >
                  Externo
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Info row */}
        <div
          className="text-xs mb-4 px-3 py-2 rounded-xl"
          style={{ background: C.bg, color: C.textSec }}
        >
          {s.grade && <span>{s.grade}</span>}
          {s.grade && s.shift && <span className="mx-1.5">·</span>}
          {s.shift && <span>{s.shift}</span>}
          {(s.grade || s.shift) && s.regentTeacher && <span className="mx-1.5">·</span>}
          {s.regentTeacher && <span className="truncate">{s.regentTeacher}</span>}
          {!s.grade && !s.shift && !s.regentTeacher && (
            <span style={{ color: C.borderMid }}>Dados incompletos</span>
          )}
        </div>

        <div
          className="flex items-center justify-between pt-3"
          style={{ borderTop: `1px solid ${C.border}` }}
        >
          <div className="flex gap-1">
            <button
              onClick={e => { e.stopPropagation(); onEdit(s); }}
              className="p-2 rounded-lg transition"
              style={{ color: C.textSec }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = C.petrol + '18';
                (e.currentTarget as HTMLButtonElement).style.color = C.petrol;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = C.textSec;
              }}
            >
              <Edit size={16} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(s.id); }}
              className="p-2 rounded-lg transition"
              style={{ color: C.textSec }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2';
                (e.currentTarget as HTMLButtonElement).style.color = '#EF4444';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = C.textSec;
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: C.petrol }}>
            Ver ficha <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </div>
  );
}
