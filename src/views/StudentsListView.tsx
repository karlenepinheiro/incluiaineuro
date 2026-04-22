import React, { useMemo, useState } from 'react';
import { Edit, Trash2, Plus, Search, Users, UserPlus, Globe, Upload, AlertCircle, LayoutGrid, List } from 'lucide-react';
import { Student, PlanTier, getPlanLimits, type User } from '../types';
import { StudentCodeSearchModal } from '../components/StudentCodeSearchModal';
import { StudentImportModal } from '../components/StudentImportModal';

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
  red: '#DC2626',
  redLight: '#FEF2F2',
  amber: '#D97706',
  amberLight: '#FFFBEB',
};

interface StudentsListViewProps {
  students: Student[];
  planMaxStudents?: number;
  userPlan: PlanTier;
  user?: User;
  onSelect: (s: Student) => void;
  onEdit: (s: Student) => void;
  onDelete: (id: string) => void;
  onCreateTriagem: () => void;
  onCreateComLaudo: () => void;
  onStudentImported?: (studentId: string, protocolCode: string | null) => void;
  onImportStudents?: (importedCount: number) => void;
}

type FilterType = 'all' | 'em_triagem' | 'com_laudo' | 'externo' | 'incompleto' | 'importado_incompleto';

export const StudentsListView: React.FC<StudentsListViewProps> = ({
  students,
  planMaxStudents,
  userPlan,
  user,
  onSelect,
  onEdit,
  onDelete,
  onCreateTriagem,
  onCreateComLaudo,
  onStudentImported,
  onImportStudents,
}) => {
  const [search, setSearch]             = useState('');
  const [filter, setFilter]             = useState<FilterType>('all');
  const [viewMode, setViewMode]         = useState<'grid' | 'compact'>('grid');
  const [showCodeSearch, setShowCodeSearch] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const maxStudents = planMaxStudents && planMaxStudents > 0
    ? planMaxStudents
    : getPlanLimits(userPlan).students;

  const filtered = useMemo(() => {
    return students.filter(s => {
      const matchSearch = (s.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (s.diagnosis || []).join(' ').toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      if (filter === 'em_triagem')  return s.tipo_aluno === 'em_triagem';
      if (filter === 'com_laudo')   return s.tipo_aluno === 'com_laudo';
      if (filter === 'externo')     return s.isExternalStudent === true;
      if (filter === 'incompleto')          return s.registrationStatus === 'incomplete' || s.registrationStatus === 'pre_registered' || s.isPreRegistered === true;
      if (filter === 'importado_incompleto') return s.importSource === 'csv' && (s.registrationStatus === 'incomplete' || s.registrationStatus === 'pre_registered' || s.isPreRegistered === true);
      return true;
    });
  }, [students, search, filter]);

  const counts = useMemo(() => ({
    total:      students.length,
    triagem:    students.filter(s => s.tipo_aluno === 'em_triagem').length,
    laudo:      students.filter(s => s.tipo_aluno === 'com_laudo').length,
    externo:    students.filter(s => s.isExternalStudent).length,
    incompleto:           students.filter(s => s.registrationStatus === 'incomplete' || s.registrationStatus === 'pre_registered' || s.isPreRegistered).length,
    importado_incompleto: students.filter(s => s.importSource === 'csv' && (s.registrationStatus === 'incomplete' || s.registrationStatus === 'pre_registered' || s.isPreRegistered)).length,
  }), [students]);

  const usagePct = maxStudents > 0 ? Math.min(100, (students.length / maxStudents) * 100) : 0;

  const filterTabs: { id: FilterType; label: string; count: number; alert?: boolean }[] = [
    { id: 'all',        label: 'Todos',      count: counts.total },
    { id: 'com_laudo',  label: 'Com Laudo',  count: counts.laudo },
    { id: 'em_triagem', label: 'Em Triagem', count: counts.triagem },
    { id: 'externo',    label: 'Externos',   count: counts.externo },
    { id: 'incompleto',           label: 'Incompletos',          count: counts.incompleto,           alert: true },
    { id: 'importado_incompleto', label: 'Importado Incompleto', count: counts.importado_incompleto, alert: true },
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
          <div className="flex gap-2 flex-wrap">
            {user && (
              <button
                onClick={() => setShowCodeSearch(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition"
                style={{
                  background: '#EFF6FF',
                  color: '#1D4ED8',
                  border: '1.5px solid #BFDBFE',
                }}
                title="Buscar aluno de outra escola pelo código único"
              >
                <Globe size={15} /> Buscar por Código
              </button>
            )}
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition"
              style={{
                background: '#F0F9FF',
                color: '#0369A1',
                border: '1.5px solid #BAE6FD',
              }}
              title="Importar lista de alunos por arquivo CSV"
            >
              <Upload size={15} /> Importar CSV
            </button>
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

          {/* Toggle de visualização */}
          <div
            className="flex rounded-xl overflow-hidden shrink-0"
            style={{ border: `1.5px solid ${C.border}`, background: C.surface }}
          >
            {(['grid', 'compact'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="px-3 py-2 transition"
                title={mode === 'grid' ? 'Visualização em grade' : 'Visualização compacta'}
                style={viewMode === mode
                  ? { background: C.petrol, color: '#fff' }
                  : { color: C.textSec }}
              >
                {mode === 'grid' ? <LayoutGrid size={15} /> : <List size={15} />}
              </button>
            ))}
          </div>

          <div
            className="flex rounded-xl overflow-hidden"
            style={{ border: `1.5px solid ${C.border}`, background: C.surface }}
          >
            {filterTabs.map(tab => (
              // Oculta o tab "Incompletos" se não houver nenhum
              (tab.id === 'incompleto' && tab.count === 0) ? null : (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className="px-3 py-2 text-xs font-bold transition flex items-center gap-1"
                style={
                  filter === tab.id
                    ? { background: tab.alert ? C.red : C.petrol, color: '#fff' }
                    : { color: tab.alert && tab.count > 0 ? C.red : C.textSec }
                }
              >
                {tab.alert && tab.count > 0 && filter !== tab.id && (
                  <AlertCircle size={11} />
                )}
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full ml-1"
                    style={
                      filter === tab.id
                        ? { background: 'rgba(255,255,255,0.2)', color: '#fff' }
                        : tab.alert
                          ? { background: C.redLight, color: C.red }
                          : { background: C.border, color: C.textSec }
                    }
                  >
                    {tab.count}
                  </span>
                )}
              </button>
              )
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
        ) : viewMode === 'compact' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filtered.map(s => (
              <StudentCardCompact
                key={s.id}
                student={s}
                onSelect={onSelect}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
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

      {/* Modal de busca por código entre escolas */}
      {showCodeSearch && user && (
        <StudentCodeSearchModal
          user={user}
          onImported={(studentId, protocolCode) => {
            setShowCodeSearch(false);
            onStudentImported?.(studentId, protocolCode);
          }}
          onClose={() => setShowCodeSearch(false)}
        />
      )}

      {/* Modal de importação CSV */}
      {showImportModal && user && (
        <StudentImportModal
          tenantId={user.tenant_id}
          userId={user.id}
          onClose={() => setShowImportModal(false)}
          onImportComplete={(importedCount) => {
            setShowImportModal(false);
            onImportStudents?.(importedCount);
          }}
        />
      )}
    </div>
  );
};

// ── Helpers de status compartilhados ─────────────────────────────────────────
function studentStatus(s: Student) {
  const isTriagem            = s.tipo_aluno === 'em_triagem';
  const isIncomplete         = s.registrationStatus === 'incomplete'
                               || s.registrationStatus === 'pre_registered'
                               || s.isPreRegistered === true;
  const isImportedIncomplete = isIncomplete && s.importSource === 'csv';
  const accentColor = isImportedIncomplete ? '#7F1D1D'
    : isIncomplete ? C.red
    : isTriagem    ? '#F59E0B'
    : C.petrol;
  const avatarBg = isImportedIncomplete
    ? 'linear-gradient(135deg,#7F1D1D,#B91C1C)'
    : isIncomplete
      ? `linear-gradient(135deg,${C.red},#F87171)`
      : `linear-gradient(135deg,${isTriagem ? '#F59E0B' : C.petrol},${isTriagem ? '#FCD34D' : C.dark})`;
  return { isTriagem, isIncomplete, isImportedIncomplete, accentColor, avatarBg };
}

// ── Modo grade (padrão) — versão limpa ───────────────────────────────────────
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
  const { isTriagem, isIncomplete, isImportedIncomplete, accentColor, avatarBg } = studentStatus(s);

  return (
    <div
      onClick={() => onSelect(s)}
      className="rounded-2xl cursor-pointer group transition"
      style={{
        background: C.surface,
        border: `1.5px solid ${isIncomplete ? accentColor + '50' : C.border}`,
        boxShadow: '0 2px 8px rgba(31,78,95,0.05)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = accentColor;
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 24px rgba(31,78,95,0.12)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = isIncomplete ? accentColor + '50' : C.border;
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(31,78,95,0.05)';
      }}
    >
      {/* Faixa de status */}
      <div className="h-1 rounded-t-2xl" style={{
        background: isImportedIncomplete ? 'linear-gradient(90deg,#7F1D1D,#DC2626)'
          : isIncomplete               ? `linear-gradient(90deg,${C.red},#F87171)`
          : isTriagem                  ? 'linear-gradient(90deg,#F59E0B,#FCD34D)'
          : `linear-gradient(90deg,${C.petrol},${C.dark})`,
      }} />

      <div className="p-4">
        {/* Avatar + nome */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center overflow-hidden shrink-0 text-base font-bold text-white"
            style={{ background: s.photoUrl ? undefined : avatarBg }}
          >
            {s.photoUrl
              ? <img src={s.photoUrl} className="w-full h-full object-cover" alt={s.name} />
              : (s.name ?? '?').charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm truncate" style={{ color: C.dark }}>{s.name}</h3>

            {/* Subtítulo: diagnóstico (se houver) ou série */}
            {s.diagnosis?.length ? (
              <p className="text-xs truncate mt-0.5" style={{ color: C.textSec }}>
                {s.diagnosis.join(', ')}
              </p>
            ) : s.grade ? (
              <p className="text-xs truncate mt-0.5" style={{ color: C.textSec }}>{s.grade}{s.shift ? ` · ${s.shift}` : ''}</p>
            ) : null}

            {/* Badges — só os que agregam informação */}
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {isTriagem && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
                  Em Triagem
                </span>
              )}
              {s.isExternalStudent && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: C.goldLight, color: C.gold, border: `1px solid ${C.borderMid}` }}>
                  Externo
                </span>
              )}
              {isImportedIncomplete ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5"
                  style={{ background: '#FEE2E2', color: '#7F1D1D', border: '1px solid #B91C1C40' }}>
                  <Upload size={9} /> CSV incompleto
                </span>
              ) : isIncomplete ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5"
                  style={{ background: C.redLight, color: C.red, border: `1px solid ${C.red}40` }}>
                  <AlertCircle size={9} /> Incompleto
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Linha de info — só se houver conteúdo e não foi exibido no subtítulo */}
        {s.diagnosis?.length > 0 && (s.grade || s.shift || s.regentTeacher) && (
          <p className="text-[11px] mb-3 truncate" style={{ color: C.textSec }}>
            {[s.grade, s.shift, s.regentTeacher].filter(Boolean).join(' · ')}
          </p>
        )}

        {/* Banner incompleto — comprimido a uma linha */}
        {isIncomplete && (
          <div className="mb-3 px-3 py-2 rounded-xl text-xs flex items-center gap-2"
            style={{ background: isImportedIncomplete ? '#FEE2E2' : C.redLight,
                     border: `1px solid ${accentColor}30` }}>
            {isImportedIncomplete
              ? <Upload size={11} style={{ color: '#7F1D1D', flexShrink: 0 }} />
              : <AlertCircle size={11} style={{ color: C.red, flexShrink: 0 }} />}
            <span className="truncate font-medium" style={{ color: accentColor }}>
              {isImportedIncomplete ? 'Importado via CSV — complete o cadastro' : 'Complete o cadastro para liberar documentos'}
            </span>
          </div>
        )}

        {/* Rodapé: ações */}
        <div className="flex items-center justify-between pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
          <div className="flex gap-0.5">
            <button onClick={e => { e.stopPropagation(); onEdit(s); }}
              className="p-1.5 rounded-lg transition"
              style={{ color: C.textSec }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.petrol + '18'; (e.currentTarget as HTMLButtonElement).style.color = C.petrol; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = C.textSec; }}>
              <Edit size={14} />
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete(s.id); }}
              className="p-1.5 rounded-lg transition"
              style={{ color: C.textSec }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'; (e.currentTarget as HTMLButtonElement).style.color = '#EF4444'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = C.textSec; }}>
              <Trash2 size={14} />
            </button>
          </div>
          <span className="text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: C.petrol }}>
            Ver ficha →
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Modo compacto — avatar grande + nome, sem texto extra ────────────────────
function StudentCardCompact({
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
  const { isTriagem, isIncomplete, isImportedIncomplete, accentColor, avatarBg } = studentStatus(s);

  return (
    <div
      onClick={() => onSelect(s)}
      className="relative rounded-2xl cursor-pointer group transition flex flex-col items-center gap-2.5 p-4"
      style={{
        background: C.surface,
        border: `1.5px solid ${isIncomplete ? accentColor + '40' : C.border}`,
        boxShadow: '0 1px 4px rgba(31,78,95,0.04)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = accentColor;
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(31,78,95,0.1)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = isIncomplete ? accentColor + '40' : C.border;
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(31,78,95,0.04)';
      }}
    >
      {/* Avatar com anel de status */}
      <div className="relative">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden text-xl font-bold text-white"
          style={{
            background: s.photoUrl ? undefined : avatarBg,
            outline: isIncomplete ? `2.5px solid ${accentColor}` : isTriagem ? '2.5px solid #F59E0B' : 'none',
            outlineOffset: 2,
          }}
        >
          {s.photoUrl
            ? <img src={s.photoUrl} className="w-full h-full object-cover" alt={s.name} />
            : (s.name ?? '?').charAt(0).toUpperCase()}
        </div>
        {/* Dot indicador de status */}
        {isIncomplete && (
          <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white"
            style={{ background: accentColor }} />
        )}
        {!isIncomplete && isTriagem && (
          <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white bg-amber-400" />
        )}
      </div>

      {/* Nome + subtítulo */}
      <div className="text-center w-full min-w-0">
        <p className="text-xs font-bold leading-snug" style={{ color: C.dark,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {s.name}
        </p>
        {(s.diagnosis?.[0] || s.grade) && (
          <p className="text-[10px] mt-0.5 truncate" style={{ color: C.textSec }}>
            {s.diagnosis?.[0] || s.grade}
          </p>
        )}
      </div>

      {/* Ações — visíveis só no hover */}
      <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={e => { e.stopPropagation(); onEdit(s); }}
          className="p-1 rounded-md transition"
          style={{ background: C.bg, color: C.textSec }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.petrol; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.textSec; }}
        >
          <Edit size={12} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(s.id); }}
          className="p-1 rounded-md transition"
          style={{ background: C.bg, color: C.textSec }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#EF4444'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.textSec; }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
